package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

func jsxAttributesContainSpread(attributes *ast.Node) bool {
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			return true
		}
	}
	return false
}

// appendServerSpreadAttributes merges authored properties before serializing any of them.
// Serial HTML attributes cannot implement the last-write-wins semantics of object spreads.
// Reuse root property projection so URL checks see only the final value and callbacks stay omitted.
func (lowering *jsxLowering) appendServerSpreadAttributes(build *renderProgramBuild, attributes *ast.Node, tag string, path []int, node int) bool {
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			continue
		}
		if !ast.IsJsxAttribute(property) {
			return build.decline("unknown-attribute")
		}
		attribute := property.AsJsxAttribute()
		if ast.IsJsxNamespacedName(attribute.Name()) {
			return build.decline("namespaced-attribute")
		}
		if jsxAttributeText(attribute.Name()) == "data-exact-id" {
			return build.decline("reserved-attribute-data-exact-id")
		}
		if _, exists := lowering.componentBindings[property.Pos()]; exists {
			return build.decline("component-binding-attribute")
		}
	}
	build.spreadSlot(lowering.dynamicID(attributes), path, node, lowering.serverRenderProgramProps(attributes, tag))
	return true
}
