package exactcompiler

// nativeWriterSourceCallerPendingOwned recognizes only the canonical readiness
// continuation which finishExtraction resumes through the existing native source
// notification. The adopted request remains unpaid: this owns compiler work,
// never a selected method, Get observation, scope exclusion or normal value.
func (work *callableEffectWork) nativeWriterSourceCallerPendingOwned(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operationGeneration == nil || !work.operationGeneration.active {
		return false
	}
	state := &work.operations[id.index]
	recipe, described := work.operationRecipes[state.key]
	if !described || work.operationIDs[state.key] != id || state.invalid || !state.dependenciesRegistered || state.delta.extracted || recipe.delta.extracted || !nativeWriterScopeRequested(recipe) || !validStagedMemberCallRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration {
		return false
	}
	request := recipe.memberSource.request
	caller, known := work.memberNodes[recipe.key.declaration]
	if !known || caller < 0 || caller >= len(work.operationFacts) || caller >= len(work.extractionPhases) || work.operationFacts[caller].node != recipe.key.declaration || work.operationFacts[caller].sourceFile == nil || work.operationFacts[caller].staged.ready || request.producer != state.key || request.consumer != recipe.key.declaration {
		return false
	}
	// The real C/preparation reader can be the only subscriber. Describing a
	// producer never implies enrollment of its canonical self-request.
	enrolled := work.nativeWriterReadinessSubscriber(recipe, state, request)
	if !enrolled {
		for _, consumer := range state.subscriberOrder {
			subscriber := state.subscribers[consumer]
			if subscriber != nil && work.nativeWriterReadinessSubscriber(recipe, state, subscriber.request) {
				enrolled = true
				break
			}
		}
	}
	if !enrolled {
		return false
	}
	// A retained queue row before the head is historical. Only the live canonical
	// extraction owner or a still-future canonical task can supply this wake.
	if work.extractionPhases[caller] == callableExtractionRunning {
		return work.extracting == caller || work.operationCanonical.live(work, id, caller)
	}
	if work.extractionPhases[caller] != callableExtractionQueued || work.extractionHead < 0 || work.extractionHead > len(work.extractionQueue) {
		return false
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.callable == caller && task.operation == (sourceStagedOperationID{}) && !task.operationDone && !task.delivery && task.nativeInputReading == (sourceStagedOperationRequest{}) && task.nativeInputRevision == 0 && task.nativeTargetRevision == 0 {
			return true
		}
	}
	return false
}

// nativeWriterReadinessSubscriber validates only this producer's actual unpaid
// enrollment. Current SOURCE/localX/APPLIED remain independent; the caller has
// already refused completed state and recipe. Canonical lookup is O(1), and the
// fallback visits only this state's finite subscribers, reusing existing typed
// reader validators; it acquires no source and creates no enrollment.
func (work *callableEffectWork) nativeWriterReadinessSubscriber(recipe sourceStagedOperationRecipe, state *sourceStagedOperationState, request sourceStagedOperationRequest) bool {
	if state == nil || recipe.memberSource == nil || request.producer != state.key || recipe.key != state.key || state.invalid || !state.dependenciesRegistered || state.delta.extracted || recipe.delta.extracted {
		return false
	}
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, request) {
		return false
	}
	if sameOperationRequest(request, recipe.memberSource.request) {
		return true
	}
	if request.reading == (sourceStagedOperationKey{}) || request.reading == state.key {
		return false
	}
	return work.describedWriterSourceReading(request) || work.acceptedGetPreparationSourceReading(request)
}
