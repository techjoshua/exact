package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nativeWriterSourceRequested is the disjoint pending native variant of the
// existing request-only writer source. Its inventory describes work, not an
// acquired callee or a direct-input-invocation disposition.
func nativeWriterSourceRequested(recipe sourceStagedOperationRecipe) bool {
	s := recipe.memberSource
	return s != nil && s.call != nil && s.call.sourceRequest != nil && s.call.sourceRequest.nativeInput
}

// This role MUST differ from callee-alternatives: that existing role records
// the actual selected Get's exhaustive authored/unknown population.
func nativeWriterSourceRequestKey(parent sourceStagedOperationRequest, candidate sourceStagedMemberCandidate) sourceStagedOperationRequest {
	return nativeWriterScopeRequestKey(parent, candidate, false)
}

// nativeWriterScopeRequestKey encodes the existing two SOURCE scopes directly.
// The general member constructor's field/context and edge would both be
// overwritten. Preserve its exact occurrence/association choice and every other
// parent field without constructing that discarded metadata. This is pure
// description identity, never registration, selection or currentness.
func nativeWriterScopeRequestKey(parent sourceStagedOperationRequest, candidate sourceStagedMemberCandidate, descriptor bool) sourceStagedOperationRequest {
	field := "native-input-source-request"
	if descriptor {
		field = "descriptor-callee-source-request"
	}
	occurrence, association := candidate.operation, candidate.origin
	if candidate.getContribution || candidate.invoking {
		occurrence, association = candidate.value.expression, nil
	}
	request := parent
	request.producer.selector = sourceStagedOperationSelector{occurrence: occurrence, association: association, field: field}
	request.edge = parent.edge + ":" + field
	return request
}
func stagedMemberCallSourceRequest(source *sourceStagedMemberSource) sourceStagedOperationRequest {
	if source.call != nil && source.call.sourceRequest != nil && source.call.sourceRequest.descriptorCallee {
		return descriptorCalleeRequestKey(source.parent, source.candidate)
	}
	if source.call != nil && source.call.sourceRequest != nil && source.call.sourceRequest.nativeInput {
		return nativeWriterSourceRequestKey(source.parent, source.candidate)
	}
	return stagedMemberCandidateRequest(source.parent, source.candidate)
}

func nativeWriterSourceOccurrence(request sourceStagedOperationRequest) sourceStagedConstructedOccurrence {
	call := request.producer.operation
	return sourceStagedConstructedOccurrence{request: request, receiver: call.Expression().Expression()}
}

func validNativeWriterSourceRequest(d *sourceStagedMemberCallRequest, s *sourceStagedMemberSource) bool {
	if d == nil || !d.nativeInput || s == nil || s.call == nil || d.generation == nil || d.generation != s.generation || len(d.occurrence.sites)+len(d.occurrence.upstream) != 0 || !sameOperationRequest(d.occurrence.request, s.parent) {
		return false
	}
	call := s.parent.producer.operation
	if call == nil || !ast.IsCallExpression(call) || !ast.IsPropertyAccessExpression(call.Expression()) || s.parent.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || s.parent.use != call || s.parent.reading != (sourceStagedOperationKey{}) || s.parent.inputs != nil {
		return false
	}
	candidate := requestedMemberCallCandidate(d.occurrence)
	if d.occurrence.receiver != call.Expression().Expression() || !sameStagedMemberCandidate(s.candidate, candidate) || !sameOperationRequest(s.request, nativeWriterSourceRequestKey(s.parent, candidate)) {
		return false
	}
	if len(d.required) != 0 && len(d.required) != 2 && len(d.required) != 3 {
		return false
	}
	original := &sourceStagedNativeGetSource{request: s.parent, get: call.Expression()}
	expected := []sourceStagedOperationRequest{s.parent, nativeRootDebtRequest(original, "callee-get"), nativeInputInvocationRequest(original)}
	for i, required := range d.required {
		if !sameOperationRequest(required, expected[i]) {
			return false
		}
	}
	// A published wrapper still requires the genuine semantic child at consumption.
	return !s.call.complete || len(d.required) == 3
}

// describeNativeWriterSourceRequest is called only by the current live writer
// registrar. Eligibility bounds the request namespace, never native selection.
func (work *callableEffectWork) describeNativeWriterSourceRequest(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest) (sourceStagedOperationRecipe, bool) {
	return work.describeNativeWriterScopeRequest(facts, q, r, false)
}

func (work *callableEffectWork) describeNativeWriterScopeRequest(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest, descriptor bool) (sourceStagedOperationRecipe, bool) {
	return work.describeNativeWriterScopeRequestInContext(facts, q, r, descriptor, nil)
}

// The registration context is a disjoint declaration-relative SOURCE loan.
// All existing physical/native C callers pass nil and retain their old gates.
func (work *callableEffectWork) describeNativeWriterScopeRequestInContext(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest, descriptor bool, registration *sourceStagedDeclarationNativeRegistration) (sourceStagedOperationRecipe, bool) {
	if q == nil || q.owner == nil || q.executable == nil || r == nil || !r.live || r.issuer != q || r.consumer != q.effectOwner || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) || q.inputs != nil || q.operation != nil {
		return sourceStagedOperationRecipe{}, false
	}
	if registration != nil {
		if !registration.live(work, facts, q, r) {
			return sourceStagedOperationRecipe{}, false
		}
	} else if n := q.stagedNativeGet; n != nil {
		if n.issuer != q || n.sourceWork != work || n.owner != q.owner || n.generation != work.operationGeneration || len(n.observations) == 0 {
			return sourceStagedOperationRecipe{}, false
		}
	} else if b := q.stagedMember; b != nil && b.getPreparation.live(q) && b.getPreparation.work == work {
		// Only a descriptive factory is lent before the original physical Get.
		// Selection, finishing observation and all original source children remain
		// mandatory on the existing writer-source dispatcher and consumer.
	} else if b == nil || b.coverage == nil || !q.liveStagedMemberSource(b, b.get, b.read) {
		return sourceStagedOperationRecipe{}, false
	}
	caller, known := work.memberNodes[stagedNativeInputInvocationOwner(r.call)]
	if !known || caller < 0 || caller >= len(facts) || q == nil || q.executable == nil || !stagedNativeInputSourceOwner(&facts[caller], r.call, q.executable) {
		return sourceStagedOperationRecipe{}, false
	}
	call := r.call
	if call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || !ast.IsPropertyAccessExpression(call.Expression()) {
		return sourceStagedOperationRecipe{}, false
	}
	receiver, _ := accessorReceiver(call.Expression())
	if receiver == nil || !ast.IsIdentifier(receiver) {
		return sourceStagedOperationRecipe{}, false
	}
	symbol := q.owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
		return sourceStagedOperationRecipe{}, false
	}
	// Existing algorithm inventory chooses the requested producer. This does not
	// inspect a declaration/type or assert that the actual callee is standard.
	intent := stagedNativeInputIntent(call.Expression())
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	eligible := (intent == sourceNativeObjectFreeze || intent == sourceNativeObjectCreate) && len(actuals) == 1
	if descriptor {
		eligible = descriptorCalleeKind(intent) && len(actuals) == 3
	}
	for _, actual := range actuals {
		eligible = eligible && !ast.IsSpreadElement(actual)
	}
	if !eligible {
		return sourceStagedOperationRecipe{}, false
	}
	publisher := q.executable.pendingMemberPublishers[facts[caller].node]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || work.operationGeneration != q.owner.generation {
		return sourceStagedOperationRecipe{}, false
	}
	original, owned := stagedNativeInputOccurrenceRequest(&facts[caller], call)
	if !owned {
		return sourceStagedOperationRecipe{}, false
	}
	occurrence := nativeWriterSourceOccurrence(original)
	candidate := requestedMemberCallCandidate(occurrence)
	request := nativeWriterSourceRequestKey(original, candidate)
	if descriptor {
		request = descriptorCalleeRequestKey(original, candidate)
	}
	if prior, exists := work.operationRecipes[request.producer]; exists {
		return prior, (descriptor && descriptorCalleeRequested(prior) || !descriptor && nativeWriterSourceRequested(prior)) && validStagedMemberCallRecipe(prior) && prior.memberSource.generation == work.operationGeneration
	}
	description := &sourceStagedMemberCallRequest{nativeInput: !descriptor, descriptorCallee: descriptor, occurrence: occurrence, generation: work.operationGeneration}
	recipe := sourceStagedOperationRecipe{key: request.producer, memberSource: &sourceStagedMemberSource{request: request, parent: original, candidate: candidate, generation: work.operationGeneration, call: &sourceStagedMemberCall{sourceRequest: description}}}
	if !validStagedMemberCallRecipe(recipe) || !work.registerOperationRecipe(facts, recipe) {
		return sourceStagedOperationRecipe{}, false
	}
	// A late reader consumes an already published original source through exactly
	// the same refinement; no selected observation is replayed here.
	if source := work.operationRecipes[original.producer].nativeGet; source != nil {
		work.refineNativeWriterSourceRequest(facts, recipe.key, source)
	}
	return work.operationRecipes[recipe.key], true
}

func (work *callableEffectWork) refineNativeWriterSourceRequest(facts []callableFacts, key sourceStagedOperationKey, source *sourceStagedNativeGetSource) bool {
	if descriptorCalleeRequested(work.operationRecipes[key]) {
		return work.refineDescriptorCalleeRequest(facts, key, source)
	}
	prior := work.operationRecipes[key]
	if !nativeWriterSourceRequested(prior) || !validStagedMemberCallRecipe(prior) || prior.memberSource.generation != work.operationGeneration || source == nil || !sameOperationRequest(prior.memberSource.parent, source.request) {
		return false
	}
	root := work.operationRecipes[source.request.producer]
	get := work.operationRecipes[nativeRootDebtRequest(source, "callee-get").producer]
	if !validNativeGetRecipe(root) || !validNativeGetRecipe(get) || !sameNativeGetSource(root.nativeGet, source) || !sameNativeGetSource(get.nativeGet, source) {
		return false
	}
	required := []sourceStagedOperationRequest{source.request, nativeRootDebtRequest(source, "callee-get")}
	invocation := work.operationRecipes[nativeInputInvocationRequest(source).producer]
	if validNativeInputInvocationRecipe(invocation) && sameNativeGetSource(invocation.nativeGet, source) {
		required = append(required, invocation.nativeGet.inputInvocation.request)
	}
	copy := *prior.memberSource
	call := *copy.call
	description := *call.sourceRequest
	description.required = required
	call.sourceRequest = &description
	// Completion belongs to the genuine local selected/full-Get observation.
	// Full source closure and reader APPLIED are independent requirements.
	call.complete = len(required) == 3 && work.nativeInputInvocationCurrent(invocation) && work.nativeWriterSourceInvocationApplied(required[2])
	copy.call = &call
	recipe := prior
	recipe.memberSource = &copy
	recipe.delta = sourceStagedOperationDelta{required: required, extracted: call.complete}
	if !validStagedMemberCallRecipe(recipe) || !work.attachOperationSource(facts, recipe) {
		return false
	}
	if call.complete {
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[key] = work.operationGeneration
	}
	return true
}

// notifyNativeWriterSourceRequests is a graph-local publication fan-in over
// existing detached descriptions. It registers only real factories, then uses
// the same semantic-dependency backrefs and queue. It never acquires a callee.
func (work *callableEffectWork) notifyNativeWriterSourceRequests(facts []callableFacts, source *sourceStagedNativeGetSource) {
	if source == nil {
		return
	}
	for key, recipe := range work.operationRecipes {
		if !nativeWriterScopeRequested(recipe) || recipe.memberSource.generation != work.operationGeneration || !sameOperationRequest(recipe.memberSource.parent, source.request) || !work.refineNativeWriterSourceRequest(facts, key, source) {
			continue
		}
		id := work.operationIDs[key]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			continue
		}
		work.attachWriterSourceDependencies(facts, id)
		if work.operations[id.index].delta.extracted && work.writerSourceLocallyReady(work.operationRecipes[key]) {
			continue
		}
		queued := work.operations[id.index].writerSourceRunning
		for _, task := range work.extractionQueue[work.extractionHead:] {
			queued = queued || task.operation == id && !task.operationDone && !task.delivery
		}
		if !queued {
			work.extractionQueue = append(work.extractionQueue, callableExtractionTask{operation: id})
		}
	}
}

// The original collector readiness event resumes descriptions that yielded
// during that SAME canonical extraction. It grants no selected or current fact.
func (work *callableEffectWork) notifyNativeWriterSourceCallerReady(facts []callableFacts, caller int) {
	if caller < 0 || caller >= len(facts) || !facts[caller].staged.ready {
		return
	}
	for key, recipe := range work.operationRecipes {
		if !nativeWriterScopeRequested(recipe) || key.declaration != facts[caller].node || recipe.memberSource.generation != work.operationGeneration {
			continue
		}
		id := work.operationIDs[key]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			continue
		}
		if work.operations[id.index].delta.extracted && work.writerSourceLocallyReady(recipe) {
			continue
		}
		queued := false
		for _, task := range work.extractionQueue[work.extractionHead:] {
			queued = queued || task.operation == id && !task.operationDone && !task.delivery
		}
		if !queued {
			work.extractionQueue = append(work.extractionQueue, callableExtractionTask{operation: id})
		}
	}
}

func (work *callableEffectWork) prepareNativeWriterSourceRequest(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	if !work.writerSourceTaskRunning(facts, id, owner) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !nativeWriterScopeRequested(recipe) || !validStagedMemberCallRecipe(recipe) {
		return
	}
	caller, known := work.memberNodes[recipe.key.declaration]
	call := recipe.key.operation
	if !known || !facts[caller].staged.ready || !stagedNativeInputSourceOwner(&facts[caller], call, owner) {
		return
	}
	// Existing current publication is consumed without repeating selection.
	if source := work.operationRecipes[recipe.memberSource.parent.producer].nativeGet; source != nil {
		work.refineNativeWriterSourceRequest(facts, recipe.key, source)
		if work.writerSourceLocallyReady(work.operationRecipes[recipe.key]) {
			return
		}
		// A changed semantic prerequisite permits this existing source task to issue
		// a fresh original Get. The saved revision vector itself is never a receipt.
	}
	request := sourceStagedNativeRequest{call: call, get: call.Expression(), request: recipe.memberSource.parent, algorithmKind: stagedNativeInputIntent(call.Expression())}
	if descriptorCalleeRequested(recipe) {
		actuals := restrictedInvocationArguments(call.AsCallExpression())
		if len(actuals) != 3 {
			return
		}
		request.descriptorGet = actuals[2]
	}
	occurrence, visited := work.observeSelectedNativeGetSource(facts, caller, request, owner)
	if visited && occurrence != nil && occurrence.source != nil {
		work.refineNativeWriterSourceRequest(facts, recipe.key, occurrence.source)
	}
}

// This is actual delivery of the separately issued child, not an ACK-derived
// observation or a closure shortcut. The full Call/Get remain required siblings.
func (work *callableEffectWork) nativeWriterSourceInvocationApplied(request sourceStagedOperationRequest) bool {
	id := work.operationIDs[request.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	return state.key == request.producer && !state.invalid && state.delta.extracted && state.revision != 0 && subscriber != nil && sameOperationRequest(subscriber.request, request) && !subscriber.blocked && subscriber.consumed == state.revision && subscriber.applied == state.revision
}

func (work *callableEffectWork) nativeWriterSourceRequestCurrent(recipe sourceStagedOperationRecipe) bool {
	if work.operationGeneration == nil || !work.operationGeneration.active || !nativeWriterSourceRequested(recipe) || work.operationRecipes[recipe.key].memberSource != recipe.memberSource || !validStagedMemberCallRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || !recipe.delta.extracted || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	required := recipe.memberSource.call.sourceRequest.required
	if len(required) != 3 {
		return false
	}
	invocation := work.operationRecipes[required[2].producer]
	return validNativeInputInvocationRecipe(invocation) && sameOperationRequest(invocation.nativeGet.inputInvocation.request, required[2]) && work.nativeInputInvocationCurrent(invocation) && work.nativeWriterSourceInvocationApplied(required[2])
}
func (work *callableEffectWork) currentNativeWriterSourceRequest(call *ast.Node) (sourceStagedOperationRecipe, bool) {
	if call == nil || !ast.IsCallExpression(call) || !ast.IsPropertyAccessExpression(call.Expression()) {
		return sourceStagedOperationRecipe{}, false
	}
	owner := stagedNativeInputInvocationOwner(call)
	// Every valid native-input wrapper uses this canonical factory key. Read the
	// current registered description; its original local/current/APPLIED gates
	// still decide whether it can serve this Call. No observation is cached here.
	key := sourceStagedOperationKey{declaration: owner, operation: call, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: call.Expression(), field: "native-input-source-request"}}
	recipe := work.operationRecipes[key]
	if nativeWriterSourceRequested(recipe) && recipe.key.declaration == owner && recipe.key.operation == call && work.writerSourceLocallyReady(recipe) {
		return recipe, true
	}
	return sourceStagedOperationRecipe{}, false
}
