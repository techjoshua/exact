package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// ordinaryConstructionLocallyCurrent separates a reached New's complete local
// source observation from closure of its retained Effects. It permits only the
// ordinary collector's existing Effects use; no result or constructor rights
// leave this predicate. Required producers still gate graph publication.
func (work *callableEffectWork) ordinaryConstructionLocallyCurrent(facts []callableFacts, consumer int, root sourceStagedOperationRequest, owner *executableBodyOwner) bool {
	if consumer < 0 || consumer >= len(facts) || work.extracting != consumer || owner == nil || owner.values == nil || owner.project == nil || owner.checker != owner.values.checker || owner.values.program == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || root.consumer != facts[consumer].node || root.use == nil || !ast.IsNewExpression(root.use) || facts[consumer].normalInputs != nil {
		return false
	}
	publisher := owner.pendingMemberPublishers[root.consumer]
	if publisher == nil || !publisher.live || publisher.fact != &facts[consumer] || facts[consumer].sourceFile == nil || owner.values.program.GetSourceFile(facts[consumer].sourceFile.FileName()) != facts[consumer].sourceFile || ast.GetSourceFileOfNode(root.use) != facts[consumer].sourceFile || !sourceStagedOccurrenceOwned(root.use, root.consumer) {
		return false
	}
	registered := work.operationRecipes[root.producer]
	if !validStagedConstructionEffectsRecipe(registered) || !sameOperationRequest(registered.constructionEffects.root, root) || !work.passiveConstructionEffectsReady(registered) {
		return false
	}
	// passiveConstructionEffectsReady authenticates the original observation's
	// issuer, cut, constructor/prototype and all four exact phase factories.
	// Adoption and APPLIED direct premises are separate graph obligations.
	requests := []sourceStagedOperationRequest{root}
	for _, phase := range stagedConstructionPhases {
		requests = append(requests, stagedConstructionRequest(root, phase))
	}
	for _, request := range requests {
		recipe := work.operationRecipes[request.producer]
		id := work.operationIDs[request.producer]
		if !validStagedConstructionEffectsRecipe(recipe) || !sameOperationRequest(recipe.constructionEffects.request, request) || !work.passiveConstructionEffectsReady(recipe) || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
		state := &work.operations[id.index]
		if state.key != recipe.key || state.invalid || !state.dependenciesRegistered || !state.delta.extracted || state.revision == 0 || !operationDeltaPrefix(state.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, state.delta) {
			return false
		}
		for _, required := range recipe.delta.required {
			found := false
			for _, dependency := range state.dependencies {
				if !sameOperationRequest(dependency.request, required) {
					continue
				}
				childID := dependency.producer
				if childID.epoch != work.operationEpoch || childID.index == 0 || int(childID.index) >= len(work.operations) {
					return false
				}
				child := &work.operations[childID.index]
				childRecipe := work.operationRecipes[required.producer]
				subscriber := child.subscribers[sourceStagedOperationConsumer{required.consumer, required.edge}]
				if child.key != required.producer || child.invalid || !child.dependenciesRegistered || !validOperationEnvelope(childRecipe) || !work.sameAdoptionSourceRequest(childRecipe, required) || child.revision == 0 || subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, required) || subscriber.applied != child.revision {
					return false
				}
				found = true
				break
			}
			if !found {
				return false
			}
		}
	}
	return true
}
