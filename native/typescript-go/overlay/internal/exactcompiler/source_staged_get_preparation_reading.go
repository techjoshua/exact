package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedGetPreparationReading keeps a source's original factory separate
// from the Get which needs its invocation scopes. It is a SOURCE subscriber,
// never a C observation, input frame, result value or selected-method receipt.
type sourceStagedGetPreparationReading struct {
	source  sourceStagedOperationRequest
	reading sourceStagedOperationRequest
	context sourceRelativeCut
}

func stagedGetPreparationSourceReading(source, parent sourceStagedOperationRequest, context sourceRelativeCut) sourceStagedOperationRequest {
	reading := source
	preparation := stagedGetPreparationRequest(parent)
	reading.consumer, reading.cut, reading.reading = parent.consumer, context, preparation.producer
	reading.edge = fmt.Sprintf("%s:source-scope:%s:%p:%p:%p:%p:%p", preparation.edge, source.edge, context.use, context.reading, context.initializing, context.returning, context.invoking)
	return reading
}

func validGetPreparationReading(parent sourceStagedOperationRequest, entry sourceStagedGetPreparationReading) bool {
	source := entry.source
	// SOURCE discovery can be inside receiver or constructor-callee acquisition
	// in this consumer. This is not validStagedMemberObservation: that requires
	// the physical C cut. The live Get issuer supplies the exact semantic context,
	// and consumption matches it against the same original writer request.
	context := entry.context
	return source.producer.operation != nil && ast.IsCallExpression(source.producer.operation) && source.producer.operation != parent.producer.operation && source.producer.declaration != nil && source.consumer == source.producer.declaration && source.producer.kind == relativeDemandEffects && source.use == source.producer.operation && source.inputs == nil && source.reading == (sourceStagedOperationKey{}) && context.operation == parent.producer.operation && context.reading != nil && sourceStagedOccurrenceOwned(context.reading, parent.consumer) && sameOperationRequest(entry.reading, stagedGetPreparationSourceReading(source, parent, context))
}

// acceptedGetPreparationSourceReading authenticates an existing detached pair
// before adoption. Requiring its subscriber here would make first adoption
// circular; registered ownership and actual delivery are checked separately.
func (work *callableEffectWork) acceptedGetPreparationSourceReading(request sourceStagedOperationRequest) bool {
	preparation := work.operationRecipes[request.reading]
	if !validStagedGetPreparationRecipe(preparation) || preparation.memberSource.generation != work.operationGeneration {
		return false
	}
	for _, entry := range preparation.memberSource.getPreparation.readings {
		if !sameOperationRequest(entry.reading, request) || !validGetPreparationReading(preparation.memberSource.parent, entry) {
			continue
		}
		source := work.operationRecipes[entry.source.producer]
		return work.requestedWriterSourceSupported(source) && sameOperationRequest(nativeObserverProducerRequest(source), entry.source)
	}
	return false
}

func (work *callableEffectWork) getPreparationSourceReadingOwned(request sourceStagedOperationRequest) bool {
	if !work.acceptedGetPreparationSourceReading(request) {
		return false
	}
	id := work.operationIDs[request.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	return !state.invalid && state.dependenciesRegistered && subscriber != nil && !subscriber.blocked && sameOperationRequest(subscriber.request, request)
}

func (work *callableEffectWork) getPreparationSourceReadingCurrent(request sourceStagedOperationRequest) bool {
	if !work.getPreparationSourceReadingOwned(request) {
		return false
	}
	recipe := work.operationRecipes[request.producer]
	current := work.nativeObserverProducerCurrent(recipe)
	if descriptorCalleeRequested(recipe) {
		current = work.descriptorCalleeCurrent(recipe)
	}
	return current && work.nativeWriterSourceInvocationApplied(request)
}

func getPreparationWriterScopeReading(r *sourceWriterInputRequest) bool {
	if r == nil || r.writerSourceWork == nil || r.writerSourceIssuer != r {
		return false
	}
	preparation := r.writerSourceWork.operationRecipes[r.writerSourceReading.reading]
	return validStagedGetPreparationRecipe(preparation) && sameOperationRequest(r.writerSourceReading, stagedGetPreparationSourceReading(r.writerSource, preparation.memberSource.parent, r.writerSourceReading.cut))
}

// registerGetPreparationWriterSource is lent by the actual Get work owner.
// The source factory may belong to a module or another declaration; its original
// request is never retargeted. Only the explicitly paired reader uses this Get.
func (work *callableEffectWork) registerGetPreparationWriterSource(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest) bool {
	if q == nil || r == nil || !r.live || r.issuer != q || q.stagedMember == nil || !q.stagedMember.getPreparation.live(q) || q.stagedMember.getPreparation.work != work || r.consumer != q.effectOwner || r.use != q.effectUse() || r.graph != q.executable.writerInputFacts[r.consumer] || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) {
		return false
	}
	if r.writerSourceWork != nil {
		return getPreparationWriterScopeReading(r)
	}
	b := q.stagedMember.getPreparation
	if !work.adoptPlainGetPreparation(facts, q, b) {
		return false
	}
	source, _, described := work.writerSourceRecipe(facts, q, r)
	if !described || !work.requestedWriterSourceSupported(source) {
		return false
	}
	original := nativeObserverProducerRequest(source)
	entry := sourceStagedGetPreparationReading{source: original, context: q.relativeInputCut(b.request.producer.operation)}
	entry.reading = stagedGetPreparationSourceReading(original, b.request, entry.context)
	if !validGetPreparationReading(b.request, entry) {
		return false
	}
	preparation := work.operationRecipes[work.operations[b.id.index].key]
	if !validStagedGetPreparationRecipe(preparation) || preparation.delta.extracted && !operationContainsRequest(preparation.delta.required, entry.reading) {
		return false
	}
	if !operationContainsRequest(preparation.delta.required, entry.reading) {
		copy := *preparation.memberSource
		metadata := *copy.getPreparation
		metadata.readings = append(append([]sourceStagedGetPreparationReading(nil), metadata.readings...), entry)
		copy.getPreparation = &metadata
		preparation.memberSource = &copy
		preparation.delta = cloneOperationDelta(preparation.delta)
		preparation.delta.required = append(preparation.delta.required, entry.reading)
		if !work.attachOperationSource(facts, preparation) {
			return false
		}
	}
	consumer, known := work.memberNodes[r.consumer]
	if !known {
		return false
	}
	work.requireWriterSourceAvailability(facts, consumer, source, b.request)
	originalID, originalAdopted := work.requireOperation(facts, original)
	if !originalAdopted {
		return false
	}
	work.attachWriterSourceDependencies(facts, originalID)
	id, adopted := work.requireOperation(facts, entry.reading)
	if !adopted {
		return false
	}
	work.attachWriterSourceDependencies(facts, id)
	work.attachSourceObservationDependencies(facts, b.id)
	if !work.getPreparationSourceReadingOwned(entry.reading) || !work.declarationWriterScopeDependency(b.id, id, entry.reading) || !work.getPreparationTaskOwned(b.id) && !work.getPreparationSourceReadingCurrent(entry.reading) {
		return false
	}
	r.bindWriterReading(original, entry.reading, work)
	return true
}

func (work *callableEffectWork) consumeGetPreparationWriterSource(q *sourceValueQuery, r *sourceWriterInputRequest) sourceStagedWriterCallDisposition {
	if !getPreparationWriterScopeReading(r) || r.writerSourceWork != work || q == nil || !r.live || r.issuer != q || r.consumer != q.effectOwner || r.use != q.effectUse() || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) && !r.atRecovery(q) || q.stagedMember == nil || !q.stagedMember.getPreparation.live(q) {
		return sourceStagedWriterCallDisposition{}
	}
	b := q.stagedMember.getPreparation
	id := work.operationIDs[r.writerSourceReading.producer]
	context := sourceRelativeCut{operation: b.request.producer.operation, use: r.use, reading: r.original[0], initializing: r.original[1], returning: r.original[2], invoking: r.original[3]}
	if r.writerSourceReading.cut != context || r.writerSourceReading.reading != stagedGetPreparationRequest(b.request).producer || !work.getPreparationSourceReadingOwned(r.writerSourceReading) || !work.declarationWriterScopeDependency(b.id, id, r.writerSourceReading) {
		return sourceStagedWriterCallDisposition{}
	}
	recipe := work.operationRecipes[r.writerSource.producer]
	current := work.nativeObserverProducerCurrent(recipe)
	if descriptorCalleeRequested(recipe) {
		current = work.descriptorCalleeCurrent(recipe)
	}
	if !current {
		return sourceStagedWriterCallDisposition{compilerPending: work.writerSourceTaskOwned(id) && work.getPreparationTaskOwned(b.id)}
	}
	work.publishNativeObserverProducer(work.operationFacts, id, q.executable)
	delivery, delivered := work.consumeOperation(id, r.writerSourceReading)
	if !delivered || !delivery.delta.extracted || !work.nativeWriterSourceInvocationApplied(r.writerSourceReading) {
		return sourceStagedWriterCallDisposition{compilerPending: true}
	}
	if descriptorCalleeRequested(recipe) {
		return sourceStagedWriterCallDisposition{calleeCovered: true}
	}
	return sourceStagedWriterCallDisposition{handled: true, excluded: true}
}
