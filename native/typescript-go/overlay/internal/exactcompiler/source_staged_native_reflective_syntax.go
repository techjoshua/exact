package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedReflectiveInputSyntax validates detached input positions, not native
// selection or lexical values. The live producer authenticates those separately.
func stagedReflectiveInputSyntax(plan sourceStagedNativeEagerInputs, sources ...*sourceStagedNativeGetSource) bool {
	call := plan.request.producer.operation
	if call == nil || !ast.IsCallExpression(call) || len(plan.actuals) != 3 {
		return false
	}
	args := restrictedInvocationArguments(call.AsCallExpression())
	keyCovered := len(args) == 3 && sourcePrimitiveValue(args[1]) && sourceInertValueCreation(args[1])
	if len(args) == 3 && len(sources) == 1 {
		keyCovered = keyCovered || nativeEagerKeyDescription(sources[0], args[1]) != nil
	}
	if len(args) != 3 || !keyCovered || !ast.IsObjectLiteralExpression(args[2]) {
		return false
	}
	targetCovered := ast.IsObjectLiteralExpression(args[0]) && sourceInertValueCreation(args[0])
	if plan.targetPending == targetCovered || !targetCovered && !stagedReflectivePendingTarget(args[0]) {
		return false
	}
	for i, actual := range plan.actuals {
		if !sameOperationEndpoint(actual, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: args[i], producer: call, cut: plan.request.cut}) {
			return false
		}
	}
	nextCall, nextOperation := 0, 0
	for _, property := range args[2].AsObjectLiteralExpression().Properties.Nodes {
		if property.Name() == nil || ast.IsComputedPropertyName(property.Name()) || callableNameText(property.Name()) == "__proto__" {
			return false
		}
		switch {
		case ast.IsMethodDeclaration(property), ast.IsGetAccessorDeclaration(property), ast.IsSetAccessorDeclaration(property):
			continue
		case ast.IsShorthandPropertyAssignment(property):
			if property.AsShorthandPropertyAssignment().ObjectAssignmentInitializer != nil {
				return false
			}
			continue
		case !ast.IsPropertyAssignment(property):
			return false
		}
		value := property.AsPropertyAssignment().Initializer
		if nextCall < len(plan.calls) && plan.calls[nextCall].property == property {
			if !stagedEagerCallPosition(plan.calls[nextCall], value, property, 2) {
				return false
			}
			nextCall++
			continue
		}
		if nextOperation < len(plan.operations) && plan.operations[nextOperation].property == property {
			operation := plan.operations[nextOperation]
			if operation.actual != 2 || operation.operation != value || !ast.IsCallExpression(value) || stagedNativeInputIntent(value.Expression()) == 0 {
				return false
			}
			nextOperation++
			continue
		}
		if !ast.IsIdentifier(value) && !sourceInertValueCreation(value) {
			return false
		}
	}
	return nextCall == len(plan.calls) && nextOperation == len(plan.operations)
}
