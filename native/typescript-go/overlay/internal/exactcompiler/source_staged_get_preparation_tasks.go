package exactcompiler

import "slices"

// The dispatcher lends this one execution only to the same original source Get
// owner. No query, binder or physical Get is stored on the work graph.
type sourceStagedGetPreparationExecution struct {
	self    *sourceStagedGetPreparationExecution
	work    *callableEffectWork
	id      sourceStagedOperationID
	owner   *executableBodyOwner
	fact    *callableFacts
	claimed bool
}

func (e *sourceStagedGetPreparationExecution) claim(work *callableEffectWork, id sourceStagedOperationID, owner *executableBodyOwner, fact *callableFacts) bool {
	if e == nil || e.self != e || e.work != work || e.id != id || e.owner != owner || e.fact != fact || e.claimed {
		return false
	}
	e.claimed = true
	return true
}
func (work *callableEffectWork) getPreparationTaskSource(id sourceStagedOperationID) *sourceStagedMemberSource {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operationGeneration == nil || !work.operationGeneration.active {
		return nil
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !state.dependenciesRegistered || work.operationIDs[state.key] != id || !validStagedGetPreparationRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration {
		return nil
	}
	return recipe.memberSource
}

// getPreparationTaskDependencies watches only this exact original Get's
// enrolled C children in addition to its declared SOURCE roots. C remains on
// the original Get-effects producer; these backrefs only schedule fresh work.
func (work *callableEffectWork) getPreparationTaskDependencies(id sourceStagedOperationID) []sourceStagedOperationDependency {
	source := work.getPreparationTaskSource(id)
	if source == nil {
		return nil
	}
	dependencies := append([]sourceStagedOperationDependency(nil), work.operations[id.index].dependencies...)
	if source.getPreparation.plain {
		get := work.operationRecipes[source.parent.producer]
		if validStagedMemberExternalGetRecipe(get) && sameOperationRequest(get.memberSource.protocolSource.get.preparation, source.request) {
			id := work.operationIDs[get.key]
			if id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) && !work.operations[id.index].invalid {
				for _, d := range work.operations[id.index].dependencies {
					if d.producer != work.operationIDs[source.request.producer] {
						dependencies = append(dependencies, d)
					}
				}
			}
		}
		return dependencies
	}
	effect := work.operationRecipes[stagedMemberGetEffectsKey(source.parent)]
	if !validStagedMemberGetEffectsRecipe(effect) || !sameOperationRequest(effect.memberSource.parent, source.parent) || !sameOperationRequest(effect.memberSource.getEffects.preparation, source.request) {
		return dependencies
	}
	effectID := work.operationIDs[effect.key]
	if effectID.epoch != work.operationEpoch || effectID.index == 0 || int(effectID.index) >= len(work.operations) || work.operations[effectID.index].invalid {
		return dependencies
	}
	for _, d := range work.operations[effectID.index].dependencies {
		if d.producer == id {
			continue
		}
		seen := false
		for _, prior := range dependencies {
			seen = seen || prior.producer == d.producer && sameOperationRequest(prior.request, d.request)
		}
		if !seen {
			dependencies = append(dependencies, d)
		}
	}
	return dependencies
}
func (work *callableEffectWork) getPreparationObservesDependency(id sourceStagedOperationID, dependency sourceStagedOperationDependency) bool {
	for _, d := range work.getPreparationTaskDependencies(id) {
		if d.producer == dependency.producer && sameOperationRequest(d.request, dependency.request) {
			return true
		}
	}
	return false
}
func (work *callableEffectWork) getPreparationObservationRequests(id sourceStagedOperationID) []sourceStagedOperationRequest {
	var requests []sourceStagedOperationRequest
	for _, d := range work.getPreparationTaskDependencies(id) {
		requests = append(requests, d.request)
	}
	return requests
}

func (work *callableEffectWork) getPreparationTaskOwned(id sourceStagedOperationID) bool {
	if work.getPreparationTaskSource(id) == nil {
		return false
	}
	state := &work.operations[id.index]
	if state.writerSourceRunning {
		return true
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery {
			return true
		}
	}
	revisions := work.sourceObservationRevisions(id)
	changed := state.writerSourceRevisions != nil && revisions != nil && !slices.Equal(state.writerSourceRevisions, revisions)
	for _, dependency := range work.getPreparationTaskDependencies(id) {
		if work.writerSourcePendingDependencyOwned(id, dependency) {
			return true
		}
		if !changed {
			continue
		}
		child := &work.operations[dependency.producer.index]
		sub := child.subscribers[sourceStagedOperationConsumer{dependency.request.consumer, dependency.request.edge}]
		if child.invalid || !child.dependenciesRegistered || sub == nil || sub.blocked || !sameOperationRequest(sub.request, dependency.request) {
			continue
		}
		if slices.Contains(sub.writerSourceParents, id) {
			return true
		}
	}
	return false
}

// getPreparationCurrent authenticates only the original debt enumeration and
// its SOURCE readset. Get/C completion and result DATA use separate producers.
func (work *callableEffectWork) getPreparationCurrent(request sourceStagedOperationRequest) bool {
	id := work.operationIDs[request.producer]
	source := work.getPreparationTaskSource(id)
	if source == nil || !sameOperationRequest(source.request, request) {
		return false
	}
	return work.getPreparationObservedCurrent(id, work.operations[id.index].getPreparationObserved)
}
func (work *callableEffectWork) getPreparationObservedCurrent(id sourceStagedOperationID, observation *sourceStagedGetPreparationObservation) bool {
	source := work.getPreparationTaskSource(id)
	if source == nil {
		return false
	}
	request := source.request
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	observedRequests := work.getPreparationObservationRequests(id)
	if observation == nil || observation.self != observation || observation.id != id || observation.generation != work.operationGeneration || !sameOperationRequest(observation.request, request) || observation.revision != state.revision || state.revision == 0 || !state.delta.extracted || work.memberCoverageObserved[state.key] != work.operationGeneration || !operationDeltaPrefix(state.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, state.delta) || !operationPrefix(observation.observed, observedRequests, sameOperationRequest) || !operationPrefix(observedRequests, observation.observed, sameOperationRequest) || !operationPrefix(observation.required, recipe.delta.required, sameOperationRequest) || !operationPrefix(recipe.delta.required, observation.required, sameOperationRequest) || !slices.Equal(observation.revisions, work.sourceObservationRevisions(id)) {
		return false
	}
	for _, root := range work.operationRecipes[state.key].delta.required {
		if !work.getPreparationSourceRegistered(recipe.memberSource, root) || !work.getPreparationChildCurrent(root) {
			return false
		}
	}
	return true
}
func (work *callableEffectWork) getPreparationReadingCurrent(request sourceStagedOperationRequest) bool {
	if !work.getPreparationCurrent(request) {
		return false
	}
	id := work.operationIDs[request.producer]
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	return sub != nil && !sub.blocked && sameOperationRequest(sub.request, request) && sub.consumed == state.revision && sub.applied == state.revision
}

func (work *callableEffectWork) prepareStagedGetPreparation(facts []callableFacts, task callableExtractionTask, owner *executableBodyOwner) {
	id := task.operation
	source := work.getPreparationTaskSource(id)
	if source == nil || task.delivery || task.nativeInputRevision != 0 || task.nativeTargetRevision != 0 || task.nativeInputReading != (sourceStagedOperationRequest{}) || owner == nil || owner.values == nil || owner.project == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration {
		return
	}
	caller, known := work.memberNodes[source.parent.consumer]
	publisher := owner.pendingMemberPublishers[source.parent.consumer]
	if !known || caller < 0 || caller >= len(facts) || caller >= len(work.operationFacts) || task.callable != caller || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || publisher.fact != &work.operationFacts[caller] || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	work.attachSourceObservationDependencies(facts, id)
	state := &work.operations[id.index]
	revisions := work.sourceObservationRevisions(id)
	if state.writerSourceRunning || revisions == nil || state.writerSourceRevisions != nil && slices.Equal(state.writerSourceRevisions, revisions) {
		return
	}
	issued := false
	for _, queued := range work.extractionQueue {
		issued = issued || queued.operation == id && !queued.delivery && queued.nativeInputRevision == 0 && queued.nativeTargetRevision == 0
	}
	if !issued {
		return
	}
	state.writerSourceRunning = true
	execution := &sourceStagedGetPreparationExecution{work: work, id: id, owner: owner, fact: &facts[caller]}
	execution.self = execution
	defer func() {
		execution.self = nil
		work.operations[id.index].writerSourceRunning = false
		work.attachSourceObservationDependencies(facts, id)
		work.operations[id.index].writerSourceRevisions = append([]uint64(nil), revisions...)
	}()
	// This is the actual original Get source service at its own operation. Writer
	// recovery never calls it, and a paid ACK alone cannot issue its observation.
	if source.getPreparation.plain {
		work.preparePlainGetPreparation(facts, source, owner, execution)
		return
	}
	work.prepareStagedConstructedGetEffectsSource(facts, caller, source.parent.producer.operation, owner, execution)
}

func (work *callableEffectWork) deliverStagedGetPreparation(use sourceStagedOperationUse, delta sourceStagedOperationDelta) bool {
	recipe := work.operationRecipes[use.request.producer]
	return validStagedGetPreparationRecipe(recipe) && sameOperationRequest(use.request, recipe.memberSource.request) && use.call == nil && use.installed == nil && len(delta.effects)+len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals) == 0
}
