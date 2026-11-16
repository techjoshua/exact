package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceInstalledMemberNativePhase is lent only by the actual registered
// descriptor algorithm publisher. Nested source trap binders do not inherit
// its authority from a Call node, type, method spelling or detached recipe.
type sourceInstalledMemberNativePhase struct {
	mutationSource    func(*sourceValueQuery, *ast.Node) bool
	mutationGetInputs func(*sourceValueQuery, *sourceValueInputs, *sourceGetInputs) *sourceRelativeInputEdge
	mutationInputs    [2]sourceDescriptorInputData
	mutationCut       sourceRelativeCut
	mutationRHS       func(*sourceValueQuery, *ast.Node, *sourceValueInputs) bool // Original installed SOURCE body only.
	keyInput          *sourceDescriptorInputData                                  // Original APPLIED input, stack-only; no value or KEY identity.
	keyOwner          *sourceValueOwner
	keyCut            sourceRelativeCut
	issuer            *sourceValueQuery
	publisher         *sourcePendingMemberPublisher
	algorithm         sourceStagedOperationRequest
	source            *sourceStagedNativeGetSource
	generation        *projectGeneration
	live              bool
}

// beginInstalledDescriptorMemberPhases surrounds descriptorInvocationEffects,
// including its actual trap-return projection. The algorithm and selected arm
// already belong to the current work graph; this API does not observe a Get.
func (work *callableEffectWork) beginInstalledDescriptorMemberPhases(facts []callableFacts, q *sourceValueQuery, algorithm sourceStagedOperationRequest, source *sourceStagedNativeGetSource, selected sourceValue) (func(), bool) {
	if q == nil || q.owner == nil || q.owner.generation != work.operationGeneration || !q.dependenciesOnly || q.operation != nil || source == nil || !validDescriptorRetrieval(source) || source.descriptorRead.generation != work.operationGeneration || !sameOperationRequest(algorithm, nativeRootDebtRequest(source, "algorithm")) || selected.node != source.method || selected.native == nil || selected.native.kind != source.kind || selected.native.referencesIncomplete || len(selected.path) != 0 || q.effectOwner != algorithm.consumer || !q.installedMemberSourceOwned(source.request.producer.operation, algorithm.consumer) {
		return func() {}, false
	}
	recipe, registered := work.operationRecipes[algorithm.producer]
	consumer, known := work.memberNodes[algorithm.consumer]
	publisher := q.executable.pendingMemberPublishers[algorithm.consumer]
	if !registered || !known || consumer >= len(facts) || !validDescriptorEffectsPhase(recipe) || !sameNativeGetSource(recipe.nativeGet, source) || publisher == nil || !publisher.live || publisher.fact != &facts[consumer] || !work.nativeEffectsGetCurrent(source) {
		return func() {}, false
	}
	previous := q.installedMemberNativePhase
	lease := &sourceInstalledMemberNativePhase{issuer: q, publisher: publisher, algorithm: algorithm, source: source, generation: work.operationGeneration, live: true}
	// Only the owning work can pair the actual operand DATA with this selected
	// algorithm. A missing/unsupported key leaves the existing source coercion
	// path intact; it never prevents independent native field-phase ownership.
	if input, applied := work.descriptorPrimitiveKeyInput(recipe, source); applied {
		lease.keyInput, lease.keyOwner, lease.keyCut = &input, q.owner, q.relativeInputCut(source.request.producer.operation)
	}
	lease.mutationGetInputs = func(current *sourceValueQuery, inputs *sourceValueInputs, get *sourceGetInputs) *sourceRelativeInputEdge {
		return work.describeNativeGetterMutationInputs(facts, current, inputs, get)
	}
	lease.mutationRHS = func(current *sourceValueQuery, node *ast.Node, inputs *sourceValueInputs) bool {
		return work.publishDirectInstalledMutationRHS(facts, current, node, inputs)
	}
	for position := range lease.mutationInputs {
		input, _ := work.descriptorInputData(source.descriptorRead, position)
		lease.mutationInputs[position] = cloneDescriptorInputData(input)
	}
	lease.mutationCut = q.relativeInputCut(source.request.producer.operation)
	lease.mutationSource = func(current *sourceValueQuery, call *ast.Node) bool {
		return work.captureDescriptorMutationSource(facts, current, call)
	}
	q.installedMemberNativePhase = lease
	return func() {
		lease.live = false
		if q.installedMemberNativePhase == lease {
			q.installedMemberNativePhase = previous
		}
		lease.mutationGetInputs = nil
		lease.mutationRHS = nil
		lease.mutationSource = nil
		lease.mutationInputs = [2]sourceDescriptorInputData{}
		lease.mutationCut = sourceRelativeCut{}
		lease.issuer, lease.publisher, lease.source = nil, nil, nil
		lease.keyInput, lease.keyOwner = nil, nil
		lease.keyCut = sourceRelativeCut{}
	}, true
}

func (q *sourceValueQuery) installedDescriptorMemberPhaseOwned(parent sourceStagedOperationRequest, get *sourceGetInputs, cut *sourceMemberWriterReadCut, phase sourceInstalledMemberPhase, key string) bool {
	if q == nil {
		return false
	}
	b := q.installedMemberNativePhase
	if q == nil || b == nil || !b.live || b.issuer != q || b.source == nil || q.owner == nil || b.generation != q.owner.generation || !sameOperationRequest(parent, b.algorithm) || b.publisher == nil || !b.publisher.live || q.executable.pendingMemberPublishers[q.effectOwner] != b.publisher || q.inputs == nil || q.inputs.invocation != b.source.request.producer.operation || q.returning == nil || !sourceStagedOccurrenceOwned(q.returning, q.inputs.declaration) || get == nil || cut == nil || get.operation != b.source.request.producer.operation || cut.operation != get.operation || cut.use != q.reading || get.propertyKey != key || !slices.Contains(reflectiveDescriptorKeys[:], key) || phase != installedMemberHas && phase != installedMemberAcquire || get.hasOnly != (phase == installedMemberHas) {
		return false
	}
	creator := q.creators[q.inputs.declaration]
	return creator.invocation == q.inputs.invocation && creator.returning == q.returning && q.installedMemberInputOwned(q.installedMemberInput)
}

func (q *sourceValueQuery) installedAuthoredMemberPhaseOwned(parent sourceStagedOperationRequest, get *sourceGetInputs, phase sourceInstalledMemberPhase, key string) bool {
	if get == nil || get.operation == nil || phase != installedMemberRead && phase != installedMemberAcquire || !sourceStagedOccurrenceOwned(get.operation, parent.producer.declaration) || !ast.IsPropertyAccessExpression(get.operation) && !ast.IsElementAccessExpression(get.operation) {
		return false
	}
	_, actual := accessorReceiver(get.operation)
	return actual == key && !get.hasOnly
}

// descriptorPrimitiveKeyAlternatives accounts only conditional primitive SOURCE
// branches. A known prefix cannot dispose mixed/unknown or creating input arms.
// This predicate supplies neither delivery/currentness nor a concrete key.
func descriptorPrimitiveKeyAlternatives(input sourceDescriptorInputData) bool {
	if len(input.alternatives) == 0 {
		return false
	}
	for _, alternative := range input.alternatives {
		if alternative.creating != nil || !validNativePrimitiveEndpoint(alternative.endpoint) {
			return false
		}
	}
	return true
}

// descriptorPrimitiveKeyInput reads only the original algorithm's actual DATA
// children. Currentness follows declared APPLIED primitive payloads without
// entering operation closure; the existing outer graph owns all full Effects.
func (work *callableEffectWork) descriptorPrimitiveKeyInput(recipe sourceStagedOperationRecipe, source *sourceStagedNativeGetSource) (sourceDescriptorInputData, bool) {
	if work == nil || source == nil || !validDescriptorRetrieval(source) || source.descriptorRead.generation != work.operationGeneration || recipe.key != nativeRootDebtRequest(source, "algorithm").producer || !validDescriptorEffectsPhase(recipe) || !sameNativeGetSource(recipe.nativeGet, source) {
		return sourceDescriptorInputData{}, false
	}
	registered, exists := work.operationRecipes[recipe.key]
	if !exists || !validDescriptorEffectsPhase(registered) || !sameNativeGetSource(registered.nativeGet, source) {
		return sourceDescriptorInputData{}, false
	}
	input, applied := work.descriptorInputData(source.descriptorRead, 1)
	if !applied || input.request.producer.operation == nil || !operationContainsRequest(recipe.delta.required, input.request) || !operationContainsRequest(registered.delta.required, input.request) || !work.descriptorInputSnapshotCurrent(source.descriptorRead, 1, input) || !descriptorPrimitiveKeyAlternatives(input) {
		return sourceDescriptorInputData{}, false
	}
	return input, true
}

// descriptorPrimitiveKeyOwned consumes only the snapshot lent by the SAME live
// selected algorithm. The expression is not recovered under later bindings.
// No query copy, dormant lease, normal frame or arbitrary key use may borrow it.
func (q *sourceValueQuery) descriptorPrimitiveKeyOwned(call *ast.Node) bool {
	if q == nil || call == nil || !ast.IsCallExpression(call) || q.installedMemberIssuer != q || !q.installedMemberSourceOwned(call, q.effectOwner) || q.owner == nil || q.executable == nil || q.executable.values == nil || q.executable.project == nil || q.inputs != nil || q.operation != nil || !q.dependenciesOnly || q.normalBindingCall != call || q.reading != call || q.returning != nil || q.invoking != nil || !q.active[call] {
		return false
	}
	b := q.installedMemberNativePhase
	// The exact initialization context is part of the captured keyCut below.
	if b == nil || !b.live || b.issuer != q || b.keyInput == nil || b.keyOwner != q.owner || !validDescriptorRetrieval(b.source) || b.publisher == nil || !b.publisher.live || b.publisher.workRegistrar == nil || q.executable.pendingMemberPublishers[q.effectOwner] != b.publisher || q.effectOwner != b.algorithm.consumer || b.generation == nil || b.generation != q.owner.generation || !b.generation.active || q.executable.project.activeGeneration != b.generation || q.executable.values.generation != b.generation || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker || b.source.request.producer.operation != call || !sameOperationRequest(b.algorithm, nativeRootDebtRequest(b.source, "algorithm")) || q.relativeInputCut(call) != b.keyCut {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	return len(actuals) == 2 && actuals[1] == b.source.descriptorRead.actuals[1].expression && validDescriptorInputData(b.source.descriptorRead, 1, *b.keyInput) && descriptorPrimitiveKeyAlternatives(*b.keyInput)
}
