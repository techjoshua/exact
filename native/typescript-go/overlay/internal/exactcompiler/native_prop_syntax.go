package exactcompiler

import (
	"strings"
	"sync"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/bundled"
	"github.com/microsoft/TypeScript/tsc/internal/vfs/osvfs"
)

// Standard DOM spellings are syntax metadata, independent of a project's inferred types.
// Read the compiler's bundled declarations once instead of maintaining another DOM catalog.
// Doing these edits before binding avoids invalidating project analysis for ordinary HTML
// spellings such as tabindex. Project-specific names and finite binding spreads still use
// the checked normalization pass; validity is always checked against the actual element.
var standardNativePropSpellings = sync.OnceValue(func() map[string]string {
	names := map[string]string{"classname": "className", "charset": "charSet"}
	text, ok := bundled.WrapFS(osvfs.FS()).ReadFile(bundled.LibPath() + "/lib.dom.d.ts")
	if !ok {
		return names
	}
	source := parseNormalizationSource("/lib.dom.d.ts", text)
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if !ast.IsInterfaceDeclaration(node) {
			return true
		}
		name := node.Name().Text()
		if !strings.HasPrefix(name, "HTML") && !strings.HasPrefix(name, "SVG") &&
			!strings.HasPrefix(name, "MathML") && name != "Element" {
			return false
		}
		for _, member := range node.AsInterfaceDeclaration().Members.Nodes {
			if member.Kind == ast.KindPropertySignature && member.Name() != nil && ast.IsIdentifier(member.Name()) {
				spelling := member.Name().Text()
				lower := strings.ToLower(spelling)
				if !strings.HasPrefix(lower, "on") && len(spelling) != 0 && spelling[0] >= 'a' && spelling[0] <= 'z' {
					names[lower] = spelling
				}
			}
		}
		return false
	})
	return names
})

// Share the already parsed prop-punning source. Event names require the JSX contract,
// and custom elements and component inputs retain their authored spelling.
func standardNativePropCasing(source *ast.SourceFile, node *ast.Node) []sourceEdit {
	if !ast.IsJsxOpeningElement(node) && !ast.IsJsxSelfClosingElement(node) {
		return nil
	}
	tag := sourceText(source, openingTag(node))
	if !jsxIntrinsic(tag) || strings.ContainsAny(tag, "-_") || node.Attributes() == nil {
		return nil
	}
	var edits []sourceEdit
	for _, property := range node.Attributes().AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) || !ast.IsIdentifier(property.Name()) {
			continue
		}
		name := property.Name()
		canonical := standardNativePropSpellings()[strings.ToLower(name.Text())]
		// Unlike link/script charset, meta charset has no DOM property and uses the JSX spelling.
		if tag == "meta" && strings.EqualFold(name.Text(), "charset") {
			canonical = "charSet"
		}
		if canonical != "" && canonical != name.Text() {
			edits = append(edits, sourceEdit{start: nodeTokenStart(source, name), end: name.End(), text: canonical})
		}
	}
	return edits
}
