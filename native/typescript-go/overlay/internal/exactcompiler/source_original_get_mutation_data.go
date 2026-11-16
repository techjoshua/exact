package exactcompiler

// originalGetMutationReader identifies the existing actual Get Effects owner.
// It never changes the original installation field's request or physical cut.
func originalGetMutationReader(s *sourceOriginalGetMutationSource) sourceStagedOperationRequest {
	if s.intrinsicField != nil {
		return s.intrinsicField.header.field
	}
	if s.nativeField != nil {
		return s.nativeField.field
	}
	if s.record != nil {
		return descriptorRecordGetEffectsRequest(s.request)
	}
	return s.request
}

// validOriginalGetMutationForward validates detached transport only. The work
// consumer independently requires the original RHS subscriber and actual BODY
// binding current. A field DATA reader does not borrow the getter's invocation.
func validOriginalGetMutationForward(recipe sourceStagedOperationRecipe, forward sourceStagedFieldForward) bool {
	s, rhs := recipe.mutationData, forward.mutationRHS
	if s == nil || rhs == nil || rhs.binding == nil || forward.source != nil || rhs.generation != s.generation {
		return false
	}
	var reader sourceStagedOperationRequest
	if s.getSource != nil {
		if !validOriginalGetMutationSource(s.getSource) {
			return false
		}
		reader = originalGetMutationReader(s.getSource)
	} else if s.getInterest != nil {
		if !validOriginalGetMutationInterestShape(s.getInterest) {
			return false
		}
		reader = s.getInterest.parent
		if s.getInterest.nativeField != nil {
			reader = s.getInterest.nativeField.field
		} else if s.getInterest.nativeCallee != nil {
			reader = s.getInterest.origin
		} else if s.getInterest.nativeRoot.producer.operation == nil {
			reader = descriptorRecordGetEffectsRequest(reader)
		}
	} else {
		return false
	}
	if !sameOperationRequest(rhs.parent, reader) || !sameOperationRequest(forward.request, rhs.request) || !operationContainsRequest(recipe.delta.required, forward.request) || !operationContainsRequest(recipe.delta.required, rhs.parent) {
		return false
	}
	if !validInstalledMutationRHSRecipe(sourceStagedOperationRecipe{key: rhs.request.producer, installedMutationRHS: rhs, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{rhs.parent}, exposures: rhs.projection.delta.exposures}}) {
		return false
	}
	possible, _ := mutationWriterMaySupplyField(rhs, s.field)
	if !possible {
		return false
	}
	for _, alternative := range rhs.projection.delta.exposures {
		if sameOperationAlternative(alternative, forward.alternative) {
			return true
		}
	}
	return false
}

// sourceOriginalGetFieldMutationOutputResult separates a field-owned provider
// description from materialized mutation atoms. A deferred field link is never
// a canonical BODY output or an invocation application.
type sourceOriginalGetFieldMutationOutputResult struct {
	delta                       sourceStagedOperationDelta
	forwards                    []sourceStagedFieldForward
	fieldLinks                  []sourceOriginalGetMutationFieldLink
	providerDescriptionComplete bool
	materializedOutputsComplete bool
}

// originalGetFieldMutationOutputs combines the conditional data-slot SOURCE
// arm with outputs of actual already-owned getter BODY readers. Its source
// description may exist before BODY DATA; missing/pending children remain
// required and cannot become an empty mutation population. Full closure is
// deliberately left to the enclosing solver.
func (work *callableEffectWork) originalGetFieldMutationOutputs(facts []callableFacts, source *sourceFieldMutationData) sourceOriginalGetFieldMutationOutputResult {
	s := source.getSource
	var origin sourceStagedOperationRequest
	interestApplied := true
	if source.getInterest != nil {
		origin = originalGetMutationInterestRequest(source.getInterest)
		var represented bool
		s, represented = work.resolveOriginalGetMutationInterest(source.getInterest)
		if !represented {
			return sourceOriginalGetFieldMutationOutputResult{delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{origin}}}
		}
		_, interestApplied = work.originalGetMutationInterestData(source.getInterest)
	} else {
		origin = originalGetMutationRequest(s)
	}
	sourceRequest := originalGetMutationRequest(s)
	data, applied := work.originalGetMutationData(s)
	complete := interestApplied && applied && data.extracted
	delta := sourceStagedOperationDelta{required: []sourceStagedOperationRequest{origin}}
	delta.required = appendEntryLawRequirement(delta.required, sourceRequest)
	readerRequest := originalGetMutationReader(s)
	delta.required = appendEntryLawRequirement(delta.required, readerRequest)
	reader, adopted := work.operationIDs[readerRequest.producer]
	if !adopted || reader.epoch != work.operationEpoch || reader.index == 0 || int(reader.index) >= len(work.operations) {
		complete = false
		return sourceOriginalGetFieldMutationOutputResult{delta: delta}
	}
	var forwards []sourceStagedFieldForward
	var links []sourceOriginalGetMutationFieldLink
	appendBody := func(body sourceStagedOperationDelta, bodyForwards []sourceStagedFieldForward, bodyComplete bool) {
		complete = complete && bodyComplete
		for _, required := range body.required {
			delta.required = appendEntryLawRequirement(delta.required, required)
		}
		delta.residuals = append(delta.residuals, body.residuals...)
		for _, forward := range bodyForwards {
			probe := sourceStagedOperationRecipe{mutationData: source, delta: delta}
			if !validOriginalGetMutationForward(probe, forward) {
				complete = false
				continue
			}
			delta.exposures = append(delta.exposures, forward.alternative)
			forwards = append(forwards, forward)
		}
	}
	// The immutable field snapshot names this SOURCE factory. Fresh original
	// publication may add provider descriptions; consume that current recipe,
	// never rewrite an earlier snapshot or infer a description from DATA ACKs.
	actual := work.operationRecipes[sourceRequest.producer]
	if !work.originalGetMutationCurrent(actual) || !sameOriginalGetMutationIdentity(actual.memberSource.originalGetMutation, s) {
		complete = false
		return sourceOriginalGetFieldMutationOutputResult{delta: delta}
	}
	s = actual.memberSource.originalGetMutation
	if len(s.population) != 0 {
		for _, provider := range s.providers {
			delta.required = appendEntryLawRequirement(delta.required, provider.candidate)
			if provider.kind != originalGetMutationProviderUnsupported && provider.kind != originalGetMutationProviderReflective {
				linked := false
				// Only the original live field mapper can have declared these
				// children. This pure fold retains their existing delivery links.
				field := work.operationRecipes[source.field.producer]
				for _, required := range field.delta.required {
					child := work.operationRecipes[required.producer]
					origin, kind := originalGetMutationFieldLinkOrigin(child.mutationData)
					if kind != provider.kind || !work.originalGetMutationFieldReaderCorresponds(child.mutationData, provider.reader, origin) {
						continue
					}
					link := sourceOriginalGetMutationFieldLink{candidate: provider.candidate, field: source.field, child: required, origin: origin, kind: kind, generation: source.generation}
					probe := sourceStagedOperationRecipe{key: source.request.producer, mutationData: source, delta: cloneOperationDelta(delta)}
					probe.delta.required = appendEntryLawRequirement(probe.delta.required, required)
					if !work.validOriginalGetMutationFieldLink(probe, link) {
						continue
					}
					delta.required = appendEntryLawRequirement(delta.required, required)
					delta.required = appendEntryLawRequirement(delta.required, provider.reader)
					delta.required = appendEntryLawRequirement(delta.required, origin)
					links = append(links, link)
					linked = true
				}
				complete = complete && linked
				continue
			}
			if provider.reader.producer.operation == nil || provider.data.producer.operation == nil {
				complete = false
				continue
			}
			delta.required = appendEntryLawRequirement(delta.required, provider.reader)
			delta.required = appendEntryLawRequirement(delta.required, provider.data)
			// Candidate output completeness does not settle its Get/C Effects; all
			// returned dependencies stay on this field DATA for final closure.
			body, bodyForwards, complete := work.originalReflectiveGetterMutationOutputs(facts, s, provider.candidate, source.field)
			appendBody(body, bodyForwards, complete)
		}
	} else {
		for slot := range work.operations[reader.index].getters {
			body, bodyForwards, complete := work.originalGetterMutationOutputs(facts, source.field, reader, slot)
			appendBody(body, bodyForwards, complete)
		}
	}
	if !originalGetMutationDescriptionComplete(s) {
		complete = false
	}
	return sourceOriginalGetFieldMutationOutputResult{delta: delta, forwards: forwards, fieldLinks: links, providerDescriptionComplete: complete, materializedOutputsComplete: complete && len(links) == 0}
}
