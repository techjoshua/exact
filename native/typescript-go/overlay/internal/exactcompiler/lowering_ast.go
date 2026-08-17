package exactcompiler

import (
	"fmt"

	"github.com/microsoft/typescript-go/internal/ast"
)

func (lowering *jsxLowering) arrow(body *ast.Node) *ast.Node {
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList(nil),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

func (lowering *jsxLowering) call(name string, arguments []*ast.Node) *ast.Node {
	return lowering.factory.NewCallExpression(
		lowering.factory.NewIdentifier(name),
		nil,
		nil,
		lowering.factory.NewNodeList(arguments),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) property(name *ast.Node, value *ast.Node) *ast.Node {
	return lowering.factory.NewPropertyAssignment(nil, name, nil, nil, value)
}

func nodeSpanKey(node *ast.Node) string {
	return fmt.Sprintf("%d:%d", node.Pos(), node.End()-node.Pos())
}
