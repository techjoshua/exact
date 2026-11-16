package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// prepareStagedDeclarationProtocolSource requests a supported original lexical
// Call's Effects from an adopted protocol task. The caller's source description
// is distinct from this Get/Set's observation cut. Registration grants neither
// a reached Call nor inputs: the existing canonical edge and body revision still
// gate the declaration-Call producer. Pure protocol indexing never enters here.
func (work *callableEffectWork) prepareStagedDeclarationProtocolSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || owner.values.program == nil || owner.values.checker != owner.checker || owner.values.generation == nil || owner.values.generation != work.operationGeneration || owner.project == nil || owner.project.activeGeneration != work.operationGeneration || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	source := recipe.memberSource
	if state.invalid || !state.dependenciesRegistered || work.operationIDs[state.key] != id || !validStagedMemberRecipe(recipe) || source == nil || source.generation != work.operationGeneration || source.writeEffects || source.coverage != nil || source.call != nil || source.getEffects != nil || source.targetSource != nil || source.moduleExcluded != nil || source.protocolSource != nil || source.extraction == nil || !source.candidate.protocol || source.candidate.reflective || source.candidate.runtimeUnknown || source.candidate.invoking || source.candidate.getContribution {
		return false
	}
	candidate := source.candidate
	call := candidate.operation
	if call == nil || !ast.IsCallExpression(call) || !ast.IsIdentifier(call.Expression()) || !sameOperationRequest(candidate.request, source.parent) || !sameOperationRequest(source.request, stagedMemberCandidateRequest(source.parent, candidate)) || source.extraction.generation != work.operationGeneration || !sameOperationRequest(source.extraction.request, source.parent) || source.extraction.cut != candidate.cut {
		return false
	}
	if _, issued := work.memberProtocolSources[call]; issued {
		return false
	} // Existing owners retain their original protocol family.
	region := sourceStagedEvaluationOwner(call)
	if region != candidate.region {
		return false
	}
	if region == nil {
		region = sourceStagedModuleOwner(call)
	}
	caller, known := work.memberNodes[region]
	if !known || caller < 0 || caller >= len(facts) || facts[caller].node != region || facts[caller].normalInputs != nil {
		return false
	}
	file := ast.GetSourceFileOfNode(call)
	publisher := owner.pendingMemberPublishers[region]
	if file == nil || file.IsDeclarationFile || facts[caller].sourceFile != file || owner.values.program.GetSourceFile(file.FileName()) != file || publisher == nil || !publisher.live || publisher.fact != &facts[caller] {
		return false
	}
	index := owner.values.index(file)
	occurrence := index.normalOccurrences[call]
	if index.incomplete || index.normalDynamicScope || occurrence == nil || occurrence.node != call || occurrence.region != candidate.region {
		return false
	}
	// This existing owner validates the immutable callee and original actuals.
	// Its source tag follows registration; description admission cannot demand
	// canonical closure while synchronous indexing attaches waiting readers.
	request, registered := work.registerStagedDeclarationCallEffects(facts, caller, call, owner)
	return registered && sameOperationRequest(request, stagedDeclarationCallEffectsRequest(call, region))
}
