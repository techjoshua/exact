package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// pendingPrivateHelperSelection keeps private lookup in its lexical class while
// selecting its receiver once, before call arguments. Private names cannot cross
// helperMember's property-key interface. The existing helper lane accepts the
// selected callable and receiver without changing private storage ownership.
func (lowering *jsxLowering) pendingPrivateHelperSelection(node, context *ast.Node, visitor *ast.NodeVisitor, optional bool) *ast.Node {
	if !ast.IsPropertyAccessExpression(node) || node.AsPropertyAccessExpression().Name().Kind != ast.KindPrivateIdentifier {
		return nil
	}
	access := node.AsPropertyAccessExpression()
	receiver := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactPrivateReceiver"))
	typeNode := lowering.mutationFacts.at(nodeSpanKey(access.Expression)).pending
	if typeNode == nil {
		typeNode = lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword)
	}
	member := lowering.factory.UpdatePropertyAccessExpression(access, receiver, access.QuestionDotToken, access.Name(), access.Flags)
	selected := lowering.helperContextCall(context, "helper", []*ast.Node{member, receiver, lowering.factory.NewFalseExpression()})
	if optional {
		// Returning the original absent value lets native ?.() skip its arguments.
		// Cache private lookup too, so an accessor runs once before argument work.
		callable := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactPrivateCallable"))
		declaration := lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewVariableDeclaration(callable, nil, nil, member)}), ast.NodeFlagsConst))
		selected = lowering.helperContextCall(context, "helper", []*ast.Node{callable, receiver, lowering.factory.NewFalseExpression()})
		choice := lowering.factory.NewConditionalExpression(lowering.factory.NewBinaryExpression(nil, callable, nil,
			lowering.factory.NewToken(ast.KindEqualsEqualsToken), lowering.factory.NewKeywordExpression(ast.KindNullKeyword)),
			lowering.factory.NewToken(ast.KindQuestionToken), callable, lowering.factory.NewToken(ast.KindColonToken), selected)
		selected = lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{declaration, lowering.factory.NewReturnStatement(choice)}), true)
	}
	selection := lowering.factory.NewArrowFunction(nil, nil,
		lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewParameterDeclaration(nil, nil, receiver, nil, typeNode, nil)}),
		nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), selected)
	return lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(selection), nil, nil,
		lowering.factory.NewNodeList([]*ast.Node{visitor.VisitNode(access.Expression)}), ast.NodeFlagsNone)
}
