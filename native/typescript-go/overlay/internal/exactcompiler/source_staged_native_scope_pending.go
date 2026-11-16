package exactcompiler

// nativeScopeRootOwned validates a real adopted SOURCE root use. The parent is
// an actual original Get request; this grants neither that Get nor its method.
func (work *callableEffectWork) nativeScopeRootOwned(reading, parent sourceStagedOperationRequest) bool {
	if !nativeScopeRootRequest(parent, reading) || work.operationGeneration == nil || !work.operationGeneration.active || reading.reading != (sourceStagedOperationKey{}) || reading.inputs != nil || reading.producer.operation == parent.producer.operation || reading.consumer != parent.consumer || reading.producer.declaration != parent.consumer {
		return false
	}
	recipe := work.operationRecipes[reading.producer]
	if !validStagedMemberCallRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || len(recipe.memberSource.call.values) != 0 || !sameOperationRequest(recipe.memberSource.request, reading) {
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

// retainDeclarationScopeParent retains an actual source debt before native
// selection, or names it on the existing unsealed Get. Only the actual selected
// or finishing Get publisher can subsequently install a native Effects source.
func (work *callableEffectWork) retainDeclarationScopeParent(facts []callableFacts, q *sourceValueQuery, parent sourceStagedDeclarationScopeParent, reading sourceStagedOperationRequest) bool {
	if parent.preparation != nil {
		return work.retainGetPreparationRoot(facts, q, parent.preparation, reading)
	}

	if parent.source != nil {
		request := nativeRootDebtRequest(parent.source, "callee-get")
		recipe := work.operationRecipes[request.producer]
		if !validNativeGetRecipe(recipe) {
			return false
		}
		if parent.id.index != 0 {
			if !work.declarationWriterScopeRequirementAllowed(parent.id, reading) {
				return false
			}
		} else if recipe.delta.extracted && !operationContainsRequest(recipe.delta.required, reading) {
			return false
		}
		if !work.recordNativeSelectionRequirements(facts, parent.source, []sourceStagedOperationRequest{reading}) {
			return false
		}
	}
	n := q.stagedNativeGet
	if parent.issuer != nil {
		parent.issuer.scopePending = appendEntryLawRequirement(parent.issuer.scopePending, reading)
	}
	n.selectionRequired = appendEntryLawRequirement(n.selectionRequired, reading)
	if parent.source != nil && work.nativeEffectsTaskSource(parent.id) != nil {
		work.attachSourceObservationDependencies(facts, parent.id)
		id := work.operationIDs[reading.producer]
		return work.declarationWriterScopeDependency(parent.id, id, reading)
	}
	// Without a task factory, only the original still-live producer interval
	// owns transfer into its forthcoming selected/finishing Get callback.
	if parent.issuer != nil && parent.issuer.live() {
		return true
	}
	if parent.source == nil {
		return true // Only event-local debt until the actual selected factory exists.
	}
	_, adopted := work.registerNativeScopeGetUse(facts, parent.source)
	return adopted
}

// declarationScopeParentOwned keeps a preselection scope debt in the same
// original producer interval, or on its actually adopted source task. Neither
// case manufactures a native factory, a physical observation or an ACK.
func (work *callableEffectWork) declarationScopeParentOwned(q *sourceValueQuery, parent sourceStagedDeclarationScopeParent, id sourceStagedOperationID, reading sourceStagedOperationRequest) bool {
	if parent.preparation != nil {
		return parent.preparation.live(q) && parent.preparation.work == work && work.getPreparationChildOwned(parent.request, reading) && work.declarationWriterScopeDependency(parent.id, id, reading)
	}

	if !work.nativeScopeRootOwned(reading, parent.request) || !operationContainsRequest(q.stagedNativeGet.selectionRequired, reading) {
		return false
	}
	if parent.source != nil && work.nativeEffectsTaskSource(parent.id) != nil {
		return work.declarationWriterScopeDependency(parent.id, id, reading)
	}
	if parent.issuer != nil && parent.issuer.live() && operationContainsRequest(parent.issuer.scopePending, reading) {
		return true
	}
	if parent.source == nil {
		return true // A current root can be consumed while its SAME Get is live.
	}
	return work.nativeScopeGetSource(parent.id) != nil && work.declarationWriterScopeDependency(parent.id, id, reading)
}

// finishNativeScopePending transfers only requirements from this SAME real
// finishing Get. It never reacquires a receiver, replays selection or lends a
// normal value. Physical pending/C and final callee-current checks stay separate.
func (work *callableEffectWork) finishNativeScopePending(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, standard *sourceValue, source *sourceStagedNativeGetSource) bool {
	n := q.stagedNativeGet
	if n == nil || n.effectsIssuer == nil || len(n.effectsIssuer.scopePending) == 0 {
		return true
	}
	issuer := n.effectsIssuer
	if !issuer.live() || issuer.work != work || issuer.owner != q.executable || n.issuer != q || !n.finishing || !n.sourceObserved || n.owner != q.owner || n.generation != work.operationGeneration || get == nil || get.operation != q.reading || q.initializing != n.call || standard == nil || standard.native == nil || source == nil || source.kind != standard.native.kind || source.method != standard.node || !sameOperationRequest(source.request, issuer.request) {
		return false
	}
	prior := n.effectsGet
	n.effectsGet = get
	defer func() { n.effectsGet = prior }()
	return work.registerNativeEffectsSource(facts, q, get, source, issuer)
}
