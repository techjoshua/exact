package exactcompiler

import (
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A spread activation observes the whole native argument vector once per update.
// Projected dependencies preserve fixed input positions without duplicating iterators.
func (lowering *jsxLowering) taskArgumentVector(arguments []*ast.Node, count int) *ast.Node {
	values := make([]*ast.Node, 0, len(arguments))
	for _, argument := range arguments {
		values = append(values, lowering.visitor.VisitNode(argument))
	}
	vector := lowering.factory.NewAsExpression(
		lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false),
		lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier("const"), nil),
	)
	dependencies := lowering.taskHelperCall("createTaskArgumentDependencies",
		lowering.names.taskArgumentDependencies, []*ast.Node{
			lowering.arrow(vector),
			lowering.factory.NewNumericLiteral(strconv.Itoa(count), ast.TokenFlagsNone),
		})
	return lowering.factory.NewSpreadElement(dependencies)
}
