package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// issueInstalledMutationGetterInputs is called only by the original Get
// publisher. Delivery/BODY records cannot recreate this zero-actual binder.
// The current initial domain is a context-free zero-parameter stored getter;
// unsupported creating/capture associations remain pending, never borrowed.
func (work *callableEffectWork) issueInstalledMutationGetterInputs(facts []callableFacts, q *sourceValueQuery, reader sourceStagedOperationID, get *sourceGetInputs, read *sourceMemberWriterReadCut) bool {
	if q == nil || q.owner == nil || q.executable == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || get == nil || get.hasOnly || read == nil || reader.epoch != work.operationEpoch || reader.index == 0 || int(reader.index) >= len(work.operations) {
		return false
	}
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, get, read) || q.owner.generation != work.operationGeneration || !q.stagedFieldWorkOwner(q.executable) {
		return false
	}
	demand, issued := work.installedFieldGetReaderDemand(facts, reader, q.executable)
	if !issued || demand.request.producer.operation != get.operation {
		return false
	}
	changed := false
	for slot := range work.operations[reader.index].getters {
		requirement := work.operations[reader.index].getters[slot]
		guard := requirement.installed
		if guard == nil || guard.exposure.epoch != work.operationEpoch || guard.exposure.index == 0 || int(guard.exposure.index) >= len(work.operations) {
			continue
		}
		body := requirement.declaration
		if guard == nil || body == nil || !ast.IsFunctionExpression(body) || len(body.Parameters()) != 0 || guard.creating != nil || stagedCallReturnLiteralHasCapture(body, q.owner) || requirement.demand.request.producer != demand.request.producer || !sameOperationEndpoint(guard.get.receiver, demand.receiver) || guard.get.cut != q.relativeInputCut(get.operation) {
			continue
		}
		exposure, _, dataRequest, exposed := work.installedGetterExposure(requirement)
		if !exposed {
			continue
		}
		dataState := &work.operations[guard.exposure.index]
		sub := dataState.subscribers[sourceStagedOperationConsumer{dataRequest.consumer, dataRequest.edge}]
		if sub == nil || sub.blocked || !sameOperationRequest(sub.request, dataRequest) || dataState.revision == 0 || sub.applied != dataState.revision {
			continue
		}
		known := false
		for _, alternative := range dataState.delta.exposures {
			known = known || alternative.creating == nil && alternative.endpoint.expression == body && validInstalledGetterAlternative(exposure, alternative)
		}
		if !known {
			continue
		}
		inputs := q.bindGetInputs(body, get.operation, get.receiver, nil, &accessorCandidates{})
		if inputs == nil || inputs.invocation != nil || inputs.get == nil || inputs.get.operation != get.operation || inputs.operationLifetime != nil || inputs.storage != nil || inputs.population != nil {
			continue
		}
		request, described := mutationGetterInvocation(q, inputs, get)
		if !described {
			continue
		}
		previous := q.implicitSourceInputs
		borrow := &sourceImplicitInputBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, request: cloneStagedWriterInvocation(request), receiver: get.receiver}
		q.implicitSourceInputs = borrow
		edge := publishMutationGetterBindings(q, inputs, get, request)
		q.implicitSourceInputs = previous
		borrow.issuer, borrow.owner, borrow.generation = nil, nil, nil
		borrow.request = sourceRelativeInvocation{}
		borrow.receiver, borrow.actuals = sourceValue{}, nil
		if edge == nil || edge.bound.unsupported != relativeInputsSupported {
			continue
		}
		current := &work.operations[reader.index].getters[slot]
		if current.inputs != nil {
			if !sameSourceRelativeInvocation(current.inputs.request, edge.request) || !sameInstalledMemberBoundInputs(current.inputs.relative, edge.relative) {
				continue
			}
		} else {
			current.inputs = edge
			work.inputDataChanged = true
			changed = true
		}
		// Actual BODY transfer may already have happened. This original Get still
		// owns the fresh input issuance; projection consumes existing templates only.
		if current.bodyTransferred {
			work.publishGetterMutationWriters(facts, reader, slot, q.executable)
		}
	}
	return changed
}
