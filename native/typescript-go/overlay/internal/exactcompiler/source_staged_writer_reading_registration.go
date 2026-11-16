package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// retainedWriterSourceReading finds a description already issued by this exact
// live C/Get. It grants no selected/current/source disposition. Keeping its
// identity lets the existing source owner refine and deliver its real child.
func (work *callableEffectWork) retainedWriterSourceReading(q *sourceValueQuery, r *sourceWriterInputRequest) (sourceStagedOperationRecipe, sourceStagedOperationRequest, bool) {
	if q == nil || r == nil || !r.live || r.issuer != q || r.consumer != q.effectOwner || q.owner == nil || q.owner.generation != work.operationGeneration || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) {
		return sourceStagedOperationRecipe{}, sourceStagedOperationRequest{}, false
	}
	b := q.stagedMember
	if b == nil || b.coverage == nil || !q.liveStagedMemberSource(b, b.get, b.read) {
		return sourceStagedOperationRecipe{}, sourceStagedOperationRequest{}, false
	}
	stored := work.operationRecipes[b.coverage.request.producer]
	c := stored.memberSource
	if !validStagedMemberCoverageRecipe(stored) || c == nil || c.generation != work.operationGeneration || !sameOperationRequest(c.request, b.coverage.request) || !sameOperationRequest(c.parent, b.request) || c.coverage.cut != b.coverage.cut || c.coverage.origin != b.coverage.origin {
		return sourceStagedOperationRecipe{}, sourceStagedOperationRequest{}, false
	}
	candidate := func(reading sourceStagedOperationRequest) (sourceStagedOperationRecipe, bool) {
		recipe := work.operationRecipes[reading.producer]
		s := recipe.memberSource
		if !work.requestedMemberCallSupported(recipe) || s == nil || s.call == nil || s.call.sourceRequest == nil || s.generation != work.operationGeneration || recipe.key.operation != r.call || !work.describedWriterSourceReading(reading) {
			return sourceStagedOperationRecipe{}, false
		}
		return recipe, true
	}
	for _, reading := range stored.delta.required {
		if recipe, valid := candidate(reading); valid && sameOperationRequest(reading, writerSourceReading(recipe, c.request)) {
			return recipe, reading, true
		}
	}
	// Native observers retain their typed reader in the actual callee Get
	// inventory, with the same independently issued C as its association.
	n := q.stagedNativeGet
	if n == nil || n.issuer != q || n.sourceWork != work || n.owner != q.owner || n.generation != work.operationGeneration || n.sourceEpoch != nil && n.sourceEpoch != work.operationEpoch {
		return sourceStagedOperationRecipe{}, sourceStagedOperationRequest{}, false
	}
	getRequest := nativeRootDebtRequest(&sourceStagedNativeGetSource{request: n.getRequest, get: n.call.Expression()}, "callee-get")
	get := work.operationRecipes[getRequest.producer]
	if !validNativeGetRequest(get, getRequest) || get.nativeGet == nil {
		return sourceStagedOperationRecipe{}, sourceStagedOperationRequest{}, false
	}
	for _, association := range get.nativeGet.observerInputs {
		if !validNativeObserverInput(get.nativeGet, association) || !sameOperationRequest(association.coverage, c.request) || !operationContainsRequest(get.delta.required, association.request) || !sameOperationRequest(association.observer.request, n.getRequest) || association.observer.cut != q.relativeInputCut(association.observer.cut.operation) {
			continue
		}
		if recipe, valid := candidate(association.request); valid && sameOperationRequest(nativeObserverProducerRequest(recipe), association.source) {
			return recipe, association.request, true
		}
	}
	return sourceStagedOperationRecipe{}, sourceStagedOperationRequest{}, false
}

// registerRetainedWriterSource adopts only the already declared exact reader.
// No C prefix grows here. Pending stays pending; original Get/current/APPLIED
// and whole-Call versus callee-component consumption keep their own guards.
func (work *callableEffectWork) registerRetainedWriterSource(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest, recipe sourceStagedOperationRecipe, reading sourceStagedOperationRequest) {
	if declarationWriterScopeReading(r) {
		return
	}
	request := nativeObserverProducerRequest(recipe)
	if !work.writerSourceRegistrationCompatible(r, request) {
		return
	}
	if n := q.stagedNativeGet; n != nil {
		association, known := work.nativeObserverInputAssociation(reading)
		if !known || !sameOperationRequest(association.observer.request, n.getRequest) || association.observer.cut != q.relativeInputCut(association.observer.cut.operation) {
			return
		}
	}
	id, adopted := work.requireOperation(facts, reading)
	if !adopted {
		return
	}
	work.attachWriterSourceDependencies(facts, id)
	consumer := work.memberNodes[q.effectOwner]
	work.requireWriterSourceAvailability(facts, consumer, recipe, q.stagedMember.request)
	r.writerSource, r.writerSourceWork, r.writerSourceIssuer, r.writerSourceReading = request, work, r, reading
	if n := q.stagedNativeGet; n != nil {
		r.nativeReadings = appendEntryLawRequirement(r.nativeReadings, reading)
		r.nativeIssuer = r
		n.sourceEpoch = work.operationEpoch
	}
	if work.writerSourceLocallyReady(recipe) {
		work.publishNativeObserverProducer(facts, id, q.executable)
	}
}

// A live committed request is never partially retargeted to another producer.
// A replacement belongs to another exact successfully registered reader; the
// existing association stays usable only while its normal parent guards hold.
func (work *callableEffectWork) writerSourceRegistrationCompatible(r *sourceWriterInputRequest, request sourceStagedOperationRequest) bool {
	return r.writerSourceWork == nil || r.writerSourceWork == work && r.writerSourceIssuer == r && sameOperationRequest(r.writerSource, request)
}
