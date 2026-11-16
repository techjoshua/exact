package exactcompiler

// sourceStagedNativeAlgorithmConsumer borrows one actual selected alternative.
// Admit is usable only during this original member-owner callback. Neither the
// selection nor admit may be retained by a recipe, subscriber or queued task.
// Success registers the algorithm's dependencies, never its required closure.
type sourceStagedNativeAlgorithmConsumer func(sourceStagedNativeSelection, func(sourceStagedNativeDescriptorPlan) bool)

// admitNativeDescriptor connects the selected algorithm to the pending role
// already registered by the source Get owner. All validation precedes mutation.
// This initial admission accepts six pending field producers, not arbitrary
// supplied field atoms or absence/data-only dispositions. Their source owners
// must be connected independently before any of those debts can settle.
func (work *callableEffectWork) admitNativeDescriptor(facts []callableFacts, source *sourceStagedNativeGetSource, selection sourceStagedNativeSelection, plan sourceStagedNativeDescriptorPlan, standard sourceDemandStandardPremises) bool {
	if source == nil || selection.selected.native == nil || (source.kind != sourceNativeObjectDefineProperty && source.kind != sourceNativeReflectDefineProperty) || selection.selected.native.kind != source.kind || selection.call != source.request.producer.operation || selection.get != source.get || selection.descriptorGet == nil || !sameOperationRequest(selection.request, source.request) {
		return false
	}
	root, exists := work.operationRecipes[source.request.producer]
	if !exists || root.nativeGet != source {
		return false
	}
	algorithm := source.request
	algorithm.producer.selector = sourceStagedOperationSelector{occurrence: source.get, field: "algorithm"}
	algorithm.edge += ":algorithm"
	prior, exists := work.operationRecipes[algorithm.producer]
	if !exists || prior.nativeGet == nil || !sameNativeGetSource(prior.nativeGet, source) || plan.eager.key != algorithm.producer || plan.eager.getter != nil || plan.eager.returning != nil || plan.eager.nativeGet != nil || plan.eager.delta.extracted {
		return false
	}
	// This metadata is detached, immutable and independently source-keyed. It
	// contains no selected sourceValue, query, acquisition frame or callback.
	installation, described := describeSelectedNativeInstallation(selection)
	if !described {
		return false
	}
	attached := *source
	attached.installation = &installation
	attached.descriptorGet = selection.descriptorGet
	attached.standard = standard
	recipe := plan.eager
	recipe.nativeGet = &attached
	if !validOperationEnvelope(recipe) {
		return false
	}
	fields := plan.fields
	var sourceRecipes []sourceStagedOperationRecipe
	for index := range fields {
		field := &fields[index]
		expected := source.request
		expected.producer.selector = sourceStagedOperationSelector{occurrence: selection.descriptorGet, field: reflectiveDescriptorKeys[index]}
		if !sameOperationRequest(field.request, expected) || field.recipe.key != expected.producer || field.recipe.getter != nil || field.recipe.returning != nil || field.recipe.nativeGet != nil || operationDeltaSize(field.recipe.delta) != 0 || field.recipe.delta.extracted {
			return false
		}
		field.recipe.nativeGet = &attached
		roles, valid := fieldSourceRequests(expected)
		if !valid {
			return false
		}
		field.recipe.delta.required = []sourceStagedOperationRequest{roles.ownWriters, roles.prototype}
		for _, request := range field.recipe.delta.required {
			child := sourceStagedOperationRecipe{key: request.producer, nativeGet: &attached}
			if !validOperationEnvelope(child) {
				return false
			}
			if existing, found := work.operationRecipes[child.key]; found && (!sameNativeGetSource(existing.nativeGet, &attached) || !validOperationEnvelope(existing)) {
				return false
			}
			sourceRecipes = append(sourceRecipes, child)
		}
		if !validOperationEnvelope(field.recipe) {
			return false
		}
		if existing, found := work.operationRecipes[field.recipe.key]; found && (!sameNativeGetSource(existing.nativeGet, &attached) || (!operationDeltaPrefix(existing.delta, field.recipe.delta) || !operationDeltaPrefix(field.recipe.delta, existing.delta))) {
			return false
		}
	}
	id, adopted := work.operationIDs[algorithm.producer]
	if prior.nativeGet.descriptorGet != nil {
		return prior.nativeGet.descriptorGet == attached.descriptorGet && operationDeltaPrefix(prior.delta, recipe.delta) && operationDeltaPrefix(recipe.delta, prior.delta)
	}
	// An adopted empty ticket has no published source disposition. Attachment
	// enrolls these authenticated field requirements before initial publication.
	if prior.delta.extracted || operationDeltaSize(prior.delta) != 0 || adopted && work.operations[id.index].revision != 0 {
		return false
	}
	producer := work.memberNodes[recipe.key.declaration]
	// No extraction/delivery runs within the synchronous source callback. Commit
	// the finite recipe set together before exposing any required field member.
	for _, child := range sourceRecipes {
		if _, found := work.operationRecipes[child.key]; !found {
			work.operationRecipes[child.key] = child
			facts[producer].staged.operationRecipes = append(facts[producer].staged.operationRecipes, child)
		}
	}
	for _, field := range fields {
		if _, found := work.operationRecipes[field.recipe.key]; !found {
			work.operationRecipes[field.recipe.key] = field.recipe
			facts[producer].staged.operationRecipes = append(facts[producer].staged.operationRecipes, field.recipe)
		}
	}
	if !work.attachOperationSource(facts, recipe) {
		return false
	}
	work.notifyNativeWriterSourceRequests(facts, work.operationRecipes[source.request.producer].nativeGet)
	return true
}
