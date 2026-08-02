package exactcompiler

import (
	"context"
	"encoding/json"
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

const maxExtensionAnalysisBytes = 256 * 1024

// Session owns persistent native compiler state for a stream of requests.
type Session struct {
	mu       sync.Mutex
	registry *Registry
	projects map[string]*projectState
}

// NewSession creates an isolated compiler session.
func NewSession(registry *Registry) *Session {
	return &Session{
		registry: registry,
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
			nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil,
			nil, nil, nil, nil,
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
	if request.Kind != "compile" && request.Kind != "analyze" && request.Kind != "diagnose" {
		response.Error = fmt.Sprintf("unsupported native compiler request kind %q", request.Kind)
		return response
	}
	if request.Target == "" {
		request.Target = TargetDefault
	}
	if request.Target != TargetDefault && request.Target != TargetClient && request.Target != TargetServer {
		response.Error = fmt.Sprintf("unsupported eXact compilation target %q", request.Target)
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
	setupAssignmentExecutions := collectAuthoredSetupAssignmentExecutions(fileName, request.Source)
	normalization, err := normalizeAuthoredSource(fileName, request.Source)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	request.Source = normalization.text
	if request.ConfigFile == "" {
		request.ConfigFile = nearestTypeScriptConfig(fileName)
	}

	projectIdentity := request.ConfigFile
	if projectIdentity == "" {
		projectIdentity = fileName
	}
	projectKey := strings.Join([]string{request.Root, projectIdentity}, "\x00")
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
	generation, err := project.advance(context.Background(), fileName, request.Source)
	response.Timings.ProgramMicroseconds = time.Since(programStarted).Microseconds()
	if err != nil {
		response.Error = err.Error()
		return response
	}
	defer generation.release()
	response.CacheHit = generation.reused
	sourceFile := generation.sourceFile
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
		if request.Kind == "compile" {
			response.Code = authoredSource
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
	stateWriteDiagnostics := unsupportedStateWriteDiagnostics(
		sourceFile,
		generation.checker,
	)
	formBindings, formBindingDiagnostics := analyzeFormBindings(
		sourceFile,
		generation.checker,
		stateReads,
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
	symbols, boundaries := createArtifactRecords(
		sourceFile,
		components,
		callables.summaries,
		exports,
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
	continuations, resumptions := createContinuationContracts(
		components,
		tasks,
		operations,
		stateReads,
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
	enhancementImports := collectEnhancementImports(sourceFile, generation.checker)
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
		reactiveBindings,
		callables.summaries,
		tasks,
		exports,
		symbols,
		boundaries,
		continuations,
		registries,
		enhancementImports.catalog,
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
	response.Diagnostics = append(response.Diagnostics, classNameDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, renderContractDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, registryDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, enhancementImports.diagnostics...)
	response.Diagnostics = append(response.Diagnostics, stateWriteDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, policy.diagnostics...)
	response.Diagnostics = append(response.Diagnostics, capabilityDiagnostics...)
	response.Diagnostics = append(response.Diagnostics, assets.diagnostics...)
	if request.Kind == "compile" && request.JSXInterop == nil {
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
	response.Diagnostics = append(
		response.Diagnostics,
		validateExtensionDirectives(
			directives,
			s.registry,
			request.Extensions,
			request.CompatibilityExtensions,
		)...,
	)
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
	if len(response.Diagnostics) != 0 {
		return response
	}

	// Lowering reuses authored nodes in synthesized trees whose parent links are
	// temporarily reassigned by native transformation helpers. Restore the
	// checker-owned tree before returning so the retained program and its
	// project analyses remain valid for the next request.
	defer ast.SetParentInChildren(sourceFile.AsNode())
	emitContext := printer.NewEmitContext()
	loweringStarted := time.Now()
	transformed := lowerExactJSX(
		sourceFile,
		emitContext.Factory,
		stateWrites,
		stateAliases,
		stateReads,
		reactiveBindings,
		formBindings,
		components,
		tasks,
		operations,
		continuations,
		clientIslands,
		request.Target,
		request.ServerComponents,
		request.InstrumentInspection,
		generation.checker,
		request.JSXInterop,
		enhancementImports,
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
	)
	transformed = lowerEnhancementContextContracts(
		transformed,
		emitContext.Factory,
		components,
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
	extensionStarted := time.Now()
	for _, extension := range s.registry.all() {
		config, enabled := request.Extensions[extension.Namespace()]
		if !enabled {
			continue
		}
		contribution, transformErr := extension.Transform(Module{
			ID:               fileName,
			Target:           request.Target,
			SourceFile:       transformed,
			Program:          generation.program,
			Checker:          generation.checker,
			Factory:          emitContext.Factory,
			Directives:       directives,
			Imports:          imports,
			Components:       components,
			JSX:              jsx,
			StateAliases:     stateAliases,
			StateReads:       stateReads,
			StateWrites:      stateWrites,
			ReactiveBindings: reactiveBindings,
			Callables:        callables.summaries,
			Tasks:            tasks,
			Symbols:          symbols,
			Boundaries:       boundaries,
			Continuations:    continuations,
			Resumptions:      resumptions,
			Policy:           policy.graph,
			Config:           config,
		})
		if transformErr != nil {
			response.Error = fmt.Sprintf(
				"native compiler extension %q failed: %v",
				extension.Namespace(),
				transformErr,
			)
			return response
		}
		if contribution.SourceFile != nil {
			transformed = contribution.SourceFile
		}
		response.Diagnostics = append(response.Diagnostics, contribution.Diagnostics...)
		if len(contribution.AnalysisData) != 0 {
			if len(contribution.AnalysisData) > maxExtensionAnalysisBytes {
				response.Error = fmt.Sprintf(
					"native compiler extension %q analysis data exceeds %d bytes",
					extension.Namespace(),
					maxExtensionAnalysisBytes,
				)
				return response
			}
			if !json.Valid(contribution.AnalysisData) {
				response.Error = fmt.Sprintf(
					"native compiler extension %q returned invalid JSON analysis data",
					extension.Namespace(),
				)
				return response
			}
			if response.AnalysisData == nil {
				response.AnalysisData = make(map[string]json.RawMessage)
			}
			response.AnalysisData[extension.Namespace()] = contribution.AnalysisData
		}
	}
	response.Timings.ExtensionMicroseconds = time.Since(extensionStarted).Microseconds()
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
	remapAuthoredLocations(&response, normalization, sourceDiagnosticCount)
	applySetupAssignmentExecutions(
		response.Analysis.StateWrites,
		setupAssignmentExecutions,
	)
	response.Timings.TotalMicroseconds = time.Since(requestStarted).Microseconds()
	return response
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
