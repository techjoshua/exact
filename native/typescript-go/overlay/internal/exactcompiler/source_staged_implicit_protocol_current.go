package exactcompiler

// implicitFieldPhaseCurrent joins the exact original primitive event and final
// C. No prefix stamp, source-only value incompleteness or normal absence is
// promoted into a capability. Every C member remains an independent premise.
func (work *callableEffectWork) implicitFieldPhaseCurrent(p *sourceStagedImplicitProtocolPhase, field sourceStagedOperationRequest, phase sourceStagedFieldObservationPhase, original *sourceStagedNativeGetSource) bool {
	if p == nil || p.self != p || p.generation != work.operationGeneration || p.epoch != work.operationEpoch || !sameOperationRequest(p.request, field) {
		return false
	}
	parent, valid := stagedFieldMemberRequest(field, phase)
	if !valid || !work.implicitCoverageCurrent(p.coverage, parent, original, p) {
		return false
	}
	c := work.operationRecipes[p.coverage.producer].memberSource.coverage
	if c.origin != p.receiver || c.cut != p.cut || !operationPrefix(c.required, p.required, sameOperationRequest) || !operationPrefix(p.required, c.required, sameOperationRequest) {
		return false
	}
	if phase == stagedFieldObservationHas {
		return p.law == stagedFieldOrdinaryHasNoUserEntry
	}
	return p.law == stagedFieldOwnDataNoUserEntry || p.law == stagedFieldIntrinsicGetNoUserEntry
}
func (work *callableEffectWork) implicitFieldCurrent(request sourceStagedOperationRequest, original *sourceStagedNativeGetSource) bool {
	id := work.operationIDs[request.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !state.dependenciesRegistered || !validNativeGetRequest(recipe, request) || state.implicitField == nil || state.fieldDisposition == nil || !work.nativeWriterCapabilityApplied(request) {
		return false
	}
	event := state.fieldDisposition
	terminal := event.terminal
	if !terminal.observed || terminal.generation != work.operationGeneration || terminal.epoch != work.operationEpoch || !sameOperationRequest(terminal.request, request) || !terminal.hasSeen || !terminal.hasTraversal.observed || terminal.hasTraversal.unresolved || terminal.hasTraversal.contributions || len(event.invoked) != 0 || event.has != sourceEffectsAccounted {
		return false
	}
	roles, valid := fieldSourceRequests(request)
	if !valid {
		return false
	}
	for _, r := range recipe.delta.required {
		if !sameOperationRequest(r, roles.ownWriters) && !sameOperationRequest(r, roles.prototype) {
			return false
		}
	}
	// Sources/unknown presence may still have a complete modeled implicit branch
	// set. Actual mapper classifications, not normal value precision, decide it.
	if !work.implicitFieldSourcesCurrent(state.implicitField.ownSources, roles.ownWriters, state.implicitField, original) || !work.implicitFieldSourcesCurrent(state.implicitField.prototypeSources, roles.prototype, state.implicitField, original) || !work.implicitFieldPhaseCurrent(state.implicitField.has, request, stagedFieldObservationHas, original) {
		return false
	}
	if terminal.getBypassed {
		return terminal.presence == propertyAbsent && event.kind == stagedFieldDispositionAbsent && event.get == sourceEffectsBypassed && !terminal.getTraversal.observed
	}
	if !terminal.getSeen || !terminal.getTraversal.observed || terminal.getTraversal.unresolved || terminal.getTraversal.contributions || event.get != sourceEffectsAccounted {
		return false
	}
	return work.implicitFieldPhaseCurrent(state.implicitField.get, request, stagedFieldObservationGet, original)
}
func (work *callableEffectWork) implicitMapPhaseCurrent(p *sourceStagedImplicitProtocolPhase, parent sourceStagedOperationRequest, law sourceStagedMapEntryLaw, source *sourceStagedNativeGetSource) bool {
	if p == nil || p.self != p || p.generation != work.operationGeneration || p.epoch != work.operationEpoch || p.mapLaw != law || !sameOperationRequest(p.request, parent) {
		return false
	}
	coverageParent := parent
	switch law {
	case stagedMapOrdinaryOwnKeysNoUserEntry:
		coverageParent = source.request
	case stagedMapOwnDataGetNoUserEntry:
	default:
		return false
	}
	if !work.implicitCoverageCurrent(p.coverage, coverageParent, source, p) {
		return false
	}
	c := work.operationRecipes[p.coverage.producer].memberSource.coverage
	return c != nil && c.origin == p.receiver && c.cut == p.cut && operationPrefix(c.required, p.required, sameOperationRequest) && operationPrefix(p.required, c.required, sameOperationRequest)
}

// implicitMapRolesCurrent consumes the original private-use/OwnKeys/enum
// observations separately from nominal target definition. Their descriptors or
// local X cannot supply an empty-source conclusion without the fresh original
// input receipt and exact observed C. Every RHS/coverage debt remains installed.
func (work *callableEffectWork) implicitMapRolesCurrent(source *sourceStagedNativeGetSource, phase *sourceStagedImplicitProtocolPhase) bool {
	for _, role := range []string{"own-writers", "own-keys", "enumerability", "target"} {
		request := stagedMapProtocolPhaseRequest(source, role)
		recipe := work.operationRecipes[request.producer]
		id := work.operationIDs[request.producer]
		if !validStagedMapProtocolRecipe(recipe) || !sameOperationRequest(recipe.mapProtocol.request, request) || !sameOperationRequest(recipe.nativeGet.request, source.request) || recipe.nativeGet.get != source.get || recipe.nativeGet.method != source.method || recipe.nativeGet.kind != source.kind || recipe.mapProtocol.generation != work.operationGeneration || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !work.nativeWriterCapabilityApplied(request) {
			return false
		}
		if role == "target" {
			// This accounts only for the genuine ordinary target protocol. The
			// outer all-row event supplies disjointness, never this local flag.
			if !recipe.mapProtocol.targetAccounted || !source.mapTargetEffects {
				return false
			}
			continue
		}
		observed := recipe.mapProtocol.writerSource
		if observed == nil || observed.generation != work.operationGeneration || !work.operations[id.index].mapSourceObserved || observed.cut != phase.cut || observed.group != phase.receiver || !sameOperationRequest(observed.request, source.descriptorMap.protocol) {
			return false
		}
		if role == "own-keys" && !recipe.mapProtocol.keysAccounted || role == "enumerability" && !recipe.mapProtocol.enumerabilityAccounted {
			return false
		}
		if role != "own-writers" {
			continue // Their strict factories require no additional children.
		}
		if !operationContainsRequest(recipe.delta.required, phase.coverage) {
			return false
		}
		for _, required := range recipe.delta.required {
			if sameOperationRequest(required, phase.coverage) {
				continue
			}
			// The original writer owner recorded these exact RHS relationships.
			// Input-construction accounting is supplied by the independent fresh
			// receipt above, not by RHS Effects closure or metadata.
			if !operationContainsRequest(recipe.writerRequired, required) || !validWriterRHSRequirement(recipe.key, required) || !work.nativeWriterCapabilityApplied(required) {
				return false
			}
		}
	}
	return true
}

// implicitDefinitionSourcesCurrent is the EMPTY-only source composition. It
// requires genuine complete lookup/input observations, actual modeled source
// alternatives, the real post-loop inventory and EVERY entry/field contribution.
// Call/Throw/import Effects remain ordinary graph closure debt, not evidence.
func (work *callableEffectWork) implicitDefinitionSourcesCurrent(source *sourceStagedNativeGetSource) bool {
	if source == nil || source.kind != sourceNativeObjectDefineProperties || source.descriptorMap == nil || source.descriptorMap.argumentSource != nil || !work.implicitNativeInputCurrent(source, source) {
		return false
	}
	protocol := source.descriptorMap.protocol
	recipe := work.operationRecipes[protocol.producer]
	id := work.operationIDs[protocol.producer]
	if !validStagedMapProtocolRecipe(recipe) || !sameOperationRequest(recipe.mapProtocol.request, protocol) || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	p := state.implicitMap
	if p == nil || p.enumeration == nil || !work.implicitMapPhaseCurrent(p, protocol, stagedMapOrdinaryOwnKeysNoUserEntry, source) || !work.nativeWriterCapabilityApplied(protocol) || !work.implicitMapRolesCurrent(source, p) {
		return false
	}
	terminal := p.enumeration
	if terminal.generation != work.operationGeneration || terminal.epoch != work.operationEpoch || !sameOperationRequest(terminal.request, protocol) || terminal.cut != p.cut || !terminal.observed || terminal.refused || !terminal.prefixRepresented || terminal.traversal.unresolved || terminal.traversal.contributions || len(terminal.unrepresented) != 0 || len(terminal.entries) == 0 || len(terminal.entries) != len(recipe.mapProtocol.entries) {
		return false
	}
	for i, entry := range terminal.entries {
		if !sameStagedMapEntry(entry, recipe.mapProtocol.entries[i]) || entry.unmapped || entry.getter != nil {
			return false
		}
		request, valid := stagedMapEntryRequest(source, entry)
		eid := work.operationIDs[request.producer]
		if !valid || !operationContainsRequest(recipe.delta.required, request) || eid.epoch != work.operationEpoch || eid.index == 0 || int(eid.index) >= len(work.operations) {
			return false
		}
		er := work.operationRecipes[request.producer]
		es := &work.operations[eid.index]
		if !validStagedMapEntryRecipe(er) || !sameOperationRequest(er.mapEntry.request, request) || er.mapEntry.read == nil || er.mapEntry.read.getter != nil || er.mapEntry.read.accounting != sourceEffectsAccounted || !work.nativeWriterCapabilityApplied(request) || !work.implicitMapPhaseCurrent(es.implicitMap, request, stagedMapOwnDataGetNoUserEntry, source) {
			return false
		}
		for _, field := range reflectiveDescriptorKeys {
			child := stagedMapEntryFieldRequest(er.mapEntry, field)
			if !operationContainsRequest(er.delta.required, child) || !work.implicitFieldCurrent(child, source) {
				return false
			}
		}
	}
	return true
}
