package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// pendingReflectiveNativeTarget recognizes the live native observer's exact
// adopted target subscription before its selected native root is available.
// Describing this owner grants no selected algorithm or normal Call result.
func (work *callableEffectWork) pendingReflectiveNativeTarget(query *sourceValueQuery, request sourceStagedOperationRequest, source *sourceStagedReflectiveTargetSource) bool {
	borrow := query.stagedNativeGet
	if borrow == nil || borrow.issuer != query || borrow.owner != query.owner || borrow.generation != work.operationGeneration || !sameOperationRequest(borrow.getRequest, source.native.request) || borrow.call != source.native.request.use || source.native.get != borrow.call.Expression() || source.native.cut != query.relativeInputCut(query.stagedMember.get.operation) {
		return false
	}
	coverage := work.operationRecipes[source.parent.producer]
	if !validStagedMemberCoverageRecipe(coverage) {
		return false
	}
	retained := false
	for _, child := range coverage.delta.required {
		retained = retained || sameOperationRequest(child, request)
	}
	if !retained {
		return false
	}
	for _, child := range []sourceStagedOperationRequest{source.parent, request} {
		id, adopted := work.operationIDs[child.producer]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid {
			return false
		}
	}
	id := work.operationIDs[request.producer]
	state := &work.operations[id.index]
	reading := stagedReflectiveTargetReading(source)
	subscriber := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	if subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, reading) {
		return false
	}
	observed := state.delta.extracted && work.memberCoverageObserved[request.producer] == work.operationGeneration
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operationDone || task.operation != id {
			continue
		}
		if !task.delivery && task.nativeTargetRevision == 0 && !state.targetSourceRequested || observed && (task.delivery && state.deliveryQueued || task.nativeTargetRevision == state.revision) {
			return true
		}
	}
	return false
}

// scheduleReflectiveNativeRefresh runs through the existing subscriber delivery
// protocol. The task can observe only the revision actually ACKed by that exact
// native parent; a constructor's independent subscription cannot pay it.
func (work *callableEffectWork) scheduleReflectiveNativeRefresh(request sourceStagedOperationRequest, source *sourceStagedReflectiveTargetSource) bool {
	id, adopted := work.operationIDs[source.request.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !sameOperationRequest(request, stagedReflectiveTargetReading(source)) {
		return false
	}
	state := &work.operations[id.index]
	if state.invalid || !state.delta.extracted || state.revision == 0 || work.memberCoverageObserved[state.key] != work.operationGeneration {
		return false
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if !task.operationDone && task.operation == id && task.nativeTargetRevision == state.revision {
			return true
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[request.consumer], operation: id, nativeTargetRevision: state.revision})
	return true
}

// refreshReflectiveNativeSource is separate from one-shot native extraction and
// its completed-receipt shortcut. A new applied target revision renews only the
// original native callee source query, with its own physical observation cut.
func (work *callableEffectWork) refreshReflectiveNativeSource(facts []callableFacts, task callableExtractionTask, owner *executableBodyOwner) {
	id, revision := task.operation, task.nativeTargetRevision
	if owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration {
		return
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if !validStagedReflectiveTargetRecipe(recipe) || recipe.memberSource.targetSource.native.get == nil || state.invalid || state.revision != revision || state.targetNativeObservedRevision >= revision || work.memberCoverageObserved[state.key] != work.operationGeneration || !state.delta.extracted {
		return
	}
	source := recipe.memberSource.targetSource
	reading := stagedReflectiveTargetReading(source)
	subscriber := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	if subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, reading) || subscriber.applied != revision {
		return
	}
	coverage := work.operationRecipes[source.parent.producer]
	coverageID, adopted := work.operationIDs[source.parent.producer]
	if !adopted || coverageID.epoch != work.operationEpoch || coverageID.index == 0 || int(coverageID.index) >= len(work.operations) || work.operations[coverageID.index].invalid || !validStagedMemberCoverageRecipe(coverage) {
		return
	}
	retained := false
	for _, child := range coverage.delta.required {
		retained = retained || sameOperationRequest(child, source.request)
	}
	if !retained {
		return
	}
	parent := source.native
	root := work.operationRecipes[parent.request.producer]
	if !validNativeGetRecipe(root) || root.nativeGet.get != parent.get || !sameOperationRequest(root.nativeGet.request, parent.request) || owner.values.program.GetSourceFile(ast.GetSourceFileOfNode(root.nativeGet.get).FileName()) != ast.GetSourceFileOfNode(root.nativeGet.get) {
		return
	}
	observation, revoke := work.beginNativeSourceObservation(facts, owner, task, source.parent)
	defer revoke()
	if observation == nil {
		return
	}
	if !work.observeNativeCalleeSource(facts, root.nativeGet, owner, &parent.cut, observation) {
		return
	}
	state = &work.operations[id.index]
	state.targetNativeObservedRevision = revision
}
