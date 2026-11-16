package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// registerReflectiveContribution borrows the same original member publication
// which owns this candidate. It registers conditional source dependencies only;
// the full Call, source alternatives and any installed callable DATA stay owed.
func (work *callableEffectWork) registerReflectiveContribution(facts []callableFacts, q *sourceValueQuery, key sourceStagedOperationKey) bool {
	if q == nil || q.owner == nil || q.executable == nil {
		return false
	}
	b := q.stagedMember
	prior := work.operationRecipes[key]
	s := prior.memberSource
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || s == nil || !s.candidate.reflective || s.candidate.protocol || s.extraction == nil || s.generation != work.operationGeneration || s.generation != q.owner.generation || !sameOperationRequest(s.parent, b.request) || s.candidate.cut != b.observation || s.candidate.region != b.request.consumer || b.get.propertyKey == "" || !sameOperationRequest(s.extraction.request, b.request) || s.extraction.cut != s.candidate.cut {
		return false
	}
	caller, known := work.memberNodes[b.request.consumer]
	publisher := q.executable.pendingMemberPublishers[b.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || !q.stagedFieldWorkOwner(q.executable) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	source := work.nativeInstallations[s.candidate.region][b.get.propertyKey][s.candidate.operation]
	if source == nil || source.installation == nil || !reflectiveNative(source.kind) || source.method == nil || source.request.producer.operation != s.candidate.operation || source.request.consumer != s.candidate.region {
		return false
	}
	algorithm := nativeRootDebtRequest(source, "algorithm")
	if !validNativeGetRecipe(work.operationRecipes[algorithm.producer]) || work.operationRecipes[algorithm.producer].nativeGet != source {
		return false
	}
	target := source.installation.target.expression
	// This is the accepted conditional prototype installation domain. Selection
	// and target Get work remain actual required children, not this syntax check.
	if target == nil || !ast.IsPropertyAccessExpression(target) || !ast.IsIdentifier(target.Expression()) || callableNameText(target.Name()) != "prototype" || source.standard.prototype == nil || !source.standard.ordinaryLink {
		return false
	}
	d := &sourceStagedReflectiveContribution{request: s.request, parent: s.parent, root: source.request, algorithm: algorithm, installation: *source.installation, method: source.method, kind: source.kind, generation: work.operationGeneration}
	d.installation.target = cloneSourceRelativeEndpoint(source.installation.target)
	d.installation.key = cloneSourceRelativeEndpoint(source.installation.key)
	d.installation.descriptor = cloneSourceRelativeEndpoint(source.installation.descriptor)
	if field, phase, valid := stagedFieldMemberParent(s.parent); valid {
		if !q.liveStagedFieldMemberSource(b.get) {
			return false
		}
		d.reader = field
		if phase == stagedFieldObservationHas {
			d.purpose = reflectiveContributionHas
		} else if phase == stagedFieldObservationGet {
			d.purpose = reflectiveContributionFieldGet
		} else {
			return false
		}
	} else {
		view := b.get.receiver.descriptorView
		if view == nil || !work.descriptorRecordReadingOwned(*view, b.request, b.observation) || !work.descriptorRecordViewDelivered(view) {
			return false
		}
		if _, valid := q.descriptorRecordGetUseOwned(b.get, b.read, accessorRead); !valid {
			return false
		}
		d.purpose = reflectiveContributionRecordGet
		d.reader = descriptorRecordGetEffectsRequest(s.parent)
	}
	if d.purpose != reflectiveContributionHas {
		d.data = []sourceStagedOperationRequest{nativeFieldExposureRequest(source, "get", d.reader)}
	}
	if s.reflectiveContribution != nil && !sameReflectiveContribution(s.reflectiveContribution, d) {
		return false
	}
	dataReady := d.purpose == reflectiveContributionHas
	if d.purpose == reflectiveContributionRecordGet {
		reader := work.operationRecipes[d.reader.producer]
		child := work.operationRecipes[d.data[0].producer]
		dataReady = validDescriptorRecordGetRecipe(reader) && work.validDescriptorRecordInstallationReading(child, d.data[0], reader)
	} else if d.purpose == reflectiveContributionFieldGet {
		dataReady = work.enrollReflectiveFieldGetter(facts, q, source, d)
	}
	member := *s
	member.reflectiveContribution = d
	recipe := prior
	recipe.memberSource = &member
	recipe.delta = cloneOperationDelta(prior.delta)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, d.root)
	if dataReady {
		for _, r := range d.data {
			recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, r)
		}
	}
	recipe.delta.extracted = dataReady
	if !validReflectiveContributionRecipe(recipe) {
		return false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[key] = work.operationGeneration
	if id, adopted := work.operationIDs[key]; adopted && id.epoch == work.operationEpoch && id.index != 0 {
		work.operations[id.index].memberCoverageObserved = true
	}
	return work.attachOperationSource(facts, recipe)
}

// enrollReflectiveFieldGetter uses the existing installed-field DATA/BODY
// consumer under a genuine original native field Get. Has never enters here.
// Unlike the old two-call sequence law, this conditional source relation claims
// no execution of a prior activation, target identity or property replacement.
func (work *callableEffectWork) enrollReflectiveFieldGetter(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource, d *sourceStagedReflectiveContribution) bool {
	b := q.stagedMember
	if b == nil || !q.liveStagedFieldMemberSource(b.get) || b.get.hasOnly || !q.liveStagedFieldGet(b.get) {
		return false
	}
	id, adopted := work.operationIDs[d.reader.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 {
		return false
	}
	demand, issued := work.issueFieldEffectsDemand(facts, id, q.executable)
	if !issued || !sameOperationRequest(demand.request, d.reader) || demand.receiver.kind != relativeEndpointExpression || !ast.IsObjectLiteralExpression(demand.receiver.expression) || !stagedLiteralStandardPrototype(source, demand.receiver.expression) {
		return false
	}
	recipe, registered := work.ensureFieldExposure(facts, source, "get")
	if !registered || !work.validFieldExposureReading(recipe, d.data[0]) {
		return false
	}
	use := sourceStagedOperationUse{request: d.data[0], installed: &sourceStagedInstalledFieldUse{receiver: cloneSourceRelativeEndpoint(demand.receiver), cut: b.observation}}
	if !work.registerOperationUse(facts, use) {
		return false
	}
	work.attachInstalledFieldDependencies(id, source, d.data[0])
	child := work.operationIDs[d.data[0].producer]
	work.registerOperationDependencies(facts, child)
	if operationDeltaSize(recipe.delta) != 0 {
		work.publishOperation(child, recipe.delta)
	}
	return true
}
