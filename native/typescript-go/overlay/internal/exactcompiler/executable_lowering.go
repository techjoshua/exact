package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// assertExecutableTree fences every authored and generated root before TypeScript emission.
// The subtree fact guard avoids a full walk when executable syntax is already complete.
func assertExecutableTree(source *ast.Node) {
	if source == nil || source.SubtreeFacts()&ast.SubtreeContainsJsx == 0 {
		return
	}
	walkNode(source, func(node *ast.Node) bool {
		if ast.IsJsxElement(node) || ast.IsJsxSelfClosingElement(node) || ast.IsJsxFragment(node) {
			panic("executable artifact retained JSX after lowering")
		}
		return true
	})
}
