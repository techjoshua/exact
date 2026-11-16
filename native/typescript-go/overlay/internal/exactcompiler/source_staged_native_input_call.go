package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeInputPlan describes a conditional source input association.
// It carries no result, identity, integrity, normal completion, NoWrites or
// algorithm readiness. Input construction retains its independent Effects owner.
type sourceStagedNativeInputPlan struct {
	request     sourceStagedOperationRequest
	kind        sourceNativeKind
	input       sourceRelativeEndpoint
	bindingData sourceStagedOperationRequest // Original binding reader, never initializer substitution.
}

// describeSelectedNativeInputCall consumes only an already selected input-operation
// alternative and its original ordered argument. The live member owner supplies
// native authentication. Literal fields are not interpreted or acquired here.
// Freeze and create do not invoke stored accessors/callbacks. Creation effects, including
// computed/spread/reference work, remain owed at their original input operation.
func describeSelectedNativeInputCall(selection sourceStagedNativeSelection) (sourceStagedNativeInputPlan, bool) {
	var plan sourceStagedNativeInputPlan
	selected, request := selection.selected, selection.request
	call := selection.call
	if selected.native == nil || selected.native.kind != sourceNativeObjectFreeze && selected.native.kind != sourceNativeObjectCreate || selected.node == nil || selected.node.Kind != ast.KindMethodSignature || !standardLibrarySource(ast.GetSourceFileOfNode(selected.node)) || len(selected.path) != 0 || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || selection.get != call.Expression() || request.producer.declaration == nil || request.producer.operation != call || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || request.consumer != request.producer.declaration || request.inputs != nil || request.use != call || request.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) {
		return plan, false
	}
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	if len(arguments) != 1 || len(selection.actuals) != 1 || ast.IsSpreadElement(arguments[0]) || selected.native.kind == sourceNativeObjectFreeze && !ast.IsObjectLiteralExpression(arguments[0]) && !ast.IsCallExpression(arguments[0]) && !ast.IsIdentifier(arguments[0]) {
		return plan, false
	}
	canonical := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: arguments[0], producer: call, cut: request.cut}
	if !sameOperationEndpoint(selection.actuals[0], canonical) {
		return plan, false
	}
	source := sourceStagedNativeGetSource{request: request, get: selection.get}
	plan = sourceStagedNativeInputPlan{request: nativeRootDebtRequest(&source, "algorithm"), kind: selected.native.kind, input: cloneSourceRelativeEndpoint(selection.actuals[0])}
	if selected.native.kind == sourceNativeObjectFreeze && ast.IsIdentifier(arguments[0]) {
		plan.bindingData = nativeInputBindingRequest(plan.request, arguments[0])
		// The legacy literal owner cannot pay binding DATA. The typed input
		// owner must register this description before admitting either phase.
		return plan, false
	}
	return plan, true
}
