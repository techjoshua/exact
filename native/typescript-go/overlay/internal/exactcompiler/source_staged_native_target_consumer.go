package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// requireNativeEagerTarget registers target membership before any target query
// or initializer binder. Algorithm metadata is only descriptive source context.
func (work *callableEffectWork) requireNativeEagerTarget(facts []callableFacts, id sourceStagedOperationID) bool {
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if recipe.nativeGet == nil || recipe.nativeGet.eager == nil || !recipe.nativeGet.eager.targetPending {
		return true
	}
	if recipe.nativeGet.targetSource.producer.operation != nil {
		request := nativeEagerTargetRequest(recipe.nativeGet)
		work.registerNativeTargetGetMutationInterest(facts, work.operationRecipes[request.producer].nativeGet)
		_, admitted := work.requireOperation(facts, request)
		return admitted
	}
	request := nativeEagerTargetRequest(recipe.nativeGet)
	algorithm := recipe.nativeGet.request.producer
	algorithm.selector = sourceStagedOperationSelector{occurrence: recipe.nativeGet.get, field: "algorithm"}
	source := work.operationRecipes[algorithm].nativeGet
	if source == nil || source.standard.prototype == nil || !sameNativeGetSource(source, recipe.nativeGet) {
		return false
	}
	if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, nativeGet: source}) {
		return false
	}
	// The selected target owner exists now; no future Get/query is invented.
	work.registerNativeTargetGetMutationInterest(facts, source)
	target, ok := work.requireOperation(facts, request)
	if !ok {
		return false
	}
	if len(recipe.delta.required) == 0 {
		recipe.delta = cloneOperationDelta(recipe.delta)
		recipe.delta.required = []sourceStagedOperationRequest{request}
		if !validOperationEnvelope(recipe) {
			return false
		}
		work.operationRecipes[recipe.key] = recipe
		producer := work.memberNodes[recipe.key.declaration]
		for i := range facts[producer].staged.operationRecipes {
			if facts[producer].staged.operationRecipes[i].key == recipe.key {
				facts[producer].staged.operationRecipes[i] = recipe
				break
			}
		}
		state = &work.operations[id.index]
		state.dependencies = append(state.dependencies, sourceStagedOperationDependency{producer: target, request: request})
	}
	return operationContainsRequest(recipe.delta.required, request)
}

// consumeNativeTargetEffectsSource uses the original source Get once in this
// graph. The sealed template retains no completed target query or normal result.
func (work *callableEffectWork) consumeNativeTargetEffectsSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	state := &work.operations[id.index]
	if state.targetSourceRequested {
		return
	}
	state.targetSourceRequested = true
	source := work.operationRecipes[state.key].nativeGet
	if source == nil || owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration {
		return
	}
	request := nativeEagerTargetRequest(source)
	if state.key != request.producer {
		return
	}
	target := request.producer.selector.occurrence
	if target == nil || owner.values.program.GetSourceFile(ast.GetSourceFileOfNode(target).FileName()) != ast.GetSourceFileOfNode(target) {
		return
	}
	query := newSourceDependencyQuery(target, owner.checker, owner, request.consumer)
	defer query.publishDependencyStatistics()
	query.probingStagedTarget = true
	mutation, revokeMutation := work.beginOriginalTargetGetMutation(facts, id, owner, query)
	defer revokeMutation()
	result := query.accessors(target, nil, "", accessorAcquire, nil, nil)
	if mutation != nil {
		work.finishOriginalTargetGetMutation(facts, mutation, &result)
	}
	for _, selected := range result.values {
		proof, ok := describeStagedNativeTargetEffects(source, selected, &result, query.relativeInputCut(target), query.owner.generation)
		if !ok || query.owner.generation != work.operationGeneration {
			continue
		}
		// The original query and SOURCE publisher may adopt children and grow
		// operations. Publish through the canonical element after that work.
		state = &work.operations[id.index]
		state.nativeTarget = &proof
		state.delta = work.operationRecipes[state.key].delta
		state.delta.extracted = true
		state.revision++
		work.notifyOperationSubscribers(state)
		return
	}
}

// describeNativeTargetSource retains only a selected original source association.
// Pending target membership includes the full child root before admission; no
// ordinary-result receipt or successful evaluation is supplied by this graph.
func (work *callableEffectWork) describeNativeTargetSource(facts []callableFacts, parent *sourceStagedNativeGetSource, child sourceStagedOperationRequest, binding *ast.Node) bool {
	attached := *parent
	attached.targetSource, attached.targetBinding = child, binding
	if !validNativeTargetSource(&attached) {
		return false
	}
	targetRequest := nativeEagerTargetRequest(&attached)
	planned := make([]sourceStagedOperationRecipe, 0)
	for _, prior := range work.operationRecipes {
		if !sameNativeGetSource(prior.nativeGet, parent) {
			continue
		}
		copy := *prior.nativeGet
		if copy.targetSource.producer.operation != nil && (!sameOperationRequest(copy.targetSource, child) || copy.targetBinding != binding) {
			return false
		}
		copy.targetSource, copy.targetBinding = child, binding
		recipe := prior
		recipe.nativeGet = &copy
		recipe.delta = cloneOperationDelta(prior.delta)
		if recipe.key == targetRequest.producer {
			recipe.delta.required = []sourceStagedOperationRequest{child}
		} else if recipe.key == nativeRootDebtRequest(&copy, "eager-inputs").producer && validNativeEagerSources(&copy) {
			// This source role owns target evaluation as well as its other eager
			// children. Keep their canonical order and all existing memberships.
			recipe.delta.required = nativeEagerRequired(&copy)
		}
		if !validOperationEnvelope(recipe) || !operationDeltaPrefix(prior.delta, recipe.delta) || prior.delta.extracted && !operationDeltaPrefix(recipe.delta, prior.delta) {
			return false
		}
		if _, owned := work.memberNodes[recipe.key.declaration]; !owned {
			return false
		}
		planned = append(planned, recipe)
	}
	// Validate every source copy before publishing any refinement. Register a
	// missing target first so adopted parents can immediately retain its edge.
	target := sourceStagedOperationRecipe{key: targetRequest.producer, nativeGet: &attached, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{child}}}
	_, present := work.operationRecipes[targetRequest.producer]
	if !present && (!validOperationEnvelope(target) || !work.registerOperationRecipe(facts, target)) {
		return false
	}
	for _, recipe := range planned {
		if !work.attachOperationSource(facts, recipe) {
			return false
		}
	}
	return true
}

// connectNativeTargetSource publishes only after the original child adoption
// supplies current recursive ordinary-result receipts. Conditional return kind
// never replaces the child's complete Effects, completion or input obligations.
func (work *callableEffectWork) connectNativeTargetSource(facts []callableFacts, parent *sourceStagedNativeGetSource, child *ast.Node) bool {
	if parent == nil || !validNativeTargetSource(parent) || parent.targetSource.producer.operation != child || !work.nativeOrdinaryTargetResult(parent.targetSource) {
		return false
	}
	request := nativeEagerTargetRequest(parent)
	recipe, present := work.operationRecipes[request.producer]
	if !present || !sameNativeGetSource(recipe.nativeGet, parent) || !sameOperationRequest(recipe.nativeGet.targetSource, parent.targetSource) {
		return false
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.extracted = true
	if !work.attachOperationSource(facts, recipe) {
		return false
	}
	return true
}
