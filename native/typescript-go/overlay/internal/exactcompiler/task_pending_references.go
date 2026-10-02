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
			return visitor.VisitEachChild(node)
		}
		if access.Name().Kind == ast.KindPrivateIdentifier {
			return visitor.VisitEachChild(node)
		}
		receiver := lowering.helperContextCall(context, "view", []*ast.Node{visitor.VisitNode(access.Expression)})
		return lowering.factory.UpdatePropertyAccessExpression(access, receiver, access.QuestionDotToken, access.Name(), access.Flags)
	}
	if ast.IsElementAccessExpression(node) {
		access := node.AsElementAccessExpression()
		if access.Expression.Kind == ast.KindSuperKeyword {
			return visitor.VisitEachChild(node)
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
