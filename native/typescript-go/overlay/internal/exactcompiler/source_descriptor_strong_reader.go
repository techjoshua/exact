package exactcompiler

// sourceDescriptorStrongReader describes the actual SOURCE field/provenance
// reader. Target C belongs here; the nominal descriptor result is unchanged.
// The description retains no Get pointer, query, bindings or live callback.
type sourceDescriptorStrongReader struct {
	view   sourceNativeDescriptorView
	parent sourceStagedOperationRequest
	cut    sourceRelativeCut
	mode   accessorTraversal
	field  string
	target sourceStagedOperationRequest
}

func descriptorStrongReaderRequest(parent sourceStagedOperationRequest) sourceStagedOperationRequest {
	request := parent
	request.producer.selector.field = "descriptor-strong-source"
	request.edge += ":descriptor-strong-source"
	return request
}

func descriptorStrongReadingShape(request, parent sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	return validStagedMemberParent(parent) && validStagedMemberObservation(parent, cut) && sameOperationRequest(request, descriptorStrongReaderRequest(parent))
}

func cloneDescriptorStrongReader(source *sourceDescriptorStrongReader) *sourceDescriptorStrongReader {
	if source == nil {
		return nil
	}
	copy := *source
	copy.view = projectNativeDescriptorView(source.view, nil)
	return &copy
}

func sameDescriptorStrongReader(a, b *sourceDescriptorStrongReader) bool {
	return a == b || a != nil && b != nil && a.mode == b.mode && a.field == b.field && a.cut == b.cut && sameOperationRequest(a.parent, b.parent) && sameOperationRequest(a.target, b.target) && sameNativeDescriptorView(&a.view, &b.view)
}

func validDescriptorStrongReaderRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.memberSource
	if source == nil || source.descriptorStrong == nil {
		return false
	}
	d := source.descriptorStrong
	if !descriptorStrongReadingShape(source.request, source.parent, source.candidate.cut) || !sameOperationRequest(d.parent, source.parent) || d.cut != source.candidate.cut || recipe.key != source.request.producer || !stagedMemberFactoryParent(source) || !stagedMemberFactoryObservation(source, d.cut) || source.generation == nil || source.generation != d.view.source.generation || !validDescriptorViewPayload(&d.view) || len(d.view.projection) != 0 || !validStagedCallResultReading(d.view.delivery, d.parent, d.cut) || (d.mode != accessorRead && d.mode != accessorAcquire && d.mode != accessorInvoke) {
		return false
	}
	_, field := accessorReceiver(d.parent.producer.operation)
	root := &sourceStagedNativeGetSource{request: d.view.source.request, get: d.view.source.request.producer.operation.Expression()}
	if field != d.field || field != "value" && field != "get" && field != "set" || !sameOperationRequest(d.target, descriptorTargetRequest(root)) || source.candidate.operation != d.parent.producer.operation || source.candidate.origin != d.view.delivery.producer.operation || !sameOperationRequest(source.candidate.request, d.parent) || !source.candidate.protocol || source.candidate.reflective || source.candidate.invoking || source.candidate.getContribution || source.candidate.prior || source.candidate.runtimeUnknown || source.candidate.region != nil || !sameOperationEndpoint(source.candidate.target, sourceRelativeEndpoint{}) || !sameOperationEndpoint(source.candidate.key, sourceRelativeEndpoint{}) || !sameOperationEndpoint(source.candidate.value, sourceRelativeEndpoint{}) {
		return false
	}
	if source.installedCallSelection != nil || source.installedMember != nil || source.coverage != nil || source.call != nil || source.getEffects != nil || source.extraction != nil || source.frameworkRead != nil || source.nativeWriter != nil || source.globalWrite != nil || source.hasFreshTarget != nil || source.targetSource != nil || source.writeEffects || source.protocolSource != nil || source.moduleExcluded != nil || len(source.values)+len(source.moduleImports) != 0 || len(recipe.delta.effects)+len(recipe.delta.residuals)+len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative) != 0 {
		return false
	}
	if len(recipe.delta.required) < 2 || !sameOperationRequest(recipe.delta.required[0], d.view.delivery) || !sameOperationRequest(recipe.delta.required[1], d.target) {
		return false
	}
	for _, required := range recipe.delta.required[2:] {
		if !descriptorTargetStoredRequirementShape(required) {
			return false
		}
	}
	return recipe.descriptorTarget == nil && recipe.descriptorSource == nil && recipe.frameworkEffects == nil && recipe.nativeGet == nil && recipe.callResult == nil && recipe.installedCall == nil && recipe.installedMember == nil && recipe.moduleArgument == nil && recipe.declarationCall == nil && recipe.entryLaw == nil && recipe.assignment == nil && recipe.constructionEffects == nil && recipe.hasInstance == nil && recipe.mapEntry == nil && recipe.mapProtocol == nil && recipe.getter == nil && recipe.returning == nil && recipe.constructed == nil && recipe.constructedDisposition == nil && recipe.writer == nil && len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) == 0
}

// descriptorStrongReadingCurrent authenticates registration, separately from
// target-source closure and donor delivery. It grants no result-field value.
func (work *callableEffectWork) descriptorStrongReadingCurrent(request, parent sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	if !descriptorStrongReadingShape(request, parent, cut) || work.operationGeneration == nil || !work.operationGeneration.active {
		return false
	}
	recipe := work.operationRecipes[request.producer]
	if !validDescriptorStrongReaderRecipe(recipe) || !sameOperationRequest(recipe.memberSource.parent, parent) || recipe.memberSource.candidate.cut != cut || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	d := recipe.memberSource.descriptorStrong
	return work.descriptorRecordViewDelivered(&d.view) && work.descriptorRecordReadingOwned(d.view, parent, cut)
}

// descriptorStrongRequiredCurrent verifies the complete receiver/RHS tail from
// the genuine target source before this reader's closure can be accepted.
func (work *callableEffectWork) descriptorStrongRequiredCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validDescriptorStrongReaderRecipe(recipe) {
		return false
	}
	d := recipe.memberSource.descriptorStrong
	target := work.operationRecipes[d.target.producer]
	if !validDescriptorTargetRecipe(target) || !target.descriptorTarget.enumerated || !sameOperationRequest(target.descriptorTarget.request, d.target) {
		return false
	}
	expected := []sourceStagedOperationRequest{d.view.delivery, d.target}
	for _, field := range target.descriptorTarget.fields {
		expected = appendEntryLawRequirement(expected, field.receiver)
		expected = appendEntryLawRequirement(expected, field.data)
	}
	return len(expected) == len(recipe.delta.required) && operationPrefix(expected, recipe.delta.required, sameOperationRequest)
}
