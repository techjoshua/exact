package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// unresolvedTagDiagnostic retains the authored JSX tag location when component
// placement analysis projects a missing or type-only runtime binding.
func unresolvedTagDiagnostic(source *ast.SourceFile, componentName, message string) Diagnostic {
	result := Diagnostic{Severity: "error", Code: "EXACT2201", Message: message}
	tagName, _, _ := strings.Cut(strings.TrimPrefix(message, "error: JSX tag "), " ")
	for _, candidate := range componentCandidates(source) {
		if candidate.name != componentName {
			continue
		}
		found := false
		walkNode(candidate.node, func(node *ast.Node) bool {
			if found {
				return false
			}
			var tag *ast.Node
			if ast.IsJsxOpeningElement(node) {
				tag = node.AsJsxOpeningElement().TagName
			}
			if ast.IsJsxSelfClosingElement(node) {
				tag = node.AsJsxSelfClosingElement().TagName
			}
			if tag != nil && strings.TrimSpace(sourceText(source, tag)) == tagName {
				result.Start, result.Length = tag.Pos(), tag.End()-tag.Pos()
				found = true
			}
			return !found
		})
		break
	}
	return result
}
