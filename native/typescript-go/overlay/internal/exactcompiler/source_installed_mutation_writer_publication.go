package exactcompiler

// publishGetterMutationWriters runs at either the actual original Get input
// issuer or its existing once-only BODY-transfer owner. It reduces passive
// templates using that exact published input edge, without rewalking a body or
// reconstructing a binder from the BODY record.
func (work *callableEffectWork) publishGetterMutationWriters(facts []callableFacts, reader sourceStagedOperationID, slot int, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration || reader.epoch != work.operationEpoch || reader.index == 0 || int(reader.index) >= len(work.operations) || slot < 0 || slot >= len(work.operations[reader.index].getters) {
		return false
	}
	getter := work.operations[reader.index].getters[slot]
	if getter.installed == nil || getter.installed.root.epoch != work.operationEpoch || getter.installed.root.index == 0 || int(getter.installed.root.index) >= len(work.operations) {
		return false
	}
	rootSource := work.operationRecipes[work.operations[getter.installed.root.index].key].nativeGet
	if rootSource == nil {
		return false
	}
	if getter.installed == nil || getter.inputs == nil || !getter.inputs.delivered || !getter.bodyTransferred || !getter.bodyReady || getter.inputs.request.declaration != getter.declaration || !sameSourceRelativeInputEnvelope(getter.inputs.request, getter.inputs.relative) {
		return false
	}
	actor, registered := work.memberNodes[getter.declaration]
	if !registered || actor < 0 || actor >= len(facts) || !facts[actor].staged.ready {
		return false
	}
	changed := false
	for _, retained := range facts[actor].staged.mutationWriters {
		template, current := currentMutationWriterTemplate(retained, owner.values)
		if !current {
			continue
		}
		projection, described := projectMutationWriterTemplate(template, getter.inputs.relative, nil, owner.values)
		if !described {
			continue
		}
		request := installedMutationRHSRequest(getter.demand.request, template, getter.inputs)
		description := &sourceInstalledMutationRHS{request: request, parent: getter.demand.request, template: template, binding: getter.inputs, bound: cloneSourceRelativeBoundInputs(getter.inputs.relative), projection: projection, generation: work.operationGeneration}
		recipe := sourceStagedOperationRecipe{key: request.producer, installedMutationRHS: description, delta: cloneOperationDelta(projection.delta)}
		recipe.delta.required = appendEntryLawRequirement([]sourceStagedOperationRequest{getter.demand.request}, rootSource.request)
		if !validInstalledMutationRHSRecipe(recipe) {
			continue
		}
		prior, exists := work.operationRecipes[recipe.key]
		if exists && !sameInstalledMutationRHS(prior.installedMutationRHS, description) {
			continue
		}
		if !exists && !work.registerOperationRecipe(facts, recipe) {
			continue
		}
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[recipe.key] = work.operationGeneration
		if exists {
			if !work.attachOperationSource(facts, recipe) {
				continue
			}
		}
		id, adopted := work.requireOperation(facts, request)
		if !adopted {
			continue
		}
		if operationDeltaSize(recipe.delta) != 0 {
			work.publishOperation(id, recipe.delta)
		}
		// New child registration/delivery participates in existing work progress;
		// unchanged descriptions do not report perpetual source progress.
		changed = changed || !exists
	}
	return changed
}
