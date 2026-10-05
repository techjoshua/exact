package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nativeAssignmentPatternTarget identifies references consumed by JavaScript's destructuring or
// loop-binding algorithm. Receiver and key expressions remain reads. Defaults stay native
// assignment syntax rather than becoming eager pending writes.
func nativeAssignmentPatternTarget(node *ast.Node) bool {
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
