package exactcompiler

// validOriginalRecordGetMutationSource is only the detached conditional record
// arm. It never supplies target provenance, normal presence or inherited-field
// integrity. Its current work owner still requires actual DATA and BODY paths.
func validOriginalRecordGetMutationSource(s *sourceOriginalGetMutationSource) bool {
	d := s.record
	return d != nil && s.ownMember == nil && s.nativeTarget == nil && s.standard == nil && s.kind == 0 && s.slot == 0 && !s.intrinsicPrototype && s.receiverKind == 0 && s.mode == accessorRead && s.operation == s.request.producer.operation && s.property == "value" && d.field == s.property && s.origin == d.prototype.prototype && d.view.source.generation == s.generation && validDescriptorRecordGetUse(&d.use, s.request, s.queryCut) && validDescriptorViewPayload(&d.view) && sameOperationRequest(s.coverage, d.coverage) && sameOperationRequest(s.coverage, stagedMemberCoverageRequest(s.request, s.origin, s.queryCut))
}

func (work *callableEffectWork) publishOriginalRecordGetMutationSource(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, read *sourceMemberWriterReadCut, record sourceStagedOperationRecipe) bool {
	if q == nil || !validDescriptorRecordGetRecipe(record) || record.memberSource.generation != work.operationGeneration || !q.liveStagedMemberSource(q.stagedMember, get, read) || !sameOperationRequest(record.memberSource.parent, q.stagedMember.request) || q.stagedMember.coverage == nil {
		return false
	}
	d := record.memberSource.getEffects.descriptor
	s := &sourceOriginalGetMutationSource{request: record.memberSource.parent, operation: get.operation, queryCut: record.memberSource.candidate.cut, origin: d.prototype.prototype, property: get.propertyKey, mode: accessorRead, generation: work.operationGeneration, record: cloneDescriptorRecordGet(d), coverage: d.coverage, population: originalGetMutationCoveragePopulation(q.stagedMember.coverage), upstreamBodies: cloneStagedMemberFieldBodies(q.stagedMember.coverage.fieldBodies), pending: !q.stagedMember.indexed || !q.stagedMember.represented || !originalGetMutationCoveragePartitionComplete(q.stagedMember.coverage)}
	if !validOriginalGetMutationSource(s) {
		return false
	}
	if !work.registerOriginalGetMutationSource(facts, s) {
		return false
	}
	work.bindOriginalGetMutationInterests(facts, q, get, read, s)
	return true
}

func (work *callableEffectWork) originalRecordGetMutationCurrent(s *sourceOriginalGetMutationSource) bool {
	if !validOriginalRecordGetMutationSource(s) {
		return false
	}
	coverage := work.operationRecipes[s.coverage.producer]
	if coverage.memberSource == nil || coverage.memberSource.coverage == nil || !sameOriginalGetMutationCoveragePartition(s, coverage.memberSource.coverage) {
		return false
	}
	request := descriptorRecordGetEffectsRequest(s.request)
	recipe := work.operationRecipes[request.producer]
	return validDescriptorRecordGetRecipe(recipe) && sameDescriptorRecordGet(recipe.memberSource.getEffects.descriptor, s.record) && work.originalRecordGetMutationReaderCurrent(recipe)
}

// originalRecordGetMutationReaderCurrent authenticates the actual conditional
// record SOURCE observation and delivered descriptor DATA. Get/C Effects may
// still be pending: they remain required debt of every projected output. This
// predicate does not settle the record Get or replace descriptorRecordGetCurrent.
func (work *callableEffectWork) originalRecordGetMutationReaderCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validDescriptorRecordGetRecipe(recipe) || work.operationGeneration == nil || !work.operationGeneration.active || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	d := recipe.memberSource.getEffects.descriptor
	if !work.descriptorRecordViewDelivered(&d.view) || !work.descriptorRecordReadingOwned(d.view, recipe.memberSource.parent, recipe.memberSource.candidate.cut) {
		return false
	}
	coverage := work.operationRecipes[d.coverage.producer]
	if !validStagedMemberCoverageRecipe(coverage) || coverage.memberSource.generation != work.operationGeneration || !sameOperationRequest(coverage.memberSource.parent, recipe.memberSource.parent) || coverage.memberSource.coverage.origin != d.prototype.prototype || coverage.memberSource.coverage.cut != recipe.memberSource.candidate.cut || work.memberCoverageObserved[coverage.key] != work.operationGeneration {
		return false
	}
	for _, required := range recipe.delta.required[2:] {
		if !work.validDescriptorRecordInstallationReading(work.operationRecipes[required.producer], required, recipe) {
			return false
		}
	}
	return true
}
