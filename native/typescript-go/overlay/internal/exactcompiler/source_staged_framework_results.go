package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// describeStagedFrameworkResult is used by the existing original result-reader
// registrar before recursive invocation fallback. It describes the real import
// and original argument source, not an acquired callable or a completed result.
func (work *callableEffectWork) describeStagedFrameworkResult(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) (*sourceStagedCallResultSource, bool) {
	if caller < 0 || caller >= len(facts) || owner == nil || owner.values == nil || owner.checker == nil || owner.values.generation != work.operationGeneration || !sourceStagedOccurrenceOwned(call, facts[caller].node) || !ast.IsCallExpression(call) || !ast.IsIdentifier(call.Expression()) {
		return nil, false
	}
	symbol := resolvedCallableSymbol(callTargetSymbol(call.Expression(), owner.checker), owner.checker)
	if symbol == nil {
		return nil, false
	}
	declaration := reactiveObjectsViewDeclaration(call, symbol.Declarations, owner)
	if declaration == nil {
		return nil, false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 1 || ast.IsSpreadElement(actuals[0]) {
		return nil, false
	}
	endpoint := sourceStagedArgumentEndpoint(actuals[0], call, facts[caller].node, owner.values)
	cut := sourceRelativeCut{operation: call, use: call, reading: actuals[0]}
	// The argument owner supplies its original read cut independently of the
	// result producer's canonical Call cut. No caller input frame is installed.
	input := sourceRelativeBinding{target: sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: 0}, sources: []sourceRelativeEndpoint{endpoint}}
	view, valid := describeReactiveObjectsStorageView(call, symbol.Declarations, input, relativeInputsSupported, cut, owner)
	if !valid {
		return nil, false
	}
	return &sourceStagedCallResultSource{request: stagedCallResultRequest(call, facts[caller].node), declaration: declaration, generation: work.operationGeneration, frameworkView: &view}, true
}

func frameworkResultRequirements(source *sourceStagedCallResultSource) []sourceStagedOperationRequest {
	call, caller := source.request.producer.operation, source.request.producer.declaration
	required := []sourceStagedOperationRequest{stagedFrameworkEffectsRequest(call, caller)}
	argument := source.frameworkView.argument
	if ast.IsIdentifier(argument) {
		required = append(required, stagedBindingResultRequest(argument, caller))
	} else if stagedResultExpression(argument) {
		required = append(required, stagedResultSourceRequest(argument, caller, nil))
	}
	return required
}

// validStagedFrameworkResultRecipe validates conditional source-domain DATA.
// Extraction represents the framework view operator, not a normal value or an
// exhaustive raw-donor set. Original Call/input work remains separately required;
// the marker carries unwrap/transformed semantics through every later consumer.
func validStagedFrameworkResultRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	if recipe.key.operation == nil || !ast.IsCallExpression(recipe.key.operation) || recipe.key.declaration == nil || recipe.key.kind != relativeDemandDirectExposure || !sourceStagedOccurrenceOwned(recipe.key.operation, recipe.key.declaration) || source == nil || source.frameworkView == nil || source.binding != nil || source.operand != nil || source.getResult != nil || source.nativeCall || source.constructedRoot.producer.operation != nil || source.association.invocation.operation != nil || source.association.inputs != nil || source.association.sourceInputs != nil || source.generation == nil || source.request.producer != recipe.key || !sameOperationRequest(source.request, stagedCallResultRequest(recipe.key.operation, recipe.key.declaration)) || source.declaration != source.frameworkView.declaration || source.generation != source.frameworkView.generation || source.frameworkView.call != recipe.key.operation {
		return false
	}
	if recipe.frameworkEffects != nil || recipe.moduleArgument != nil || recipe.declarationCall != nil || recipe.entryLaw != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.hasInstance != nil || recipe.memberSource != nil || recipe.nativeGet != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 || len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	view := source.frameworkView
	if view.argument == nil || view.cut != (sourceRelativeCut{operation: view.call, use: view.call, reading: view.argument}) || view.input.target != (sourceRelativeRole{kind: relativeRoleFormal, declaration: view.declaration, slot: 0}) || len(view.input.sources) != 1 || len(view.input.pending) != 0 || view.input.unknown || view.input.sources[0].frameworkView != nil {
		return false
	}
	if len(source.readings) != len(source.readCuts) {
		return false
	}
	for _, input := range source.inputReadings {
		if !validStagedInputCallResultReading(source, input) {
			return false
		}
	}
	for i, reading := range source.readings {
		parent := sourceStagedOperationRequest{producer: reading.reading, consumer: reading.consumer}
		inputRead := false
		for _, input := range source.inputReadings {
			inputRead = inputRead || sameOperationRequest(input.request, reading) && input.call.invocation.cut == source.readCuts[i]
		}
		if reading.producer != recipe.key || reading.inputs != nil || !inputRead && !validStagedMemberObservation(parent, source.readCuts[i]) {
			return false
		}
	}
	if len(recipe.delta.required) == 0 && len(recipe.delta.exposures) == 0 {
		return !recipe.delta.extracted
	}
	required := frameworkResultRequirements(source)
	if len(recipe.delta.required) != len(required) || len(recipe.delta.exposures) != 1 {
		return false
	}
	for i, r := range required {
		if !sameOperationRequest(r, recipe.delta.required[i]) {
			return false
		}
	}
	endpoint := recipe.delta.exposures[0].endpoint
	expected := sourceRelativeEndpoint{kind: relativeEndpointFrameworkView, producer: view.call, cut: source.request.cut, frameworkView: view}
	return recipe.delta.exposures[0].creating == nil && sameOperationEndpoint(endpoint, expected)
}

// prepareStagedFrameworkResult retains the original result reader on the
// existing DATA queue. The actual lexical input producer can deliver independently;
// the original Call Effects owner stays required. Extraction represents the
// conditional view source operator; concrete value/presence and unwrap outputs
// remain unavailable and cannot be promoted through the marker.
func (work *callableEffectWork) prepareStagedFrameworkResult(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	source := recipe.callResult
	if !validStagedFrameworkResultRecipe(recipe) || owner == nil || owner.values == nil || source.generation != owner.values.generation || source.generation != work.operationGeneration {
		return
	}
	caller, known := work.memberNodes[recipe.key.declaration]
	if !known {
		return
	}
	actual, current := work.describeStagedFrameworkResult(facts, caller, recipe.key.operation, owner)
	if !current || !sameStagedCallResultSource(actual, source) {
		return
	}
	required := frameworkResultRequirements(source)
	if effects, registered := work.registerStagedFrameworkEffects(facts, caller, recipe.key.operation, owner); !registered || !sameOperationRequest(effects, required[0]) {
		return
	}
	inputRepresented := len(required) == 1 && stagedEmptyArrayDataConstruction(source.frameworkView.argument)
	if len(required) > 1 {
		child, eligible := work.describeStagedCallResultSource(facts, caller, source.frameworkView.argument, owner)
		if eligible && sameOperationRequest(child.request, required[1]) {
			if _, registered := work.operationRecipes[child.request.producer]; registered || work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: child.request.producer, callResult: child}) {
				if _, admitted := work.requireOperation(facts, child.request); admitted {
					if data, applied := work.stagedCallResultData(child.request); applied {
						inputRepresented = data.delta.extracted
					}
				}
			}
		}
	}
	view := projectFrameworkStorageView(*source.frameworkView, nil)
	recipe.delta = sourceStagedOperationDelta{extracted: inputRepresented, required: required, exposures: []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointFrameworkView, producer: view.call, cut: source.request.cut, frameworkView: &view}}}}
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, recipe.delta)
	}
}

// currentFrameworkResultViews consumes only the original synchronous reader's
// applied DATA and complete required source work. Descriptor equality alone is
// not currentness; neither a clone nor another Get/cut can use this reading.
func (work *callableEffectWork) currentFrameworkResultViews(facts []callableFacts, q *sourceValueQuery, recipe sourceStagedOperationRecipe) ([]sourceFrameworkStorageView, sourceStagedOperationRequest) {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || !validStagedFrameworkResultRecipe(recipe) || recipe.callResult.generation != work.operationGeneration {
		return nil, sourceStagedOperationRequest{}
	}
	for index, reading := range recipe.callResult.readings {
		if reading.consumer != b.request.consumer || recipe.callResult.readCuts[index] != b.observation {
			continue
		}
		if views := work.currentFrameworkResultViewsAtReading(recipe, reading, b.request, b.observation); len(views) != 0 {
			return views, reading
		}
	}
	return nil, sourceStagedOperationRequest{}
}

// currentFrameworkResultViewsAtReading is shared by actual member readers and
// receiver-DATA preparation. The exact closed/APPLIED reader, not a lexical
// reference or saved payload, owns this conditional typed source transport.
func (work *callableEffectWork) currentFrameworkResultViewsAtReading(recipe sourceStagedOperationRecipe, reading, parent sourceStagedOperationRequest, cut sourceRelativeCut) []sourceFrameworkStorageView {
	registered, present := work.operationRecipes[recipe.key]
	if !present || reading.producer != recipe.key || !sameStagedCallResultSource(registered.callResult, recipe.callResult) || work.operationGeneration == nil || !work.operationGeneration.active || work.operationGeneration.project == nil || work.operationGeneration.project.activeGeneration != work.operationGeneration || !validStagedFrameworkResultRecipe(registered) || registered.callResult.generation != work.operationGeneration || !work.stagedMemberResultReading(reading, parent, cut) {
		return nil
	}
	recipe = registered
	id, adopted := work.operationIDs[recipe.key]
	closed := work.closedOperationDependencies()
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(closed) || !closed[id.index] {
		return nil
	}
	data, applied := work.stagedCallResultData(reading)
	if !applied || !data.delta.extracted || len(data.delta.exposures) != 1 {
		return nil
	}
	endpoint := data.delta.exposures[0].endpoint
	if endpoint.kind != relativeEndpointFrameworkView || endpoint.frameworkView == nil || !sameFrameworkStorageView(endpoint.frameworkView, recipe.callResult.frameworkView) {
		return nil
	}
	return []sourceFrameworkStorageView{projectFrameworkStorageView(*endpoint.frameworkView, nil)}
}
