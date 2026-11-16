package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Only the target reading is a preparation authority child. The creating Call
// remains a mandatory Effects closure debt of that target producer; it is not
// another source-value/currentness law of the preparation.
type sourceStagedGetPreparationTarget struct {
	reading, creatingClosureDebt sourceStagedOperationRequest
	acquisition                  sourceStagedGetPreparationAcquisitionKind
	cut                          sourceRelativeCut
	projection                   []string
}

func validGetPreparationTarget(parent sourceStagedOperationRequest, entry sourceStagedGetPreparationTarget) bool {
	reading, creating := entry.reading, entry.creatingClosureDebt
	operation, origin := reading.producer.selector.occurrence, reading.producer.selector.association
	if !validStagedMemberParent(parent) || operation == nil || !ast.IsCallExpression(operation) || origin == nil || !sourceStagedOccurrenceOwned(operation, parent.consumer) || creating.producer.operation == nil || !ast.IsCallExpression(creating.producer.operation) || creating.producer.declaration != parent.consumer || creating.producer.kind != relativeDemandEffects || creating.producer.selector != (sourceStagedOperationSelector{}) || creating.consumer != parent.consumer || creating.use != creating.producer.operation || creating.inputs != nil || creating.reading != (sourceStagedOperationKey{}) || creating.edge == "" || creating.cut != (sourceRelativeCut{operation: creating.use, use: creating.use, reading: creating.use}) {
		return false
	}
	if !validGetPreparationAcquisition(parent, entry.acquisition, entry.cut) {
		return false
	}
	expected := stagedGetPreparationTargetRequest(parent, operation, origin, entry.acquisition, entry.cut, entry.projection)
	expected.reading = stagedGetPreparationRequest(parent).producer
	expected.edge += ":construction-callee"
	return sameOperationRequest(reading, expected)
}

func (work *callableEffectWork) getPreparationTargetReadingOwned(reading sourceStagedOperationRequest) bool {
	recipe := work.operationRecipes[reading.producer]
	if !work.validGetPreparationReflectiveTargetReading(recipe, reading) {
		return false
	}
	id := work.operationIDs[reading.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	return !state.invalid && state.dependenciesRegistered && sub != nil && !sub.blocked && sameOperationRequest(sub.request, reading)
}

// retainGetPreparationReflectiveTarget commits the named target child before
// this preparation seals. Actual delivery wakes the existing original Get task;
// registration supplies neither target provenance nor a current Get.
func (work *callableEffectWork) retainGetPreparationReflectiveTarget(facts []callableFacts, q *sourceValueQuery, reading sourceStagedOperationRequest) bool {
	context, live := work.getPreparationContext(facts, q)
	target := work.operationRecipes[reading.producer]
	if !live || !work.validGetPreparationReflectiveTargetReading(target, reading) || reading.reading != context.request.producer {
		return false
	}
	source := target.memberSource.targetSource
	if source.preparation == nil || !sameOperationRequest(source.preparation.parent, context.parent) || !sameOperationRequest(source.preparation.request, context.request) || source.preparation.acquisition != context.acquisition || source.preparation.cut != context.cut || !sameOperationEndpoint(source.preparation.receiver, context.receiver) {
		return false
	}
	entry := sourceStagedGetPreparationTarget{reading: reading, creatingClosureDebt: source.creating, acquisition: context.acquisition, cut: context.cut, projection: append([]string(nil), context.receiver.projection...)}
	if !validGetPreparationTarget(context.parent, entry) {
		return false
	}
	preparation := work.operationRecipes[context.request.producer]
	if preparation.delta.extracted && !operationContainsRequest(preparation.delta.required, reading) {
		return false
	}
	if !operationContainsRequest(preparation.delta.required, reading) {
		member, metadata := *preparation.memberSource, *preparation.memberSource.getPreparation
		metadata.targets = append(append([]sourceStagedGetPreparationTarget(nil), metadata.targets...), entry)
		member.getPreparation = &metadata
		preparation.memberSource = &member
		preparation.delta = cloneOperationDelta(preparation.delta)
		preparation.delta.required = append(preparation.delta.required, reading)
		if !work.attachOperationSource(facts, preparation) {
			return false
		}
	}
	id, adopted := work.requireOperation(facts, reading)
	if !adopted {
		return false
	}
	work.attachSourceObservationDependencies(facts, id)
	prepID := work.operationIDs[context.request.producer]
	work.attachSourceObservationDependencies(facts, prepID)
	return work.getPreparationTargetReadingOwned(reading) && work.declarationWriterScopeDependency(prepID, id, reading)
}
