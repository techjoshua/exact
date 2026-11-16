package exactcompiler

// sourceOriginalGetMutationProviderKind identifies the original output owner.
// It is descriptive metadata, not an Effects or normal-value disposition.
type sourceOriginalGetMutationProviderKind uint8

const (
	originalGetMutationProviderUnsupported sourceOriginalGetMutationProviderKind = iota
	originalGetMutationProviderReflective
	originalGetMutationProviderGet
	originalGetMutationProviderExternal
	originalGetMutationProviderNative
)

// sourceOriginalGetMutationFieldLink retains an already declared child of the
// same original field. Its atoms are delivered by that child's actual installed
// reader, not copied into another sealed prefix. The link itself is no atom.
type sourceOriginalGetMutationFieldLink struct {
	nativeComponent                 sourceNativeInstallationMutationComponentKind // Zero preserves the original Get provider link domain.
	nativeField                     *sourceOriginalGetNativeField                 // Only installation-owned FIELD links; exact captured component, not a nested output.
	candidate, field, child, origin sourceStagedOperationRequest
	kind                            sourceOriginalGetMutationProviderKind
	generation                      *projectGeneration
}

func sameOriginalGetMutationFieldLink(a, b sourceOriginalGetMutationFieldLink) bool {
	return a.kind == b.kind && a.generation == b.generation && a.nativeComponent == b.nativeComponent && sameOriginalGetNativeField(a.nativeField, b.nativeField) && sameOperationRequest(a.candidate, b.candidate) && sameOperationRequest(a.field, b.field) && sameOperationRequest(a.child, b.child) && sameOperationRequest(a.origin, b.origin)
}

func cloneOriginalGetMutationFieldLinks(in []sourceOriginalGetMutationFieldLink) []sourceOriginalGetMutationFieldLink {
	if in == nil {
		return nil
	}
	out := make([]sourceOriginalGetMutationFieldLink, len(in))
	for index, link := range in {
		requests := cloneOperationDelta(sourceStagedOperationDelta{required: []sourceStagedOperationRequest{link.candidate, link.field, link.child, link.origin}}).required
		out[index] = link
		out[index].nativeField = cloneOriginalGetNativeField(link.nativeField)
		out[index].candidate, out[index].field, out[index].child, out[index].origin = requests[0], requests[1], requests[2], requests[3]
	}
	return out
}

func originalGetMutationFieldLinkOrigin(source *sourceFieldMutationData) (sourceStagedOperationRequest, sourceOriginalGetMutationProviderKind) {
	if source == nil {
		return sourceStagedOperationRequest{}, originalGetMutationProviderUnsupported
	}
	if source.installation != nil {
		return source.installation.request, originalGetMutationProviderNative
	}
	if source.native != nil {
		return source.native.request, originalGetMutationProviderNative
	}
	if source.external != nil {
		return source.externalSource, originalGetMutationProviderExternal
	}
	if source.getInterest != nil {
		return originalGetMutationInterestOrigin(source.getInterest), originalGetMutationProviderGet
	}
	if source.getSource != nil {
		return originalGetMutationReader(source.getSource), originalGetMutationProviderGet
	}
	return sourceStagedOperationRequest{}, originalGetMutationProviderUnsupported
}

// validOriginalGetMutationFieldLinkShape is envelope-only. Registered membership
// and current graph ownership are independently checked by the field consumer.
func validOriginalGetMutationFieldLinkShape(recipe sourceStagedOperationRecipe, link sourceOriginalGetMutationFieldLink) bool {
	source := recipe.mutationData
	if source == nil {
		return false
	}
	if source.installation != nil {
		if !validNativeInstallationMutationSource(source.installation) || !operationContainsRequest(recipe.delta.required, source.installation.request) || !operationContainsRequest(recipe.delta.required, source.installation.algorithm) {
			return false
		}
		switch link.nativeComponent {
		case nativeInstallationMutationFieldPhase:
			h := link.nativeField
			if !validOriginalFieldMutationHeader(h, false) || h.generation != source.generation || !sameOperationRequest(h.root, source.installation.request) || !sameOperationRequest(h.algorithm, source.installation.algorithm) || !operationContainsRequest(recipe.delta.required, h.field) {
				return false
			}
		case nativeInstallationMutationCallee, nativeInstallationMutationTarget:
			if link.nativeField != nil || link.kind != originalGetMutationProviderGet {
				return false
			}
			root := &sourceStagedNativeGetSource{request: source.installation.request, get: source.installation.request.producer.operation.Expression()}
			reader := nativeRootDebtRequest(root, "callee-get")
			if link.nativeComponent == nativeInstallationMutationTarget {
				reader = nativeEagerTargetRequest(root)
			}
			if !sameOperationRequest(link.candidate, reader) || !sameOperationRequest(link.origin, reader) {
				return false
			}
		default:
			return false
		}
	} else if link.nativeComponent != 0 || link.nativeField != nil || source.getSource == nil && source.getInterest == nil {
		return false
	}
	return link.generation != nil && link.generation == source.generation && sameOperationRequest(link.field, source.field) && link.child.producer != recipe.key && link.child.producer.kind == relativeDemandDirectExposure && link.kind > originalGetMutationProviderReflective && link.kind <= originalGetMutationProviderNative && link.origin.producer.operation != nil && operationContainsRequest(recipe.delta.required, link.child) && operationContainsRequest(recipe.delta.required, link.candidate)
}

func (work *callableEffectWork) originalGetMutationFieldLinksCurrent(recipe sourceStagedOperationRecipe) bool {
	for _, link := range recipe.fieldMutationLinks {
		if !work.validOriginalGetMutationFieldLink(recipe, link) {
			return false
		}
	}
	return true
}

// originalGetMutationFieldLinksInstalled proves that the original installed
// reader already reaches every linked child through its own field family.
// Child output readiness remains with installedMutationDataCurrent.
func (work *callableEffectWork) originalGetMutationFieldLinksInstalled(recipe sourceStagedOperationRecipe, getter sourceStagedGetterRequirement) bool {
	for _, link := range recipe.fieldMutationLinks {
		child := work.operationRecipes[link.child.producer]
		if !work.validOriginalGetMutationFieldLink(recipe, link) || child.mutationData == nil || !work.installedMutationDataMembership(child.mutationData, getter) {
			return false
		}
	}
	return true
}

// validOriginalGetMutationFieldLink validates only actual retained relationships.
// It deliberately does not ask sibling output X/APPLIED or closure: final
// installed reader readiness owns those checks. A missing child stays pending.
func (work *callableEffectWork) validOriginalGetMutationFieldLink(recipe sourceStagedOperationRecipe, link sourceOriginalGetMutationFieldLink) bool {
	source := recipe.mutationData
	if !validOriginalGetMutationFieldLinkShape(recipe, link) || source == nil || link.generation != work.operationGeneration || source.generation != link.generation || !sameOperationRequest(link.field, source.field) || link.child.producer == recipe.key || link.kind == originalGetMutationProviderUnsupported || link.kind == originalGetMutationProviderReflective {
		return false
	}
	field, registered := work.operationRecipes[link.field.producer]
	if !registered || !operationContainsRequest(field.delta.required, source.request) || !operationContainsRequest(field.delta.required, link.child) || !operationContainsRequest(recipe.delta.required, link.child) || !operationContainsRequest(recipe.delta.required, link.candidate) {
		return false
	}
	child, registered := work.operationRecipes[link.child.producer]
	if !registered || !validFieldMutationDataRecipe(child) || child.mutationData.generation != link.generation || !sameOperationRequest(child.mutationData.field, link.field) || !sameOperationRequest(child.mutationData.request, link.child) || work.memberCoverageObserved[child.key] != link.generation {
		return false
	}
	described := source.getSource
	if source.installation != nil {
		var current bool
		if link.nativeComponent == nativeInstallationMutationFieldPhase {
			described, current = work.nativeInstallationMutationComponentSource(source.installation, link.nativeField)
			if !current || described == nil || !sameOriginalGetNativeField(described.nativeField, link.nativeField) {
				return false
			}
		} else {
			var interest *sourceOriginalGetMutationInterest
			described, interest, current = work.nativeInstallationMutationGetSource(source.installation, link.nativeComponent)
			if !current || described == nil || interest == nil || !operationContainsRequest(recipe.delta.required, originalGetMutationInterestRequest(interest)) || !sameOperationRequest(originalGetMutationReader(described), link.origin) {
				return false
			}
			if child.mutationData.getInterest != nil {
				if !sameOriginalGetMutationInterest(child.mutationData.getInterest, interest) {
					return false
				}
			} else if child.mutationData.getSource == nil || !sameOriginalGetMutationIdentity(child.mutationData.getSource, described) {
				return false
			}
		}
		// The selected intrinsic target arm has no member population/coverage
		// role. Its SOURCE and native reader debts still authenticate the link;
		// other source kinds retain their actual nonempty coverage membership.
		if !operationContainsRequest(recipe.delta.required, originalGetMutationRequest(described)) || described.coverage.producer.operation != nil && !operationContainsRequest(recipe.delta.required, described.coverage) {
			return false
		}
		if link.nativeComponent != nativeInstallationMutationFieldPhase {
			// This is the whole original implicit Get's direct sibling delivery,
			// not a fabricated C candidate or a materialized output copy.
			origin, kind := originalGetMutationFieldLinkOrigin(child.mutationData)
			return kind == link.kind && sameOperationRequest(origin, link.origin)
		}
	} else if source.getInterest != nil {
		var current bool
		described, current = work.resolveOriginalGetMutationInterest(source.getInterest)
		if !current {
			return false
		}
	} else {
		current := work.operationRecipes[originalGetMutationRequest(described).producer]
		if !work.originalGetMutationCurrent(current) || !sameOriginalGetMutationIdentity(current.memberSource.originalGetMutation, described) {
			return false
		}
		described = current.memberSource.originalGetMutation
	}
	member := false
	for _, provider := range described.providers {
		member = member || provider.kind == link.kind && sameOperationRequest(provider.candidate, link.candidate) && work.originalGetMutationFieldReaderCorresponds(child.mutationData, provider.reader, link.origin) && provider.data.producer.operation == nil
	}
	if !member {
		return false
	}
	var parent sourceStagedOperationRequest
	if source.installation != nil {
		parent = described.request
	} else if source.getSource != nil {
		parent = source.getSource.request
		if source.getSource.nativeCallee != nil {
			parent = source.getSource.nativeCallee.root
		}
	} else {
		parent = source.getInterest.parent
		if source.getInterest.nativeCallee != nil {
			parent = source.getInterest.nativeCallee.root
		}
	}
	candidate, present := work.operationRecipes[link.candidate.producer]
	if !present || !validStagedMemberProtocolRecipe(candidate) || candidate.memberSource.generation != link.generation || !sameOperationRequest(candidate.memberSource.request, link.candidate) || !sameOperationRequest(candidate.memberSource.parent, parent) || candidate.memberSource.protocolSource == nil || !work.originalGetMutationFieldReaderCorresponds(child.mutationData, candidate.memberSource.protocolSource.required, link.origin) {
		return false
	}
	origin, kind := originalGetMutationFieldLinkOrigin(child.mutationData)
	return kind == link.kind && sameOperationRequest(origin, link.origin)
}

// originalGetMutationInterestReaderCorresponds keeps the producer's physical
// resumer origin distinct from its observed semantic record Effects reader.
// Only the existing registered D/RD/reading/cut relation can join these domains;
// neither final resumer observation nor transitive closure is an admission gate.
func (work *callableEffectWork) originalGetMutationInterestReaderCorresponds(interest *sourceOriginalGetMutationInterest, reader sourceStagedOperationRequest) bool {
	if interest == nil {
		return false
	}
	if sameOperationRequest(interest.origin, reader) {
		return true
	}
	if interest.nativeField != nil || interest.nativeCallee != nil || interest.nativeRoot.producer.operation != nil || !work.originalGetMutationInterestDescriptorReading(interest) {
		return false
	}
	registered := work.operationRecipes[originalGetMutationInterestRequest(interest).producer]
	if !work.originalGetMutationInterestCurrent(registered) || !sameOriginalGetMutationInterest(registered.memberSource.originalGetMutationInterest, interest) {
		return false
	}
	origin := work.operationRecipes[interest.origin.producer]
	resume := origin.callResult.getResult.frameworkResume
	actual, issued := work.originalDescriptorRecordGetEffects(resume)
	return issued && sameOperationRequest(actual, reader) && work.originalRecordGetMutationReaderCurrent(work.operationRecipes[actual.producer])
}

// Equal-origin providers retain their existing exact identity rule. The sole
// distinct-origin case is an authenticated framework record interest; callers
// still require the exact same-field child and retain both requests as debt.
func (work *callableEffectWork) originalGetMutationFieldReaderCorresponds(source *sourceFieldMutationData, reader, origin sourceStagedOperationRequest) bool {
	if sameOperationRequest(reader, origin) {
		return true
	}
	return source != nil && source.getInterest != nil && sameOperationRequest(source.getInterest.origin, origin) && work.originalGetMutationInterestReaderCorresponds(source.getInterest, reader)
}
