package exactcompiler

// Local primitive output, known RHS, provider descriptions and materialized
// mutation contributions remain separate. The aggregate is a MAY union of
// actual typed outputs, not a global no-mutation or stored-value certificate.
// Known prefixes survive every independent pending obligation.
type sourceNativeInstallationMutationOutput struct {
	delta                          sourceStagedOperationDelta
	forwards                       []sourceStagedFieldForward
	fieldLinks                     []sourceOriginalGetMutationFieldLink
	knownRHSComplete               bool
	populationDescriptionComplete  bool
	materializedOutputsComplete    bool
	priorFieldInterferenceComplete bool
}

func nativeInstallationMutationField(s *sourceNativeInstallationMutationSource, ordinal int) (sourceStagedOperationRequest, bool) {
	if !validNativeInstallationMutationSource(s) || ordinal < 0 || ordinal >= len(reflectiveDescriptorKeys) {
		return sourceStagedOperationRequest{}, false
	}
	field := s.request
	field.producer.selector = sourceStagedOperationSelector{occurrence: s.installation.descriptor.expression, field: reflectiveDescriptorKeys[ordinal]}
	return field, true
}

// An RHS receipt already records the real component Get/BODY/input association.
// This pure check does not manufacture another binder or change its parent.
func validNativeInstallationMutationForward(s *sourceNativeInstallationMutationSource, field sourceStagedOperationRequest, forward sourceStagedFieldForward) bool {
	if !validNativeInstallationMutationSource(s) || forward.source != nil || forward.mutationRHS == nil {
		return false
	}
	parent, valid := fieldSourceParent(field)
	if !valid || parent.producer.operation != s.request.producer.operation || field.consumer != s.request.consumer {
		return false
	}
	rhs := forward.mutationRHS
	if rhs.generation != s.generation || rhs.binding == nil || !sameOperationRequest(forward.request, rhs.request) {
		return false
	}
	component := false
	for ordinal := range reflectiveDescriptorKeys {
		request, described := nativeInstallationMutationField(s, ordinal)
		component = component || described && sameOperationRequest(request, rhs.parent)
	}
	if !component {
		return false
	}
	delta := cloneOperationDelta(rhs.projection.delta)
	delta.required = appendEntryLawRequirement([]sourceStagedOperationRequest{rhs.parent}, s.request)
	if !validInstalledMutationRHSRecipe(sourceStagedOperationRecipe{key: rhs.request.producer, installedMutationRHS: rhs, delta: delta}) {
		return false
	}
	possible, represented := mutationWriterMaySupplyField(rhs, field)
	if !possible || !represented {
		return false
	}
	for _, alternative := range rhs.projection.delta.exposures {
		if sameOperationAlternative(alternative, forward.alternative) {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) nativeInstallationMutationForwardCurrent(s *sourceNativeInstallationMutationSource, field sourceStagedOperationRequest, forward sourceStagedFieldForward) bool {
	if !validNativeInstallationMutationForward(s, field, forward) || !work.nativeInstallationMutationCurrent(s) {
		return false
	}
	id := work.operationIDs[s.algorithm.producer]
	e := work.operations[id.index].installationMutations
	component := false
	for _, c := range e.components {
		if c.phase == stagedFieldObservationGet && sameOperationRequest(c.effects, forward.mutationRHS.parent) && c.source != nil && work.originalFieldMutationCurrent(c.source) {
			component = true
		}
	}
	if !component {
		return false
	}
	registered := work.operationRecipes[forward.request.producer]
	if !sameInstalledMutationRHS(registered.installedMutationRHS, forward.mutationRHS) || !work.installedMutationRHSCurrent(registered) {
		return false
	}
	data, applied := work.installedMutationRHSData(forward.request)
	if !applied {
		return false
	}
	for _, alternative := range data.exposures {
		if sameOperationAlternative(alternative, forward.alternative) {
			return true
		}
	}
	return false
}

// This lookup returns only an actual previously captured phase SOURCE. It does
// not acquire a Get, select a method, create a recipe or enter graph closure.
func (work *callableEffectWork) nativeInstallationMutationComponentSource(s *sourceNativeInstallationMutationSource, h *sourceOriginalGetNativeField) (*sourceOriginalGetMutationSource, bool) {
	if !work.nativeInstallationMutationCurrent(s) || !validOriginalFieldMutationHeader(h, false) || !sameOperationRequest(h.root, s.request) || !sameOperationRequest(h.algorithm, s.algorithm) || h.method != s.method || h.kind != s.kind || h.generation != s.generation {
		return nil, false
	}
	id := work.operationIDs[s.algorithm.producer]
	for _, component := range work.operations[id.index].installationMutations.components {
		if component.source == nil || component.ordinal != h.ordinal || component.phase != h.phase || !sameOriginalGetNativeField(component.source.nativeField, h) {
			continue
		}
		registered := work.operationRecipes[originalGetMutationRequest(component.source).producer]
		if !work.originalGetMutationCurrent(registered) || !sameOriginalGetMutationIdentity(registered.memberSource.originalGetMutation, component.source) {
			return nil, false
		}
		return cloneOriginalGetMutationSource(registered.memberSource.originalGetMutation), true
	}
	return nil, false
}

// Native callee/target components retain their real original SOURCE domains.
// The key is used only to look up an already issued interest; no registration
// or source acquisition is performed by this late field-output fold.
func (work *callableEffectWork) nativeInstallationMutationGetSource(s *sourceNativeInstallationMutationSource, kind sourceNativeInstallationMutationComponentKind) (*sourceOriginalGetMutationSource, *sourceOriginalGetMutationInterest, bool) {
	if !work.nativeInstallationMutationCurrent(s) {
		return nil, nil, false
	}
	n := work.operationRecipes[s.algorithm.producer].nativeGet
	var interest *sourceOriginalGetMutationInterest
	switch kind {
	case nativeInstallationMutationCallee:
		h := &sourceOriginalGetNativeCallee{root: s.request, get: n.get, kind: s.kind, method: s.method, generation: s.generation}
		origin := originalNativeCalleeGetMutationReader(h)
		interest = &sourceOriginalGetMutationInterest{nativeCallee: h, origin: origin, parent: origin, operation: h.get, generation: s.generation}
	case nativeInstallationMutationTarget:
		origin := nativeEagerTargetRequest(n)
		interest = &sourceOriginalGetMutationInterest{origin: origin, parent: origin, operation: origin.producer.selector.occurrence, nativeRoot: s.request, nativeKind: s.kind, method: s.method, generation: s.generation}
	default:
		return nil, nil, false
	}
	if !validOriginalGetMutationInterestShape(interest) {
		return nil, nil, false
	}
	registered := work.operationRecipes[originalGetMutationInterestRequest(interest).producer]
	if !work.originalGetMutationInterestCurrent(registered) || !sameOriginalGetMutationInterest(registered.memberSource.originalGetMutationInterest, interest) {
		return nil, nil, false
	}
	actual := registered.memberSource.originalGetMutationInterest
	source, represented := work.resolveOriginalGetMutationInterest(actual)
	if !represented {
		return nil, nil, false
	}
	return cloneOriginalGetMutationSource(source), cloneOriginalGetMutationInterest(actual), true
}

// appendNativeInstallationMutationLink accepts only an already declared direct
// sibling of this demanded field. Its own original installed reader delivers
// the atoms. This link is a description, never a BODY/RHS or invocation atom.
func (work *callableEffectWork) appendNativeInstallationMutationLink(output *sourceNativeInstallationMutationOutput, field sourceStagedOperationRequest, s *sourceNativeInstallationMutationSource, candidate, reader sourceStagedOperationRequest, kind sourceOriginalGetMutationProviderKind, component sourceNativeInstallationMutationComponentKind, h *sourceOriginalGetNativeField) bool {
	request := mutationDataRequest(field, s.request)
	owner := work.operationRecipes[request.producer]
	if owner.mutationData == nil || !sameNativeInstallationMutationSource(owner.mutationData.installation, s) || !sameOperationRequest(owner.mutationData.field, field) || !sameOperationRequest(owner.mutationData.request, request) {
		return false
	}
	linked := false
	for _, childRequest := range work.operationRecipes[field.producer].delta.required {
		child := work.operationRecipes[childRequest.producer]
		origin, actualKind := originalGetMutationFieldLinkOrigin(child.mutationData)
		if actualKind != kind || !work.originalGetMutationFieldReaderCorresponds(child.mutationData, reader, origin) {
			continue
		}
		link := sourceOriginalGetMutationFieldLink{nativeComponent: component, nativeField: cloneOriginalGetNativeField(h), candidate: candidate, field: field, child: childRequest, origin: origin, kind: kind, generation: s.generation}
		probe := owner
		probe.delta = cloneOperationDelta(output.delta)
		for _, dependency := range []sourceStagedOperationRequest{candidate, reader, origin, childRequest} {
			probe.delta.required = appendEntryLawRequirement(probe.delta.required, dependency)
		}
		if !work.validOriginalGetMutationFieldLink(probe, link) {
			continue
		}
		output.delta.required = probe.delta.required
		found := false
		for _, prior := range output.fieldLinks {
			found = found || sameOriginalGetMutationFieldLink(prior, link)
		}
		if !found {
			output.fieldLinks = append(output.fieldLinks, link)
		}
		linked = true
	}
	return linked
}

func (work *callableEffectWork) nativeInstallationMutationOutputs(facts []callableFacts, field sourceStagedOperationRequest, s *sourceNativeInstallationMutationSource) sourceNativeInstallationMutationOutput {
	output := sourceNativeInstallationMutationOutput{delta: sourceStagedOperationDelta{required: nativeInstallationMutationRequirements(s)}}
	if !work.nativeInstallationMutationCurrent(s) {
		return output
	}
	parent, valid := fieldSourceParent(field)
	if !valid || parent.producer.operation != s.request.producer.operation || field.consumer != s.request.consumer {
		return output
	}
	id := work.operationIDs[s.algorithm.producer]
	e := work.operations[id.index].installationMutations
	known, described := true, e.sealed
	for _, kind := range []sourceNativeInstallationMutationComponentKind{nativeInstallationMutationCallee, nativeInstallationMutationTarget} {
		source, interest, current := work.nativeInstallationMutationGetSource(s, kind)
		if !current {
			described = false
			continue
		}
		for _, dependency := range []sourceStagedOperationRequest{originalGetMutationInterestRequest(interest), originalGetMutationRequest(source), source.coverage, originalGetMutationReader(source)} {
			if dependency.producer.operation != nil {
				output.delta.required = appendEntryLawRequirement(output.delta.required, dependency)
			}
		}
		data, sourceApplied := work.originalGetMutationData(source)
		_, interestApplied := work.originalGetMutationInterestData(interest)
		described = described && sourceApplied && interestApplied && data.extracted && originalGetMutationDescriptionComplete(source)
		reader := originalGetMutationReader(source)
		described = work.appendNativeInstallationMutationLink(&output, field, s, reader, reader, originalGetMutationProviderGet, kind, nil) && described
	}
	for _, component := range e.components {
		// A positively absent original Has never issues a Get. Its passive Get
		// interest must remain undemanded, rather than become permanent debt.
		if component.phase == stagedFieldObservationGet && nativeInstallationMutationHasAbsent(e, component.ordinal) {
			continue
		}
		if component.source == nil {
			// A Get interest is passive until the original conditional Get really
			// runs. Demanding it while Has is unresolved could leave impossible
			// debt after a later positive absent Has; issued prefixes cannot shrink.
			if component.phase == stagedFieldObservationHas && component.interest != nil {
				output.delta.required = appendEntryLawRequirement(output.delta.required, originalGetMutationInterestRequest(component.interest))
			}
			known, described = false, false
			continue
		}
		if component.interest != nil {
			output.delta.required = appendEntryLawRequirement(output.delta.required, originalGetMutationInterestRequest(component.interest))
		}
		source, current := work.nativeInstallationMutationComponentSource(s, component.source.nativeField)
		if !current {
			known, described = false, false
			continue
		}
		request := originalGetMutationRequest(source)
		for _, dependency := range []sourceStagedOperationRequest{request, source.coverage, originalGetMutationReader(source)} {
			output.delta.required = appendEntryLawRequirement(output.delta.required, dependency)
		}
		for _, required := range work.operationRecipes[request.producer].delta.required {
			output.delta.required = appendEntryLawRequirement(output.delta.required, required)
		}
		_, applied := work.originalGetMutationData(source)
		described = described && applied && originalGetMutationDescriptionComplete(source)
		local := component.phase == stagedFieldObservationHas
		if component.phase == stagedFieldObservationGet {
			if component.intrinsicSource != nil {
				primitive := component.intrinsicSource
				request := originalGetMutationRequest(primitive)
				output.delta.required = appendEntryLawRequirement(output.delta.required, request)
				data, applied := work.originalGetMutationData(primitive)
				local = applied && data.extracted && work.originalIntrinsicFieldMutationCurrent(primitive)
			}
		}
		if component.ownSource != nil {
			own := work.operationRecipes[originalGetMutationRequest(component.ownSource).producer]
			if work.originalGetMutationCurrent(own) && sameOriginalGetMutationIdentity(own.memberSource.originalGetMutation, component.ownSource) {
				output.delta.required = appendEntryLawRequirement(output.delta.required, own.memberSource.request)
				data, ownApplied := work.originalGetMutationData(component.ownSource)
				local = ownApplied && data.extracted
			}
		}
		for _, provider := range source.providers {
			output.delta.required = appendEntryLawRequirement(output.delta.required, provider.candidate)
			if provider.kind == originalGetMutationProviderUnsupported || provider.reader.producer.operation == nil {
				described = false
				continue
			}
			output.delta.required = appendEntryLawRequirement(output.delta.required, provider.reader)
			if provider.kind != originalGetMutationProviderReflective {
				if !work.appendNativeInstallationMutationLink(&output, field, s, provider.candidate, provider.reader, provider.kind, nativeInstallationMutationFieldPhase, source.nativeField) {
					described = false
				}
				continue
			}
			member := work.operationRecipes[provider.candidate.producer]
			if !work.reflectiveContributionCurrent(member) {
				described = false
				continue
			}
			d := member.memberSource.reflectiveContribution
			if !sameOperationRequest(d.parent, source.request) || !sameOperationRequest(d.reader, component.effects) {
				described = false
				continue
			}
			for _, dependency := range []sourceStagedOperationRequest{d.root, d.algorithm} {
				output.delta.required = appendEntryLawRequirement(output.delta.required, dependency)
			}
			if component.phase == stagedFieldObservationHas {
				// The original Has relation has no Get or getter DATA. The whole
				// installation/native debt remains; no BODY is activated here.
				described = described && d.purpose == reflectiveContributionHas && len(d.data) == 0 && provider.data.producer.operation == nil
				continue
			}
			if d.purpose != reflectiveContributionFieldGet || len(d.data) != 1 || !sameOperationRequest(d.data[0], provider.data) {
				described = false
				continue
			}
			output.delta.required = appendEntryLawRequirement(output.delta.required, provider.data)
			body, forwards, complete := work.nativeInstallationReflectiveComponentOutputs(facts, field, s, component, provider.data)
			known, described = known && complete, described && complete
			local = local || complete
			for _, required := range body.required {
				output.delta.required = appendEntryLawRequirement(output.delta.required, required)
			}
			output.delta.residuals = append(output.delta.residuals, body.residuals...)
			for _, forward := range forwards {
				if !work.nativeInstallationMutationForwardCurrent(s, field, forward) {
					known = false
					continue
				}
				output.delta.exposures = append(output.delta.exposures, forward.alternative)
				output.forwards = append(output.forwards, forward)
			}
		}
		if component.phase == stagedFieldObservationGet && !local {
			// No selected own-data branch or real installed Get/BODY supplied a
			// local output. An empty getter list cannot certify it.
			known, described = false, false
		}
	}
	// This excludes only a distinct literal nominal write. All implicit
	// components, source alternatives, input effects and Throw remain required.
	if s.installation.key.expression.Text() == parent.producer.selector.field {
		known, described = false, false
	}
	// Every actual phase and provider above retains its typed mutation output or
	// exact same-field delivery link. Source-history membership does not execute
	// that producer again during this phase. Accounting for possible mutation is
	// therefore a MAY-output contract, not a requirement that each source be pure.
	// Independent DATA/current/APPLIED and linked children still gate delivery;
	// this flag grants no changed stored Value, normal result or whole-Get purity.
	output.priorFieldInterferenceComplete = known && described
	output.knownRHSComplete = known
	output.populationDescriptionComplete = described
	output.materializedOutputsComplete = known && described && len(output.fieldLinks) == 0
	return output
}

func (work *callableEffectWork) nativeInstallationReflectiveComponentOutputs(facts []callableFacts, field sourceStagedOperationRequest, header *sourceNativeInstallationMutationSource, component sourceNativeInstallationMutationComponent, exposureRequest sourceStagedOperationRequest) (sourceStagedOperationDelta, []sourceStagedFieldForward, bool) {
	var delta sourceStagedOperationDelta
	reader, adopted := work.operationIDs[component.effects.producer]
	exposure, issued := work.operationIDs[exposureRequest.producer]
	exposureRecipe := work.operationRecipes[exposureRequest.producer]
	if !adopted || !issued || reader.epoch != work.operationEpoch || exposure.epoch != work.operationEpoch || reader.index == 0 || exposure.index == 0 || int(reader.index) >= len(work.operations) || int(exposure.index) >= len(work.operations) || !work.validFieldExposureReading(exposureRecipe, exposureRequest) {
		return delta, nil, false
	}
	state := &work.operations[exposure.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{exposureRequest.consumer, exposureRequest.edge}]
	if state.invalid || state.revision == 0 || subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || !sameOperationRequest(subscriber.request, exposureRequest) {
		return delta, nil, false
	}
	delta.required = appendEntryLawRequirement(delta.required, exposureRequest)
	complete := state.delta.extracted && len(state.delta.exposures) != 0 && len(state.delta.residuals)+len(state.delta.effects)+len(state.delta.invoked)+len(state.delta.relative) == 0
	var forwards []sourceStagedFieldForward
	for _, alternative := range state.delta.exposures {
		if alternative.creating != nil || !validNativeOwnFieldAlternative(exposureRecipe, alternative) {
			complete = false
			continue
		}
		matched := false
		for slot, getter := range work.operations[reader.index].getters {
			if getter.installed == nil || getter.installed.exposure != exposure || getter.declaration != alternative.endpoint.expression || getter.installed.creating != alternative.creating || !sameOperationRequest(getter.demand.request, component.effects) {
				continue
			}
			matched = true
			body, bodyForwards, bodyComplete := work.originalGetterMutationOutputs(facts, field, reader, slot)
			complete = complete && bodyComplete
			for _, required := range body.required {
				delta.required = appendEntryLawRequirement(delta.required, required)
			}
			delta.residuals = append(delta.residuals, body.residuals...)
			forwards = append(forwards, bodyForwards...)
			for _, forward := range bodyForwards {
				if !validNativeInstallationMutationForward(header, field, forward) {
					complete = false
				}
			}
		}
		complete = complete && matched
	}
	return delta, forwards, complete
}

func nativeInstallationMutationHasAbsent(e *sourceNativeInstallationMutationEnumeration, ordinal int) bool {
	for _, component := range e.components {
		if component.ordinal == ordinal && component.phase == stagedFieldObservationHas {
			return component.enumerated && component.source != nil && component.absent
		}
	}
	return false
}
