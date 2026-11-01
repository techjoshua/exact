package exactcompiler

import (
	"fmt"
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
	callOutcomes []sourceCallOutcome

	componentInputDemands []sourceComponentInputDemand
	// Source coverage is immutable analysis metadata, never a runtime receipt.
	pendingPrefixCoverage  *sourcePrefixRefusalCoverage
	prefixCoverage         *sourcePrefixRefusalCoverage
	initializerDraft       *moduleInitializerDraft
	initializerPlan        *closedOwnGetterPlan
	initializerDeclaration *ast.Node
	ownedLegacyPending     []*sourceLegacyPublication
	ownedGetResults        []*ownedGetPopulation
	ownedGetPending        []*ownedGetFactObligation

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
	owner     *executableBodyOwner
	summaries []CallableSummary
	byNode    map[*ast.Node]CallableSummary
	bySymbol  map[ast.SymbolId]CallableSummary
	facts     []callableFacts
}

// projectCallableCache contains checker-bound facts for one exact program/checker generation.
const advisoryAnalysisSemantics = 3

// Analysis semantics is separate from diagnostic threshold policy.
type projectCallableCache struct {
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
	// Snapshot the actual producing mode before refusal removes routing.
	// This scalar is not recovered from historical coverage or a later query.
	prefixMode := [32]byte{}
	if owner != nil && owner.values != nil {
		if p := owner.values.closedPrefixCandidate; p != nil && p.source == sourceFile && p.history != nil {
			prefixMode = p.history.mode
		}
	}
	nodes := collectCallableNodes(sourceFile)
	plans := map[*ast.Node]*closedOwnGetterPlan{}
	declarations := map[*ast.Node]*ast.Node{}
	for _, statement := range sourceFile.Statements.Nodes {
		if !runtimeVariableInitializer(statement) {
			continue
		}
		if declaration, plan, ok := preflightModuleInitializer(owner, statement); ok {
			plans[statement] = plan
			declarations[statement] = declaration
		}
	}
	sort.Slice(nodes, func(i, j int) bool { return nodes[i].Pos() < nodes[j].Pos() })
	facts := make([]callableFacts, 0, len(nodes))
	componentByStart := make(map[int]Component, len(components))
	for _, component := range components {
		componentByStart[component.Start] = component
	}
	symbolTargets := make(map[ast.SymbolId]int)
	importBindings := collectExternalImportBindings(sourceFile, typeChecker)
	// Reuse this analysis's selected components and imports before effect queries.
	// Settlement must not rediscover all component bodies for each returned value.
	if owner != nil && owner.values != nil {
		if owner.values.components == nil {
			owner.values.components = make(map[*ast.Node]externalImportBindings)
		}
		for _, node := range nodes {
			if _, component := componentByStart[node.Pos()]; component {
				owner.values.components[node] = importBindings
			}
		}
	}
	for _, node := range nodes {
		name, kind, exportNames := callableIdentity(node, componentByStart)
		index := len(facts)
		facts = append(facts, callableFacts{
			node:                   node,
			initializerPlan:        plans[node],
			initializerDeclaration: declarations[node],
			sourceFile:             sourceFile,
			descriptorMode:         prefixMode,
			summary: CallableSummary{
				ID: fmt.Sprintf(
					"callable:%s:%d",
					sourceFile.FileName(),
					node.Pos(),
				),
				Name:                name,
				Kind:                kind,
				ExportNames:         nonNilSlice(exportNames),
				DirectEffectSources: []EnvironmentEffectSource{},
				EffectSources:       []EnvironmentEffectSource{},
				Calls:               []CallEdge{},
				ArtifactTargets:     []string{},
				StateReads:          []StateEffect{},
				StateWrites:         []StateEffect{},
				Contexts:            []ContextEffect{},
			},
			callSymbols:       make(map[string]ast.SymbolId),
			ownedScalarCalls:  make(map[string]bool),
			callExpressions:   make(map[string]*ast.Node),
			contextReferences: make(map[string]*ast.Node),
		})
		if symbol := callableDeclarationSymbol(node, typeChecker); symbol != nil && !ast.IsGetAccessorDeclaration(node) && !ast.IsSetAccessorDeclaration(node) {
			symbolTargets[ast.GetSymbolId(symbol)] = index
		}
		if binding := sourceCallableBinding(node); binding != nil {
			if symbol := typeChecker.GetSymbolAtLocation(binding.Name()); symbol != nil {
				symbolTargets[ast.GetSymbolId(symbol)] = index
			}
		}
	}
	bindCallableAliases(sourceFile, symbolTargets, typeChecker)
	syntacticTargets := collectSyntacticCallableTargets(facts)
	nodeTargets := make(map[*ast.Node]int, len(facts))
	for index, fact := range facts {
		nodeTargets[fact.node] = index
	}
	bindSyntacticCallableAliases(
		sourceFile,
		syntacticTargets,
		symbolTargets,
		typeChecker,
	)
	contextBindings := collectContextBindings(sourceFile, typeChecker)

	installBuildingInitializers(owner, sourceFile, facts)
	for index := range facts {
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
			prefixMode,
		)
	}
	sealMapInputs(facts, nodeTargets)
	applyPrefixSourceCoverage(facts, nodeTargets, owner, prefixMode)
	for index := range facts {
		facts[index].directOwnedScalarBlocked = facts[index].directOwnedScalarBlocked || !directScalarHelper(&facts[index], typeChecker)
	}
	facts = appendComponentBindingCallableFacts(facts, sourceFile, componentBindings)
	resolveCallableEffects(facts, owner)
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
	prefixCandidates ...*closedPrefixCandidate,
) callableAnalysis {
	// Asset rules are request-owned. Reuse requires the same declaration contract,
	// including for dependencies seeded before they become a requested source.
	cacheNeedsPublication := project.callableCache != nil && !project.callableCache.owned[sourceFile] && project.callableCache.owner != nil && project.callableCache.owner.values != nil && (project.callableCache.owner.values.language == nil || project.callableCache.owner.values.language.disposed)
	if !project.callableCache.ownsGeneration(project.program, typeChecker) || !sameCallableAssetRules(project.callableCache.assetRules, assetRules) || cacheNeedsPublication || stalePossibleProxyOriginCache(project.callableCache, project.activeGeneration) {
		project.callableCache = &projectCallableCache{semantics: advisoryAnalysisSemantics, program: project.program, owner: newExecutableBodyOwner(project, typeChecker), assetRules: snapshotCallableAssetRules(assetRules), bySource: make(map[*ast.SourceFile]callableAnalysis), fingerprints: make(map[*ast.SourceFile]string), owned: make(map[*ast.SourceFile]bool)}
	}
	for _, candidate := range prefixCandidates {
		if candidate != nil && project.callableCache.owned[sourceFile] {
			old := project.callableCache.owner.values.closedPrefixes[sourceFile]
			if old == nil || !old.cacheCompatible(project.callableCache.owner.values, project.callableCache.owner, candidate.source, candidate.history.mode) {
				project.callableCache = &projectCallableCache{semantics: advisoryAnalysisSemantics, program: project.program, owner: newExecutableBodyOwner(project, typeChecker), assetRules: snapshotCallableAssetRules(assetRules), bySource: make(map[*ast.SourceFile]callableAnalysis), fingerprints: make(map[*ast.SourceFile]string), owned: make(map[*ast.SourceFile]bool)}
			}
		}
	}
	cache := project.callableCache
	// Reused facts never retain the first request's checker lease capability.
	cache.owner.values.generation = project.activeGeneration
	for _, candidate := range prefixCandidates {
		candidate.attach(cache.owner.values, cache.owner)
	}
	cache.owner.values.index(sourceFile)
	for _, candidate := range prefixCandidates {
		candidate.qualifyIndex()
	}
	changed := false
	// Seed the requested source from session-owned facts before discovering dependencies.
	// This avoids analyzing it once provisionally and again with authoritative binding writes.
	if !cache.owned[sourceFile] {
		project.counters.CallableSourceAnalyses++
		refreshed := collectCallableEffects(sourceFile, typeChecker, components, stateReads, stateWrites, componentBindings, assets, cache.owner)
		for _, candidate := range prefixCandidates {
			if candidate != nil && candidate.retryLegacy {
				candidate.refuse()
				// No semantic entry occurred. Discard speculative definition facts, then
				// rebuild the complete legacy analysis, including held initializer facts.
				refreshed = collectCallableEffects(sourceFile, typeChecker, components, stateReads, stateWrites, componentBindings, assets, cache.owner)
			}
		}
		fingerprint := callableAnalysisFingerprint(refreshed)
		if fingerprint != cache.fingerprints[sourceFile] {
			cache.bySource[sourceFile] = refreshed
			cache.fingerprints[sourceFile] = fingerprint
			changed = true
		}
		cache.owned[sourceFile] = true
	}
	if ensureProjectCallableSources(project, typeChecker, cache, assetRules) || changed || cache.analyses == nil {
		rebuildProjectCallableCache(project.program, cache, cache.owner)
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
	for _, fact := range merged.facts {
		if fact.sourceFile == source {
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
		if _, exists := cache.bySource[sourceFile]; exists {
			continue
		}
		project.counters.CallableSourceAnalyses++
		analysis := analyzeProjectCallableSource(sourceFile, typeChecker, assetRules, cache.owner)
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
	return collectCallableEffects(
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
	for _, fact := range analysis.facts {
		if fact.initializerDraft != nil {
			result.WriteString(fact.initializerDraft.signature)
		}
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
) {
	cache.analyses = cache.analyses[:0]
	var requested *ast.SourceFile
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
	defer func() { sealModuleInitializers(owner, cache.merged.facts) }()
	cache.merged = callableAnalysis{}
	if len(cache.analyses) == 1 && (owner == nil || owner.selection == nil) {
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
	factByNode := make(map[*ast.Node]int, len(facts))
	factByID := make(map[string]int, len(facts))
	exportedByModule := make(map[string]int)
	for index := range facts {
		factByID[facts[index].summary.ID] = index
		factByNode[facts[index].node] = index
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
	resolveCallableEffects(facts, owner)
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
	value.callOutcomes = append([]sourceCallOutcome(nil), value.callOutcomes...)
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
	value.summary.Calls = append([]CallEdge(nil), value.summary.Calls...)
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
	finalByID := make(map[string]CallableSummary, len(facts))
	byNode := make(map[*ast.Node]CallableSummary, len(facts))
	summaries := []CallableSummary{}
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
