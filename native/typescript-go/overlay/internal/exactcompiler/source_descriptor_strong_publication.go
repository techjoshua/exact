package exactcompiler

// publishDescriptorStrongRead runs only inside the original member interval.
// Registration precedes local extraction; actual field DATA and complete target
// C remain separate dependencies of this reader and its exact queued resumption.
func (work *callableEffectWork) publishDescriptorStrongRead(facts []callableFacts, q *sourceValueQuery, view sourceNativeDescriptorView, get *sourceGetInputs, read *sourceMemberWriterReadCut, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates) bool {
	if q == nil || q.owner == nil || q.executable == nil || result == nil || get == nil || read == nil || get.receiver.descriptorView == nil || !descriptorViewDataEqual(get.receiver.descriptorView, &view) || get.symbol != nil || get.hasOnly || q.operation != nil || q.returnObservation != nil || !q.dependenciesOnly || !q.stagedFieldWorkOwner(q.executable) {
		return false
	}
	b := q.stagedMember
	if b == nil || b.issuer != q || !q.liveStagedMemberSource(b, get, read) || b.request.producer.operation != get.operation || read.operation != get.operation || b.generation != work.operationGeneration || len(view.projection) != 0 || !work.descriptorRecordReadingOwned(view, b.request, b.observation) {
		return false
	}
	if _, weak := q.descriptorGetEffectsUseOwned(get, read, mode); weak {
		return false
	}
	caller, known := work.memberNodes[b.request.consumer]
	publisher := q.executable.pendingMemberPublishers[b.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	if !work.descriptorRecordViewDelivered(&view) {
		return false
	}
	source := work.operationRecipes[view.source.request.producer].nativeGet
	if !validDescriptorRetrieval(source) || !sameDescriptorRetrieval(source.descriptorRead, &view.source) {
		return false
	}
	target, registered := work.registerDescriptorTargetDemand(facts, source)
	if !registered {
		return false
	}
	d := &sourceDescriptorStrongReader{view: projectNativeDescriptorView(view, nil), parent: b.request, cut: b.observation, mode: mode, field: get.propertyKey, target: target}
	request := descriptorStrongReaderRequest(b.request)
	candidate := sourceStagedMemberCandidate{request: b.request, operation: get.operation, origin: view.delivery.producer.operation, protocol: true, cut: b.observation}
	reader := &sourceStagedMemberSource{parent: b.request, request: request, candidate: candidate, generation: work.operationGeneration, descriptorStrong: d}
	targetRecipe := work.operationRecipes[target.producer]
	required := []sourceStagedOperationRequest{view.delivery, target}
	if targetRecipe.descriptorTarget != nil {
		for _, field := range targetRecipe.descriptorTarget.fields {
			required = appendEntryLawRequirement(required, field.receiver)
			required = appendEntryLawRequirement(required, field.data)
		}
	}
	// No seal is published until target membership has enumerated every child.
	// An enumerated unsupported domain keeps C pending; it does not disappear.
	extracted := targetRecipe.descriptorTarget != nil && targetRecipe.descriptorTarget.enumerated
	recipe := sourceStagedOperationRecipe{key: request.producer, memberSource: reader, delta: sourceStagedOperationDelta{required: required, extracted: extracted}}
	if !validDescriptorStrongReaderRecipe(recipe) {
		return false
	}
	accepted := false
	if _, exists := work.operationRecipes[recipe.key]; exists {
		accepted = work.attachOperationSource(facts, recipe)
	} else {
		accepted = work.registerOperationRecipe(facts, recipe)
	}
	if !accepted || !q.liveStagedMemberSource(b, get, read) {
		return false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[recipe.key] = work.operationGeneration
	id, adopted := work.requireOperation(facts, request)
	if !adopted {
		return false
	}
	work.attachSourceObservationDependencies(facts, id)
	if !work.enrollDescriptorStrongResumption(facts, q, view, get, read, request) {
		b.represented = false
		return false
	}
	work.queueDescriptorTargetTask(target.producer)
	work.publishMemberSourceContributions(id)
	stored, complete := work.descriptorTargetKnownData(source)
	before := len(result.values)
	if stored != nil {
		for _, field := range stored.fields {
			if !descriptorStrongFieldMatches(d.field, field.field) {
				continue
			}
			for _, alternative := range field.alternatives {
				if !q.retainDescriptorDeliveredCallable(alternative, result) {
					complete = false
				}
			}
		}
	}
	// Complete target C cannot establish result-record own-slot shape or account
	// for an inherited result-record getter. Preserve those independent debts.
	b.represented = false
	if !complete {
		result.valueIncomplete = true
	}
	return len(result.values) > before // Actual delivered donor, never registration success.
}

func descriptorStrongFieldMatches(name string, field sourceDescriptorTargetField) bool {
	return name == "value" && field == descriptorTargetValue || name == "get" && field == descriptorTargetGet || name == "set" && field == descriptorTargetSet
}

// queueDescriptorStrongReader schedules only the already-enrolled original Get.
// Child DATA revisions wake it independently of an unchanged C membership row.
func (work *callableEffectWork) queueDescriptorStrongReader(id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !validDescriptorStrongReaderRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration {
		return
	}
	request := frameworkGetResumptionRequest(recipe.memberSource.parent)
	resumeID, adopted := work.operationIDs[request.producer]
	if !adopted || work.frameworkGetResumptionSource(resumeID) == nil {
		return
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == resumeID && !task.operationDone && !task.delivery {
			return
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[request.consumer], operation: resumeID})
}

// Live source enumeration may discover the tail before C can close. Wake its
// actual strong subscribers so known DATA siblings remain visible beside debt.
func (work *callableEffectWork) wakeDescriptorStrongReaders(id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	for _, subscriber := range work.operations[id.index].subscribers {
		if subscriber == nil {
			continue
		}
		for _, parent := range subscriber.writerSourceParents {
			work.queueDescriptorStrongReader(parent)
		}
	}
}
