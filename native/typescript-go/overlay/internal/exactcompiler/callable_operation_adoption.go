package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// operationSourceRequirementsReady checks accepted source contributions before
// an ordinary consumer displaces legacy ownership. Admission of a supported
// pending typed source does not supply extraction or publication. The live caller may lend
// freshly observed local roles, including a self-cycle. All other semantic
// producers need their current typed source dispositions and required children.
// A selected external module initializer
// may remain explicitly unbound until project merge, without completing output.
// Pure member transport may be followed
// only after its original source owner published in this graph. No operation
// IDs, subscribers, binders or callbacks are retained or created here.
func (work *callableEffectWork) operationSourceRequirementsReady(required []sourceStagedOperationRequest, local func(sourceStagedOperationKey) (ready, owned bool)) bool {
	if work.operationGeneration == nil || local == nil {
		return false
	}
	current := work.operationDependencyReadiness(true)
	ids := make(map[sourceStagedOperationKey]int)
	var ready []bool
	var parents [][]int
	var visit func(sourceStagedOperationRequest) (int, bool)
	visit = func(request sourceStagedOperationRequest) (int, bool) {
		recipe, present := work.operationRecipes[request.producer]
		if !present || !validOperationEnvelope(recipe) || !work.sameAdoptionSourceRequest(recipe, request) || !work.acceptedGetPreparationSourceReading(request) && (standardMemberCallReadingShape(recipe, request) && !work.acceptedStandardMemberCallReading(request) || nativeInputInvocationReadingShape(recipe, request) && !work.describedNativeInputInvocationReading(request)) {
			return 0, false
		}
		if recipe.moduleArgument != nil && !work.validModuleArgumentReading(recipe, request) {
			return 0, false
		}
		if recipe.nativeGet != nil && recipe.nativeGet.inputInvocation != nil && !work.nativeInputInvocationCurrent(recipe) && !work.requestedWriterSourceSupported(recipe) {
			return 0, false
		}
		if index, seen := ids[request.producer]; seen {
			return index, true
		}
		index := len(ready)
		ids[request.producer] = index
		ready = append(ready, false)
		parents = append(parents, nil)
		accepted, owned := local(request.producer)
		if !owned {
			if id, adopted := work.operationIDs[request.producer]; adopted && id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(current) && current[id.index] {
				// This producer already satisfied its typed receipts and every
				// exact delivered child. Do not reinterpret that closed subtree.
				ready[index] = true
				return index, true
			} else {
				accepted = work.moduleArgumentTaskOwned(recipe) || work.passiveStagedWriterSourceSupported(recipe) || work.passiveStagedDeclarationResultSupported(recipe) || work.passiveConstructedSourceSupported(recipe) || work.passiveDeclarationCallEffectsReady(recipe) || work.passiveMemberSourceReady(recipe) || work.passiveAssignmentSourceReady(recipe) || work.passiveConstructionEffectsReady(recipe) || work.passiveEntryLawReady(recipe) || work.passiveStagedNativeResultReady(recipe) || work.passiveNativePrimitiveResultReady(recipe) || work.passiveStagedConstructedCallResultReady(recipe) || work.nativeInputInvocationCurrent(recipe) || work.requestedWriterSourceSupported(recipe)
			}
		}
		// Typed predicates validate the current local disposition. Some sealed
		// source recipes intentionally remain unextracted after publication.
		ready[index] = accepted
		required := operationRecipeEffectRequirements(recipe)
		if source := recipe.memberSource; source != nil && source.moduleExcluded != nil {
			required = append(append([]sourceStagedOperationRequest(nil), required...), source.moduleExcluded.required...)
		}
		for _, child := range required {
			childIndex, valid := visit(child)
			if !valid {
				ready[index] = false
				continue
			}
			parents[childIndex] = append(parents[childIndex], index)
		}
		return index, true
	}
	var roots []int
	for _, request := range required {
		index, valid := visit(request)
		if !valid {
			return false
		}
		roots = append(roots, index)
	}
	closed := closeOperationConjunction(ready, parents)
	for _, index := range roots {
		if !closed[index] {
			return false
		}
	}
	return true
}

// Passive member records are transport, never substitute semantic producers.
// Their source interval must have been reissued in this exact work graph.
func (work *callableEffectWork) passiveMemberSourceReady(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return validStagedGetPreparationRecipe(recipe) && recipe.memberSource.generation == work.operationGeneration
	}

	source := recipe.memberSource
	if source == nil || source.generation != work.operationGeneration {
		return false
	}
	if source.globalWrite != nil {
		return validStagedGlobalWriteRecipe(recipe) && work.memberCoverageObserved[recipe.key] == work.operationGeneration
	}
	if source.hasFreshTarget != nil {
		return validHasFreshTargetRecipe(recipe)
	}
	if source.targetSource != nil {
		return validStagedReflectiveTargetRecipe(recipe)
	}
	if source.moduleExcluded != nil {
		return work.passiveModuleWriterExclusionReady(recipe)
	}
	if source.call != nil && source.call.sourceRequest != nil {
		return work.requestedMemberCallSupported(recipe)
	}
	if source.call != nil && len(source.call.standard) != 0 {
		if !validStagedMemberCallRecipe(recipe) {
			return false
		}
		for _, branch := range source.call.standard {
			if !work.passiveConstructedSourceSupported(work.operationRecipes[branch.request.producer]) {
				return false
			}
		}
		return true // Admission retains pending method and independent source work.
	}
	if !recipe.delta.extracted {
		return work.passiveStagedMemberContextSupported(recipe)
	}
	// The original property Get owner issued this local Effects contribution.
	// Admission still follows all retained C children and grants no Call/output.
	if source.getEffects != nil && source.getEffects.descriptor != nil {
		return work.descriptorRecordGetCurrent(recipe)
	}
	if source.getEffects != nil && ast.IsPropertyAccessExpression(source.parent.producer.operation) {
		return validStagedMemberGetEffectsRecipe(recipe) && len(recipe.delta.required) != 0 && work.memberCoverageObserved[recipe.key] == work.operationGeneration
	}
	if coverage := source.coverage; coverage != nil {
		return work.memberCoverageObserved[recipe.key] == work.operationGeneration
	}
	if source.candidate.runtimeUnknown && source.extraction != nil && source.extraction.generation == work.operationGeneration {
		parent := stagedMemberCoverageRequest(source.parent, source.candidate.origin, source.candidate.cut)
		return work.memberCoverageObserved[parent.producer] == work.operationGeneration
	}
	if protocol := source.protocolSource; protocol != nil {
		if protocol.get != nil && !sameOperationRequest(source.parent, source.request) {
			return work.memberCoverageObserved[recipe.key] == work.operationGeneration && work.passiveStagedMemberContextSupported(recipe)
		}
		if protocol.get != nil || protocol.external != nil {
			return work.memberCoverageObserved[recipe.key] == work.operationGeneration
		}
		if source.extraction == nil || source.extraction.generation != work.operationGeneration || protocol.evaluation != nil {
			return false
		}
		parent := stagedMemberCoverageRequest(source.parent, source.candidate.origin, source.candidate.cut)
		return work.memberCoverageObserved[parent.producer] == work.operationGeneration
	}
	return false
}

func (work *callableEffectWork) sameAdoptionSourceRequest(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	return sameAdoptionSourceRequest(recipe, request) || work.validHasFreshTargetReading(recipe, request) || recipe.key == request.producer && work.acceptedGetPreparationSourceReading(request)
}
func sameAdoptionSourceRequest(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	if recipe.installedCall != nil {
		return validInstalledCallPhase(recipe) && sameOperationRequest(recipe.installedCall.request, request)
	}
	if recipe.installedMember != nil {
		return validInstalledMemberReading(recipe, request)
	}
	if recipe.moduleArgument != nil {
		return sameOperationRequest(recipe.moduleArgument.request, request) || request.producer == recipe.moduleArgument.request.producer && request.reading != (sourceStagedOperationKey{})
	}
	if recipe.writer != nil {
		return validStagedWriterRecipe(recipe) && sameOperationRequest(recipe.writer.request, request)
	}
	if recipe.constructed != nil {
		return validConstructedBaseRequest(recipe, request)
	}
	if recipe.declarationCall != nil {
		return sameOperationRequest(request, stagedDeclarationCallEffectsRequest(recipe.key.operation, recipe.key.declaration))
	}
	if source := recipe.entryLaw; source != nil {
		return sameOperationRequest(source.request, request)
	}
	if source := recipe.constructionEffects; source != nil {
		return sameOperationRequest(source.request, request)
	}
	if source := recipe.assignment; source != nil {
		return sameOperationRequest(source.request, request)
	}
	if source := recipe.memberSource; source != nil {
		return sameOperationRequest(source.request, request) || standardMemberCallReadingShape(recipe, request)
	}
	if source := recipe.nativeGet; source != nil {
		return validNativeGetRequest(recipe, request) || nativeInputInvocationReadingShape(recipe, request)
	}
	if source := recipe.callResult; source != nil {
		return acceptedStagedCallResultRequest(source, request)
	}
	return false
}
