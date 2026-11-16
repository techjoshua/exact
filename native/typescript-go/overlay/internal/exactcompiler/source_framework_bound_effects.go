package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// frameworkInputConsumerCovered describes a migrated use, not its actual input
// disposition. The original source Call below must separately publish bound MAY
// Effects. Current recipes, not the spelling of a parameter use, own this domain.
func (work *callableEffectWork) frameworkInputConsumerCovered(fact *callableFacts, call, argument *ast.Node) bool {
	if fact == nil || call == nil || !ast.IsCallExpression(call) || argument == nil {
		return false
	}
	recipe := work.operationRecipes[stagedFrameworkEffectsRequest(call, fact.node).producer]
	return validStagedFrameworkEffectsRecipe(recipe) && recipe.frameworkEffects.generation == work.operationGeneration && recipe.frameworkEffects.argument == argument
}

// publishFrameworkBoundInputEffects is the original source-input consumer for
// a body whose input uses are all already owned, including the new framework
// view contract. It runs the maintained per-call MAY publisher under the real
// binder/default/creator chain. No sourceInputs becomes delivered B; no query,
// input frame, selected value or invocation receipt survives the call.
// Transitive forwarding uses the ordinary Effects consumer, which has no
// sourceReturn/view demand. Its library call therefore cannot recurse into DATA.
func (work *callableEffectWork) publishFrameworkBoundInputEffects(facts []callableFacts, caller int, call sourceStagedDeclarationCall, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || owner.project == nil || owner.project.activeGeneration != work.operationGeneration || owner.values.generation != work.operationGeneration || caller < 0 || caller >= len(facts) || facts[caller].normalInputs != nil || call.sourceInputs == nil || call.inputs != nil || call.legacyInputs || call.inputConsumerWait != nil || !validStagedDataResultCall(call) || !sameSourceRelativeInvocation(call.sourceInputs.invocation, call.invocation) || !sameSourceRelativeInputEnvelope(call.invocation, call.sourceInputs.bindings) {
		return false
	}
	publisher := owner.pendingMemberPublishers[facts[caller].node]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	// Unknown/pending source packets cannot be reclassified as permitted runtime
	// alternatives. A symbolic formal role is retained by its own source relation.
	for _, binding := range call.sourceInputs.bindings.bindings {
		if binding.unknown || len(binding.pending) != 0 {
			return false
		}
	}
	// The source-call collector owns the real edge/input association, but it
	// does not register this separate Effects recipe. Ask the original source
	// registrar before requiring its current description; it preserves all
	// eager argument debts and grants no reached Call or normal input result.
	request, registered := work.registerStagedDeclarationCallEffects(facts, caller, call.invocation.operation, owner)
	if !registered {
		return false
	}
	recipe := work.operationRecipes[request.producer]
	actual, original := work.currentDeclarationCallEffects(recipe)
	if !original || actual.sourceInputs != call.sourceInputs || !sameSourceRelativeInvocation(actual.invocation, call.invocation) {
		return false
	}
	id, adopted := work.requireOperation(facts, request)
	if !adopted {
		return false
	}
	state := &work.operations[id.index]
	if state.frameworkInputsRequested {
		return state.frameworkInputsComplete
	}
	if state.writerSourceRunning {
		return false
	}
	state.writerSourceRunning = true
	defer func() { work.operations[id.index].writerSourceRunning = false }()
	accounting := frameworkSourceBodyAccounting{consumer: facts[caller].node, operation: call.invocation.operation, declaration: call.invocation.declaration, generation: work.operationGeneration}
	candidates := appendArgumentAccessorEffectsWithBodyEffects(&facts[caller], call.invocation.operation, work.memberNodes, facts[caller].sourceFile, owner.checker, owner, nil, accounting.observe)
	// Set once even on refusal. Unfinished compiler work stays pending instead of
	// being reacquired repeatedly or paid by the separate runtime MAY residual.
	work.operations[id.index].frameworkInputsRequested = true
	bodies, represented := work.requireFrameworkEffectsBodies(facts, recipe, candidates)
	work.operations[id.index].frameworkInputActivations = bodies
	complete := represented && accounting.represented(candidates, &facts[caller]) && !frameworkEffectsCompilerPendingWithoutSourceBodies(candidates)
	work.operations[id.index].frameworkInputsComplete = complete
	return complete
}
