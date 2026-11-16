package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedEmptyArrayDataConstruction describes the ordinary language creation
// already supplied by an original initializer/default/argument owner. There are
// no element evaluation or spread obligations in this bounded construction.
// The endpoint retains its producer/cut and independent input/Effects debts;
// this predicate supplies no acquired value or ordinary/native object proof.
func stagedEmptyArrayDataConstruction(node *ast.Node) bool {
	return node != nil && ast.IsArrayLiteralExpression(node) && len(node.AsArrayLiteralExpression().Elements.Nodes) == 0
}
