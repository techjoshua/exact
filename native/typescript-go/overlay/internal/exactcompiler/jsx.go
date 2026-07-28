package exactcompiler

import (
	"sort"
	"unicode"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/internal/ast"
)

// collectJSX records syntax facts used by native reactivity and element
// lowering. Authored order and spans are preserved as the stable join keys.
func collectJSX(sourceFile *ast.SourceFile) []JSXElement {
	var elements []JSXElement
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		var tag *ast.Node
		var attributes *ast.Node
		switch {
		case ast.IsJsxOpeningElement(node):
			opening := node.AsJsxOpeningElement()
			tag = opening.TagName
			attributes = opening.Attributes
		case ast.IsJsxSelfClosingElement(node):
			opening := node.AsJsxSelfClosingElement()
			tag = opening.TagName
			attributes = opening.Attributes
		default:
			return true
		}
		tagText := sourceText(sourceFile, tag)
		elements = append(elements, JSXElement{
			Tag:        tagText,
			Intrinsic:  jsxIntrinsic(tagText),
			Start:      node.Pos(),
			Length:     node.End() - node.Pos(),
			Attributes: collectJSXAttributes(attributes),
		})
		return true
	})
	sort.Slice(elements, func(left int, right int) bool {
		return elements[left].Start < elements[right].Start
	})
	return elements
}

func collectJSXAttributes(attributes *ast.Node) []JSXAttribute {
	if attributes == nil {
		return []JSXAttribute{}
	}
	result := make([]JSXAttribute, 0, len(attributes.AsJsxAttributes().Properties.Nodes))
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		attribute := JSXAttribute{
			Start:  property.Pos(),
			Length: property.End() - property.Pos(),
		}
		if ast.IsJsxSpreadAttribute(property) {
			attribute.ValueKind = "spread"
			result = append(result, attribute)
			continue
		}
		declaration := property.AsJsxAttribute()
		name := declaration.Name()
		if ast.IsJsxNamespacedName(name) {
			namespaced := name.AsJsxNamespacedName()
			attribute.Namespace = namespaced.Namespace.Text()
			attribute.Name = namespaced.Name().Text()
		} else {
			attribute.Name = name.Text()
		}
		switch {
		case declaration.Initializer == nil:
			attribute.ValueKind = "boolean"
		case ast.IsStringLiteral(declaration.Initializer):
			attribute.ValueKind = "string"
		default:
			attribute.ValueKind = "expression"
		}
		result = append(result, attribute)
	}
	return result
}

func jsxIntrinsic(tag string) bool {
	first, _ := utf8.DecodeRuneInString(tag)
	return first != utf8.RuneError && unicode.IsLower(first)
}
