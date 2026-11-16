package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeObservation is a synchronous source-entry lease issued by
// an adopted refresh task. It carries no Get receipt, value, scope or frame and
// never enters a recipe or cloned fact. The original query must observe again.
type sourceStagedNativeObservation struct {
	issuer     *sourceStagedNativeObservation
	work       *callableEffectWork
	owner      *executableBodyOwner
	publisher  *sourcePendingMemberPublisher
	fact       *callableFacts
	generation *projectGeneration
	task       callableExtractionTask
	coverage   sourceStagedOperationRequest
	observer   sourceStagedNativeObserver
}

// nativeObservationContext authenticates both existing refresh families against
// their applied subscriber. Their producer cuts and native C cuts stay distinct.
func (work *callableEffectWork) nativeObservationContext(task callableExtractionTask, coverage sourceStagedOperationRequest) (sourceStagedNativeObserver, bool) {
	var none sourceStagedNativeObserver
	id := task.operation
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || task.delivery {
		return none, false
	}
	cID, adopted := work.operationIDs[coverage.producer]
	c := work.operationRecipes[coverage.producer]
	if !adopted || cID.epoch != work.operationEpoch || cID.index == 0 || int(cID.index) >= len(work.operations) || work.operations[cID.index].invalid || !validStagedMemberCoverageRecipe(c) || !validNativeObserverCoverage(c.memberSource) || !sameOperationRequest(c.memberSource.request, coverage) || c.memberSource.generation != work.operationGeneration {
		return none, false
	}
	observer := c.memberSource.coverage.nativeObserver
	caller, known := work.memberNodes[observer.request.consumer]
	if !known || task.callable != caller {
		return none, false
	}
	root := work.operationRecipes[observer.request.producer]
	if !validNativeGetRecipe(root) || root.nativeGet.get != observer.get || !sameOperationRequest(root.nativeGet.request, observer.request) {
		return none, false
	}
	if task.nativeTargetRevision != 0 {
		state := &work.operations[id.index]
		recipe := work.operationRecipes[state.key]
		if task.nativeInputRevision != 0 || task.nativeInputReading != (sourceStagedOperationRequest{}) || state.invalid || state.revision != task.nativeTargetRevision || state.targetNativeObservedRevision >= task.nativeTargetRevision || !state.delta.extracted || !validStagedReflectiveTargetRecipe(recipe) || work.memberCoverageObserved[state.key] != work.operationGeneration {
			return none, false
		}
		source := recipe.memberSource.targetSource
		if source.native != observer || !sameOperationRequest(source.parent, coverage) {
			return none, false
		}
		reading := stagedReflectiveTargetReading(source)
		subscriber := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
		if subscriber == nil || subscriber.blocked || subscriber.applied != task.nativeTargetRevision || !sameOperationRequest(subscriber.request, reading) {
			return none, false
		}
		retained := false
		for _, required := range c.delta.required {
			retained = retained || sameOperationRequest(required, source.request)
		}
		if !retained {
			return none, false
		}
	} else {
		if task.nativeInputRevision == 0 || id != cID || !work.acceptedNativeObserverReading(task.nativeInputReading) {
			return none, false
		}
		association, provided := work.nativeObserverInputAssociation(task.nativeInputReading)
		producer, issued := work.operationIDs[task.nativeInputReading.producer]
		if !provided || !issued || producer.epoch != work.operationEpoch || producer.index == 0 || int(producer.index) >= len(work.operations) || association.observer != observer || !sameOperationRequest(association.coverage, coverage) {
			return none, false
		}
		state := &work.operations[producer.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{task.nativeInputReading.consumer, task.nativeInputReading.edge}]
		if state.invalid || state.revision != task.nativeInputRevision || subscriber == nil || subscriber.blocked || subscriber.applied != task.nativeInputRevision || subscriber.nativeInputObserved >= task.nativeInputRevision || !sameOperationRequest(subscriber.request, task.nativeInputReading) {
			return none, false
		}
	}
	return observer, true
}

func (work *callableEffectWork) beginNativeSourceObservation(facts []callableFacts, owner *executableBodyOwner, task callableExtractionTask, coverage sourceStagedOperationRequest) (*sourceStagedNativeObservation, func()) {
	refuse := func() (*sourceStagedNativeObservation, func()) { return nil, func() {} }
	observer, valid := work.nativeObservationContext(task, coverage)
	if !valid || owner == nil || owner.values == nil || owner.project == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration {
		return refuse()
	}
	issued := false
	for _, queued := range work.extractionQueue {
		issued = issued || !queued.delivery && queued.callable == task.callable && queued.operation == task.operation && queued.nativeTargetRevision == task.nativeTargetRevision && queued.nativeInputRevision == task.nativeInputRevision && sameOperationRequest(queued.nativeInputReading, task.nativeInputReading)
	}
	caller := task.callable
	publisher := owner.pendingMemberPublishers[observer.request.consumer]
	if !issued || caller < 0 || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return refuse()
	}
	lease := &sourceStagedNativeObservation{work: work, owner: owner, publisher: publisher, fact: &facts[caller], generation: work.operationGeneration, task: task, coverage: coverage, observer: observer}
	lease.issuer = lease
	return lease, func() {
		lease.issuer, lease.work, lease.owner, lease.publisher, lease.fact, lease.generation = nil, nil, nil, nil, nil, nil
	}
}

func (work *callableEffectWork) liveNativeSourceObservation(q *sourceValueQuery, request sourceStagedOperationRequest, get *ast.Node, lease *sourceStagedNativeObservation) bool {
	if lease == nil || lease.issuer != lease || lease.work != work || q == nil || q.owner == nil || q.executable != lease.owner || q.executable.project == nil || q.owner.generation != lease.generation || lease.generation != work.operationGeneration || q.executable.project.activeGeneration != lease.generation || q.inputs != nil || q.operation != nil || q.effectOwner != request.consumer || !sameOperationRequest(request, lease.observer.request) || get != lease.observer.get || q.relativeInputCut(lease.observer.cut.operation) != lease.observer.cut {
		return false
	}
	publisher := q.executable.pendingMemberPublishers[request.consumer]
	if publisher != lease.publisher || publisher == nil || !publisher.live || publisher.fact != lease.fact {
		return false
	}
	observer, valid := work.nativeObservationContext(lease.task, lease.coverage)
	return valid && observer == lease.observer
}

// nativePhysicalMemberEntryOwned is the explicit native-source entry case.
// Generic member queries still require their original root reading.
func (q *sourceValueQuery) nativePhysicalMemberEntryOwned(request sourceStagedOperationRequest) bool {
	if q == nil || q.owner == nil {
		return false
	}
	n := q.stagedNativeGet
	return n != nil && n.issuer == q && n.owner == q.owner && n.sourceWork != nil && n.sourceEpoch == n.sourceWork.operationEpoch && n.generation == q.owner.generation && sameOperationRequest(n.getRequest, request) && n.sourceWork.liveNativeSourceObservation(q, request, n.call.Expression(), n.observation)
}
