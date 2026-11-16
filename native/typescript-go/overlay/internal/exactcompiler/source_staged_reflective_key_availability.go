package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// reflectiveKeyModulePending owns a compiler wait, never a Symbol category or
// a target result. The actual key/Get and APPLIED reader are already current;
// only their separately issued module availability still needs propagation.
func (work *callableEffectWork) reflectiveKeyModulePending(s *sourceStagedReflectiveTargetSource) bool {
	if s == nil || s.keySource == nil || !work.reflectiveKeyInputCurrent(work.operationRecipes[s.request.producer]) {
		return false
	}
	facts, g := work.operationFacts, work.operationGeneration
	if g.program == nil || g.checker == nil || len(facts) == 0 {
		return false
	}
	r := reflectiveKeyReading(s)
	consumer, cok := work.memberNodes[r.consumer]
	producer, pok := work.memberNodes[r.producer.declaration]
	if !cok || !pok || consumer < 0 || producer < 0 || consumer >= len(facts) || producer >= len(facts) {
		return false
	}
	for _, index := range []int{consumer, producer} {
		fact := &facts[index]
		if fact.sourceFile == nil || ast.GetSourceFileOfNode(fact.node) != fact.sourceFile || g.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile {
			return false
		}
	}
	if s.preparation != nil {
		preparation := work.operationRecipes[s.preparation.request.producer]
		reading := stagedReflectiveTargetReading(s)
		if !validStagedGetPreparationRecipe(preparation) || preparation.memberSource.generation != g || !sameOperationRequest(preparation.memberSource.parent, s.preparation.parent) || !operationContainsRequest(preparation.delta.required, reading) || !work.getPreparationTargetReadingOwned(reading) {
			return false
		}
	} else {
		coverage := work.operationRecipes[s.parent.producer]
		phase := work.operationRecipes[stagedReflectiveTargetPhase(s).producer]
		if !validStagedMemberCoverageRecipe(coverage) || coverage.memberSource.generation != g || !sameOperationRequest(coverage.memberSource.request, s.parent) || !sameOperationRequest(coverage.memberSource.parent, stagedReflectiveTargetOwner(s)) || coverage.memberSource.coverage.cut != s.cut || !operationContainsRequest(coverage.delta.required, s.request) || !validNativeGetRecipe(phase) || !operationContainsRequest(phase.delta.required, s.parent) {
			return false
		}
	}
	for _, request := range []sourceStagedOperationRequest{s.parent, s.request, stagedReflectiveTargetReading(s)} {
		id := work.operationIDs[request.producer]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
		state := &work.operations[id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		if state.invalid || !state.dependenciesRegistered || sub == nil || sub.blocked || !sameOperationRequest(sub.request, request) {
			return false
		}
	}
	edge := r.edge + ":module"
	key := sourceStagedDependencyKey{consumer, edge}
	d := work.stagedRequired[key]
	_, issued := work.memberModuleMemberships[key]
	if !issued || d == nil || d.invalid || d.projectionPending || d.producer != producer || d.operation != s.operation || d.cut != s.cut {
		return false
	}
	listed := false
	for _, requirement := range work.memberModuleRequirements[consumer] {
		listed = listed || requirement.producer == producer && requirement.edge == edge
	}
	if !listed {
		return false
	}
	if len(work.stagedRevisions) == 0 {
		// registerCallableEffectWork's canonical source queue always precedes
		// initializePropagation on this same graph. That owner re-enrolls this
		// exact membership before observing a module revision and waking us.
		if len(work.extractionPhases) != len(facts) || len(work.extractionQueue) < len(facts) || work.extractionCalls == nil || len(work.callers) != 0 {
			return false
		}
		for _, index := range []int{consumer, producer} {
			task := work.extractionQueue[index]
			phase := work.extractionPhases[index]
			if task.operation != (sourceStagedOperationID{}) || task.callable != index || phase < callableExtractionQueued || phase > callableExtractionReady {
				return false
			}
		}
		return true
	}
	if len(work.stagedRevisions) != len(facts) || len(work.callers) != len(facts) || len(work.dirty) != len(facts) {
		return false
	}
	if facts[producer].staged.ready && work.stagedRevisions[producer] != 0 && d.consumed == work.stagedRevisions[producer] {
		return false // Availability is complete; it cannot own a pending shell.
	}
	if _, linked := work.memberModuleCallers[[2]int{producer, consumer}]; !linked {
		return false
	}
	for _, caller := range work.callers[producer] {
		if caller == consumer {
			return work.dirty[producer] || work.dirty[consumer] || facts[producer].staged.operationsPending
		}
	}
	return false
}
