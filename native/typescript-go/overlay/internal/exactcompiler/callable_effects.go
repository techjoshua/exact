package exactcompiler

import (
	"fmt"
	"maps"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
)

var exactContextToken = regexp.MustCompile(
	`^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$`,
)
var neutralReceiverType = regexp.MustCompile(
	`\b(?:AbortController|AbortSignal|Array|Date|Headers|Map|Promise|RegExp|Request|Response|Set|String|URL|URLSearchParams|WeakMap|WeakSet)\b|\[\](?:\s|$)|^(?:readonly\s+)?\[|^(?:bigint|boolean|number|string|symbol)$`,
)
var browserReceiverType = regexp.MustCompile(
	`\b(?:Animation|CSSStyleDeclaration|Document|DOMTokenList|Element|Event|EventTarget|HTMLElement|Node|PointerEvent|Range|Selection|ShadowRoot|Storage|Text|Window)\b`,
)

var universalCallRoots = map[string]struct{}{
	"Array": {}, "atob": {}, "BigInt": {}, "Boolean": {}, "btoa": {}, "Date": {}, "Error": {},
	"Intl": {}, "JSON": {}, "Map": {}, "Math": {}, "Number": {}, "Object": {},
	"Promise": {}, "Reflect": {}, "RegExp": {}, "Set": {}, "String": {},
	"Symbol": {}, "URL": {}, "URLSearchParams": {}, "WeakMap": {}, "WeakSet": {},
	"clearInterval": {}, "clearTimeout": {}, "console": {}, "fetch": {},
	"decodeURI": {}, "decodeURIComponent": {}, "encodeURI": {}, "encodeURIComponent": {},
	"isFinite": {}, "isNaN": {}, "parseFloat": {}, "parseInt": {}, "queueMicrotask": {}, "setInterval": {},
	"setTimeout": {}, "structuredClone": {},
}

type callableFacts struct {
	staged sourceCallableExtractionFact

	directExposurePublished map[*ast.Node]bool         // immutable original source effect publication events
	pendingMembers          *sourcePendingMemberLedger // source-only exposure/relative dependencies, no live publication rights
	writerInputs            *sourceWriterInputGraph    // declaration-owned exposure recipes, never acquired query results

	callOutcomes []sourceCallOutcome

	componentInputDemands   []sourceComponentInputDemand
	componentCallableInputs []sourceComponentCallableInput
	initializerDraft        *moduleInitializerDraft
	initializerPlan         *closedOwnGetterPlan
	initializerDeclaration  *ast.Node
	ownedLegacyPending      []*sourceLegacyPublication
	ownedGetResults         []*ownedGetPopulation
	ownedGetPending         []*ownedGetFactObligation

	// The producing analysis mode is immutable, independent of later routing.
	descriptorMode      [32]byte
	fieldCalls          []sourceFieldCall
	mapInputs           []*sourceMapInputContribution
	fieldEdgeOperations map[string]*ast.Node

	// normalInputs exists only during this fact's normal demand construction.
	normalInputs             *sourceValueInputs
	thenReferences           []sourceThenReference
	nativeCalls              []*sourceNativeInvocation
	normalCalls              []*sourceInvocationResult
	thenIncomplete           bool
	ownedObligations         []sourceOwnedObligations
	progressReceiver         bool
	node                     *ast.Node
	sourceFile               *ast.SourceFile
	summary                  CallableSummary
	directReads              []StateEffect
	directWrites             []StateEffect
	directContext            []ContextEffect
	targets                  []int
	callSymbols              map[string]ast.SymbolId
	callExpressions          map[string]*ast.Node
	contextReferences        map[string]*ast.Node
	artifactConstraint       uint8
	directOwnedScalarBlocked bool
	ownedScalarCalls         map[string]bool
}

type callableAnalysis struct {
	sourceContext *callableSourceContext // Static source preparation, never graph observation authority.

	owner     *executableBodyOwner
	pending   []sourceStagedPending
	summaries []CallableSummary
	byNode    map[*ast.Node]CallableSummary
	bySymbol  map[ast.SymbolId]CallableSummary
	facts     []callableFacts
}

// projectCallableCache contains checker-bound facts for one exact program/checker generation.
const advisoryAnalysisSemantics = 9

// Analysis semantics is separate from diagnostic threshold policy.
type projectCallableCache struct {
	requested    *ast.SourceFile // Public merged demand scope; no graph execution authority.
	semantics    int
	program      *compiler.Program
	owner        *executableBodyOwner
	assetRules   []AssetRule
	bySource     map[*ast.SourceFile]callableAnalysis
	fingerprints map[*ast.SourceFile]string
	owned        map[*ast.SourceFile]bool
	analyses     []callableAnalysis
	merged       callableAnalysis
}

// ownsGeneration prevents source-value queries from borrowing a checker from a replaced program.
// Source identity and unchanged authored text alone do not preserve checker-owned facts.
func (cache *projectCallableCache) ownsGeneration(program *compiler.Program, typeChecker *checker.Checker) bool {
	return cache != nil && cache.semantics == advisoryAnalysisSemantics && cache.program == program && cache.owner != nil && cache.owner.checker == typeChecker && cache.owner.values != nil
}

// collectCallableEffects builds a source-order-independent local call graph and
// resolves environment, state, and context effects to a monotone fixed point.
// TypeScript symbols, rather than names, own edges so lexical shadowing cannot
// connect unrelated callables.
func collectCallableEffects(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components []Component,
	stateReads []StateRead,
	stateWrites []StateWrite,
	componentBindings map[int]componentBinding,
	assets assetAnalysis,
	owner *executableBodyOwner,
) callableAnalysis {
	prepared := prepareCallableSourceFacts(sourceFile, typeChecker, components, owner)
	facts := prepared.facts
	componentByStart := prepared.componentByStart
	symbolTargets, syntacticTargets, nodeTargets := prepared.symbolTargets, prepared.syntacticTargets, prepared.nodeTargets
	importBindings, contextBindings := prepared.importBindings, prepared.contextBindings

	// Work preparation only indexes these genuine facts and queues extraction.
	// Install its scope registrar before any original source publisher can run.
	work := registerCallableEffectWork(facts)
	restoreWriterInputs := registerWriterInputFacts(owner, facts, &work)
	defer restoreWriterInputs()
	installBuildingInitializers(owner, sourceFile, facts)
	for {
		task, available := work.nextExtraction()
		if !available {
			break
		}
		if task.operation.index != 0 {
			work.extractOperation(facts, task, owner)
			continue
		}
		index := task.callable
		if callableIsInteractiveHandler(facts[index].node) {
			facts[index].summary.DirectEffectSources = append(
				facts[index].summary.DirectEffectSources,
				environmentSource("browser", "interactive JSX handler", facts[index].summary.Name),
			)
		}
		collectDirectCallableEffects(
			&facts[index],
			index,
			facts,
			symbolTargets,
			syntacticTargets,
			nodeTargets,
			sourceFile,
			typeChecker,
			stateReads,
			stateWrites,
			importBindings,
			contextBindings,
			assets,
			owner,
			&work,
		)
		work.finishExtraction(facts, index)
	}
	for index := range facts {
		if _, component := componentByStart[facts[index].node.Pos()]; component {
			facts[index].componentCallableInputs = collectComponentCallableInputs(facts[index].node, typeChecker, owner)
		}
	}
	sealMapInputs(facts, nodeTargets)
	for index := range facts {
		facts[index].directOwnedScalarBlocked = facts[index].directOwnedScalarBlocked || !directScalarHelper(&facts[index], typeChecker)
	}
	facts = appendComponentBindingCallableFacts(facts, sourceFile, componentBindings)
	if pending := resolveCallableEffectsWithWork(facts, owner, &work); len(pending) != 0 {
		return callableAnalysis{facts: facts, pending: pending}
	}
	applyCallableArtifactConstraints(facts)

	summaries := make([]CallableSummary, len(facts))
	byNode := make(map[*ast.Node]CallableSummary, len(facts))
	for index := range facts {
		fact := &facts[index]
		fact.summary.DirectEffect = environmentEffectFor(fact.summary.DirectEffectSources)
		fact.summary.Effect = environmentEffectFor(fact.summary.EffectSources)
		fact.summary.ArtifactTargets = artifactTargetsFor(
			fact.summary.Effect,
			fact.summary.EffectSources,
			fact.artifactConstraint,
		)
		published := fact.summary
		published.DirectEffectSources = displayEnvironmentSources(published.DirectEffectSources)
		published.EffectSources = displayEnvironmentSources(published.EffectSources)
		summaries[index] = published
		byNode[fact.node] = published
	}
	bySymbol := make(map[ast.SymbolId]CallableSummary, len(symbolTargets))
	for symbol, index := range symbolTargets {
		bySymbol[symbol] = summaries[index]
	}
	return callableAnalysis{
		summaries: summaries,
		byNode:    byNode,
		bySymbol:  bySymbol,
		facts:     facts,
	}
}

func collectSyntacticCallableTargets(facts []callableFacts) map[string]int {
	result := make(map[string]int)
	for index := range facts {
		node := facts[index].node
		memberName := ""
		container := node.Parent
		if ast.IsMethodDeclaration(node) {
			memberName = callableNameText(node.Name())
		} else if container != nil && ast.IsPropertyAssignment(container) {
			memberName = callableNameText(container.Name())
			container = container.Parent
		}
		if memberName == "" || container == nil ||
			!ast.IsObjectLiteralExpression(container) ||
			container.Parent == nil ||
			!ast.IsVariableDeclaration(container.Parent) {
			continue
		}
		declaration := container.Parent.AsVariableDeclaration()
		if declaration.Initializer != container ||
			declaration.Name() == nil ||
			!ast.IsIdentifier(declaration.Name()) {
			continue
		}
		result[declaration.Name().Text()+"."+memberName] = index
	}
	return result
}

func bindSyntacticCallableAliases(
	sourceFile *ast.SourceFile,
	targets map[string]int,
	symbolTargets map[ast.SymbolId]int,
	typeChecker *checker.Checker,
) {
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		declaration := node.AsVariableDeclaration()
		if declaration.Name() == nil ||
			!ast.IsIdentifier(declaration.Name()) ||
			declaration.Initializer == nil {
			return true
		}
		target, exists := targets[strings.TrimSpace(
			sourceText(sourceFile, declaration.Initializer),
		)]
		if !exists {
			return true
		}
		if symbol := typeChecker.GetSymbolAtLocation(declaration.Name()); symbol != nil {
			symbolTargets[ast.GetSymbolId(symbol)] = target
		}
		return true
	})
}

func callableIsInteractiveHandler(node *ast.Node) bool {
	current := node.Parent
	if current != nil && ast.IsJsxExpression(current) {
		current = current.Parent
	}
	if current == nil || !ast.IsJsxAttribute(current) {
		return false
	}
	name := current.AsJsxAttribute().Name()
	return name != nil && !ast.IsJsxNamespacedName(name) &&
		interactiveJSXAttribute(name.Text())
}

// collectProjectCallableEffects links callable graphs from every non-declaration
// source retained by the TypeScript-Go program. The response remains scoped to
// the requested module, while transitive effects cross local import cycles in
// one native fixed point.
func collectProjectCallableEffects(
	project *projectState,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components []Component,
	stateReads []StateRead,
	stateWrites []StateWrite,
	componentBindings map[int]componentBinding,
	assets assetAnalysis,
	assetRules []AssetRule,
) callableAnalysis {
	cache, changed := prepareProjectCallableContexts(project, sourceFile, typeChecker, components, stateReads, stateWrites, componentBindings, assets, assetRules)
	if changed || !project.stagedReplacement && cache.requested != sourceFile {
		rebuildProjectCallableCache(project.program, cache, cache.owner, sourceFile)
	}
	result := projectCallableAnalysisForSource(sourceFile, cache.merged)
	result.owner = cache.owner
	return result
}

// The merged graph is immutable until invalidation. A request owns only its summary
// slice, while node/symbol indexes and resolved facts retain project graph ownership.
func projectCallableAnalysisForSource(source *ast.SourceFile, merged callableAnalysis) callableAnalysis {
	result := merged
	result.summaries = []CallableSummary{}
	if len(result.pending) != 0 {
		return result
	}
	for _, fact := range merged.facts {
		if fact.sourceFile == source && fact.staged.ready {
			result.summaries = append(result.summaries, fact.summary)
		}
	}
	sort.Slice(result.summaries, func(left, right int) bool {
		return result.summaries[left].ID < result.summaries[right].ID
	})
	return result
}

func ensureProjectCallableSources(
	project *projectState,
	typeChecker *checker.Checker,
	cache *projectCallableCache,
	assetRules []AssetRule,
) bool {
	changed := false
	for _, sourceFile := range project.program.GetSourceFiles() {
		if sourceFile.IsDeclarationFile ||
			strings.Contains(strings.ReplaceAll(sourceFile.FileName(), `\`, `/`), "/node_modules/") {
			continue
		}
		prior, exists := cache.bySource[sourceFile]
		if exists && sameSourceJSXMode(prior.sourceContext, project.activeGeneration, sourceFile) {
			continue
		}
		project.counters.CallableSourceAnalyses++
		var analysis callableAnalysis
		if context := prior.sourceContext; exists && context != nil {
			// Keep the authoritative immutable source inputs while recollecting this
			// changed semantic mode into a fresh project graph. No old C is edited.
			analysis = prepareProjectCallableSource(sourceFile, typeChecker, context.components, context.reads, context.writes, context.bindings, context.assets, cache.owner)
		} else {
			analysis = analyzeProjectCallableSource(sourceFile, typeChecker, assetRules, cache.owner)
		}
		cache.bySource[sourceFile] = analysis
		cache.fingerprints[sourceFile] = callableAnalysisFingerprint(analysis)
		changed = true
	}
	return changed
}

func analyzeProjectCallableSource(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	assetRules []AssetRule,
	owner *executableBodyOwner,
) callableAnalysis {
	components := collectComponents(sourceFile)
	_, reads, writes := collectStateAnalysis(sourceFile, typeChecker)
	bindings, bindingWrites, _ := analyzeComponentBindings(
		sourceFile,
		typeChecker,
		collectEnhancementImports(sourceFile, typeChecker, nil, 0),
	)
	writes = append(writes, bindingWrites...)
	return prepareProjectCallableSource(
		sourceFile,
		typeChecker,
		components,
		reads,
		writes,
		bindings,
		analyzeAssets(sourceFile, typeChecker, Request{AssetRules: assetRules}),
		owner,
	)
}

func callableAnalysisFingerprint(analysis callableAnalysis) string {
	var result strings.Builder
	for _, pending := range analysis.pending {
		result.WriteString(fmt.Sprintf("|staged-pending:%p:%p:%p:%d:%p:%p:%p:%p:%p", pending.consumer, pending.producer, pending.operation, pending.reason, pending.cut.use, pending.cut.reading, pending.cut.initializing, pending.cut.returning, pending.cut.invoking))
	}
	for _, fact := range analysis.facts {
		if fact.initializerDraft != nil {
			result.WriteString(fact.initializerDraft.signature)
		}
		originalMutationBodyFingerprint(fact.staged.mutationBody, &result)
		result.WriteString(fact.summary.ID)
		result.WriteByte('|')
		result.WriteString(fact.summary.Name)
		result.WriteByte('|')
		result.WriteString(fact.summary.Kind)
		result.WriteString(fmt.Sprintf("|owned-scalar-blocked:%t", fact.directOwnedScalarBlocked))
		result.WriteString(fmt.Sprintf("|descriptor-mode:%x", fact.descriptorMode))
		for _, c := range fact.mapInputs {
			result.WriteString(fmt.Sprintf("|map-input:%s:%x:%d:%s:%t:%d:%d", c.mode, c.sourceDigest, c.domain, c.reason, c.futureReadonly, len(c.items), len(c.roles)))
		}
		for _, owned := range fact.ownedObligations {
			result.WriteString(sourceOwnedObligationKey(owned))
		}
		if fact.progressReceiver {
			result.WriteString("|progress")
		}
		result.WriteByte('|')
		result.WriteString(strings.Join(fact.summary.ExportNames, ","))
		result.WriteByte('\n')
		for _, input := range fact.componentCallableInputs {
			result.WriteString(fmt.Sprintf("|component-call-input:%p:%p:%p:%s", input.declaration, input.slot, input.operation, input.key))
		}
		// Sealed source atoms include independent requirements/dispositions, not
		// merely equal environment donors. Graph IDs/cursors remain excluded.
		for _, occurrence := range fact.staged.constructedOccurrences {
			result.WriteString(fmt.Sprintf("|constructed-occurrence:%#v", occurrence))
		}
		for _, call := range fact.staged.calls {
			if call.sourceInputs != nil {
				result.WriteString(fmt.Sprintf("|source-call-inputs:%#v:%#v", descriptorFingerprintInvocation(call.sourceInputs.invocation, &result), descriptorFingerprintBoundInputs(call.sourceInputs.bindings, &result)))
			}
		}
		for _, recipe := range fact.staged.operationRecipes {
			for _, alternative := range recipe.delta.exposures {
				if value := alternative.endpoint.constructionCallable; value != nil {
					result.WriteString(constructionCallableFingerprint(value))
				}
				if value := alternative.endpoint.moduleConstruction; value != nil {
					result.WriteString(fmt.Sprintf("|module-construction-data:%t", value.pending))
					for _, field := range value.fields {
						result.WriteString(fmt.Sprintf("|construction-field-data:%d:%t:%#v", field.ordinal, field.pending, field.alternatives))
					}
				}
			}
			descriptorTargetFingerprint(recipe.descriptorTarget, &result)
			if recipe.descriptorSource != nil {
				result.WriteString(fmt.Sprintf("|descriptor-source:%#v", *recipe.descriptorSource))
			}
			if recipe.nativeGet != nil && recipe.nativeGet.descriptorRead != nil {
				result.WriteString(fmt.Sprintf("|descriptor-retrieval:%#v", *recipe.nativeGet.descriptorRead))
			}
			if recipe.nativeGet != nil && len(recipe.nativeGet.observerInputs) != 0 {
				result.WriteString(fmt.Sprintf("|native-observer-inputs:%#v", recipe.nativeGet.observerInputs))
			}
			if source := recipe.declarationCall; source != nil {
				result.WriteString(fmt.Sprintf("|declaration-call:%#v:%p:%p:%p", descriptorFingerprintInvocation(source.invocation, &result), source.inputs, source.sourceInputs, recipe.declarationCallGeneration))
				for _, read := range source.ambientReads {
					if read.reference == nil {
						result.WriteString("|ambient-argument-read:invalid")
						continue
					}
					result.WriteString(fmt.Sprintf("|ambient-argument-read:%p:%p:%p:%d:%#v:%p:%p:%p:%p:%p:%p", read.call, read.argument, read.owner, read.ordinal, read.cut, read.reference.declaration, read.reference.symbol, read.reference.source, read.reference.program, read.reference.checker, read.reference.config))
				}

			}
			if source := recipe.constructionEffects; source != nil {
				result.WriteString(fmt.Sprintf("|construction-effects:%#v", *source))
			}
			if source := recipe.assignment; source != nil {
				result.WriteString(fmt.Sprintf("|assignment:%#v", *source))
			}
			if source := recipe.hasInstance; source != nil {
				result.WriteString(fmt.Sprintf("|has-instance:%#v", *source))
			}
			if source := recipe.nativeGet; source != nil && source.effectsSource != nil {
				description := *source.effectsSource
				description.arrayIssuer = nil // Graph receipt is not cached semantic content.
				result.WriteString(fmt.Sprintf("|native-effects-source:%#v", &description))
			}
			if source := recipe.nativeGet; source != nil && source.arrayPush != nil {
				result.WriteString(fmt.Sprintf("|native-array-push:%#v", *source.arrayPush))
			}
			fieldMutationDataFingerprint(recipe.mutationData, &result)
			installedMutationRHSFingerprint(recipe.installedMutationRHS, &result)
			for _, residual := range recipe.delta.residuals {
				relativeFieldMutationFingerprint(residual.mutation, &result)
			}
			if source := recipe.memberSource; source != nil {
				originalGetMutationInterestFingerprint(source.originalGetMutationInterest, &result)
				originalGetMutationSourceFingerprint(source.originalGetMutation, &result)
				if source.globalWrite != nil {
					result.WriteString(fmt.Sprintf("|global-write:%#v", source.globalWrite))
				}
				if source.targetSource != nil {
					description := *source.targetSource
					description.preparation = nil // Fingerprint detached content, not the wrapper address.
					result.WriteString(fmt.Sprintf("|reflective-target-source:%#v", &description))
					if p := source.targetSource.preparation; p != nil {
						result.WriteString(fmt.Sprintf("|reflective-target-preparation:%#v", *p))
					}
				}
				if source.nativeWriter != nil {
					result.WriteString(fmt.Sprintf("|native-writer-capability:%#v", source.nativeWriter))
				}
				if source.hasFreshTarget != nil {
					result.WriteString(fmt.Sprintf("|has-fresh-target:%#v", source.hasFreshTarget))
				}
				if source.protocolSource != nil {
					result.WriteString(fmt.Sprintf("|member-protocol-source:%#v:%p:%#v:%t:%t", source.protocolSource.required, source.protocolSource.external, source.protocolSource.get, source.protocolSource.setEffects, source.protocolSource.selfRead))
					result.WriteString(fmt.Sprintf("|evaluation:%#v", source.protocolSource.evaluation))
					result.WriteString(fmt.Sprintf("|native-argument:%#v", source.protocolSource.nativeArgument))
				}
				if source.call != nil {
					result.WriteString(fmt.Sprintf("|member-call:%#v:%#v:%t:%#v:%#v:%#v", descriptorFingerprintAlternatives(source.call.values, &result), source.call.mapped, source.call.complete, source.call.standard, source.call.storage, source.call.sourceRequest))
				}
				if source.getPreparation != nil {
					result.WriteString(fmt.Sprintf("|get-preparation:%t:%#v:%#v:%#v", source.getPreparation.plain, source.getPreparation.native, source.getPreparation.readings, source.getPreparation.targets))
					result.WriteString(fmt.Sprintf("|get-preparation-data:%#v", source.getPreparation.data))
				}
				reflectiveContributionFingerprint(source.reflectiveContribution, &result)
				descriptorStrongFingerprint(source.descriptorStrong, &result)
				if source.getEffects != nil {
					result.WriteString(fmt.Sprintf("|member-get-effects:%t:%#v", source.getEffects.accounted, source.getEffects.preparation))
					if d := source.getEffects.descriptor; d != nil {
						description := *d
						view := descriptorFingerprintEndpoint(sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, descriptorView: &description.view}, &result)
						description.view = sourceNativeDescriptorView{}
						result.WriteString(fmt.Sprintf("|descriptor-record-get:%#v:%#v", description, view))
					}
				}
				candidate := source.candidate
				candidate.target = descriptorFingerprintEndpoint(candidate.target, &result)
				candidate.key = descriptorFingerprintEndpoint(candidate.key, &result)
				candidate.value = descriptorFingerprintEndpoint(candidate.value, &result)
				result.WriteString(fmt.Sprintf("|member-candidate:%#v:%#v:%#v:%t", source.request, candidate, descriptorFingerprintAlternatives(source.values, &result), source.writeEffects))
			}
			if source := recipe.nativeGet; source != nil && len(source.memberSources) != 0 {
				result.WriteString(fmt.Sprintf("|native-member-sources:%#v:%#v", source.memberSources, source.callAlternatives))
				result.WriteString(fmt.Sprintf("|member-get-contributions:%#v", source.getContributions))
			}
			if source := recipe.memberSource; source != nil && source.coverage != nil {
				result.WriteString(fmt.Sprintf("|member-source-set:%#v:%p:%#v:%#v:%t", source.coverage.request, source.coverage.origin, source.coverage.cut, source.coverage.required, source.coverage.extracted))
			}
			if source := recipe.moduleArgument; source != nil {
				snapshot := *source
				snapshot.order = nil
				result.WriteString(fmt.Sprintf("|module-argument:%#v", snapshot))
			}
			if source := recipe.callResult; source != nil {
				if source.nativeDescriptor != nil {
					result.WriteString(fmt.Sprintf("|descriptor-result-source:%#v", *source.nativeDescriptor))
				}
				getResult := source.getResult
				if getResult != nil && getResult.frameworkResume != nil {
					result.WriteString(fmt.Sprintf("|framework-get-resume:%#v", *getResult.frameworkResume))
					copy := *getResult
					copy.frameworkResume = nil
					getResult = &copy
				}
				result.WriteString(fmt.Sprintf("|call-result:%#v:%p:%t:%#v:%#v:%#v:%#v:%#v", source.request, source.declaration, source.nativeCall, source.constructedRoot, source.readings, source.readCuts, source.inputReadings, getResult))
				result.WriteString(fmt.Sprintf("|binding-data:%p|preparation-data:%#v", source.binding, source.preparationData))
				if construction := source.moduleConstruction; construction != nil {
					result.WriteString(fmt.Sprintf("|module-construction:%#v:%p:%p:%p:%t", construction.request, construction.binding, construction.initializer, construction.module, construction.unsupported))
					result.WriteString(fmt.Sprintf("|local-construction:%p:%#v:%#v", construction.localOwner, construction.creationEffects, construction.scalar))
					result.WriteString(constructionCallableSourceFingerprint(construction.scalarCallable))
					for _, field := range construction.fields {
						result.WriteString(fmt.Sprintf("|construction-field:%p:%p:%s:%d:%#v", field.property, field.operand, field.name, field.ordinal, field.required))
						result.WriteString(constructionCallableSourceFingerprint(field.callable))
						if field.literal != nil {
							result.WriteString(fmt.Sprintf("|construction-literal:%#v", *field.literal))
						}
					}
				}
				if source.freezeReturn != nil {
					result.WriteString(fmt.Sprintf("|freeze-return:%#v", *source.freezeReturn))
				}
				if source.operand != nil {
					result.WriteString(fmt.Sprintf("|result-operand:%#v", descriptorFingerprintEndpoint(*source.operand, &result)))
				}
			}
			if recipe.writer != nil {
				result.WriteString(fmt.Sprintf("|writer-source:%#v:%#v:%p:%#v", recipe.writer.request, recipe.writer.parent, recipe.writer.generation, recipe.writer.reads))
			}
			if recipe.writer != nil {
				result.WriteString(fmt.Sprintf("|writer-callable:%t", recipe.writer.callable))
				for _, projection := range recipe.writer.projections {
					if projection != nil {
						result.WriteString(fmt.Sprintf("|writer-projection:%#v:%#v:%t", descriptorFingerprintDelta(projection.delta, &result), projection.pending, projection.resultContext))
					} else {
						result.WriteString("|writer-projection:pending")
					}
				}
			}
			if recipe.mapEntry != nil {
				result.WriteString(fmt.Sprintf("|map-entry:%#v:%#v", recipe.mapEntry.entry, recipe.mapEntry.read))
				if recipe.mapEntry.read != nil {
					result.WriteString(fmt.Sprintf("|map-entry-bound:%#v", recipe.mapEntry.read.bound))
				}
			}
			if recipe.entryLaw != nil {
				result.WriteString(fmt.Sprintf("|entry-law:%#v", *recipe.entryLaw))
			}
			if recipe.mapProtocol != nil {
				result.WriteString(fmt.Sprintf("|map-protocol:%#v", *recipe.mapProtocol))
			}
			result.WriteString(fmt.Sprintf("|writer-required:%#v", recipe.writerRequired))
			if recipe.constructed != nil {
				result.WriteString(fmt.Sprintf("|constructed-member:%#v:%#v:%#v", *recipe.constructed, recipe.constructedGroup, recipe.constructedInputs))
				result.WriteString(fmt.Sprintf("|constructed-disposition:%#v", recipe.constructedDisposition))
			}
			result.WriteString(fmt.Sprintf("|operation-recipe:%#v:%p:%p:%#v", recipe.key, recipe.getter, recipe.returning, descriptorFingerprintDelta(recipe.delta, &result)))
			for _, link := range recipe.fieldMutationLinks {
				result.WriteString(fmt.Sprintf("|field-mutation-link:%#v:%#v:%#v:%#v:%d:%p", link.candidate, link.field, link.child, link.origin, link.kind, link.generation))
				if link.nativeComponent != 0 {
					result.WriteString(fmt.Sprintf("|native-mutation-component:%d", link.nativeComponent))
				}
				if link.nativeField != nil {
					result.WriteString(fmt.Sprintf("|field-mutation-component:%#v", *link.nativeField))
				}
			}
			for _, forward := range recipe.fieldForwards {
				installedMutationRHSFingerprint(forward.mutationRHS, &result)
				result.WriteString(fmt.Sprintf("|field-forward:%#v:%#v", forward.request, descriptorFingerprintAlternatives([]sourceStagedOperationAlternative{forward.alternative}, &result)[0]))
				if forward.source != nil {
					source := *forward.source
					source.installation, source.eager, source.input, source.prototype, source.calleeEntry, source.inputInvocation, source.descriptorRead = nil, nil, nil, nil, nil, nil, nil
					if source.descriptorMap != nil {
						plan := *source.descriptorMap
						plan.argumentOrder = nil
						if plan.argumentSource != nil {
							result.WriteString(fmt.Sprintf("|native-map-source:%#v", *plan.argumentSource))
							plan.argumentSource = nil
						}
						result.WriteString(fmt.Sprintf("|native-map:%#v", plan))
						source.descriptorMap = nil
					}
					result.WriteString(fmt.Sprintf("|forward-source:%#v", source))
					if forward.source.inputInvocation != nil {
						result.WriteString(fmt.Sprintf("|forward-input-invocation:%#v", *forward.source.inputInvocation))
					}
					if forward.source.prototype != nil {
						result.WriteString(fmt.Sprintf("|forward-prototype:%#v", *forward.source.prototype))
					}
					if forward.source.input != nil {
						result.WriteString(fmt.Sprintf("|forward-input:%#v", *forward.source.input))
					}
					if forward.source.eager != nil {
						result.WriteString(fmt.Sprintf("|forward-eager-effects:%#v", *forward.source.eager))
					}
					if forward.source.installation != nil {
						result.WriteString(fmt.Sprintf("|forward-installation:%#v", *forward.source.installation))
					}
				}
			}
			if recipe.nativeGet != nil {
				source := *recipe.nativeGet
				// Dedicated markers above cover these descriptions without carrier or issuer identity.
				source.effectsSource, source.arrayPush = nil, nil
				source.installation, source.eager, source.input, source.prototype, source.calleeEntry, source.inputInvocation, source.descriptorRead = nil, nil, nil, nil, nil, nil, nil
				if source.descriptorMap != nil {
					plan := *source.descriptorMap
					plan.argumentOrder = nil
					if plan.argumentSource != nil {
						result.WriteString(fmt.Sprintf("|native-map-source:%#v", *plan.argumentSource))
						plan.argumentSource = nil
					}
					result.WriteString(fmt.Sprintf("|native-map:%#v", plan))
					source.descriptorMap = nil
				}
				result.WriteString(fmt.Sprintf("|native-get:%#v", source))
				if recipe.nativeGet.inputInvocation != nil {
					result.WriteString(fmt.Sprintf("|native-input-invocation:%#v", *recipe.nativeGet.inputInvocation))
				}
				if recipe.nativeGet.prototype != nil {
					result.WriteString(fmt.Sprintf("|native-prototype:%#v", *recipe.nativeGet.prototype))
				}
				if recipe.nativeGet.input != nil {
					result.WriteString(fmt.Sprintf("|native-input:%#v", *recipe.nativeGet.input))
				}
				if recipe.nativeGet.eager != nil {
					result.WriteString(fmt.Sprintf("|native-eager-effects:%#v", *recipe.nativeGet.eager))
				}
				if recipe.nativeGet.installation != nil {
					result.WriteString(fmt.Sprintf("|native-installation:%#v", *recipe.nativeGet.installation))
				}
			}
		}
		for _, use := range fact.staged.operationUses {
			result.WriteString(fmt.Sprintf("|operation-use:%#v:%p", use.request, use.call))
			if use.installed != nil {
				result.WriteString(fmt.Sprintf("|installed-get:%#v", *use.installed))
			}
		}
		for _, creation := range fact.staged.returnedCreations {
			result.WriteString(fmt.Sprintf("|returned-creation:%p:%#v:%p:%#v", creation.binding, creation.recipe, creation.inputs, creation.uses))
		}
		for _, invoked := range fact.staged.returnedInvocations {
			result.WriteString(fmt.Sprintf("|returned-invocation:%#v:%#v", invoked.alternative, invoked.later))
		}
		result.WriteString(environmentSourcesSignature(fact.summary.DirectEffectSources))
		for _, call := range fact.fieldCalls {
			for _, outcome := range call.descriptorEffects {
				result.WriteString(fmt.Sprintf("|descriptor-outcome:%p:%p:%p:%p:%t:%s", outcome.caller, outcome.call, outcome.target, outcome.occurrence, outcome.complete, descriptorSourceIdentity(EnvironmentEffectSource{descriptorOrigin: &outcome.origin})))
			}
		}
		result.WriteString(stateEffectsSignature(fact.directReads))
		result.WriteString(stateEffectsSignature(fact.directWrites))
		result.WriteString(contextEffectsSignature(fact.directContext))
		for _, edge := range fact.summary.Calls {
			result.WriteString(edge.ID)
			result.WriteString(fmt.Sprintf("|owned-scalar-call:%t", fact.ownedScalarCalls[edge.ID]))
			result.WriteByte('|')
			result.WriteString(edge.Name)
			result.WriteByte('|')
			result.WriteString(edge.ModuleSpecifier)
			result.WriteByte('|')
			result.WriteString(edge.ExportName)
			for _, binding := range edge.ReceiverBindings {
				result.WriteString(fmt.Sprintf("|receiver:%d:%s:%d:%q", binding.ParameterIndex, binding.Source, binding.SourceParameterIndex, binding.Path))
			}
			result.WriteByte('|')
			if symbol, exists := fact.callSymbols[edge.ID]; exists {
				result.WriteString(fmt.Sprintf("%d", symbol))
			}
			result.WriteByte('\n')
		}
	}
	symbols := make([]int, 0, len(analysis.bySymbol))
	for symbol := range analysis.bySymbol {
		symbols = append(symbols, int(symbol))
	}
	sort.Ints(symbols)
	for _, symbol := range symbols {
		result.WriteString(fmt.Sprintf("symbol:%d:%s\n", symbol, analysis.bySymbol[ast.SymbolId(symbol)].ID))
	}
	return result.String()
}

func rebuildProjectCallableCache(
	program *compiler.Program,
	cache *projectCallableCache,
	owner *executableBodyOwner,
	requestedSources ...*ast.SourceFile,
) {
	cache.analyses = cache.analyses[:0]
	var requested *ast.SourceFile
	if len(requestedSources) != 0 {
		requested = requestedSources[0]
	}
	for _, sourceFile := range program.GetSourceFiles() {
		analysis, exists := cache.bySource[sourceFile]
		if !exists {
			continue
		}
		if requested == nil {
			requested = sourceFile
		}
		cache.analyses = append(cache.analyses, analysis)
	}
	defer func() {
		if len(cache.merged.pending) == 0 {
			sealModuleInitializers(owner, cache.merged.facts)
		}
	}()
	cache.requested = requested
	cache.merged = callableAnalysis{}
	if hasPreparedProjectSources(cache.analyses) {
		cache.merged = collectPreparedProjectCallableEffects(requested, cache, owner)
	} else if len(cache.analyses) == 1 && (owner == nil || owner.selection == nil) {
		cache.merged = cache.analyses[0]
	} else if len(cache.analyses) > 0 {
		cache.merged = mergeProjectCallableEffects(requested, cache.analyses, owner)
	}
}

func mergeProjectCallableEffects(
	requested *ast.SourceFile,
	analyses []callableAnalysis,
	owner *executableBodyOwner,
) callableAnalysis {
	factCount := 0
	for _, analysis := range analyses {
		factCount += len(analysis.facts)
	}
	facts := make([]callableFacts, 0, factCount)
	symbolSummaryIDs := make(map[ast.SymbolId]string, factCount)
	for _, analysis := range analyses {
		for _, fact := range analysis.facts {
			facts = append(facts, cloneProjectCallableFact(fact))
		}
		for symbol, summary := range analysis.bySymbol {
			symbolSummaryIDs[symbol] = summary.ID
		}
	}
	linkProjectCallableFacts(facts, symbolSummaryIDs, owner)
	if pending := resolveCallableEffects(facts, owner); len(pending) != 0 {
		return callableAnalysis{facts: facts, pending: pending}
	}
	applyCallableArtifactConstraints(facts)
	return callableAnalysisFromFacts(requested, facts, analyses)
}

func callableModuleKey(filename string) string {
	resolved, err := filepath.Abs(filename)
	if err == nil {
		filename = resolved
	}
	extension := filepath.Ext(filename)
	switch strings.ToLower(extension) {
	case ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs":
		filename = strings.TrimSuffix(filename, extension)
	}
	filename = filepath.ToSlash(filepath.Clean(filename))
	if filepath.Separator == '\\' {
		filename = strings.ToLower(filename)
	}
	return filename
}

// cloneProjectCallableFact copies mutable graph inputs. Propagated summaries and targets
// are replaced by the merge before resolution, so copying them would be discarded work.
func cloneProjectCallableFact(value callableFacts) callableFacts {
	value.staged = cloneCallableExtraction(value.staged)
	value.pendingMembers = clonePendingMemberLedger(value.pendingMembers)
	if value.directExposurePublished != nil {
		copied := make(map[*ast.Node]bool, len(value.directExposurePublished))
		for node, done := range value.directExposurePublished {
			copied[node] = done
		}
		value.directExposurePublished = copied
	}
	value.callOutcomes = append([]sourceCallOutcome(nil), value.callOutcomes...)
	value.componentCallableInputs = append([]sourceComponentCallableInput(nil), value.componentCallableInputs...)
	value.componentInputDemands = append([]sourceComponentInputDemand(nil), value.componentInputDemands...)
	value.initializerDraft = cloneModuleInitializerDraft(value.initializerDraft)
	// Publication rights remain on original source facts. Cached copies retain
	// only the immutable descriptor outcomes completed by those publishers.
	value.ownedLegacyPending = nil
	value.ownedGetPending = nil
	value.mapInputs = append([]*sourceMapInputContribution(nil), value.mapInputs...)
	for i := range value.mapInputs {
		value.mapInputs[i] = cloneMapInput(value.mapInputs[i])
	}
	value.fieldCalls = append([]sourceFieldCall(nil), value.fieldCalls...)
	for i := range value.fieldCalls {
		value.fieldCalls[i] = cloneSourceFieldCall(value.fieldCalls[i])
	}
	value.summary.DirectEffectSources = append(
		[]EnvironmentEffectSource(nil),
		value.summary.DirectEffectSources...,
	)
	for i := range value.summary.DirectEffectSources {
		value.summary.DirectEffectSources[i].relativeMutation = cloneRelativeFieldMutation(value.summary.DirectEffectSources[i].relativeMutation)
	}
	value.summary.Calls = append([]CallEdge(nil), value.summary.Calls...)
	// Late operation delivery adds original Get/Call phase associations. Each
	// merged graph owns those additions independently of cached source facts.
	value.fieldEdgeOperations = maps.Clone(value.fieldEdgeOperations)
	value.directWrites = append([]StateEffect(nil), value.directWrites...)
	// Export names and source-reference maps are immutable after source analysis.
	// Artifact targets and propagated effects are rebuilt before publication.
	return value
}

func callableAnalysisFromFacts(
	requested *ast.SourceFile,
	facts []callableFacts,
	analyses []callableAnalysis,
) callableAnalysis {
	if pending := stagedPublicationPending(facts); len(pending) != 0 {
		return callableAnalysis{facts: facts, pending: pending}
	}
	finalByID := make(map[string]CallableSummary, len(facts))
	byNode := make(map[*ast.Node]CallableSummary, len(facts))
	summaries := []CallableSummary{}
	for index := range facts {
		fact := &facts[index]
		// Inventory alone cannot publish a neutral analyzed body.
		if !fact.staged.ready {
			continue
		}
		fact.summary.DirectEffect = environmentEffectFor(fact.summary.DirectEffectSources)
		fact.summary.Effect = environmentEffectFor(fact.summary.EffectSources)
		fact.summary.ArtifactTargets = artifactTargetsFor(
			fact.summary.Effect,
			fact.summary.EffectSources,
			fact.artifactConstraint,
		)
		published := fact.summary
		published.DirectEffectSources = displayEnvironmentSources(published.DirectEffectSources)
		published.EffectSources = displayEnvironmentSources(published.EffectSources)
		finalByID[fact.summary.ID] = published
		byNode[fact.node] = published
		if fact.sourceFile == requested {
			summaries = append(summaries, published)
		}
	}
	bySymbol := make(map[ast.SymbolId]CallableSummary)
	for _, analysis := range analyses {
		for symbol, summary := range analysis.bySymbol {
			if final, exists := finalByID[summary.ID]; exists {
				bySymbol[symbol] = final
			}
		}
	}
	sort.Slice(summaries, func(left int, right int) bool {
		return summaries[left].ID < summaries[right].ID
	})
	return callableAnalysis{
		summaries: summaries,
		byNode:    byNode,
		bySymbol:  bySymbol,
		facts:     facts,
	}
}

func collectCallableNodes(sourceFile *ast.SourceFile) []*ast.Node {
	var result []*ast.Node
	for _, statement := range sourceFile.Statements.Nodes {
		if runtimeModuleEvaluation(statement) {
			if ast.IsVariableStatement(statement) {
				list := statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
				declarations := list.Declarations.Nodes
				// Resource lists retain their enclosing traversal owner. The existing
				// list visitor publishes implicit disposal after acquisition.
				if len(declarations) > 1 && list.Flags&ast.NodeFlagsUsing == 0 {
					// Partitionable declarations must not share one effect summary.
					// Single-declaration statements retain their existing refinement owner.
					for _, declaration := range declarations {
						if runtimeModuleEvaluation(declaration) {
							result = append(result, declaration)
						}
					}
					continue
				}
			}
			result = append(result, statement)
		}
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if isCallableNode(node) {
			result = append(result, node)
		}
		return true
	})
	sort.Slice(result, func(left int, right int) bool {
		return result[left].Pos() < result[right].Pos()
	})
	return result
}

func isCallableNode(node *ast.Node) bool {
	return ast.IsFunctionDeclaration(node) ||
		ast.IsFunctionExpression(node) ||
		ast.IsArrowFunction(node) ||
		ast.IsConstructorDeclaration(node) ||
		ast.IsMethodDeclaration(node) || ast.IsGetAccessorDeclaration(node) || ast.IsSetAccessorDeclaration(node)
}

func callableIdentity(
	node *ast.Node,
	componentByStart map[int]Component,
) (string, string, []string) {
	if runtimeModuleEvaluation(node) {
		return fmt.Sprintf("module@%d", node.Pos()), "module-initializer", nil
	}
	if component, ok := componentByStart[node.Pos()]; ok {
		exports := []string{}
		if component.Exported {
			exports = append(exports, component.Name)
		}
		return component.Name, "component", exports
	}
	name := ""
	if declarationName := node.Name(); declarationName != nil {
		name = callableNameText(declarationName)
	}
	binding := sourceCallableBinding(node)
	if name == "" && binding != nil {
		declarationName := binding.Name()
		if declarationName != nil {
			name = callableNameText(declarationName)
		}
	}
	if name == "" {
		name = fmt.Sprintf("<anonymous@%d>", node.Pos())
	}
	kind := "function"
	if ast.IsMethodDeclaration(node) || ast.IsGetAccessorDeclaration(node) || ast.IsSetAccessorDeclaration(node) {
		kind = "method"
	}
	exports := []string{}
	if ast.IsFunctionDeclaration(node) &&
		ast.HasSyntacticModifier(node, ast.ModifierFlagsExport) {
		exports = append(exports, name)
	}
	if binding != nil &&
		binding.Parent != nil && binding.Parent.Parent != nil &&
		ast.IsVariableStatement(binding.Parent.Parent) &&
		ast.HasSyntacticModifier(binding.Parent.Parent, ast.ModifierFlagsExport) {
		exports = append(exports, name)
	}
	return name, kind, exports
}

func callableNameText(name *ast.Node) string {
	if ast.IsIdentifier(name) || ast.IsStringLiteral(name) || ast.IsNumericLiteral(name) {
		return name.Text()
	}
	return ""
}

func callableDeclarationSymbol(
	node *ast.Node,
	typeChecker *checker.Checker,
) *ast.Symbol {
	if name := node.Name(); name != nil && ast.IsIdentifier(name) {
		return typeChecker.GetSymbolAtLocation(name)
	}
	if binding := sourceCallableBinding(node); binding != nil {
		if name := binding.Name(); name != nil && ast.IsIdentifier(name) {
			return typeChecker.GetSymbolAtLocation(name)
		}
	}
	return nil
}

func bindCallableAliases(
	sourceFile *ast.SourceFile,
	symbolTargets map[ast.SymbolId]int,
	typeChecker *checker.Checker,
) {
	changed := true
	for changed {
		changed = false
		walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
			if !ast.IsVariableDeclaration(node) {
				return true
			}
			declaration := node.AsVariableDeclaration()
			name := declaration.Name()
			if name == nil || !ast.IsIdentifier(name) || declaration.Initializer == nil {
				return true
			}
			alias := typeChecker.GetSymbolAtLocation(name)
			target := callableAliasTarget(declaration.Initializer, typeChecker)
			if alias == nil || target == nil {
				return true
			}
			targetIndex, exists := symbolTargets[ast.GetSymbolId(target)]
			if !exists {
				return true
			}
			aliasID := ast.GetSymbolId(alias)
			if current, bound := symbolTargets[aliasID]; !bound || current != targetIndex {
				symbolTargets[aliasID] = targetIndex
				changed = true
			}
			return true
		})
	}
}

func callableAliasTarget(
	initializer *ast.Node,
	typeChecker *checker.Checker,
) *ast.Symbol {
	if ast.IsCallExpression(initializer) {
		expression := initializer.AsCallExpression().Expression
		if receiver, name := restrictedInvocationMember(expression, typeChecker); receiver != nil && name == "bind" && nativeFunctionInvocation(receiver, name, typeChecker) {
			return sourceCallableReferenceSymbol(receiver, typeChecker)
		}
		return nil
	}
	return callTargetSymbol(initializer, typeChecker)
}

// linkProjectCallableFacts shares the existing import/export and selected-body
// relinker. Callers separately own mutable facts, registration and first resolve.
func linkProjectCallableFacts(facts []callableFacts, symbolSummaryIDs map[ast.SymbolId]string, owner *executableBodyOwner) {
	factByNode := make(map[*ast.Node]int, len(facts))
	factByID := make(map[string]int, len(facts))
	exportedByModule := make(map[string]int)
	for index := range facts {
		factByID[facts[index].summary.ID] = index
		factByNode[facts[index].node] = index
		// Pending per-file analysis retains source facts but has no published
		// bySymbol summaries. Body identity does not require settled Effects.
		fact := &facts[index]
		if owner != nil && owner.values != nil && owner.checker != nil && fact.sourceFile != nil && owner.values.program.GetSourceFile(fact.sourceFile.FileName()) == fact.sourceFile && !runtimeModuleEvaluation(fact.node) && !ast.IsGetAccessorDeclaration(fact.node) && !ast.IsSetAccessorDeclaration(fact.node) {
			indexSymbol := func(symbol *ast.Symbol) {
				if symbol = resolvedCallableSymbol(symbol, owner.checker); symbol != nil {
					symbolSummaryIDs[ast.GetSymbolId(symbol)] = fact.summary.ID
				}
			}
			indexSymbol(callableDeclarationSymbol(fact.node, owner.checker))
			if binding := sourceCallableBinding(fact.node); binding != nil {
				indexSymbol(owner.checker.GetSymbolAtLocation(binding.Name()))
			}
		}
		module := callableModuleKey(facts[index].sourceFile.FileName())
		for _, exportName := range facts[index].summary.ExportNames {
			exportedByModule[module+"\x00"+exportName] = index
		}
		facts[index].targets = nil

		facts[index].summary.StateReads = append(
			[]StateEffect(nil),
			facts[index].directReads...,
		)
		facts[index].summary.StateWrites = append(
			[]StateEffect(nil),
			facts[index].directWrites...,
		)
		facts[index].summary.Contexts = append(
			[]ContextEffect(nil),
			facts[index].directContext...,
		)
		for edgeIndex := range facts[index].summary.Calls {
			edge := &facts[index].summary.Calls[edgeIndex]
			if _, symbolOwned := facts[index].callSymbols[edge.ID]; !symbolOwned &&
				edge.Resolved && edge.TargetID != "" {
				continue
			}
			edge.TargetID = ""
			edge.Resolved = false
		}
	}
	applySourceOwnedObligations(facts, factByNode, owner.values)
	for index := range facts {
		facts[index].summary.StateWrites = append([]StateEffect(nil), facts[index].directWrites...)
	}
	for factIndex := range facts {
		fact := &facts[factIndex]
		for edgeIndex := range fact.summary.Calls {
			edge := &fact.summary.Calls[edgeIndex]
			symbol, exists := fact.callSymbols[edge.ID]
			// A bodyless source declaration has no executable summary to recover
			// through its checker symbol. Preserve the issuing owner's runtime
			// unknown after graph cloning and cross-source relinking as well.
			if sourceOpaqueDeclarationCall(fact.fieldEdgeOperations[edge.ID], owner) {
				edge.Resolved, edge.TargetID = false, ""
				continue
			}
			targetIndex := -1
			if body, hostOwned := owner.body(fact.callExpressions[edge.ID]); hostOwned {
				edge.Resolved = false
				edge.TargetID = ""
				if index, found := factByNode[body]; found {
					targetIndex = index
				}
				// A selected opaque/missing body cannot inherit typed-stub authority.
				if targetIndex < 0 {
					fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, environmentSource("unknown", "unresolved call "+edge.Name, fact.summary.Name))
				}
			} else {
				if edge.Resolved && edge.TargetID != "" {
					if index, present := factByID[edge.TargetID]; present {
						targetIndex = index
					}
				}
				if exists {
					if targetID, resolved := symbolSummaryIDs[symbol]; resolved {
						if index, present := factByID[targetID]; present {
							targetIndex = index
						}
					}
				}
				// Legacy inference without a host snapshot does not prove executable identity.
				// TS-Go does not currently substitute every authored `.js` edge
				// to a sibling `.tsx` root. The retained project already owns those
				// source files, so link the same export by normalized module stem.
				if targetIndex < 0 && edge.ModuleSpecifier != "" &&
					strings.HasPrefix(edge.ModuleSpecifier, ".") &&
					edge.ExportName != "" {
					module := callableModuleKey(filepath.Join(
						filepath.Dir(fact.sourceFile.FileName()),
						edge.ModuleSpecifier,
					))
					if index, present := exportedByModule[module+"\x00"+edge.ExportName]; present {
						targetIndex = index
					}
				}
			}

			if targetIndex < 0 {
				continue
			}
			edge.TargetID = facts[targetIndex].summary.ID
			edge.Resolved = true
			fact.targets = append(fact.targets, targetIndex)
		}
		unresolved := make(map[string]struct{})
		for _, edge := range fact.summary.Calls {
			if !edge.Resolved {
				unresolved["unresolved call "+edge.Name] = struct{}{}
			}
		}
		filtered := fact.summary.DirectEffectSources[:0]
		for _, source := range fact.summary.DirectEffectSources {
			if source.Environment == "unknown" &&
				strings.HasPrefix(source.Description, "unresolved call ") {
				if _, remains := unresolved[source.Description]; !remains {
					continue
				}
			}
			filtered = append(filtered, source)
		}
		fact.summary.DirectEffectSources = filtered
		fact.summary.EffectSources = append(
			[]EnvironmentEffectSource(nil),
			filtered...,
		)
	}
}

// prepareProjectCallableContexts preserves authoritative requested metadata and
// existing invalidation/source selection, without collecting source bodies.
func prepareProjectCallableContexts(project *projectState, sourceFile *ast.SourceFile, typeChecker *checker.Checker, components []Component, stateReads []StateRead, stateWrites []StateWrite, componentBindings map[int]componentBinding, assets assetAnalysis, assetRules []AssetRule) (*projectCallableCache, bool) {
	// Asset rules are request-owned. Reuse requires the same declaration contract,
	// including for dependencies seeded before they become a requested source.
	cacheNeedsPublication := project.callableCache != nil && (!project.callableCache.owned[sourceFile] || sourceJSXPublicationNeeded(project.callableCache, project.activeGeneration)) && project.callableCache.owner != nil && project.callableCache.owner.values != nil && (project.callableCache.owner.values.language == nil || project.callableCache.owner.values.language.disposed)
	if !project.callableCache.ownsGeneration(project.program, typeChecker) || !sameCallableAssetRules(project.callableCache.assetRules, assetRules) || cacheNeedsPublication || stalePossibleProxyOriginCache(project.callableCache, project.activeGeneration) {
		project.callableCache = &projectCallableCache{semantics: advisoryAnalysisSemantics, program: project.program, owner: newExecutableBodyOwner(project, typeChecker), assetRules: snapshotCallableAssetRules(assetRules), bySource: make(map[*ast.SourceFile]callableAnalysis), fingerprints: make(map[*ast.SourceFile]string), owned: make(map[*ast.SourceFile]bool)}
	}
	cache := project.callableCache
	// Reused facts never retain the first request's checker lease capability.
	cache.owner.values.generation = project.activeGeneration
	cache.owner.values.index(sourceFile)
	changed := false
	// Seed the requested source from session-owned facts before discovering dependencies.
	// This avoids analyzing it once provisionally and again with authoritative binding writes.
	prior := cache.bySource[sourceFile]
	if !cache.owned[sourceFile] || !sameSourceJSXMode(prior.sourceContext, project.activeGeneration, sourceFile) {
		project.counters.CallableSourceAnalyses++
		refreshed := prepareProjectCallableSource(sourceFile, typeChecker, components, stateReads, stateWrites, componentBindings, assets, cache.owner)
		fingerprint := callableAnalysisFingerprint(refreshed)
		if refreshed.sourceContext != nil || fingerprint != cache.fingerprints[sourceFile] {
			cache.bySource[sourceFile] = refreshed
			cache.fingerprints[sourceFile] = fingerprint
			changed = true
		}
		cache.owned[sourceFile] = true
	}
	return cache, ensureProjectCallableSources(project, typeChecker, cache, assetRules) || changed || cache.analyses == nil
}
