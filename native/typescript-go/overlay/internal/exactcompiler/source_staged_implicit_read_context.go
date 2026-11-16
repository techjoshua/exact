package exactcompiler

// implicitDescriptorReadPhase authenticates the actual descriptor read owner.
// This is a scope check, not accounting/currency: Enum completion, all source
// alternatives, field results, C/current/APPLIED remain independent consumers.
// Set, descriptor-attribute and integrity observations have no admitted role.
func (work *callableEffectWork) implicitDescriptorReadPhase(coverage sourceStagedOperationRecipe, original *sourceStagedNativeGetSource, p *sourceStagedImplicitProtocolPhase) bool {
	if original == nil || original.kind != sourceNativeObjectDefineProperties || original.descriptorMap == nil || p == nil || p.self != p || p.epoch != work.operationEpoch || p.generation != work.operationGeneration || !validStagedMemberCoverageRecipe(coverage) {
		return false
	}
	c := coverage.memberSource
	if c.generation != work.operationGeneration || !sameOperationRequest(c.request, p.coverage) || c.coverage.cut != p.cut || c.coverage.origin != p.receiver {
		return false
	}
	id := work.operationIDs[p.request.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !state.dependenciesRegistered {
		return false
	}
	if p.mapLaw != 0 {
		if p.law != 0 || state.implicitMap != p {
			return false
		}
		switch p.mapLaw {
		case stagedMapOrdinaryOwnKeysNoUserEntry:
			return validStagedMapProtocolRecipe(recipe) && recipe.mapProtocol.generation == work.operationGeneration && sameOperationRequest(recipe.mapProtocol.request, p.request) && sameOperationRequest(p.request, original.descriptorMap.protocol) && sameOperationRequest(c.parent, original.request) && p.receiver == original.descriptorMap.descriptors.expression
		case stagedMapOwnDataGetNoUserEntry:
			e := recipe.mapEntry
			return validStagedMapEntryRecipe(recipe) && e.generation == work.operationGeneration && sameOperationRequest(e.request, p.request) && sameOperationRequest(c.parent, p.request) && sameOperationRequest(e.source.request, original.request) && e.source.get == original.get && e.source.method == original.method && e.read != nil && e.read.getter == nil && e.read.accounting == sourceEffectsAccounted
		}
		return false
	}
	field, phase, valid := stagedFieldMemberParent(c.parent)
	if !valid || !sameOperationRequest(field, p.request) || !validNativeGetRequest(recipe, p.request) || recipe.nativeGet.descriptorEntry == nil || !sameOperationRequest(recipe.nativeGet.request, original.request) || recipe.nativeGet.get != original.get || recipe.nativeGet.method != original.method || state.implicitField == nil {
		return false
	}
	if phase == stagedFieldObservationHas {
		return state.implicitField.has == p && p.law == stagedFieldOrdinaryHasNoUserEntry
	}
	return phase == stagedFieldObservationGet && state.implicitField.get == p && (p.law == stagedFieldOwnDataNoUserEntry || p.law == stagedFieldIntrinsicGetNoUserEntry)
}
