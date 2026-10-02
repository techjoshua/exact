package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// pendingNativeWriteTarget identifies references consumed by JavaScript's destructuring or
// loop-binding algorithm. Receiver and key expressions remain reads. Defaults stay native
// assignment syntax rather than becoming eager pending writes.
func pendingNativeWriteTarget(node *ast.Node) bool {
	for current := node; current.Parent != nil; current = current.Parent {
		parent := current.Parent
		switch {
		case ast.IsForOfStatement(parent), ast.IsForInStatement(parent):
			return parent.AsForInOrOfStatement().Initializer == current
		case ast.IsBinaryExpression(parent):
			binary := parent.AsBinaryExpression()
			if binary.OperatorToken.Kind != ast.KindEqualsToken || binary.Left != current {
				return false
			}
			if ast.IsArrayLiteralExpression(current) || ast.IsObjectLiteralExpression(current) {
				return true
			}
		case ast.IsPropertyAssignment(parent):
			if parent.AsPropertyAssignment().Initializer != current {
				return false
			}
		case ast.IsSpreadElement(parent):
			if parent.AsSpreadElement().Expression != current {
				return false
			}
		case ast.IsSpreadAssignment(parent):
			if parent.AsSpreadAssignment().Expression != current {
				return false
			}
		case ast.IsArrayLiteralExpression(parent), ast.IsObjectLiteralExpression(parent), ast.IsParenthesizedExpression(parent):
		default:
			return false
		}
	}
	return false
}

// pendingNativeReference supplies a facade only at native assignment references, preserving
// native iterator closing, default selection, partial writes and assignment result identity.
func (lowering *jsxLowering) pendingNativeReference(node, context *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	if !pendingNativeWriteTarget(node) {
		return nil
	}
	if ast.IsPropertyAccessExpression(node) {
		access := node.AsPropertyAccessExpression()
		if access.Expression.Kind == ast.KindSuperKeyword {
			return lowering.pendingSuperReference(node, context, visitor)
		}
		if access.Name().Kind == ast.KindPrivateIdentifier {
			return lowering.pendingPrivateReference(node, context, visitor)
		}
		receiver := lowering.helperContextCall(context, "view", []*ast.Node{visitor.VisitNode(access.Expression)})
		return lowering.factory.UpdatePropertyAccessExpression(access, receiver, access.QuestionDotToken, access.Name(), access.Flags)
	}
	if ast.IsElementAccessExpression(node) {
		access := node.AsElementAccessExpression()
		if access.Expression.Kind == ast.KindSuperKeyword {
			return lowering.pendingSuperReference(node, context, visitor)
		}
		receiver := lowering.helperContextCall(context, "view", []*ast.Node{visitor.VisitNode(access.Expression)})
		return lowering.factory.UpdateElementAccessExpression(access, receiver, access.QuestionDotToken, visitor.VisitNode(access.ArgumentExpression), access.Flags)
	}
	// A default in an assignment pattern is an equals expression, not a write operation.
	if ast.IsBinaryExpression(node) {
		return visitor.VisitEachChild(node)
	}
	return nil
}

// pendingPrivateReference retains a native assignment destination without putting a proxy
// in a private-brand access. Its ephemeral setter publishes through the existing field journal.
func (lowering *jsxLowering) pendingPrivateReference(node, context *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	if lowering.helperPrivateTokens[nodeSpanKey(node)] == nil && lowering.privateAccessorCompanion(node, true) == nil {
		return nil
	}
	receiver := node.AsPropertyAccessExpression().Expression
	owner := lowering.mutationTemporary(receiver)
	return lowering.pendingSetterReference(node, []*ast.Node{lowering.binary(owner, ast.KindEqualsToken, visitor.VisitNode(receiver))}, func(input *ast.Node) *ast.Node {
		return lowering.privateHelperWrite(node, context, owner, input)
	})
}

// pendingSuperReference keeps super syntax at its lexical home while native binding selects
// computed keys once before defaults and publishes through inherited accessor companions.
func (lowering *jsxLowering) pendingSuperReference(node, context *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	receiver := lowering.mutationTemporary(lowering.factory.NewKeywordExpression(ast.KindThisKeyword))
	selections := []*ast.Node{lowering.binary(receiver, ast.KindEqualsToken, lowering.factory.NewKeywordExpression(ast.KindThisKeyword))}
	var key *ast.Node
	if ast.IsPropertyAccessExpression(node) {
		key = lowering.factory.NewStringLiteral(node.AsPropertyAccessExpression().Name().Text(), ast.TokenFlagsNone)
	} else {
		selected := lowering.helperContextCall(context, "key", []*ast.Node{visitor.VisitNode(node.AsElementAccessExpression().ArgumentExpression)})
		keyType := lowering.factory.NewUnionTypeNode(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewKeywordTypeNode(ast.KindStringKeyword), lowering.factory.NewKeywordTypeNode(ast.KindNumberKeyword), lowering.factory.NewKeywordTypeNode(ast.KindSymbolKeyword)}))
		key = lowering.mutationTypedTemporary(node, keyType)
		selections = append(selections, lowering.binary(key, ast.KindEqualsToken, selected))
	}
	return lowering.pendingSetterReference(node, selections, func(input *ast.Node) *ast.Node {
		return lowering.helperContextCall(context, "superWrite", []*ast.Node{receiver, key, input})
	})
}

// pendingSetterReference constructs a native assignable property after reference selection.
// Each writer closes over selected temporaries, retaining branded receivers across defaults.
func (lowering *jsxLowering) pendingSetterReference(node *ast.Node, selections []*ast.Node, write func(*ast.Node) *ast.Node) *ast.Node {
	input := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactBindingValue"))
	parameter := lowering.factory.NewParameterDeclaration(nil, nil, input, nil, lowering.mutationFacts.at(nodeSpanKey(node)).pending, nil)
	body := lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewExpressionStatement(write(input))}), true)
	setter := lowering.factory.NewSetAccessorDeclaration(nil, lowering.factory.NewIdentifier("value"), nil, lowering.factory.NewNodeList([]*ast.Node{parameter}), nil, nil, body)
	target := lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{setter}), false)
	selected := lowering.mutationSequence(append(selections, target))
	return lowering.factory.NewPropertyAccessExpression(selected, nil, lowering.factory.NewIdentifier("value"), ast.NodeFlagsNone)
}
