package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// deferredReactiveCallable distinguishes stored callable definitions from work that a
// containing call can invoke during reevaluation. Unknown callback consumers stay conservative.
func deferredReactiveCallable(callable, initializer *ast.Node) bool {
	for current := callable; current != nil && current != initializer; current = current.Parent {
		if ast.IsCallExpression(current.Parent) || ast.IsNewExpression(current.Parent) {
			return false
		}
	}
	return true
}
