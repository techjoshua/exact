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

// ordinaryHostJSX reserves authored value tags outside components for the host.
// Intrinsics and structural nodes still produce eXact render values in ordinary render helpers.
func (lowering *jsxLowering) ordinaryHostJSX(node *ast.Node) bool {
	if !tspath.FileExtensionIs(lowering.sourceFile.FileName(), ".tsx") || ast.IsJsxFragment(node) {
		return false
	}
	original := lowering.emitContext.MostOriginal(node)
	if original == nil || enclosingCallableNode(original) == nil {
		return false
	}
	var opening *ast.Node
	switch {
	case ast.IsJsxElement(original):
		opening = original.AsJsxElement().OpeningElement
	case ast.IsJsxSelfClosingElement(original):
		opening = original
	default:
		return false
	}
	tag := sourceText(lowering.sourceFile, openingTag(opening))
	if tag == "_" || tag == "_target" || jsxIntrinsic(tag) {
		return false
	}
	_, component := lowering.componentContaining(original)
	return !component && !lowering.directServerRenderRoot(original)
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
