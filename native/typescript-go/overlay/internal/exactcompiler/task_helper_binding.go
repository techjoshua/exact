package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// helperBindingReceiver captures bind selections while retaining their optional gates. Native identity is checked
// during execution so an overridden method retains its ordinary receiver and argument behavior.
func helperBindingReceiver(node *ast.Node) *ast.Node {
	if node == nil || !ast.IsCallExpression(node) {
		return nil
	}
	callee := node.AsCallExpression().Expression
	if ast.IsPropertyAccessExpression(callee) && callee.AsPropertyAccessExpression().Name().Text() == "bind" {
		return callee.AsPropertyAccessExpression().Expression
	}
	if ast.IsElementAccessExpression(callee) {
		member := callee.AsElementAccessExpression()
		if ast.IsStringLiteral(member.ArgumentExpression) && member.ArgumentExpression.Text() == "bind" {
			return member.Expression
		}
	}
	return nil
}

// lowerOriginalHelperBinding records native binding provenance without changing the bound function.
// The companion retains only selected values and resolves the eventual invocation's transaction.
func (lowering *jsxLowering) lowerOriginalHelperBinding(node *ast.Node) *ast.Node {
	typeNode := lowering.helperBoundTypes[nodeSpanKey(node)]
	receiver := helperBindingReceiver(node)
	if receiver == nil || typeNode == nil {
		return nil
	}

	if len(lowering.mutationFrames) == 0 || helperBindingInDefault(node) {
		frame := &mutationFrame{}
		lowering.mutationFrames = append(lowering.mutationFrames, frame)
		result := lowering.lowerOriginalHelperBindingFrame(node, receiver, typeNode)
		lowering.mutationFrames = lowering.mutationFrames[:len(lowering.mutationFrames)-1]
		statements := []*ast.Node{lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList(frame.declarations), ast.NodeFlagsLet)), lowering.factory.NewReturnStatement(result)}
		arrow := lowering.arrow(lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true))
		return lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(arrow), nil, nil, lowering.factory.NewNodeList(nil), ast.NodeFlagsNone)
	}
	return lowering.lowerOriginalHelperBindingFrame(node, receiver, typeNode)
}

func helperBindingInDefault(node *ast.Node) bool {
	for parent := node.Parent; parent != nil; parent = parent.Parent {
		if ast.IsParameterDeclaration(parent) {
			return true
		}
		if ast.IsFunctionLike(parent) {
			return false
		}
	}
	return false
}

func (lowering *jsxLowering) lowerOriginalHelperBindingFrame(node, receiver, typeNode *ast.Node) *ast.Node {
	owner := lowering.mutationTemporary(receiver)
	selected := lowering.mutationTemporary(node.AsCallExpression().Expression)
	inputs := lowering.mutationTypedTemporary(node, lowering.factory.NewArrayTypeNode(lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)))
	arguments := []*ast.Node{}
	for _, argument := range callArguments(node) {
		arguments = append(arguments, lowering.visitor.VisitNode(argument))
	}
	var key *ast.Node
	callee := node.AsCallExpression().Expression
	if ast.IsPropertyAccessExpression(callee) {
		key = lowering.factory.NewStringLiteral("bind", ast.TokenFlagsNone)
	} else {
		key = callee.AsElementAccessExpression().ArgumentExpression
	}
	selectMethod := lowering.factory.NewElementAccessExpression(owner, nil, key, ast.NodeFlagsNone)
	invoke := lowering.taskHelperIntrinsicCall("Reflect.apply", []*ast.Node{selected, owner, inputs})
	context := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactBoundContext"))
	later := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactBoundArguments"))
	parameter := lowering.factory.NewParameterDeclaration(nil, lowering.factory.NewToken(ast.KindDotDotDotToken), later, nil, lowering.factory.NewArrayTypeNode(lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)), nil)
	boundOwner := lowering.factory.NewElementAccessExpression(inputs, nil, lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone), ast.NodeFlagsNone)
	capturedOwner := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactBoundCallable"))
	capturedReceiver := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactBoundReceiver"))
	capturedPrefix := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactBoundPrefix"))
	helper := lowering.helperContextCall(context, "helper", []*ast.Node{capturedOwner, capturedReceiver})
	prefix := lowering.factory.NewCallExpression(lowering.factory.NewPropertyAccessExpression(inputs, nil, lowering.factory.NewIdentifier("slice"), ast.NodeFlagsNone), nil, nil, lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone)}), ast.NodeFlagsNone)
	body := lowering.factory.NewCallExpression(helper, nil, nil, lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewSpreadElement(capturedPrefix), lowering.factory.NewSpreadElement(later)}), ast.NodeFlagsNone)
	companion := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList([]*ast.Node{lowering.helperParameter(context), parameter}), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), body)
	registration := lowering.factory.NewCallExpression(lowering.factory.NewIdentifier(lowering.helperRegistryName), nil, nil, lowering.factory.NewNodeList([]*ast.Node{invoke, companion}), ast.NodeFlagsNone)
	unknown := lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)
	captures := []*ast.Node{
		lowering.factory.NewParameterDeclaration(nil, nil, capturedOwner, nil, unknown, nil),
		lowering.factory.NewParameterDeclaration(nil, nil, capturedReceiver, nil, unknown, nil),
		lowering.factory.NewParameterDeclaration(nil, nil, capturedPrefix, nil, lowering.factory.NewArrayTypeNode(unknown), nil),
	}
	create := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList(captures), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), registration)
	registration = lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(create), nil, nil, lowering.factory.NewNodeList([]*ast.Node{owner, boundOwner, prefix}), ast.NodeFlagsNone)
	result := lowering.conditional(lowering.binary(selected, ast.KindEqualsEqualsEqualsToken, lowering.factory.NewPropertyAccessExpression(lowering.factory.NewPropertyAccessExpression(lowering.taskHelperIntrinsic("Function"), nil, lowering.factory.NewIdentifier("prototype"), ast.NodeFlagsNone), nil, lowering.factory.NewIdentifier("bind"), ast.NodeFlagsNone)), registration, invoke)
	result = lowering.mutationSequence([]*ast.Node{lowering.binary(inputs, ast.KindEqualsToken, lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(arguments), false)), result})
	empty := lowering.factory.NewVoidExpression(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone))
	if node.AsCallExpression().QuestionDotToken != nil {
		result = lowering.conditional(lowering.binary(selected, ast.KindEqualsEqualsToken, lowering.factory.NewKeywordExpression(ast.KindNullKeyword)), empty, result)
	}
	result = lowering.mutationSequence([]*ast.Node{lowering.binary(selected, ast.KindEqualsToken, selectMethod), result})
	optionalReceiver := ast.IsPropertyAccessExpression(callee) && callee.AsPropertyAccessExpression().QuestionDotToken != nil || ast.IsElementAccessExpression(callee) && callee.AsElementAccessExpression().QuestionDotToken != nil
	if optionalReceiver {
		result = lowering.conditional(lowering.binary(owner, ast.KindEqualsEqualsToken, lowering.factory.NewKeywordExpression(ast.KindNullKeyword)), empty, result)
	}
	result = lowering.mutationSequence([]*ast.Node{lowering.binary(owner, ast.KindEqualsToken, lowering.visitor.VisitNode(receiver)), result})
	return lowering.factory.NewAsExpression(result, typeNode)
}
