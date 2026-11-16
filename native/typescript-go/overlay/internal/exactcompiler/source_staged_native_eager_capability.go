package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
)

// sourceStagedNativeEagerAdmission is query-local success of the ORIGINAL
// selected map-input owner. It expires with that Get and never enters a recipe.
type sourceStagedNativeEagerAdmission struct {
	cut      sourceRelativeCut
	method   *ast.Node
	issuer   *sourceStagedNativeEagerAdmission
	query    *sourceValueQuery
	borrow   *sourceStagedNativeGetBorrow
	evidence sourceStagedNativeEagerEvidence
}

// sourceStagedNativeEagerEvidence retains the successfully issued associations,
// not a value, executed initializer, or no-entry conclusion from Effects X.
type sourceStagedNativeEagerEvidence struct {
	request             sourceStagedOperationRequest
	target, descriptors sourceRelativeEndpoint
	keys                []sourceStagedKeySource
	imports             []sourceStagedModuleInput
}

// sourceStagedNativeEagerWitness lives on this graph's original eager-operation
// observation receipt. It becomes current ONLY through admission of the SAME complete Get
// with its exact consumed vector. Clone never carries this receipt or issuer.
type sourceStagedNativeEagerWitness struct {
	issuer               *sourceStagedNativeEagerWitness
	evidence             sourceStagedNativeEagerEvidence
	proof                sourceStagedNativeCalleeEffects
	epoch                *sourceStagedOperationEpoch
	get                  sourceStagedOperationID
	vector               []uint64
	admitted             bool
	needsSourceAdmission bool
	observed             []sourceStagedNativeEagerDependency
	required             []sourceStagedOperationRequest
	delivered            bool
}

func nativeEagerEvidence(s *sourceStagedNativeGetSource) sourceStagedNativeEagerEvidence {
	if s == nil || s.descriptorMap == nil {
		return sourceStagedNativeEagerEvidence{}
	}
	return sourceStagedNativeEagerEvidence{request: s.request, target: cloneSourceRelativeEndpoint(s.descriptorMap.target), descriptors: cloneSourceRelativeEndpoint(s.descriptorMap.descriptors), keys: append([]sourceStagedKeySource(nil), s.keySources...), imports: append([]sourceStagedModuleInput(nil), s.moduleSources...)}
}
func sameNativeEagerEvidence(a, b sourceStagedNativeEagerEvidence) bool {
	if !sameOperationRequest(a.request, b.request) || !sameOperationEndpoint(a.target, b.target) || !sameOperationEndpoint(a.descriptors, b.descriptors) || len(a.keys) != len(b.keys) || len(a.imports) != len(b.imports) {
		return false
	}
	for i, k := range a.keys {
		other := b.keys[i]
		if k.expression != other.expression || k.binding != other.binding || k.symbol != other.symbol || !sameOperationRequest(k.producer, other.producer) {
			return false
		}
	}
	for i, m := range a.imports {
		if m != b.imports[i] {
			return false
		}
	}
	return true
}

// nativeEagerInputObservationOwned authenticates this original selected input
// interval. Data-slot completeness is a separate requirement for its witness.
func (work *callableEffectWork) nativeEagerInputObservationOwned(facts []callableFacts, q *sourceValueQuery, s *sourceStagedNativeGetSource, selection sourceStagedNativeSelection) bool {
	if q == nil || s == nil || q.owner == nil || q.executable == nil || q.executable.values == nil || q.executable.project == nil {
		return false
	}
	b := q.stagedNativeGet
	if b == nil || b.issuer != q || b.owner != q.owner || b.sourceWork != work || b.sourceEpoch != work.operationEpoch || work.operationEpoch == nil || b.observation != nil || b.generation != work.operationGeneration || !b.canonical || b.contextual || b.writerDependent || b.legacyPrepared || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker || q.executable.values.generation != work.operationGeneration || q.owner.generation != work.operationGeneration || q.executable.project.activeGeneration != work.operationGeneration || !work.nativeEagerPrimitiveDomain(q, s) || q.reading != b.call || q.initializing != b.call || q.protectedMember != s.get || selection.selected.native == nil || selection.selected.native.kind != sourceNativeObjectDefineProperties || selection.selected.node != s.method || selection.call != b.call || !sameOperationRequest(selection.request, s.request) || !sameOperationRequest(b.getRequest, s.request) {
		return false
	}
	caller, known := work.memberNodes[s.request.consumer]
	publisher := q.executable.pendingMemberPublishers[s.request.consumer]
	return known && caller >= 0 && caller < len(facts) && caller < len(work.operationFacts) && &facts[caller] == &work.operationFacts[caller] && publisher != nil && publisher.live && publisher.fact == &facts[caller] && facts[caller].sourceFile != nil && q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) == facts[caller].sourceFile
}

// captureNativeEagerAdmission consumes successful fresh map input admission in
// this SAME original selected interval. A missing callback cannot reuse it.
func (work *callableEffectWork) captureNativeEagerAdmission(facts []callableFacts, q *sourceValueQuery, s *sourceStagedNativeGetSource, selection sourceStagedNativeSelection) {
	if !work.nativeEagerInputObservationOwned(facts, q, s, selection) || !q.stagedNativeGet.dataBranch || s.descriptorMap == nil || !s.inputEffects {
		return
	}
	// Admission is narrower than revocation: an authenticated fresh attempt
	// revokes old currency even when these new inputs are unsupported.
	if !runtimeModuleEvaluation(q.effectOwner) && (len(s.keySources) != 0 || len(s.moduleSources) != 0 || !stagedMapInputsInert(s)) {
		return
	}
	b := q.stagedNativeGet
	admission := &sourceStagedNativeEagerAdmission{query: q, borrow: b, evidence: nativeEagerEvidence(s), cut: q.relativeInputCut(b.call), method: s.method}
	admission.issuer = admission
	b.eagerAdmission = admission
}

func nativeEagerLawRequest(s *sourceStagedNativeGetSource) (sourceStagedOperationRequest, bool) {
	return stagedEntryLawRequest(nativeRootDebtRequest(s, "algorithm"), stagedEntryLawNativeAlgorithm)
}

// invalidateNativeEagerWitness revokes ONLY this source's prior eager currency
// when a fresh original Get starts. Failed new admission cannot reuse old input
// associations. It does not alter any Get proof, requested flag, or cursor.
func (work *callableEffectWork) invalidateNativeEagerWitness(request sourceStagedOperationRequest) {
	source := work.operationRecipes[request.producer].nativeGet
	if source == nil || source.kind != sourceNativeObjectDefineProperties || !sameOperationRequest(source.request, request) {
		return
	}
	r, ok := nativeEagerReceiptRequest(source)
	if !ok {
		return
	}
	if p := work.entryLawReceipts[r.producer]; p != nil && p.nativeEager != nil {
		p.nativeEager = nil
		work.notifyNativeEagerCurrency(nativeRootDebtRequest(source, "eager-inputs").producer)
		work.afterNativeWriterCapabilityObservation(nativeRootDebtRequest(source, "eager-inputs").producer)
	}
}

// finishNativeEagerObservation records a real successful selected admission
// followed by the same canonical complete Get finish. It is pending until the
// genuine callee owner admits that proof; no current cache can admit it here.
func (work *callableEffectWork) finishNativeEagerObservation(q *sourceValueQuery, s *sourceStagedNativeGetSource, proof sourceStagedNativeCalleeEffects, needsSourceAdmission bool) *sourceStagedNativeEagerWitness {
	if q == nil || s == nil {
		return nil
	}
	b := q.stagedNativeGet
	if b == nil || b.issuer != q || b.owner != q.owner || q.owner == nil || q.executable == nil || q.executable.values == nil || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker || b.generation != work.operationGeneration || !b.finishing || b.sourceWork != work || b.sourceEpoch != work.operationEpoch || !b.canonical || b.contextual || b.writerDependent || b.legacyPrepared || !proof.noUserEntry || !validStagedNativeCalleeEffects(proof, s) || proof.generation != work.operationGeneration {
		return nil
	}
	a := b.eagerAdmission
	if a == nil || a.issuer != a || a.query != q || a.borrow != b || a.cut != proof.cut || a.method != proof.method {
		return nil
	}
	eager := work.operationRecipes[nativeRootDebtRequest(s, "eager-inputs").producer]
	if eager.nativeGet == nil || !validNativeGetRecipe(eager) || !sameNativeEagerEvidence(a.evidence, nativeEagerEvidence(eager.nativeGet)) {
		return nil
	}
	var id sourceStagedOperationID
	var vector []uint64
	if !needsSourceAdmission {
		id = work.operationIDs[nativeRootDebtRequest(s, "callee-get").producer]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid || !work.operations[id.index].dependenciesRegistered {
			return nil
		}
		vector = work.sourceObservationRevisions(id)
		if vector == nil {
			return nil
		}
	}
	request, ok := nativeEagerReceiptRequest(s)
	if !ok {
		return nil
	}
	if work.entryLawReceipts == nil {
		work.entryLawReceipts = make(map[sourceStagedOperationKey]*sourceStagedEntryLawReceipt)
	}
	receipt := work.entryLawReceipts[request.producer]
	if receipt == nil {
		// This is a primitive observation at the registered eager-operation key,
		// never an invented module-law source or an operation factory.
		receipt = &sourceStagedEntryLawReceipt{nativeEagerOwner: request, cut: proof.cut, generation: work.operationGeneration}
		receipt.issuer = &sourceStagedEntryLawIssuer{proof: receipt, epoch: work.operationEpoch}
		work.entryLawReceipts[request.producer] = receipt
	}
	if receipt.source != nil || !sameOperationRequest(receipt.nativeEagerOwner, request) || receipt.issuer == nil || receipt.issuer.proof != receipt || receipt.issuer.epoch != work.operationEpoch || receipt.generation != work.operationGeneration || receipt.cut != proof.cut {
		return nil
	}
	// Preserve the old MODULE descriptor-receipt arrival order independently.
	// This creates no factory/law bit/prefix/currentness, and holds no witness.
	if runtimeModuleEvaluation(s.request.consumer) {
		if law, ok := nativeEagerLawRequest(s); ok && work.entryLawReceipts[law.producer] == nil {
			plan := &sourceStagedEntryLawSource{request: law, base: nativeRootDebtRequest(s, "algorithm"), kind: stagedEntryLawNativeAlgorithm, receiver: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: s.request.use, producer: s.request.use, cut: s.request.cut}}
			lawReceipt := &sourceStagedEntryLawReceipt{source: plan, cut: proof.cut, generation: work.operationGeneration}
			lawReceipt.issuer = &sourceStagedEntryLawIssuer{proof: lawReceipt, epoch: work.operationEpoch}
			work.entryLawReceipts[law.producer] = lawReceipt
		}
	}
	witness := &sourceStagedNativeEagerWitness{evidence: a.evidence, proof: proof, epoch: work.operationEpoch, get: id, vector: append([]uint64(nil), vector...), needsSourceAdmission: needsSourceAdmission}
	witness.issuer = witness
	receipt.nativeEager = witness
	return witness
}

// admitNativeEagerWitness is called from genuine Get admission, including its
// idempotent same-vector path. Equal cached proof fields alone never call it.
func (work *callableEffectWork) admitNativeEagerWitness(s *sourceStagedNativeGetSource, proof sourceStagedNativeCalleeEffects) {
	if s == nil {
		return
	}
	request, ok := nativeEagerReceiptRequest(s)
	if !ok {
		return
	}
	receipt := work.entryLawReceipts[request.producer]
	if !work.nativeEagerReceiptOwned(request, receipt) {
		return
	}
	w := receipt.nativeEager
	if !proof.noUserEntry || w == nil || w.issuer != w || w.epoch != work.operationEpoch || w.admitted || w.needsSourceAdmission || w.proof.generation != work.operationGeneration || w.proof.cut != proof.cut || w.proof.method != proof.method || !sameOperationRequest(w.proof.request, proof.request) || w.get != work.operationIDs[proof.request.producer] || !slices.Equal(w.vector, work.sourceObservationRevisions(w.get)) {
		return
	}
	if !work.retainNativeEagerDependencies(w) {
		return
	}
	w.admitted = true
	work.installPendingNativeEagerReceipt(request, receipt, w)
}

// nativeEagerWitnessCurrent is the existing MODULE law-facing wrapper. Input
// evidence and actual algorithm-law ownership are independently mandatory.
func (work *callableEffectWork) nativeEagerWitnessCurrent(s *sourceStagedNativeGetSource) bool {
	if s == nil || !runtimeModuleEvaluation(s.request.consumer) {
		return false
	}
	law, ok := nativeEagerLawRequest(s)
	if !ok {
		return false
	}
	recipe := work.operationRecipes[law.producer]
	receipt := work.entryLawReceipts[law.producer]
	if !validStagedEntryLawRecipe(recipe) || receipt == nil || receipt.issuer == nil || receipt.issuer.proof != receipt || receipt.issuer.epoch != work.operationEpoch || receipt.generation != work.operationGeneration || !sameStagedEntryLawSource(receipt.source, recipe.entryLaw) {
		return false
	}
	if !work.nativeEagerPrimitiveCurrent(s) {
		return false
	}
	primitive, _ := nativeEagerReceiptRequest(s)
	input := work.entryLawReceipts[primitive.producer]
	return input != nil && input.nativeEager != nil && receipt.cut == input.nativeEager.proof.cut
}

// nativeEagerPrimitiveCurrent consumes only original input construction. It has
// no module-prefix/whole-call law and cannot supply result, B or ordinary use.
func (work *callableEffectWork) nativeEagerPrimitiveCurrent(s *sourceStagedNativeGetSource) bool {
	if s == nil {
		return false
	}
	request, ok := nativeEagerReceiptRequest(s)
	if !ok {
		return false
	}
	recipe := work.operationRecipes[request.producer]
	receipt := work.entryLawReceipts[request.producer]
	if !validNativeGetRequest(recipe, request) || !work.nativeEagerReceiptOwned(request, receipt) {
		return false
	}
	w := receipt.nativeEager
	if w == nil || w.issuer != w || w.get.epoch != work.operationEpoch || w.get.index == 0 || int(w.get.index) >= len(work.operations) || receipt.cut != w.proof.cut || !w.admitted || w.epoch != work.operationEpoch || w.proof.generation != work.operationGeneration || !validStagedNativeCalleeEffects(w.proof, s) || !w.proof.noUserEntry || w.get != work.operationIDs[w.proof.request.producer] || !w.delivered || !work.nativeEagerObservedCurrent(w, true) {
		return false
	}
	proof := work.currentNativeCalleeEffects(s)
	return proof != nil && proof.noUserEntry && proof.cut == w.proof.cut && proof.method == w.proof.method && sameOperationRequest(proof.request, w.proof.request) && work.nativeEffectsGetCurrent(s) && work.nativeGetCoverageCurrent(w.get, s, w.required) && sameNativeEagerEvidence(w.evidence, nativeEagerEvidence(s))
}

// completeNativeEagerOccurrence is called only AFTER a successful original
// occurrence adoption. Get validity remains independent. This capability binds
// the real ID/vector only after exact original C/reader validation; it never
// executes source work or upgrades a description into a missing event.
func (work *callableEffectWork) completeNativeEagerOccurrence(occurrence *sourceStagedNativeOccurrence) bool {
	if occurrence == nil || occurrence.eagerIssuer != occurrence || occurrence.eagerWitness == nil || occurrence.work != work || occurrence.generation != work.operationGeneration || occurrence.source == nil || occurrence.callee == nil {
		return false
	}
	source := occurrence.source
	request, ok := nativeEagerReceiptRequest(source)
	if !ok {
		return false
	}
	receipt := work.entryLawReceipts[request.producer]
	if !work.nativeEagerReceiptOwned(request, receipt) || receipt.nativeEager != occurrence.eagerWitness {
		return false
	}
	w := receipt.nativeEager
	if w.issuer != w || w.epoch != work.operationEpoch || !w.needsSourceAdmission || w.proof.generation != work.operationGeneration || w.proof.cut != occurrence.callee.cut || w.proof.method != occurrence.callee.method || w.proof.noUserEntry != occurrence.callee.noUserEntry || !sameOperationRequest(w.proof.request, occurrence.callee.request) {
		return false
	}
	id := work.operationIDs[w.proof.request.producer]
	if !work.nativeOccurrenceCoverageCurrent(id, source, occurrence) || !work.nativeEffectsGetCurrent(source) {
		return false
	}
	vector := work.sourceObservationRevisions(id)
	if vector == nil {
		return false
	}
	if w.admitted {
		return w.get == id && work.nativeEagerObservedCurrent(w, false)
	}
	w.get = id
	w.vector = append([]uint64(nil), vector...)
	if !work.retainNativeEagerDependencies(w) {
		return false
	}
	w.admitted = true
	work.installPendingNativeEagerReceipt(request, receipt, w)
	return true
}
