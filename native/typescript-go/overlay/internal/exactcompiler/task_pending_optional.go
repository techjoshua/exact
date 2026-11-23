package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// pendingOptionalRead leaves native short-circuiting, receiver selection and iterator behavior
// intact. Only the chain's base crosses the invocation facade, and its result regains authored identity.
func (lowering *jsxLowering) pendingOptionalRead(node, context *ast.Node, visitor *ast.NodeVisitor, signals taskSignalLowering) *ast.Node {
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
	var visitChain func(part *ast.Node, callee bool) *ast.Node
	visitChain = func(part *ast.Node, memberCallee bool) *ast.Node {
		// Reference-preserving wrappers still own their syntax. In particular,
		// parentheses keep an inner optional chain separate from the outer call.
		if memberCallee {
			switch {
			case ast.IsParenthesizedExpression(part):
				wrapper := part.AsParenthesizedExpression()
				return lowering.factory.UpdateParenthesizedExpression(wrapper, visitChain(wrapper.Expression, true))
			case ast.IsAsExpression(part):
				wrapper := part.AsAsExpression()
				return lowering.factory.UpdateAsExpression(wrapper, visitChain(wrapper.Expression, true), wrapper.Type)
			case ast.IsSatisfiesExpression(part):
				wrapper := part.AsSatisfiesExpression()
				return lowering.factory.UpdateSatisfiesExpression(wrapper, visitChain(wrapper.Expression, true), wrapper.Type)
			}
		}
		if part.Flags&ast.NodeFlagsOptionalChain == 0 && !memberCallee {
			return lowering.helperContextCall(context, "view", []*ast.Node{visitor.VisitNode(part)})
		}
		if ast.IsPropertyAccessExpression(part) {
			access := part.AsPropertyAccessExpression()
			if access.Name().Kind == ast.KindPrivateIdentifier || access.Expression.Kind == ast.KindSuperKeyword {
				return visitor.VisitEachChild(part)
			}
			return lowering.factory.UpdatePropertyAccessExpression(access, visitChain(access.Expression, false), access.QuestionDotToken, access.Name(), access.Flags)
		}
		if ast.IsElementAccessExpression(part) {
			access := part.AsElementAccessExpression()
			if access.Expression.Kind == ast.KindSuperKeyword {
				return visitor.VisitEachChild(part)
			}
			return lowering.factory.UpdateElementAccessExpression(access, visitChain(access.Expression, false), access.QuestionDotToken, visitor.VisitNode(access.ArgumentExpression), access.Flags)
		}
		if ast.IsNonNullExpression(part) {
			assertion := part.AsNonNullExpression()
			return lowering.factory.UpdateNonNullExpression(assertion, visitChain(assertion.Expression, memberCallee), assertion.Flags)
		}
		if ast.IsCallExpression(part) {
			call := part.AsCallExpression()
			arguments := []*ast.Node{}
			for _, argument := range callArguments(part) {
				arguments = append(arguments, lowering.pendingHelperArgument(argument, visitor))
			}
			arguments = signals.arguments(lowering, part, arguments)
			// A member before ?.() can sit outside the chain flags. View its
			// receiver instead of extracting the method as a standalone callable.
			reference := unwrapSourceCallableReference(call.Expression)
			memberCallee := ast.IsPropertyAccessExpression(reference) || ast.IsElementAccessExpression(reference)
			callee := lowering.pendingPrivateHelperSelection(call.Expression, context, visitor, true)
			if callee == nil {
				callee = visitChain(call.Expression, memberCallee)
			}
			if call.Expression.Flags&ast.NodeFlagsOptionalChain == 0 && !memberCallee && lowering.pendingHelperCalls[nodeSourceSpan(part)] {
				inline := lowering.factory.NewFalseExpression()
				if lowering.pendingInlineHelperCalls[nodeSourceSpan(part)] {
					inline = lowering.factory.NewTrueExpression()
				}
				callee = lowering.helperContextCall(context, "optionalHelper", []*ast.Node{visitor.VisitNode(call.Expression), inline})
			}
			return lowering.factory.UpdateCallExpression(call, callee, call.QuestionDotToken, call.TypeArguments, lowering.factory.NewNodeList(arguments), call.Flags)
		}
		return visitor.VisitEachChild(part)
	}
	result := visitChain(source, false)
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
