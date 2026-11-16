package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// yieldStagedConstructionWriter belongs to writer discovery's handled-pending
// branch, before ordinary reconstruction and its refused-scope fallback. It
// lends the same original ticket/initializing interval as that reconstruction;
// no value, input frame or replacement Get is acquired.
func (query *sourceValueQuery) yieldStagedConstructionWriter(operation *ast.Node, request *sourceWriterInputRequest) bool {
	if query == nil || query.executable == nil || query.executable.project == nil || !query.executable.project.stagedReplacement || request == nil || query.stagedMember == nil || query.stagedMember.yieldConstruction == nil {
		return false
	}
	initializing, prior := query.initializing, query.pendingMemberRequest
	query.initializing, query.pendingMemberRequest = operation, request
	defer func() { query.initializing, query.pendingMemberRequest = initializing, prior }()
	return query.stagedMember.yieldConstruction(operation)
}

// yieldStagedConstructionConsumer lets an original writer-input read wait for
// its already-adopted constructor continuation. This is neither receiver
// completion nor invocation accounting. The actual creating event, exact
// subscription and queued delivery/refresh must all exist in this graph.
func (work *callableEffectWork) yieldStagedConstructionConsumer(facts []callableFacts, query *sourceValueQuery, operation *ast.Node) bool {
	if query == nil || query.owner == nil || query.owner.generation != work.operationGeneration || query.inputs != nil || query.operation != nil || !query.dependenciesOnly {
		return false
	}
	b := query.stagedMember
	if b == nil || !query.liveStagedMemberSource(b, b.get, b.read) {
		return false
	}
	fact := query.currentPendingInvocationSource(operation)
	caller, known := work.memberNodes[query.effectOwner]
	if !known || caller < 0 || caller >= len(facts) || fact != &facts[caller] {
		return false
	}
	occurrence := stagedConstructedOccurrenceAt(fact, operation, query.executable)
	if occurrence == nil {
		return false
	}
	for key, recipe := range work.operationRecipes {
		if !validStagedReflectiveTargetRecipe(recipe) || !recipe.delta.extracted || work.memberCoverageObserved[key] != work.operationGeneration {
			continue
		}
		source := recipe.memberSource.targetSource
		if source.generation != work.operationGeneration || source.sourceCut == (sourceRelativeCut{}) || !sameOperationRequest(source.creating, b.request) || source.construction.consumer != query.effectOwner {
			continue
		}
		possible := false
		for _, site := range occurrence.sites {
			possible = possible || site == source.construction.use
		}
		if !possible {
			continue
		}
		creating := work.operationRecipes[source.creating.producer]
		if !validNativeGetRecipe(creating) || creating.nativeGet.kind != sourceNativeObjectCreate || creating.nativeGet.method != source.method || !sameOperationRequest(creating.nativeGet.request, source.creating) {
			continue
		}
		phase := stagedConstructionRequest(source.construction, "callee")
		rootRecipe, phaseRecipe := work.operationRecipes[source.construction.producer], work.operationRecipes[phase.producer]
		if !validStagedConstructionEffectsRecipe(rootRecipe) || !validStagedConstructionEffectsRecipe(phaseRecipe) || phaseRecipe.constructionEffects.generation != work.operationGeneration || work.passiveConstructionEffectsReady(rootRecipe) {
			continue
		}
		// The sealed path is callee -> original C -> candidate. Requiring a
		// second direct callee edge would invent a different dependency graph.
		coverage := work.operationRecipes[source.parent.producer]
		if !validStagedMemberCoverageRecipe(coverage) || !sameOperationRequest(coverage.memberSource.request, source.parent) {
			continue
		}
		retainedC, retainedTarget := false, false
		for _, child := range phaseRecipe.delta.required {
			retainedC = retainedC || sameOperationRequest(child, source.parent)
		}
		for _, child := range coverage.delta.required {
			retainedTarget = retainedTarget || sameOperationRequest(child, source.request)
		}
		if !retainedC || !retainedTarget {
			continue
		}
		rootID, rootAdopted := work.operationIDs[source.construction.producer]
		phaseID, phaseAdopted := work.operationIDs[phase.producer]
		id, adopted := work.operationIDs[key]
		if !rootAdopted || !phaseAdopted || !adopted || rootID.epoch != work.operationEpoch || phaseID.epoch != work.operationEpoch || id.epoch != work.operationEpoch || rootID.index == 0 || phaseID.index == 0 || id.index == 0 || int(rootID.index) >= len(work.operations) || int(phaseID.index) >= len(work.operations) || int(id.index) >= len(work.operations) {
			continue
		}
		state := &work.operations[id.index]
		reading := stagedReflectiveTargetReading(source)
		subscriber := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
		if work.operations[rootID.index].invalid || work.operations[phaseID.index].invalid || state.invalid || state.revision == 0 || !state.delta.extracted || subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, reading) {
			continue
		}
		for _, task := range work.extractionQueue[work.extractionHead:] {
			if !task.operationDone && (task.operation == phaseID && !task.delivery || task.operation == id && task.delivery && state.deliveryQueued) {
				return true
			}
		}
	}
	return false
}
