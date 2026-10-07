package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// collectionMapBindingRender retains the whole item for key selection while preserving
// parameter destructuring, defaults and body execution in the authored callback.
func (lowering *jsxLowering) collectionMapBindingRender(render *ast.Node) *ast.Node {
	render = lowering.collectionMapDefaultTypes(render)
	parameter := render.Parameters()[0].AsParameterDeclaration()
	if ast.IsIdentifier(parameter.Name()) {
		return render
	}
	name := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactCollectionItem"))
	binding := lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(
		lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewVariableDeclaration(parameter.Name(), nil, nil, name)}), ast.NodeFlagsConst))
	body := render.Body()
	statements := []*ast.Node{binding}
	if ast.IsBlock(body) {
		statements = append(statements, body.AsBlock().Statements.Nodes...)
	} else {
		statements = append(statements, lowering.factory.NewReturnStatement(body))
	}
	emittedBody := lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true)
	emittedParameter := lowering.factory.UpdateParameterDeclaration(parameter, parameter.Modifiers(), parameter.DotDotDotToken, name, parameter.QuestionToken, parameter.Type, parameter.Initializer)
	parameters := lowering.factory.NewNodeList([]*ast.Node{emittedParameter})
	if ast.IsArrowFunction(render) {
		arrow := render.AsArrowFunction()
		return lowering.factory.UpdateArrowFunction(arrow, arrow.Modifiers(), arrow.TypeParameters, parameters, arrow.Type, arrow.FullSignature, arrow.EqualsGreaterThanToken, emittedBody)
	}
	function := render.AsFunctionExpression()
	return lowering.factory.UpdateFunctionExpression(function, function.Modifiers(), function.AsteriskToken, function.Name(), function.TypeParameters, parameters, function.Type, function.FullSignature, emittedBody)
}

// A callback default retains its authored item type when moved from Array.map
// to a generic compiler helper. Otherwise generated checking contextualizes it as T.
func (lowering *jsxLowering) collectionMapDefaultTypes(render *ast.Node) *ast.Node {
	for _, parameter := range render.Parameters() {
		if parameter.AsParameterDeclaration().Initializer != nil && parameter.AsParameterDeclaration().Type == nil {
			return lowering.preserveContextualCallbackTypes(render, "", "")
		}
	}
	return render
}
