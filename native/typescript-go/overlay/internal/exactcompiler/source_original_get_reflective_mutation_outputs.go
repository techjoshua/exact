package exactcompiler

// originalReflectiveGetterMutationOutputs projects one already-owned
// reflective candidate through its actual installed getter readers. It never
// treats the installing Call's writes as mutation output of the later Get.
// Complete means this candidate's conditional output alternatives are fully
// described and delivered, not that the enclosing Get/C Effects are complete.
// Those Effects and every sibling remain required debt at the final consumer.
// Missing alternatives retain known prefixes and leave completeness false.
func (work *callableEffectWork) originalReflectiveGetterMutationOutputs(facts []callableFacts, source *sourceOriginalGetMutationSource, candidate, field sourceStagedOperationRequest) (sourceStagedOperationDelta, []sourceStagedFieldForward, bool) {
	var delta sourceStagedOperationDelta
	if source == nil || source.record == nil || !validOriginalRecordGetMutationSource(source) || source.generation != work.operationGeneration || !operationContainsRequest(source.population, candidate) {
		return delta, nil, false
	}
	registered := work.operationRecipes[originalGetMutationRequest(source).producer]
	if !work.originalGetMutationCurrent(registered) || !sameOriginalGetMutationSource(registered.memberSource.originalGetMutation, source) {
		return delta, nil, false
	}
	coverage := work.operationRecipes[source.coverage.producer]
	if !validStagedMemberCoverageRecipe(coverage) || !operationContainsRequest(coverage.delta.required, candidate) {
		return delta, nil, false
	}
	member := work.operationRecipes[candidate.producer]
	if !work.reflectiveContributionCurrent(member) || !sameOperationRequest(member.memberSource.request, candidate) || !sameOperationRequest(member.memberSource.parent, source.request) || member.memberSource.candidate.cut != source.queryCut {
		return delta, nil, false
	}
	contribution := member.memberSource.reflectiveContribution
	readerRequest := descriptorRecordGetEffectsRequest(source.request)
	if contribution.purpose != reflectiveContributionRecordGet || !sameOperationRequest(contribution.reader, readerRequest) || len(contribution.data) != 1 {
		return delta, nil, false
	}
	exposureRequest := contribution.data[0]
	readerRecipe := work.operationRecipes[readerRequest.producer]
	exposureRecipe := work.operationRecipes[exposureRequest.producer]
	if !work.originalRecordGetMutationReaderCurrent(readerRecipe) || !work.validDescriptorRecordInstallationReading(exposureRecipe, exposureRequest, readerRecipe) {
		return delta, nil, false
	}
	// The lexical record parent identifies this Get but is not an executable
	// task. Its original SOURCE and real record Effects reader retain the debt.
	for _, required := range []sourceStagedOperationRequest{candidate, originalGetMutationRequest(source), source.coverage, contribution.root, contribution.algorithm, readerRequest, exposureRequest} {
		delta.required = appendEntryLawRequirement(delta.required, required)
	}
	// These are exact existing subscriptions, not newly issued requests or a
	// closure query. A delivered prefix may be useful before local extraction.
	applied := func(request sourceStagedOperationRequest) (sourceStagedOperationID, bool) {
		id, adopted := work.operationIDs[request.producer]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return sourceStagedOperationID{}, false
		}
		state := &work.operations[id.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		return id, state.key == request.producer && !state.invalid && state.dependenciesRegistered && state.revision != 0 && subscriber != nil && !subscriber.blocked && sameOperationRequest(subscriber.request, request) && subscriber.applied == state.revision
	}
	// The actual reader owns the getter slots even before its Effects publish.
	// Its exact current description was authenticated above; APPLIED Get/C is
	// final consumer debt, unlike the exposure DATA needed to inspect donors.
	reader, readerAdopted := work.operationIDs[readerRequest.producer]
	readerAdopted = readerAdopted && reader.epoch == work.operationEpoch && reader.index != 0 && int(reader.index) < len(work.operations)
	if readerAdopted {
		readerState := &work.operations[reader.index]
		readerAdopted = readerState.key == readerRequest.producer && !readerState.invalid
	}
	exposure, exposureApplied := applied(exposureRequest)
	if !readerAdopted || !exposureApplied {
		return delta, nil, false
	}
	state := &work.operations[exposure.index]
	complete := state.delta.extracted
	// This bounded provider certifies only actual getter alternatives. Empty,
	// noncallable or residual alternatives need their own disposition contract.
	complete = complete && len(state.delta.exposures) != 0 && len(state.delta.residuals)+len(state.delta.invoked)+len(state.delta.relative)+len(state.delta.effects) == 0
	var forwards []sourceStagedFieldForward
	for _, alternative := range state.delta.exposures {
		if alternative.creating != nil || !validNativeOwnFieldAlternative(exposureRecipe, alternative) {
			complete = false
			continue // Returned/captured or forwarded alternatives keep their separate source owner.
		}
		matched := false
		for slot, getter := range work.operations[reader.index].getters {
			installed := getter.installed
			if installed == nil || installed.exposure != exposure || installed.creating != alternative.creating || getter.declaration != alternative.endpoint.expression || !sameOperationRequest(getter.demand.request, readerRequest) {
				continue
			}
			matched = true
			body, bodyForwards, bodyComplete := work.originalGetterMutationOutputs(facts, field, reader, slot)
			complete = complete && bodyComplete
			for _, required := range body.required {
				delta.required = appendEntryLawRequirement(delta.required, required)
			}
			for _, value := range body.exposures {
				delta.exposures = append(delta.exposures, value)
			}
			delta.residuals = append(delta.residuals, body.residuals...)
			forwards = append(forwards, bodyForwards...)
		}
		complete = complete && matched
	}
	delta.extracted = complete
	return delta, forwards, complete
}
