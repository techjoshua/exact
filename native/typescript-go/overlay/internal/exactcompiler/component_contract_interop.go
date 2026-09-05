package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

// componentUsesJSXInterop reports whether a native component's target artifact must retain the
// explicit compatibility boundary for an unresolved JSX edge or generated interop reference.
func componentUsesJSXInterop(
	component Component,
	componentFunction *ast.Node,
	interop *JSXInterop,
) bool {
	if interop == nil {
		return false
	}
	for _, edge := range component.RenderEdges {
		if edge.ModuleSpecifier != "" && edge.ComponentID == "" {
			if exactCoreStructuralReference(edge.ModuleSpecifier, edge.ExportName) {
				continue
			}
			exact := false
			for _, configured := range interop.ExactComponents {
				if configured.ModuleSpecifier == edge.ModuleSpecifier &&
					configured.ExportName == edge.ExportName {
					exact = true
					break
				}
			}
			if !exact {
				return true
			}
		}
	}
	used := false
	walkNode(componentFunction, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) {
			return true
		}
		name := node.Text()
		used = name == "__exactInteropComponent" || strings.HasPrefix(name, "__exactInteropComponent_")
		return !used
	})
	return used
}
