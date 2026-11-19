package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

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

// ordinaryHostJSX preserves host syntax only in authored callables outside selected components.
// Component tasks/render callbacks keep their existing lowering; receiver inference grants nothing here.
func (lowering *jsxLowering) ordinaryHostJSX(node *ast.Node) bool {
	if !tspath.FileExtensionIs(lowering.sourceFile.FileName(), ".tsx") {
		return false
	}
	original := lowering.emitContext.MostOriginal(node)
	if original == nil || enclosingCallableNode(original) == nil {
		return false
	}
	_, component := lowering.componentContaining(original)
	return !component
}

// assertComponentExecutableTree still fences component JSX, permitting only preserved host roots.
func (lowering *jsxLowering) assertComponentExecutableTree(source *ast.Node) {
	if source == nil || source.SubtreeFacts()&ast.SubtreeContainsJsx == 0 {
		return
	}
	walkNode(source, func(node *ast.Node) bool {
		if ast.IsJsxElement(node) || ast.IsJsxSelfClosingElement(node) || ast.IsJsxFragment(node) {
			if !lowering.ordinaryHostJSX(node) {
				panic("component executable artifact retained JSX after lowering")
			}
			return false
		}
		return true
	})
}
