package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nativeDescriptorDefinitionsRequest separates source map conversion from
// conditional target definition. It is not a performed write or normal phase
// receipt. The target owner must represent traps/Throw before it can settle.
func nativeDescriptorDefinitionsRequest(source *sourceStagedNativeGetSource) sourceStagedOperationRequest {
	request := source.request
	request.producer.selector = sourceStagedOperationSelector{occurrence: source.get, field: "descriptor-definitions"}
	request.edge += ":descriptor-definitions"
	return request
}

// admitNativeDescriptorMap is called only from the original selected algorithm
// handoff. It connects the algorithm to ordered map conversion and a separate
// target-definition producer before either is traversed. No map syntax, empty
// prefix, field value or normal outcome can settle these source protocols.
func (work *callableEffectWork) admitNativeDescriptorMap(facts []callableFacts, source *sourceStagedNativeGetSource, selection sourceStagedNativeSelection, standard sourceDemandStandardPremises, owner *executableBodyOwner, observed ...func(*sourceStagedNativeGetSource)) bool {
	if len(observed) > 1 {
		return false
	}
	plan, described := describeSelectedNativeDescriptorMap(selection)
	if !described || source == nil || source.kind != sourceNativeObjectDefineProperties || !sameOperationRequest(source.request, selection.request) || source.get != selection.get || source.method != selection.selected.node {
		return false
	}
	attached := *source
	// This fresh selected event owns new phase input associations. The root's
	// Effects continuation stays on its root recipe, never on a phase role.
	attached.effectsSource = nil
	attached.descriptorMap = &plan
	// Reclassify this original input event once. Cached relationships are not
	// positive admission; strict phase attachment below retains every old debt.
	attached.keySources, attached.moduleSources = nil, nil
	attached.standard = standard
	attached.mapTargetEffects = ast.IsObjectLiteralExpression(plan.target.expression)
	attached.inputEffects = stagedMapInputsInert(&attached)
	if !attached.inputEffects {
		attached.inputEffects = work.stagedMapKeyInputs(facts, &attached, owner)
	}
	definitions := nativeDescriptorDefinitionsRequest(&attached)
	for _, recipe := range []sourceStagedOperationRecipe{
		{key: plan.protocol.producer, nativeGet: &attached},
		{key: definitions.producer, nativeGet: &attached, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{plan.protocol}, extracted: attached.mapTargetEffects}},
	} {
		// Fresh selected input admission can follow original protocol refinement.
		// Reuse the initial description through its existing strict prefix API;
		// preserve every issued child and extraction bit without republishing it.
		if !work.registerOperationSourcePrefix(facts, recipe) {
			return false
		}
	}
	algorithm := sourceStagedOperationRecipe{key: plan.algorithm.producer, nativeGet: &attached, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{plan.protocol, definitions}, extracted: true}}
	if !work.admitNativeRootEffects(facts, algorithm) {
		return false
	}
	if attached.inputEffects || len(attached.keySources) != 0 {
		request := nativeRootDebtRequest(&attached, "eager-inputs")
		if !work.admitNativeRootEffects(facts, sourceStagedOperationRecipe{key: request.producer, nativeGet: &attached, delta: sourceStagedOperationDelta{required: stagedKeyRequirements(&attached), extracted: attached.inputEffects}}) {
			return false
		}
	}
	if len(observed) == 1 && observed[0] != nil && attached.inputEffects {
		observed[0](&attached)
	}
	return true
}

func validNativeDescriptorMapRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.nativeGet
	if source == nil || source.kind != sourceNativeObjectDefineProperties || source.descriptorMap == nil {
		return false
	}
	plan := source.descriptorMap
	// The selected source owns this immutable canonical association. These
	// correlations validate transport only, never source-protocol coverage.
	call := source.request.producer.operation
	if call == nil || !ast.IsCallExpression(call) {
		return false
	}
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	if len(arguments) != 2 || !sameOperationEndpoint(plan.target, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: arguments[0], producer: call, cut: source.request.cut}) || !sameOperationEndpoint(plan.descriptors, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: arguments[1], producer: call, cut: source.request.cut}) {
		return false
	}
	if plan.target.producer != call || plan.descriptors.producer != call || plan.target.cut != source.request.cut || plan.descriptors.cut != source.request.cut || !sameOperationRequest(plan.algorithm, nativeRootDebtRequest(source, "algorithm")) {
		return false
	}
	protocol := source.request
	protocol.producer.selector = sourceStagedOperationSelector{occurrence: plan.descriptors.expression, field: "descriptor-map"}
	protocol.edge += ":descriptor-map"
	if !sameOperationRequest(protocol, plan.protocol) {
		return false
	}
	if recipe.mapProtocol != nil {
		return validStagedMapProtocolRecipe(recipe)
	}
	definitions := nativeDescriptorDefinitionsRequest(source)
	switch recipe.key {
	case plan.protocol.producer:
		return !recipe.delta.extracted && operationDeltaSize(recipe.delta) == 0
	case definitions.producer:
		return recipe.delta.extracted == source.mapTargetEffects && operationDeltaSize(recipe.delta) == 1 && len(recipe.delta.required) == 1 && sameOperationRequest(recipe.delta.required[0], protocol)
	case nativeRootDebtRequest(source, "eager-inputs").producer:
		expected := stagedKeyRequirements(source)
		return recipe.delta.extracted == source.inputEffects && (stagedMapInputsInert(source) || len(source.keySources) != 0) && operationDeltaSize(recipe.delta) == len(expected) && operationPrefix(recipe.delta.required, expected, sameOperationRequest) && len(recipe.delta.required) == len(expected)
	case plan.algorithm.producer:
		return recipe.delta.extracted && operationDeltaSize(recipe.delta) == 2 && len(recipe.delta.required) == 2 && sameOperationRequest(recipe.delta.required[0], protocol) && sameOperationRequest(recipe.delta.required[1], definitions)
	}
	return false
}
