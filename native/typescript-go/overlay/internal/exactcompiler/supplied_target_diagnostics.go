package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// collectSuppliedPlacementDiagnostics checks a component's complete render expression, not just
// immediate JSX siblings. Conditional alternatives contribute their minimum simultaneous count;
// runtime ownership handles conditions that cannot be proven from syntax.
func collectSuppliedPlacementDiagnostics(sourceFile *ast.SourceFile, imports *enhancementImports) {
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsFunctionDeclaration(node) && !ast.IsFunctionExpression(node) && !ast.IsArrowFunction(node) {
			return true
		}
		props := componentPropsParameterName(node)
		for _, value := range suppliedPlacementReturns(node) {
			render := unwrapRenderExpression(value)
			if render == nil || !ast.IsArrowFunction(render) {
				continue
			}
			for _, output := range suppliedPlacementReturns(render) {
				if simultaneousSuppliedPlacements(output, props, sourceFile) > 1 {
					imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(sourceFile, output, "EXACT6020", "A supplied target can have only one active placement per component owner"))
				}
			}
		}
		return true
	})
}

func simultaneousSuppliedPlacements(node *ast.Node, props string, sourceFile *ast.SourceFile) int {
	node = unwrapRenderExpression(node)
	if node == nil {
		return 0
	}
	if ast.IsJsxExpression(node) {
		return simultaneousSuppliedPlacements(node.AsJsxExpression().Expression, props, sourceFile)
	}
	if props != "" {
		name, matches := rootPropertyName(node, props)
		if matches && name == "children" {
			return 1
		}
	}
	if ast.IsJsxSelfClosingElement(node) && sourceText(sourceFile, openingTag(node)) == "_target" {
		return 1
	}
	if ast.IsConditionalExpression(node) {
		conditional := node.AsConditionalExpression()
		return min(simultaneousSuppliedPlacements(conditional.WhenTrue, props, sourceFile), simultaneousSuppliedPlacements(conditional.WhenFalse, props, sourceFile))
	}
	var children []*ast.Node
	if ast.IsJsxElement(node) {
		children = node.AsJsxElement().Children.Nodes
	}
	if ast.IsJsxFragment(node) {
		children = node.AsJsxFragment().Children.Nodes
	}
	count := 0
	for _, child := range children {
		count += simultaneousSuppliedPlacements(child, props, sourceFile)
	}
	return count
}

func suppliedPlacementReturns(node *ast.Node) []*ast.Node {
	if ast.IsArrowFunction(node) && !ast.IsBlock(node.AsArrowFunction().Body) {
		return []*ast.Node{node.AsArrowFunction().Body}
	}
	return directCallableReturns(node)
}
