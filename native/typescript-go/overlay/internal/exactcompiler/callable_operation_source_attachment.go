package exactcompiler

// attachOperationSource seals a monotone refinement from an authenticated source
// owner. The caller owns semantic admission. This shared lifecycle rule does not
// derive coverage from atoms or require an already adopted consumer. If adopted,
// all newly required memberships precede publication. A passive source remains
// unscheduled. Source descriptions and graph-local delivery remain separate.
func (work *callableEffectWork) attachOperationSource(facts []callableFacts, recipe sourceStagedOperationRecipe) bool {
	prior, exists := work.operationRecipes[recipe.key]
	if !exists || !sameFieldMutationData(prior.mutationData, recipe.mutationData) || !sameInstalledMutationRHS(prior.installedMutationRHS, recipe.installedMutationRHS) || !descriptorTargetRefinementAllowed(prior, recipe) || !sameInstalledCallPhase(prior.installedCall, recipe.installedCall) || !sameInstalledMemberApplication(prior.installedMember, recipe.installedMember) || !sameDescriptorSource(prior.descriptorSource, recipe.descriptorSource) || !sameFrameworkStorageView(prior.frameworkEffects, recipe.frameworkEffects) || !sameStagedModuleArgumentSource(prior.moduleArgument, recipe.moduleArgument) || !sameStagedEntryLawSource(prior.entryLaw, recipe.entryLaw) || !sameStagedAssignment(prior.assignment, recipe.assignment) || !sameStagedMapRecipeSource(prior, recipe) || !sameStagedCallResultSource(prior.callResult, recipe.callResult) || !sameStagedMemberSource(prior.memberSource, recipe.memberSource) || !validOperationEnvelope(recipe) || prior.getter != recipe.getter || prior.returning != recipe.returning || !sameNativeGetSource(prior.nativeGet, recipe.nativeGet) || !sameConstructedMemberSource(prior.constructed, recipe.constructed) || !operationPrefix(prior.fieldMutationLinks, recipe.fieldMutationLinks, sameOriginalGetMutationFieldLink) || prior.delta.extracted && !operationPrefix(recipe.fieldMutationLinks, prior.fieldMutationLinks, sameOriginalGetMutationFieldLink) || !operationDeltaPrefix(prior.delta, recipe.delta) || prior.delta.extracted && (!recipe.delta.extracted || !operationDeltaPrefix(recipe.delta, prior.delta)) {
		return false
	}
	if prior.nativeGet != nil && prior.nativeGet.effectsSource != nil && (recipe.nativeGet == nil || !sameNativeEffectsRequest(prior.nativeGet.effectsSource, recipe.nativeGet.effectsSource)) {
		return false
	}
	if !work.nativeWriterRefinementAllowed(prior, recipe) {
		return false
	}
	producer, owned := work.memberNodes[recipe.key.declaration]
	if !owned {
		return false
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	work.operationRecipes[recipe.key] = recipe
	for index := range facts[producer].staged.operationRecipes {
		if facts[producer].staged.operationRecipes[index].key == recipe.key {
			facts[producer].staged.operationRecipes[index] = recipe
			break
		}
	}
	work.indexNativeInstallation(recipe)
	if id, adopted := work.operationIDs[recipe.key]; adopted {
		state := &work.operations[id.index]
		state.dependenciesRegistered = false
		state.dependencies = nil
		work.registerOperationDependencies(facts, id)
		if recipe.memberSource != nil && recipe.memberSource.nativeWriter != nil {
			work.indexNativeWriterCapability(recipe.key)
		}
		if len(recipe.delta.required) > len(prior.delta.required) {
			work.extendNativeCapabilityDependents(recipe.key, recipe.delta.required[len(prior.delta.required):])
		}
		if work.nativeEffectsTaskSource(id) != nil {
			work.attachNativeEffectsDependencies(facts, id)
		}
		if recipe.nativeGet != nil && recipe.key == nativeRootDebtRequest(recipe.nativeGet, "callee-get").producer {
			// This is an unextracted blueprint, not a Get disposition. The
			// original finish publisher refreshes its strong or finite-Effects
			// receipt after these memberships exist. Publishing the blueprint
			// here would downgrade either already-observed receipt.
			return true
		}
		if recipe.mutationData != nil {
			work.attachSourceObservationDependencies(facts, id)
			if work.fieldMutationDataCurrent(recipe) && recipe.delta.extracted {
				work.publishOperation(id, recipe.delta)
			}
			return true
		} else if recipe.installedMutationRHS != nil {
			if work.installedMutationRHSCurrent(recipe) && recipe.delta.extracted {
				return work.publishOperation(id, recipe.delta)
			}
			return true
		}
		if recipe.memberSource != nil && recipe.memberSource.nativeFieldGet != nil {
			work.attachSourceObservationDependencies(facts, id)
			return true // Only delivered current Get provenance completes this reader.
		}
		if recipe.memberSource != nil && recipe.memberSource.reflectiveContribution != nil {
			// A cached description cannot issue an observation. Publication uses
			// only the current original reader stamp recorded by its issuer.
			if !recipe.delta.extracted || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
				return true
			}
			return work.publishReflectiveContribution(id)
		}
		if recipe.memberSource != nil && recipe.memberSource.descriptorStrong != nil {
			work.attachSourceObservationDependencies(facts, id)
			return true // Only the authenticated original strong Get publishes.
		}
		if recipe.descriptorTarget != nil {
			work.attachWriterSourceDependencies(facts, id)
			return true // Only the genuine observed target role publishes its disposition.
		}
		if recipe.descriptorSource != nil {
			work.attachSourceObservationDependencies(facts, id)
			return true // Only the original callee delivery can complete this role.
		}
		if work.frameworkGetResumptionSource(id) != nil {
			work.attachSourceObservationDependencies(facts, id)
			return true // Only a fresh queued original Get can publish observation.
		}
		if work.nativeEagerTaskSource(id) != nil {
			work.attachSourceObservationDependencies(facts, id)
			return true // The live eager dispatcher alone publishes extraction.
		}
		if validNativeEffectsRequest(recipe) {
			// The Effects request is a description, not an extraction event.
			// Its owning root task publishes the current disposition after all
			// newly attached dependencies above have been enrolled.
			return true
		}
		if source := recipe.memberSource; source != nil && source.getEffects != nil && !sameOperationRequest(source.getEffects.preparation, sourceStagedOperationRequest{}) {
			if preparation, known := work.operationIDs[source.getEffects.preparation.producer]; known && work.getPreparationTaskSource(preparation) != nil {
				work.attachSourceObservationDependencies(facts, preparation)
			}
		}
		if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
			work.attachSourceObservationDependencies(facts, id)
			return true
		}
		if recipe.memberSource != nil && recipe.memberSource.targetSource != nil {
			if work.memberCoverageObserved[recipe.key] != work.operationGeneration {
				return true
			}
			return work.publishOperation(id, recipe.delta)
		}
		if recipe.memberSource != nil && recipe.memberSource.nativeWriter != nil {
			work.publishNativeWriterCapability(id)
			return true
		}
		if recipe.memberSource != nil && recipe.memberSource.globalWrite != nil {
			// The live event owns extraction. Attaching its source-set description
			// must preserve that disposition and cannot publish a cached clone.
			if work.memberCoverageObserved[recipe.key] != work.operationGeneration {
				return true
			}
			return work.publishStagedGlobalWrite(id)
		}
		if recipe.entryLaw != nil {
			// Its immutable description stays unextracted. A current original
			// semantic observation publishes the separate graph disposition.
			work.publishEntryLawSource(id)
			return true
		}
		if recipe.memberSource != nil && recipe.memberSource.moduleExcluded != nil {
			return work.publishStagedModuleWriterExclusion(facts, id)
		}
		// Reflective root and eager-input owners extract the local graph separately
		// from their blueprints. Preserve that disposition after enrolling every
		// refined debt; dedicated Effects, map and value owners stay separate.
		if source := recipe.nativeGet; source != nil && reflectiveNative(source.kind) && recipe.key.kind == relativeDemandEffects &&
			source.effectsSource == nil && source.inputInvocation == nil && source.descriptorEntry == nil && source.descriptorMap == nil &&
			!recipe.delta.extracted && work.operations[id.index].delta.extracted &&
			(recipe.key == source.request.producer || source.eager != nil &&
				recipe.key.selector == (sourceStagedOperationSelector{occurrence: source.get, field: "eager-inputs"})) {
			return true
		}
		// Field Has/Get and direct descriptor-algorithm extraction belong to
		// their original owners. Keep that graph disposition when attaching
		// an unextracted blueprint; the refreshed memberships above still gate
		// closure. Dependency enrollment may have grown the operations slice.
		if source := recipe.nativeGet; source != nil && !recipe.delta.extracted && work.operations[id.index].delta.extracted &&
			recipe.key.kind == relativeDemandEffects && source.descriptorGet != nil &&
			(reflectiveNative(source.kind) || source.kind == sourceNativeObjectDefineProperties && source.descriptorEntry != nil) &&
			(recipe.key.selector.occurrence == source.descriptorGet && stagedDescriptorFieldIndex(recipe.key.selector.field) >= 0 ||
				reflectiveNative(source.kind) && source.descriptorEntry == nil && source.descriptorMap == nil &&
					recipe.key.selector.occurrence == source.get && recipe.key.selector.field == "algorithm") {
			return true
		}
		if state.revision != 0 || recipe.delta.extracted {
			if operationDeltaSize(recipe.delta) == 0 {
				return work.publishSourceDisposition(id)
			}
			return work.publishOperation(id, recipe.delta)
		}
	}
	return true
}

// publishSourceDisposition publishes an independently source-owned empty Effects
// disposition. The source envelope must explicitly admit extraction. Emptiness
// is never the evidence. Consumer closure still checks every required producer
// and any graph/generation receipts, including fresh native callee selection.
func (work *callableEffectWork) publishSourceDisposition(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe, registered := work.operationRecipes[state.key]
	if !registered || !validOperationEnvelope(recipe) || !recipe.delta.extracted || operationDeltaSize(recipe.delta) != 0 {
		return false
	}
	if state.delta.extracted {
		return true
	}
	state.delta = recipe.delta
	state.revision++
	work.notifyMemberInputWaiters(id)
	work.notifyOperationSubscribers(state)
	return true
}

// registerOperationSourcePrefix accepts a sealed producer description already
// refined by its semantic owner. It neither resets that refinement nor adopts a
// consumer. A new graph still reconstructs memberships and live input delivery.
func (work *callableEffectWork) registerOperationSourcePrefix(facts []callableFacts, recipe sourceStagedOperationRecipe) bool {
	work.indexOperationSources(facts)
	prior, exists := work.operationRecipes[recipe.key]
	if !exists {
		return work.registerOperationRecipe(facts, recipe)
	}
	return sameFieldMutationData(prior.mutationData, recipe.mutationData) && sameInstalledMutationRHS(prior.installedMutationRHS, recipe.installedMutationRHS) && sameDescriptorTargetSource(prior.descriptorTarget, recipe.descriptorTarget) && sameInstalledCallPhase(prior.installedCall, recipe.installedCall) && sameInstalledMemberApplication(prior.installedMember, recipe.installedMember) && sameFrameworkStorageView(prior.frameworkEffects, recipe.frameworkEffects) && sameStagedModuleArgumentSource(prior.moduleArgument, recipe.moduleArgument) && sameStagedEntryLawSource(prior.entryLaw, recipe.entryLaw) && sameStagedAssignment(prior.assignment, recipe.assignment) && sameStagedMapRecipeSource(prior, recipe) && sameStagedCallResultSource(prior.callResult, recipe.callResult) && validOperationEnvelope(prior) && validOperationEnvelope(recipe) && prior.getter == recipe.getter && prior.returning == recipe.returning && sameNativeGetSource(prior.nativeGet, recipe.nativeGet) && sameConstructedMemberSource(prior.constructed, recipe.constructed) && operationDeltaPrefix(recipe.delta, prior.delta)
}
