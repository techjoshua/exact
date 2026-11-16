package exactcompiler

// constructedMethodLookupRequirements belongs to the method property's Get,
// before actual evaluation or invocation. These source roles cannot pay the
// enclosing Call's eager/algorithm/result obligations.
func constructedMethodLookupRequirements(source *sourceStagedConstructedMember) []sourceStagedOperationRequest {
	return []sourceStagedOperationRequest{constructedMemberRequest(source, "own-writers"), constructedMemberRequest(source, "callee"), stagedMemberCoverageRequest(source.request, source.construction.site, source.cut)}
}

// recordConstructedMethodGet consumes only the same original Call's finishing
// Get. Its phase preserves the Call-owned physical context and actual property
// node; it creates no standalone PropertyAccess query or selected method value.
func (work *callableEffectWork) recordConstructedMethodGet(facts []callableFacts, q *sourceValueQuery, source sourceStagedConstructedMember, result *accessorCandidates) bool {
	if q == nil || q.owner == nil || q.executable == nil || q.executable.project == nil || work.operationGeneration == nil || !work.operationGeneration.active || q.executable.project.activeGeneration != work.operationGeneration || q.owner.program != work.operationGeneration.program || q.owner.checker != work.operationGeneration.checker || q.executable.checker != q.owner.checker || q.inputs != nil || q.operation != nil || q.effectOwner != source.request.consumer || result == nil || !validConstructedMemberSource(&source) || q.owner.generation != work.operationGeneration {
		return false
	}
	b, member := q.stagedConstructedMember, q.stagedMember
	if b == nil || member == nil || !b.live || !b.finishing || b.owner != q || b.generation != work.operationGeneration || b.issued == nil || b.source == nil || !sameConstructedMemberSource(b.source, &source) || !sameOperationRequest(b.request, source.request) || b.get != source.get || b.site != source.construction.site || q.protectedMember != source.get || q.relativeInputCut(source.request.producer.operation) != source.cut || !q.liveStagedMemberSource(member, b.issued, member.read) || member.coverage == nil || member.coverage.origin != source.construction.site || member.coverage.cut != source.cut {
		return false
	}
	caller, known := work.memberNodes[source.request.consumer]
	publisher := q.executable.pendingMemberPublishers[source.request.consumer]
	coverage := work.operationRecipes[member.coverage.request.producer]
	if !known || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || q.executable.standardConstructions[source.construction.site] != source.construction || !validStagedMemberCoverageRecipe(coverage) || work.memberCoverageObserved[coverage.key] != work.operationGeneration || !sameOperationRequest(coverage.memberSource.parent, source.request) {
		return false
	}
	complete := !result.opaque && nativeMemberGetChannelsRepresented(result)
	var effects []EnvironmentEffectSource
	for _, effect := range result.environmentEffects {
		if !validOperationEnvironmentEffect(effect) || effect.relativeCoercion != nil {
			complete = false
			continue
		}
		effects = append(effects, cloneOperationDelta(sourceStagedOperationDelta{effects: []EnvironmentEffectSource{effect}}).effects...)
	}
	sealed := cloneConstructedMemberSource(source)
	request := constructedMemberRequest(&sealed, "method-lookup")
	proof := &sourceStagedConstructedDisposition{request: source.request, site: source.construction.site, generation: work.operationGeneration, role: "method-lookup", lookupComplete: complete, lookupEffects: effects}
	recipe := sourceStagedOperationRecipe{key: request.producer, constructed: &sealed, constructedDisposition: proof, delta: sourceStagedOperationDelta{required: constructedMethodLookupRequirements(&sealed), effects: effects, extracted: complete}}
	if !validConstructedMemberRecipe(recipe) {
		return false
	}
	accepted := false
	if prior, exists := work.operationRecipes[recipe.key]; exists {
		// A partial observation cannot renew or downgrade a sealed description.
		// Its existing children and graph-local observation remain independent.
		if !complete && prior.delta.extracted && validConstructedMemberRecipe(prior) && sameConstructedMemberSource(prior.constructed, &sealed) && operationDeltaPrefix(recipe.delta, prior.delta) {
			return true
		}
		accepted = work.attachOperationSource(facts, recipe)
	} else {
		accepted = work.registerOperationRecipe(facts, recipe)
	}
	if accepted {
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[recipe.key] = work.operationGeneration
	}
	return accepted
}

func (work *callableEffectWork) constructedMethodGetCurrent(recipe sourceStagedOperationRecipe) bool {
	source, proof := recipe.constructed, recipe.constructedDisposition
	if source == nil || recipe.key != constructedMemberRequest(source, "method-lookup").producer || !validConstructedMemberRecipe(recipe) || proof == nil || !proof.lookupComplete || !recipe.delta.extracted || work.operationGeneration == nil || !work.operationGeneration.active || proof.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration || !work.constructedAssignmentProtocolCurrent(source) {
		return false
	}
	registered := work.operationRecipes[recipe.key]
	if registered.constructedDisposition != proof || !sameConstructedMemberSource(registered.constructed, source) {
		return false
	}
	root := work.operationRecipes[source.request.producer]
	for _, member := range root.constructedGroup {
		if sameConstructedMemberSource(&member, source) {
			return true
		}
	}
	return false
}
