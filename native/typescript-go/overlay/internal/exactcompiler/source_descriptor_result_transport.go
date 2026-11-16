package exactcompiler

// validDescriptorViewPayload checks a detached source operator only. Actual
// native selection and all input/return DATA readers are checked separately by
// the current graph. It grants no normal/raw object or invocation authority.
func validDescriptorViewPayload(view *sourceNativeDescriptorView) bool {
	if view == nil || view.method == nil || view.source.generation == nil {
		return false
	}
	for position, input := range view.inputs {
		if !validDescriptorInputData(&view.source, position, input) {
			return false
		}
	}
	return true
}

func descriptorDataPayloadPresent(delta sourceStagedOperationDelta) bool {
	for _, alternative := range delta.exposures {
		if alternative.endpoint.kind == relativeEndpointDescriptorView {
			return true
		}
	}
	return false
}

// descriptorViewSourceCurrent keeps the original native producer distinct from
// any outer authored return reader. A typed outer payload cannot authenticate a
// method, a native input snapshot or a contextual source binding by itself.
func (work *callableEffectWork) descriptorViewSourceCurrent(view *sourceNativeDescriptorView) bool {
	if !validDescriptorViewPayload(view) || view.source.generation != work.operationGeneration {
		return false
	}
	key := stagedCallResultRequest(view.source.request.producer.operation, view.source.request.producer.declaration).producer
	recipe, present := work.operationRecipes[key]
	if !present || !work.nativeDescriptorResultCurrent(recipe) || !sameDescriptorRetrieval(recipe.callResult.nativeDescriptor, &view.source) || recipe.delta.exposures[0].endpoint.descriptorView.method != view.method {
		return false
	}
	return work.descriptorViewInputDataCurrent(view)
}

// currentDeliveredDescriptorViews consumes this actual source reader, including
// an authored return forwarding a native view. Inner native identity is never
// retargeted to the enclosing Call. Mixed/unhandled payloads remain pending.
func (work *callableEffectWork) currentDeliveredDescriptorViews(facts []callableFacts, q *sourceValueQuery, recipe sourceStagedOperationRecipe) ([]sourceNativeDescriptorView, sourceStagedOperationRequest) {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || recipe.callResult == nil || recipe.callResult.generation != work.operationGeneration || !validStagedCallResultRecipe(recipe) || !recipe.delta.extracted {
		return nil, sourceStagedOperationRequest{}
	}
	for index, reading := range recipe.callResult.readings {
		if reading.consumer != b.request.consumer {
			continue
		}
		cut := recipe.callResult.readCuts[index]
		if cut != b.observation && (!memberReceiverCutsCorrespond(b.request, b.observation, cut) || cut != b.request.cut) {
			continue
		}
		views, represented := work.currentDeliveredDescriptorViewsAtReading(recipe, reading, b.request, cut)
		if len(views) != 0 {
			if !represented {
				b.represented = false
			}
			return views, reading
		}
	}
	return nil, sourceStagedOperationRequest{}
}

// currentDeliveredDescriptorViewsAtReading returns only detached typed DATA
// from the exact current registered reader. Preparation grants no Get/C rights;
// the actual accessor visitor must still own any resulting field observation.
func (work *callableEffectWork) currentDeliveredDescriptorViewsAtReading(recipe sourceStagedOperationRecipe, reading, parent sourceStagedOperationRequest, cut sourceRelativeCut) ([]sourceNativeDescriptorView, bool) {
	registered, present := work.operationRecipes[recipe.key]
	if !present || reading.producer != recipe.key || !sameStagedCallResultSource(registered.callResult, recipe.callResult) || work.operationGeneration == nil || !work.operationGeneration.active || work.operationGeneration.project == nil || work.operationGeneration.project.activeGeneration != work.operationGeneration || registered.callResult == nil || registered.callResult.generation != work.operationGeneration || !validStagedCallResultRecipe(registered) || !registered.delta.extracted || !work.stagedMemberResultReading(reading, parent, cut) {
		return nil, false
	}
	recipe = registered
	id, adopted := work.operationIDs[recipe.key]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 {
		return nil, false
	}
	closed := work.closedOperationDependencies()
	if int(id.index) >= len(closed) || !closed[id.index] {
		return nil, false
	}
	data, applied := work.stagedCallResultData(reading)
	if !applied || !data.delta.extracted || len(data.delta.exposures) == 0 {
		return nil, false
	}
	var views []sourceNativeDescriptorView
	represented := true
	for _, alternative := range data.delta.exposures {
		if alternative.creating == nil && alternative.endpoint.kind == relativeEndpointUndefined {
			continue
		}
		view := alternative.endpoint.descriptorView
		if alternative.creating != nil || alternative.endpoint.kind != relativeEndpointDescriptorView || !work.descriptorViewSourceCurrent(view) || !work.descriptorPayloadChild(recipe, view, nil) {
			represented = false
			continue
		}
		copy := projectNativeDescriptorView(*view, nil)
		copy.delivery = reading
		views = append(views, copy)
	}
	return views, represented
}

// descriptorViewDataEqual compares source relationships, not the temporary
// reader attached by a later genuine transfer. Neither payload authenticates
// that reader; its registered/APPLIED request is checked separately.
func descriptorViewDataEqual(a, b *sourceNativeDescriptorView) bool {
	if a == nil || b == nil {
		return false
	}
	left, right := projectNativeDescriptorView(*a, nil), projectNativeDescriptorView(*b, nil)
	left.delivery, right.delivery = sourceStagedOperationRequest{}, sourceStagedOperationRequest{}
	return sameNativeDescriptorView(&left, &right)
}

// descriptorPayloadChild follows only actual required DATA deliveries matching
// this source payload. It never searches unrelated operations for a convenient
// current native result. Cycles without an original native producer stay pending.
func (work *callableEffectWork) descriptorPayloadChild(recipe sourceStagedOperationRecipe, view *sourceNativeDescriptorView, path []sourceStagedOperationKey) bool {
	if view == nil || recipe.callResult == nil || !validStagedCallResultRecipe(recipe) || recipe.callResult.generation != work.operationGeneration {
		return false
	}
	for _, prior := range path {
		if prior == recipe.key {
			return false
		}
	}
	path = append(path, recipe.key)
	if recipe.callResult.nativeDescriptor != nil {
		return work.nativeDescriptorResultCurrent(recipe) && len(recipe.delta.exposures) == 1 && descriptorViewDataEqual(recipe.delta.exposures[0].endpoint.descriptorView, view)
	}
	expected := projectNativeDescriptorView(*view, nil)
	if recipe.callResult.operand != nil {
		if !work.currentStagedResultAssociation(work.operationFacts, recipe.callResult) {
			return false
		}
		for position, input := range expected.inputs {
			if application := input.application; application != nil && sameOperationRequest(application.request, recipe.callResult.request) {
				if application.prior == nil || !work.descriptorInputApplicationCurrent(&view.source, position, input) {
					return false
				}
				expected.inputs[position] = cloneDescriptorInputData(*application.prior)
			}
		}
	}
	for _, required := range recipe.delta.required {
		child, registered := work.operationRecipes[required.producer]
		if !registered || child.callResult == nil {
			continue
		}
		data, applied := work.stagedCallResultData(required)
		if !applied || !data.delta.extracted {
			continue
		}
		for _, alternative := range data.delta.exposures {
			if alternative.creating == nil && alternative.endpoint.kind == relativeEndpointDescriptorView && descriptorViewDataEqual(alternative.endpoint.descriptorView, &expected) && work.descriptorPayloadChild(child, &expected, path) {
				return true
			}
		}
	}
	return false
}
