package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// nativeScopeRootRequest identifies an issued SOURCE role, not its population
// or currentness. Authored/unknown refinements must keep this role pending rather
// than making its Get lose the requirement or silently revert to one-shot work.
func nativeScopeRootRequest(parent, root sourceStagedOperationRequest) bool {
	call := root.producer.operation
	if call == nil || !ast.IsCallExpression(call) || call == parent.producer.operation || root.producer.kind != relativeDemandEffects || root.producer.declaration != parent.consumer || root.consumer != parent.consumer || root.producer.selector.occurrence != call.Expression() || root.producer.selector.association != nil || root.reading != (sourceStagedOperationKey{}) || root.inputs != nil {
		return false
	}
	if root.producer.selector.field == "callee-alternatives" {
		return true
	}
	native := root.producer.selector.field == "native-input-source-request" || root.producer.selector.field == "descriptor-callee-source-request"
	return native && ast.IsPropertyAccessExpression(call.Expression()) && root.use == call && root.cut == (sourceRelativeCut{operation: call, use: call, reading: call}) && root.edge != ""
}

// nativeScopeRootDeclared retains the actual child factory/subscriber without
// requiring a native-only population. Its authored/unknown alternatives remain
// explicit unpaid obligations and cannot disappear from the parent readset.
func (work *callableEffectWork) nativeScopeRootDeclared(root, parent sourceStagedOperationRequest) bool {
	if !nativeScopeRootRequest(parent, root) {
		return false
	}
	recipe := work.operationRecipes[root.producer]
	if !validStagedMemberCallRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || !sameOperationRequest(recipe.memberSource.request, root) {
		return false
	}
	id := work.operationIDs[root.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{root.consumer, root.edge}]
	return !state.invalid && state.dependenciesRegistered && sub != nil && !sub.blocked && sameOperationRequest(sub.request, root)
}
func (work *callableEffectWork) nativeScopeGetRequested(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	source := recipe.nativeGet
	if source == nil || recipe.key != nativeRootDebtRequest(source, "callee-get").producer {
		return false
	}
	for _, root := range source.selectionRequired {
		if nativeScopeRootRequest(source.request, root) {
			return true
		}
	}
	return len(work.nativeProjectionGetDemands(source)) != 0
}

// nativeScopeGetSource authenticates the existing Get and each declared SOURCE
// child. Recognition schedules compiler work only; no source population, native
// method, input, whole Call or normal-result authority follows from the role.
func (work *callableEffectWork) nativeScopeGetSource(id sourceStagedOperationID) *sourceStagedNativeGetSource {
	if !work.nativeScopeGetRequested(id) || work.operationGeneration == nil || !work.operationGeneration.active {
		return nil
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	source := recipe.nativeGet
	parent := work.operationRecipes[source.request.producer]
	if state.invalid || !state.dependenciesRegistered || !validNativeGetRecipe(recipe) || !validNativeGetRecipe(parent) || !sameNativeGetSource(source, parent.nativeGet) {
		return nil
	}
	for _, root := range source.selectionRequired {
		if !nativeScopeRootRequest(source.request, root) {
			continue
		}
		if !work.nativeScopeRootDeclared(root, source.request) || !operationContainsRequest(recipe.delta.required, root) {
			return nil
		}
	}
	return source
}
func (work *callableEffectWork) nativeScopeGetTaskSource(id sourceStagedOperationID) *sourceStagedNativeGetSource {
	source := work.nativeScopeGetSource(id)
	if source == nil || work.operationRecipes[source.request.producer].nativeGet.effectsSource != nil {
		return nil
	}
	return source // Ordinary Effects Get/root dispatch retains its original owner.
}
func (work *callableEffectWork) nativeScopeRootCurrent(root sourceStagedOperationRequest) bool {
	recipe := work.operationRecipes[root.producer]
	if !work.writerSourceLocallyReady(recipe) {
		return false
	}
	id := work.operationIDs[root.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{root.consumer, root.edge}]
	return !state.invalid && state.delta.extracted && state.revision != 0 && sub != nil && !sub.blocked && sameOperationRequest(sub.request, root) && sub.consumed == state.revision && sub.applied == state.revision
}

// sourceStagedNativeScopeObservation is graph-local evidence from a successful
// original Get. It stores detached requests and semantic revisions only. A task
// wake/ACK never creates it, and its immutable vector is never refreshed in place.
type sourceStagedNativeScopeObservation struct {
	self             *sourceStagedNativeScopeObservation
	id               sourceStagedOperationID
	semanticRevision uint64
	request          sourceStagedOperationRequest
	cut              sourceRelativeCut
	method           *ast.Node
	generation       *projectGeneration
	required         []sourceStagedOperationRequest
	revisions        []uint64
}

func (work *callableEffectWork) nativeScopeObservedCurrent(id sourceStagedOperationID, observation *sourceStagedNativeScopeObservation) bool {
	source := work.nativeScopeGetSource(id)
	if source == nil || observation == nil || observation.self != observation || observation.id != id || observation.generation != work.operationGeneration {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	callee := work.currentNativeCalleeEffects(source)
	if state.nativeScopeObserved != observation || state.revision == 0 || observation.semanticRevision != state.revision || !state.delta.extracted || callee == nil || callee.cut != observation.cut || callee.method != observation.method || !sameOperationRequest(observation.request, nativeRootDebtRequest(source, "callee-get")) || !operationPrefix(observation.required, recipe.delta.required, sameOperationRequest) || !operationPrefix(recipe.delta.required, observation.required, sameOperationRequest) || !slices.Equal(observation.revisions, work.sourceObservationRevisions(id)) {
		return false
	}
	for _, root := range source.selectionRequired {
		if nativeScopeRootRequest(source.request, root) && !work.nativeScopeRootCurrent(root) {
			return false
		}
	}
	return true
}
func (work *callableEffectWork) nativeScopeGetCurrent(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	return work.nativeScopeObservedCurrent(id, work.operations[id.index].nativeScopeObserved)
}

// admitNativeScopeGet is called only by the same original finishing publisher,
// after its existing all-MAY/Get proof. Effects-owned parents retain their old
// admission path. This is a Get observation, never an Effects root or input law.
func (work *callableEffectWork) admitNativeScopeGet(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, source *sourceStagedNativeGetSource, proof *sourceStagedNativeCalleeEffects) bool {
	if work == nil || q == nil || q.executable == nil || q.executable.values == nil || q.executable.project == nil || q.executable.project.activeGeneration != work.operationGeneration || q.owner == nil || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker || q.owner.checker != q.executable.values.checker {
		return false
	}
	n := q.stagedNativeGet
	if n == nil || n.issuer != q || n.sourceWork != work || n.sourceEpoch != work.operationEpoch || n.owner != q.owner || n.generation != work.operationGeneration || !n.finishing || !n.sourceObserved || n.observedGet != get || n.observedCallee != proof || get == nil || get.operation != q.reading || q.initializing != n.call || source == nil || !sameOperationRequest(source.request, n.getRequest) || proof == nil || proof.generation != work.operationGeneration || !validStagedNativeCalleeEffects(*proof, source) || proof.cut != q.relativeInputCut(n.call) {
		return false
	}
	id := work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
	selected := work.nativeScopeGetTaskSource(id)
	if selected == nil {
		return false
	}
	caller, known := work.memberNodes[selected.request.consumer]
	publisher := q.executable.pendingMemberPublishers[selected.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || caller >= len(work.operationFacts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || publisher.fact != &work.operationFacts[caller] || facts[caller].sourceFile == nil || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	for _, root := range selected.selectionRequired {
		if nativeScopeRootRequest(selected.request, root) && !work.nativeScopeRootCurrent(root) {
			return false
		}
	}
	// This is the genuine finishing proof, not a copied descriptor or an ACK.
	// The normal returned-occurrence wrapper may later repeat this idempotently.
	if !work.admitNativeCalleeEffects(facts, selected, *proof) {
		return false
	}
	work.attachSourceObservationDependencies(facts, id)
	revisions := work.sourceObservationRevisions(id)
	if revisions == nil {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if work.nativeScopeGetCurrent(id) {
		return true
	}
	observation := &sourceStagedNativeScopeObservation{id: id, semanticRevision: state.revision + 1, request: proof.request, cut: proof.cut, method: proof.method, generation: proof.generation, required: cloneOperationDelta(sourceStagedOperationDelta{required: recipe.delta.required}).required, revisions: append([]uint64(nil), revisions...)}
	observation.self = observation
	state.nativeScopeObserved = observation
	state.revision++
	work.notifyOperationSubscribers(state)
	return true
}
