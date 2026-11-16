package exactcompiler

import "slices"

// A native SOURCE demand is scheduling metadata in this graph only. It is not
// a Get observation, source delta, input proof, APPLIED receipt or reverse DATA
// dependency of the callee. The ordinal distinguishes immutable retained reads.
type sourceStagedNativeProjectionDemand struct {
	producer sourceStagedOperationID
	ordinal  int
	reading  sourceStagedOperationRequest
}

func sameNativeProjectionDemands(a, b []sourceStagedNativeProjectionDemand) bool {
	if len(a) != len(b) {
		return false
	}
	for i, d := range a {
		if d.producer != b[i].producer || d.ordinal != b[i].ordinal || !sameOperationRequest(d.reading, b[i].reading) {
			return false
		}
	}
	return true
}

// nativeProjectionGetDemands recognizes only explicit k1 intent and actual
// matching DATA adoption. Descriptions without subscribers remain passive.
// Preparation and other result purposes retain their existing separate owners.
func (work *callableEffectWork) nativeProjectionGetDemands(source *sourceStagedNativeGetSource) []sourceStagedNativeProjectionDemand {
	if source == nil || source.kind != sourceNativeObjectFreeze || work.operationGeneration == nil || !work.operationGeneration.active {
		return nil
	}
	request := stagedResultSourceRequest(source.request.producer.operation, source.request.consumer, nil)
	recipe := work.operationRecipes[request.producer]
	s := recipe.callResult
	if !validStagedCallResultRecipe(recipe) || s == nil || !s.nativeCall || s.generation != work.operationGeneration || !sameOperationRequest(s.request, request) {
		return nil
	}
	id, adopted := work.operationIDs[s.request.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid {
		return nil
	}
	var result []sourceStagedNativeProjectionDemand
	for ordinal, p := range s.projections {
		if !validFreezeProjection(s, p) {
			continue
		}
		sub := work.operations[id.index].subscribers[sourceStagedOperationConsumer{p.reading.consumer, p.reading.edge}]
		if sub == nil || sub.blocked || !sameOperationRequest(sub.request, p.reading) {
			continue
		}
		result = append(result, sourceStagedNativeProjectionDemand{producer: id, ordinal: ordinal, reading: p.reading})
	}
	return result
}

// enrollNativeProjectionGet joins all three registration orders: original
// intent, actual selected factory, and actual matching DATA subscription. It
// adopts only the already selected callee factory, never DATA or an Effects use.
func (work *callableEffectWork) enrollNativeProjectionGet(facts []callableFacts, key sourceStagedOperationKey) {
	s := work.operationRecipes[key].callResult
	if s == nil || !s.nativeCall || len(s.projections) == 0 {
		return
	}
	root := work.operationRecipes[sourceStagedOperationKey{declaration: s.request.consumer, operation: s.request.producer.operation, kind: relativeDemandEffects}].nativeGet
	if root == nil || len(work.nativeProjectionGetDemands(root)) == 0 {
		return
	}
	work.registerNativeScopeGetUse(facts, root)
}

// nativeScopeAttemptCurrent compares two independent scheduling inputs. Demand
// identity never enters sourceObservationRevisions or semantic proof currency.
// The caller authenticates id through the existing canonical SOURCE task owner.
func (work *callableEffectWork) nativeScopeAttemptCurrent(id sourceStagedOperationID, revisions []uint64, demands []sourceStagedNativeProjectionDemand) bool {
	st := &work.operations[id.index]
	return st.writerSourceRevisions != nil && slices.Equal(st.writerSourceRevisions, revisions) && sameNativeProjectionDemands(st.nativeScopeAttemptDemands, demands)
}

// sourceObservationAttemptCurrent keeps other SOURCE services on their existing
// cursor schema while this canonical service also tracks administrative demand.
func (work *callableEffectWork) sourceObservationAttemptCurrent(id sourceStagedOperationID, revisions []uint64) bool {
	if source := work.nativeScopeGetTaskSource(id); source != nil {
		return work.nativeScopeAttemptCurrent(id, revisions, work.nativeProjectionGetDemands(source))
	}
	return work.operations[id.index].writerSourceRevisions != nil && slices.Equal(work.operations[id.index].writerSourceRevisions, revisions)
}

// queueNativeScopeGetAttempt coalesces onto the existing canonical callee task.
// A running attempt owns its START snapshot; finally reconciles any later real
// demand. Unchanged ACKs cannot request another query or refresh an observation.
func (work *callableEffectWork) queueNativeScopeGetAttempt(id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	// Running is a negative scheduling decision, never source recognition.
	// Validate the slot first; every queueing path still validates its source.
	state := &work.operations[id.index]
	if state.writerSourceRunning {
		return
	}
	source := work.nativeScopeGetTaskSource(id)
	if source == nil {
		return
	}
	revisions := work.sourceObservationRevisions(id)
	if revisions == nil || work.nativeScopeAttemptCurrent(id, revisions, work.nativeProjectionGetDemands(source)) {
		return
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery && task.nativeInputRevision == 0 && task.nativeTargetRevision == 0 {
			return
		}
	}
	caller, known := work.memberNodes[source.request.consumer]
	if !known {
		return
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: caller, operation: id})
}
