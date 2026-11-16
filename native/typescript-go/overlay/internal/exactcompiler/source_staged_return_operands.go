package exactcompiler

import "fmt"

func stagedReturnOperandRequest(root sourceStagedOperationRequest, endpoint sourceRelativeEndpoint) sourceStagedOperationRequest {
	root.producer.selector = sourceStagedOperationSelector{occurrence: endpoint.expression, association: endpoint.returning, field: "return-operand"}
	root.edge += fmt.Sprintf(":operand:%p:%p:%p", endpoint.returning, endpoint.expression, endpoint.producer)
	return root
}

// A return operand retains the outer creating association and requires the
// original inner result producer. This relation transports DATA only. The
// independent body and input requirements still decide publication closure.
func validStagedReturnOperandRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	endpoint := source.operand
	if endpoint == nil || endpoint.expression != recipe.key.selector.occurrence || endpoint.returning != recipe.key.selector.association || recipe.key.selector.field != "return-operand" {
		return false
	}
	base := stagedReturnOperandRequest(stagedResultSourceRequest(recipe.key.operation, recipe.key.declaration, source.declaration), *endpoint)
	if !sameOperationRequest(base, source.request) || source.association.invocation.operation != recipe.key.operation || source.association.invocation.declaration != source.declaration || !validStagedDataResultCall(source.association) {
		return false
	}
	for _, required := range recipe.delta.required {
		if endpoint.expression == nil || !stagedDataSourceExpression(endpoint.expression) {
			return false
		}
		if sameOperationRequest(required, stagedResultSourceRequest(endpoint.expression, enclosingCallableNode(endpoint.expression), nil)) {
			continue
		}
		matched := false
		for _, binding := range stagedReturnOperandBindings(source).bindings {
			values := append(append([]sourceRelativeEndpoint(nil), binding.sources...), binding.pending...)
			for _, value := range values {
				if value.kind == relativeEndpointDescriptorView && value.descriptorView != nil && required.consumer == recipe.key.declaration && sameOperationRequest(required, value.descriptorView.delivery) {
					matched = validDescriptorViewPayload(value.descriptorView)
				}
				if value.expression != nil && stagedDataSourceExpression(value.expression) {
					request := stagedInputCallResultReading(stagedResultSourceRequest(value.expression, recipe.key.declaration, nil), recipe.key.declaration, source.association, value)
					matched = matched || sameOperationRequest(required, request)
				}
			}
		}
		if !matched {
			return false
		}
	}
	if len(recipe.delta.required) == 0 {
		return !recipe.delta.extracted && operationDeltaSize(recipe.delta) == 0
	}
	return sameOperationRequest(recipe.delta.required[0], stagedResultSourceRequest(endpoint.expression, enclosingCallableNode(endpoint.expression), nil))
}

func stagedReturnOperandBindings(source *sourceStagedCallResultSource) sourceRelativeBoundInputs {
	if source.association.inputs != nil {
		return source.association.inputs.relative
	}
	if source.association.sourceInputs != nil {
		return source.association.sourceInputs.bindings
	}
	return sourceRelativeBoundInputs{}
}

// currentStagedResultAssociation authenticates the retained original packet
// against this graph's Call fact. Structural copies cannot supply a real B or
// replace a source-input relationship from another creating occurrence.
func (work *callableEffectWork) currentStagedResultAssociation(facts []callableFacts, source *sourceStagedCallResultSource) bool {
	caller, known := work.memberNodes[source.request.producer.declaration]
	if !known || source.generation != work.operationGeneration {
		return false
	}
	for _, call := range facts[caller].staged.calls {
		if call.inputConsumerWait == nil && call.inputs == source.association.inputs && call.sourceInputs == source.association.sourceInputs && sameSourceRelativeInvocation(call.invocation, source.association.invocation) {
			return call.inputs != nil || call.sourceInputs != nil
		}
	}
	return false
}

// prepareStagedReturnOperand subscribes to an already described original Call.
// It never acquires a result, stages an invocation from source inventory, or
// borrows the outer reader's inputs for the inner Call. Missing associations,
// Get results and captures retain their existing explicit pending requirement.
func (work *callableEffectWork) prepareStagedReturnOperand(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	source := recipe.callResult
	if !validStagedCallResultRecipe(recipe) || !work.currentStagedResultAssociation(facts, source) {
		return
	}
	expression := source.operand.expression
	if expression == nil || !stagedDataSourceExpression(expression) {
		return
	}
	caller, known := work.memberNodes[enclosingCallableNode(expression)]
	if !known {
		return
	}
	child, supported := work.describeStagedCallResultSource(facts, caller, expression, owner)
	if !supported {
		return
	}
	prior, registered := work.operationRecipes[child.request.producer]
	if registered {
		if !sameStagedCallResultSource(prior.callResult, child) {
			return
		}
	} else if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: child.request.producer, callResult: child}) {
		return
	}
	if _, required := work.requireOperation(facts, child.request); !required {
		return
	}
	delta := sourceStagedOperationDelta{required: []sourceStagedOperationRequest{child.request}}
	descriptorPending := false
	if delivery, available := work.stagedCallResultData(child.request); available {
		delta.extracted = delivery.delta.extracted
		for _, alternative := range delivery.delta.exposures {
			endpoint := alternative.endpoint
			if endpoint.kind == relativeEndpointDescriptorView && endpoint.descriptorView != nil {
				view, required, represented := work.projectDescriptorReturnInputs(facts, source, *endpoint.descriptorView, owner)
				endpoint = cloneSourceRelativeEndpoint(endpoint)
				endpoint.descriptorView = &view
				alternative.endpoint = endpoint
				if represented {
					delta.exposures = append(delta.exposures, alternative)
				} else {
					descriptorPending = true
				}
				for _, reading := range required {
					delta.required = appendEntryLawRequirement(delta.required, reading)
				}
				delta.extracted = delta.extracted && represented
				continue
			}
			if endpoint.kind != relativeEndpointExpression && endpoint.kind != relativeEndpointRole && endpoint.kind != relativeEndpointUndefined {
				// Other typed payloads need their own matching composition law.
				// Preserve a known prefix, but never erase unhandled nested roles.
				delta.exposures = append(delta.exposures, cloneOperationDelta(sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{alternative}}).exposures...)
				delta.extracted = false
				continue
			}
			values, required, represented, matched := projectStagedReturnRoleSources(alternative, source, func(endpoint sourceRelativeEndpoint) (sourceStagedOperationRequest, sourceStagedOperationDelta, bool) {
				return work.readStagedReturnInput(facts, source, endpoint, owner, true)
			}, func(endpoint sourceRelativeEndpoint) bool {
				return stagedSourceDataValue(endpoint.expression) && !stagedCallReturnLiteralHasCapture(endpoint.expression, owner.values)
			})
			if !matched {
				delta.exposures = append(delta.exposures, alternative)
				continue
			}
			delta.exposures = append(delta.exposures, values...)
			for _, reading := range required {
				delta.required = appendEntryLawRequirement(delta.required, reading)
			}
			delta.extracted = delta.extracted && represented
		}
	}
	if descriptorPending {
		// A contextual descriptor snapshot is immutable once delivered. Its
		// original child/read dependencies retain the known prefix while any
		// required input is pending; do not publish a snapshot and later rewrite
		// it on ACK. All alternatives are emitted in original order when ready.
		delta.exposures = nil
	}
	recipe.delta = delta
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, delta)
	}
}

// projectStagedReturnRoleSources is shared by the existing top-level role
// substitution and the descriptor operator's nested input payload. Only the
// original declaration's binding is consumed; other role owners stay symbolic.
func projectStagedReturnRoleSources(alternative sourceStagedOperationAlternative, source *sourceStagedCallResultSource, read func(sourceRelativeEndpoint) (sourceStagedOperationRequest, sourceStagedOperationDelta, bool), literal func(sourceRelativeEndpoint) bool) ([]sourceStagedOperationAlternative, []sourceStagedOperationRequest, bool, bool) {
	endpoint := alternative.endpoint
	if endpoint.kind != relativeEndpointRole || endpoint.role.declaration != source.declaration {
		return nil, nil, true, false
	}
	if alternative.creating != nil {
		return nil, nil, false, true
	}
	var values []sourceStagedOperationAlternative
	var required []sourceStagedOperationRequest
	found, represented := false, true
	for _, binding := range stagedReturnOperandBindings(source).bindings {
		if binding.target != endpoint.role {
			continue
		}
		found = true
		sources := append(append([]sourceRelativeEndpoint(nil), binding.sources...), binding.pending...)
		represented = represented && !binding.unknown && len(sources) != 0
		for ordinal, value := range sources {
			if value.kind == relativeEndpointDescriptorView || value.kind == relativeEndpointExpression && stagedDataSourceExpression(value.expression) {
				request, data, delivered := read(value)
				if request.producer.operation != nil {
					required = appendEntryLawRequirement(required, request)
				}
				values = append(values, cloneOperationDelta(sourceStagedOperationDelta{exposures: data.exposures}).exposures...)
				represented = represented && delivered && data.extracted
				continue
			}
			ownFormal := value.kind == relativeEndpointRole && value.role.kind == relativeRoleFormal && value.role.declaration == source.request.producer.declaration
			if value.kind == relativeEndpointRole || value.kind == relativeEndpointUndefined || value.kind == relativeEndpointExpression && stagedSourceDataValue(value.expression) {
				values = append(values, sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(value)})
			}
			if ordinal >= len(binding.sources) || value.kind == relativeEndpointRole && !ownFormal || value.kind == relativeEndpointExpression && !literal(value) || value.kind != relativeEndpointRole && value.kind != relativeEndpointUndefined && value.kind != relativeEndpointExpression {
				represented = false
			}
		}
	}
	return values, required, represented && found, true
}

// readStagedReturnInput reuses the original registered input association and
// source DATA factory. A typed argument delegates to its owning payload rule;
// no later caller scope is used to reconstruct an original operand.
func (work *callableEffectWork) readStagedReturnInput(facts []callableFacts, source *sourceStagedCallResultSource, endpoint sourceRelativeEndpoint, owner *executableBodyOwner, prepare bool) (sourceStagedOperationRequest, sourceStagedOperationDelta, bool) {
	caller, known := work.memberNodes[source.request.producer.declaration]
	if !known {
		return sourceStagedOperationRequest{}, sourceStagedOperationDelta{}, false
	}
	if endpoint.kind == relativeEndpointDescriptorView {
		return work.readDescriptorReturnViewInput(facts, source, endpoint)
	}
	if !currentStagedInputAssociation(facts, caller, source.association, endpoint) {
		return sourceStagedOperationRequest{}, sourceStagedOperationDelta{}, false
	}
	var request sourceStagedOperationRequest
	if prepare {
		var registered bool
		request, registered = work.prepareStagedInputCallResult(facts, caller, source.association, endpoint, owner)
		if !registered {
			return request, sourceStagedOperationDelta{}, false
		}
	} else {
		request = stagedInputCallResultReading(stagedResultSourceRequest(endpoint.expression, source.request.producer.declaration, nil), source.request.producer.declaration, source.association, endpoint)
	}
	data, applied := work.stagedInputCallResultData(facts, request)
	return request, data.delta, applied
}
