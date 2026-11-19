package exactcompiler

import (
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// walkJSXOpenings visits each authored opening in source order, including JSX
// nested in attribute values. The parser marks subtrees that contain JSX.
func walkJSXOpenings(source *ast.SourceFile, visit func(*ast.Node) bool) {
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if node.SubtreeFacts()&ast.SubtreeContainsJsx == 0 {
			return false
		}
		if ast.IsJsxOpeningElement(node) || ast.IsJsxSelfClosingElement(node) {
			return visit(node)
		}
		return true
	})
}

// collectJSX records syntax facts used by native reactivity and element
// lowering. Authored order and spans are preserved as the stable join keys.
func collectJSX(sourceFile *ast.SourceFile) []JSXElement {
	var elements []JSXElement
	walkJSXOpenings(sourceFile, func(node *ast.Node) bool {
		tag, attributes := openingTag(node), node.Attributes()
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
	// A member tag is a value expression even when its namespace is lowercase.
	if strings.Contains(tag, ".") {
		return false
	}
	first, _ := utf8.DecodeRuneInString(tag)
	return first != utf8.RuneError && unicode.IsLower(first)
}
