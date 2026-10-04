package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// renderProgramParentNamespace resolves the concrete DOM namespace inherited by a planned region.
// A component ancestor or standalone JSX root leaves the physical insertion point unknown.
// Contextual programs resolve that namespace at attachment without specializing the component.
func (lowering *jsxLowering) renderProgramParentNamespace(node *ast.Node) (string, bool) {
	if lowering.renderProgramContexts == nil {
		lowering.renderProgramContexts = make(map[int]renderProgramContext)
		walkNode(lowering.sourceFile.AsNode(), func(candidate *ast.Node) bool {
			if ast.IsJsxElement(candidate) || ast.IsJsxSelfClosingElement(candidate) {
				namespace, certain := lowering.renderProgramSourceParentNamespace(candidate)
				lowering.renderProgramContexts[candidate.Pos()] = renderProgramContext{
					namespace: namespace,
					certain:   certain,
				}
			}
			return true
		})
	}
	if context, exists := lowering.renderProgramContexts[node.Pos()]; exists {
		return context.namespace, context.certain
	}
	return lowering.renderProgramSourceParentNamespace(node)
}

func (lowering *jsxLowering) renderProgramSourceParentNamespace(node *ast.Node) (string, bool) {
	type ancestor struct {
		tag        string
		attributes *ast.Node
	}
	tags := make([]ancestor, 0, 2)
	for current := node.Parent; current != nil; current = current.Parent {
		if !ast.IsJsxElement(current) {
			continue
		}
		tag := sourceText(lowering.sourceFile, openingTag(current.AsJsxElement().OpeningElement))
		if tag == "_" {
			continue
		}
		if !jsxIntrinsic(tag) {
			return "", false
		}
		tags = append(tags, ancestor{tag, current.AsJsxElement().OpeningElement.Attributes()})
	}
	if len(tags) == 0 {
		return "", false
	}
	parentNamespace := "contextual"
	for index := len(tags) - 1; index >= 0; index-- {
		entry := tags[index]
		namespace := renderProgramNamespace(entry.tag, parentNamespace)
		parentNamespace = renderProgramChildNamespace(entry.tag, namespace, entry.attributes)
	}
	return parentNamespace, parentNamespace != "contextual"
}

func renderProgramNamespace(tag string, parent string) string {
	if tag == "svg" {
		return "svg"
	}
	if tag == "math" {
		return "mathml"
	}
	if parent == "svg" {
		return "svg"
	}
	if parent == "mathml-text" {
		if tag == "mglyph" || tag == "malignmark" {
			return "mathml"
		}
		return "html"
	}
	if parent == "mathml" {
		return "mathml"
	}
	if parent == "contextual" {
		return "contextual"
	}
	return "html"
}

func renderProgramChildNamespace(tag string, namespace string, attributes *ast.Node) string {
	if namespace == "svg" && tag == "foreignObject" {
		return "html"
	}
	if namespace == "mathml" {
		switch tag {
		case "mi", "mo", "mn", "ms", "mtext":
			return "mathml-text"
		case "annotation-xml":
			html, known := renderProgramAnnotationEncoding(attributes)
			if !known {
				return "contextual"
			}
			if html {
				return "html"
			}
		}
	}
	return namespace
}

// renderProgramAnnotationEncoding proves static HTML integration without evaluating authored
// props. Unknown encoding uses ordinary intrinsic attachment so props precede child creation.
func renderProgramAnnotationEncoding(attributes *ast.Node) (html bool, known bool) {
	known = true
	if attributes == nil {
		return
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			html, known = false, false
			continue
		}
		if !ast.IsJsxAttribute(property) || jsxAttributeText(property.Name()) != "encoding" {
			continue
		}
		value := property.AsJsxAttribute().Initializer
		if value != nil && ast.IsJsxExpression(value) {
			value = value.AsJsxExpression().Expression
		}
		if value == nil || !ast.IsStringLiteral(value) {
			html, known = false, false
			continue
		}
		encoding := strings.ToLower(value.Text())
		html, known = encoding == "text/html" || encoding == "application/xhtml+xml", true
	}
	return
}
