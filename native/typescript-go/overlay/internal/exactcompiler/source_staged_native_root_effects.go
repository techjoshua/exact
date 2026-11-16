package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeCalleeEffects is issued only after the original Get owner
// has finished its source alternatives. A selected prefix alone cannot create
// it. Live and graph cuts stay separate, and neither is a normal method receipt.
type sourceStagedNativeCalleeEffects struct {
	noUserEntry bool // actual source Get executes no user body, separate from empty Effects
	request     sourceStagedOperationRequest
	cut         sourceRelativeCut
	method      *ast.Node
	generation  *projectGeneration
}

// stagedNativeCalleeEffectsRepresented admits the first input-independent Get
// domain. Acquired values describe this callee selection, not invocation output.
// Authored/unknown siblings and any untransferred effect keep the role pending.
// Descriptor integrity/NoWrites metadata is deliberately not a prerequisite.
func stagedNativeCalleeEffectsRepresented(selected sourceValue, result *accessorCandidates) bool {
	if result == nil || selected.native == nil || result.opaque || result.valueIncomplete || result.receiverIncomplete || result.fieldReceiverIncomplete || result.ownOperation || len(result.values) == 0 {
		return false
	}
	if len(result.environmentEffects)+len(result.contextEffects)+len(result.effects)+len(result.fieldFallbacks)+len(result.callFallbacks)+len(result.fieldCalls)+len(result.reflective)+len(result.nativeCalls)+len(result.normalCalls)+len(result.inputs)+len(result.writeBodies)+len(result.writes)+len(result.accessorMutations)+len(result.ordinaryBodies)+len(result.descriptorFallbacks) != 0 {
		return false
	}
	for _, value := range result.values {
		if value.node != selected.node || value.native == nil || value.native.kind != selected.native.kind || value.native.acquired != selected.native.acquired || value.native.referencesIncomplete || len(value.path) != 0 {
			return false
		}
	}
	return true
}

func validStagedNativeCalleeEffects(proof sourceStagedNativeCalleeEffects, source *sourceStagedNativeGetSource) bool {
	if source == nil {
		return false
	}
	call := source.request.producer.operation
	var use *ast.Node
	if runtimeModuleEvaluation(source.request.producer.declaration) {
		if !sourceStagedOccurrenceOwned(call, source.request.producer.declaration) {
			return false
		}
		use = call // Original module observation, never a declaration-relative nil use.
	}
	return proof.generation != nil && stagedNativeAlgorithmKind(source.kind) && sameOperationRequest(proof.request, nativeRootDebtRequest(source, "callee-get")) && proof.method != nil && proof.method == source.method && standardLibrarySource(ast.GetSourceFileOfNode(proof.method)) && proof.cut.operation == call && proof.cut.reading == call && proof.cut.initializing == call && proof.cut.use == use && proof.cut.invoking == nil && proof.cut.returning == nil
}

// currentNativeCalleeEffects reads only the admitted receipt for this exact
// source in the current graph. It creates no observation or selection rights.
func (work *callableEffectWork) currentNativeCalleeEffects(source *sourceStagedNativeGetSource) *sourceStagedNativeCalleeEffects {
	if source == nil {
		return nil
	}
	id, known := work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
	if !known || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil
	}
	proof := work.operations[id.index].nativeCallee
	if proof == nil || proof.generation != work.operationGeneration || !validStagedNativeCalleeEffects(*proof, source) {
		return nil
	}
	return proof
}

// admitNativeCalleeEffects consumes the live original-owner handoff. Static
// metadata validation alone is not a caller-facing admission API.
func (work *callableEffectWork) admitNativeCalleeEffects(facts []callableFacts, source *sourceStagedNativeGetSource, proof sourceStagedNativeCalleeEffects) bool {
	if source == nil || !validStagedNativeCalleeEffects(proof, source) {
		return false
	}
	request := proof.request
	recipe, registered := work.operationRecipes[request.producer]
	if !registered || !sameNativeGetSource(recipe.nativeGet, source) {
		return false
	}
	id, requested := work.operationIDs[request.producer]
	if !requested || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	if proof.generation != work.operationGeneration {
		return false
	}
	if prior := state.nativeCallee; prior != nil && (prior.generation != proof.generation || prior.cut != proof.cut || prior.method != proof.method || !sameOperationRequest(prior.request, proof.request)) {
		return false
	}
	delta := cloneOperationDelta(recipe.delta)
	delta.extracted = true
	if !operationDeltaPrefix(state.delta, delta) {
		return false
	}
	if state.nativeCallee != nil && state.delta.extracted && operationDeltaCursor(state.delta) == operationDeltaCursor(delta) {
		work.admitNativeEagerWitness(source, proof)
		work.queueDescriptorSource(facts, source)
		return true
	}
	state.nativeCallee = &proof
	state.delta = delta
	work.admitNativeEagerWitness(source, proof)
	state.revision++
	work.notifyOperationSubscribers(state)
	work.queueReflectiveResults(source)
	work.queueNativeInputBindingPhases(source)
	work.notifyNativeWriterSourceRequests(facts, work.operationRecipes[source.request.producer].nativeGet)
	work.queueDescriptorSource(facts, source)
	return true
}

func (work *callableEffectWork) admitNativeEagerEffects(facts []callableFacts, source *sourceStagedNativeGetSource, selection sourceStagedNativeSelection, owner *executableBodyOwner) bool {
	proof, described := describeStagedNativeEagerInputs(selection)
	if !described {
		proof, described = describeStagedNativeEagerCallInputs(selection, &facts[work.memberNodes[source.request.consumer]], owner)
	}
	if !described {
		proof, described = describeStagedNativeEagerCallPrefix(selection, &facts[work.memberNodes[source.request.consumer]], owner)
	}
	if !described {
		proof, described = describeStagedNativeReflectiveInputs(selection, &facts[work.memberNodes[source.request.consumer]], owner)
	}
	if !described {
		proof, described = work.describeStagedNativeDescriptorInputs(facts, selection, &facts[work.memberNodes[source.request.consumer]], owner)
	}
	var key *sourceStagedKeySource
	if !described {
		key = work.describeNativeEagerKey(source, selection, owner)
		if key != nil {
			proof, described = describeStagedNativeReflectiveKeyInputs(selection, &facts[work.memberNodes[source.request.consumer]], owner, key)
		}
	}
	if !described {
		return false
	}
	recipe, registered := work.operationRecipes[proof.request.producer]
	// The selected root identifies the operation, while this phase owns its
	// original operand anchors and eager plan. Validate against that snapshot.
	if !registered || !sameNativeGetSource(recipe.nativeGet, source) {
		return false
	}
	attached := *recipe.nativeGet
	attached.eager = &proof
	if key != nil {
		attached.keySources = []sourceStagedKeySource{*key}
	}
	if !validStagedNativeEagerInputs(proof, &attached) {
		return false
	}
	recipe.nativeGet, recipe.delta.extracted = &attached, len(proof.calls) == 0 && len(proof.operations) == 0 && !proof.targetPending && len(attached.keySources) == 0
	if key != nil && proof.targetPending {
		target := nativeEagerTargetRequest(&attached)
		if _, exists := work.operationRecipes[target.producer]; !exists && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: target.producer, nativeGet: &attached}) {
			return false
		}
	}
	if proof.descriptorData.producer.operation != nil || key != nil {
		recipe.delta.required = nativeEagerRequired(&attached)
	}
	if !work.admitNativeRootEffects(facts, recipe) {
		return false
	}
	work.enrollNativeEagerKey(facts, recipe)
	return true
}

// admitNativeRootEffects commits one independently authenticated source phase.
// Empty atoms are allowed only by the corresponding original-owner proof, never
// by an empty result/map or the readiness of fields and other root roles.
func (work *callableEffectWork) admitNativeRootEffects(facts []callableFacts, recipe sourceStagedOperationRecipe) bool {
	prior, exists := work.operationRecipes[recipe.key]
	if !exists || !validNativeGetRecipe(recipe) || !sameNativeGetSource(prior.nativeGet, recipe.nativeGet) {
		return false
	}
	if operationDeltaSize(prior.delta) != 0 || prior.delta.extracted {
		return prior.delta.extracted == recipe.delta.extracted && operationDeltaPrefix(prior.delta, recipe.delta) && operationDeltaPrefix(recipe.delta, prior.delta) && sameOperationRequest(prior.nativeGet.inputSource, recipe.nativeGet.inputSource)
	}
	return work.attachOperationSource(facts, recipe)
}

func (work *callableEffectWork) publishNativeRootEffects(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if !validNativeGetRecipe(recipe) || !recipe.delta.extracted || operationDeltaSize(recipe.delta) != 0 || recipe.key.selector.field != "callee-get" && recipe.key.selector.field != "eager-inputs" && !(recipe.key.selector.field == "algorithm" && recipe.nativeGet.input != nil) {
		return false
	}
	return work.publishSourceDisposition(id)
}

// consumeNativeCalleeSource constructs the original source demand once for this
// graph/generation. It never retains or replays a saved query. Cached source
// templates keep only their conditional standard branch, not this Get result.
func (work *callableEffectWork) consumeNativeCalleeSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	state := &work.operations[id.index]
	if state.nativeCallee != nil {
		if state.nativeCallee.generation != owner.values.generation {
			state.invalid = true
		}
		return
	}
	if state.calleeSourceRequested {
		return
	}
	state.calleeSourceRequested = true
	source := work.operationRecipes[state.key].nativeGet
	if source == nil || source.request.producer.declaration == nil || owner.values.program.GetSourceFile(ast.GetSourceFileOfNode(source.get).FileName()) != ast.GetSourceFileOfNode(source.get) {
		return
	}
	work.observeNativeCalleeSource(facts, source, owner, nil)
}

// observeNativeCalleeSource always creates a fresh original source query. Only
// an applied parent-specific target revision supplies a physical refresh cut;
// ordinary extraction continues to use its existing one-shot entry above.
func (work *callableEffectWork) observeNativeCalleeSource(facts []callableFacts, source *sourceStagedNativeGetSource, owner *executableBodyOwner, cut *sourceRelativeCut, observations ...*sourceStagedNativeObservation) bool {
	if len(observations) > 1 || cut != nil && (len(observations) != 1 || observations[0] == nil || observations[0].observer.cut != *cut) || cut == nil && len(observations) != 0 {
		return false
	}
	query := newSourceDependencyQuery(source.request.producer.operation, owner.checker, owner, source.request.consumer)
	if cut != nil {
		query.reading, query.initializing, query.returning, query.invoking = cut.reading, cut.initializing, cut.returning, cut.invoking
		query.dependencyUse = cut.use
		if query.relativeInputCut(cut.operation) != *cut {
			return false
		}
	}
	defer query.publishDependencyStatistics()
	request := sourceStagedNativeRequest{algorithmKind: source.kind, call: source.request.producer.operation, get: source.get, request: source.request}
	if len(observations) == 1 {
		request.observation = observations[0]
	}
	revoke, installed := query.beginStagedNativeGetSource(work, facts, request)
	if !installed {
		return false
	}
	defer revoke()
	query.receiverCandidates(request.call, nil)
	return query.stagedNativeGet != nil && query.stagedNativeGet.sourceObserved
}
