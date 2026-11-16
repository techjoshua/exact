package exactcompiler

// sourceOriginalGetMutationProvider is a detached association from one actual
// original Get population member to its existing reader and stored getter DATA.
// Zero reader/data means unsupported, never an empty mutation disposition.
type sourceOriginalGetMutationProvider struct {
	kind      sourceOriginalGetMutationProviderKind
	candidate sourceStagedOperationRequest
	reader    sourceStagedOperationRequest
	data      sourceStagedOperationRequest
}

func sameOriginalGetMutationProvider(a, b sourceOriginalGetMutationProvider) bool {
	return a.kind == b.kind && sameOperationRequest(a.candidate, b.candidate) && sameOperationRequest(a.reader, b.reader) && sameOperationRequest(a.data, b.data)
}
func originalGetMutationProviderRefinement(a, b sourceOriginalGetMutationProvider) bool {
	return sameOperationRequest(a.candidate, b.candidate) && (a.kind == originalGetMutationProviderUnsupported && a.reader.producer.operation == nil && a.data.producer.operation == nil || sameOriginalGetMutationProvider(a, b))
}
func cloneOriginalGetMutationProviders(in []sourceOriginalGetMutationProvider) []sourceOriginalGetMutationProvider {
	if in == nil {
		return nil
	}
	out := make([]sourceOriginalGetMutationProvider, len(in))
	for i, p := range in {
		required := cloneOperationDelta(sourceStagedOperationDelta{required: []sourceStagedOperationRequest{p.candidate, p.reader, p.data}}).required
		out[i] = sourceOriginalGetMutationProvider{kind: p.kind, candidate: required[0], reader: required[1], data: required[2]}
	}
	return out
}

func validOriginalGetMutationProviders(s *sourceOriginalGetMutationSource) bool {
	// Constructors carry discovery metadata before the original publisher takes
	// its registered population snapshot. Such a constructor is not a recipe.
	if len(s.providers) == 0 {
		return true
	}
	if len(s.providers) != len(s.population) {
		return false
	}
	for i, p := range s.providers {
		if !sameOperationRequest(p.candidate, s.population[i]) {
			return false
		}
		if p.kind == originalGetMutationProviderUnsupported {
			if p.reader.producer.operation != nil || p.data.producer.operation != nil {
				return false
			}
			continue
		}
		if p.kind != originalGetMutationProviderReflective {
			if p.kind < originalGetMutationProviderGet || p.kind > originalGetMutationProviderNative || p.reader.producer.operation == nil || p.reader.inputs != nil || p.reader.producer.kind != relativeDemandEffects || p.data.producer.operation != nil {
				return false
			}
			continue
		}
		reader := descriptorRecordGetEffectsRequest(s.request)
		if s.nativeField != nil {
			reader = s.nativeField.field
			if s.nativeField.phase == stagedFieldObservationHas {
				if !sameOperationRequest(p.reader, reader) || !sameOperationRequest(p.data, sourceStagedOperationRequest{}) {
					return false
				}
				continue // Typed Has description; no getter DATA or BODY activation.
			}
		} else if s.record == nil {
			return false
		}
		if !sameOperationRequest(p.reader, reader) || p.data.producer.kind != relativeDemandDirectExposure || p.data.producer.selector.field != "get" || p.data.producer.selector.occurrence == nil || p.data.consumer != s.request.consumer || p.data.reading != p.reader.producer || p.data.inputs != nil {
			return false
		}
	}
	return true
}

// Description completeness names every provider. It supplies no BODY/DATA,
// invocation, source closure, property presence or no-mutation conclusion.
func originalGetMutationDescriptionComplete(s *sourceOriginalGetMutationSource) bool {
	if s.pending || len(s.providers) != len(s.population) {
		return false
	}
	for _, p := range s.providers {
		if p.kind == originalGetMutationProviderUnsupported || p.reader.producer.operation == nil || p.kind == originalGetMutationProviderReflective && p.data.producer.operation == nil && (s.nativeField == nil || s.nativeField.phase != stagedFieldObservationHas) {
			return false
		}
	}
	return true
}

func (work *callableEffectWork) describeOriginalGetMutationProviders(s *sourceOriginalGetMutationSource) []sourceOriginalGetMutationProvider {
	out := make([]sourceOriginalGetMutationProvider, len(s.population))
	for i, candidate := range s.population {
		out[i].candidate = candidate
		parent := s.request
		if s.nativeCallee != nil {
			parent = s.nativeCallee.root
		}
		recipe := work.operationRecipes[candidate.producer]
		if !validReflectiveContributionRecipe(recipe) {
			if !validStagedMemberProtocolRecipe(recipe) || recipe.memberSource.generation != s.generation || !sameOperationRequest(recipe.memberSource.request, candidate) || !sameOperationRequest(recipe.memberSource.parent, parent) || recipe.memberSource.candidate.cut != s.queryCut || recipe.memberSource.protocolSource == nil {
				continue
			}
			required := recipe.memberSource.protocolSource.required
			original := work.operationRecipes[required.producer]
			kind := originalGetMutationProviderUnsupported
			if validStagedMemberExternalGetRecipe(original) && original.memberSource.generation == s.generation {
				kind = originalGetMutationProviderExternal
			} else if original.nativeGet != nil && validDescriptorRetrieval(original.nativeGet) && sameOperationRequest(original.nativeGet.request, required) && required.producer.selector == (sourceStagedOperationSelector{}) {
				kind = originalGetMutationProviderNative
			} else if header, issued := work.nativeInstallationMutationSourceFor(original.nativeGet); issued && sameOperationRequest(header.request, required) {
				kind = originalGetMutationProviderNative
			} else if required.producer.selector.field == "eager-target" || required.producer.selector.field == "callee-get" || validDescriptorRecordGetRecipe(original) {
				interest, issued := work.originalGetMutationInterestFor(work.operationFacts, recipe.memberSource.candidate.operation, recipe.memberSource.candidate.region)
				if issued && work.originalGetMutationInterestReaderCorresponds(interest, required) {
					kind = originalGetMutationProviderGet
				}
			}
			if kind != originalGetMutationProviderUnsupported {
				out[i].kind, out[i].reader = kind, required
			}
			continue
		}
		if recipe.memberSource.generation != s.generation || !sameOperationRequest(recipe.memberSource.request, candidate) || !sameOperationRequest(recipe.memberSource.parent, parent) || recipe.memberSource.candidate.cut != s.queryCut {
			continue
		}
		d := recipe.memberSource.reflectiveContribution
		reader := descriptorRecordGetEffectsRequest(s.request)
		purpose := reflectiveContributionRecordGet
		if s.nativeField != nil {
			reader = s.nativeField.field
			purpose = reflectiveContributionFieldGet
			if s.nativeField.phase == stagedFieldObservationHas {
				purpose = reflectiveContributionHas
			}
			if !work.reflectiveContributionCurrent(recipe) {
				continue
			}
		} else if s.record == nil {
			continue
		}
		if d.purpose != purpose || d.generation != s.generation || !sameOperationRequest(d.parent, parent) || !sameOperationRequest(d.reader, reader) {
			continue
		}
		if purpose == reflectiveContributionHas {
			if len(d.data) == 0 {
				out[i].kind, out[i].reader = originalGetMutationProviderReflective, reader
			}
			continue // Has retains its source/Effects debts without inventing Get DATA.
		}
		if len(d.data) != 1 {
			continue
		}
		// Retain a real registered DATA description, not a synthesized getter role.
		data := work.operationRecipes[d.data[0].producer]
		if !validNativeFieldExposureRecipe(data) || !sameOperationRequest(d.data[0], nativeFieldExposureRequest(data.nativeGet, "get", reader)) {
			continue
		}
		out[i].kind = originalGetMutationProviderReflective
		out[i].reader = reader
		out[i].data = d.data[0]
	}
	return out
}

func (work *callableEffectWork) originalGetMutationProvidersCurrent(s *sourceOriginalGetMutationSource) bool {
	actual := work.describeOriginalGetMutationProviders(s)
	if len(actual) != len(s.providers) {
		return false
	}
	for i, p := range s.providers {
		if p.reader.producer.operation != nil && !sameOriginalGetMutationProvider(p, actual[i]) {
			return false
		}
	}
	return true
}
