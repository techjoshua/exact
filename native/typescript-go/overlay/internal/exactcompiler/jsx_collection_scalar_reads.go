package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// lowerCollectionRender retains scalar readers in the same keyed item scope
// as JSX readers. Reading a derived cell once while creating the item would
// discard its later updates. Native SSR uses the same range shape for adoption.
func (lowering *jsxLowering) lowerCollectionRender(render *ast.Node) *ast.Node {
	render = lowering.collectionMapDefaultTypes(render)
	reads := make(map[int]*ast.Node)
	expressions := directCallableReturns(render)
	if ast.IsArrowFunction(render) && !ast.IsBlock(render.Body()) {
		expressions = append(expressions, render.Body())
	}
	for _, expression := range expressions {
		if lowering.scalarRenderProgramExpression(expression) &&
			lowering.hasReactiveComponentCapture(expression) &&
			safeReactiveInitializer(expression, lowering.sourceFile, lowering.checker) {
			// Return statements preserve authored ranges when their values are synthesized.
			position := render.Pos()
			if expression.Parent != nil && ast.IsReturnStatement(expression.Parent) {
				position = expression.Parent.Pos()
			}
			reads[position] = expression
		}
	}
	emitted := lowering.visitor.VisitNode(render)
	wrap := func(expression *ast.Node) *ast.Node {
		return lowering.call(lowering.names.dynamic, []*ast.Node{lowering.arrow(expression)})
	}
	if ast.IsArrowFunction(emitted) && !ast.IsBlock(emitted.Body()) {
		if _, reactive := reads[render.Pos()]; reactive {
			arrow := emitted.AsArrowFunction()
			return lowering.factory.UpdateArrowFunction(arrow, arrow.Modifiers(), arrow.TypeParameters,
				arrow.Parameters, arrow.Type, arrow.FullSignature, arrow.EqualsGreaterThanToken, wrap(arrow.Body))
		}
		return emitted
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if node != emitted && isCallableNode(node) {
			return node
		}
		if ast.IsReturnStatement(node) {
			statement := node.AsReturnStatement()
			if statement.Expression != nil {
				if _, reactive := reads[node.Pos()]; reactive {
					return lowering.factory.UpdateReturnStatement(statement, wrap(statement.Expression))
				}
			}
		}
		return visitor.VisitEachChild(node)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(emitted)
}
