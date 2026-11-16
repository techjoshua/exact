package exactcompiler

import "slices"

// A read-demand observation belongs to a normally returned original Get
// interval. It authenticates transport to D, not D's result, a completed Get,
// preparation completion, or any coverage/currentness stamp.
type sourceStagedGetPreparationDataReadObservation struct {
	self       *sourceStagedGetPreparationDataReadObservation
	id         sourceStagedOperationID
	generation *projectGeneration
	data       sourceStagedGetPreparationData
	required   []sourceStagedOperationRequest
	observed   []sourceStagedOperationRequest
	revisions  []uint64
}

// Exclude the requested D and this preparation from their own transport
// readset. Their eventual result/APPLIED/completion remains final graph debt.
// All other original source/input associations keep exact subscriber currency.
func (work *callableEffectWork) getPreparationDataReadset(id sourceStagedOperationID, data sourceStagedGetPreparationData) ([]sourceStagedOperationRequest, []uint64, bool) {
	if work.getPreparationTaskSource(id) == nil {
		return nil, nil, false
	}
	var requests []sourceStagedOperationRequest
	revisions := []uint64{uint64(id.index)}
	for _, d := range work.getPreparationTaskDependencies(id) {
		if d.producer == id || d.request.producer == data.source.producer {
			continue
		}
		if d.producer.epoch != work.operationEpoch || d.producer.index == 0 || int(d.producer.index) >= len(work.operations) {
			return nil, nil, false
		}
		child := &work.operations[d.producer.index]
		sub := child.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
		if child.invalid || !child.dependenciesRegistered || work.operationIDs[d.request.producer] != d.producer || sub == nil || sub.blocked || !sameOperationRequest(sub.request, d.request) {
			return nil, nil, false
		}
		requests = append(requests, d.request)
		revisions = append(revisions, uint64(d.producer.index), child.revision, sub.applied)
	}
	return requests, revisions, true
}

func (work *callableEffectWork) getPreparationDataReadCurrent(observation *sourceStagedGetPreparationDataReadObservation, data sourceStagedGetPreparationData) bool {
	if observation == nil || observation.self != observation || observation.generation != work.operationGeneration || !sameGetPreparationData(observation.data, data) || !work.getPreparationDataRegistered(data) {
		return false
	}
	id := work.operationIDs[stagedGetPreparationRequest(data.parent).producer]
	if observation.id != id || work.getPreparationTaskSource(id) == nil {
		return false
	}
	required := work.operationRecipes[work.operations[id.index].key].delta.required
	requests, revisions, valid := work.getPreparationDataReadset(id, data)
	return valid && operationPrefix(observation.required, required, sameOperationRequest) && operationPrefix(required, observation.required, sameOperationRequest) && operationPrefix(observation.observed, requests, sameOperationRequest) && operationPrefix(requests, observation.observed, sameOperationRequest) && slices.Equal(observation.revisions, revisions)
}

func (work *callableEffectWork) getPreparationDataReadObserved(data sourceStagedGetPreparationData) bool {
	id := work.operationIDs[stagedGetPreparationRequest(data.parent).producer]
	if work.getPreparationTaskSource(id) == nil {
		return false
	}
	for _, observation := range work.operations[id.index].getPreparationDataReads {
		if work.getPreparationDataReadCurrent(observation, data) {
			return true
		}
	}
	return false
}

// finishGetPreparationDataRead is called only after the original traversal
// returns normally, before its live acquisition is revoked. Deferred panic
// cleanup cannot issue an event. Only descriptions enrolled by that interval
// are eligible; registration or a delivery ACK cannot create this observation.
func (q *sourceValueQuery) finishGetPreparationDataRead() {
	if q == nil || q.stagedMember == nil {
		return
	}
	p := q.stagedMember.getPreparation
	if !p.live(q) || !p.acquisition.live(q, p) {
		return
	}
	a, work := p.acquisition, p.work
	if work.getPreparationTaskSource(p.id) == nil {
		return
	}
	for _, data := range a.data {
		if data.acquisition != a.kind || data.physical != a.cut || !sameOperationRequest(data.parent, p.request) || !sameOperationEndpoint(data.receiver, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: a.get.receiver.node, projection: a.get.receiver.path, producer: a.get.operation, cut: a.cut}) || !work.getPreparationDataRegistered(data) {
			continue
		}
		if work.getPreparationDataReadObserved(data) {
			continue
		}
		requests, revisions, valid := work.getPreparationDataReadset(p.id, data)
		if !valid {
			continue
		}
		observation := &sourceStagedGetPreparationDataReadObservation{id: p.id, generation: work.operationGeneration, data: cloneGetPreparationData(data), required: append([]sourceStagedOperationRequest(nil), work.operationRecipes[stagedGetPreparationRequest(p.request).producer].delta.required...), observed: requests, revisions: revisions}
		observation.self = observation
		// Replace only this exact reading's prior event. Other nested contexts
		// remain separate and are independently checked against their readsets.
		state := &work.operations[p.id.index]
		replaced := false
		for i, prior := range state.getPreparationDataReads {
			if sameOperationRequest(prior.data.reading, data.reading) {
				state.getPreparationDataReads[i] = observation
				replaced = true
				break
			}
		}
		if !replaced {
			state.getPreparationDataReads = append(state.getPreparationDataReads, observation)
		}
		// This actual source event resumes the already registered D producer on
		// the existing queue. It grants no result or input authority.
		id := work.operationIDs[data.source.producer]
		caller, known := work.memberNodes[data.source.producer.declaration]
		if known && id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
			work.operations[id.index].resultSourceRequested = false
			work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: caller, operation: id})
		}
	}
}
