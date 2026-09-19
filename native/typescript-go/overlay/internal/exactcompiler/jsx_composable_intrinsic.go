package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Fixed declarations can retain compiled rendering while exposing their authored structure on
// demand. Component bodies remain opaque: describing a child issues a receipt, never an instance.
func (lowering *jsxLowering) lowerComposableIntrinsicChild(node *ast.Node) *ast.Node {
	if lowering.target == TargetDefault || !lowering.fixedComposableJsx(node) {
		return nil
	}
	opening, children := composableJsxParts(node)
	if opening == nil {
		return nil
	}
	tag := sourceText(lowering.sourceFile, openingTag(opening))
	if !jsxIntrinsic(tag) || lowering.renderProgramIntrinsicHasEnhancements(opening.Attributes()) {
		return nil
	}
	// Document and text-host composition have specialized projection and ownership contracts.
	switch tag {
	case "html", "head", "body", "title", "textarea", "script", "style", "template":
		return nil
	}
	previousFallback, previousComposition := lowering.renderProgramFallback, lowering.composableRenderProgram
	defer func() {
		lowering.renderProgramFallback, lowering.composableRenderProgram = previousFallback, previousComposition
	}()
	lowering.renderProgramFallback = false
	lowering.composableRenderProgram = true
	program, _ := lowering.lowerRenderProgram(node, opening, children)
	if program == nil {
		return nil
	}
	// The description must remain structural, including nested children. No source expression
	// is evaluated twice: this path admits only literal props/text and fixed component names.
	lowering.renderProgramFallback = true
	description := lowering.visitor.VisitNode(node)
	return lowering.call(lowering.names.intrinsicComposition, []*ast.Node{program, lowering.arrow(description)})
}

func composableJsxParts(node *ast.Node) (*ast.Node, *ast.NodeList) {
	if ast.IsJsxElement(node) {
		element := node.AsJsxElement()
		return element.OpeningElement, element.Children
	}
	if ast.IsJsxSelfClosingElement(node) {
		return node, nil
	}
	return nil, nil
}

// Unknown expressions, spreads, bindings, and keyed declarations retain ordinary eager receipts.
func (lowering *jsxLowering) fixedComposableJsx(node *ast.Node) bool {
	if ast.IsJsxText(node) {
		return true
	}
	if ast.IsJsxExpression(node) {
		return fixedComposableLiteral(node.AsJsxExpression().Expression)
	}
	opening, children := composableJsxParts(node)
	if opening == nil || !ast.IsIdentifier(openingTag(opening)) {
		return false
	}
	tag := sourceText(lowering.sourceFile, openingTag(opening))
	if tag == "_" || tag == "_target" {
		return false
	}
	if attributes := opening.Attributes(); attributes != nil {
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if !ast.IsJsxAttribute(property) || jsxAttributeText(property.Name()) == "key" {
				return false
			}
			value := property.AsJsxAttribute().Initializer
			if value != nil && ast.IsJsxExpression(value) {
				value = value.AsJsxExpression().Expression
			}
			if !fixedComposableLiteral(value) {
				return false
			}
		}
	}
	if children != nil {
		for _, child := range children.Nodes {
			if !lowering.fixedComposableJsx(child) {
				return false
			}
		}
	}
	return true
}

func fixedComposableLiteral(node *ast.Node) bool {
	if node == nil {
		return true
	}
	switch node.Kind {
	case ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return true
	}
	return false
}
