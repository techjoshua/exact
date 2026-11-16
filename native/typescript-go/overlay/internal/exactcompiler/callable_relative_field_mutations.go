package exactcompiler

// This phase-local transport keeps compiler debt beside known symbolic
// prefixes. Pending is never an external runtime disposition. It is rebuilt
// with the existing canonical relative phase and cleared on clone.
type sourceRelativeMutationTransfer struct {
	field       sourceStagedOperationRequest // Immutable ORIGINAL field specialization, not a runtime alternate.
	generation  *projectGeneration           // Original operator generation, never stamped from the receiving work.
	sources     []EnvironmentEffectSource
	pending     *sourceRelativeFieldMutation
	represented bool
}

// relativeMutationTransferGeneration preserves the operator's own origin.
// Future unsupported mutation origins remain unclassifiable, not current merely
// because the receiving work is current.
func relativeMutationTransferGeneration(m *sourceRelativeFieldMutation) *projectGeneration {
	if m == nil {
		return nil
	}
	if m.external != nil {
		return m.external.generation
	}
	return m.native.generation
}

// relativeMutationTransferProjection classifies a phase-local field
// specialization before the BODY output consumer examines its alternatives.
// Unpaid work for a different authentic field cannot become an alternative for
// this one. Local extraction, APPLIED and closure are deliberately not header
// prerequisites; matching output atoms retain their existing currentness gates.
func (work *callableEffectWork) relativeMutationTransferProjection(transfer sourceRelativeMutationTransfer, field sourceStagedOperationRequest) (matching, valid bool) {
	if work.operationGeneration == nil || !work.operationGeneration.active || transfer.generation != work.operationGeneration {
		return false, false
	}
	parent, issued := fieldSourceParent(transfer.field)
	recipe := work.operationRecipes[transfer.field.producer]
	if !issued || !validNativeFieldValueSourceRecipe(recipe, parent) || !validNativeGetRequest(recipe, transfer.field) {
		return false, false
	}
	// The canonical constructor always retains its original operator on failure.
	// A missing/contradictory pending header cannot authorize foreign-field skip.
	if transfer.represented != (transfer.pending == nil) {
		return false, false
	}
	sameProjection := func(m *sourceRelativeFieldMutation) bool {
		return validRelativeFieldMutationShape(m) && sameOperationRequest(m.field, transfer.field) && relativeMutationTransferGeneration(m) == transfer.generation
	}
	if transfer.pending != nil && !sameProjection(transfer.pending) {
		return false, false
	}
	for _, effect := range transfer.sources {
		if effect.relativeMutation == nil || !sameProjection(effect.relativeMutation) {
			return false, false
		}
	}
	return sameOperationRequest(transfer.field, field), true
}

// transferRelativeFieldMutation uses an existing actual invocation subscriber.
// It substitutes SOURCE roles without interpreting the role as a callable.
// Unsupported/unknown input provenance remains compiler debt, never a terminal.
func (work *callableEffectWork) transferRelativeFieldMutation(facts []callableFacts, subscriber sourceRelativeCallSubscriber, m *sourceRelativeFieldMutation, owner *executableBodyOwner) ([]EnvironmentEffectSource, bool) {
	if m != nil && m.external != nil {
		return work.transferExternalMutation(facts, subscriber, m)
	}
	if m == nil || owner == nil || owner.values == nil || !work.relativeFieldMutationSourceCurrent(m) || subscriber.caller < 0 || subscriber.caller >= len(facts) || m.target.kind != relativeEndpointRole {
		return nil, false
	}
	call := subscriber.call
	var bound sourceRelativeBoundInputs
	if subscriber.returned != nil {
		// Returned creation/capture projection must retain its own authentic later
		// input association. It cannot borrow this declaration's ordinary binder.
		return nil, false
	}
	if call.inputConsumerWait != nil || call.legacyInputs || call.invocation.declaration != m.target.role.declaration {
		return nil, false
	}
	if call.sourceInputs != nil {
		if !sameSourceRelativeInvocation(call.sourceInputs.invocation, call.invocation) || !sameSourceRelativeInputEnvelope(call.invocation, call.sourceInputs.bindings) {
			return nil, false
		}
		bound = call.sourceInputs.bindings
	} else if call.inputs != nil && call.inputs.delivered && sameSourceRelativeInvocation(call.inputs.request, call.invocation) && sameSourceRelativeInputEnvelope(call.invocation, call.inputs.relative) {
		bound = call.inputs.relative
	} else {
		return nil, false
	}
	// Rest-container mutation has no invocation interpretation. Preserve the
	// unsupported container source rather than using the invocation rest law.
	for _, rest := range bound.rest {
		if rest.formal == m.target.role {
			return nil, false
		}
	}
	plan := substituteSourceRelativeRoleBindings(bound, m.target.role, nil)
	represented := plan.unsupported == relativeInputsSupported
	var effects []EnvironmentEffectSource
	for _, binding := range plan.bindings {
		if binding.unknown {
			represented = false
		}
		alternatives := append([]sourceRelativeEndpoint(nil), binding.sources...)
		if len(binding.pending) != 0 {
			represented = false
		}

		for _, endpoint := range alternatives {
			if endpoint.kind == relativeEndpointRole && validMutationSourceRole(endpoint.role, facts[subscriber.caller].node) {
				next := cloneRelativeFieldMutation(m)
				application := sourceFieldMutationApplication{before: cloneSourceRelativeEndpoint(m.target), after: cloneSourceRelativeEndpoint(endpoint), invocation: cloneStagedWriterInvocation(call.invocation), bound: cloneSourceRelativeBoundInputs(bound), inputs: call.inputs, sourceInputs: call.sourceInputs}
				if subscriber.getterReader != nil {
					reader := *subscriber.getterReader
					application.getterReader = &reader
				}
				next.applications = []sourceFieldMutationApplication{application}
				next.target = cloneSourceRelativeEndpoint(endpoint)
				effects = append(effects, relativeMutationEffect(next, facts[subscriber.caller].summary.Name))
			} else {
				// A concrete source, missing DATA or unknown bool is not an external
				// terminal. Known protocol/ordinary-construction owners must resolve this
				// operator through their original source relation; pending stays pending.
				represented = false
			}
		}
	}
	return effects, represented
}

// stagedRelativeMutationTransfer replaces only the exact mutation atom on this
// original declaration edge. It never falls through to invocation substitution.
func stagedRelativeMutationTransfer(fact *callableFacts, edge CallEdge, source EnvironmentEffectSource) ([]EnvironmentEffectSource, bool) {
	if source.relativeMutation == nil {
		return nil, false
	}
	bySource := fact.staged.mutationTransfers[edge.ID]
	if bySource == nil {
		return nil, false
	}
	transferred, found := bySource[relativeFieldMutationIdentity(source.relativeMutation)]
	return transferred.sources, found && transferred.represented
}
