package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nativeEagerReceiptRequest uses the EXISTING eager operation as the primitive
// observation owner. No NoUser factory, reader namespace or task is invented.
func nativeEagerReceiptRequest(s *sourceStagedNativeGetSource) (sourceStagedOperationRequest, bool) {
	if s == nil || s.kind != sourceNativeObjectDefineProperties || s.request.producer.operation == nil || s.request.consumer != s.request.producer.declaration {
		return sourceStagedOperationRequest{}, false
	}
	return nativeRootDebtRequest(s, "eager-inputs"), true
}

// nativeEagerPrimitiveDomain separates MODULE law ownership from the shared
// primitive source interval. Input-shape eligibility is checked separately at
// fresh callback capture, so an unsupported new attempt still revokes old input
// currency. Description/zero planned operations cannot issue a positive event.
// Actual physical cut is captured verbatim and joined to the same Get finish.
func (work *callableEffectWork) nativeEagerPrimitiveDomain(q *sourceValueQuery, s *sourceStagedNativeGetSource) bool {
	if q == nil || q.stagedNativeGet == nil || s == nil {
		return false
	}
	b := q.stagedNativeGet
	if runtimeModuleEvaluation(q.effectOwner) {
		return q.relativeInputCut(b.call) == (sourceRelativeCut{operation: b.call, use: b.call, reading: b.call, initializing: b.call})
	}
	return q.effectOwner != nil && ast.IsFunctionLike(q.effectOwner) && s.request.consumer == q.effectOwner && s.request.producer.declaration == q.effectOwner && enclosingCallableNode(b.call) == q.effectOwner && sourceStagedOccurrenceOwned(b.call, q.effectOwner) && b.entry == nil && b.argumentIssuer == nil
}

// nativeEagerReceiptOwned validates observation-slot identity only. Admission,
// evidence, semantic revisions and transport/currentness remain separate checks.
func (work *callableEffectWork) nativeEagerReceiptOwned(request sourceStagedOperationRequest, receipt *sourceStagedEntryLawReceipt) bool {
	return receipt != nil && receipt.source == nil && sameOperationRequest(receipt.nativeEagerOwner, request) && receipt.issuer != nil && receipt.issuer.proof == receipt && receipt.issuer.epoch == work.operationEpoch && receipt.generation == work.operationGeneration
}
