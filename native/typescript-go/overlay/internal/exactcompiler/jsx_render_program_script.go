package exactcompiler

import (
	"html"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// staticDocumentScript preserves client adoption identity while folding a closed external script
// into its server document host. Inline content and runtime attribute policies stay independent.
func (lowering *jsxLowering) staticDocumentScript(node *ast.Node) (string, bool) {
	var opening *ast.Node
	var children *ast.NodeList
	if ast.IsJsxElement(node) {
		opening, children = node.AsJsxElement().OpeningElement, node.AsJsxElement().Children
	} else if ast.IsJsxSelfClosingElement(node) {
		opening = node
	} else {
		return "", false
	}
	if !lowering.plannedEmptyExternalScript(opening, children) {
		return "", false
	}
	if _, explicit := lowering.explicitElementIsland(node); explicit {
		return "", false
	}
	markup := `<script data-exact-id="` + html.EscapeString(lowering.elementID(node)) + `"`
	for _, property := range opening.Attributes().AsJsxAttributes().Properties.Nodes {
		attribute := property.AsJsxAttribute()
		name := jsxAttributeText(attribute.Name())
		if ast.IsJsxNamespacedName(attribute.Name()) || name == "key" || name == "data-exact-id" || interactiveJSXAttribute(name) {
			return "", false
		}
		if _, bound := lowering.componentBindings[property.Pos()]; bound {
			return "", false
		}
		_, value, static := lowering.plannedStaticRenderProgramAttribute("script", name, attribute.Initializer)
		if !static {
			return "", false
		}
		markup += value
	}
	return markup + "></script>", true
}

// plannedEmptyExternalScript admits only a server root with explicit attributes and no content.
// Client creation, inline text, spreads, and enhancement-owned scripts retain their existing lane.
func (lowering *jsxLowering) plannedEmptyExternalScript(opening *ast.Node, children *ast.NodeList) bool {
	if lowering.target != TargetServer || sourceText(lowering.sourceFile, openingTag(opening)) != "script" || (children != nil && len(children.Nodes) != 0) {
		return false
	}
	attributes := opening.Attributes()
	if attributes == nil || lowering.renderProgramIntrinsicHasEnhancements(attributes) {
		return false
	}
	hasSource := false
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			return false
		}
		name := jsxAttributeText(property.AsJsxAttribute().Name())
		if name == "ref" || name == "children" || name == "unsafeHtml" || name == "dangerouslySetInnerHTML" {
			return false
		}
		if name == "src" {
			hasSource = true
		}
	}
	return hasSource
}
