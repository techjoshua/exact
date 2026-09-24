package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// containsEagerAwait detects suspension owned by an expression, excluding deferred function
// bodies. Task mutations must evaluate this expression before entering a synchronous commit.
func containsEagerAwait(expression *ast.Node) bool {
	found := false
	walkNode(expression, func(node *ast.Node) bool {
		if ast.IsFunctionLike(node) {
			return false
		}
		if ast.IsAwaitExpression(node) {
			found = true
		}
		return !found
	})
	return found
}
