package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// componentUsesJSXInterop reports whether a native component's target artifact must retain the
// explicit compatibility boundary for an unresolved JSX edge or generated interop reference.
func componentUsesJSXInterop(
	componentFunction *ast.Node,
	resolution *jsxLowering,
) bool {
	if resolution.interop == nil {
		return false
	}
	used := false
	walkNode(componentFunction, func(node *ast.Node) bool {
		if used {
			return false
		}
		if ast.IsJsxOpeningElement(node) || ast.IsJsxSelfClosingElement(node) {
			tag := openingTag(node)
			if _, dynamic := resolution.dynamicComponents[tag.Pos()]; dynamic {
				return true
			}
			text := sourceText(resolution.sourceFile, tag)
			// Capability planning must use the same package, alias, and registry proof as
			// receipt emission. An unresolved render edge alone is not a foreign component.
			used = text != "_" && text != "_target" && !jsxIntrinsic(text) &&
				!resolution.exactCoreStructuralTag(tag) && !resolution.microComponentTag(tag) &&
				!resolution.compiledNativeComponentTag(tag)
			return !used
		}
		if !ast.IsIdentifier(node) {
			return true
		}
		name := node.Text()
		used = name == "__exactInteropComponent" || strings.HasPrefix(name, "__exactInteropComponent_")
		return !used
	})
	return used
}
