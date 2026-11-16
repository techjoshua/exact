package exactcompiler

// validNativeFieldValueSourceRecipe describes one required Value source role,
// not an invocation or normal result. Original own data can contribute to the
// own-writer baseline. Inherited data keeps its selected installation relation.
// Empty/unknown source acquisition supplies no callable alternative here.
func validNativeFieldValueSourceRecipe(recipe sourceStagedOperationRecipe, parent sourceStagedOperationRequest) bool {
	if parent.producer.selector.field != "get" && parent.producer.selector.field != "value" || len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative) != 0 {
		return false
	}
	normalized := recipe
	normalized.key = parent.producer
	roles, valid := fieldSourceRequests(parent)
	if !valid {
		return false
	}
	own := recipe.key == roles.ownWriters.producer
	for _, forward := range recipe.fieldForwards {
		if !validStagedFieldForward(normalized, forward) {
			return false
		}
		root, projection := false, false
		for _, required := range recipe.delta.required {
			root = root || sameOperationRequest(required, forward.source.request)
			projection = projection || sameOperationRequest(required, forward.request)
		}
		if !root || !projection {
			return false
		}
	}
	for _, residual := range recipe.delta.residuals {
		if residual.mutation != nil {
			expected := roles.prototype
			if own {
				expected = roles.ownWriters
			}
			if !validRelativeFieldMutationShape(residual.mutation) || !sameOperationRequest(residual.mutation.field, expected) {
				return false
			}
			for _, required := range residual.mutation.required {
				if !operationContainsRequest(recipe.delta.required, required) {
					return false
				}
			}
		}
	}
	for _, alternative := range recipe.delta.exposures {
		covered := own && validNativeOwnFieldAlternative(normalized, alternative)
		for _, forward := range recipe.fieldForwards {
			covered = covered || sameOperationAlternative(alternative, forward.alternative)
		}
		if !covered {
			return false
		}
	}
	return true
}

// recordOwnFieldValueBaseline is called by the actual own-data Get owner while
// its issuer is live. It publishes only that selected known source prefix. The
// remaining writer/prototype discovery is still compiler-pending, so this does
// not mark extraction ready, infer an empty baseline, or issue any invocation.
func (work *callableEffectWork) recordOwnFieldValueBaseline(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs, parent sourceStagedOperationRecipe, alternative sourceStagedOperationAlternative) bool {
	if !query.liveStagedFieldGet(get) || get.stagedEffects.observation == nil || get.stagedEffects.observation.phase != stagedFieldObservationGet || !validNativeOwnFieldAlternative(parent, alternative) || alternative.endpoint.cut != query.relativeInputCut(get.operation) {
		return false
	}
	current, live := work.issueFieldEffectsDemand(facts, demand.producer, query.executable)
	if !live || !sameOperationRequest(current.request, demand.request) || !sameOperationEndpoint(current.receiver, demand.receiver) {
		return false
	}
	request := parent.nativeGet.request
	request.producer = parent.key
	roles, valid := fieldSourceRequests(request)
	if !valid {
		return false
	}
	recipe, registered := work.operationRecipes[roles.ownWriters.producer]
	if !registered {
		return false
	}
	for _, prior := range recipe.delta.exposures {
		if sameOperationAlternative(prior, alternative) {
			return true
		}
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.exposures = append(recipe.delta.exposures, alternative)
	return work.updateFieldValueRecipe(facts, recipe)
}

// applyFieldValueSourceDelivery consumes a required source capability without
// treating it as a stored function Call. Known alternatives and declaration-relative residuals are
// transported to the parent Value producer. Its source memberships still govern
// closure, and pending producer work never becomes a runtime-unknown residual.
func (work *callableEffectWork) applyFieldValueSourceDelivery(facts []callableFacts, consumer int, use sourceStagedOperationUse, delta sourceStagedOperationDelta) bool {
	parentRequest, role := fieldSourceParent(use.request)
	source, registered := work.operationRecipes[use.request.producer]
	if !role || !registered || use.request.producer.kind != relativeDemandDirectExposure || use.call != nil || use.installed != nil || use.request.reading != (sourceStagedOperationKey{}) || !validNativeGetRequest(source, use.request) || len(delta.invoked)+len(delta.effects)+len(delta.relative) != 0 {
		return false
	}
	parent, registered := work.operationRecipes[parentRequest.producer]
	if !registered || !sameNativeGetSource(source.nativeGet, parent.nativeGet) {
		return false
	}
	expected := parent.nativeGet.request
	expected.producer = parent.key
	if !sameOperationRequest(parentRequest, expected) {
		return false
	}
	if source.nativeGet.eager != nil {
		copySource := *parent.nativeGet
		copySource.eager = source.nativeGet.eager
		parent.nativeGet = &copySource
	}
	parent.delta = cloneOperationDelta(parent.delta)
	changed := false
	for _, alternative := range delta.exposures {
		authorized := false
		for _, known := range source.delta.exposures {
			authorized = authorized || sameOperationAlternative(alternative, known)
		}
		if !authorized {
			return false
		}
		for _, forward := range source.fieldForwards {
			if !sameOperationAlternative(alternative, forward.alternative) {
				continue
			}
			known := false
			for _, prior := range parent.fieldForwards {
				known = known || sameStagedFieldForward(prior, forward)
			}
			if !known {
				parent.fieldForwards = append(append([]sourceStagedFieldForward(nil), parent.fieldForwards...), forward)
				parent.delta.required = append(parent.delta.required, forward.source.request, forward.request)
				changed = true
			}
		}
		known := false
		for _, prior := range parent.delta.exposures {
			known = known || sameOperationAlternative(alternative, prior)
		}
		if !known {
			parent.delta.exposures = append(parent.delta.exposures, alternative)
			changed = true
		}
	}
	for _, residual := range delta.residuals {
		authorized := false
		for _, known := range source.delta.residuals {
			authorized = authorized || sameOperationResidual(residual, known)
		}
		if !authorized {
			return false
		}
		known := false
		for _, prior := range parent.delta.residuals {
			known = known || sameOperationResidual(prior, residual)
		}
		if !known {
			parent.delta.residuals = append(parent.delta.residuals, cloneOperationResidual(residual))
			changed = true
		}
	}
	if changed {
		parent.delta.extracted = len(parent.delta.exposures)+len(parent.delta.residuals) != 0
		if !work.updateFieldValueRecipe(facts, parent) {
			return false
		}
	}
	facts[consumer].staged.operationDeliveries += uint64(operationDeltaSize(delta))
	return true
}

// updateFieldValueRecipe installs immutable prefix growth before notifying any
// subscriber. Late required relationships join the same work owner. Source-role
// readiness and parent Value readiness remain distinct from dependency closure.
func (work *callableEffectWork) updateFieldValueRecipe(facts []callableFacts, recipe sourceStagedOperationRecipe) bool {
	prior, registered := work.operationRecipes[recipe.key]
	if !registered || !validOperationEnvelope(recipe) || !operationDeltaPrefix(prior.delta, recipe.delta) || !operationPrefix(prior.fieldForwards, recipe.fieldForwards, sameStagedFieldForward) || prior.delta.extracted && !recipe.delta.extracted {
		return false
	}
	var late []sourceStagedOperationDependency
	for _, required := range recipe.delta.required[len(prior.delta.required):] {
		id, admitted := work.requireOperation(facts, required)
		if !admitted {
			return false
		}
		late = append(late, sourceStagedOperationDependency{producer: id, request: required})
	}
	work.operationRecipes[recipe.key] = recipe
	producer := work.memberNodes[recipe.key.declaration]
	for index := range facts[producer].staged.operationRecipes {
		if facts[producer].staged.operationRecipes[index].key == recipe.key {
			facts[producer].staged.operationRecipes[index] = recipe
			break
		}
	}
	if id, requested := work.operationIDs[recipe.key]; requested {
		if work.operations[id.index].dependenciesRegistered {
			work.operations[id.index].dependencies = append(work.operations[id.index].dependencies, late...)
		} else {
			work.registerOperationDependencies(facts, id)
		}
		if _, role := fieldSourceParent(sourceStagedOperationRequest{producer: recipe.key}); role {
			delta := recipe.delta
			if work.sequenceValueSourceReady(id) {
				delta.extracted = true
			}
			return work.publishFieldSourcePrefix(id, delta)
		}
		return work.publishOperation(id, recipe.delta)
	}
	return true
}
