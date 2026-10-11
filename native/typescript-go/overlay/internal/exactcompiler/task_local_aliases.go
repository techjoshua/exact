package exactcompiler

import (
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// setupTaskLocalAliases records component-local candidate values without evaluating helpers.
// Literal destructuring uses synthetic selections for analysis only. Defaults and rest bindings
// cannot establish one callable owner here and remain with checked task analysis.
func setupTaskLocalAliases(statements []*ast.Node) map[string]*ast.Node {
	locals := map[string]*ast.Node{}
	for _, statement := range statements {
		if ast.IsFunctionDeclaration(statement) && statement.Name() != nil {
			locals[statement.Name().Text()] = statement
		}
		if ast.IsVariableStatement(statement) {
			for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				if ast.IsIdentifier(declaration.Name()) {
					locals[declaration.Name().Text()] = declaration.AsVariableDeclaration().Initializer
				}
			}
		}
	}
	factory := ast.NewNodeFactory(ast.NodeFactoryHooks{})
	var bind func(*ast.Node, *ast.Node)
	bind = func(name, value *ast.Node) {
		if name == nil || value == nil {
			return
		}
		if ast.IsIdentifier(name) {
			locals[name.Text()] = value
			return
		}
		if !ast.IsObjectBindingPattern(name) && !ast.IsArrayBindingPattern(name) {
			return
		}
		for index, node := range name.AsBindingPattern().Elements.Nodes {
			if !ast.IsBindingElement(node) {
				continue
			}
			binding := node.AsBindingElement()
			if binding.Initializer != nil || binding.DotDotDotToken != nil {
				continue
			}
			key := strconv.Itoa(index)
			if ast.IsObjectBindingPattern(name) {
				property := binding.PropertyName
				if property == nil {
					property = binding.Name()
				}
				if property != nil && ast.IsComputedPropertyName(property) {
					property = unwrapRenderExpression(property.AsComputedPropertyName().Expression)
				}
				if property == nil || (!ast.IsIdentifier(property) && !ast.IsStringLiteral(property)) {
					continue
				}
				key = property.Text()
			}
			selected := factory.NewElementAccessExpression(value, nil, factory.NewStringLiteral(key, ast.TokenFlagsNone), ast.NodeFlagsNone)
			bind(binding.Name(), selected)
		}
	}
	for _, statement := range statements {
		if !ast.IsVariableStatement(statement) {
			continue
		}
		for _, node := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
			if !ast.IsIdentifier(node.Name()) {
				bind(node.Name(), node.AsVariableDeclaration().Initializer)
			}
		}
	}
	return locals
}
