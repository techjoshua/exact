package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// describeStagedLiteralCreation extracts reached initializer Calls in JavaScript
// property order. Creation stores deferred callable bodies without activating
// them. Every Call still requires its original binder and canonical summary.
// This describes Effects only, never the values produced by those Calls.
func describeStagedLiteralCreation(node *ast.Node, caller *callableFacts, owner *executableBodyOwner) ([]sourceStagedNativeEagerCall, bool) {
	var calls []sourceStagedNativeEagerCall
	var visit func(*ast.Node, *ast.Node) bool
	visit = func(node, property *ast.Node) bool {
		node = unwrapSourceCallableReference(node)
		if node == nil {
			return false
		}
		if ast.IsCallExpression(node) {
			if caller == nil || property == nil || !ast.IsPropertyAssignment(property) || property.AsPropertyAssignment().Initializer != node || len(restrictedInvocationArguments(node.AsCallExpression())) != 0 {
				return false
			}
			invocation, gap := describeStagedDeclarationInvocation(caller, node, owner.checker, owner)
			if gap != stagedCallSupported || len(invocation.declaration.Parameters()) != 0 || len(invocation.actuals)+len(invocation.captures) != 0 || !stagedFieldGetterInputsMapped(invocation.declaration, nil, owner) {
				return false
			}
			calls = append(calls, sourceStagedNativeEagerCall{actual: 0, property: property, invocation: invocation})
			return true
		}
		if !ast.IsObjectLiteralExpression(node) {
			return stagedLiteralInputEffects(node, owner)
		}
		for _, member := range node.AsObjectLiteralExpression().Properties.Nodes {
			if member.Name() == nil || ast.IsComputedPropertyName(member.Name()) {
				return false
			}
			switch {
			case ast.IsPropertyAssignment(member):
				if !visit(member.AsPropertyAssignment().Initializer, member) {
					return false
				}
			case ast.IsShorthandPropertyAssignment(member):
				if member.AsShorthandPropertyAssignment().ObjectAssignmentInitializer != nil || !stagedLiteralInputEffects(member.Name(), owner) {
					return false
				}
			case ast.IsMethodDeclaration(member), ast.IsGetAccessorDeclaration(member), ast.IsSetAccessorDeclaration(member):
			default:
				return false
			}
		}
		return true
	}
	if owner == nil || owner.checker == nil || !visit(node, nil) {
		return nil, false
	}
	return calls, true
}

// stagedLiteralCreationCallSyntax rechecks detached positions and ordered Call
// associations. The live producer already authenticated lexical bindings and
// declarations. This validator supplies neither selection nor binder delivery.
func stagedLiteralCreationCallSyntax(plan sourceStagedNativeEagerInputs) bool {
	if len(plan.actuals) != 1 || len(plan.calls) == 0 || plan.targetPending {
		return false
	}
	call := plan.request.producer.operation
	if call == nil || !ast.IsCallExpression(call) {
		return false
	}
	args := restrictedInvocationArguments(call.AsCallExpression())
	if len(args) != 1 || !ast.IsObjectLiteralExpression(args[0]) || !sameOperationEndpoint(plan.actuals[0], sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: args[0], producer: call, cut: plan.request.cut}) {
		return false
	}
	next := 0
	var visit func(*ast.Node, *ast.Node) bool
	visit = func(node, property *ast.Node) bool {
		node = unwrapSourceCallableReference(node)
		if node == nil {
			return false
		}
		if ast.IsCallExpression(node) {
			if next == len(plan.calls) || !stagedEagerCallPosition(plan.calls[next], node, property, 0) {
				return false
			}
			next++
			return true
		}
		if !ast.IsObjectLiteralExpression(node) {
			return ast.IsIdentifier(node) || sourceInertValueCreation(node)
		}
		for _, member := range node.AsObjectLiteralExpression().Properties.Nodes {
			if member.Name() == nil || ast.IsComputedPropertyName(member.Name()) {
				return false
			}
			switch {
			case ast.IsPropertyAssignment(member):
				if !visit(member.AsPropertyAssignment().Initializer, member) {
					return false
				}
			case ast.IsShorthandPropertyAssignment(member):
				if member.AsShorthandPropertyAssignment().ObjectAssignmentInitializer != nil {
					return false
				}
			case ast.IsMethodDeclaration(member), ast.IsGetAccessorDeclaration(member), ast.IsSetAccessorDeclaration(member):
			default:
				return false
			}
		}
		return true
	}
	return visit(args[0], nil) && next == len(plan.calls)
}

func stagedEagerCallPosition(item sourceStagedNativeEagerCall, operation, property *ast.Node, actual int) bool {
	inv := item.invocation
	return property != nil && ast.IsPropertyAssignment(property) && property.AsPropertyAssignment().Initializer == operation && item.actual == actual && item.property == property && inv.operation == operation && ast.IsCallExpression(operation) && ast.IsIdentifier(operation.Expression()) && operation.AsCallExpression().QuestionDotToken == nil && len(restrictedInvocationArguments(operation.AsCallExpression())) == 0 && envelopeSynchronousFunction(inv.declaration) && len(inv.declaration.Parameters()) == 0 && inv.actualsKnown && len(inv.actuals)+len(inv.captures) == 0 && sameOperationEndpoint(inv.receiver, sourceRelativeEndpoint{}) && inv.use == operation && inv.cut == (sourceRelativeCut{operation: operation, use: operation, reading: operation})
}
