package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nativeAssignmentPatternTarget identifies references consumed by JavaScript's destructuring or
// loop-binding algorithm. Receiver and key expressions remain reads. Defaults stay native
// assignment syntax rather than becoming eager pending writes.
func nativeAssignmentPatternTarget(node *ast.Node) bool {
	return nativeAssignmentTargetRole(node) != nativeAssignmentNone
}

type nativeAssignmentRole uint8

const (
	nativeAssignmentNone nativeAssignmentRole = iota
	nativeAssignmentPattern
	nativeAssignmentRest
	nativeAssignmentLoop
)

// nativeAssignmentTargetRole keeps finite assignment-pattern emission separate from rest/loops.
// The boolean projection retains the existing read/target boundary for other consumers.
func nativeAssignmentTargetRole(node *ast.Node) nativeAssignmentRole {
	rest := false
	for current := node; current.Parent != nil; current = current.Parent {
		parent := current.Parent
		switch {
		case ast.IsForOfStatement(parent), ast.IsForInStatement(parent):
			if parent.AsForInOrOfStatement().Initializer == current {
				return nativeAssignmentLoop
			}
			return nativeAssignmentNone
		case ast.IsBinaryExpression(parent):
			binary := parent.AsBinaryExpression()
			if binary.OperatorToken.Kind != ast.KindEqualsToken || binary.Left != current {
				return nativeAssignmentNone
			}
			if ast.IsArrayLiteralExpression(current) || ast.IsObjectLiteralExpression(current) {
				if rest {
					return nativeAssignmentRest
				}
				return nativeAssignmentPattern
			}
		case ast.IsPropertyAssignment(parent):
			if parent.AsPropertyAssignment().Initializer != current {
				return nativeAssignmentNone
			}
		case ast.IsShorthandPropertyAssignment(parent):
			if parent.Name() != current {
				return nativeAssignmentNone
			}
		case ast.IsSpreadElement(parent):
			rest = true
			if parent.AsSpreadElement().Expression != current {
				return nativeAssignmentNone
			}
		case ast.IsSpreadAssignment(parent):
			rest = true
			if parent.AsSpreadAssignment().Expression != current {
				return nativeAssignmentNone
			}
		case ast.IsArrayLiteralExpression(parent), ast.IsObjectLiteralExpression(parent), ast.IsParenthesizedExpression(parent):
		default:
			return nativeAssignmentNone
		}
	}
	return nativeAssignmentNone
}
