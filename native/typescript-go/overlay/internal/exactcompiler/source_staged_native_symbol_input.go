package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// describeSelectedNativeSymbolInput detaches the original argument association
// of an already selected standard Symbol.for alternative. The original member
// owner supplies selection authority. An exposure category cannot supply it.
// Neither the argument's type nor syntax establishes ToString effects, key
// identity, primitive value, normal success or any algorithm readiness.
func describeSelectedNativeSymbolInput(selection sourceStagedNativeSelection) (sourceStagedNativeInputPlan, bool) {
	var plan sourceStagedNativeInputPlan
	selected, request, call := selection.selected, selection.request, selection.call
	if selected.native == nil || selected.native.kind != sourceNativeSymbolFor || selected.node == nil || selected.node.Kind != ast.KindMethodSignature || !standardLibrarySource(ast.GetSourceFileOfNode(selected.node)) || len(selected.path) != 0 || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || selection.get != call.Expression() || selection.descriptorGet != nil || request.producer.declaration == nil || request.producer.operation != call || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || request.consumer != request.producer.declaration || request.inputs != nil || request.use != call || request.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) {
		return plan, false
	}
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	if len(arguments) != 1 || arguments[0] == nil || ast.IsSpreadElement(arguments[0]) || len(selection.actuals) != 1 {
		return plan, false
	}
	canonical := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: arguments[0], producer: call, cut: request.cut}
	if !sameOperationEndpoint(selection.actuals[0], canonical) {
		return plan, false
	}
	source := sourceStagedNativeGetSource{request: request, get: selection.get}
	return sourceStagedNativeInputPlan{request: nativeRootDebtRequest(&source, "algorithm"), kind: sourceNativeSymbolFor, input: cloneSourceRelativeEndpoint(selection.actuals[0])}, true
}
