package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedWriterRelevance consumes only the existing source owner's disposition
// for an indexed writer Call. It runs before receiver acquisition changes the
// physical cut. Exclusion supplies no callable or result value; pending retains
// an adopted producer/subscriber and marks compiler work, not runtime opacity.
func (q *sourceValueQuery) stagedWriterRelevance(call *ast.Node, result *accessorCandidates) sourceStagedWriterCallDisposition {
	if q == nil || result == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || call == nil || !ast.IsCallExpression(call) {
		return sourceStagedWriterCallDisposition{}
	}
	b := q.stagedMember
	if b == nil || b.coverage == nil || !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage.cut != q.relativeInputCut(b.get.operation) {
		return sourceStagedWriterCallDisposition{}
	}
	if native := q.stagedNativeGet; native != nil && (native.issuer != q || native.call == call || native.owner != q.owner || native.generation != b.generation || !sameOperationRequest(native.getRequest, b.request)) {
		return sourceStagedWriterCallDisposition{}
	}
	request := q.registerWriterInputRequest(call)
	if request == nil {
		return sourceStagedWriterCallDisposition{}
	}
	defer request.revoke()
	if request.writerSourceWork == nil {
		return sourceStagedWriterCallDisposition{}
	}
	work := request.writerSourceWork
	// This API can retire only a whole writer. Callee-component coverage is
	// consumed by memberWriterInputs, which continues every original actual.
	if descriptorCalleeRequested(work.operationRecipes[request.writerSource.producer]) {
		return sourceStagedWriterCallDisposition{}
	}
	if request.writerSourceIssuer != request || !work.writerSourceParentOwned(q, request) {
		return sourceStagedWriterCallDisposition{}
	}
	if !work.nativeObserverProducerCurrent(work.operationRecipes[request.writerSource.producer]) {
		disposition := work.consumeWriterSource(q, request)
		if disposition.handled && !disposition.excluded {
			result.valueIncomplete = true
		}
		return disposition
	}
	readings := appendEntryLawRequirement(append([]sourceStagedOperationRequest(nil), request.nativeReadings...), request.writerSourceReading)
	for _, reading := range readings {
		id := work.operationIDs[reading.producer]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return sourceStagedWriterCallDisposition{}
		}
		state := &work.operations[id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
		if state.key != reading.producer || state.invalid || !state.dependenciesRegistered || sub == nil || sub.blocked || !sameOperationRequest(sub.request, reading) {
			return sourceStagedWriterCallDisposition{}
		}
		if state.revision != 0 && sub.applied != state.revision {
			queued := false
			for _, task := range work.extractionQueue[work.extractionHead:] {
				queued = queued || task.operation == id && task.delivery && !task.operationDone
			}
			if !state.deliveryQueued || !queued {
				return sourceStagedWriterCallDisposition{}
			}
			work.observeNativeEffectsPending(q, request)
			result.valueIncomplete = true
			return sourceStagedWriterCallDisposition{handled: true}
		}
	}
	disposition := work.consumeWriterSource(q, request)
	if disposition.handled && !disposition.excluded {
		result.valueIncomplete = true
	}
	return disposition
}
