package exactcompiler

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/core"
	"github.com/microsoft/typescript-go/internal/printer"
	"github.com/microsoft/typescript-go/internal/sourcemap"
	"github.com/microsoft/typescript-go/internal/tspath"
)

// Session owns persistent native compiler state for a stream of requests.
type Session struct {
	mu       sync.Mutex
	projects map[string]*projectState
}

// NewSession creates an isolated compiler session.
func NewSession() *Session {
	return &Session{
		projects: make(map[string]*projectState),
	}
}

// Execute handles one request while retaining reusable native source state.
func (s *Session) Execute(request Request) Response {
	s.mu.Lock()
	defer s.mu.Unlock()
	requestStarted := time.Now()

	response := Response{
		ID:          request.ID,
		Diagnostics: []Diagnostic{},
		Analysis: NewAnalysis(
			nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil,
			nil, nil, nil, nil, PartitionPlan{}, nil,
			newPolicyAnalysis(),
			CapabilityRequirements{},
			nil,
			SemanticGraph{},
		),
	}
	NewResponseVersionFields(&response)
	if request.Kind == "version" {
		return response
	}
	if request.Kind == "reset" {
		s.projects = make(map[string]*projectState)
		return response
	}
	if request.Kind == "synchronize" {
		return s.synchronizeProject(request, response, requestStarted)
	}
	if request.Kind != "compile" && request.Kind != "check" && request.Kind != "analyze" && request.Kind != "diagnose" && request.Kind != "extension" {
		response.Error = fmt.Sprintf("unsupported native compiler request kind %q", request.Kind)
		return response
	}
	if request.Kind == "extension" && (request.Extension == nil || request.Extension.Namespace == "") {
		response.Error = "native extension requests require a namespace"
		return response
	}
	if request.Target == "" {
		request.Target = TargetDefault
	}
	if request.Target != TargetDefault && request.Target != TargetClient && request.Target != TargetServer {
		response.Error = fmt.Sprintf("unsupported eXact compilation target %q", request.Target)
		return response
	}
	if request.Kind == "check" && request.Target != TargetDefault {
		response.Error = "native check requests require the target-neutral analysis projection"
		return response
	}
	if request.ComponentContractProjection == "" {
		request.ComponentContractProjection = ComponentContractProjectionComplete
	}
	if request.ComponentContractProjection != ComponentContractProjectionComplete &&
		request.ComponentContractProjection != ComponentContractProjectionHydrate &&
		request.ComponentContractProjection != ComponentContractProjectionClient &&
		request.ComponentContractProjection != ComponentContractProjectionServerRender {
		response.Error = fmt.Sprintf(
			"unsupported component contract projection %q",
			request.ComponentContractProjection,
		)
		return response
	}
	if request.Diagnostics == "" {
		request.Diagnostics = "syntax"
	}
	if request.Diagnostics != "syntax" && request.Diagnostics != "semantic" {
		response.Error = fmt.Sprintf(
			"unsupported native compiler diagnostics mode %q",
			request.Diagnostics,
		)
		return response
	}
	if request.PackageType != "" &&
		request.PackageType != "application" &&
		request.PackageType != "library" {
		response.Error = fmt.Sprintf(
			"unsupported eXact package type %q",
			request.PackageType,
		)
		return response
	}
	if request.JSXInterop != nil &&
		(request.JSXInterop.AdapterModule == "" ||
			request.JSXInterop.AdapterExport == "") {
		response.Error = "native JSX interop requires adapterModule and adapterExport"
		return response
	}

	fileName, err := normalizeFileName(request.ID, request.Root)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	authoredSource := request.Source
	packageEnhancementSuffix := ""
	if request.PackageEnhancementBoundary > 0 {
		boundary, valid := utf16OffsetToByteOffset(request.Source, request.PackageEnhancementBoundary)
		if !valid {
			response.Error = "package enhancement boundary is not a valid UTF-16 source offset"
			return response
		}
		authoredSource = request.Source[:boundary]
		packageEnhancementSuffix = request.Source[boundary:]
	}
	setupAssignmentExecutions := collectAuthoredSetupAssignmentExecutions(fileName, authoredSource)
	normalization, err := normalizeAuthoredSource(fileName, authoredSource)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	request.Source = normalization.text
	if packageEnhancementSuffix != "" {
		// TypeScript source positions remain UTF-16 code-unit offsets even though Go slices the
		// transport source by UTF-8 byte offset. Preserve that coordinate system after authored
		// normalization so virtual package imports remain distinguishable after non-ASCII text.
		request.PackageEnhancementBoundary = utf16Length(request.Source)
		request.Source += packageEnhancementSuffix
	}
	if request.ConfigFile == "" {
		request.ConfigFile = nearestTypeScriptConfig(fileName)
	}

	projectKey := nativeProjectKey(request, fileName)
	programStarted := time.Now()
	project := s.projects[projectKey]
	if project == nil {
		var configDiagnostics []*ast.Diagnostic
		project, configDiagnostics, err = newProjectState(request, fileName)
		for _, diagnostic := range configDiagnostics {
			response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
		}
		if err != nil {
			response.Error = err.Error()
			return response
		}
		if project == nil {
			return response
		}
		s.projects[projectKey] = project
	}
	countersBefore := project.counters
	generation, err := project.advance(context.Background(), fileName, request.Source)
	response.Timings.ProgramMicroseconds = time.Since(programStarted).Microseconds()
	if err != nil {
		response.Error = err.Error()
		return response
	}
	defer generation.release()
	response.CacheHit = generation.reused
	sourceFile := generation.sourceFile
	if request.Kind == "extension" {
		extensionStarted := time.Now()
		extensionRequest := request
		extensionRequest.Source = authoredSource
		response.Extension, err = executeNativeExtension(
			extensionRequest,
			sourceFile,
			generation.checker,
		)
		response.Timings.AnalysisMicroseconds = time.Since(extensionStarted).Microseconds()
		response.Timings.TotalMicroseconds = time.Since(requestStarted).Microseconds()
		if err != nil {
			response.Error = err.Error()
		}
		return response
	}
	if request.Kind == "diagnose" {
		checkStarted := time.Now()
		for _, projectSource := range generation.program.GetSourceFiles() {
			for _, diagnostic := range projectSource.BindDiagnostics() {
				response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
			}
			for _, diagnostic := range generation.checker.GetDiagnostics(
				context.Background(),
				projectSource,
			) {
				response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
			}
		}
		response.Timings.CheckMicroseconds = time.Since(checkStarted).Microseconds()
		response.Timings.TotalMicroseconds = time.Since(requestStarted).Microseconds()
		return response
	}
	if usesForeignJSXRuntime(sourceFile) {
		if request.Kind == "compile" || request.Kind == "check" {
			response.Code = authoredSource
			if request.Diagnostics == "semantic" {
				validationStarted := time.Now()
				validated, validationErr := validateGeneratedCode(request, fileName, response.Code)
				response.Timings.CheckMicroseconds += time.Since(validationStarted).Microseconds()
				if validationErr != nil {
					response.Error = fmt.Sprintf(
						"could not validate untransformed TypeScript module: %v",
						validationErr,
					)
					return response
				}
				response.Diagnostics = append(response.Diagnostics, validated...)
			}
			if request.Kind == "check" {
				response.Code = ""
			}
		}
		response.Timings.TotalMicroseconds = time.Since(requestStarted).Microseconds()
		return response
	}
	analysisStarted := time.Now()
	directives := collectDirectives(sourceFile.Text())
	imports := collectImports(sourceFile)
	assets := analyzeAssets(sourceFile, generation.checker, request)
	components := collectComponents(sourceFile)
	assignComponentIDs(sourceFile, components, request.ID)
	markExportedComponents(sourceFile, components, generation.checker)
	jsx := collectJSX(sourceFile)
	stateAliases, stateReads, stateWrites := collectStateAnalysis(sourceFile, generation.checker)
	applyNormalizedSetupAssignmentExecutions(stateWrites, setupAssignmentExecutions, normalization)
	preliminaryEnhancements := collectEnhancementImports(
		sourceFile,
		generation.checker,
		nil,
		request.PackageEnhancementBoundary,
	)
	componentBindings, componentBindingWrites, componentBindingDiagnostics := analyzeComponentBindings(
		sourceFile,
		generation.checker,
		preliminaryEnhancements,
	)
	stateWrites = append(stateWrites, componentBindingWrites...)
	formBindings, blockedIntrinsicEnhancements, formBindingDiagnostics := analyzeFormBindings(
		sourceFile,
		generation.checker,
		stateReads,
		preliminaryEnhancements,
	)
	skippedEnhancementAttributes := make(
		map[int]struct{},
		len(componentBindings)+len(formBindings)+len(blockedIntrinsicEnhancements),
	)
	for position := range componentBindings {
		skippedEnhancementAttributes[position] = struct{}{}
	}
	for position := range formBindings {
		skippedEnhancementAttributes[position] = struct{}{}
	}
	for position := range blockedIntrinsicEnhancements {
		skippedEnhancementAttributes[position] = struct{}{}
	}
	enhancementImports := preliminaryEnhancements
	if len(skippedEnhancementAttributes) != 0 {
		enhancementImports = collectEnhancementImports(
			sourceFile,
			generation.checker,
			skippedEnhancementAttributes,
			request.PackageEnhancementBoundary,
		)
	}
	stateWriteDiagnostics := unsupportedStateWriteDiagnostics(
		sourceFile,
		generation.checker,
	)
	classNameDiagnostics := analyzeClassNames(sourceFile)
	renderContractDiagnostics := renderDiagnostics(
		sourceFile,
		generation.checker,
		stateWrites,
	)
	registryDiagnostics := componentRegistryDiagnostics(
		sourceFile,
		generation.checker,
	)
	dynamicComponents := analyzeDynamicComponents(
		sourceFile,
		generation.checker,
		directives,
		components,
	)
	for index := range components {
		component := &components[index]
		for position := range dynamicComponents.uses {
			if position >= component.Start && position < component.Start+component.Length {
				component.DynamicComponents = true
				break
			}
		}
	}
	reactiveBindings := collectReactiveBindings(
		sourceFile,
		generation.checker,
		stateAliases,
		stateReads,
	)
	response.Timings.SourceMicroseconds = time.Since(analysisStarted).Microseconds()
	callableStarted := time.Now()
	callables := collectProjectCallableEffects(
		project,
		sourceFile,
		generation.checker,
		components,
		stateReads,
		stateWrites,
		componentBindings,
	)
	response.Timings.CallableMicroseconds = time.Since(callableStarted).Microseconds()
	policyTaskStarted := time.Now()
	policy := collectPolicyAnalysis(
		sourceFile,
		generation.checker,
		components,
		stateReads,
		request,
	)
	capabilities, capabilityDiagnostics := collectCapabilityRequirements(
		sourceFile,
		generation.checker,
		request,
	)
	tasks := collectTasks(
		sourceFile,
		generation.checker,
		stateReads,
		stateWrites,
		reactiveBindings,
		callables,
	)
	tasks = append(
		tasks,
		collectSetupResourceTasks(
			sourceFile,
			generation.checker,
			tasks,
		)...,
	)
	assignTaskIDs(tasks, components, request.ID)
	tasks = applyTaskPolicies(tasks, policy)
	operations := invokedTaskOperations(tasks)
	components = analyzeComponents(
		sourceFile,
		components,
		callables,
		tasks,
		generation.checker,
	)
	components = applyComponentPolicies(
		sourceFile,
		components,
		tasks,
		&policy,
		stateReads,
		request,
	)
	response.Timings.PolicyTaskMicroseconds = time.Since(
		policyTaskStarted,
	).Microseconds()
	projectLinkStarted := time.Now()
	components = linkProjectComponents(
		project,
		sourceFile,
		generation.checker,
		components,
		callables,
	)
	if request.JSXInterop != nil {
		components = applyJSXInteropBoundaries(components)
	}
	response.Timings.ProjectLinkMicroseconds = time.Since(
		projectLinkStarted,
	).Microseconds()
	exports := collectExportRecords(
		sourceFile,
		generation.checker,
		components,
		callables.summaries,
		policy.graph,
	)
	semanticGraph := collectSemanticGraph(
		sourceFile,
		generation.checker,
		request.ID,
	)
	clientIslands := indexClientElementIslands(
		sourceFile,
		components,
		stateAliases,
		stateReads,
		stateWrites,
		reactiveBindings,
		generation.checker,
	)
	symbols, boundaries := createArtifactRecords(
		sourceFile,
		components,
		callables.summaries,
		exports,
		clientIslands,
	)
	continuations, resumptions := createContinuationContracts(
		components,
		tasks,
		operations,
		stateReads,
		stateWrites,
		policy,
		boundaries,
		clientIslands,
		request.ServerComponents,
	)
	registries := collectComponentRegistries(
		sourceFile,
		generation.checker,
		components,
		request.ID,
	)
	partitionPlan := createPartitionPlan(
		sourceFile,
		request.BuildKey,
		components,
		clientIslands,
		enhancementImports,
		continuations,
		registries,
	)
	partitionBoundaries := partitionBoundaryRecords(partitionPlan)
	boundaries = append(boundaries, partitionBoundaries...)
	attachPartitionBoundaries(continuations, resumptions, partitionBoundaries)
	attachComponentExecutionPlans(components, continuations, tasks, reactiveBindings)
	attachComponentStateSlots(components, stateReads, stateWrites, sourceFile, generation.checker)
	attachFormBindingStateSlots(formBindings, stateReads, components)
	planComponentTargets(sourceFile, components, tasks, resumptions, request.JSXInterop != nil)
	if request.ServerComponents {
		// Partition planning needs setup-task flow, but same-build SSR executes that setup
		// directly and hydrates its published state. Only authored invocation paths retain
		// transport continuations and executors in the emitted contract.
		continuations = retainInvokedContinuations(continuations, operations)
	}
	response.Timings.AnalysisMicroseconds = time.Since(
		analysisStarted,
	).Microseconds()
	response.Analysis = NewAnalysis(
		imports,
		components,
		jsx,
		stateAliases,
		stateReads,
		stateWrites,
		collectValueCallbackBindings(componentBindings, formBindings, components, generation.checker),
		reactiveBindings,
		callables.summaries,
		tasks,
		exports,
		symbols,
		boundaries,
		continuations,
		registries,
		enhancementImports.catalog,
		enhancementImports.activations,
		partitionPlan,
		resumptions,
		policy.graph,
		capabilities,
		assets.dependencies,
		semanticGraph,
	)
	response.Diagnostics = append(response.Diagnostics, validateCoreDirectives(directives)...)
	response.Diagnostics = append(
		response.Diagnostics,
		moduleInitializerDiagnostics(
			callables,
			request.Target,
			sourceFile,
			policy.graph,
		)...,
	)
	response.Diagnostics = append(
		response.Diagnostics,
		taskDiagnostics(sourceFile, generation.checker, tasks, stateWrites)...,
	)
	response.Diagnostics = append(
		response.Diagnostics,
		setupSnapshotCaptureDiagnostics(
			sourceFile,
			generation.checker,
			reactiveBindings,
		)...,
	)
	response.Diagnostics = append(
		response.Diagnostics,
		unsafeDerivedDiagnostics(
			sourceFile,
			generation.checker,
			reactiveBindings,
			components,
		)...,
	)
	response.Diagnostics = append(
		response.Diagnostics,
		islandPlacementDiagnostics(
			sourceFile,
			generation.checker,
			callables,
			components,
			tasks,
			stateAliases,
			stateReads,
			stateWrites,
			reactiveBindings,
			request.Target,
		)...,
	)
	response.Diagnostics = append(response.Diagnostics, formBindingDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, componentBindingDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, classNameDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, renderContractDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, registryDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, dynamicComponents.diagnostics...)
	response.Diagnostics = append(response.Diagnostics, nestedComponentDiagnostics(sourceFile)...)
	response.Diagnostics = append(response.Diagnostics, partitionPlanDiagnostics(partitionPlan)...)
	response.Diagnostics = append(response.Diagnostics, enhancementImports.diagnostics...)
	response.Diagnostics = append(response.Diagnostics, timeDiagnostics(sourceFile, generation.checker, enhancementImports)...)
	response.Diagnostics = append(response.Diagnostics, stateWriteDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, policy.diagnostics...)
	response.Diagnostics = append(response.Diagnostics, capabilityDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, assets.diagnostics...)
	if (request.Kind == "compile" || request.Kind == "check") && request.JSXInterop == nil {
		for _, component := range components {
			for _, message := range component.Diagnostics {
				if !strings.HasPrefix(message, "error: JSX tag ") {
					continue
				}
				response.Diagnostics = append(response.Diagnostics, Diagnostic{
					Severity: "error",
					Code:     "EXACT2201",
					Message:  message,
				})
			}
		}
	}
	response.Diagnostics = append(response.Diagnostics, validateNamespacedDirectives(directives)...)
	for _, diagnostic := range sourceFile.Diagnostics() {
		response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
	}
	// Analysis has no emitted artifact, so its semantic diagnostics belong to
	// the authored source. Compilation validates the lowered artifact below;
	// checking the authored tree here would reject expressions whose compiler-
	// derived types (for example Secret<T> qualifications) are made explicit by
	// native lowering.
	if request.Diagnostics == "semantic" && request.Kind == "analyze" {
		checkStarted := time.Now()
		for _, diagnostic := range sourceFile.BindDiagnostics() {
			response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
		}
		for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), sourceFile) {
			if syntheticTaskStatusDiagnostic(diagnostic, sourceFile, tasks) {
				continue
			}
			response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
		}
		response.Timings.CheckMicroseconds = time.Since(checkStarted).Microseconds()
	}
	if request.Kind == "analyze" {
		remapAuthoredLocations(&response, normalization, len(response.Diagnostics))
		applySetupAssignmentExecutions(
			response.Analysis.StateWrites,
			setupAssignmentExecutions,
		)
		return response
	}
	if hasErrorDiagnostic(response.Diagnostics) {
		return response
	}

	// Lowering reuses authored nodes in synthesized trees whose parent links are
	// temporarily reassigned by native transformation helpers. Restore the
	// checker-owned tree before returning so the retained program and its
	// project analyses remain valid for the next request.
	defer ast.SetParentInChildren(sourceFile.AsNode())
	emitContext := printer.NewEmitContext()
	loweringStarted := time.Now()
	intlPlan := planIntlOperations(sourceFile, generation.checker)
	transformed, componentUpdates := lowerExactJSX(
		sourceFile,
		emitContext.Factory,
		jsxLoweringPlan{
			stateWrites:           stateWrites,
			stateReads:            stateReads,
			reactiveBindings:      reactiveBindings,
			formBindings:          formBindings,
			componentBindings:     componentBindings,
			components:            components,
			tasks:                 tasks,
			operations:            operations,
			continuations:         continuations,
			clientIslands:         clientIslands,
			target:                request.Target,
			contractProjection:    request.ComponentContractProjection,
			serverComponents:      request.ServerComponents,
			instrumentInspection:  request.InstrumentInspection,
			typeChecker:           generation.checker,
			interop:               request.JSXInterop,
			enhancementImports:    enhancementImports,
			partitionPlan:         partitionPlan,
			dynamicComponents:     dynamicComponents.uses,
			componentLocalization: intlPlan.componentLocalization,
		},
	)
	transformed = lowerIntlOperations(
		transformed,
		emitContext.Factory,
		intlPlan,
	)
	// Contract wrapping synthesizes nested component implementations. Retain
	// target-local import uses observed after task lowering so wrapping
	// cannot make an authored render-helper reference invisible to import
	// pruning.
	targetImportUses := artifactIdentifierUses(transformed)
	transformed = lowerComponentContracts(
		transformed,
		emitContext,
		components,
		continuations,
		resumptions,
		boundaries,
		request.Target,
		sourceFile.FileName(),
		request.PreserveComponentHoisting,
		request.JSXInterop != nil,
		request.ComponentContractProjection,
		componentUpdates,
	)
	transformed = lowerEnhancementContextContracts(
		transformed,
		emitContext.Factory,
		callables,
	)
	transformed = lowerSecretQualifications(
		transformed,
		emitContext.Factory,
		policy.qualifications,
		generation.checker,
	)
	response.Timings.LoweringMicroseconds = time.Since(
		loweringStarted,
	).Microseconds()
	transformed = pruneArtifactStatements(
		transformed,
		emitContext.Factory,
		request.Target,
		callables,
		exports,
	)
	transformed = pruneArtifactImports(
		transformed,
		emitContext.Factory,
		request,
		assets,
		targetImportUses,
	)
	if request.ModuleRewrite != nil {
		transformed, err = rewriteModuleReferences(
			sourceFile,
			transformed,
			emitContext.Factory,
			generation.checker,
			request.ModuleRewrite,
		)
		if err != nil {
			response.Error = err.Error()
			return response
		}
	}
	response.RuntimeDependencies = emittedRuntimeDependencies(transformed)

	printStarted := time.Now()
	emitter := printer.NewPrinter(
		printer.PrinterOptions{
			NewLine: core.NewLineKindLF,
			Target:  core.ScriptTargetES2022,
		},
		printer.PrintHandlers{},
		emitContext,
	)
	if request.SourceMap {
		writer := printer.NewTextWriter(
			core.NewLineKindLF.GetNewLineCharacter(),
			0,
		)
		generator := sourcemap.NewGenerator(
			"",
			"",
			tspath.GetDirectoryPath(sourceFile.FileName()),
			tspath.ComparePathsOptions{
				CurrentDirectory:          project.currentDirectory,
				UseCaseSensitiveFileNames: project.fs.UseCaseSensitiveFileNames(),
			},
		)
		emitter.Write(
			transformed.AsNode(),
			sourceFile,
			writer,
			generator,
		)
		response.Code = writer.String()
		response.SourceMap = generator.RawSourceMap()
	} else {
		response.Code = emitter.EmitSourceFile(transformed)
	}
	response.Timings.PrintMicroseconds = time.Since(printStarted).Microseconds()
	validationStarted := time.Now()
	generatedDiagnostics, validationErr := validateGeneratedCode(
		request,
		fileName,
		response.Code,
	)
	response.Timings.CheckMicroseconds += time.Since(
		validationStarted,
	).Microseconds()
	if validationErr != nil {
		response.Error = fmt.Sprintf(
			"could not validate generated native artifact: %v",
			validationErr,
		)
		return response
	}
	sourceDiagnosticCount := len(response.Diagnostics)
	response.Diagnostics = append(response.Diagnostics, generatedDiagnostics...)
	if request.Kind == "check" {
		// Check lowering exists only to validate the compiler-aware TypeScript projection.
		// Never expose its target-neutral executable representation to build hosts.
		response.Code = ""
	}
	remapAuthoredLocations(&response, normalization, sourceDiagnosticCount)
	applySetupAssignmentExecutions(
		response.Analysis.StateWrites,
		setupAssignmentExecutions,
	)
	response.Timings.TotalMicroseconds = time.Since(requestStarted).Microseconds()
	response.Counters = project.counters.since(countersBefore)
	return response
}

// utf16OffsetToByteOffset converts JavaScript string offsets at the process boundary before Go
// slices UTF-8 source. It rejects offsets inside a surrogate pair or beyond the source.
func utf16OffsetToByteOffset(source string, offset int) (int, bool) {
	units := 0
	for byteOffset, value := range source {
		if units == offset {
			return byteOffset, true
		}
		width := 1
		if value > 0xffff {
			width = 2
		}
		if units+width > offset {
			return 0, false
		}
		units += width
	}
	if units == offset {
		return len(source), true
	}
	return 0, false
}

func utf16Length(source string) int {
	units := 0
	for _, value := range source {
		units++
		if value > 0xffff {
			units++
		}
	}
	return units
}

func hasErrorDiagnostic(diagnostics []Diagnostic) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Severity == "error" {
			return true
		}
	}
	return false
}

func syntheticTaskStatusDiagnostic(
	diagnostic *ast.Diagnostic,
	sourceFile *ast.SourceFile,
	tasks []Task,
) bool {
	if diagnostic.Code() != 2339 || diagnostic.Pos() < 0 {
		return false
	}
	statusMembers := map[string]bool{
		"pending": true, "pendingCount": true, "generation": true,
		"result": true, "error": true, "cancel": true,
	}
	text := sourceFile.Text()
	start := diagnostic.Pos()
	end := start + diagnostic.Len()
	if start > len(text) || end > len(text) || !statusMembers[text[start:end]] {
		return false
	}
	cursor := start - 1
	for cursor >= 0 && (text[cursor] == ' ' || text[cursor] == '\t') {
		cursor--
	}
	if cursor < 0 || text[cursor] != '.' {
		return false
	}
	cursor--
	nameEnd := cursor + 1
	for cursor >= 0 &&
		((text[cursor] >= 'a' && text[cursor] <= 'z') ||
			(text[cursor] >= 'A' && text[cursor] <= 'Z') ||
			(text[cursor] >= '0' && text[cursor] <= '9') ||
			text[cursor] == '_' || text[cursor] == '$') {
		cursor--
	}
	name := text[cursor+1 : nameEnd]
	for workStart, task := range indexFunctionTasks(tasks) {
		if !task.Invoked {
			continue
		}
		var matches bool
		walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
			if node.Pos() != workStart {
				return true
			}
			if ast.IsFunctionDeclaration(node) && node.Name() != nil {
				matches = node.Name().Text() == name
			} else if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
				declarationName := node.Parent.AsVariableDeclaration().Name()
				matches = ast.IsIdentifier(declarationName) && declarationName.Text() == name
			}
			return false
		})
		if matches {
			return true
		}
	}
	return false
}

func projectDiagnostic(diagnostic *ast.Diagnostic) Diagnostic {
	fileName := ""
	if diagnostic.File() != nil {
		fileName = diagnostic.File().FileName()
	}
	return Diagnostic{
		Severity: "error",
		Code:     fmt.Sprintf("TS%d", diagnostic.Code()),
		Message:  diagnostic.String(),
		FileName: fileName,
		Start:    diagnostic.Pos(),
		Length:   diagnostic.Len(),
	}
}

func normalizeFileName(id string, root string) (string, error) {
	if strings.TrimSpace(id) == "" {
		return "", fmt.Errorf("native compiler request id must be a filename")
	}
	absolute := tspath.NormalizePath(filepath.ToSlash(id))
	if !tspath.IsRootedDiskPath(absolute) {
		base := root
		if strings.TrimSpace(base) == "" {
			var err error
			base, err = os.Getwd()
			if err != nil {
				return "", fmt.Errorf(
					"resolve native compiler working directory: %w",
					err,
				)
			}
		}
		base = tspath.NormalizePath(filepath.ToSlash(base))
		if !tspath.IsRootedDiskPath(base) {
			var err error
			base, err = filepath.Abs(base)
			if err != nil {
				return "", fmt.Errorf(
					"resolve native compiler root %q: %w",
					root,
					err,
				)
			}
			base = tspath.NormalizePath(filepath.ToSlash(base))
		}
		absolute = tspath.GetNormalizedAbsolutePath(absolute, base)
	}
	return absolute, nil
}

// nearestTypeScriptConfig finds the project owning one real source file.
//
// Virtual sources without an on-disk ancestor remain isolated projects. This
// keeps programmatic snippets deterministic while allowing repository builds
// to share one retained Program and checker per tsconfig.
func nearestTypeScriptConfig(fileName string) string {
	if info, err := os.Stat(filepath.FromSlash(fileName)); err != nil || info.IsDir() {
		return ""
	}
	directory := filepath.Dir(filepath.FromSlash(fileName))
	for {
		candidate := filepath.Join(directory, "tsconfig.json")
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return tspath.NormalizePath(filepath.ToSlash(candidate))
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			return ""
		}
		directory = parent
	}
}
