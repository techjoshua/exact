package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// helperContextCall emits explicit invocation operations at component-owned task boundaries.
// Ordinary helper implementations are never duplicated or rewritten.
func (lowering *jsxLowering) helperContextCall(context *ast.Node, method string, arguments []*ast.Node) *ast.Node {
	callee := lowering.factory.NewPropertyAccessExpression(context, nil, lowering.factory.NewIdentifier(method), ast.NodeFlagsNone)
	return lowering.factory.NewCallExpression(callee, nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
}
