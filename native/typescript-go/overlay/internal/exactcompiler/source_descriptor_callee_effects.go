package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceEffectsObserver is one stack-local original publisher observer. Body
// callbacks retain their existing semantics; only the exact live native-callee
// event can account integrity metadata through its already-owned Get request.
// Neither callback nor event enters prepared selections, facts or graph clones.
type sourceEffectsObserver struct {
	issuer *sourceValueQuery
	body   func(sourceBodyEffectsObservation)
	callee func(*sourceCalleeEffectsObservation) bool
}

// sourceCalleeEffectsObservation is valid only during its issuing callback.
// The live query keeps the exact event pointer; copies carry no admission right.
type sourceCalleeEffectsObservation struct {
	issuer                 *sourceValueQuery
	get                    *sourceGetInputs
	selected               sourceValue
	result                 *accessorCandidates
	call, member, consumer *ast.Node
	generation             *projectGeneration
	cut                    sourceRelativeCut
	key                    string
}

// accountSourceCalleeComponents runs at the actual completed native-member Get,
// before the enclosing Call evaluates arguments. Accounting consumes only this
// local acquisition's integrity metadata, never its donors, flags or values.
// Ordinary/normal queries and publishers without this observer are unchanged.
func (q *sourceValueQuery) accountSourceCalleeComponents(get *sourceGetInputs, selected sourceValue, key string, result *accessorCandidates) {
	if q.sourceEffects.callee == nil || q.sourceEffects.issuer != q || !q.dependenciesOnly || q.operation != nil || q.inputs != nil || q.owner == nil || get == nil || result == nil {
		return
	}
	call := q.initializing
	// The ordinary SOURCE invocation lends this exact original Call binding.
	if call == nil || !ast.IsCallExpression(call) || q.normalBindingCall != call || !q.active[call] || q.reading != call {
		return
	}
	member := unwrapSourceCallableReference(call.Expression())
	receiver, field := accessorReceiver(member)
	if q.protectedMember != member || receiver == nil || field == "" || key != field || get.operation != q.reading || get.receiver.native == nil || get.receiver.native.acquired != receiver {
		return
	}
	observation := sourceCalleeEffectsObservation{issuer: q, get: get, selected: selected, result: result, call: call, member: member, consumer: q.effectOwner, generation: q.owner.generation, cut: q.relativeInputCut(call), key: key}
	prior := q.sourceEffectsEvent
	q.sourceEffectsEvent = &observation
	defer func() {
		if q.sourceEffectsEvent == &observation {
			q.sourceEffectsEvent = prior
		}
		observation.issuer = nil
		observation.get = nil
		observation.result = nil
		observation.selected = sourceValue{}
	}()
	if q.sourceEffects.callee(&observation) && q.sourceEffectsEvent == &observation && observation.issuer == q && observation.get == get && observation.result == result {
		// These descriptors describe integrity/NoWrites premises of this exact
		// callee Get, not executed Effects. Its independently required source Get
		// retains that ownership; no verdict, normal descriptor or NoUser follows.
		// Argument metadata is acquired only after this callback and stays separate.
		result.nativeDescriptorEffects = nil
	}
}

// descriptorCalleeObservationContextMatches checks the original event context.
// Description equality is not admission: the consumer also requires the exact
// active callback pointer. It deliberately permits integrity Top: that verdict grants no
// absence-of-user-code premise and is independent from finite Get Effects.
func descriptorCalleeObservationContextMatches(source *sourceStagedNativeGetSource, proof *sourceStagedNativeCalleeEffects, o *sourceCalleeEffectsObservation) bool {
	if source == nil || proof == nil || o == nil || o.issuer == nil || o.get == nil || o.result == nil || o.generation == nil {
		return false
	}
	q := o.issuer
	current := q.sourceEffectsEvent
	if current == nil || current.issuer != q || current.get != o.get || current.result != o.result || q.sourceEffects.issuer != q || q.owner == nil || q.inputs != nil || q.operation != nil || !q.dependenciesOnly {
		return false
	}
	call := source.request.producer.operation
	if call == nil || !ast.IsCallExpression(call) {
		return false
	}
	if o.call != call || o.member != source.get || o.member != call.Expression() || o.consumer != source.request.consumer || o.consumer != q.effectOwner || q.normalBindingCall != call || o.generation != q.owner.generation || o.generation != proof.generation || q.protectedMember != o.member || q.initializing != call || q.reading != call || !q.active[call] || o.cut != proof.cut || q.relativeInputCut(call) != o.cut || o.get.operation != proof.cut.reading {
		return false
	}
	if o.selected.node != source.method || o.selected.native == nil || o.selected.native.kind != source.kind || o.selected.native.referencesIncomplete || len(o.selected.path) != 0 || !validStagedNativeCalleeEffects(*proof, source) {
		return false
	}
	receiver, key := accessorReceiver(source.get)
	if receiver == nil || key == "" || key != o.key || o.get.receiver.native == nil || o.get.receiver.native.acquired != receiver || o.selected.native.acquired != receiver {
		return false
	}
	if !stagedNativeCalleeEffectsRepresented(o.selected, o.result) {
		return false
	}
	// This conservative rejection is additional to the actual event/cut/owner
	// correspondence above. A matching kind/acquired pair alone never accounts a
	// component from another Get, an argument or a later reader.
	memberKind := standardNativeDataSlot(o.get.receiver, o.key)
	if memberKind == 0 {
		return false
	}
	for _, component := range o.result.nativeDescriptorEffects {
		if component.acquired != receiver || component.kind != sourceStandardObjectEntry && component.kind != memberKind {
			return false
		}
	}
	return true
}

// descriptorCalleeComponentsOwned associates a fresh original acquisition only
// with this graph's existing descriptor algorithm and callee-Get requirement.
// The outer required graph still owns closure/APPLIED, authored alternatives,
// argument work, conversion/Throw and every later field/body contribution.
func (work *callableEffectWork) descriptorCalleeComponentsOwned(facts []callableFacts, owner *executableBodyOwner, recipe sourceStagedOperationRecipe, o *sourceCalleeEffectsObservation) bool {
	if o == nil || o.issuer == nil || o.issuer.sourceEffectsEvent != o || owner == nil || owner.values == nil || owner.project == nil || owner.project.activeGeneration != work.operationGeneration || owner.values.generation != work.operationGeneration {
		return false
	}
	q := o.issuer
	if q.executable != owner || q.owner == nil || q.owner.program != owner.values.program || q.owner.checker != owner.checker || q.owner.generation != work.operationGeneration {
		return false
	}
	current, registered := work.operationRecipes[recipe.key]
	source := current.nativeGet
	if !registered || !validDescriptorEffectsPhase(current) || source == nil || source.kind != sourceNativeObjectGetOwnPropertyDescriptor || current.key != nativeRootDebtRequest(source, "algorithm").producer || !sameNativeGetSource(recipe.nativeGet, source) {
		return false
	}
	caller, owned := work.memberNodes[current.key.declaration]
	publisher := owner.pendingMemberPublishers[current.key.declaration]
	if !owned || caller < 0 || caller >= len(facts) || caller >= len(work.operationFacts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || publisher.fact != &work.operationFacts[caller] || facts[caller].normalInputs != nil || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	// The original caller already checked nativeEffectsGetCurrent before the
	// once traversal. This callback associates ownership; it does not add a
	// second closure/currentness gate while source dependencies are arriving.
	// The unchanged outer graph still rechecks the required Get and APPLIED.
	proof := work.currentNativeCalleeEffects(source)
	if proof == nil || len(current.delta.required) == 0 || !sameOperationRequest(current.delta.required[0], proof.request) {
		return false
	}
	return descriptorCalleeObservationContextMatches(source, proof, o)
}
