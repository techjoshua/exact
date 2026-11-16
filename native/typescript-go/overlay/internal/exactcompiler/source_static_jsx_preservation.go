package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// admitStaticIntrinsicPreservation records a PRIVATE conditional framework/host
// premise, not NoWrites. The exact selected implementations and conforming host
// must preserve P through every activation. Unaccounted replacement/reentry is
// outside this premise. Direct child checks reuse lowering syntax decisions and
// never run lowering or recursively evaluate a body. Nested hazards are checked
// separately by the existing selected inventory and cached dependency folds.
func (query *sourceValueQuery) admitStaticIntrinsicPreservation(node *ast.Node, admitted map[*ast.Node]bool, result *accessorCandidates) bool {
	var opening *ast.Node
	var children []*ast.Node
	switch {
	case ast.IsJsxElement(node):
		opening = node.AsJsxElement().OpeningElement
		children = node.AsJsxElement().Children.Nodes
	case ast.IsJsxSelfClosingElement(node):
		opening = node
	default:
		return false
	}
	if !query.charge(result, node) {
		return false
	}
	tag := openingTag(opening)
	if tag == nil || !ast.IsIdentifier(tag) || !jsxIntrinsic(tag.Text()) {
		return false
	}
	if !simpleIntrinsicSourceHost(tag.Text()) {
		return false
	}
	attributes := opening.Attributes()
	if attributes == nil {
		return false
	}
	nodes := []*ast.Node{node, opening, tag, attributes}
	if ast.IsJsxElement(node) {
		closing := node.AsJsxElement().ClosingElement
		if closing == nil || closing.AsJsxClosingElement().TagName.Text() != tag.Text() {
			return false
		}
		nodes = append(nodes, closing, closing.AsJsxClosingElement().TagName)
	}
	for _, attribute := range attributes.AsJsxAttributes().Properties.Nodes {
		if !query.charge(result, attribute) || !ast.IsJsxAttribute(attribute) || !ast.IsIdentifier(attribute.Name()) {
			return false
		}
		name := attribute.Name().Text()
		initializer := attribute.AsJsxAttribute().Initializer
		if name != "id" && name != "title" && name != "hidden" && !strings.HasPrefix(name, "data-") {
			return false
		}
		if initializer != nil {
			if !ast.IsStringLiteral(initializer) {
				return false
			}
			if _, _, static := staticRenderProgramAttribute(tag.Text(), name, initializer); !static {
				return false
			}
		}
		nodes = append(nodes, attribute, attribute.Name())
		if initializer != nil {
			nodes = append(nodes, initializer)
		}
	}
	for _, child := range children {
		if !query.charge(result, child) {
			return false
		}
		if ast.IsJsxText(child) {
			nodes = append(nodes, child)
			continue
		}
		if !ast.IsJsxElement(child) && !ast.IsJsxSelfClosingElement(child) {
			return false
		}
	}
	for _, part := range nodes {
		admitted[part] = true
	}
	return true
}

// preservationFold is a boolean P transfer over cached recipes. A true child
// may mutate DOM/runtime storage, so no sourceWriteVerdict is created or installed.
// Syntax containers join every evaluated child. Unknown or unpaid facts refuse.
func (query *sourceValueQuery) preservationFold(fold sourceNormalFold, components, jsx map[*ast.Node]bool, read, operation func(*ast.Node) bool, result *accessorCandidates) bool {
	node := fold.node
	if node == nil || fold.kind == sourceNormalEnter {
		return false
	}
	join := func() bool {
		for i, child := range fold.children {
			if !query.charge(result, child) {
				return false
			}
			if sourceNormalStructural(child) || i < len(fold.erasedChildren) && fold.erasedChildren[i] {
				continue
			}
			if !components[child] {
				return false
			}
		}
		return true
	}
	if jsx[node] {
		return join()
	}
	if sourceNormalStructural(node) {
		return true
	}
	if fold.creation {
		async, ordinary := ordinaryResultCategory(node)
		if ordinary && !async && (node.Name() == nil || !ast.IsComputedPropertyName(node.Name())) {
			return join()
		}
		return false
	}
	switch node.Kind {
	case ast.KindNumericLiteral, ast.KindStringLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return true
	case ast.KindIdentifier:
		return read(node)
	case ast.KindSourceFile, ast.KindArrowFunction, ast.KindFunctionDeclaration, ast.KindGetAccessor, ast.KindSetAccessor, ast.KindBlock, ast.KindExpressionStatement, ast.KindReturnStatement, ast.KindVoidExpression, ast.KindParenthesizedExpression, ast.KindAsExpression, ast.KindTypeAssertionExpression, ast.KindSatisfiesExpression, ast.KindNonNullExpression, ast.KindObjectLiteralExpression:
		return join()
	case ast.KindPropertyAssignment:
		if name := node.Name(); name != nil && !ast.IsComputedPropertyName(name) && name.Text() != "__proto__" {
			return join()
		}
	case ast.KindPropertyAccessExpression, ast.KindElementAccessExpression, ast.KindCallExpression:
		return operation(node)
	}
	return false
}

// simpleIntrinsicSourceHost shares only the finite source-host family. Callers
// separately own child, property, target and preservation contracts.
func simpleIntrinsicSourceHost(tag string) bool {
	switch tag {
	case "p", "div", "span", "strong", "em", "br":
		return true
	}
	return false
}
