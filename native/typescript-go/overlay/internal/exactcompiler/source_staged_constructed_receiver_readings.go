package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// acceptConstructedGetReceiverReading separates two existing owners. The live
// Get's unsealed C already retains this original reader. A pending root may add
// its own DATA requirement; a completed root keeps its authentic earlier source
// relationship and cannot grow merely because another Get observes that DATA.
func (work *callableEffectWork) acceptConstructedGetReceiverReading(facts []callableFacts, q *sourceValueQuery, receiver, input sourceStagedOperationRequest) bool {
	if q == nil {
		return false
	}
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage == nil || !sameOperationRequest(b.request, receiver) || !work.stagedMemberResultReading(input, receiver, b.observation) {
		return false
	}
	coverage, valid := work.memberCallResultCoverage(q)
	if !valid || coverage.memberSource.generation != work.operationGeneration {
		return false
	}
	present := false
	for _, child := range coverage.delta.required {
		present = present || sameOperationRequest(child, input)
	}
	if !present {
		return false // An index description cannot stand in for the actual C reader.
	}
	root := work.operationRecipes[receiver.producer]
	if !root.delta.extracted {
		return work.registerConstructedReceiverReading(facts, receiver, input)
	}
	// This accepts the C-owned obligation, not late root mutation or DATA
	// completion. The original receiver proof and actually delivered payloads
	// must still authenticate the completed root's source relationship.
	if !validConstructedMemberRecipe(root) || root.constructed == nil || root.constructedDisposition == nil || root.constructedDisposition.role != "receiver" || root.constructedDisposition.generation != work.operationGeneration || work.operationGeneration == nil || !work.operationGeneration.active || root.constructed.cut != b.observation {
		return false
	}
	for _, prior := range root.constructedInputs {
		if sameOperationRequest(prior, input) {
			return true // The existing root already owns this exact description.
		}
	}
	return work.constructedDeliveredReceiverPayloads(root, input.producer.operation)
}

// constructedDeliveredReceiverPayloads consumes actual existing Set-to-Get DATA
// subscribers, not a root's extraction bit or a table-content/identity premise.
// Every matching original payload remains required on the completed root.
func (work *callableEffectWork) constructedDeliveredReceiverPayloads(root sourceStagedOperationRecipe, upstream *ast.Node) bool {
	if root.constructed == nil || work.operationGeneration == nil || !work.operationGeneration.active {
		return false
	}
	found := false
	for _, input := range root.constructedInputs {
		if input.reading.operation != upstream {
			continue
		}
		producer := work.operationRecipes[input.producer]
		if producer.constructed == nil || producer.constructed.kind != sourceNativeWeakMapSetEffect || input.consumer != root.constructed.request.consumer || !work.validConstructedMemberRequest(producer, input) || producer.constructedDisposition == nil || producer.constructedDisposition.role != "stored-payload" || producer.constructedDisposition.generation != work.operationGeneration || !work.constructedIssued[[2]*ast.Node{producer.constructed.request.producer.operation, producer.constructed.construction.site}] {
			return false
		}
		reader := work.operationRecipes[input.reading]
		if reader.constructed == nil || reader.constructed.kind != sourceNativeWeakMapGetEffect || reader.constructed.request.producer.operation != upstream || !validConstructedMemberRecipe(reader) {
			return false
		}
		id := work.operationIDs[input.producer]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
		state := &work.operations[id.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{input.consumer, input.edge}]
		if state.invalid || !state.delta.extracted || state.revision == 0 || subscriber == nil || subscriber.blocked || subscriber.consumed != state.revision || subscriber.applied != state.revision || len(subscriber.constructed) == 0 {
			return false
		}
		for _, value := range subscriber.constructed {
			if value.creating != nil || value.endpoint.kind != relativeEndpointExpression {
				return false
			}
			expression := unwrapSourceCallableReference(value.endpoint.expression)
			if expression != nil && ast.IsBinaryExpression(expression) && expression.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
				expression = unwrapSourceCallableReference(expression.AsBinaryExpression().Right)
			}
			matched := false
			for _, member := range root.constructedGroup {
				matched = matched || expression == member.construction.site
			}
			if !matched {
				return false // Unknown, captured or non-New payloads stay pending.
			}
		}
		found = true
	}
	return found
}

// constructedGetReceiverInputs reads only the exact current Get C's already
// issued DATA children and the root's existing original reader descriptions.
// The returned immutable readset is independent of root publication order.
func (work *callableEffectWork) constructedGetReceiverInputs(source *sourceStagedConstructedMember) ([]sourceStagedOperationRequest, bool) {
	if !validConstructedMemberSource(source) || work.operationGeneration == nil || !work.operationGeneration.active {
		return nil, false
	}
	coverage := work.operationRecipes[stagedMemberCoverageRequest(source.request, source.construction.site, source.cut).producer]
	if !validStagedMemberCoverageRecipe(coverage) || coverage.memberSource.generation != work.operationGeneration || !sameOperationRequest(coverage.memberSource.parent, source.request) || coverage.memberSource.coverage.cut != source.cut {
		return nil, false
	}
	var inputs []sourceStagedOperationRequest
	root := work.operationRecipes[source.request.producer]
	for _, requests := range [][]sourceStagedOperationRequest{root.constructedInputs, coverage.delta.required} {
		for _, input := range requests {
			if input.producer.kind != relativeDemandDirectExposure || work.operationRecipes[input.producer].callResult == nil {
				continue // Existing payload and all other C children retain their owners.
			}
			if !work.stagedMemberResultReading(input, source.request, source.cut) {
				return nil, false
			}
			inputs = appendEntryLawRequirement(inputs, input)
		}
	}
	return inputs, true
}
