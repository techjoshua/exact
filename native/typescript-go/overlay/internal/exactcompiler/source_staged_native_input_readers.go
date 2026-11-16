package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// validNativeObserverCoverage validates a detached original native Get context.
// It grants no callee selection; the current synchronous issuer registers it.
func validNativeObserverCoverage(source *sourceStagedMemberSource) bool {
	if source == nil || source.coverage == nil {
		return false
	}
	c := source.coverage
	n := c.nativeObserver
	return n.get != nil && ast.IsCallExpression(n.request.use) && n.request.producer.selector == (sourceStagedOperationSelector{}) && validStagedMemberParent(n.request) && sameOperationRequest(n.request, source.parent) && n.request.producer.operation == n.request.use && n.get == n.request.use.Expression() && n.cut == c.cut && n.cut.operation == n.cut.reading && n.cut.initializing == n.request.use
}

// prepareNativeObserverInputs records only the original C observation before
// nested acquisition. The actual writer registration below issues each reader;
// potential invocations are not the C candidate operation inventory.
func (work *callableEffectWork) prepareNativeObserverInputs(facts []callableFacts, q *sourceValueQuery) {
	b, n := q.stagedMember, q.stagedNativeGet
	if b == nil || n == nil || n.issuer != q || n.sourceWork != work || n.sourceEpoch != nil && n.sourceEpoch != work.operationEpoch || n.owner != q.owner || n.generation != work.operationGeneration || b.coverage == nil || !q.liveStagedMemberSource(b, b.get, b.read) || !sameOperationRequest(n.getRequest, b.request) {
		return
	}
	prefix, valid := work.memberCallResultCoverage(q)
	if !valid {
		return
	}
	if _, known := work.operationRecipes[prefix.key]; !known && !work.registerOperationRecipe(facts, prefix) {
		return
	}
	if b.nativeEntry != nil && !work.enrollNativeEntryCoverage(facts, q, prefix) {
		n.entryRefused = true
		b.represented = false
		return
	}
	n.observations = appendEntryLawRequirement(n.observations, b.coverage.request)
}

// nativeObserverRequirements keeps the original C in the source inventory and
// its typed reader in the selected premises. It only assembles a description;
// the live caller still owns registration, adoption and semantic observation.
func (work *callableEffectWork) nativeObserverRequirements(recipe sourceStagedOperationRecipe, coverage, reading sourceStagedOperationRequest) (sourceStagedOperationRecipe, bool) {
	source := recipe.nativeGet
	c := work.operationRecipes[coverage.producer]
	if source == nil || recipe.key != nativeRootDebtRequest(source, "callee-get").producer || !validNativeGetRecipe(recipe) || !validStagedMemberCoverageRecipe(c) || !validNativeObserverCoverage(c.memberSource) || c.memberSource.generation != work.operationGeneration || !sameOperationRequest(c.memberSource.request, coverage) || !sameOperationRequest(c.memberSource.parent, source.request) || !sameOperationRequest(c.memberSource.coverage.nativeObserver.request, source.request) || c.memberSource.coverage.nativeObserver.get != source.get {
		return sourceStagedOperationRecipe{}, false
	}
	represented := false
	if reading.reading == coverage.producer {
		producer := work.operationRecipes[reading.producer]
		represented = work.describedWriterSourceReading(reading) && sameOperationRequest(reading, writerSourceReading(producer, coverage))
	} else if reading.reading == recipe.key {
		for _, association := range source.observerInputs {
			represented = represented || validNativeObserverInput(source, association) && sameOperationRequest(association.request, reading) && sameOperationRequest(association.coverage, coverage) && association.observer == c.memberSource.coverage.nativeObserver
		}
	}
	// Never recategorize an already sealed selection premise. The original
	// pending builder must issue this inventory membership in the right role.
	if !represented || operationContainsRequest(source.selectionRequired, coverage) {
		return sourceStagedOperationRecipe{}, false
	}
	copy := *source
	copy.memberSources = appendEntryLawRequirement(append([]sourceStagedOperationRequest(nil), source.memberSources...), coverage)
	copy.selectionRequired = appendEntryLawRequirement(append([]sourceStagedOperationRequest(nil), source.selectionRequired...), reading)
	recipe.nativeGet = &copy
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, coverage)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, reading)
	return recipe, validNativeGetRecipe(recipe)
}

// bindNativeObserverInput authenticates this actual scoped writer request.
// Cross-owner Calls have no function-owned pendingMember source ticket; the
// original request identity and its existing native observer own this reader.
// The module producer and its namespace are unchanged.
func (work *callableEffectWork) bindNativeObserverInput(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest, producer sourceStagedOperationRecipe, current bool) {
	if declarationWriterScopeReading(r) {
		return
	}
	n := q.stagedNativeGet
	if r == nil || n == nil || n.issuer != q || n.sourceWork != work || n.sourceEpoch != nil && n.sourceEpoch != work.operationEpoch || n.owner != q.owner || n.generation != work.operationGeneration || !r.live || r.issuer != q || r.graph != q.executable.writerInputFacts[q.effectOwner] || r.consumer != q.effectOwner || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) {
		return
	}
	consumer, known := work.memberNodes[q.effectOwner]
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if !known || publisher == nil || !publisher.live || publisher.fact != &facts[consumer] {
		return
	}
	// The registrar lends its already authenticated candidate on this stack.
	// Re-selecting here could replace an issued pending reader with a different
	// source identity before its exact child/adoption had succeeded.
	if producer.key.operation != r.call || !current && !work.requestedWriterSourceSupported(producer) {
		return
	}
	if !work.writerSourceRegistrationCompatible(r, nativeObserverProducerRequest(producer)) {
		return
	}
	// A pending native-input recipe already owns its full original Call/Get.
	// A request-only method has not issued that Call factory yet; its exact
	// reader owns the source task and receives all full-source children when
	// the original method callback refines the producer.
	if !current && producer.nativeGet != nil {
		root := work.operationRecipes[producer.nativeGet.request.producer]
		if !validNativeGetRecipe(root) || !sameNativeGetSource(root.nativeGet, producer.nativeGet) || !operationContainsRequest(producer.delta.required, producer.nativeGet.request) {
			return
		}
	}
	calleeKey := nativeRootDebtRequest(&sourceStagedNativeGetSource{request: n.getRequest, get: n.call.Expression()}, "callee-get").producer
	for _, coverageRequest := range n.observations {
		parent := work.operationRecipes[coverageRequest.producer].memberSource
		if !validNativeObserverCoverage(parent) || !sameOperationRequest(parent.coverage.nativeObserver.request, n.getRequest) || q.relativeInputCut(parent.coverage.cut.operation) != parent.coverage.cut {
			continue
		}
		callee := work.operationRecipes[calleeKey]
		if !validNativeGetRecipe(callee) || !sameOperationRequest(callee.nativeGet.request, n.getRequest) {
			continue
		}
		association := sourceStagedNativeObserverInput{source: nativeObserverProducerRequest(producer), coverage: coverageRequest, observer: parent.coverage.nativeObserver}
		association.request = nativeObserverInputReading(association.source, association.coverage, callee.nativeGet)
		copy := *callee.nativeGet
		copy.observerInputs = append([]sourceStagedNativeObserverInput(nil), copy.observerInputs...)
		found := false
		for _, prior := range copy.observerInputs {
			found = found || sameNativeObserverInput(prior, association)
		}
		if !found {
			copy.observerInputs = append(copy.observerInputs, association)
		}
		callee.nativeGet = &copy
		var described bool
		callee, described = work.nativeObserverRequirements(callee, coverageRequest, association.request)
		if !described {
			continue
		}
		if current {
			selected := *callee.nativeGet
			selected.selectionRequired = appendEntryLawRequirement(selected.selectionRequired, nativeObserverProducerRoot(producer))
			callee.nativeGet = &selected
			callee.delta.required = appendEntryLawRequirement(callee.delta.required, nativeObserverProducerRoot(producer))
		}
		if !validNativeGetRecipe(callee) || !work.attachOperationSource(facts, callee) {
			continue
		}
		if _, adopted := work.requireOperation(facts, coverageRequest); !adopted {
			continue
		}
		id, adopted := work.requireOperation(facts, association.request)
		if !adopted {
			continue
		}
		work.requireWriterSourceAvailability(facts, consumer, producer, n.getRequest)
		work.publishNativeObserverProducer(facts, id, q.executable)
		work.attachWriterSourceDependencies(facts, id)
		// Commit the complete association only after its original Get factory,
		// exact C membership and real reader adoption have all succeeded.
		r.writerSource, r.writerSourceWork, r.writerSourceIssuer, r.writerSourceReading = association.source, work, r, association.request
		r.nativeReadings = appendEntryLawRequirement(r.nativeReadings, association.request)
	}
	if len(r.nativeReadings) != 0 {
		n.sourceEpoch = work.operationEpoch
		r.nativeIssuer = r
	}
}

func (work *callableEffectWork) consumeNativeObserverInput(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest) sourceStagedWriterCallDisposition {
	n := q.stagedNativeGet
	if n == nil || n.sourceEpoch == nil || n.sourceEpoch != work.operationEpoch {
		return sourceStagedWriterCallDisposition{}
	}
	if r == nil || r.nativeIssuer != r || r.writerSourceWork != work || r.writerSourceIssuer != r || n == nil || n.issuer != q || n.sourceWork != work || n.sourceEpoch != nil && n.sourceEpoch != work.operationEpoch || n.owner != q.owner || n.generation != work.operationGeneration || !r.live || r.issuer != q || r.consumer != q.effectOwner || r.use != q.effectUse() || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) || q.inputs != nil || q.operation != nil || len(r.nativeReadings) == 0 {
		return sourceStagedWriterCallDisposition{}
	}
	var producer sourceStagedOperationRecipe
	for index, reading := range r.nativeReadings {
		association, provided := work.nativeObserverInputAssociation(reading)
		if !provided || !sameOperationRequest(association.observer.request, n.getRequest) || q.relativeInputCut(association.observer.cut.operation) != association.observer.cut || !sameOperationRequest(association.source, r.writerSource) || !work.describedNativeObserverReading(reading) {
			return sourceStagedWriterCallDisposition{}
		}
		if index == 0 {
			var current bool
			producer, current = work.currentEnrolledNativeObserverProducer(facts, q, r.call, association.source)
			if !current {
				return sourceStagedWriterCallDisposition{}
			}
		}
		if reading.producer != producer.key {
			return sourceStagedWriterCallDisposition{}
		}
		id, adopted := work.operationIDs[reading.producer]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return sourceStagedWriterCallDisposition{}
		}
		work.publishNativeObserverProducer(facts, id, q.executable)
		delivery, delivered := work.consumeOperation(id, reading)
		state := &work.operations[id.index]
		if !delivered || !delivery.delta.extracted || state.invalid || !operationDeltaPrefix(producer.delta, state.delta) || !operationDeltaPrefix(state.delta, producer.delta) {
			return sourceStagedWriterCallDisposition{}
		}
	}
	// Commit only after every exact reader is represented. Independent Call,
	// callee, eager, Proxy and Throw children remain in the original graph.
	n.selectionRequired = appendEntryLawRequirement(n.selectionRequired, nativeObserverProducerRoot(producer))
	for _, reading := range r.nativeReadings {
		n.selectionRequired = appendEntryLawRequirement(n.selectionRequired, reading)
	}
	return sourceStagedWriterCallDisposition{handled: true, excluded: true}
}

// deliverNativeInputObserver schedules the exact applied reader, preserving
// every full factory and the producer's separate physical observation cut.
func (work *callableEffectWork) deliverNativeInputObserver(use sourceStagedOperationUse, delta sourceStagedOperationDelta) bool {
	recipe := work.operationRecipes[use.request.producer]
	if !work.nativeObserverProducerCurrent(recipe) && !work.requestedWriterSourceSupported(recipe) || use.call != nil || use.installed != nil || len(delta.effects)+len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals) != 0 {
		return false
	}
	if !delta.extracted {
		return work.requestedWriterSourceSupported(recipe) && (sameOperationRequest(use.request, nativeObserverProducerRequest(recipe)) || work.describedNativeObserverReading(use.request))
	}
	if use.request.reading == (sourceStagedOperationKey{}) {
		return sameOperationRequest(use.request, nativeObserverProducerRequest(recipe))
	}
	if !work.acceptedNativeObserverReading(use.request) {
		return false
	}
	association, native := work.nativeObserverInputAssociation(use.request)
	if !native {
		return true
	} // Existing same-owner direct member consumer.
	id, adopted := work.operationIDs[association.coverage.producer]
	producer, provided := work.operationIDs[use.request.producer]
	if !adopted || !provided || id.epoch != work.operationEpoch || producer.epoch != work.operationEpoch || id.index == 0 || producer.index == 0 {
		return false
	}
	state := &work.operations[producer.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{use.request.consumer, use.request.edge}]
	if subscriber == nil || subscriber.blocked || !delta.extracted {
		return false
	}
	if _, owned := work.nativeEffectsObserverOwner(use.request, association); owned {
		// The normal post-ACK hook observes this exact subscriber's APPLIED
		// revision and coalesces the already adopted full-Get source task.
		return true
	}
	if subscriber.applied == state.revision || subscriber.nativeInputObserved == state.revision {
		return true
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if !task.operationDone && task.operation == id && task.nativeInputRevision == state.revision && sameOperationRequest(task.nativeInputReading, use.request) {
			return true
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[use.request.consumer], operation: id, nativeInputReading: use.request, nativeInputRevision: state.revision})
	return true
}

func (work *callableEffectWork) refreshNativeInputObserver(facts []callableFacts, task callableExtractionTask, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration || !work.acceptedNativeObserverReading(task.nativeInputReading) {
		return
	}
	parent := work.operationRecipes[work.operations[task.operation.index].key]
	association, provided := work.nativeObserverInputAssociation(task.nativeInputReading)
	if !provided || association.coverage.producer != parent.key || !validNativeObserverCoverage(parent.memberSource) {
		return
	}
	id, provided := work.operationIDs[task.nativeInputReading.producer]
	if !provided || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{task.nativeInputReading.consumer, task.nativeInputReading.edge}]
	if subscriber == nil || subscriber.blocked || subscriber.applied != task.nativeInputRevision || state.revision != task.nativeInputRevision || subscriber.nativeInputObserved >= task.nativeInputRevision {
		return
	}
	if _, owned := work.nativeEffectsObserverOwner(task.nativeInputReading, association); owned {
		// A physical task may have been queued before the original ordinary
		// demand installed its source continuation. Never start that narrower
		// query after the authenticated full-Get owner has taken responsibility.
		work.afterWriterSourcePrerequisite(id, task.nativeInputReading)
		return
	}
	observer := association.observer
	source := work.operationRecipes[observer.request.producer].nativeGet
	if source == nil || source.get != observer.get || !sameOperationRequest(source.request, observer.request) {
		return
	} // No invented native root or selected branch.
	observation, revoke := work.beginNativeSourceObservation(facts, owner, task, association.coverage)
	defer revoke()
	if observation == nil {
		return
	}
	if !work.observeNativeCalleeSource(facts, source, owner, &observer.cut, observation) {
		return
	}
	work.operations[id.index].subscribers[sourceStagedOperationConsumer{task.nativeInputReading.consumer, task.nativeInputReading.edge}].nativeInputObserved = task.nativeInputRevision
}

// sourceStagedNativeObserverInput preserves both factories: the module/function
// producer owns its Get cut; this reader owns the native observer's C and cut.
type sourceStagedNativeObserverInput struct {
	source, request, coverage sourceStagedOperationRequest
	observer                  sourceStagedNativeObserver
}

func nativeObserverInputReading(source, coverage sourceStagedOperationRequest, parent *sourceStagedNativeGetSource) sourceStagedOperationRequest {
	var reading sourceStagedOperationRequest
	switch source.producer.selector.field {
	case "direct-input-invocation":
		reading = nativeInputInvocationReading(source, coverage)
	case "callee-alternatives", "native-input-source-request", "descriptor-callee-source-request":
		reading = stagedStandardMemberCallReading(source, coverage)
	default:
		return sourceStagedOperationRequest{}
	}
	reading.reading = nativeRootDebtRequest(parent, "callee-get").producer
	// The validated C factory already includes its original parent occurrence,
	// context and producer edge. That parent has exactly one callee-Get key.
	// Its reader must remain distinct from the C reader at the same consumer.
	reading.edge += ":native-callee-get"
	return reading
}

func sameNativeObserverInput(a, b sourceStagedNativeObserverInput) bool {
	return sameOperationRequest(a.source, b.source) && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.coverage, b.coverage) && a.observer == b.observer
}

func validNativeObserverInput(source *sourceStagedNativeGetSource, input sourceStagedNativeObserverInput) bool {
	r := input.source
	c := input.coverage
	n := input.observer
	if source == nil || !validStagedMemberParent(n.request) || !ast.IsCallExpression(n.request.use) || n.get != source.get || !sameOperationRequest(n.request, source.request) || n.cut.operation == nil || n.cut.operation != n.cut.reading || n.cut.initializing != n.request.use || c.producer.selector.association == nil || !sameOperationRequest(c, stagedMemberCoverageRequest(source.request, c.producer.selector.association, n.cut)) {
		return false
	}
	call := r.producer.operation
	if call == nil || !ast.IsCallExpression(call) || !sourceStagedOccurrenceOwned(call, r.producer.declaration) || r.consumer != r.producer.declaration || r.producer.kind != relativeDemandEffects || r.inputs != nil || r.use != call || r.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || r.reading != (sourceStagedOperationKey{}) || (r.producer.selector != (sourceStagedOperationSelector{occurrence: call.Expression(), field: "direct-input-invocation"}) && r.producer.selector != (sourceStagedOperationSelector{occurrence: call.Expression(), field: "callee-alternatives"}) && r.producer.selector != (sourceStagedOperationSelector{occurrence: call.Expression(), field: "native-input-source-request"}) && r.producer.selector != (sourceStagedOperationSelector{occurrence: call.Expression(), field: "descriptor-callee-source-request"})) {
		return false
	}
	return sameOperationRequest(input.request, nativeObserverInputReading(r, c, source))
}

func (work *callableEffectWork) nativeObserverInputAssociation(request sourceStagedOperationRequest) (sourceStagedNativeObserverInput, bool) {
	parent := work.operationRecipes[request.reading]
	if parent.memberSource != nil && validStagedMemberCoverageRecipe(parent) && validNativeObserverCoverage(parent.memberSource) {
		producer := work.operationRecipes[request.producer]
		if (work.nativeObserverProducerCurrent(producer) || work.requestedWriterSourceSupported(producer)) && sameOperationRequest(request, writerSourceReading(producer, parent.memberSource.request)) {
			return sourceStagedNativeObserverInput{source: nativeObserverProducerRequest(producer), request: request, coverage: parent.memberSource.request, observer: parent.memberSource.coverage.nativeObserver}, true
		}
	}
	if parent.nativeGet == nil || request.reading != nativeRootDebtRequest(parent.nativeGet, "callee-get").producer || !validNativeGetRecipe(parent) {
		return sourceStagedNativeObserverInput{}, false
	}
	for _, association := range parent.nativeGet.observerInputs {
		if !sameOperationRequest(association.request, request) || !validNativeObserverInput(parent.nativeGet, association) {
			continue
		}
		coverage := work.operationRecipes[association.coverage.producer]
		if !validStagedMemberCoverageRecipe(coverage) || coverage.memberSource.generation != work.operationGeneration || !validNativeObserverCoverage(coverage.memberSource) || coverage.memberSource.coverage.nativeObserver != association.observer {
			continue
		}
		producer := work.operationRecipes[association.source.producer]
		if (work.nativeObserverProducerCurrent(producer) || work.requestedWriterSourceSupported(producer)) && sameOperationRequest(nativeObserverProducerRequest(producer), association.source) {
			return association, true
		}
	}
	return sourceStagedNativeObserverInput{}, false
}

// reconnectNativeObserver restores only a task's already-issued association on
// a fresh source issuer. It does not install the prior member loan, observation
// stamp, callee receipt or any acquired value; receiverCandidates still owns
// the actual original Get observation.
func (work *callableEffectWork) reconnectNativeObserver(q *sourceValueQuery, request sourceStagedOperationRequest) bool {
	if q == nil || q.owner == nil || q.owner.generation != work.operationGeneration || q.inputs != nil || q.operation != nil {
		return false
	}
	n := q.stagedNativeGet
	if n == nil || n.issuer != q || n.sourceWork != work || n.sourceEpoch != work.operationEpoch || n.generation != work.operationGeneration || n.owner != q.owner {
		return false
	}
	recipe := work.operationRecipes[request.producer]
	id, adopted := work.operationIDs[request.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid || !validStagedMemberCoverageRecipe(recipe) || !sameOperationRequest(recipe.memberSource.request, request) || recipe.memberSource.generation != work.operationGeneration || !validNativeObserverCoverage(recipe.memberSource) {
		return false
	}
	observer := recipe.memberSource.coverage.nativeObserver
	if !sameOperationRequest(observer.request, n.getRequest) || n.call.Expression() != observer.get || q.effectOwner != request.consumer || q.relativeInputCut(observer.cut.operation) != observer.cut {
		return false
	}
	n.observations = appendEntryLawRequirement(n.observations, request)
	return true
}

// The shared association/lifetime does not conflate its semantic producers.
// Both cases answer only direct writer/input invocation discovery.
func (work *callableEffectWork) nativeObserverProducerCurrent(recipe sourceStagedOperationRecipe) bool {
	if descriptorCalleeRequested(recipe) {
		return false
	} // Callee-only delivery never grants whole-Call exclusion.
	if recipe.nativeGet != nil {
		return work.nativeInputInvocationCurrent(recipe)
	}
	if nativeWriterSourceRequested(recipe) {
		return work.nativeWriterSourceRequestCurrent(recipe)
	}
	m := recipe.memberSource
	return validStagedMemberCallRecipe(recipe) && m.generation == work.operationGeneration && m.call.complete && recipe.delta.extracted && len(m.call.standard) != 0 && len(m.call.values) == 0 && work.memberCoverageObserved[recipe.key] == work.operationGeneration
}

func nativeObserverProducerRequest(recipe sourceStagedOperationRecipe) sourceStagedOperationRequest {
	if recipe.nativeGet != nil {
		return recipe.nativeGet.inputInvocation.request
	}
	return recipe.memberSource.request
}

func nativeObserverProducerRoot(recipe sourceStagedOperationRecipe) sourceStagedOperationRequest {
	if recipe.nativeGet != nil {
		return recipe.nativeGet.request
	}
	return recipe.memberSource.parent
}

func (work *callableEffectWork) describedNativeObserverReading(request sourceStagedOperationRequest) bool {
	return work.describedNativeInputInvocationReading(request) || work.acceptedStandardMemberCallReading(request)
}

func (work *callableEffectWork) acceptedNativeObserverReading(request sourceStagedOperationRequest) bool {
	return work.acceptedNativeInputInvocationReading(request) || work.acceptedStandardMemberCallReading(request)
}

func (work *callableEffectWork) currentNativeObserverProducer(facts []callableFacts, q *sourceValueQuery, call *ast.Node) (sourceStagedOperationRecipe, bool) {
	if recipe, current := work.currentNativeInputInvocationSource(call); current {
		return recipe, true
	}
	if recipe, current := work.currentNativeWriterSourceRequest(call); current {
		return recipe, true
	}
	request, owner, provided := work.nativeObserverConstructedRequest(facts, q, call)
	if !provided {
		return sourceStagedOperationRecipe{}, false
	}
	recipe := work.operationRecipes[request.producer]
	if !work.nativeObserverProducerCurrent(recipe) || !sameOperationRequest(recipe.memberSource.request, request) || !work.nativeObserverConstructedSourcesCurrent(facts, owner, recipe, q.executable) {
		return sourceStagedOperationRecipe{}, false
	}
	return recipe, true
}

// The reading names its actual producer; a newly available direct description
// cannot replace that identity or lend an unrelated required-prefix template.
func (work *callableEffectWork) currentEnrolledNativeObserverProducer(facts []callableFacts, q *sourceValueQuery, call *ast.Node, request sourceStagedOperationRequest) (sourceStagedOperationRecipe, bool) {
	recipe := work.operationRecipes[request.producer]
	if recipe.key.operation != call || !work.nativeObserverProducerCurrent(recipe) || !sameOperationRequest(nativeObserverProducerRequest(recipe), request) {
		return sourceStagedOperationRecipe{}, false
	}
	if recipe.nativeGet != nil || nativeWriterSourceRequested(recipe) {
		return recipe, true
	}
	original, owner, provided := work.nativeObserverConstructedRequest(facts, q, call)
	if !provided || !sameOperationRequest(original, request) || !work.nativeObserverConstructedSourcesCurrent(facts, owner, recipe, q.executable) {
		return sourceStagedOperationRecipe{}, false
	}
	return recipe, true
}

// nativeObserverConstructedRequest retains the original constructed-source
// owner and namespace; the description grants no selected/current result.
func (work *callableEffectWork) nativeObserverConstructedRequest(facts []callableFacts, q *sourceValueQuery, call *ast.Node) (sourceStagedOperationRequest, int, bool) {
	owner, provided := work.memberNodes[stagedNativeInputInvocationOwner(call)]
	if !provided {
		return sourceStagedOperationRequest{}, 0, false
	}
	occurrence := stagedConstructedOccurrenceAt(&facts[owner], call, q.executable)
	if occurrence == nil {
		return sourceStagedOperationRequest{}, 0, false
	}
	request := occurrence.request
	request.producer.selector = sourceStagedOperationSelector{occurrence: call.Expression(), field: "callee-alternatives"}
	request.edge += ":callee-alternatives"
	return request, owner, true
}

// nativeObserverConstructedSourcesCurrent checks every original selected
// method-use premise after the exact source relationship has been identified.
func (work *callableEffectWork) nativeObserverConstructedSourcesCurrent(facts []callableFacts, owner int, recipe sourceStagedOperationRecipe, executable *executableBodyOwner) bool {
	for i := range recipe.memberSource.call.standard {
		if !work.constructedStandardMethodCovered(facts, owner, &recipe.memberSource.call.standard[i], executable) {
			return false
		}
	}
	return true
}

func (work *callableEffectWork) publishNativeObserverProducer(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	if recipe.nativeGet != nil {
		work.publishNativeInputInvocation(id)
		return
	}
	work.prepareStagedMemberCall(facts, id, owner)
}
