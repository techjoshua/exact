package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// timeUpdateSource selects the final authored update contribution using the same
// resolved enhancement members as emission. A spread retains its authored source span.
func timeUpdateSource(attributes *ast.Node, application enhancementApplication, imports enhancementImports) (*ast.Node, string) {
	identity := timeUpdateIdentity(application)
	var selected *ast.Node
	var source string
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxAttribute(property) && timeUpdateMembers(application.attributes[property.Pos()], identity) {
			selected, source = property, ""
		} else if ast.IsJsxSpreadAttribute(property) {
			for _, member := range imports.spreads[property.Pos()].members {
				if member.identity == identity && member.prop == "update" {
					selected, source = property, member.source
				}
			}
		}
	}
	return selected, source
}
