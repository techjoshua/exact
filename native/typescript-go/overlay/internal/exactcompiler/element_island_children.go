package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// islandRenderedChildrenReads records child output positions before lowering reparents expressions.
// Tests, attributes and call arguments inspect the original value, not a newly allocated slot.
func islandRenderedChildrenReads(component *ast.Node) map[string]bool {
	result := make(map[string]bool)
	walkNode(component, func(node *ast.Node) bool {
		read := islandSelectedChildRead(node)
		if key, _, ok := directPropsRead(read); ok && key == "children" && islandChildOutputPosition(node) {
			result[nodeSpanKey(node)] = true
		}
		return true
	})
	return result
}

func islandChildOutputPosition(node *ast.Node) bool {
	for parent := node.Parent; parent != nil; parent = node.Parent {
		switch parent.Kind {
		case ast.KindParenthesizedExpression, ast.KindAsExpression, ast.KindNonNullExpression, ast.KindSatisfiesExpression, ast.KindArrayLiteralExpression:
		case ast.KindConditionalExpression:
			if parent.AsConditionalExpression().Condition == node {
				return false
			}
		case ast.KindBinaryExpression:
			binary := parent.AsBinaryExpression()
			if binary.Right != node || (binary.OperatorToken.Kind != ast.KindAmpersandAmpersandToken && binary.OperatorToken.Kind != ast.KindBarBarToken && binary.OperatorToken.Kind != ast.KindQuestionQuestionToken) {
				return false
			}
		case ast.KindJsxExpression:
			return parent.Parent != nil && (ast.IsJsxElement(parent.Parent) || ast.IsJsxFragment(parent.Parent))
		default:
			return false
		}
		node = parent
	}
	return false
}

// islandScalarChildren preserves absence and ordinary primitive values on both sides of hydration.
// Only opaque render objects and callable children require retained server-range ownership.
func (lowering *jsxLowering) islandScalarChildren(value *ast.Node) *ast.Node {
	return lowering.binary(
		lowering.binary(value, ast.KindEqualsEqualsEqualsToken, lowering.factory.NewKeywordExpression(ast.KindNullKeyword)),
		ast.KindBarBarToken,
		lowering.binary(
			lowering.binary(lowering.factory.NewTypeOfExpression(value), ast.KindExclamationEqualsEqualsToken, lowering.factory.NewStringLiteral("object", ast.TokenFlagsNone)),
			ast.KindAmpersandAmpersandToken,
			lowering.binary(lowering.factory.NewTypeOfExpression(value), ast.KindExclamationEqualsEqualsToken, lowering.factory.NewStringLiteral("function", ast.TokenFlagsNone)),
		),
	)
}

// islandScalarChildrenProps bypasses opaque slot revival when the original child is plain data.
// An explicit children key also prevents SSR from replacing undefined with a slot reference.
func (lowering *jsxLowering) islandScalarChildrenProps(island clientElementIsland) *ast.Node {
	value := lowering.islandCapturedChildrenInput(island)
	return lowering.factory.NewSpreadAssignment(lowering.conditional(lowering.islandScalarChildren(value),
		lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{
			lowering.property(lowering.factory.NewIdentifier("children"), value),
		}), false),
		lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(nil), false),
	))
}

// islandSelectedChildRead identifies a value which doubles as a short-circuit test and output.
// Its test must run on the authored value before the selected result becomes a retained slot.
func islandSelectedChildRead(node *ast.Node) *ast.Node {
	if ast.IsBinaryExpression(node) {
		binary := node.AsBinaryExpression()
		if binary.OperatorToken.Kind == ast.KindBarBarToken || binary.OperatorToken.Kind == ast.KindQuestionQuestionToken {
			return binary.Left
		}
	}
	return node
}

func (lowering *jsxLowering) islandSelectedChildOutput(node, read, output *ast.Node) *ast.Node {
	if node == read {
		return output
	}
	binary := node.AsBinaryExpression()
	condition := read
	if binary.OperatorToken.Kind == ast.KindQuestionQuestionToken {
		condition = lowering.binary(read, ast.KindExclamationEqualsToken, lowering.factory.NewKeywordExpression(ast.KindNullKeyword))
	}
	return lowering.conditional(condition, output, lowering.visitor.VisitNode(binary.Right))
}
