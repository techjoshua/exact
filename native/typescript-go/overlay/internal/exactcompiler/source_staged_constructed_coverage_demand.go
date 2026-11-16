package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// prepareConstructedCoverageDemand services an actual registered C candidate,
// not a source index or ordinary invocation. Call and property candidates name
// one original member source; each keeps its own consuming C and required set.
func (work *callableEffectWork) prepareConstructedCoverageDemand(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || owner.project == nil || owner.checker == nil || work.operationGeneration == nil || !work.operationGeneration.active || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || owner.values.program != work.operationGeneration.program || owner.checker != work.operationGeneration.checker || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	s := work.operationRecipes[state.key].memberSource
	if state.invalid || !state.dependenciesRegistered || s == nil || s.extraction == nil || s.extraction.mode != accessorAcquire || s.extraction.generation != work.operationGeneration || s.generation != work.operationGeneration || !sameOperationRequest(s.extraction.request, s.parent) || s.extraction.cut != s.candidate.cut || !s.candidate.protocol || s.candidate.reflective || s.candidate.runtimeUnknown || !sameOperationRequest(s.request, stagedMemberCandidateRequest(s.parent, s.candidate)) {
		return false
	}
	call := s.candidate.operation
	if ast.IsPropertyAccessExpression(call) {
		call = call.Parent
		if call == nil || !ast.IsCallExpression(call) || call.Expression() != s.candidate.operation {
			return false
		}
	}
	if call == nil || !ast.IsCallExpression(call) || !ast.IsPropertyAccessExpression(call.Expression()) || s.candidate.region != s.parent.consumer || !sourceStagedOccurrenceOwned(call, s.parent.consumer) {
		return false
	}
	caller, known := work.memberNodes[s.parent.consumer]
	publisher := owner.pendingMemberPublishers[s.parent.consumer]
	if !known || caller < 0 || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	coverage := work.operationRecipes[stagedMemberCoverageRequest(s.parent, s.candidate.origin, s.candidate.cut).producer]
	if !validStagedMemberCoverageRecipe(coverage) || !coverage.delta.extracted || coverage.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[coverage.key] != work.operationGeneration {
		return false
	}
	member := false
	for _, child := range coverage.delta.required {
		member = member || sameOperationRequest(child, s.request)
	}
	occurrence := stagedConstructedOccurrenceAt(&facts[caller], call, owner)
	if !member || occurrence == nil {
		return false
	}
	// Inventory supplies conditional description sites only. Genuine selected
	// construction publishers, original Get and all receiver DATA stay distinct.
	for _, site := range occurrence.sites {
		if _, available := owner.standardConstructions[site]; !available {
			work.prepareStagedConstructionSource(facts, site, owner)
		}
	}
	if !work.prepareConstructedOccurrenceSource(facts, caller, *occurrence, owner, false, true, true) {
		return false
	}
	root := work.operationRecipes[occurrence.request.producer]
	for _, source := range root.constructedGroup {
		if !work.constructedAssignmentProtocolCurrent(&source) || owner.standardConstructions[source.construction.site] != source.construction {
			return false
		}
		work.completeConstructedSourceRoles(facts, caller, source, owner)
	}
	work.completeConstructedSourceRoot(facts, caller, occurrence.request, occurrence.receiver, owner)
	root = work.operationRecipes[occurrence.request.producer]
	if work.issuedConstructedProtocolSource(root) {
		work.indexStagedMemberProtocolSource(root, owner)
	}
	current := work.operationRecipes[state.key]
	if validConstructedLookupProtocolRecipe(current) {
		work.attachSourceObservationDependencies(facts, id)
		// Queue-coalescing observations only. Currentness consumes the original
		// Get and actual DATA subscribers, never this mutable notification vector.
		work.operations[id.index].writerSourceRevisions = work.sourceObservationRevisions(id)
	}
	return true // Enrollment only; current membership and APPLIED remain separate.
}

// acquireConstructedCoverageReceiver runs once inside the SAME original Get,
// after C registration and before inventory/sealing. It cannot borrow a selected
// construction prefix as a receiver result or replay a completed Get.
func (q *sourceValueQuery) acquireConstructedCoverageReceiver(get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, result *accessorCandidates) {
	b := q.stagedConstructedMember
	if q.owner == nil || get == nil || cut == nil || mode != accessorAcquire || result == nil || b == nil || !b.live || b.owner != q || b.generation != q.owner.generation || b.receiverSource == nil || b.receiverVisited || b.source == nil || b.issued != get || b.get != q.protectedMember || b.cut != q.relativeInputCut(get.operation) || !q.liveStagedMemberSource(q.stagedMember, get, cut) || q.stagedMember.coverage == nil || q.stagedMember.coverage.origin != b.site {
		return
	}
	b.receiverVisited = true // Event-local and revocable, never a publication latch.
	if !b.receiverSource(q, result) && q.liveStagedMemberSource(q.stagedMember, get, cut) {
		q.stagedMember.represented = false
		result.opaque, result.valueIncomplete = true, true
	}
}

func (work *callableEffectWork) acquireConstructedCoverageReceiver(facts []callableFacts, q *sourceValueQuery, occurrence sourceStagedConstructedOccurrence, result *accessorCandidates) bool {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage == nil || !sameOperationRequest(b.request, occurrence.request) || b.coverage.cut != q.relativeInputCut(occurrence.request.producer.operation) || q.executable == nil || work.operationGeneration != q.owner.generation {
		return false
	}
	part := accessorCandidates{}
	values := q.originsAt(occurrence.receiver, occurrence.request.producer.operation, nil, &part)
	// originsAt retains an unprojected Call as an original source anchor.
	// Only actual anchors returned by that acquisition may ask the ordinary
	// live return-source owner for a reading; inventory cannot supply one.
	for _, value := range values {
		if value.node == nil || !ast.IsCallExpression(value.node) || len(value.path) != 0 {
			continue
		}
		if !q.deferStagedCallReturn(value.node, sourceCallResultInterest{purpose: resultConstructedReceiver}) {
			part.opaque, part.valueIncomplete = true, true
		}
	}
	part.values = append(part.values, values...)
	mergeAccessorCandidates(result, part)
	if !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage == nil {
		return false
	}
	for _, upstream := range occurrence.upstream {
		found := false
		for _, child := range b.required {
			source := work.operationRecipes[child.producer].callResult
			if source == nil || source.request.producer.operation != upstream || !work.stagedMemberResultReading(child, occurrence.request, b.observation) {
				continue
			}
			if !work.acceptConstructedGetReceiverReading(facts, q, occurrence.request, child) {
				return false
			}
			found = true
		}
		if !found {
			return false // No manufactured reader from an indexed Call description.
		}
	}
	return !part.opaque
}

// registerConstructedReceiverReading retains an already registered original
// reader while DATA is pending. It grants no endpoints; consuming currentness
// below still requires the real all-MAY delivery and exact subscriber ACK.
func (work *callableEffectWork) registerConstructedReceiverReading(facts []callableFacts, receiver, input sourceStagedOperationRequest) bool {
	root := work.operationRecipes[receiver.producer]
	if root.constructed == nil || len(root.constructedGroup) == 0 || !work.stagedMemberResultReading(input, receiver, root.constructed.cut) {
		return false
	}
	for _, prior := range root.constructedInputs {
		if sameOperationRequest(prior, input) {
			return true
		}
	}
	if root.delta.extracted {
		return false // A completed source prefix cannot acquire a missing reader.
	}
	root.constructedInputs = append(append([]sourceStagedOperationRequest(nil), root.constructedInputs...), input)
	root.delta = cloneOperationDelta(root.delta)
	root.delta.required = appendEntryLawRequirement(root.delta.required, input)
	return validConstructedMemberRecipe(root) && work.attachOperationSource(facts, root)
}

// constructedReceiverReadingsCurrent checks source completeness and actual
// delivered endpoints, separately from the conditional New arm used to start
// its observation. Undefined is an abrupt member access, never a normal value.
func (work *callableEffectWork) constructedReceiverReadingsCurrent(root sourceStagedOperationRecipe) bool {
	return work.constructedReceiverDataInputsCurrent(root, root.constructedInputs)
}

func (work *callableEffectWork) constructedReceiverDataInputsCurrent(root sourceStagedOperationRecipe, inputs []sourceStagedOperationRequest) bool {
	caller, known := work.memberNodes[root.key.declaration]
	if !known || caller < 0 || caller >= len(work.operationFacts) || root.constructed == nil {
		return false
	}
	tracked := false
	for _, input := range inputs {
		tracked = tracked || work.stagedMemberResultReading(input, root.constructed.request, root.constructed.cut)
	}
	if !tracked {
		return true // Existing reached/payload delivery owners keep their contract.
	}
	inventory := work.operationFacts[caller].staged.constructedInventory
	if inventory == nil {
		return false
	}
	for _, occurrence := range inventory.candidates {
		if !sameOperationRequest(occurrence.request, root.constructed.request) {
			continue
		}
		for _, upstream := range occurrence.upstream {
			found := false
			for _, input := range inputs {
				if input.producer.operation != upstream || !work.stagedMemberResultReading(input, occurrence.request, root.constructed.cut) {
					continue
				}
				id := work.operationIDs[input.producer]
				if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
					return false
				}
				state := &work.operations[id.index]
				subscriber := state.subscribers[sourceStagedOperationConsumer{input.consumer, input.edge}]
				if state.invalid || !state.delta.extracted || state.revision == 0 || subscriber == nil || subscriber.blocked || subscriber.consumed != state.revision || subscriber.applied != state.revision || len(subscriber.returned) == 0 {
					return false
				}
				for _, value := range subscriber.returned {
					if value.endpoint.kind == relativeEndpointUndefined {
						continue
					}
					expression := unwrapSourceCallableReference(value.endpoint.expression)
					if expression != nil && ast.IsBinaryExpression(expression) && expression.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
						expression = unwrapSourceCallableReference(expression.AsBinaryExpression().Right)
					}
					matched := false
					for _, member := range root.constructedGroup {
						matched = matched || expression == member.construction.site
					}
					if value.endpoint.kind != relativeEndpointExpression || !matched {
						return false // Authored, unknown or unmapped alternatives remain work.
					}
				}
				found = true
			}
			if !found {
				return false
			}
		}
		return true
	}
	return false
}

// constructedCoverageTaskSource is an existing member-source queue role. Its
// immutable typed description and fresh original C already exist before it can
// subscribe to changed DATA; registration is not extraction or currentness.
func (work *callableEffectWork) constructedCoverageTaskSource(id sourceStagedOperationID) *sourceStagedMemberSource {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !state.dependenciesRegistered || !validConstructedLookupProtocolRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration {
		return nil
	}
	return recipe.memberSource
}
