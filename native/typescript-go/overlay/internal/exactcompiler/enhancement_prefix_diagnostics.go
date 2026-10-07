package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"strings"
)

// Ordinary imported names never establish enhancement namespaces. Finite spread keys follow the
// same rule even when the module has no enhancement imports. Open ordinary DOM bags stay ordinary.
func collectOrdinaryEnhancementPrefixDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	imports *enhancementImports,
	ordinaryBindings map[string]struct{},
	skippedAttributes map[int]struct{},
) {
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		attributes := jsxOpeningAttributes(node)
		if attributes == nil {
			return true
		}
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if ast.IsJsxSpreadAttribute(property) {
				prefixes := make(map[string]struct{})
				expression := property.AsJsxSpreadAttribute().Expression
				for _, memberType := range typeChecker.GetTypeAtLocation(expression).Distributed() {
					for _, member := range typeChecker.GetPropertiesOfType(memberType) {
						prefix, _, namespaced := strings.Cut(ast.SymbolName(member), ":")
						if !namespaced {
							continue
						}
						if _, seen := prefixes[prefix]; seen {
							continue
						}
						prefixes[prefix] = struct{}{}
						if _, imported := ordinaryBindings[prefix]; !imported {
							continue
						}
						imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(sourceFile, property, "EXACT6005", fmt.Sprintf("JSX enhancement prefix %q requires an import with { type: 'exact-enhancement' }", prefix)))
					}
				}
				continue
			}
			attribute := property.AsJsxAttribute()
			if _, skipped := skippedAttributes[property.Pos()]; skipped {
				continue
			}
			if !ast.IsJsxNamespacedName(attribute.Name()) {
				continue
			}
			name := attribute.Name().AsJsxNamespacedName()
			if _, imported := ordinaryBindings[name.Namespace.Text()]; !imported {
				continue
			}
			imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
				sourceFile,
				property,
				"EXACT6005",
				fmt.Sprintf(
					"JSX enhancement prefix %q requires an import with { type: 'exact-enhancement' }",
					name.Namespace.Text(),
				),
			))
		}
		return true
	})
}
