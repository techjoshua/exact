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
		if ast.IsFunctionDeclaration(statement) && statement.Name() != nil && statement.Body() != nil {
			function := statement.AsFunctionDeclaration()
			value := factory.NewFunctionExpression(function.Modifiers(), function.AsteriskToken,
				function.Name(), function.TypeParameters, function.Parameters, function.Type, function.FullSignature, function.Body)
			result = append(result, factory.NewVariableDeclaration(function.Name(), nil, nil, value))
			continue
		}
		if ast.IsClassDeclaration(statement) && statement.Name() != nil {
			result = append(result, statement)
			continue
		}
		if !ast.IsVariableStatement(statement) {
			continue
		}
		for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
			if !ast.IsIdentifier(declaration.Name()) {
				continue
			}
			initializer := unwrapSourceCallableReference(declaration.AsVariableDeclaration().Initializer)
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
			value := definition
			if ast.IsVariableDeclaration(definition) {
				value = definition.AsVariableDeclaration().Initializer
			}
			for reference := range continuationReferencedNames(value) {
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

// continuationTaskBindings binds only reconstructed compiler task definitions.
// Direct SSR construction can precede any active frame and must remain unbound.
// Executor dependency construction runs synchronously inside the request frame.
type continuationTaskBindings struct {
	imports externalImportBindings
	name    string
	used    bool
}

func newContinuationTaskBindings(sourceFile *ast.SourceFile, used map[string]struct{}) *continuationTaskBindings {
	return &continuationTaskBindings{
		imports: collectExternalImportBindings(sourceFile, nil),
		name:    allocateGeneratedName(used, "__exactBindContinuationTask"),
	}
}

// bind retains the request owner for status while explicit invokeTask keeps the
// same definition and retained parent across subsequent await boundaries.
func (bindings *continuationTaskBindings) bind(factory *printer.NodeFactory, initializer *ast.Node) *ast.Node {
	value := unwrapSourceCallableReference(initializer)
	if value == nil || !ast.IsCallExpression(value) {
		return initializer
	}
	reference, found := externalImportForExpression(value.AsCallExpression().Expression, bindings.imports, nil)
	if !found || reference.moduleSpecifier != "@exactjs/core/framework/server-task-helpers" || reference.exportName != "defineTask" {
		return initializer
	}
	bindings.used = true
	return factory.NewCallExpression(factory.NewIdentifier(bindings.name), nil, nil, factory.NewNodeList([]*ast.Node{initializer}), ast.NodeFlagsNone)
}
