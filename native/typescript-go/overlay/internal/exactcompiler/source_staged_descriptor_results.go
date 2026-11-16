package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// describeNativeDescriptorResult enrolls a conditional result-source request.
// The syntax bounds the requested producer only: a descriptor view cannot be
// extracted until the original standard Get, input DATA and Call Effects arrive.
func (work *callableEffectWork) describeNativeDescriptorResult(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) (*sourceStagedCallResultSource, bool) {
	if owner == nil || owner.values == nil || caller < 0 || caller >= len(facts) || work.operationGeneration != owner.values.generation || !stagedNativeInputSourceOwner(&facts[caller], call, owner) || !stagedNativeInputEligible(call, &facts[caller], owner) || !descriptorRetrievalIntent(call) {
		return nil, false
	}
	original, issued := stagedNativeInputOccurrenceRequest(&facts[caller], call)
	if !issued {
		return nil, false
	}
	if prior := work.operationRecipes[original.producer].nativeGet; prior != nil {
		original = prior.request
	}
	intent := &sourceStagedDescriptorRetrieval{request: original, generation: work.operationGeneration}
	for i, actual := range restrictedInvocationArguments(call.AsCallExpression()) {
		intent.actuals[i] = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actual, producer: call, cut: original.cut}
	}
	return &sourceStagedCallResultSource{request: stagedCallResultRequest(call, facts[caller].node), declaration: facts[caller].node, generation: work.operationGeneration, nativeDescriptor: intent}, true
}

func nativeDescriptorResultRequirements(source *sourceStagedCallResultSource) ([]sourceStagedOperationRequest, bool) {
	if source == nil || source.nativeDescriptor == nil {
		return nil, false
	}
	intent := source.nativeDescriptor
	root := sourceStagedNativeGetSource{request: intent.request, get: intent.request.use.Expression()}
	required := []sourceStagedOperationRequest{intent.request, nativeRootDebtRequest(&root, "callee-get")}
	for _, endpoint := range intent.actuals {
		argument := endpoint.expression
		if ast.IsIdentifier(argument) {
			required = append(required, stagedBindingResultRequest(argument, source.request.producer.declaration))
		} else if stagedResultExpression(argument) {
			required = append(required, stagedResultSourceRequest(argument, source.request.producer.declaration, nil))
		} else if !stagedSourceDataValue(argument) {
			return required, false // Unrepresented input work is never runtime unknown.
		}
	}
	return required, true
}

func validNativeDescriptorResultRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	if source == nil || source.nativeDescriptor == nil || source.generation == nil || source.generation != source.nativeDescriptor.generation || source.request.producer != recipe.key || recipe.key.kind != relativeDemandDirectExposure || recipe.key.operation == nil || !descriptorRetrievalIntent(recipe.key.operation) || source.declaration != recipe.key.declaration || source.nativeDescriptor.request.producer.declaration != recipe.key.declaration || source.nativeDescriptor.request.use != recipe.key.operation || !sameOperationRequest(source.request, stagedCallResultRequest(recipe.key.operation, recipe.key.declaration)) || source.frameworkView != nil || source.binding != nil || source.operand != nil || source.getResult != nil || source.nativeCall || source.constructedRoot.producer.operation != nil || source.association.invocation.operation != nil {
		return false
	}
	if recipe.descriptorSource != nil || recipe.frameworkEffects != nil || recipe.moduleArgument != nil || recipe.declarationCall != nil || recipe.declarationCallGeneration != nil || recipe.entryLaw != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.hasInstance != nil || recipe.memberSource != nil || recipe.nativeGet != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards)+len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 || len(source.readings) != len(source.readCuts) {
		return false
	}
	for _, input := range source.inputReadings {
		if !validStagedInputCallResultReading(source, input) {
			return false
		}
	}
	for i, reading := range source.readings {
		parent := sourceStagedOperationRequest{producer: reading.reading, consumer: reading.consumer}
		input := false
		for _, actual := range source.inputReadings {
			input = input || sameOperationRequest(actual.request, reading) && actual.call.invocation.cut == source.readCuts[i]
		}
		if reading.producer != recipe.key || reading.inputs != nil || !input && !validStagedMemberObservation(parent, source.readCuts[i]) {
			return false
		}
	}
	if operationDeltaSize(recipe.delta) == 0 {
		return !recipe.delta.extracted
	}
	required, supported := nativeDescriptorResultRequirements(source)
	if !supported || len(recipe.delta.required) != len(required) || len(recipe.delta.exposures) != 1 {
		return false
	}
	for i, request := range required {
		if !sameOperationRequest(request, recipe.delta.required[i]) {
			return false
		}
	}
	output := recipe.delta.exposures[0]
	view := output.endpoint.descriptorView
	if output.creating != nil || view == nil || view.inputs[0].application != nil || view.inputs[1].application != nil || !sameOperationRequest(view.delivery, sourceStagedOperationRequest{}) || !validDescriptorInputData(source.nativeDescriptor, 0, view.inputs[0]) || !validDescriptorInputData(source.nativeDescriptor, 1, view.inputs[1]) || view.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(view.method)) || !sameDescriptorRetrieval(&view.source, source.nativeDescriptor) || len(view.projection) != 0 {
		return false
	}
	expected := sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, producer: recipe.key.operation, cut: source.request.cut, descriptorView: view}
	return sameOperationEndpoint(output.endpoint, expected)
}

// nativeDescriptorResultCurrent requires the real registered standard branch
// and its fresh graph-local complete Get. A cloned or forged result description
// cannot authenticate its own method, input association or source generation.
func (work *callableEffectWork) nativeDescriptorResultCurrent(recipe sourceStagedOperationRecipe) bool {
	if work.operationGeneration == nil || !work.operationGeneration.active || work.operationGeneration.project == nil || work.operationGeneration.project.activeGeneration != work.operationGeneration || !validNativeDescriptorResultRecipe(recipe) || !recipe.delta.extracted || recipe.callResult.generation != work.operationGeneration || len(recipe.delta.exposures) != 1 {
		return false
	}
	intent := recipe.callResult.nativeDescriptor
	root := work.operationRecipes[intent.request.producer]
	view := recipe.delta.exposures[0].endpoint.descriptorView
	return root.nativeGet != nil && validDescriptorRetrieval(root.nativeGet) && sameDescriptorRetrieval(root.nativeGet.descriptorRead, intent) && root.nativeGet.method == view.method && work.nativeEffectsGetCurrent(root.nativeGet) && work.descriptorViewInputDataCurrent(view)
}

// prepareNativeDescriptorResult keeps DATA separate from the Call's Effects.
// Extraction describes the complete native result operator, not a raw donor set
// or concrete descriptor presence. Every input and runtime-MAY/Throw owner stays
// required; the reader below additionally requires their real closed deliveries.
func (work *callableEffectWork) prepareNativeDescriptorResult(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil || owner.project == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !validNativeDescriptorResultRecipe(recipe) || recipe.callResult.generation != work.operationGeneration {
		return
	}
	caller, known := work.memberNodes[recipe.key.declaration]
	publisher := owner.pendingMemberPublishers[recipe.key.declaration]
	if !known || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	intent := recipe.callResult.nativeDescriptor
	root := work.operationRecipes[intent.request.producer].nativeGet
	if !validDescriptorRetrieval(root) || !sameDescriptorRetrieval(root.descriptorRead, intent) || !work.nativeEffectsGetCurrent(root) {
		return
	}
	required, supported := nativeDescriptorResultRequirements(recipe.callResult)
	if !supported {
		return
	}
	inputsRepresented := true
	for _, request := range required[2:] {
		child, eligible := work.describeStagedCallResultSource(facts, caller, request.producer.operation, owner)
		if !eligible || !sameOperationRequest(child.request, request) {
			return
		}
		if _, registered := work.operationRecipes[request.producer]; !registered && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, callResult: child}) {
			return
		}
		if _, adopted := work.requireOperation(facts, request); !adopted {
			return
		}
		data, applied := work.stagedCallResultData(request)
		inputsRepresented = inputsRepresented && applied && data.delta.extracted
	}
	view := sourceNativeDescriptorView{source: *cloneDescriptorRetrieval(intent), method: root.method}
	for position := range view.inputs {
		input, applied := work.descriptorInputData(intent, position)
		if !applied {
			return
		}
		view.inputs[position] = input
	}
	recipe.delta = sourceStagedOperationDelta{extracted: inputsRepresented, required: required, exposures: []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, producer: recipe.key.operation, cut: recipe.callResult.request.cut, descriptorView: &view}}}}
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, recipe.delta)
	}
}

// currentNativeDescriptorViews retains its original native-only entry contract.
func (work *callableEffectWork) currentNativeDescriptorViews(facts []callableFacts, q *sourceValueQuery, recipe sourceStagedOperationRecipe) ([]sourceNativeDescriptorView, sourceStagedOperationRequest) {
	if recipe.callResult == nil || recipe.callResult.nativeDescriptor == nil {
		return nil, sourceStagedOperationRequest{}
	}
	return work.currentDeliveredDescriptorViews(facts, q, recipe)
}
