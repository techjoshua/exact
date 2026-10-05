package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// pendingNativeReference supplies a facade only at native assignment references, preserving
// native iterator closing, default selection, partial writes and assignment result identity.
func (lowering *jsxLowering) pendingNativeReference(node, context *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	if !nativeAssignmentPatternTarget(node) {
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
