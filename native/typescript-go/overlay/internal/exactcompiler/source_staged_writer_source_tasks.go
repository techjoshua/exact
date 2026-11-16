package exactcompiler

// writerSourceTaskOwned identifies an adopted source observation or its exact
// prerequisite continuation. It grants no method or native algorithm fact.
// Each executor must separately validate its original source description.
func (work *callableEffectWork) writerSourceTaskOwned(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe, described := work.operationRecipes[state.key]
	if !described || state.invalid || !state.dependenciesRegistered || !validStagedMemberCallRecipe(recipe) && !validNativeInputInvocationRecipe(recipe) {
		return false
	}
	if state.writerSourceRunning {
		return true
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery {
			return true
		}
	}
	if work.nativeWriterSourceCallerPendingOwned(id) {
		return true
	}
	// A request may acquire real prerequisites during its first source task,
	// before that task can retain a revision vector. Its unpaid subscribers
	// still own the original continuation; they do not make the source current.
	if state.writerSourceRevisions == nil {
		for _, dependency := range state.dependencies {
			if work.writerSourcePendingDependencyOwned(id, dependency) {
				return true
			}
		}
		return false
	}
	for _, dependency := range state.dependencies {
		child := &work.operations[dependency.producer.index]
		subscriber := child.subscribers[sourceStagedOperationConsumer{dependency.request.consumer, dependency.request.edge}]
		if subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, dependency.request) {
			continue
		}
		for _, parent := range subscriber.writerSourceParents {
			if parent == id {
				return true
			}
		}
	}
	return false
}

// writerSourcePendingDependencyOwned authenticates an unpaid, already adopted
// child of an unobserved source. A paid edge or a self-edge cannot keep a source
// pending merely because its first observation has not been retained.
func (work *callableEffectWork) writerSourcePendingDependencyOwned(id sourceStagedOperationID, dependency sourceStagedOperationDependency) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || dependency.producer == id || dependency.producer.epoch != work.operationEpoch || dependency.producer.index == 0 || int(dependency.producer.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !state.dependenciesRegistered || (!work.requestedWriterSourceSupported(recipe) && work.nativeScopeGetTaskSource(id) == nil && work.getPreparationTaskSource(id) == nil) || (!operationContainsRequest(recipe.delta.required, dependency.request) && (work.getPreparationTaskSource(id) == nil || !work.getPreparationObservesDependency(id, dependency))) {
		return false
	}
	child := &work.operations[dependency.producer.index]
	if child.invalid || !child.dependenciesRegistered || child.key != dependency.request.producer {
		return false
	}
	subscriber := child.subscribers[sourceStagedOperationConsumer{dependency.request.consumer, dependency.request.edge}]
	if subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, dependency.request) || child.revision != 0 && child.delta.extracted && subscriber.consumed == child.revision && subscriber.applied == child.revision {
		return false
	}
	for _, parent := range subscriber.writerSourceParents {
		if parent == id {
			return true
		}
	}
	return false
}

// writerSourceTaskRunning authenticates the current executor interval and its
// canonical fact publisher. Descriptions and queued tasks alone cannot issue a
// fresh source observation, including after a facts clone.
func (work *callableEffectWork) writerSourceTaskRunning(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || owner.project == nil || owner.values.generation == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || !work.writerSourceTaskOwned(id) || !work.operations[id.index].writerSourceRunning {
		return false
	}
	state := &work.operations[id.index]
	caller, known := work.memberNodes[state.key.declaration]
	publisher := owner.pendingMemberPublishers[state.key.declaration]
	if !known || caller < 0 || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].node != state.key.declaration || facts[caller].sourceFile == nil {
		return false
	}
	return owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) == facts[caller].sourceFile
}
