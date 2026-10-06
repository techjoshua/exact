package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// continuationTaskDefinitions retains task and ordinary callable definitions for
// executor closures. Only referenced definitions are reconstructed. Setup effects
// and non-callable initializers are not replayed when a continuation runs.
func continuationTaskDefinitions(factory *printer.NodeFactory, component *ast.Node, continuations []Continuation) []*ast.Node {
	result := []*ast.Node{}
	if component.Body() == nil || !ast.IsBlock(component.Body()) {
		return result
	}
	for _, statement := range component.Body().AsBlock().Statements.Nodes {
		if ast.IsFunctionDeclaration(statement) && statement.Name() != nil {
			function := statement.AsFunctionDeclaration()
			value := factory.NewFunctionExpression(function.Modifiers(), function.AsteriskToken,
				function.Name(), function.TypeParameters, function.Parameters, function.Type, function.FullSignature, function.Body)
			result = append(result, factory.NewVariableDeclaration(function.Name(), nil, nil, value))
			continue
		}
		if !ast.IsVariableStatement(statement) {
			continue
		}
		for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
			if !ast.IsIdentifier(declaration.Name()) {
				continue
			}
			initializer := declaration.AsVariableDeclaration().Initializer
			progress := false
			if initializer != nil && ast.IsCallExpression(initializer) {
				arguments := callArguments(initializer)
				if len(arguments) == 1 && ast.IsStringLiteral(arguments[0]) {
					for _, continuation := range continuations {
						for _, id := range continuation.Progress {
							progress = progress || id.ID == arguments[0].Text()
						}
					}
				}
			}
			if progress || (initializer != nil && (ast.IsArrowFunction(initializer) || ast.IsFunctionExpression(initializer))) || len(continuationWorkByID(initializer, continuations)) != 0 {
				result = append(result, declaration)
			}
		}
	}
	return result
}

// continuationTaskDependencies closes references transitively and keeps declaration order stable.
// Mutually recursive tasks retain lexical bindings without evaluating either body during setup.
func continuationTaskDependencies(work *ast.Node, definitions []*ast.Node) []*ast.Node {
	needed := continuationReferencedNames(work)
	selected := make(map[string]bool)
	for changed := true; changed; {
		changed = false
		for _, definition := range definitions {
			name := definition.Name().Text()
			if _, referenced := needed[name]; !referenced || selected[name] {
				continue
			}
			selected[name] = true
			changed = true
			for reference := range continuationReferencedNames(definition.AsVariableDeclaration().Initializer) {
				needed[reference] = struct{}{}
			}
		}
	}
	result := []*ast.Node{}
	for _, definition := range definitions {
		if selected[definition.Name().Text()] {
			result = append(result, definition)
		}
	}
	return result
}
