package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedMapProtocolPhaseRequest keeps key population, current enumerability and
// target definition separate. Equal role metadata does not establish coverage.
func stagedMapProtocolPhaseRequest(source *sourceStagedNativeGetSource, role string) sourceStagedOperationRequest {
	request := source.descriptorMap.protocol
	request.producer.selector.field = "descriptor-map:" + role
	request.edge += ":" + role
	return request
}

// prepareStagedDescriptorMapSource runs original source enumeration and entry
// Gets under one scoped borrow. Required producers are registered before reads.
// Writer/key/enumerability/target dispositions are independently pending until
// their original semantic owners publish them. No inventory emptiness pays debt.
func (work *callableEffectWork) prepareStagedDescriptorMapSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	if owner == nil || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	key := work.operations[id.index].key
	prior, registered := work.operationRecipes[key]
	if !registered || prior.nativeGet == nil || prior.nativeGet.descriptorMap == nil || key != prior.nativeGet.descriptorMap.protocol.producer || work.operations[id.index].mapSourceRequested {
		return
	}
	source := prior.nativeGet
	protocol := prior.mapProtocol
	if protocol == nil {
		protocol = &sourceStagedMapProtocolContribution{request: source.descriptorMap.protocol, generation: work.operationGeneration}
	}
	recipe := prior
	recipe.mapProtocol = protocol
	for _, role := range []string{"own-writers", "own-keys", "enumerability", "target"} {
		request := stagedMapProtocolPhaseRequest(source, role)
		child := sourceStagedOperationRecipe{key: request.producer, nativeGet: source, mapProtocol: &sourceStagedMapProtocolContribution{request: request, generation: work.operationGeneration}}
		if role == "target" && source.mapTargetEffects {
			child.mapProtocol.targetAccounted = true
			child.delta.extracted = true
		}
		if !work.registerOperationSourcePrefix(facts, child) {
			return
		}
		if prior.mapProtocol == nil {
			recipe.delta.required = append(recipe.delta.required, request)
		}
	}
	if source.descriptorMap.argumentSource != nil {
		request, registered := work.registerStagedModuleArgumentSource(facts, source)
		if !registered {
			return
		}
		if prior.mapProtocol == nil {
			recipe.delta.required = append(recipe.delta.required, request)
		}
	}
	if !work.attachOperationSource(facts, recipe) {
		return
	}
	if source.descriptorMap.argumentSource != nil && !work.stagedModuleArgumentApplied(source) {
		return // Exact typed source task owns this pending observation; no Enum/C yet.
	}
	// The owning service installs membership before lending its early-request
	// interval, including callers that have not entered the queue dispatcher yet.
	work.registerOperationDependencies(facts, id)
	if work.operations[id.index].invalid {
		return
	}
	restoreFacts := registerWriterInputFacts(owner, facts, work)
	defer restoreFacts()
	work.operations[id.index].mapSourceRequested = true
	query := newSourceDependencyQuery(key.operation, owner.checker, owner, key.declaration)
	defer query.publishDependencyStatistics()
	revoke, installed := beginStagedMapProtocolSource(query, source, func(entry sourceStagedMapEntry) bool {
		if entry.member == nil {
			return true
		}
		if !work.registerStagedMapEntry(facts, source, entry) {
			return false
		}
		request, _ := stagedMapEntryRequest(source, entry)
		for _, old := range protocol.entries {
			if sameStagedMapEntry(old, entry) {
				return true
			}
		}
		next := *protocol
		next.entries = append(append([]sourceStagedMapEntry(nil), protocol.entries...), cloneStagedMapEntry(entry))
		protocol = &next
		recipe.mapProtocol = protocol
		recipe.delta.required = append(recipe.delta.required, request)
		return work.attachOperationSource(facts, recipe)
	})
	if !installed {
		return
	}
	defer revoke()
	if source.descriptorMap.argumentSource != nil {
		request := stagedModuleArgumentRequest(source)
		proof := work.operationRecipes[request.producer].moduleArgument.order
		query.stagedMap.argumentOrder, query.stagedMap.argumentEpoch = proof, work.operationEpoch
	} else if proof := source.descriptorMap.argumentOrder; proof != nil && proof.epoch == work.operationEpoch {
		query.stagedMap.argumentOrder, query.stagedMap.argumentEpoch = proof, work.operationEpoch
	}
	if runtimeModuleEvaluation(source.request.consumer) {
		work.registerEntryLawSource(facts, source.descriptorMap.protocol, source.descriptorMap.descriptors, stagedEntryLawMapEnumeration)

	}
	query.stagedMap.entryCoverage = func(get *sourceGetInputs, group *ast.Node) bool {
		return work.acquireStagedMapEntryCoverage(facts, query, get, group)
	}
	query.stagedMap.noUserEntry = func(get *sourceGetInputs, group *ast.Node) bool {
		work.recordImplicitMapPrimitive(facts, query, get, group)
		if runtimeModuleEvaluation(source.request.consumer) {
			return work.recordMapEntryLaw(facts, query, get, group)
		}
		return false
	}
	query.stagedMap.writerCoverage = func() bool { return work.publishStagedMapWriterDisposition(facts, query, source) }
	// The original member owner publishes each MAY writer before RHS recovery.
	// Its sink registers the exact child source membership before accepting it.
	writers := stagedMapProtocolPhaseRequest(source, "own-writers")
	revokeWriters, observing := query.beginStagedWriterSource(func(sourceStagedWriterRead) bool {
		return work.publishStagedWriterRead(facts, query, writers)
	})
	if !observing {
		return
	}
	defer revokeWriters()
	// Share the original pre-recovery source interval with native/Get consumers.
	// Install after the map writer sink so the existing shared owner chains both
	// subscriptions instead of replacing either original writer relationship.
	revokeMember, memberInstalled := work.beginStagedMapMemberSource(query, facts, id, owner)
	if !memberInstalled {
		return
	}
	defer revokeMember()
	_, terminal := consumeStagedMapConversionTerminal(query, source, func(read sourceStagedMapEntryRead) bool { return work.acceptStagedMapEntryRead(facts, source, query) })
	work.recordImplicitMapEnumeration(facts, query, terminal)
	if query.stagedMap.memberRequest != nil && !query.stagedMap.memberRequest.completed() {
		return // No observed final C: the one-shot source remains pending.
	}
	// Local entry representation never substitutes for whole-source protocols.
	borrow := query.stagedMap
	writersRecipe := work.operationRecipes[writers.producer]
	if borrow != nil && borrow.observed && !borrow.refused && len(borrow.unrepresented) == 0 && writersRecipe.mapProtocol != nil && writersRecipe.mapProtocol.writerSource != nil {
		plan, described := describeStagedMapInitialProtocol(source, *writersRecipe.mapProtocol.writerSource)
		if described && plan.keysAccounted {
			next := *protocol
			next.entriesRegistered = true
			protocol = &next
			recipe.mapProtocol = protocol
		}
	}
	recipe.delta.extracted = protocol.entriesRegistered
	work.attachOperationSource(facts, recipe)
}

// admitStagedMapMemberSources connects the original enum's source-set receipt
// before stronger legacy recovery can yield. The shared original member finish
// calls this after publishing its current disposition. Source membership is a
// required child, never map readiness, a normal Get value or an entry read.
func (work *callableEffectWork) admitStagedMapMemberSources(facts []callableFacts, query *sourceValueQuery) bool {
	if query == nil || query.stagedMap == nil || query.stagedMember == nil {
		return false
	}
	borrow, member := query.stagedMap, query.stagedMember
	if !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) || !query.traceModeKnown || query.traceMode != accessorEnumerate|accessorNoGet || borrow.reading || borrow.currentRead != nil || member.disposition == nil || member.mode != accessorEnumerate|accessorNoGet || member.get != borrow.get || !query.liveStagedMemberSource(member, member.get, member.read) || member.generation != work.operationGeneration {
		return false
	}
	source, coverage := borrow.source, member.coverage
	if source == nil || source.descriptorMap == nil || !sameOperationRequest(member.request, source.request) || !sameOperationRequest(borrow.request, source.descriptorMap.protocol) || coverage == nil || coverage.generation != work.operationGeneration || coverage.cut != borrow.cut || member.disposition.cut != borrow.cut || !sameOperationRequest(member.disposition.request, source.request) || !validStagedMapMemberSourceRequest(source, coverage.request) {
		return false
	}
	child := work.operationRecipes[coverage.request.producer]
	if !validStagedMemberCoverageRecipe(child) || child.memberSource.generation != work.operationGeneration || !sameOperationRequest(child.memberSource.parent, source.request) || work.memberCoverageObserved[child.key] != work.operationGeneration || !operationPrefix(child.delta.required, member.disposition.delta.required, sameOperationRequest) || !operationPrefix(member.disposition.delta.required, child.delta.required, sameOperationRequest) {
		return false
	}
	return work.enrollStagedMapMemberCoverage(facts, query, source, coverage.request)
}

// enrollStagedMapMemberCoverage registers the exact map-to-C debt only. Current
// observation, writer proof and ACK/full closure remain consuming decisions.
func (work *callableEffectWork) enrollStagedMapMemberCoverage(facts []callableFacts, query *sourceValueQuery, source *sourceStagedNativeGetSource, coverage sourceStagedOperationRequest) bool {
	request := stagedMapProtocolPhaseRequest(source, "own-writers")
	prior := work.operationRecipes[request.producer]
	if prior.mapProtocol == nil || !sameOperationRequest(prior.mapProtocol.request, request) || !sameNativeGetSource(prior.nativeGet, source) {
		return false
	}
	for _, required := range prior.delta.required {
		if sameOperationRequest(required, coverage) {
			return true
		}
	}
	prior.delta = cloneOperationDelta(prior.delta)
	prior.delta.required = append(prior.delta.required, coverage)
	return work.attachOperationSource(facts, prior) && query.stagedMember != nil && query.liveStagedMemberSource(query.stagedMember, query.stagedMember.get, query.stagedMember.read) && query.liveStagedMapObservation(query.stagedMap.get, accessorEnumerate|accessorNoGet)
}

// The original source owner supplies the group and physical enum cut. This
// factory check validates transport only and cannot issue that observation.
func validStagedMapMemberSourceRequest(source *sourceStagedNativeGetSource, request sourceStagedOperationRequest) bool {
	if source == nil || source.descriptorMap == nil || request.producer.selector.association == nil || !ast.IsObjectLiteralExpression(request.producer.selector.association) {
		return false
	}
	cut := sourceRelativeCut{operation: source.request.use, reading: source.request.use}
	if runtimeModuleEvaluation(source.request.consumer) {
		cut.use = source.request.use
	}
	return sameOperationRequest(request, stagedMemberCoverageRequest(source.request, request.producer.selector.association, cut))
}

func validStagedMapProtocolRecipe(recipe sourceStagedOperationRecipe) bool {
	source, protocol := recipe.nativeGet, recipe.mapProtocol
	if source == nil || source.descriptorMap == nil || protocol == nil || protocol.generation == nil || recipe.key != protocol.request.producer || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	if sameOperationRequest(protocol.request, source.descriptorMap.protocol) {
		offset := 4
		if source.descriptorMap.argumentSource != nil {
			offset++
		}
		if len(recipe.delta.required) != offset+len(protocol.entries) {
			return false
		}
		for index, role := range []string{"own-writers", "own-keys", "enumerability", "target"} {
			if !sameOperationRequest(recipe.delta.required[index], stagedMapProtocolPhaseRequest(source, role)) {
				return false
			}
		}
		if offset == 5 && !sameOperationRequest(recipe.delta.required[4], stagedModuleArgumentRequest(source)) {
			return false
		}
		for index, entry := range protocol.entries {
			request, valid := stagedMapEntryRequest(source, entry)
			if !valid || !sameOperationRequest(recipe.delta.required[offset+index], request) {
				return false
			}
		}
		return recipe.delta.extracted == protocol.entriesRegistered
	}
	for _, role := range []string{"own-writers", "own-keys", "enumerability", "target"} {
		if sameOperationRequest(protocol.request, stagedMapProtocolPhaseRequest(source, role)) {
			proof := protocol.writerSource
			if role == "target" {
				return protocol.keysAccounted == false && protocol.enumerabilityAccounted == false && proof == nil && protocol.targetAccounted == source.mapTargetEffects && recipe.delta.extracted == source.mapTargetEffects && len(recipe.delta.required) == 0 && len(recipe.writerRequired) == 0
			}
			if protocol.targetAccounted {
				return false
			}
			if proof != nil && (proof.generation != protocol.generation || proof.group != source.descriptorMap.descriptors.expression || !sameOperationRequest(proof.request, source.descriptorMap.protocol)) {
				return false
			}
			if role != "own-writers" {
				if len(recipe.delta.required) != 0 || len(recipe.writerRequired) != 0 {
					return false
				}
				covered := false
				if proof != nil {
					plan, valid := describeStagedMapInitialProtocol(source, *proof)
					if !valid {
						return false
					}
					if role == "own-keys" {
						covered = plan.keysAccounted
					} else {
						covered = plan.enumerabilityAccounted
					}
				}
				return recipe.delta.extracted == covered && protocol.keysAccounted == (covered && role == "own-keys") && protocol.enumerabilityAccounted == (covered && role == "enumerability")
			}
			if protocol.keysAccounted || protocol.enumerabilityAccounted || recipe.delta.extracted != (proof != nil) {
				return false
			}
			// RHS and whole-source dependencies can arrive interleaved from the
			// same original member interval. Preserve each ordered RHS requirement
			// and accept only the exact independent enum source-set requests.
			writerIndex := 0
			for _, request := range recipe.delta.required {
				if writerIndex < len(recipe.writerRequired) && sameOperationRequest(request, recipe.writerRequired[writerIndex]) {
					if !validWriterRHSRequirement(recipe.key, request) || !sameOperationRequest(request, stagedWriterRHSRequest(protocol.request, request.producer.selector.occurrence)) {
						return false
					}
					writerIndex++
					continue
				}
				if !validStagedMapMemberSourceRequest(source, request) {
					return false
				}
			}
			if writerIndex != len(recipe.writerRequired) {
				return false
			}
			if proof != nil {
				coverage := stagedMemberCoverageRequest(source.request, proof.group, proof.cut)
				for _, required := range recipe.delta.required {
					if sameOperationRequest(required, coverage) {
						return true
					}
				}
				return false
			}
			return true
		}
	}
	return false
}
