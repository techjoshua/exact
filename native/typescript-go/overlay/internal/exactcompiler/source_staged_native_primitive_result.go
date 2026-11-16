package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceNativePrimitiveResult is conditional SOURCE provenance for one actual
// selected Symbol.for Call. It carries no concrete symbol, registry identity,
// normal completion, acquired receiver or graph observation. Original Call
// Effects and actual input DATA remain independent required deliveries.
type sourceNativePrimitiveResult struct {
	request, original sourceStagedOperationRequest
	method            *ast.Node
	generation        *projectGeneration
	input             sourceRelativeEndpoint
	inputRequired     sourceStagedOperationRequest
	inputData         []sourceStagedOperationAlternative
}

func cloneNativePrimitiveResult(p *sourceNativePrimitiveResult) *sourceNativePrimitiveResult {
	if p == nil {
		return nil
	}
	copy := *p
	copy.input = cloneSourceRelativeEndpoint(p.input)
	copy.inputData = cloneOperationDelta(sourceStagedOperationDelta{exposures: p.inputData}).exposures
	return &copy
}

func sameNativePrimitiveResult(a, b *sourceNativePrimitiveResult) bool {
	return a == b || a != nil && b != nil && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.original, b.original) && a.method == b.method && a.generation == b.generation && sameOperationEndpoint(a.input, b.input) && sameOperationRequest(a.inputRequired, b.inputRequired) && len(a.inputData) == len(b.inputData) && operationPrefix(a.inputData, b.inputData, sameOperationAlternative)
}

// nativePrimitiveInputRequest describes existing operand DATA, never selection.
// Literal construction keeps its original endpoint rather than adding a task.
func nativePrimitiveInputRequest(call, owner *ast.Node) (sourceStagedOperationRequest, bool) {
	if call == nil || !ast.IsCallExpression(call) || stagedNativeInputIntent(call.Expression()) != sourceNativeSymbolFor {
		return sourceStagedOperationRequest{}, false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 1 || ast.IsSpreadElement(actuals[0]) {
		return sourceStagedOperationRequest{}, false
	}
	actual := actuals[0]
	if ast.IsIdentifier(actual) {
		return stagedBindingResultRequest(actual, owner), true
	}
	if stagedResultExpression(actual) {
		return stagedResultSourceRequest(actual, owner, nil), true
	}
	return sourceStagedOperationRequest{}, stagedSourceDataValue(actual)
}

func validNativePrimitiveResult(p *sourceNativePrimitiveResult) bool {
	if p == nil || p.generation == nil || p.method == nil || p.method.Kind != ast.KindMethodSignature || !standardLibrarySource(ast.GetSourceFileOfNode(p.method)) {
		return false
	}
	call, owner := p.request.producer.operation, p.request.producer.declaration
	if call == nil || !sameOperationRequest(p.request, stagedCallResultRequest(call, owner)) || p.original.producer.operation != call || p.original.producer.declaration != owner || p.original.producer.kind != relativeDemandEffects || p.original.producer.selector != (sourceStagedOperationSelector{}) || p.original.consumer != owner || p.original.inputs != nil || p.original.use != call || p.original.cut != p.request.cut {
		return false
	}
	required, supported := nativePrimitiveInputRequest(call, owner)
	if !supported || !sameOperationRequest(required, p.inputRequired) {
		return false
	}
	actual := restrictedInvocationArguments(call.AsCallExpression())[0]
	expected := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actual, producer: call, cut: p.original.cut}
	if !sameOperationEndpoint(expected, p.input) || len(p.inputData) == 0 {
		return false
	}
	if required.producer.operation == nil {
		return len(p.inputData) == 1 && p.inputData[0].creating == nil && sameOperationEndpoint(p.inputData[0].endpoint, p.input)
	}
	return true
}

func validNativePrimitiveEndpoint(endpoint sourceRelativeEndpoint) bool {
	p := endpoint.nativePrimitive
	return endpoint.kind == relativeEndpointNativePrimitive && endpoint.expression == nil && endpoint.moduleConstruction == nil && endpoint.constructionCallable == nil && endpoint.descriptorView == nil && endpoint.frameworkView == nil && len(endpoint.projection) == 0 && endpoint.creation == nil && endpoint.returning == nil && endpoint.get == nil && validNativePrimitiveResult(p) && endpoint.producer == p.request.producer.operation && endpoint.cut == p.request.cut
}

func nativePrimitivePayloadPresent(recipe sourceStagedOperationRecipe) bool {
	for _, value := range recipe.delta.exposures {
		if value.endpoint.nativePrimitive != nil || value.endpoint.kind == relativeEndpointNativePrimitive {
			return true
		}
	}
	return false
}

// nativePrimitiveRootCurrent consumes actual original Get/input descriptions.
// It deliberately does not enter ordinary-object result eligibility or the
// dependency solver. The outer operation conjunction owns transitive closure.
func (work *callableEffectWork) nativePrimitiveRootCurrent(recipe sourceStagedOperationRecipe) *sourceStagedNativeGetSource {
	if recipe.callResult == nil || !recipe.callResult.nativeCall || recipe.callResult.generation != work.operationGeneration || work.operationGeneration == nil || !work.operationGeneration.active || work.operationGeneration.project == nil || work.operationGeneration.project.activeGeneration != work.operationGeneration {
		return nil
	}
	key := sourceStagedOperationKey{declaration: recipe.key.declaration, operation: recipe.key.operation, kind: relativeDemandEffects}
	rootRecipe, registered := work.operationRecipes[key]
	root := rootRecipe.nativeGet
	if !registered || root == nil || root.kind != sourceNativeSymbolFor || !validOperationEnvelope(rootRecipe) || root.request.producer != key || !work.nativeEffectsGetCurrent(root) {
		return nil
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer]
	source := algorithm.nativeGet
	if source == nil || !sameNativeGetSource(root, source) || source.input == nil || !validStagedNativeInputPlan(*source.input, source) || !source.inputEffects || !validNativeGetRecipe(algorithm) || !algorithm.delta.extracted || !work.nativePopulationCurrent(source) {
		return nil
	}
	return source
}

func (work *callableEffectWork) prepareNativePrimitiveInput(facts []callableFacts, recipe sourceStagedOperationRecipe, owner *executableBodyOwner) {
	request, supported := nativePrimitiveInputRequest(recipe.key.operation, recipe.key.declaration)
	if !supported || request.producer.operation == nil {
		return
	}
	caller, known := work.memberNodes[recipe.key.declaration]
	if !known {
		return
	}
	child, eligible := work.describeStagedCallResultSource(facts, caller, request.producer.operation, owner)
	if !eligible || !sameOperationRequest(child.request, request) {
		return
	}
	if child.getResult != nil {
		if _, registered := work.registerStagedGetResult(facts, caller, request.producer.operation, owner); !registered {
			return
		}
	}
	if _, registered := work.operationRecipes[request.producer]; !registered && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, callResult: child}) {
		return
	}
	work.requireOperation(facts, request)
}

func (work *callableEffectWork) captureNativePrimitiveInput(source *sourceStagedNativeGetSource) ([]sourceStagedOperationAlternative, bool) {
	request, supported := nativePrimitiveInputRequest(source.request.producer.operation, source.request.producer.declaration)
	if !supported {
		return nil, false
	}
	if request.producer.operation == nil {
		return []sourceStagedOperationAlternative{{endpoint: cloneSourceRelativeEndpoint(source.input.input)}}, true
	}
	data, applied := work.nativePrimitiveDataApplied(request)
	if !applied || !data.delta.extracted || len(data.delta.exposures) == 0 {
		return nil, false
	}
	return cloneOperationDelta(sourceStagedOperationDelta{exposures: data.delta.exposures}).exposures, true
}

// refineStagedNativePrimitiveResult changes only the existing Call DATA recipe.
// A missing/mixed selected producer remains pending; it is not runtime unknown.
func (work *callableEffectWork) refineStagedNativePrimitiveResult(facts []callableFacts, recipe sourceStagedOperationRecipe, root *sourceStagedNativeGetSource) bool {
	input, supported := nativePrimitiveInputRequest(recipe.key.operation, recipe.key.declaration)
	required := []sourceStagedOperationRequest{root.request}
	if input.producer.operation != nil {
		required = append(required, input)
	}
	changed := false
	if len(recipe.delta.required) == 0 {
		recipe.delta = cloneOperationDelta(recipe.delta)
		recipe.delta.required = required
		if !work.attachOperationSource(facts, recipe) {
			return false
		}
		changed = true
	}
	if !supported {
		return changed
	} // The original Effects child is still retained.
	source := work.nativePrimitiveRootCurrent(recipe)
	if source == nil || !work.freshStagedCallResultReading(recipe) || recipe.delta.extracted {
		return changed
	}
	values, applied := work.captureNativePrimitiveInput(source)
	if !applied {
		return changed
	}
	p := &sourceNativePrimitiveResult{request: recipe.callResult.request, original: root.request, method: root.method, generation: work.operationGeneration, input: cloneSourceRelativeEndpoint(source.input.input), inputRequired: input, inputData: values}
	if !validNativePrimitiveResult(p) {
		return changed
	}
	recipe.delta = sourceStagedOperationDelta{required: required, extracted: true, exposures: []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointNativePrimitive, producer: recipe.key.operation, cut: recipe.callResult.request.cut, nativePrimitive: p}}}}
	return work.attachOperationSource(facts, recipe) || changed
}

// nativePrimitiveSourceCurrent is nonrecursive with respect to the operation
// solver. It compares source descriptions and actual original input deliveries;
// no saved revision or APPLIED bit is rewritten to renew a payload.
func (work *callableEffectWork) nativePrimitiveSourceCurrent(p *sourceNativePrimitiveResult) bool {
	if p == nil || p.generation == nil || p.generation != work.operationGeneration || !p.generation.active || p.generation.project == nil || p.generation.project.activeGeneration != p.generation || !validNativePrimitiveResult(p) {
		return false
	}
	recipe, registered := work.operationRecipes[p.request.producer]
	if !registered || !validStagedCallResultRecipe(recipe) || !recipe.delta.extracted || len(recipe.delta.exposures) != 1 || !sameNativePrimitiveResult(recipe.delta.exposures[0].endpoint.nativePrimitive, p) {
		return false
	}
	source := work.nativePrimitiveRootCurrent(recipe)
	if source == nil || source.method != p.method || !sameOperationRequest(source.request, p.original) || !sameOperationEndpoint(source.input.input, p.input) {
		return false
	}
	values, applied := work.captureNativePrimitiveInput(source)
	return applied && len(values) == len(p.inputData) && operationPrefix(values, p.inputData, sameOperationAlternative)
}

// nativePrimitivePayloadApplied follows only matching, already APPLIED child
// DATA on this recipe. Descriptions copied onto another source cannot invent
// that chain. A cyclic/unrepresented chain retains its original pending work.
func (work *callableEffectWork) nativePrimitivePayloadApplied(recipe sourceStagedOperationRecipe, p *sourceNativePrimitiveResult, path []sourceStagedOperationKey) bool {
	if !work.nativePrimitiveSourceCurrent(p) {
		return false
	}
	for _, key := range path {
		if key == recipe.key {
			return false
		}
	}
	if recipe.key == p.request.producer {
		return true
	}
	path = append(path, recipe.key)
	for _, required := range recipe.delta.required {
		if required.producer.kind != relativeDemandDirectExposure {
			continue
		}
		child, registered := work.operationRecipes[required.producer]
		data, applied := work.nativePrimitiveDataApplied(required)
		if !registered || !applied || !data.delta.extracted {
			continue
		}
		for _, value := range data.delta.exposures {
			if value.creating == nil && validNativePrimitiveEndpoint(value.endpoint) && sameNativePrimitiveResult(value.endpoint.nativePrimitive, p) && work.nativePrimitivePayloadApplied(child, p, path) {
				return true
			}
		}
	}
	return false
}

func (work *callableEffectWork) nativePrimitivePayloadsApplied(recipe sourceStagedOperationRecipe) bool {
	for _, value := range recipe.delta.exposures {
		if value.endpoint.nativePrimitive == nil && value.endpoint.kind != relativeEndpointNativePrimitive {
			continue
		}
		if value.creating != nil || !validNativePrimitiveEndpoint(value.endpoint) || !work.nativePrimitivePayloadApplied(recipe, value.endpoint.nativePrimitive, nil) {
			return false
		}
	}
	return true
}

func (work *callableEffectWork) passiveNativePrimitiveResultReady(recipe sourceStagedOperationRecipe) bool {
	return nativePrimitivePayloadPresent(recipe) && recipe.delta.extracted && work.freshStagedCallResultReading(recipe) && work.nativePrimitivePayloadsApplied(recipe)
}

func validNativePrimitiveRequired(recipe sourceStagedOperationRecipe, p *sourceNativePrimitiveResult) bool {
	if !validNativePrimitiveResult(p) {
		return false
	}
	required := []sourceStagedOperationRequest{p.original}
	if p.inputRequired.producer.operation != nil {
		required = append(required, p.inputRequired)
	}
	return len(required) == len(recipe.delta.required) && operationPrefix(required, recipe.delta.required, sameOperationRequest)
}

// nativePrimitiveDataApplied is local delivery accounting, not transitive
// closure. Pending/foreign source recipes and merely consumed-but-unapplied
// transport cannot supply an operand or forwarded primitive source.
func (work *callableEffectWork) nativePrimitiveDataApplied(request sourceStagedOperationRequest) (sourceStagedOperationDelivery, bool) {
	data, applied := work.stagedCallResultData(request)
	if !applied {
		return data, false
	}
	recipe, registered := work.operationRecipes[request.producer]
	if !registered || recipe.callResult == nil || recipe.callResult.generation != work.operationGeneration || !validStagedCallResultRecipe(recipe) {
		return data, false
	}
	state := &work.operations[data.producer.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	return data, !state.invalid && state.dependenciesRegistered && subscriber != nil && subscriber.consumed == data.revision && subscriber.applied == data.revision && !subscriber.blocked
}
