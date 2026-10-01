package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// lowerExecutableSubtree completes ordinary syntax lowering for generated executable roots.
// Companion ownership rewriting runs first. The ordinary visitor then lowers retained JSX,
// including parameter defaults, before import and render-program definition assembly.
func (lowering *jsxLowering) lowerExecutableSubtree(source *ast.Node) *ast.Node {
	if source == nil || source.SubtreeFacts()&ast.SubtreeContainsJsx == 0 {
		return source
	}
	if lowering.visitor == nil || lowering.phase < jsxLoweringVisited || lowering.phase >= jsxLoweringDefinitionsReady {
		panic("generated executable syntax lowered outside the visitor phase")
	}
	return lowering.visitor.VisitNode(source)
}

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
