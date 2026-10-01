package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// helperHasLexicalReceiver distinguishes an arrow's captured receiver from nested dynamic receivers.
func helperHasLexicalReceiver(work *ast.Node) bool {
	if !ast.IsArrowFunction(work) {
		return false
	}
	found := false
	walkNode(work, func(node *ast.Node) bool {
		if node != work && (ast.IsClassLike(node) || ast.IsFunctionLike(node) && !ast.IsArrowFunction(node)) {
			return false
		}
		found = found || node.Kind == ast.KindThisKeyword || node.Kind == ast.KindSuperKeyword
		return !found
	})
	return found
}

// retainLexicalHelperPolicy binds a fresh arrow to its creation alias through the existing native
// bind registry. Its companion chooses later ownership, and its native name and arity remain authored.
// No earlier journal is captured by the companion, and ordinary originals retain ordinary creation.
func (lowering *jsxLowering) retainLexicalHelperPolicy(work, registration *ast.Node) *ast.Node {
	if len(lowering.pendingStates) == 0 || !helperHasLexicalReceiver(work) {
		return registration
	}
	typeNode := lowering.helperCallableTypes[nodeSpanKey(work)]
	if typeNode == nil {
		return registration
	}
	context := lowering.pendingStates[len(lowering.pendingStates)-1]
	original := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactLexicalHelper"))
	bound := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactLexicalBinding"))
	bind := lowering.factory.NewPropertyAccessExpression(lowering.factory.NewPropertyAccessExpression(lowering.factory.NewIdentifier("Function"), nil, lowering.factory.NewIdentifier("prototype"), ast.NodeFlagsNone), nil, lowering.factory.NewIdentifier("bind"), ast.NodeFlagsNone)
	selected := lowering.helperContextCall(context, "helper", []*ast.Node{bind, original})
	value := lowering.factory.NewAsExpression(lowering.factory.NewCallExpression(selected, nil, nil, lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewKeywordExpression(ast.KindThisKeyword)}), ast.NodeFlagsNone), typeNode)
	properties := []*ast.Node{
		lowering.factory.NewPropertyAssignment(nil, lowering.factory.NewIdentifier("value"), nil, nil, lowering.factory.NewPropertyAccessExpression(original, nil, lowering.factory.NewIdentifier("name"), ast.NodeFlagsNone)),
		lowering.factory.NewPropertyAssignment(nil, lowering.factory.NewIdentifier("configurable"), nil, nil, lowering.factory.NewTrueExpression()),
	}
	body := lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{
		lowering.helperConstant(bound, value),
		lowering.factory.NewExpressionStatement(lowering.call("Object.defineProperty", []*ast.Node{bound, lowering.factory.NewStringLiteral("name", ast.TokenFlagsNone), lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(properties), false)})),
		lowering.factory.NewReturnStatement(bound),
	}), true)
	parameter := lowering.factory.NewParameterDeclaration(nil, nil, original, nil, typeNode, nil)
	create := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList([]*ast.Node{parameter}), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), body)
	return lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(create), nil, nil, lowering.factory.NewNodeList([]*ast.Node{registration}), ast.NodeFlagsNone)
}
