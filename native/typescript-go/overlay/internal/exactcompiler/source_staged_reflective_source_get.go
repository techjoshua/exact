package exactcompiler

import "slices"

// sourceStagedReflectiveGetExecution belongs to the actual target dispatcher
// interval. It cannot be copied, retained, or lent as an ordinary Effects task.
type sourceStagedReflectiveGetExecution struct {
	self  *sourceStagedReflectiveGetExecution
	work  *callableEffectWork
	task  *callableExtractionTask
	owner *executableBodyOwner
	fact  *callableFacts
}

func (work *callableEffectWork) reflectiveGetTaskSource(id sourceStagedOperationID) *sourceStagedNativeGetSource {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid || !work.operations[id.index].dependenciesRegistered {
		return nil
	}
	r := work.operationRecipes[work.operations[id.index].key]
	if !validStagedReflectiveTargetRecipe(r) || r.memberSource.generation != work.operationGeneration || r.memberSource.targetSource.resultSupport == nil {
		return nil
	}
	s := r.memberSource.targetSource
	root := work.operationRecipes[s.creating.producer]
	get := work.operationRecipes[s.resultSupport.get.producer]
	coverage := work.operationRecipes[s.parent.producer]
	if !validReflectiveResult(s) || !validNativeGetRecipe(root) || root.nativeGet.kind != sourceNativeObjectCreate || root.nativeGet.method != s.method || !sameOperationRequest(root.nativeGet.request, s.creating) || !validNativeGetRequest(get, s.resultSupport.get) || !sameNativeGetSource(root.nativeGet, get.nativeGet) || !validStagedMemberCoverageRecipe(coverage) || coverage.memberSource.generation != work.operationGeneration || !sameOperationRequest(coverage.memberSource.parent, stagedReflectiveTargetOwner(s)) || !operationContainsRequest(r.delta.required, s.resultSupport.get) {
		return nil
	}
	gid := work.operationIDs[s.resultSupport.get.producer]
	if gid.epoch != work.operationEpoch || gid.index == 0 || int(gid.index) >= len(work.operations) || work.operations[gid.index].invalid || !work.operations[gid.index].dependenciesRegistered {
		return nil
	}
	return root.nativeGet
}

func (execution *sourceStagedReflectiveGetExecution) live(facts []callableFacts) bool {
	if execution == nil || execution.self != execution || execution.work == nil || execution.task == nil || execution.owner == nil || execution.owner.values == nil || execution.owner.project == nil {
		return false
	}
	w, task, owner := execution.work, execution.task, execution.owner
	s := w.reflectiveGetTaskSource(task.operation)
	if s == nil || task.delivery || task.nativeInputRevision != 0 || task.nativeTargetRevision != 0 || task.nativeInputReading != (sourceStagedOperationRequest{}) || owner.values.generation != w.operationGeneration || owner.project.activeGeneration != w.operationGeneration {
		return false
	}
	caller, known := w.memberNodes[s.request.consumer]
	publisher := owner.pendingMemberPublishers[s.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || task.callable != caller || execution.fact != &facts[caller] || publisher == nil || !publisher.live || publisher.fact != execution.fact || execution.fact.sourceFile == nil || owner.values.program.GetSourceFile(execution.fact.sourceFile.FileName()) != execution.fact.sourceFile || !stagedNativeInputSourceOwner(execution.fact, s.request.use, owner) || !stagedNativeInputEligible(s.request.use, execution.fact, owner) {
		return false
	}
	for _, issued := range w.extractionQueue {
		if issued.operation == task.operation && issued.callable == caller && !issued.delivery && issued.nativeInputRevision == 0 && issued.nativeTargetRevision == 0 {
			return true
		}
	}
	return false
}

// The target keeps its full creator debt, but source observation listens to the
// original Get's exact prerequisites rather than waiting for its own closure.
func (work *callableEffectWork) reflectiveGetDependencies(id sourceStagedOperationID) []sourceStagedOperationDependency {
	s := work.reflectiveGetTaskSource(id)
	if s == nil {
		return nil
	}
	gid := work.operationIDs[nativeRootDebtRequest(s, "callee-get").producer]
	result := append([]sourceStagedOperationDependency(nil), work.operations[gid.index].dependencies...)
	for _, d := range work.operations[gid.index].dependencies {
		if d.producer.index == 0 || d.producer.epoch != work.operationEpoch {
			continue
		}
		c := work.operationRecipes[d.request.producer].memberSource
		if c == nil || c.coverage == nil {
			continue
		}
		for _, child := range work.operations[d.producer.index].dependencies {
			if child.producer == id {
				continue
			}
			found := false
			for _, prior := range result {
				found = found || sameOperationRequest(prior.request, child.request)
			}
			if !found {
				result = append(result, child)
			}
		}
	}
	return result
}

func (work *callableEffectWork) observeReflectiveOriginalGet(facts []callableFacts, execution *sourceStagedReflectiveGetExecution) bool {
	if !execution.live(facts) {
		return false
	}
	id := execution.task.operation
	s := work.reflectiveGetTaskSource(id)
	if work.currentNativeCalleeEffects(s) != nil {
		return true
	}
	work.attachSourceObservationDependencies(facts, id)
	before := work.sourceObservationRevisions(id)
	state := &work.operations[id.index]
	if before == nil || state.targetSourceRequested && (state.writerSourceRevisions == nil || slices.Equal(before, state.writerSourceRevisions)) {
		return false
	}
	state.targetSourceRequested = true
	caller := work.memberNodes[s.request.consumer]
	request := sourceStagedNativeRequest{call: s.request.use, get: s.get, request: s.request, algorithmKind: s.kind}
	_, installed := work.observeSelectedNativeGetSource(facts, caller, request, execution.owner)
	if !installed || !execution.live(facts) {
		return false
	}
	// New observations may register further exact reader dependencies. Attach
	// their wakeups before recording the vector actually traversed.
	work.attachSourceObservationDependencies(facts, id)
	if work.currentNativeCalleeEffects(s) == nil {
		owned := false
		for _, d := range work.reflectiveGetDependencies(id) {
			child := &work.operations[d.producer.index]
			sub := child.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
			if sub == nil || sub.blocked || !sameOperationRequest(sub.request, d.request) || child.invalid {
				return false
			}
			if d.producer == id {
				continue
			}
			if work.writerSourceTaskOwned(d.producer) {
				owned = true
			}
			for _, task := range work.extractionQueue[work.extractionHead:] {
				owned = owned || task.operation == d.producer && !task.operationDone && (task.delivery || !child.delta.extracted)
			}
		}
		if !owned {
			return false
		}
	}
	work.operations[id.index].writerSourceRevisions = before
	return true
}
