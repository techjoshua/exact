package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// callableSourceContext retains static source-analysis inputs, not an acquired
// invocation or graph observation. The requested source replaces dependency
// context authoritatively before any project extraction. Source invalidation
// removes this context with the existing bySource entry.
type callableSourceContext struct {
	jsxConstruction sourceJSXConstructionKey // Static mode input; no graph/Get authority.
	source          *ast.SourceFile
	reads           []StateRead
	writes          []StateWrite
	bindings        map[int]componentBinding
	assets          assetAnalysis
	inventory       callableSourceFacts
	canonicalCount  int
	collect         bool // New source preparation, not a readiness/currentness assertion.
}

// prepareProjectCallableSource uses the canonical source factory without its
// initializer preflight. All genuine sources enter the fixed registry before
// installBuildingInitializers or any original source observation is allowed.
func prepareProjectCallableSource(source *ast.SourceFile, c *checker.Checker, components map[int]callableComponent, reads []StateRead, writes []StateWrite, bindings map[int]componentBinding, assets assetAnalysis, owner *executableBodyOwner) callableAnalysis {
	inventory := prepareCallableSourceInventory(source, c, components, owner, nil)
	context := &callableSourceContext{jsxConstruction: sourceJSXModeKey(owner.values.generation, source), source: source, reads: reads, writes: writes, bindings: bindings, assets: assets, inventory: inventory, canonicalCount: len(inventory.facts), collect: true}
	facts := appendComponentBindingCallableFacts(inventory.facts, source, bindings)
	// These property-access metadata facts are completed by their existing
	// generated-binding factory. They have no callable body to dispatch.
	for i := context.canonicalCount; i < len(facts); i++ {
		facts[i].staged.ready = true
	}
	return callableAnalysis{facts: facts, sourceContext: context}
}

func hasPreparedProjectSources(analyses []callableAnalysis) bool {
	for _, analysis := range analyses {
		if analysis.sourceContext != nil {
			return true
		}
	}
	return false
}

// projectSourceCollection owns one source's explicit local-to-project mapping.
// Spelling/position maps never become a project-wide name-based resolver.
type projectSourceCollection struct {
	context          *callableSourceContext
	prior            callableAnalysis
	first, end       int
	syntacticTargets map[string]int
}

// collectPreparedProjectCallableEffects freezes the genuine canonical union
// before any body task. Cached facts retain only the same cloneable descriptions
// used by ordinary merge; new/authoritative contexts collect on this work once.
// The first fixed point uses this same work, preserving real issued subscribers.
// projectCallableCollection owns one fixed graph and its actual publisher
// interval. Tests may inspect it before close using the same collection path;
// no query/frame or source proof is installed by that inspection.
type projectCallableCollection struct {
	cache           *projectCallableCache
	owner           *executableBodyOwner
	sources         []projectSourceCollection
	facts           []callableFacts
	nodes           map[*ast.Node]int
	symbols         map[ast.SymbolId]int
	symbolSummaries map[ast.SymbolId]string
	bySource        map[*ast.SourceFile]*projectSourceCollection
	work            callableEffectWork
	release         func()
}

func collectPreparedProjectCallableEffects(requested *ast.SourceFile, cache *projectCallableCache, owner *executableBodyOwner) callableAnalysis {
	collection := beginProjectCallableCollection(cache, owner, requested)
	defer collection.close()
	collection.collect()
	return collection.resolve(requested)
}

func beginProjectCallableCollection(cache *projectCallableCache, owner *executableBodyOwner, requested ...*ast.SourceFile) *projectCallableCollection {
	collections := make([]projectSourceCollection, 0, len(cache.analyses))
	count := 0
	for _, source := range cache.program.GetSourceFiles() {
		if analysis, known := cache.bySource[source]; known {
			count += len(analysis.facts)
		}
	}
	facts := make([]callableFacts, 0, count)
	for _, source := range cache.program.GetSourceFiles() {
		analysis, known := cache.bySource[source]
		if !known {
			continue
		}
		context := analysis.sourceContext
		if context == nil {
			context = &callableSourceContext{source: source}
		}
		group := projectSourceCollection{context: context, prior: analysis, first: len(facts)}
		for _, fact := range analysis.facts {
			facts = append(facts, cloneProjectCallableFact(fact))
		}
		group.end = len(facts)
		group.syntacticTargets = make(map[string]int, len(context.inventory.syntacticTargets))
		for name, local := range context.inventory.syntacticTargets {
			group.syntacticTargets[name] = group.first + local
		}
		collections = append(collections, group)
	}
	// No fact is appended after this point. Symbols identify actual canonical
	// declarations; source-local syntactic spellings are explicitly rebased above.
	nodes := make(map[*ast.Node]int, len(facts))
	symbols := make(map[ast.SymbolId]int)
	symbolSummaries := make(map[ast.SymbolId]string)
	for i, fact := range facts {
		nodes[fact.node] = i
		if !runtimeModuleEvaluation(fact.node) && !ast.IsGetAccessorDeclaration(fact.node) && !ast.IsSetAccessorDeclaration(fact.node) {
			if symbol := callableDeclarationSymbol(fact.node, owner.checker); symbol != nil {
				symbols[ast.GetSymbolId(symbol)] = i
			}
			if binding := sourceCallableBinding(fact.node); binding != nil {
				if symbol := owner.checker.GetSymbolAtLocation(binding.Name()); symbol != nil {
					symbols[ast.GetSymbolId(symbol)] = i
				}
			}
		}
	}
	for _, group := range collections {
		// Preserve the factory's actual local alias choices, not merely name matches.
		for symbol, local := range group.context.inventory.symbolTargets {
			symbols[symbol] = group.first + local
		}
		bindCallableAliases(group.context.source, symbols, owner.checker)
		bindSyntacticCallableAliases(group.context.source, group.syntacticTargets, symbols, owner.checker)
	}
	for symbol, index := range symbols {
		symbolSummaries[symbol] = facts[index].summary.ID
	}
	bySource := make(map[*ast.SourceFile]*projectSourceCollection, len(collections))
	for i := range collections {
		bySource[collections[i].context.source] = &collections[i]
	}
	collection := &projectCallableCollection{cache: cache, owner: owner, sources: collections, facts: facts, nodes: nodes, symbols: symbols, symbolSummaries: symbolSummaries, bySource: bySource}
	demand := componentCallableDemand(collection, requested...)
	if demand != nil {
		for _, group := range collections {
			for i := group.first; i < group.end && i < group.first+group.context.canonicalCount; i++ {
				if !demand[i] {
					facts[i] = cloneProjectCallableFact(group.context.inventory.facts[i-group.first])
				}
			}
		}
	}
	collection.work = registerCallableEffectWork(facts, demand)
	// Live writer callbacks must borrow the final work storage. Copying work
	// after publication separates its epoch, IDs and slice headers from the
	// extraction owner even though some source maps still happen to be shared.
	work := &collection.work
	collection.release = registerWriterInputFacts(owner, facts, work)
	work.operationGeneration = owner.values.generation
	for i := range collections {
		group := &collections[i]
		bySource[group.context.source] = group
		for index := group.first; index < group.end; index++ {
			if !group.context.collect && facts[index].staged.ready || index >= group.first+group.context.canonicalCount {
				// A cache descriptor is not re-executed, and generated property metadata
				// has no body. Preserve actual ready=false on an unresolved cached source.
				work.extractionQueue[index].operationDone = true
				if facts[index].staged.ready {
					work.extractionPhases[index] = callableExtractionReady
				}
			}
		}
	}
	return collection
}

func (collection *projectCallableCollection) close() {
	if collection.release != nil {
		collection.release()
		collection.release = nil
	}
}

func (collection *projectCallableCollection) collect() {
	owner := collection.owner
	collections, facts := collection.sources, collection.facts
	nodes := collection.nodes
	work := &collection.work

	// Initializer preflight and its publication owner now run after registry
	// freeze. Direct/per-file collection retains its original ordering.
	for _, group := range collections {
		collect := group.context.collect
		demanded := false
		for _, phase := range work.extractionPhases[group.first:group.end] {
			demanded = demanded || phase != callableExtractionRegistered
			collect = collect || phase == callableExtractionQueued
			if demanded && collect {
				break
			}
		}
		if !demanded {
			continue
		}
		if collect {
			owner.values.index(group.context.source)
			initializers := prepareCallableSourceInitializers(group.context.source, owner)
			for i := group.first; i < group.first+group.context.canonicalCount; i++ {
				entry := initializers[facts[i].node]
				facts[i].initializerDeclaration, facts[i].initializerPlan = entry.declaration, entry.plan
			}
		}
		installBuildingInitializers(owner, group.context.source, facts)
	}
	collection.extractQueued()
	for _, group := range collections {
		if !group.context.collect {
			continue
		}
		for i := group.first; i < group.first+group.context.canonicalCount; i++ {
			if _, component := group.context.inventory.componentByStart[facts[i].node.Pos()]; component {
				facts[i].componentCallableInputs = collectComponentCallableInputs(facts[i].node, owner.checker, owner)
			}
		}
	}
	sealMapInputs(facts, nodes)
}

// extractQueued drains the existing owner after roots or summary consumers
// demand bodies. Late dependencies use the same live publisher interval.
func (collection *projectCallableCollection) extractQueued() {
	owner, facts := collection.owner, collection.facts
	nodes, symbols, bySource := collection.nodes, collection.symbols, collection.bySource
	work := &collection.work
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
		group := bySource[facts[index].sourceFile]
		context := group.context
		if callableIsInteractiveHandler(facts[index].node) {
			facts[index].summary.DirectEffectSources = append(facts[index].summary.DirectEffectSources, environmentSource("browser", "interactive JSX handler", facts[index].summary.Name))
		}
		collectDirectCallableEffects(&facts[index], index, facts, symbols, group.syntacticTargets, nodes, context.source, owner.checker, context.reads, context.writes, context.inventory.importBindings, context.inventory.contextBindings, context.assets, owner, work, publicCallableEffectPurpose(owner))
		work.finishExtraction(facts, index)
	}
}

func (collection *projectCallableCollection) resolve(requested *ast.SourceFile) callableAnalysis {
	cache, owner := collection.cache, collection.owner
	collections, facts := collection.sources, collection.facts
	symbols, symbolSummaries := collection.symbols, collection.symbolSummaries
	work := &collection.work

	// This is exactly the generic merge's existing import/export/selected-body
	// relinker, applied to owned mutable facts before this graph's FIRST resolve.
	linkProjectCallableFacts(facts, symbolSummaries, owner)
	var pending []sourceStagedPending
	for {
		for i := range facts {
			if work.extractionPhases[i] != callableExtractionRegistered {
				for _, target := range facts[i].targets {
					work.demandCallable(target)
				}
			}
		}
		if work.extractionHead < len(work.extractionQueue) {
			collection.extractQueued()
			sealMapInputs(facts, collection.nodes)
		}
		linkProjectCallableFacts(facts, symbolSummaries, owner)
		pending = resolveCallableEffectsWithWork(facts, owner, work)
		if work.extractionHead == len(work.extractionQueue) {
			break
		}
	}
	result := callableAnalysisFromFacts(requested, facts, cache.analyses, owner)
	if len(pending) != 0 {
		result = callableAnalysis{facts: facts, pending: pending}
	}
	if len(result.pending) == 0 {
		if result.bySymbol == nil {
			result.bySymbol = make(map[ast.SymbolId]CallableSummary)
		}
		for symbol, index := range symbols {
			if summary, known := result.byNode[facts[index].node]; known {
				result.bySymbol[symbol] = summary
			}
		}
	}
	// Return source-local index spaces to bySource. The cached descriptions have
	// no mutable summary/publisher ownership shared with the final project graph.
	for _, group := range collections {
		local := make([]callableFacts, 0, group.end-group.first)
		for i := group.first; i < group.end; i++ {
			fact := cloneProjectCallableFact(facts[i])
			fact.targets = nil
			for _, target := range facts[i].targets {
				if target >= group.first && target < group.end {
					fact.targets = append(fact.targets, target-group.first)
				}
			}
			local = append(local, fact)
		}
		context := *group.context
		context.collect = false
		entry := callableAnalysis{facts: local, sourceContext: &context}
		for _, debt := range pending {
			if debt.consumer == nil || ast.GetSourceFileOfNode(debt.consumer) == context.source {
				entry.pending = append(entry.pending, debt)
			}
		}
		if len(entry.pending) == 0 && len(result.pending) == 0 {
			entry = callableAnalysisFromFacts(context.source, local, []callableAnalysis{result})
			entry.sourceContext = &context
		}
		cache.bySource[context.source] = entry
	}
	cache.analyses = cache.analyses[:0]
	for _, source := range cache.program.GetSourceFiles() {
		if analysis, known := cache.bySource[source]; known {
			cache.analyses = append(cache.analyses, analysis)
		}
	}
	cache.merged = result
	return result
}
