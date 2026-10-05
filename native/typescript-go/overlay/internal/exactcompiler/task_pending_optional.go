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
	if optionalChainContinuesThrough(source.Parent, source) {
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
		if ast.IsNonNullExpression(part) {
			assertion := part.AsNonNullExpression()
			return lowering.factory.UpdateNonNullExpression(assertion, chain.VisitNode(assertion.Expression), assertion.Flags)
		}
		if ast.IsCallExpression(part) {
			call := part.AsCallExpression()
			arguments := []*ast.Node{}
			for _, argument := range callArguments(part) {
				arguments = append(arguments, lowering.pendingHelperArgument(argument, visitor))
			}
			callee := lowering.pendingPrivateHelperSelection(call.Expression, context, visitor, true)
			if callee == nil {
				callee = chain.VisitNode(call.Expression)
			}
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

// optionalChainContinuesThrough follows only the chain receiver or callee.
// Computed keys and call arguments can own independent optional chains even
// when their containing access or call is itself optional.
func optionalChainContinuesThrough(parent, child *ast.Node) bool {
	if parent == nil || parent.Flags&ast.NodeFlagsOptionalChain == 0 {
		return false
	}
	switch {
	case ast.IsPropertyAccessExpression(parent):
		return parent.AsPropertyAccessExpression().Expression == child
	case ast.IsElementAccessExpression(parent):
		return parent.AsElementAccessExpression().Expression == child
	case ast.IsNonNullExpression(parent):
		return parent.AsNonNullExpression().Expression == child
	case ast.IsCallExpression(parent):
		return parent.AsCallExpression().Expression == child
	default:
		return false
	}
}
