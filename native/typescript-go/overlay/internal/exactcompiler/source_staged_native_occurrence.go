package exactcompiler

// sourceStagedNativeOccurrence is one original source selection handoff, local
// to admission in this graph. It contains no query, acquired values or callback.
// Source recipes can be registered before selection without adopting an Effects
// consumer. DEFAULT retains the unsupported handoff's legacy owner. Internal
// replacement collection instead reports its authentic source gap before that
// fallback. Neither path adopts an unsupported prefix.
// This is not cached with facts or reused to avoid a later source observation.
type sourceStagedNativeOccurrence struct {
	installationDescription *sourceNativeInstallationMutationDescription // Original selected event only; never cloned or cached.
	eagerIssuer             *sourceStagedNativeOccurrence                // Original returned pointer, not cached.
	eagerWitness            *sourceStagedNativeEagerWitness              // Detached complete event, no query/borrow.
	work                    *callableEffectWork
	generation              *projectGeneration
	pendingResults          bool                           // actual source borrower registered required return-data work
	source                  *sourceStagedNativeGetSource   // Actual original branch, independent of child handoff support.
	observedCoverage        []sourceStagedOperationRequest // This synchronous original Get only; never cloned.
	callee                  *sourceStagedNativeCalleeEffects
	child                   *sourceStagedNativeOccurrence
}

func (work *callableEffectWork) adoptNativeInputOccurrence(facts []callableFacts, occurrence *sourceStagedNativeOccurrence) bool {
	if occurrence == nil || occurrence.work != work || occurrence.generation == nil || occurrence.generation != work.operationGeneration || occurrence.source == nil || occurrence.callee == nil && !occurrence.pendingResults || occurrence.callee != nil && (!validStagedNativeCalleeEffects(*occurrence.callee, occurrence.source) || occurrence.callee.generation != occurrence.generation) {
		return false
	}
	if occurrence.child != nil && !work.adoptNativeInputOccurrence(facts, occurrence.child) {
		return false
	}
	source := occurrence.source
	if occurrence.callee == nil {
		debt := work.operationRecipes[nativeRootDebtRequest(source, "callee-get").producer]
		if debt.nativeGet == nil || len(debt.nativeGet.callResults) == 0 || !validNativeGetRecipe(debt) {
			return false
		}
	}
	if !work.registerOperationUse(facts, sourceStagedOperationUse{request: source.request}) {
		return false
	}
	id := work.operationIDs[source.request.producer]
	work.registerOperationDependencies(facts, id)
	if occurrence.callee != nil && !work.admitNativeCalleeEffects(facts, source, *occurrence.callee) {
		return false
	}
	if occurrence.child != nil {
		algorithm := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer].nativeGet
		if !work.connectNativeInputSource(facts, algorithm, occurrence.child.source.request.producer.operation) {
			return false
		}
	}
	// Adoption already queued the original Get ID. Attach its exact reverse
	// arrival watchers before the ordinary collector returns.
	work.attachNativeEffectsDependencies(facts, id)
	work.attachNativeEffectsDependencies(facts, work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer])
	// Selection preceded adoption; retain its pending SOURCE description now,
	// without forcing an earlier consumer or issuing a replacement Get.
	work.completeNativeInstallationMutationOccurrence(facts, occurrence)
	work.completeNativeEagerOccurrence(occurrence)
	consumer := work.memberNodes[source.request.consumer]
	facts[consumer].staged.operationSkipped = append(facts[consumer].staged.operationSkipped, source.request.producer.operation)
	return true
}

// adoptNativeInputSourceRequirements belongs to a source continuation. It
// adopts existing Effects requirements without another ordinary use or body.
func (work *callableEffectWork) adoptNativeInputSourceRequirements(facts []callableFacts, occurrence *sourceStagedNativeOccurrence) bool {
	if occurrence == nil || occurrence.work != work || occurrence.generation != work.operationGeneration || occurrence.source == nil || occurrence.callee == nil || !validStagedNativeCalleeEffects(*occurrence.callee, occurrence.source) {
		return false
	}
	if occurrence.child != nil && !work.adoptNativeInputSourceRequirements(facts, occurrence.child) {
		return false
	}
	source := occurrence.source
	id, ok := work.requireOperation(facts, source.request)
	if !ok {
		return false
	}
	work.registerOperationDependencies(facts, id)
	if !work.admitNativeCalleeEffects(facts, source, *occurrence.callee) {
		return false
	}
	work.attachNativeEffectsDependencies(facts, id)
	work.attachNativeEffectsDependencies(facts, work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer])
	connected := occurrence.child == nil || work.connectNativeInputSource(facts, work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer].nativeGet, occurrence.child.source.request.use)
	if connected {
		work.completeNativeInstallationMutationOccurrence(facts, occurrence)
		work.completeNativeEagerOccurrence(occurrence)
	}
	return connected
}
