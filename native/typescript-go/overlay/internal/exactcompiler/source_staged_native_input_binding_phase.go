package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// The selected owner enrolls the original DATA reading before either phase is
// adopted. This description needs no completed Get; the later reducer does.
func (work *callableEffectWork) admitNativeInputBinding(facts []callableFacts, source *sourceStagedNativeGetSource, plan sourceStagedNativeInputPlan, owner *executableBodyOwner) bool {
	reading, registered := work.prepareNativeInputBinding(facts, plan.request, plan.input.expression, owner)
	if !registered || !sameOperationRequest(reading, plan.bindingData) {
		return false
	}
	for _, role := range []string{"algorithm", "eager-inputs"} {
		key := nativeRootDebtRequest(source, role).producer
		recipe, known := work.operationRecipes[key]
		if !known || !sameNativeGetSource(recipe.nativeGet, source) {
			return false
		}
		attached := *recipe.nativeGet
		attached.input = &plan
		recipe.nativeGet = &attached
		recipe.delta = cloneOperationDelta(recipe.delta)
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, reading)
		if !work.attachOperationSource(facts, recipe) {
			return false
		}
	}
	return true
}

// Phase envelopes preserve the Identifier's DATA cut and a separate original
// initializer Effects request. No current value or source selection follows.
func validNativeInputBindingPhase(recipe sourceStagedOperationRecipe) bool {
	source := recipe.nativeGet
	if source == nil || source.input == nil || !validNativeInputBindingPlan(*source.input, source) || recipe.key != nativeRootDebtRequest(source, "algorithm").producer && recipe.key != nativeRootDebtRequest(source, "eager-inputs").producer || len(recipe.delta.required) < 1 || len(recipe.delta.required) > 2 || operationDeltaSize(recipe.delta) != len(recipe.delta.required) || !sameOperationRequest(recipe.delta.required[0], source.input.bindingData) {
		return false
	}
	if len(recipe.delta.required) == 1 {
		return !recipe.delta.extracted
	}
	child := recipe.delta.required[1]
	call := child.producer.operation
	return call != nil && ast.IsCallExpression(call) && child.producer.declaration != nil && sourceStagedOccurrenceOwned(call, child.producer.declaration) && child.producer.kind == relativeDemandEffects && child.producer.selector == (sourceStagedOperationSelector{}) && child.consumer == child.producer.declaration && child.use == call && child.edge != "" && child.inputs == nil && child.reading == (sourceStagedOperationKey{}) && child.cut == (sourceRelativeCut{operation: call, use: call, reading: call})
}

func (work *callableEffectWork) currentNativeInputBindingGet(source *sourceStagedNativeGetSource) bool {
	if source == nil || source.input == nil || !validNativeInputBindingPlan(*source.input, source) || work.operationGeneration == nil {
		return false
	}
	id, known := work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
	if !known || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	proof := state.nativeCallee
	return !state.invalid && state.dependenciesRegistered && proof != nil && proof.generation == work.operationGeneration && validStagedNativeCalleeEffects(*proof, source)
}

// A cached reading is not an event. Only the adopted original parent Get can
// renew source transport in this graph; its selection remains independent of
// binding DATA and of complete initializer Effects closure.
func (work *callableEffectWork) freshNativeInputBindingReading(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	if source == nil || source.generation != work.operationGeneration {
		return false
	}
	for i, reading := range source.readings {
		if i >= len(source.readCuts) || !validNativeInputBindingReading(source, reading, source.readCuts[i]) {
			continue
		}
		parent := work.operationRecipes[reading.reading]
		if validNativeInputBindingPhase(parent) && sameOperationRequest(parent.nativeGet.input.bindingData, reading) && work.currentNativeInputBindingGet(parent.nativeGet) {
			return true
		}
	}
	return false
}

// All delivered MAY alternatives must be the genuine original initializer
// endpoint. Unknown, mixed, projected or authored results cannot pay this law.
func (work *callableEffectWork) nativeInputBindingResult(recipe sourceStagedOperationRecipe) (*sourceStagedNativeGetSource, bool) {
	if !validNativeInputBindingPhase(recipe) || !work.currentNativeInputBindingGet(recipe.nativeGet) {
		return nil, false
	}
	source := recipe.nativeGet
	delivery, current := work.inputBindingData(work.operationFacts, source.input.request, source.input.bindingData)
	if !current || !delivery.delta.extracted || len(delivery.delta.exposures) == 0 || len(delivery.delta.invoked)+len(delivery.delta.relative)+len(delivery.delta.effects)+len(delivery.delta.residuals) != 0 {
		return nil, false
	}
	binding := work.operationRecipes[source.input.bindingData.producer].callResult.binding
	if binding == nil || binding.Initializer() == nil || !ast.IsCallExpression(binding.Initializer()) {
		return nil, false
	}
	var result *sourceStagedNativeGetSource
	for _, alternative := range delivery.delta.exposures {
		endpoint := alternative.endpoint
		if alternative.creating != nil || endpoint.kind != relativeEndpointExpression || endpoint.expression != binding.Initializer() || endpoint.producer != endpoint.expression || endpoint.get != nil || endpoint.creation != nil || endpoint.returning != nil || len(endpoint.projection) != 0 {
			return nil, false
		}
		owner := sourceStagedEvaluationOwner(endpoint.expression)
		if owner == nil {
			owner = sourceStagedModuleOwner(endpoint.expression)
		}
		root := work.currentNativeResultRoot(sourceStagedOperationKey{declaration: owner, operation: endpoint.expression, kind: relativeDemandEffects})
		if root == nil || endpoint.cut != root.request.cut || !work.nativeOrdinaryTargetResult(root.request) || result != nil && !sameOperationRequest(result.request, root.request) {
			return nil, false
		}
		result = root
	}
	return result, result != nil
}

func (work *callableEffectWork) nativeInputBindingPhaseCurrent(recipe sourceStagedOperationRecipe) bool {
	root, current := work.nativeInputBindingResult(recipe)
	return current && recipe.delta.extracted && len(recipe.delta.required) == 2 && sameOperationRequest(recipe.delta.required[1], root.request)
}

// This existing phase task reduces cumulative APPLIED DATA. It does not rerun
// the parent Get or execute an initializer, collector, binder or application.
func (work *callableEffectWork) prepareNativeInputBindingPhase(facts []callableFacts, id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !state.dependenciesRegistered || !validNativeInputBindingPhase(recipe) {
		return
	}
	root, current := work.nativeInputBindingResult(recipe)
	if !current {
		return
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, root.request)
	recipe.delta.extracted = true
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, recipe.delta)
	}
}

func (work *callableEffectWork) queueNativeInputBindingTask(key sourceStagedOperationKey) {
	id, adopted := work.operationIDs[key]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	if state.invalid || !state.dependenciesRegistered {
		return
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery {
			return
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[key.declaration], operation: id})
}

func (work *callableEffectWork) queueNativeInputBindingPhases(root *sourceStagedNativeGetSource) {
	if root == nil {
		return
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer]
	if !validNativeInputBindingPhase(algorithm) {
		return
	}
	for _, role := range []string{"algorithm", "eager-inputs"} {
		work.queueNativeInputBindingTask(nativeRootDebtRequest(root, role).producer)
	}
	work.queueNativeInputBindingTask(algorithm.nativeGet.input.bindingData.producer)
}

func (work *callableEffectWork) afterNativeInputBindingDelivery(id sourceStagedOperationID, reading sourceStagedOperationRequest) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	source := work.operationRecipes[state.key].callResult
	parent := work.operationRecipes[reading.reading]
	if source == nil || !validNativeInputBindingPhase(parent) || !validNativeInputBindingReading(source, reading, parent.nativeGet.input.request.cut) || !sameOperationRequest(parent.nativeGet.input.bindingData, reading) {
		return
	}
	subscriber := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	if subscriber != nil && !subscriber.blocked && state.revision != 0 && subscriber.applied == state.revision && sameOperationRequest(subscriber.request, reading) {
		work.queueNativeInputBindingPhases(parent.nativeGet)
	}
}
