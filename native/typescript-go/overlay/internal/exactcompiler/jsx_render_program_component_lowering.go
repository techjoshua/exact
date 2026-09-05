package exactcompiler

import "github.com/microsoft/typescript-go/internal/ast"

// visitRenderProgramComponent preserves component-child planning while the ordinary JSX visitor
// lowers the selected child invocation.
func (lowering *jsxLowering) visitRenderProgramComponent(node *ast.Node) *ast.Node {
	lowering.renderProgramComponentDepth++
	result := lowering.visitor.VisitNode(node)
	lowering.renderProgramComponentDepth--
	return result
}

// directServerRenderProgramComponent separates a compiler-proven component callable from its
// request-owned props. Keyed, enhanced, child-bearing, and spread forms retain the prepared
// reference because their invocation metadata cannot be represented by the direct slot alone.
func (lowering *jsxLowering) directServerRenderProgramComponent(node *ast.Node) (*ast.Node, *ast.Node) {
	if lowering.target != TargetServer || node == nil || !ast.IsCallExpression(node) {
		return nil, nil
	}
	call := node.AsCallExpression()
	if !ast.IsIdentifier(call.Expression) || call.Expression.Text() != lowering.names.componentReceipt ||
		call.Arguments == nil || len(call.Arguments.Nodes) != 2 {
		return nil, nil
	}
	props := call.Arguments.Nodes[1]
	if props.Kind != ast.KindNullKeyword {
		if !ast.IsObjectLiteralExpression(props) {
			return nil, nil
		}
		for _, property := range props.AsObjectLiteralExpression().Properties.Nodes {
			if !ast.IsPropertyAssignment(property) {
				return nil, nil
			}
			name := property.AsPropertyAssignment().Name().Text()
			if name == "key" || name == "__exactEnhancements" {
				return nil, nil
			}
		}
	}
	return call.Arguments.Nodes[0], props
}
