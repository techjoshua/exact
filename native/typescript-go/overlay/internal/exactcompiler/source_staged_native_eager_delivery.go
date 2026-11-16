package exactcompiler

// An original handoff fixes semantic observations once. ACK completion may
// consume these revisions; it cannot replace them with a later producer event.
type sourceStagedNativeEagerDependency struct {
	dependency sourceStagedOperationDependency
	revision   uint64
}

// Watchers are derived notification backrefs, not receipts or current rights.
// Stale slots remain harmless because completion authenticates the exact slot.
type sourceStagedNativeEagerWatch struct {
	owner   sourceStagedOperationRequest
	receipt *sourceStagedEntryLawReceipt
	witness *sourceStagedNativeEagerWitness
}

func (work *callableEffectWork) ensureNativeCapabilityNotifications() {
	if work.nativeCapabilityNotifications != nil {
		return
	}
	work.nativeCapabilityNotifications = &sourceStagedNativeCapabilityNotifications{
		entryLaws:  make(map[sourceStagedDependencyKey]map[sourceStagedEntryLawModuleKey]sourceStagedEntryLawModuleWatch),
		operations: make(map[sourceStagedOperationKey]map[sourceStagedOperationKey][]sourceStagedOperationRequest),
		modules:    make(map[sourceStagedDependencyKey]map[sourceStagedOperationKey]struct{}),
		notifying:  make(map[sourceStagedOperationKey]bool), seen: make(map[sourceStagedOperationKey]map[sourceStagedOperationRequest]bool),
		expands:      make(map[sourceStagedOperationKey]map[sourceStagedOperationKey]bool),
		eager:        make(map[sourceStagedOperationRequest][]sourceStagedNativeEagerWatch),
		eagerModules: make(map[sourceStagedDependencyKey][]sourceStagedNativeEagerWatch),
		eagerOwners:  make(map[sourceStagedOperationKey][]sourceStagedNativeEagerWatch),
	}
}

// retainNativeEagerDependencies is called only during successful original Get
// admission. The recorded vector and required inventory never change afterward.
func (work *callableEffectWork) retainNativeEagerDependencies(w *sourceStagedNativeEagerWitness) bool {
	if w == nil || w.admitted || w.get.epoch != work.operationEpoch || w.get.index == 0 || int(w.get.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[w.get.index]
	recipe := work.operationRecipes[state.key]
	deps := work.sourceObservationDependencies(w.get)
	if len(w.vector) != 1+3*len(deps) || w.vector[0] != uint64(w.get.index) {
		return false
	}
	observed := make([]sourceStagedNativeEagerDependency, 0, len(deps))
	for i, d := range deps {
		offset := 1 + 3*i
		if d.producer.epoch != work.operationEpoch || d.producer.index == 0 || int(d.producer.index) >= len(work.operations) || w.vector[offset] != uint64(d.producer.index) {
			return false
		}
		child := &work.operations[d.producer.index]
		sub := child.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
		if sub == nil || sub.blocked || !sameOperationRequest(sub.request, d.request) || w.vector[offset+1] != child.revision || w.vector[offset+2] != sub.applied {
			return false
		}
		observed = append(observed, sourceStagedNativeEagerDependency{dependency: d, revision: child.revision})
	}
	w.required = append([]sourceStagedOperationRequest(nil), recipe.delta.required...)
	w.observed = observed
	return true
}

// nativeEagerObservedCurrent separates unchanged semantic observation from
// delivery. New semantic revisions or associations need another original Get.
// It never rewrites the old observation vector to match the current graph.
func (work *callableEffectWork) nativeEagerObservedCurrent(w *sourceStagedNativeEagerWitness, applied bool) bool {
	if w == nil || w.issuer != w || !w.admitted || w.epoch != work.operationEpoch || w.get.epoch != work.operationEpoch || w.get.index == 0 || int(w.get.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[w.get.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !state.dependenciesRegistered || !state.delta.extracted || !operationDeltaPrefix(state.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, state.delta) || !operationPrefix(w.required, recipe.delta.required, sameOperationRequest) || !operationPrefix(recipe.delta.required, w.required, sameOperationRequest) {
		return false
	}
	deps := work.sourceObservationDependencies(w.get)
	if len(deps) != len(w.observed) || len(w.vector) != 1+3*len(deps) || w.vector[0] != uint64(w.get.index) {
		return false
	}
	for i, d := range deps {
		old := w.observed[i]
		offset := 1 + 3*i
		if d.producer != old.dependency.producer || !sameOperationRequest(d.request, old.dependency.request) || d.producer.epoch != work.operationEpoch || d.producer.index == 0 || int(d.producer.index) >= len(work.operations) || old.revision == 0 || w.vector[offset] != uint64(d.producer.index) || w.vector[offset+1] != old.revision {
			return false
		}
		child := &work.operations[d.producer.index]
		sub := child.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
		if child.invalid || !child.dependenciesRegistered || !child.delta.extracted || child.revision != old.revision || sub == nil || sub.blocked || !sameOperationRequest(sub.request, d.request) {
			return false
		}
		if applied && (sub.consumed != old.revision || sub.applied != old.revision) {
			return false
		}
	}
	return true
}

func appendNativeEagerWatch(watches []sourceStagedNativeEagerWatch, watch sourceStagedNativeEagerWatch) []sourceStagedNativeEagerWatch {
	// A renewed source replaces its old notification slot, never its evidence.
	for i, old := range watches {
		if sameOperationRequest(old.owner, watch.owner) {
			watches[i] = watch
			return watches
		}
	}
	return append(watches, watch)
}

func (work *callableEffectWork) installPendingNativeEagerReceipt(owner sourceStagedOperationRequest, receipt *sourceStagedEntryLawReceipt, w *sourceStagedNativeEagerWitness) {
	work.ensureNativeCapabilityNotifications()
	n := work.nativeCapabilityNotifications
	watch := sourceStagedNativeEagerWatch{owner: owner, receipt: receipt, witness: w}
	requests := make([]sourceStagedOperationRequest, 0, len(w.observed))
	for _, d := range w.observed {
		requests = appendEntryLawRequirement(requests, d.dependency.request)
	}
	var eager *sourceStagedNativeGetSource
	// Use the original registered source's canonical factory helper, not a new
	// reader namespace or a producer-only ACK association.
	root := work.operationRecipes[w.evidence.request.producer].nativeGet
	if root != nil {
		eager = work.operationRecipes[nativeRootDebtRequest(root, "eager-inputs").producer].nativeGet
	}
	if eager != nil {
		owner := nativeRootDebtRequest(eager, "eager-inputs").producer
		n.eagerOwners[owner] = appendNativeEagerWatch(n.eagerOwners[owner], watch)
		for _, r := range stagedKeyRequirements(eager) {
			requests = appendEntryLawRequirement(requests, r)
		}
		id := work.operationIDs[nativeRootDebtRequest(eager, "eager-inputs").producer]
		if id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
			if consumer, ok := work.memberNodes[eager.request.consumer]; ok {
				for _, m := range work.operations[id.index].moduleInputs {
					key := sourceStagedDependencyKey{consumer, m.edge}
					n.eagerModules[key] = appendNativeEagerWatch(n.eagerModules[key], watch)
				}
			}
		}
	}
	for _, r := range requests {
		n.eager[r] = appendNativeEagerWatch(n.eager[r], watch)
	}
	work.completePendingNativeEagerReceipt(watch)
}

func (work *callableEffectWork) completePendingNativeEagerReceipt(watch sourceStagedNativeEagerWatch) bool {
	receipt := work.entryLawReceipts[watch.owner.producer]
	w := watch.witness
	if !work.nativeEagerReceiptOwned(watch.owner, receipt) || receipt != watch.receipt || receipt.nativeEager != w || w == nil || w.proof.generation != work.operationGeneration || !work.nativeEagerObservedCurrent(w, true) {
		return false
	}
	root := work.operationRecipes[w.evidence.request.producer].nativeGet
	if root == nil || !work.nativeGetCoverageCurrent(w.get, root, w.required) || !validStagedNativeCalleeEffects(w.proof, root) || !w.proof.noUserEntry || !work.nativeEffectsGetCurrent(root) {
		return false
	}
	eager := work.operationRecipes[nativeRootDebtRequest(root, "eager-inputs").producer].nativeGet
	if eager == nil || !sameNativeEagerEvidence(w.evidence, nativeEagerEvidence(eager)) {
		return false
	}
	if !w.delivered {
		w.delivered = true
		work.notifyNativeEagerCurrency(nativeRootDebtRequest(root, "eager-inputs").producer)
	}
	work.afterNativeWriterCapabilityObservation(nativeRootDebtRequest(root, "eager-inputs").producer)
	return true
}
func (work *callableEffectWork) afterPendingNativeEagerDelivery(reading sourceStagedOperationRequest) {
	n := work.nativeCapabilityNotifications
	if n == nil {
		return
	}
	for _, watch := range n.eager[reading] {
		work.completePendingNativeEagerReceipt(watch)
	}
}
