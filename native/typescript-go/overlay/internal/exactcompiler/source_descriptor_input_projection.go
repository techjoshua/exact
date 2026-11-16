package exactcompiler

// sourceDescriptorInputApplication describes one original return-operand
// composition. It retains source associations and DATA readers, never a query,
// acquired scope, normal frame, observation token or permission to invoke.
// prior preserves the native input snapshot; composition does not rewrite it.
type sourceDescriptorInputApplication struct {
	request     sourceStagedOperationRequest
	association sourceStagedDeclarationCall
	generation  *projectGeneration
	prior       *sourceDescriptorInputData
	readings    []sourceStagedOperationRequest
	pending     bool
}

func cloneDescriptorInputApplication(a *sourceDescriptorInputApplication) *sourceDescriptorInputApplication {
	if a == nil {
		return nil
	}
	copy := *a
	copy.association.invocation = cloneStagedWriterInvocation(a.association.invocation)
	copy.readings = append([]sourceStagedOperationRequest(nil), a.readings...)
	if a.prior != nil {
		prior := cloneDescriptorInputData(*a.prior)
		copy.prior = &prior
	}
	return &copy
}

func sameDescriptorInputApplication(a, b *sourceDescriptorInputApplication) bool {
	return a == b || a != nil && b != nil && a.generation == b.generation && a.pending == b.pending && sameOperationRequest(a.request, b.request) && a.association.inputs == b.association.inputs && a.association.sourceInputs == b.association.sourceInputs && sameSourceRelativeInvocation(a.association.invocation, b.association.invocation) && len(a.readings) == len(b.readings) && operationPrefix(a.readings, b.readings, sameOperationRequest) && a.prior != nil && b.prior != nil && sameDescriptorInputData(*a.prior, *b.prior)
}

func descriptorInputApplicationSeen(input sourceDescriptorInputData, request sourceStagedOperationRequest) bool {
	for a := input.application; a != nil; {
		if sameOperationRequest(a.request, request) {
			return true
		}
		if a.prior == nil {
			break
		}
		a = a.prior.application
	}
	return false
}

func validDescriptorInputApplication(a *sourceDescriptorInputApplication, input sourceDescriptorInputData) bool {
	return a != nil && a.prior != nil && a.generation != nil && a.generation.active && a.request.producer.selector.field == "return-operand" && a.request.producer.operation == a.association.invocation.operation && a.association.invocation.declaration != nil && validStagedDataResultCall(a.association) && sameOperationRequest(input.request, a.prior.request) && input.construction == a.prior.construction
}

// projectDescriptorInputBindings only substitutes roles owned by this exact
// original selected declaration. Its caller supplies actual DATA readers. Other
// owners stay symbolic; unsupported nested carriers stay pending, never raw.
func projectDescriptorInputBindings(input sourceDescriptorInputData, source *sourceStagedCallResultSource, read func(sourceRelativeEndpoint) (sourceStagedOperationRequest, sourceStagedOperationDelta, bool), literal func(sourceRelativeEndpoint) bool) (sourceDescriptorInputData, []sourceStagedOperationRequest, bool) {
	out := cloneDescriptorInputData(input)
	out.alternatives = nil
	var required []sourceStagedOperationRequest
	changed, represented := false, true
	for _, alternative := range input.alternatives {
		values, children, complete, matched := projectStagedReturnRoleSources(alternative, source, func(endpoint sourceRelativeEndpoint) (sourceStagedOperationRequest, sourceStagedOperationDelta, bool) {
			request, data, applied := read(endpoint)
			return request, data, applied && len(data.exposures) != 0
		}, literal)
		if !matched {
			out.alternatives = append(out.alternatives, cloneOperationDelta(sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{alternative}}).exposures...)
			continue
		}
		changed = true
		if descriptorInputApplicationSeen(input, source.request) {
			complete = false
			values = nil
		}
		out.alternatives = append(out.alternatives, values...)
		represented = represented && complete
		for _, child := range children {
			required = appendEntryLawRequirement(required, child)
		}
	}
	if !changed {
		return cloneDescriptorInputData(input), nil, true
	}
	prior := cloneDescriptorInputData(input)
	out.application = &sourceDescriptorInputApplication{request: source.request, association: source.association, generation: source.generation, prior: &prior, readings: required, pending: !represented}
	return out, required, represented
}

// projectDescriptorReturnInputs runs on the existing return-operand queue. The
// original registered Call association authorizes its own role composition;
// each Identifier/Get/Call operand still needs its genuine input DATA reader.
func (work *callableEffectWork) projectDescriptorReturnInputs(facts []callableFacts, source *sourceStagedCallResultSource, view sourceNativeDescriptorView, owner *executableBodyOwner) (sourceNativeDescriptorView, []sourceStagedOperationRequest, bool) {
	if source == nil || owner == nil || owner.values == nil || source.operand == nil || source.generation != work.operationGeneration || !work.currentStagedResultAssociation(facts, source) {
		return view, nil, false
	}
	if _, known := work.memberNodes[source.request.producer.declaration]; !known {
		return view, nil, false
	}
	out := projectNativeDescriptorView(view, nil)
	var required []sourceStagedOperationRequest
	represented := true
	for position, input := range view.inputs {
		projected, children, complete := projectDescriptorInputBindings(input, source, func(endpoint sourceRelativeEndpoint) (sourceStagedOperationRequest, sourceStagedOperationDelta, bool) {
			return work.readStagedReturnInput(facts, source, endpoint, owner, true)
		}, func(endpoint sourceRelativeEndpoint) bool {
			return stagedSourceDataValue(endpoint.expression) && !stagedCallReturnLiteralHasCapture(endpoint.expression, owner.values)
		})
		out.inputs[position] = projected
		represented = represented && complete
		for _, child := range children {
			required = appendEntryLawRequirement(required, child)
		}
	}
	return out, required, represented
}

// descriptorInputApplicationCurrent validates source association and currently
// APPLIED readers only. It never registers a producer or enters a body. Outer
// operation closure retains all original and newly composed required children.
func (work *callableEffectWork) descriptorInputApplicationCurrent(source *sourceStagedDescriptorRetrieval, position int, input sourceDescriptorInputData) bool {
	a := input.application
	if !validDescriptorInputApplication(a, input) || a.pending || a.generation != work.operationGeneration || !work.descriptorInputSnapshotCurrent(source, position, *a.prior) {
		return false
	}
	recipe, registered := work.operationRecipes[a.request.producer]
	if !registered || recipe.callResult == nil || !validStagedCallResultRecipe(recipe) || !sameOperationRequest(recipe.callResult.request, a.request) || recipe.callResult.generation != a.generation || recipe.callResult.association.inputs != a.association.inputs || recipe.callResult.association.sourceInputs != a.association.sourceInputs || !sameSourceRelativeInvocation(recipe.callResult.association.invocation, a.association.invocation) || !work.currentStagedResultAssociation(work.operationFacts, recipe.callResult) {
		return false
	}
	projected, readings, represented := projectDescriptorInputBindings(*a.prior, recipe.callResult, func(endpoint sourceRelativeEndpoint) (sourceStagedOperationRequest, sourceStagedOperationDelta, bool) {
		reading, data, applied := work.readStagedReturnInput(work.operationFacts, recipe.callResult, endpoint, nil, false)
		retained := false
		for _, required := range recipe.delta.required {
			retained = retained || sameOperationRequest(required, reading)
		}
		return reading, data, applied && retained
	}, func(endpoint sourceRelativeEndpoint) bool {
		return stagedSourceDataValue(endpoint.expression)
	})
	return represented && len(readings) == len(a.readings) && operationPrefix(readings, a.readings, sameOperationRequest) && sameDescriptorInputData(projected, input)
}

// readDescriptorReturnViewInput consumes a typed source argument's exact
// original DATA delivery. It never converts that view into a raw source object.
func (work *callableEffectWork) readDescriptorReturnViewInput(facts []callableFacts, source *sourceStagedCallResultSource, endpoint sourceRelativeEndpoint) (sourceStagedOperationRequest, sourceStagedOperationDelta, bool) {
	caller, known := work.memberNodes[source.request.producer.declaration]
	if !known {
		return sourceStagedOperationRequest{}, sourceStagedOperationDelta{}, false
	}
	if !currentStagedInputBinding(facts, caller, source.association, endpoint) {
		return sourceStagedOperationRequest{}, sourceStagedOperationDelta{}, false
	}
	view := endpoint.descriptorView
	if view == nil || view.delivery.consumer != source.request.producer.declaration || !work.descriptorViewSourceCurrent(view) {
		return sourceStagedOperationRequest{}, sourceStagedOperationDelta{}, false
	}
	data, applied := work.stagedCallResultData(view.delivery)
	if !applied || !data.delta.extracted {
		return view.delivery, sourceStagedOperationDelta{}, false
	}
	matched := sourceStagedOperationDelta{extracted: true}
	for _, value := range data.delta.exposures {
		if value.creating == nil && value.endpoint.kind == relativeEndpointDescriptorView && descriptorViewDataEqual(value.endpoint.descriptorView, view) {
			matched.exposures = append(matched.exposures, cloneOperationDelta(sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{value}}).exposures...)
		}
	}
	producer, registered := work.operationRecipes[view.delivery.producer]
	return view.delivery, matched, registered && len(matched.exposures) != 0 && work.descriptorPayloadChild(producer, view, nil)
}
