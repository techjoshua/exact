package exactcompiler

import (
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// normalizationGeneratedName keeps inserted declarations from shadowing authored references.
// All identifiers count, including reads that resolve outside the generated callable's scope.
func normalizationGeneratedName(sourceFile *ast.SourceFile, base string) string {
	names := make(map[string]bool)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsIdentifier(node) {
			names[node.Text()] = true
		}
		return true
	})
	name := base
	for suffix := 1; names[name]; suffix++ {
		name = base + "_" + strconv.Itoa(suffix)
	}
	return name
}
