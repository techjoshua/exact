package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceDescriptorRecordGet belongs to the actual Get of a conditional native
// descriptor record. Its own data-slot alternative and inherited alternative
// are separate from target-property provenance. Neither branch exposes the
// target, proves descriptor presence, or supplies a normal field value.
type sourceDescriptorRecordGet struct {
	view      sourceNativeDescriptorView
	use       sourceDescriptorGetUse
	field     string
	prototype sourceDemandStandardPremises // conditional link only; never inherited-field integrity
	coverage  sourceStagedOperationRequest // original record Get's prototype source population
}

// This is a descriptive lookup only. Observation, adoption and DATA delivery
// are required by originalDescriptorRecordGetEffects before attaching it.
func descriptorRecordGetEffectsRequest(parent sourceStagedOperationRequest) sourceStagedOperationRequest {
	candidate := sourceStagedMemberCandidate{getContribution: true, value: sourceRelativeEndpoint{expression: parent.producer.operation}}
	return stagedMemberCandidateRequest(parent, candidate)
}

func (work *callableEffectWork) originalDescriptorRecordGetEffects(resume *sourceFrameworkGetResumption) (sourceStagedOperationRequest, bool) {
	request := descriptorRecordGetEffectsRequest(resume.parent)
	recipe, exists := work.operationRecipes[request.producer]
	id, adopted := work.operationIDs[request.producer]
	if !exists || !adopted || id.epoch != work.operationEpoch || id.index == 0 || !validDescriptorRecordGetRecipe(recipe) || !sameOperationRequest(recipe.memberSource.parent, resume.parent) || !memberReceiverCutsCorrespond(resume.parent, recipe.memberSource.candidate.cut, resume.cut) || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return sourceStagedOperationRequest{}, false
	}
	d := recipe.memberSource.getEffects.descriptor
	for _, reading := range resume.readings {
		if sameOperationRequest(reading, d.view.delivery) && work.stagedMemberResultReading(reading, resume.parent, resume.cut) {
			// Local semantic-reader publication is not a physical continuation
			// premise. Only the exact registered resumer-domain reader joins it.
			return recipe.memberSource.request, true
		}
	}
	return sourceStagedOperationRequest{}, false
}

func cloneDescriptorRecordGet(source *sourceDescriptorRecordGet) *sourceDescriptorRecordGet {
	if source == nil {
		return nil
	}
	copy := *source
	copy.view = projectNativeDescriptorView(source.view, nil)
	return &copy
}

func sameDescriptorRecordGet(a, b *sourceDescriptorRecordGet) bool {
	return a == b || a != nil && b != nil && a.field == b.field && a.use == b.use && a.prototype == b.prototype && sameOperationRequest(a.coverage, b.coverage) && sameNativeDescriptorView(&a.view, &b.view)
}

// descriptorRecordGetKey is used only at the original accessor visitor. It
// consumes that visitor's lexical reference, never a saved result or a later
// caller's bindings. Explicit implicit/native fields do not enter this role.
func (q *sourceValueQuery) descriptorRecordGetInputs(view sourceNativeDescriptorView, reference *sourceGetReference, projection []string, name string, mode accessorTraversal) *sourceGetInputs {
	if q == nil || q.owner == nil || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || mode != accessorRead || reference == nil || reference.operation != q.protectedMember || !reference.matches(projection, name) || len(view.projection) != 0 || view.source.generation != q.owner.generation {
		return nil
	}
	_, field := accessorReceiver(reference.operation)
	if field != "value" {
		return nil
	}
	copy := projectNativeDescriptorView(view, nil)
	return &sourceGetInputs{operation: reference.operation, propertyKey: field, receiver: sourceValue{descriptorView: &copy}}
}

// validDescriptorRecordGetRecipe validates this role's detached description.
// Actual DATA/APPLIED, source membership and semantic observations are checked
// by the current work owner. An inherited callable can only be a getter BODY
// child at this Get; a returned callable remains dormant.
func validDescriptorRecordGetRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.memberSource
	if source == nil || source.getEffects == nil || source.getEffects.descriptor == nil {
		return false
	}
	d := source.getEffects.descriptor
	if !stagedMemberFactoryParent(source) || !stagedMemberFactoryObservation(source, source.candidate.cut) || !validDescriptorRecordGetUse(&d.use, source.parent, source.candidate.cut) || d.use.generation != source.generation || !validDescriptorViewPayload(&d.view) || d.view.source.generation != source.generation || len(d.view.projection) != 0 || !validStagedCallResultReading(d.view.delivery, source.parent, source.candidate.cut) || d.prototype.root == nil || d.prototype.member != d.view.method || d.prototype.prototype == nil || !d.prototype.rootData || !d.prototype.memberData || !d.prototype.prototypeData || !d.prototype.ordinaryLink || !d.prototype.terminalNull || !standardLibrarySource(ast.GetSourceFileOfNode(d.prototype.prototype)) {
		return false
	}
	_, field := accessorReceiver(source.parent.producer.operation)
	if field != "value" || field != d.field || source.candidate.origin != d.view.delivery.producer.operation || !sameOperationRequest(d.coverage, stagedMemberCoverageRequest(source.parent, d.prototype.prototype, source.candidate.cut)) || !sameOperationRequest(source.request, stagedMemberCandidateRequest(source.parent, source.candidate)) || source.request.producer != recipe.key || !source.candidate.getContribution || !source.candidate.protocol || source.candidate.invoking || source.candidate.runtimeUnknown || source.candidate.reflective || source.candidate.prior || source.candidate.region != nil || !sameOperationEndpoint(source.candidate.target, sourceRelativeEndpoint{}) || !sameOperationEndpoint(source.candidate.key, sourceRelativeEndpoint{}) || source.descriptorStrong != nil || source.coverage != nil || source.call != nil || source.frameworkRead != nil || source.protocolSource != nil || source.installedCallSelection != nil || source.installedMember != nil || source.nativeWriter != nil || source.globalWrite != nil || source.hasFreshTarget != nil || source.targetSource != nil || source.writeEffects || source.extraction != nil || source.moduleExcluded != nil || len(source.values)+len(source.moduleImports) != 0 || source.candidate.value.expression != source.parent.producer.operation || recipe.delta.extracted != source.getEffects.accounted || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	expectedValue := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: source.parent.producer.operation, producer: source.parent.producer.operation, cut: source.candidate.cut}
	if !sameOperationEndpoint(source.candidate.value, expectedValue) {
		return false
	}
	if len(recipe.delta.effects) != 1 || !sameOperationEffect(recipe.delta.effects[0], descriptorRecordRuntimeMay()) {
		return false
	}
	if len(recipe.delta.required) < 2 || !sameOperationRequest(recipe.delta.required[0], d.view.delivery) || !sameOperationRequest(recipe.delta.required[1], d.coverage) {
		return false
	}
	for _, required := range recipe.delta.required[2:] {
		// Only actual selected installation value/get DATA children may follow
		// this role's own reader and C. Graph validation checks their factories.
		if required.producer.kind != relativeDemandDirectExposure || required.producer.selector.field != "get" || required.reading != recipe.key || required.use != source.parent.producer.operation || required.inputs != nil || required.consumer != source.request.consumer {
			return false
		}
	}
	return recipe.descriptorTarget == nil && recipe.descriptorSource == nil && recipe.frameworkEffects == nil && recipe.moduleArgument == nil && recipe.declarationCall == nil && recipe.declarationCallGeneration == nil && recipe.entryLaw == nil && recipe.constructionEffects == nil && recipe.assignment == nil && recipe.hasInstance == nil && recipe.nativeGet == nil && recipe.callResult == nil && recipe.installedMember == nil && recipe.installedCall == nil && recipe.constructed == nil && recipe.mapEntry == nil && recipe.mapProtocol == nil && recipe.writer == nil && recipe.getter == nil && recipe.returning == nil && recipe.constructedDisposition == nil && len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) == 0
}

// descriptorRecordGetDemand authenticates the distinct returned-record reader.
// It does not call issueFieldEffectsDemand or grant a native six-field issuer.
// The shared installed-getter consumer needs only the exact request, receiver
// description and existing state ID after this role has been checked.
func (work *callableEffectWork) descriptorRecordGetDemand(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) (sourceStagedFieldEffectsDemand, bool) {
	if owner == nil || owner.values == nil || owner.values.program == nil || owner.checker == nil || work.operationGeneration == nil || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operationGeneration != owner.values.generation || !work.operationGeneration.active {
		return sourceStagedFieldEffectsDemand{}, false
	}
	if owner.values.program != work.operationGeneration.program || owner.checker != work.operationGeneration.checker || owner.values.checker != owner.checker || owner.project == nil || owner.project != work.operationGeneration.project || owner.project.activeGeneration != work.operationGeneration {
		return sourceStagedFieldEffectsDemand{}, false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if !validDescriptorRecordGetRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[state.key] != work.operationGeneration {
		return sourceStagedFieldEffectsDemand{}, false
	}
	source := recipe.memberSource
	d := source.getEffects.descriptor
	caller, known := work.memberNodes[source.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || facts[caller].node != source.parent.producer.declaration || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return sourceStagedFieldEffectsDemand{}, false
	}
	if !work.descriptorRecordViewDelivered(&d.view) || !work.descriptorRecordReadingOwned(d.view, recipe.memberSource.parent, recipe.memberSource.candidate.cut) {
		return sourceStagedFieldEffectsDemand{}, false
	}
	view := projectNativeDescriptorView(d.view, nil)
	receiver := sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, producer: source.candidate.origin, cut: source.candidate.cut, descriptorView: &view}
	return sourceStagedFieldEffectsDemand{producer: id, request: source.request, receiver: receiver}, true
}

// This is the conditional runtime residual of this actual record Get. It
// accounts no compiler-pending source work and replaces no known getter donor.
func descriptorRecordRuntimeMay() EnvironmentEffectSource {
	effect := environmentSource("unknown", "conditional descriptor-record inherited Get may execute user code or throw", "descriptor record Get")
	effect.Opaque = true
	return effect
}

// descriptorRecordGetCurrent is local to the already-running closure solver.
// It consumes the exact graph-observed record Get and saved DATA association;
// transitive source/body closure belongs to the outer solver. It never queries,
// observes again, updates a snapshot from ACK, or invokes that solver.
func (work *callableEffectWork) descriptorRecordGetCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validDescriptorRecordGetRecipe(recipe) || !recipe.delta.extracted || work.operationGeneration == nil || !work.operationGeneration.active || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	d := recipe.memberSource.getEffects.descriptor
	if !work.descriptorRecordViewDelivered(&d.view) || !work.descriptorRecordReadingOwned(d.view, recipe.memberSource.parent, recipe.memberSource.candidate.cut) {
		return false
	}
	coverage := work.operationRecipes[d.coverage.producer]
	if !validStagedMemberCoverageRecipe(coverage) || !coverage.delta.extracted || coverage.memberSource.generation != work.operationGeneration || !sameOperationRequest(coverage.memberSource.parent, recipe.memberSource.parent) || coverage.memberSource.coverage.origin != d.prototype.prototype || coverage.memberSource.coverage.cut != recipe.memberSource.candidate.cut || work.memberCoverageObserved[coverage.key] != work.operationGeneration {
		return false
	}
	for _, required := range recipe.delta.required[2:] {
		if !work.validDescriptorRecordInstallationReading(work.operationRecipes[required.producer], required, recipe) {
			return false
		}
	}
	return true
}

// descriptorRecordViewDelivered checks local actual DATA delivery only. Each
// caller separately owns its original reader/parent/cut; transitive Effects and
// source/body closure remain on the existing outer dependency solver.
func (work *callableEffectWork) descriptorRecordViewDelivered(view *sourceNativeDescriptorView) bool {
	if !work.descriptorViewSourceCurrent(view) {
		return false
	}
	data, applied := work.stagedCallResultData(view.delivery)
	if !applied || !data.delta.extracted {
		return false
	}
	for _, alternative := range data.delta.exposures {
		if alternative.creating == nil && alternative.endpoint.kind == relativeEndpointDescriptorView && alternative.endpoint.descriptorView != nil && descriptorViewDataEqual(alternative.endpoint.descriptorView, view) {
			return true
		}
	}
	return false
}
