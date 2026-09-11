package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// componentHasDocumentView recognizes an authored document without evaluating the view.
// Indirect, conditional, and block-bodied views retain runtime document discovery.
func componentHasDocumentView(component *ast.Node) bool {
	returns := directCallableReturns(component)
	if len(returns) != 1 {
		return false
	}
	view := unwrapRenderExpression(returns[0])
	if !ast.IsArrowFunction(view) {
		return false
	}
	root := unwrapRenderExpression(view.AsArrowFunction().Body)
	if !ast.IsJsxElement(root) {
		return false
	}
	tag := openingTag(root.AsJsxElement().OpeningElement)
	return ast.IsIdentifier(tag) && tag.Text() == "html"
}

// plannedDocumentHost retains document ownership while ordinary programs serialize its contents.
func plannedDocumentHost(tag string) bool {
	return tag == "html" || tag == "head" || tag == "body"
}

// canonicalProgramDocument proves the order that generic document normalization otherwise owns.
// Conditional, missing, duplicated, and loose children retain the runtime normalization path.
func canonicalProgramDocument(children *ast.NodeList) bool {
	if children == nil {
		return false
	}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	tags := []string{}
	for index, child := range semantic {
		if ast.IsJsxText(child) && normalizeJSXChildText(child.AsJsxText().Text, index, len(semantic)) == "" {
			continue
		}
		if ast.IsJsxExpression(child) && child.AsJsxExpression().Expression == nil {
			continue
		}
		if !ast.IsJsxElement(child) {
			return false
		}
		tag := openingTag(child.AsJsxElement().OpeningElement)
		if !ast.IsIdentifier(tag) {
			return false
		}
		tags = append(tags, tag.Text())
	}
	return len(tags) == 2 && tags[0] == "head" && tags[1] == "body"
}

// staticDocumentProgramChild coalesces server literals without changing the DOM adopted by client children.
func (lowering *jsxLowering) staticDocumentProgramChild(node *ast.Node) bool {
	var opening *ast.Node
	var children *ast.NodeList
	if ast.IsJsxElement(node) {
		opening = node.AsJsxElement().OpeningElement
		children = node.AsJsxElement().Children
	} else if ast.IsJsxSelfClosingElement(node) {
		opening = node
	} else {
		return false
	}
	tag := sourceText(lowering.sourceFile, openingTag(opening))
	if !jsxIntrinsic(tag) || unsupportedPlannedHost(tag) || lowering.renderProgramIntrinsicHasEnhancements(opening.Attributes()) {
		return false
	}
	if _, explicit := lowering.explicitServerIsland(node); explicit {
		return false
	}
	if attributes := opening.Attributes(); attributes != nil {
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if !ast.IsJsxAttribute(property) {
				return false
			}
			attribute := property.AsJsxAttribute()
			name := jsxAttributeText(attribute.Name())
			if name == "ref" || name == "key" || interactiveJSXAttribute(name) {
				return false
			}
			if _, _, static := lowering.plannedStaticRenderProgramAttribute(tag, name, attribute.Initializer); !static {
				return false
			}
		}
	}
	if children != nil {
		for _, child := range ast.GetSemanticJsxChildren(children.Nodes) {
			if ast.IsJsxText(child) {
				continue
			}
			if !lowering.staticDocumentProgramChild(child) {
				return false
			}
		}
	}
	return true
}

// documentProgramChild uses ordinary child issuance, including eager independent sibling tasks.
func (lowering *jsxLowering) documentProgramChild(child *ast.Node, siblings *ast.NodeList) []*ast.Node {
	if !ast.IsJsxExpression(child) && lowering.independentAsyncSiblings(siblings) {
		return []*ast.Node{lowering.visitor.VisitNode(child)}
	}
	return lowering.children(lowering.factory.NewNodeList([]*ast.Node{child}))
}
