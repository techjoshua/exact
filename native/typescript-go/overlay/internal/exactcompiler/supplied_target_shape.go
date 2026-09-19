package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// transparentSuppliedTargetOutput proves a whole output is one supplied placement. It never follows
// nested components; verified local target helpers retain the same supplied-child contract.
func transparentSuppliedTargetOutput(component *ast.Node, sourceFile *ast.SourceFile, callables callableAnalysis) bool {
	returns := directCallableReturns(component)
	if len(returns) != 1 {
		return false
	}
	render := unwrapRenderExpression(returns[0])
	if !ast.IsArrowFunction(render) || ast.IsBlock(render.AsArrowFunction().Body) {
		return false
	}
	output := unwrapRenderExpression(render.AsArrowFunction().Body)
	props := componentPropsParameterName(component)
	isSupplied := func(node *ast.Node) bool {
		name, matches := rootPropertyName(unwrapRenderExpression(node), props)
		return props != "" && matches && name == "children"
	}
	if isSupplied(output) {
		return true
	}
	if ast.IsJsxSelfClosingElement(output) {
		return sourceText(sourceFile, openingTag(output)) == "_target"
	}
	if !ast.IsJsxElement(output) {
		return transparentSuppliedHelperOutput(output, props, sourceFile, callables, make(map[string]bool))
	}
	element := output.AsJsxElement()
	if sourceText(sourceFile, openingTag(element.OpeningElement)) != "_target" {
		return false
	}
	var supplied *ast.Node
	for _, child := range element.Children.Nodes {
		if ast.IsJsxText(child) {
			if strings.TrimSpace(sourceText(sourceFile, child)) != "" {
				return false
			}
			continue
		}
		if !ast.IsJsxExpression(child) || supplied != nil {
			return false
		}
		supplied = child.AsJsxExpression().Expression
	}
	return supplied != nil && isSupplied(supplied)
}
