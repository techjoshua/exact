package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// textHostChildHasIntrinsicSpread finds copied bags owned by the text presentation.
// Component invocations retain their own prop receipt and child ownership contracts.
func textHostChildHasIntrinsicSpread(node *ast.Node) bool {
	if ast.IsJsxFragment(node) {
		for _, child := range node.AsJsxFragment().Children.Nodes {
			if textHostChildHasIntrinsicSpread(child) {
				return true
			}
		}
		return false
	}
	opening, children := composableJsxParts(node)
	if opening == nil || !ast.IsIdentifier(openingTag(opening)) {
		return false
	}
	tag := openingTag(opening).Text()
	if tag != "_" && !jsxIntrinsic(tag) {
		return false
	}
	if jsxAttributesContainSpread(opening.Attributes()) {
		return true
	}
	if children != nil {
		for _, child := range children.Nodes {
			if textHostChildHasIntrinsicSpread(child) {
				return true
			}
		}
	}
	return false
}
