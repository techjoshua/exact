package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nativeEagerInputConsumerCovered follows an ordinary Effects consumer through
// its actual adopted input/eager graph to an original literal-input read. A
// planned child, AST ancestry, or native spelling cannot supply this coverage.
// It records no normal DATA/result, executes no body and pays no Effects debt.
func (work *callableEffectWork) nativeEagerInputConsumerCovered(fact *callableFacts, call, input *ast.Node) bool {
	if fact == nil || fact.normalInputs != nil || call == nil || input == nil {
		return false
	}
	seen := make(map[sourceStagedOperationKey]bool)
	var visit func(sourceStagedOperationRequest, bool) bool
	visit = func(request sourceStagedOperationRequest, eagerOwned bool) bool {
		if seen[request.producer] {
			return false
		}
		seen[request.producer] = true
		recipe := work.operationRecipes[request.producer]
		source := recipe.nativeGet
		id := work.operationIDs[request.producer]
		if !validNativeGetRecipe(recipe) || source == nil || !sameOperationRequest(source.request, request) || request.consumer != fact.node || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid || !work.operations[id.index].dependenciesRegistered || !work.nativeEffectsGetCurrent(source) {
			return false
		}
		algorithm := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer]
		if source.request.use == call && work.nativeLiteralInputCurrent(source, input) {
			return true
		}
		if source.request.use == call && eagerOwned {
			plan := algorithm.nativeGet
			if !validNativeGetRecipe(algorithm) || plan == nil || plan.input == nil || !validStagedNativeInputPlan(*plan.input, plan) || !plan.inputEffects || plan.input.input.expression != input || !ast.IsObjectLiteralExpression(input) {
				return false
			}
			for _, role := range []string{"algorithm", "eager-inputs"} {
				phase := work.operationIDs[nativeRootDebtRequest(source, role).producer]
				if phase.epoch != work.operationEpoch || phase.index == 0 || work.operations[phase.index].invalid || !work.operations[phase.index].dependenciesRegistered || !work.operations[phase.index].delta.extracted || work.operations[phase.index].revision == 0 {
					return false
				}
			}
			return true
		}
		if algorithm.nativeGet != nil && validStagedNativeInputSource(algorithm.nativeGet) {
			child := algorithm.nativeGet.inputSource
			if work.nativeEagerRequiredChild(nativeRootDebtRequest(source, "algorithm"), child) && visit(child, true) {
				return true
			}
		}
		eager := work.operationRecipes[nativeRootDebtRequest(source, "eager-inputs").producer]
		if !validNativeGetRecipe(eager) || eager.nativeGet == nil || eager.nativeGet.eager == nil || !work.nativeEagerSourcesCurrent(eager.nativeGet) {
			return false
		}
		phase := work.operationIDs[eager.key]
		if phase.epoch != work.operationEpoch || phase.index == 0 || !work.operations[phase.index].delta.extracted || work.operations[phase.index].revision == 0 {
			return false
		}
		for _, child := range eager.nativeGet.eagerSources {
			if work.nativeEagerRequiredChild(nativeRootDebtRequest(source, "eager-inputs"), child) && visit(child, true) {
				return true
			}
		}
		return false
	}
	for _, use := range fact.staged.operationUses {
		if visit(use.request, false) {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) nativeEagerRequiredChild(parent, child sourceStagedOperationRequest) bool {
	id := work.operationIDs[parent.producer]
	producer := work.operationIDs[child.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || producer.epoch != work.operationEpoch || producer.index == 0 || !operationContainsRequest(work.operationRecipes[parent.producer].delta.required, child) {
		return false
	}
	for _, d := range work.operations[id.index].dependencies {
		if d.producer == producer && sameOperationRequest(d.request, child) {
			s := &work.operations[producer.index]
			sub := s.subscribers[sourceStagedOperationConsumer{child.consumer, child.edge}]
			return !s.invalid && s.dependenciesRegistered && s.revision != 0 && sub != nil && !sub.blocked && sameOperationRequest(sub.request, child) && sub.applied == s.revision
		}
	}
	return false
}

// nativeLiteralInputPhase correlates an original literal argument with the
// selected algorithm's existing construction phase. It grants no current Get,
// field value, descriptor conversion, definition or result authority.
func (work *callableEffectWork) nativeLiteralInputPhase(source *sourceStagedNativeGetSource, input *ast.Node) (sourceStagedOperationRequest, bool) {
	var none sourceStagedOperationRequest
	if source == nil || input == nil || !ast.IsObjectLiteralExpression(input) {
		return none, false
	}
	root := work.operationIDs[source.request.producer]
	if root.epoch != work.operationEpoch || root.index == 0 || int(root.index) >= len(work.operations) || work.operations[root.index].invalid || !work.operations[root.index].dependenciesRegistered {
		return none, false
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer]
	phase := nativeRootDebtRequest(source, "eager-inputs")
	eager := work.operationRecipes[phase.producer]
	if !validNativeGetRecipe(algorithm) || !validNativeGetRecipe(eager) || !sameNativeGetSource(algorithm.nativeGet, source) || !sameNativeGetSource(eager.nativeGet, source) || !work.nativeEagerAdoptedChild(source.request, phase) {
		return none, false
	}
	plan := algorithm.nativeGet
	if plan.descriptorMap != nil && validNativeDescriptorMapRecipe(algorithm) && plan.inputEffects && (plan.descriptorMap.target.expression == input || plan.descriptorMap.descriptors.expression == input) {
		return phase, true
	}
	if plan.input != nil && validStagedNativeInputPlan(*plan.input, plan) && plan.inputEffects && plan.input.input.expression == input {
		return phase, true
	}
	// DefineProperty's descriptor construction is owned by its ordered eager
	// plan; all later Has/Get fields and target definitions remain separate.
	selected := eager.nativeGet
	if reflectiveNative(selected.kind) && selected.eager != nil && validStagedNativeEagerInputs(*selected.eager, selected) {
		for _, actual := range selected.eager.actuals {
			if actual.expression == input && actual.producer == source.request.use && actual.cut == source.request.cut {
				return phase, true
			}
		}
	}
	return none, false
}

func (work *callableEffectWork) nativeLiteralInputCurrent(source *sourceStagedNativeGetSource, input *ast.Node) bool {
	phase, owned := work.nativeLiteralInputPhase(source, input)
	if !owned || !work.nativeEffectsGetCurrent(source) || !work.nativeEagerRequiredChild(source.request, phase) {
		return false
	}
	id := work.operationIDs[phase.producer]
	state := &work.operations[id.index]
	recipe := work.operationRecipes[phase.producer]
	if !state.delta.extracted || state.revision == 0 || !operationDeltaPrefix(state.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, state.delta) {
		return false
	}
	if source.kind == sourceNativeObjectDefineProperties {
		return work.nativeEagerPrimitiveCurrent(work.operationRecipes[phase.producer].nativeGet)
	}
	if eager := work.operationRecipes[phase.producer].nativeGet; eager.eager != nil {
		return work.nativeEagerSourcesCurrent(eager)
	}
	return true
}

// nativeLiteralInputUse preserves the actual property-initializer path. A
// computed key, spread, accessor body or arbitrary call is not literal storage.
func nativeLiteralInputUse(use *ast.Node) (call, input *ast.Node, argument int) {
	if use == nil {
		return nil, nil, -1
	}
	outer, parent := use, use.Parent
	for parent != nil && (ast.IsPropertyAssignment(parent) || ast.IsShorthandPropertyAssignment(parent) || ast.IsObjectLiteralExpression(parent)) {
		if ast.IsPropertyAssignment(parent) && parent.AsPropertyAssignment().Initializer != outer {
			return nil, nil, -1
		}
		outer, parent = parent, parent.Parent
	}
	if parent == nil || !ast.IsCallExpression(parent) || !ast.IsObjectLiteralExpression(outer) {
		return nil, nil, -1
	}
	for index, actual := range restrictedInvocationArguments(parent.AsCallExpression()) {
		if actual == outer {
			return parent, outer, index
		}
	}
	return nil, nil, -1
}
