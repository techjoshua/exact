package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedGetPreparationData is an original SOURCE projection's DATA debt.
// The producing cut stays on D; physical is the independently issued Get cut.
// Coverage authenticates the original observation, but never gains this child.
type sourceStagedGetPreparationData struct {
	parent, source, reading, coverage sourceStagedOperationRequest
	physical, semantic                sourceRelativeCut
	acquisition                       sourceStagedGetPreparationAcquisitionKind
	receiver                          sourceRelativeEndpoint
	purpose                           sourceCallResultPurpose
}

func stagedGetPreparationDataReading(data sourceStagedGetPreparationData) sourceStagedOperationRequest {
	r := data.source
	r.consumer, r.reading = data.parent.consumer, stagedGetPreparationRequest(data.parent).producer
	p, c := data.physical, data.semantic
	r.edge = fmt.Sprintf("%s:source-data:%p:%d:%d:%p:%p:%p:%p:%p:%p:%p:%p:%p:%p:%p:%p:%p:%q", stagedGetPreparationRequest(data.parent).edge, data.source.producer.operation, data.purpose, data.acquisition, p.operation, p.use, p.reading, p.initializing, p.returning, p.invoking, c.operation, c.use, c.reading, c.initializing, c.returning, c.invoking, data.receiver.expression, data.receiver.projection)
	return r
}

func validGetPreparationData(parent sourceStagedOperationRequest, data sourceStagedGetPreparationData) bool {
	call := data.source.producer.operation
	if !sameOperationRequest(data.parent, parent) || !validStagedMemberParent(parent) || call == nil || !ast.IsCallExpression(call) || data.source.producer.declaration == nil || data.source.producer.kind != relativeDemandDirectExposure || data.purpose != resultSourceProjection || !validGetPreparationReceiver(parent, data.acquisition, data.physical, data.receiver) || data.semantic.operation != data.physical.operation || data.semantic.reading != data.physical.reading || !sameOperationRequest(data.source, stagedResultSourceRequest(call, data.source.producer.declaration, nil)) || !sameOperationRequest(data.reading, stagedGetPreparationDataReading(data)) {
		return false
	}
	// An ordinary coverage ticket is optional only in the disjoint preparation
	// role. A nested Identifier never acquires an invented property-Get ticket.
	return data.coverage == (sourceStagedOperationRequest{}) || data.acquisition == getPreparationSameGet && data.coverage.producer.selector.association != nil && sameOperationRequest(data.coverage, stagedMemberCoverageRequest(parent, data.coverage.producer.selector.association, data.physical))
}

func sameGetPreparationData(a, b sourceStagedGetPreparationData) bool {
	return sameOperationRequest(a.parent, b.parent) && sameOperationRequest(a.source, b.source) && sameOperationRequest(a.reading, b.reading) && sameOperationRequest(a.coverage, b.coverage) && a.physical == b.physical && a.semantic == b.semantic && a.acquisition == b.acquisition && sameOperationEndpoint(a.receiver, b.receiver) && a.purpose == b.purpose
}

func cloneGetPreparationData(data sourceStagedGetPreparationData) sourceStagedGetPreparationData {
	data.receiver = cloneSourceRelativeEndpoint(data.receiver)
	return data
}

func prepDataSourceReading(source *sourceStagedCallResultSource, reading sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	if source == nil {
		return false
	}
	for _, data := range source.preparationData {
		if validGetPreparationData(data.parent, data) && sameOperationRequest(data.source, source.request) && sameOperationRequest(data.reading, reading) && data.physical == cut {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) getPreparationDataRegistered(data sourceStagedGetPreparationData) bool {
	if !validGetPreparationData(data.parent, data) {
		return false
	}
	preparation := work.operationRecipes[stagedGetPreparationRequest(data.parent).producer]
	if preparation.memberSource == nil || preparation.memberSource.getPreparation == nil || preparation.memberSource.generation != work.operationGeneration || !operationContainsRequest(preparation.delta.required, data.reading) {
		return false
	}
	present := false
	for _, entry := range preparation.memberSource.getPreparation.data {
		present = present || sameGetPreparationData(entry, data)
	}
	source := work.operationRecipes[data.source.producer]
	if !present || !validStagedCallResultRecipe(source) || source.callResult.generation != work.operationGeneration || !prepDataSourceReading(source.callResult, data.reading, data.physical) {
		return false
	}
	id := work.operationIDs[data.source.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{data.reading.consumer, data.reading.edge}]
	return !state.invalid && state.dependenciesRegistered && sub != nil && !sub.blocked && sameOperationRequest(sub.request, data.reading)
}

// The exact reading's normal original interval or its real C observation
// supplies transport currency. Neither observation supplies D's result.
func (work *callableEffectWork) getPreparationDataReadingObserved(data sourceStagedGetPreparationData) bool {
	if !work.getPreparationDataRegistered(data) {
		return false
	}
	if work.getPreparationDataReadObserved(data) {
		return true
	}
	c := work.operationRecipes[data.coverage.producer]
	return data.acquisition == getPreparationSameGet && validStagedMemberCoverageRecipe(c) && c.memberSource.generation == work.operationGeneration && sameOperationRequest(c.memberSource.parent, data.parent) && c.memberSource.coverage.cut == data.physical && work.memberCoverageObserved[c.key] == work.operationGeneration
}

func (work *callableEffectWork) getPreparationDataSourceObserved(source *sourceStagedCallResultSource) bool {
	for _, data := range source.preparationData {
		if work.getPreparationDataReadingObserved(data) {
			return true
		}
	}
	return false
}

// retainGetPreparationData runs only at the original projection. All description
// changes precede adoption; an extracted preparation cannot acquire a new read.
func (work *callableEffectWork) retainGetPreparationData(facts []callableFacts, q *sourceValueQuery, source *sourceStagedCallResultSource, interest sourceCallResultInterest) (sourceStagedOperationRequest, bool) {
	var none sourceStagedOperationRequest
	b := q.stagedMember
	if b == nil || b.getPreparation == nil || !b.getPreparation.live(q) || b.getPreparation.work != work || !q.liveStagedMemberSource(b, b.get, b.read) || b.projectingReturn != source.request.producer.operation || interest.purpose != resultSourceProjection || !source.nativeCall {
		return none, false
	}
	p := b.getPreparation
	context, live := work.getPreparationContext(facts, q)
	if !live {
		return none, false
	}
	data := sourceStagedGetPreparationData{parent: context.parent, source: source.request, physical: context.cut, semantic: q.relativeInputCut(b.get.operation), acquisition: context.acquisition, receiver: context.receiver, purpose: interest.purpose}
	if b.coverage != nil && context.acquisition == getPreparationSameGet {
		data.coverage = b.coverage.request
	}
	data.reading = stagedGetPreparationDataReading(data)
	preparation := work.operationRecipes[stagedGetPreparationRequest(b.request).producer]
	if !validGetPreparationData(b.request, data) || !validStagedGetPreparationRecipe(preparation) || preparation.delta.extracted && !operationContainsRequest(preparation.delta.required, data.reading) {
		return none, false
	}
	prior, known := work.operationRecipes[source.request.producer]
	if known {
		if !validStagedCallResultRecipe(prior) || !sameStagedCallResultSource(prior.callResult, source) {
			return none, false
		}
		source = cloneStagedCallResultSource(prior.callResult)
	}
	present := false
	for i, r := range source.readings {
		if sameOperationRequest(r, data.reading) {
			if source.readCuts[i] != data.physical {
				return none, false
			}
			present = true
		}
	}
	if !present {
		source.readings = append(source.readings, data.reading)
		source.readCuts = append(source.readCuts, data.physical)
		source.preparationData = append(source.preparationData, data)
	}
	if known {
		prior.callResult = source
	} else {
		prior = sourceStagedOperationRecipe{key: source.request.producer, callResult: source}
	}
	if !validStagedCallResultRecipe(prior) {
		return none, false
	}
	if known {
		if !work.attachOperationSource(facts, prior) {
			return none, false
		}
	} else if !work.registerOperationRecipe(facts, prior) {
		return none, false
	}
	if !operationContainsRequest(preparation.delta.required, data.reading) {
		s := *preparation.memberSource
		metadata := *s.getPreparation
		metadata.data = append(append([]sourceStagedGetPreparationData(nil), metadata.data...), data)
		s.getPreparation = &metadata
		preparation.memberSource = &s
		preparation.delta = cloneOperationDelta(preparation.delta)
		preparation.delta.required = append(preparation.delta.required, data.reading)
		if !validStagedGetPreparationRecipe(preparation) || !work.attachOperationSource(facts, preparation) {
			return none, false
		}
	}
	id, adopted := work.requireOperation(facts, data.reading)
	if !adopted {
		return none, false
	}
	work.attachWriterSourceDependencies(facts, id)
	work.attachSourceObservationDependencies(facts, p.id)
	if !work.getPreparationDataRegistered(data) || !work.declarationWriterScopeDependency(p.id, id, data.reading) {
		return none, false
	}
	if !present {
		work.operations[id.index].resultSourceRequested = false
	}
	// Retain only a detached description on the live original interval. The
	// graph-local event is issued after its normal return, never by adoption.
	p.acquisition.data = append(p.acquisition.data, cloneGetPreparationData(data))
	return data.reading, true
}

func (work *callableEffectWork) getPreparationDataCurrent(request sourceStagedOperationRequest) bool {
	source := work.operationRecipes[request.producer].callResult
	if source == nil {
		return false
	}
	for _, data := range source.preparationData {
		if !sameOperationRequest(data.reading, request) || !work.getPreparationDataRegistered(data) {
			continue
		}
		read := work.freezeReturnReading(data)
		return read != nil
	}
	return false
}

// The live original interval must match both the outer descriptive parent and
// its actual nested physical acquisition. A saved reader or outer Get cannot
// substitute for this interval's query, read cut or receiver projection.
func (q *sourceValueQuery) getPreparationDataContextMatches(data sourceStagedGetPreparationData) bool {
	if q == nil || q.stagedMember == nil {
		return false
	}
	b := q.stagedMember
	p := b.getPreparation
	if !p.live(q) || !p.acquisition.live(q, p) || !q.liveStagedMemberSource(b, b.get, b.read) {
		return false
	}
	return sameOperationRequest(data.parent, p.request) && data.physical == b.observation && data.semantic == q.relativeInputCut(b.get.operation) && data.acquisition == p.acquisition.kind && sameOperationEndpoint(data.receiver, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: b.get.receiver.node, projection: b.get.receiver.path, producer: b.get.operation, cut: b.observation})
}
