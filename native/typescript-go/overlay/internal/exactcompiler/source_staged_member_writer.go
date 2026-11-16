package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedMemberWriterParent routes only a current original writer publication to
// the exact member-source relationship issued by this Get. Equal syntax or an
// indexed candidate outside the loan supplies no receiver/order authority.
func (work *callableEffectWork) stagedMemberWriterParent(q *sourceValueQuery) (sourceStagedOperationRequest, bool) {
	if q == nil || q.stagedWriter == nil || q.stagedWriter.current == nil {
		return sourceStagedOperationRequest{}, false
	}
	b, writer := q.stagedMember, q.stagedWriter
	if !q.liveStagedMemberSource(b, writer.get, writer.read) || !writer.publishing || !q.liveStagedWriterSource(writer, writer.read) {
		return sourceStagedOperationRequest{}, false
	}
	for _, request := range b.required {
		recipe := work.operationRecipes[request.producer]
		if source := recipe.memberSource; source != nil && source.writeEffects {
			request = stagedMemberCandidateRequest(source.parent, source.candidate)
			recipe = work.operationRecipes[request.producer]
		}
		if stagedMemberWriterReadMatches(recipe.memberSource, request, *writer.current) {
			return request, true
		}
	}
	return sourceStagedOperationRequest{}, false
}

func stagedMemberWriterReadMatches(source *sourceStagedMemberSource, parent sourceStagedOperationRequest, read sourceStagedWriterRead) bool {
	return source != nil && !source.writeEffects && source.coverage == nil && source.call == nil && source.getEffects == nil &&
		!source.candidate.protocol && !source.candidate.reflective && !source.candidate.runtimeUnknown &&
		sameOperationRequest(source.request, parent) && source.candidate.operation == read.write &&
		source.candidate.origin == read.origin && source.candidate.cut == read.observation &&
		source.parent.producer.operation == read.readCut.use && source.parent.use == read.readCut.use
}

func stagedMemberWriterInvoked(q *sourceValueQuery, source *sourceStagedMemberSource) bool {
	return q != nil && q.stagedMember != nil && q.stagedWriter != nil && source != nil &&
		q.stagedMember.mode&accessorNoGet == 0 && q.originalSourceCalleeOperation() == source.parent.producer.operation && ast.IsCallExpression(source.parent.producer.operation) &&
		q.stagedWriter.get != nil && q.memberSourceObservationOwned(q.stagedMember, q.stagedWriter.get.operation)
}

// beginStagedMemberWriterDelivery shares the existing original writer loan.
// Nested member demands can add a sink without replacing an outer constructed
// or map consumer. Both sinks validate their own exact issued parent. Cleanup
// restores the outer callbacks and never resurrects a revoked loan.
func (work *callableEffectWork) beginStagedMemberWriterDelivery(q *sourceValueQuery, facts []callableFacts) func() {
	publish := func(sourceStagedWriterRead) bool {
		parent, issued := work.stagedMemberWriterParent(q)
		if !issued {
			return false
		}
		_, parentAdopted := work.operationIDs[parent.producer]
		// Reaching the aggregate Effects root does not demand this candidate
		// as raw DATA. Preserve its prefix without adopting an unrequested role.
		accepted := work.publishStagedWriterRead(facts, q, parent)
		// Passive source registration retains a packet for later adoption but
		// cannot take RHS ownership away from the current legacy consumer.
		return accepted && parentAdopted
	}
	consume := func(sourceStagedWriterProjection) bool {
		parent, issued := work.stagedMemberWriterParent(q)
		if !issued || !stagedMemberWriterInvoked(q, work.operationRecipes[parent.producer].memberSource) {
			return false
		}
		return work.acceptWriterCallableProjection(facts, q, parent, q.executable)
	}
	if q.stagedWriter == nil {
		revoke, installed := q.beginStagedWriterSource(publish)
		if !installed {
			return func() {}
		}
		q.stagedWriter.consumeProjection = consume
		return revoke
	}
	borrow := q.stagedWriter
	oldPublish, oldConsume := borrow.publish, borrow.consumeProjection
	borrow.publish = func(read sourceStagedWriterRead) bool {
		accepted := publish(read)
		if oldPublish != nil {
			accepted = oldPublish(read) || accepted
		}
		return accepted
	}
	borrow.consumeProjection = func(projection sourceStagedWriterProjection) bool {
		accepted := consume(projection)
		if oldConsume != nil {
			accepted = oldConsume(projection) || accepted
		}
		return accepted
	}
	return func() {
		if borrow.issuer != nil {
			borrow.publish, borrow.consumeProjection = oldPublish, oldConsume
		}
	}
}
