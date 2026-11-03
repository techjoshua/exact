package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// indexedMemberNeedsReference keeps the ordinary facade lane when a member Get
// supplies JavaScript's call/tag receiver. A numeric read returns only a value.
// Parentheses and erased type wrappers preserve the authored Reference too.
func indexedMemberNeedsReference(node *ast.Node) bool {
	for node != nil && node.Parent != nil {
		parent := node.Parent
		if ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) || ast.IsSatisfiesExpression(parent) || ast.IsNonNullExpression(parent) || ast.IsTypeAssertion(parent) {
			node = parent
			continue
		}
		return ast.IsCallExpression(parent) && parent.Expression() == node || ast.IsTaggedTemplateExpression(parent) && parent.AsTaggedTemplateExpression().Tag == node
	}
	return false
}
