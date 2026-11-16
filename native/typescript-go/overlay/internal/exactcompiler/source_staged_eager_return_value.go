package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// eagerReturnRequirement borrows the exact creating packet owned by this graph.
// Descriptive equality alone cannot lend binder or publication authority.
func (work *callableEffectWork) eagerReturnRequirement(source *sourceStagedNativeGetSource, value *ast.Node) (*sourceStagedEagerRequirement, *sourceStagedNativeEagerInputs) {
	request := nativeRootDebtRequest(source, "eager-inputs")
	id, found := work.operationIDs[request.producer]
	if !found || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil, nil
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if recipe.nativeGet == nil || recipe.nativeGet.eager == nil || !sameNativeGetSource(source, recipe.nativeGet) {
		return nil, nil
	}
	for i := range state.eagerCalls {
		requirement := &state.eagerCalls[i]
		if requirement.call.invocation.operation == value && requirement.inputs != nil {
			return requirement, recipe.nativeGet.eager
		}
	}
	return nil, nil
}

// publishEagerReturnValueDemand consumes only an explicitly demanded own Value
// role. An earlier original Get can supply its graph-local association without
// replaying that Get or the initializer. Independent alternative coverage stays pending.
func (work *callableEffectWork) publishEagerReturnValueDemand(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	parent, role := fieldSourceParent(sourceStagedOperationRequest{producer: work.operations[id.index].key})
	if !role || parent.producer.kind != relativeDemandDirectExposure {
		return false
	}
	requests, valid := fieldSourceRequests(parent)
	if !valid || requests.ownWriters.producer != work.operations[id.index].key {
		return false
	}
	parent.producer.kind = relativeDemandEffects
	return work.publishEagerReturnValue(facts, parent.producer, owner)
}

// publishEagerReturnValue transports known return templates using two current
// graph owners: the actual own-data Get and the exact creating binder packet.
// Neither description independently authorizes publication or Value completion.
func (work *callableEffectWork) publishEagerReturnValue(facts []callableFacts, field sourceStagedOperationKey, owner *executableBodyOwner) bool {
	return work.recordEagerReturnValue(facts, field, owner, false)
}

// Source registration may seal a known prefix before a downstream demand. The
// original Get marker and exact graph B still authenticate every alternative.
func (work *callableEffectWork) recordEagerReturnValue(facts []callableFacts, field sourceStagedOperationKey, owner *executableBodyOwner, registration bool) bool {
	if owner == nil || owner.values == nil || work.operationGeneration != owner.values.generation {
		return false
	}
	fieldID, observed := work.operationIDs[field]
	if !observed || fieldID.epoch != work.operationEpoch || fieldID.index == 0 || int(fieldID.index) >= len(work.operations) {
		return false
	}
	selected := work.operations[fieldID.index].fieldOwnData
	source := work.operationRecipes[field].nativeGet
	if source == nil || selected.kind != relativeEndpointExpression || selected.expression == nil || selected.producer != field.operation || selected.get != source.descriptorGet || selected.cut.operation != field.operation || selected.cut.reading != field.operation {
		return false
	}
	projection := source.request
	projection.producer = field
	projection.producer.kind = relativeDemandDirectExposure
	roles, valid := fieldSourceRequests(projection)
	if !valid {
		return false
	}
	if _, demanded := work.operationIDs[roles.ownWriters.producer]; !demanded && !registration {
		return false
	}
	requirement, plan := work.eagerReturnRequirement(source, selected.expression)
	if requirement == nil {
		return false
	}
	alternatives, valid := describeStagedEagerReturnCarriers(requirement.call, requirement.inputs, owner.values)
	if !valid {
		return false
	}
	parent, valid := work.ensureFieldExposure(facts, source, field.selector.field)
	if !valid {
		return false
	}
	copySource := *parent.nativeGet
	copySource.eager = plan
	parent.nativeGet = &copySource
	if !work.updateFieldValueRecipe(facts, parent) {
		return false
	}
	own := work.operationRecipes[roles.ownWriters.producer]
	own.nativeGet = &copySource
	own.delta = cloneOperationDelta(own.delta)
	changed := false
	for _, alternative := range alternatives {
		if !work.currentEagerReturnAlternative(source, alternative) || !validNativeOwnFieldAlternative(parent, alternative) {
			return false
		}
		known := false
		for _, prior := range own.delta.exposures {
			// Capture-free zero-argument templates have finite source identity.
			// Rebuilt graphs authenticate new B first, then retain the sealed prefix.
			known = known || prior.creating != nil && sameOperationEndpoint(prior.endpoint, alternative.endpoint)
		}
		if !known {
			own.delta.exposures = append(own.delta.exposures, alternative)
			changed = true
		}
	}
	return changed && work.updateFieldValueRecipe(facts, own)
}

func (work *callableEffectWork) currentEagerReturnAlternative(source *sourceStagedNativeGetSource, alternative sourceStagedOperationAlternative) bool {
	requirement, _ := work.eagerReturnRequirement(source, alternative.endpoint.creation)
	return requirement != nil && requirement.inputs == alternative.creating
}

// validNativeReturnedFieldAlternative validates sealed descriptive metadata.
// It never authenticates a current graph issuer or selects normal output.
func validNativeReturnedFieldAlternative(recipe sourceStagedOperationRecipe, alternative sourceStagedOperationAlternative) bool {
	source := recipe.nativeGet
	if source == nil || source.eager == nil || alternative.creating == nil || !validStagedNativeEagerInputs(*source.eager, source) {
		return false
	}
	for _, call := range source.eager.calls {
		if call.property == nil || callableNameText(call.property.Name()) != recipe.key.selector.field {
			continue
		}
		value := alternative.endpoint
		creating := alternative.creating
		if value.kind == relativeEndpointExpression && value.expression != nil && (ast.IsArrowFunction(value.expression) || ast.IsFunctionExpression(value.expression)) && value.creation == call.invocation.operation && value.producer == call.invocation.declaration && value.returning != nil && ast.IsReturnStatement(value.returning) && value.returning.AsReturnStatement().Expression == value.expression && value.get == nil && len(value.projection) == 0 && creating.delivered && creating.request.operation == value.creation && creating.request.declaration == value.producer && creating.request.cut == value.cut && value.cut == (sourceRelativeCut{operation: value.creation, reading: value.creation}) && sameSourceRelativeInputEnvelope(creating.request, creating.bound) && sameSourceRelativeInputEnvelope(creating.request, creating.relative) {
			return true
		}
	}
	return false
}
