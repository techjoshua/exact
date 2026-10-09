package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// captureComponentPropTypes retains JSX-resolved signatures before lowering changes authored
// parent links. The checking projection validates normalized bindings against these same types.
func (lowering *jsxLowering) captureComponentPropTypes() {
	if !lowering.checking || lowering.checker == nil {
		return
	}
	lowering.componentPropTypes = make(map[SourceSpan]*ast.Node)
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if (!ast.IsJsxOpeningElement(node) && !ast.IsJsxSelfClosingElement(node)) || jsxIntrinsic(sourceText(lowering.sourceFile, openingTag(node))) {
			return true
		}
		props := lowering.checker.GetContextualType(node.Attributes(), checker.ContextFlagsNone)
		for _, attribute := range node.Attributes().AsJsxAttributes().Properties.Nodes {
			if _, bound := lowering.componentBindings[attribute.Pos()]; bound {
				if resolved, _ := componentBindingPropsType(openingTag(node), lowering.checker); resolved != nil {
					props = resolved
				}
				break
			}
		}
		if props != nil {
			lowering.componentPropTypes[nodeSourceSpan(node)] = lowering.checker.TypeToTypeNode(props, node, nodebuilder.FlagsNoTruncation, nil)
		}
		return true
	})
}

// checkComponentProps checks the authored prop bag after binding expansion, without treating
// compiler-owned enhancement metadata or JSX keys as public component props. Executable output
// remains unchanged because these obligations exist only in the neutral checking projection.
func (lowering *jsxLowering) checkComponentProps(opening, props *ast.Node, children *ast.NodeList) *ast.Node {
	typeNode := lowering.componentPropTypes[nodeSourceSpan(opening)]
	if typeNode == nil {
		return props
	}
	props = lowering.propsWithReactivity(opening.Attributes(), "", false, "", false)
	if !ast.IsObjectLiteralExpression(props) {
		return props
	}
	properties := make([]*ast.Node, 0, len(props.AsObjectLiteralExpression().Properties.Nodes))
	for _, property := range props.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsPropertyAssignment(property) {
			name := property.Name().Text()
			if name == "key" || name == "__exactEnhancements" {
				continue
			}
			for _, attribute := range opening.Attributes().AsJsxAttributes().Properties.Nodes {
				if ast.IsJsxAttribute(attribute) && jsxAttributeText(attribute.Name()) == name {
					lowering.emitContext.AssignSourceMapRange(property, attribute)
					lowering.emitContext.AssignSourceMapRange(property.Name(), attribute.Name())
					break
				}
			}
		}
		properties = append(properties, property)
	}
	values := lowering.componentPropChildren(children)
	if len(values) != 0 {
		value := values[0]
		if len(values) > 1 {
			value = lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false)
		}
		property := lowering.property(lowering.factory.NewIdentifier("children"), value)
		semantic := ast.GetSemanticJsxChildren(children.Nodes)
		lowering.emitContext.AssignSourceMapRange(property, semantic[0])
		lowering.emitContext.AssignSourceMapRange(property.Name(), semantic[0])
		properties = append(properties, property)
	}
	checked := lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(properties), false)
	lowering.emitContext.AssignSourceMapRange(checked, openingTag(opening))
	lowering.emitContext.SetTokenSourceMapRange(checked, ast.KindOpenBraceToken, openingTag(opening).Loc)
	lowering.emitContext.SetTokenSourceMapRange(checked, ast.KindCloseBraceToken, openingTag(opening).Loc)
	// An argument obligation gives missing/spread errors the prop bag's source range.
	// `satisfies` reports those errors on its synthetic keyword, losing the authored tag.
	name := lowering.factory.NewIdentifier("__exactComponentProps")
	parameter := lowering.factory.NewParameterDeclaration(nil, nil, name, nil, typeNode, nil)
	// The receipt consumes an erased record after the call has checked public props.
	key := lowering.factory.NewParameterDeclaration(nil, nil, lowering.factory.NewIdentifier("key"), nil, lowering.factory.NewKeywordTypeNode(ast.KindStringKeyword), nil)
	record := lowering.factory.NewTypeLiteralNode(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewIndexSignatureDeclaration(nil, lowering.factory.NewNodeList([]*ast.Node{key}), lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword))}))
	erased := lowering.factory.NewAsExpression(lowering.factory.NewAsExpression(name, lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)), record)
	identity := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList([]*ast.Node{parameter}), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), erased)
	return lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(identity), nil, nil, lowering.factory.NewNodeList([]*ast.Node{checked}), ast.NodeFlagsNone)
}

// componentPropChildren retains the authored single-child or array type before receipt
// construction and reactive wrapping erase the JSX children argument's public constraint.
func (lowering *jsxLowering) componentPropChildren(children *ast.NodeList) []*ast.Node {
	if children == nil {
		return nil
	}
	var values []*ast.Node
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	for index, child := range semantic {
		switch {
		case ast.IsJsxText(child):
			if text := normalizeJSXChildText(child.AsJsxText().Text, index, len(semantic)); text != "" {
				values = append(values, lowering.factory.NewStringLiteral(text, ast.TokenFlagsNone))
			}
		case ast.IsJsxExpression(child):
			if expression := child.AsJsxExpression().Expression; expression != nil {
				values = append(values, lowering.visitor.VisitNode(expression))
			}
		default:
			values = append(values, lowering.visitor.VisitNode(child))
		}
	}
	return values
}
