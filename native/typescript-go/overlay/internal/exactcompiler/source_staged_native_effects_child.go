package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
)

// nativeEffectsInputSource names only the original nested input of the actual
// selected Freeze. It grants neither child selection nor its returned value.
func (work *callableEffectWork) nativeEffectsInputSource(source *sourceStagedNativeGetSource) *sourceStagedNativeGetSource {
	if source == nil || source.kind != sourceNativeObjectFreeze {
		return nil
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer]
	input := algorithm.nativeGet
	if !validNativeGetRecipe(algorithm) || !sameNativeGetSource(input, source) || input.input == nil || !validStagedNativeInputPlan(*input.input, input) || !ast.IsCallExpression(input.input.input.expression) {
		return nil
	}
	return input
}

// nativeEffectsInputUnprovided preserves the old fully connected/current input
// route. A new request is useful only while the original child lacks that link
// or its independent current Get/result support.
func (work *callableEffectWork) nativeEffectsInputUnprovided(source *sourceStagedNativeGetSource) bool {
	algorithm := work.nativeEffectsInputSource(source)
	if algorithm == nil {
		return false
	}
	if !validStagedNativeInputSource(algorithm) {
		return true
	}
	child := work.operationRecipes[algorithm.inputSource.producer].nativeGet
	return child == nil || !work.nativeEffectsGetCurrent(child) || work.currentNativeResultRoot(child.request.producer) == nil
}

// nativeEffectsTaskChildAcquisition retains only the actual input acquisition
// of a live canonical root dispatcher. A completed first Get still needs its
// own source owner when later exact C/reader revisions require reobservation.
func (issuer *sourceStagedNativeEffectsIssuer) nativeEffectsTaskChildAcquisition(source *sourceStagedNativeGetSource) bool {
	if !issuer.live() || issuer.task.index == 0 || source == nil || !sameOperationRequest(source.request, issuer.request) {
		return false
	}
	if issuer.eager != nil {
		return issuer.eager.liveChild(issuer)
	}
	parent := issuer.work.nativeEffectsTaskSource(issuer.task)
	if parent == nil || issuer.work.operations[issuer.task.index].key != parent.request.producer || issuer.call == parent.request.use || !issuer.work.nativeEffectsGetCurrent(parent) {
		return false
	}
	input := issuer.work.nativeEffectsInputSource(parent)
	return input != nil && input.input.input.expression == issuer.call && source.get == issuer.call.Expression()
}

// nativeEffectsPendingObservation accepts only the real original traversal's
// owned writer dependency, not an incomplete bit or a cached request shell.
func (work *callableEffectWork) nativeEffectsPendingObservation(occurrence *sourceStagedNativeOccurrence, issuer *sourceStagedNativeEffectsIssuer) bool {
	if !issuer.live() || !issuer.issued || len(issuer.pending) == 0 && len(issuer.scopePending) == 0 || occurrence == nil || occurrence.work != work || occurrence.generation != work.operationGeneration || occurrence.source == nil || !sameOperationRequest(occurrence.source.request, issuer.request) {
		return false
	}
	for _, reading := range issuer.scopePending {
		if !work.nativeScopeRootOwned(reading, issuer.request) {
			return false
		}
	}
	for _, p := range issuer.pending {
		if !work.nativeEffectsPendingOwned(p, issuer.request) {
			return false
		}
	}
	return true
}

// admitNativeEffectsSourceGet shares the genuine returned Get handoff between
// the initial collector and its existing source task. Adoption enrolls the
// original Get/C/premises before receipt admission; no child Effects become Get
// premises. Observation currency comes only from this actual returned event.
func (work *callableEffectWork) admitNativeEffectsSourceGet(facts []callableFacts, occurrence *sourceStagedNativeOccurrence, issuer *sourceStagedNativeEffectsIssuer) bool {
	if !issuer.live() || issuer.work != work || issuer.task.index == 0 && !issuer.issued || occurrence == nil || occurrence.work != work || occurrence.generation != issuer.generation || occurrence.source == nil || !sameOperationRequest(occurrence.source.request, issuer.request) || occurrence.callee == nil || occurrence.callee.generation != issuer.generation || !validStagedNativeCalleeEffects(*occurrence.callee, occurrence.source) {
		return false
	}
	source := occurrence.source
	root := work.operationRecipes[source.request.producer]
	if !validNativeEffectsRequest(root) || !sameNativeGetSource(root.nativeGet, source) || root.nativeGet.effectsSource.generation != issuer.generation {
		return false
	}
	id, adopted := work.requireOperation(facts, nativeRootDebtRequest(source, "callee-get"))
	if !adopted || !work.admitNativeCalleeEffects(facts, source, *occurrence.callee) {
		return false
	}
	work.attachNativeEffectsDependencies(facts, id)
	if work.currentNativeCalleeEffects(source) == nil || !work.nativeEffectsCoverageCurrent(id, occurrence) {
		return false
	}
	revisions := work.sourceObservationRevisions(id)
	if revisions == nil {
		return false
	}
	work.observeNativeEffectsReaders(id)
	state := &work.operations[id.index]
	changed := !slices.Equal(state.nativeEffectsObserved, revisions)
	state.nativeEffectsObserved = revisions
	// This exact traversal has already occurred. The queued Get task can reuse
	// its consumed vector; a genuinely new prerequisite revision still wakes it.
	state.writerSourceRevisions = append([]uint64(nil), revisions...)
	if changed {
		// This is a new validated source-observation vector, independently of
		// whether the callee Effects atoms changed. Dependants must revalidate
		// after this event, including when their prerequisite ACK arrived first.
		state.revision++
		work.notifyOperationSubscribers(state)
		work.queueReflectiveResults(root.nativeGet)
	}
	current := work.nativeEffectsGetCurrent(root.nativeGet)
	if current {
		work.completeNativeEagerOccurrence(occurrence)
	}
	return current
}

// adoptNativeEffectsInputContinuation keeps one canonical child-discovery path:
// the existing root task. The initial ordinary collector first adopts/admit its
// actual Get, then records its authored Effects use once. A descendant issuer
// owned by that root task adopts requirements only. Passive source-only callers
// cannot construct either issuer or obtain this continuation.
func (work *callableEffectWork) adoptNativeEffectsInputContinuation(facts []callableFacts, occurrence *sourceStagedNativeOccurrence, issuer *sourceStagedNativeEffectsIssuer) bool {
	if !issuer.live() || issuer.work != work || occurrence == nil || occurrence.source == nil || issuer.call != occurrence.source.request.use || !sameOperationRequest(issuer.request, occurrence.source.request) {
		return false
	}
	algorithm := work.nativeEffectsInputSource(occurrence.source)
	if algorithm == nil || !work.nativeEffectsInputUnprovided(occurrence.source) || !stagedNativeInputEligible(algorithm.input.input.expression, issuer.fact, issuer.owner) || !work.admitNativeEffectsSourceGet(facts, occurrence, issuer) {
		return false
	}
	if issuer.task.index == 0 {
		if !work.registerOperationUse(facts, sourceStagedOperationUse{request: issuer.request}) {
			return false
		}
	} else if _, adopted := work.requireOperation(facts, issuer.request); !adopted {
		return false
	}
	root := work.operationIDs[issuer.request.producer]
	get := work.operationIDs[nativeRootDebtRequest(occurrence.source, "callee-get").producer]
	work.attachNativeEffectsDependencies(facts, root)
	work.attachNativeEffectsDependencies(facts, get)
	// Claim the actual queued root bootstrap before yielding. Its canonical
	// child path must establish an encountered pending child's factories and
	// runnable Get owner before an older physical-C refresh can be dispatched.
	for i := work.extractionHead; i < len(work.extractionQueue); i++ {
		task := work.extractionQueue[i]
		if task.operation == root && !task.operationDone && !task.delivery && task.nativeInputRevision == 0 && task.nativeTargetRevision == 0 {
			if task.callable != issuer.caller || work.nativeEffectsTaskSource(root) == nil || !work.nativeEffectsGetCurrent(occurrence.source) {
				return false
			}
			work.extractionQueue[i].operationDone = true
			work.extractOperation(facts, task, issuer.owner)
			break
		}
	}
	if !work.nativeEffectsTaskOwned(root) || !work.nativeEffectsTaskOwned(get) {
		return false
	}
	current := work.nativeEffectsInputSource(work.operationRecipes[issuer.request.producer].nativeGet)
	if current == nil || !validStagedNativeInputSource(current) {
		return false
	}
	child := work.operationRecipes[current.inputSource.producer].nativeGet
	if child == nil {
		return false
	}
	for _, request := range []sourceStagedOperationRequest{child.request, nativeRootDebtRequest(child, "callee-get")} {
		id := work.operationIDs[request.producer]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid || !work.operations[id.index].dependenciesRegistered {
			return false
		}
	}
	if work.nativeEffectsGetCurrent(child) {
		return true
	}
	childGet := work.operationIDs[nativeRootDebtRequest(child, "callee-get").producer]
	if !work.nativeEffectsTaskOwned(childGet) {
		return false
	}
	for _, association := range work.operationRecipes[work.operations[childGet.index].key].nativeGet.observerInputs {
		owner, owned := work.nativeEffectsObserverOwner(association.request, association)
		if !owned || owner != childGet {
			return false
		}
	}
	return true
}
