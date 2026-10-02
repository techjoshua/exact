package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// pendingObjectCopy keeps native spread's key enumeration, descriptors and ordering while
// selecting compiled getters through the invocation. A flat view retains copied value identity.
func (lowering *jsxLowering) pendingObjectCopy(node, context *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	if !ast.IsSpreadAssignment(node) || pendingNativeWriteTarget(node) {
		return nil
	}
	spread := node.AsSpreadAssignment()
	value := lowering.helperContextCall(context, "view", []*ast.Node{visitor.VisitNode(spread.Expression), lowering.factory.NewTrueExpression()})
	return lowering.factory.UpdateSpreadAssignment(spread, value)
}
