package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// stagedNativeInputBindingDeclaration bounds lexical admission only. The
// initializer still needs its original DATA, Effects and selected-source owners.
// Object mutation is not excluded by the binding's lexical immutability.
func stagedNativeInputBindingDeclaration(read, caller *ast.Node, owner *executableBodyOwner) *ast.Node {
	binding := stagedBindingDataDeclaration(read, caller, owner)
	if binding == nil || !ast.IsVariableDeclaration(binding) || binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || binding.Initializer() == nil || enclosingCallableNode(binding) != enclosingCallableNode(read) {
		return nil
	}
	symbol := owner.checker.GetSymbolAtLocation(read)
	if symbol == nil || owner.values.bindingWritten(symbol) {
		return nil
	}
	return binding
}

func nativeInputBindingRequest(parent sourceStagedOperationRequest, read *ast.Node) sourceStagedOperationRequest {
	if read == nil || parent.use == nil {
		return sourceStagedOperationRequest{}
	}
	request := stagedBindingResultRequest(read, parent.consumer)
	request.reading = parent.producer
	request.edge = fmt.Sprintf("native-input-data:%d:%d", parent.use.Pos(), read.Pos())
	return request
}

func nativeInputBindingParent(parent sourceStagedOperationRequest, read *ast.Node) bool {
	call := parent.producer.operation
	if read == nil || !ast.IsIdentifier(read) || call == nil || !ast.IsCallExpression(call) || parent.producer.kind != relativeDemandEffects || parent.producer.declaration != parent.consumer || parent.use != call || parent.inputs != nil || parent.reading != (sourceStagedOperationKey{}) || parent.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || parent.producer.selector != (sourceStagedOperationSelector{occurrence: call.Expression(), field: "algorithm"}) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	return len(actuals) == 1 && actuals[0] == read
}

// validNativeInputBindingPlan describes the actual Identifier and its DATA debt,
// never a substituted initializer endpoint or a current native result.
func validNativeInputBindingPlan(plan sourceStagedNativeInputPlan, source *sourceStagedNativeGetSource) bool {
	return source != nil && source.kind == sourceNativeObjectFreeze && plan.kind == source.kind && sameOperationRequest(plan.request, nativeRootDebtRequest(source, "algorithm")) && nativeInputBindingParent(plan.request, plan.input.expression) && sameOperationEndpoint(plan.input, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: plan.input.expression, producer: source.request.use, cut: source.request.cut}) && sameOperationRequest(plan.bindingData, nativeInputBindingRequest(plan.request, plan.input.expression))
}

// validNativeInputBindingReading is the detached factory correlation. The
// registration and reader owners separately require the actual parent recipe.
func validNativeInputBindingReading(source *sourceStagedCallResultSource, reading sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	if source == nil || source.binding == nil || !ast.IsVariableDeclaration(source.binding) || source.binding.Parent == nil || !ast.IsVariableDeclarationList(source.binding.Parent) || source.binding.Parent.Flags&ast.NodeFlagsConst == 0 {
		return false
	}
	read := source.request.producer.operation
	parent := sourceStagedOperationRequest{producer: reading.reading, consumer: reading.consumer, use: reading.reading.operation, cut: cut}
	return enclosingCallableNode(source.binding) == enclosingCallableNode(read) && nativeInputBindingParent(parent, read) && sameOperationRequest(source.request, stagedBindingResultRequest(read, parent.consumer)) && sameOperationRequest(reading, nativeInputBindingRequest(parent, read))
}

func (work *callableEffectWork) nativeInputBindingParent(facts []callableFacts, parent sourceStagedOperationRequest, read *ast.Node) (sourceStagedOperationRecipe, int, bool) {
	recipe, known := work.operationRecipes[parent.producer]
	caller, owned := work.memberNodes[parent.consumer]
	if !known || !owned || caller < 0 || caller >= len(facts) || len(work.operationFacts) != len(facts) || &work.operationFacts[caller] != &facts[caller] || recipe.nativeGet == nil || recipe.nativeGet.kind != sourceNativeObjectFreeze || !validNativeGetRecipe(recipe) || !validNativeGetRequest(recipe, parent) || !nativeInputBindingParent(parent, read) {
		return sourceStagedOperationRecipe{}, 0, false
	}
	return recipe, caller, true
}

// prepareNativeInputBinding enrolls the existing binding DATA producer before
// parent adoption. It creates neither an ordinary use nor a source observation.
func (work *callableEffectWork) prepareNativeInputBinding(facts []callableFacts, parent sourceStagedOperationRequest, read *ast.Node, owner *executableBodyOwner) (sourceStagedOperationRequest, bool) {
	if owner == nil || owner.values == nil || owner.values.program == nil || owner.values.generation == nil || owner.values.generation != work.operationGeneration {
		return sourceStagedOperationRequest{}, false
	}
	_, caller, valid := work.nativeInputBindingParent(facts, parent, read)
	if !valid || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return sourceStagedOperationRequest{}, false
	}
	publisher := owner.pendingMemberPublishers[facts[caller].node]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] {
		return sourceStagedOperationRequest{}, false
	}
	binding := stagedNativeInputBindingDeclaration(read, facts[caller].node, owner)
	if binding == nil {
		return sourceStagedOperationRequest{}, false
	}
	source := &sourceStagedCallResultSource{request: stagedBindingResultRequest(read, parent.consumer), declaration: parent.consumer, binding: binding, generation: work.operationGeneration}
	reading := nativeInputBindingRequest(parent, read)
	if !work.registerStagedCallResultReading(facts, source, reading, parent.cut, nil) {
		return sourceStagedOperationRequest{}, false
	}
	return reading, true
}

// inputBindingData consumes only a registered, required current applied prefix.
// Endpoint alternatives and all their required sources remain independent of
// whether the parent can establish its conditional native input relation.
func (work *callableEffectWork) inputBindingData(facts []callableFacts, parent, reading sourceStagedOperationRequest) (sourceStagedOperationDelivery, bool) {
	recipe, _, valid := work.nativeInputBindingParent(facts, parent, reading.producer.operation)
	source := work.operationRecipes[reading.producer].callResult
	if !valid || source == nil || source.generation != work.operationGeneration || !validNativeInputBindingReading(source, reading, parent.cut) || !operationContainsRequest(recipe.delta.required, reading) {
		return sourceStagedOperationDelivery{}, false
	}
	registered := false
	for i, r := range source.readings {
		registered = registered || sameOperationRequest(r, reading) && source.readCuts[i] == parent.cut
	}
	if !registered {
		return sourceStagedOperationDelivery{}, false
	}
	return work.stagedCallResultData(reading)
}
