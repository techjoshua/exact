package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// keyedCollectionRender keeps a native map's array shape while giving each returned JSX
// item its authored identity. Nested functions retain their own return and ownership boundaries.
func (lowering *jsxLowering) keyedCollectionRender(render *ast.Node, key *ast.Node) *ast.Node {
	emitted := lowering.visitor.VisitNode(render)
	if ast.IsArrowFunction(emitted) && !ast.IsBlock(emitted.Body()) {
		arrow := emitted.AsArrowFunction()
		return lowering.factory.UpdateArrowFunction(arrow, arrow.Modifiers(), arrow.TypeParameters,
			arrow.Parameters, arrow.Type, arrow.FullSignature, arrow.EqualsGreaterThanToken,
			lowering.keyedCollectionResult(arrow.Body, key))
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if node != emitted && isCallableNode(node) {
			return node
		}
		if ast.IsReturnStatement(node) {
			statement := node.AsReturnStatement()
			if statement.Expression != nil {
				return lowering.factory.UpdateReturnStatement(statement, lowering.keyedCollectionResult(statement.Expression, key))
			}
		}
		return visitor.VisitEachChild(node)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(emitted)
}

// keyedCollectionResult avoids an extra SSR item wrapper when the native program owns the root.
func (lowering *jsxLowering) keyedCollectionResult(value *ast.Node, key *ast.Node) *ast.Node {
	arguments := []*ast.Node{value, key}
	if program := unwrapRenderExpression(value); lowering.target == TargetServer && ast.IsCallExpression(program) {
		expression := program.AsCallExpression().Expression
		if ast.IsIdentifier(expression) && expression.Text() == lowering.names.preparedServerProgram {
			arguments = append(arguments, lowering.factory.NewTrueExpression())
		}
	}
	return lowering.call(lowering.names.keyedChild, arguments)
}
