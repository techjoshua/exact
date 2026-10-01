package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// pendingOptionalRead leaves native short-circuiting, receiver selection and iterator behavior
// intact. Only the chain's base crosses the invocation facade, and its result regains authored identity.
func (lowering *jsxLowering) pendingOptionalRead(node, context *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	source := node
	deleting := ast.IsDeleteExpression(node)
	if deleting {
		source = node.AsDeleteExpression().Expression
	}
	if source.Flags&ast.NodeFlagsOptionalChain == 0 {
		return nil
	}
	if source.Parent != nil && source.Parent.Flags&ast.NodeFlagsOptionalChain != 0 {
		return nil
	}
	var chain *ast.NodeVisitor
	chain = ast.NewNodeVisitor(func(part *ast.Node) *ast.Node {
		if part.Flags&ast.NodeFlagsOptionalChain == 0 {
			return lowering.helperContextCall(context, "view", []*ast.Node{visitor.VisitNode(part)})
		}
		if ast.IsPropertyAccessExpression(part) {
			access := part.AsPropertyAccessExpression()
			if access.Name().Kind == ast.KindPrivateIdentifier {
				return visitor.VisitEachChild(part)
			}
			return lowering.factory.UpdatePropertyAccessExpression(access, chain.VisitNode(access.Expression), access.QuestionDotToken, access.Name(), access.Flags)
		}
		if ast.IsElementAccessExpression(part) {
			access := part.AsElementAccessExpression()
			return lowering.factory.UpdateElementAccessExpression(access, chain.VisitNode(access.Expression), access.QuestionDotToken, visitor.VisitNode(access.ArgumentExpression), access.Flags)
		}
		if ast.IsCallExpression(part) {
			call := part.AsCallExpression()
			arguments := []*ast.Node{}
			for _, argument := range callArguments(part) {
				arguments = append(arguments, visitor.VisitNode(argument))
			}
			callee := chain.VisitNode(call.Expression)
			if call.Expression.Flags&ast.NodeFlagsOptionalChain == 0 && !ast.IsPropertyAccessExpression(call.Expression) && !ast.IsElementAccessExpression(call.Expression) && lowering.pendingHelperCalls[nodeSpanKey(part)] {
				inline := lowering.factory.NewFalseExpression()
				if lowering.pendingInlineHelperCalls[nodeSpanKey(part)] {
					inline = lowering.factory.NewTrueExpression()
				}
				callee = lowering.helperContextCall(context, "optionalHelper", []*ast.Node{visitor.VisitNode(call.Expression), inline})
			}
			return lowering.factory.UpdateCallExpression(call, callee, call.QuestionDotToken, call.TypeArguments, lowering.factory.NewNodeList(arguments), call.Flags)
		}
		return visitor.VisitEachChild(part)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	result := chain.VisitNode(source)
	if deleting {
		return lowering.factory.NewDeleteExpression(result)
	}
	return lowering.helperContextCall(context, "value", []*ast.Node{result})
}
