package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// runtimeVariableInitializer identifies eager source evaluation independently of
// its result shape or precision admission. Ambient declarations emit no work.
func runtimeVariableInitializer(statement *ast.Node) bool {
	if statement == nil || !ast.IsVariableStatement(statement) || ast.HasSyntacticModifier(statement, ast.ModifierFlagsAmbient) {
		return false
	}
	source := ast.GetSourceFileOfNode(statement)
	if source == nil || source.IsDeclarationFile || statement.Parent != source.AsNode() {
		return false
	}
	for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
		if declaration.Initializer() != nil {
			return true
		}
	}
	return false
}

// runtimeModuleEvaluation names one original top-level evaluation boundary.
// Nested work stays under this owner. The source walker, not statement shape,
// decides which children are eager, reachable or deferred.
func runtimeModuleEvaluation(statement *ast.Node) bool {
	if statement == nil {
		return false
	}
	source := ast.GetSourceFileOfNode(statement)
	if source == nil || source.IsDeclarationFile || statement.Parent != source.AsNode() || ast.HasSyntacticModifier(statement, ast.ModifierFlagsAmbient) {
		return false
	}
	switch statement.Kind {
	case ast.KindFunctionDeclaration, ast.KindInterfaceDeclaration, ast.KindTypeAliasDeclaration:
		return false
	case ast.KindImportDeclaration:
		return isSideEffectImport(statement)
	case ast.KindExportDeclaration:
		return false // Re-export module loading remains on the selected import owner.
	case ast.KindVariableStatement:
		return runtimeVariableInitializer(statement)
	default:
		return true
	}
}

// A definitely abrupt first initializer never acquires a resource to dispose.
// Otherwise the implicit protocol remains unmodeled, including for-of inputs.
func (query *sourceValueQuery) moduleDisposalMayBeAcquired(node *ast.Node) bool {
	if !ast.IsVariableDeclarationList(node) || node.Flags&ast.NodeFlagsUsing == 0 {
		return false
	}
	declarations := node.AsVariableDeclarationList().Declarations.Nodes
	if len(declarations) == 0 {
		return false
	}
	return query.sourceInitializerMayComplete(declarations[0].Initializer(), nil)
}

// Decorator expressions execute at definition. Their implicit application and
// possible replacement/initializers have no ordinary source execution contract.
func sourceClassHasDecoratorApplication(node *ast.Node) bool {
	if !ast.IsClassDeclaration(node) && !ast.IsClassExpression(node) {
		return false
	}
	if len(sourceDefinitionDecorators(node)) > 0 {
		return true
	}
	for _, member := range node.Members() {
		if len(sourceDefinitionDecorators(member)) > 0 {
			return true
		}
	}
	return false
}

// Definition decorators include legacy parameter modifiers, but never parameter
// defaults or bodies. The authored TypeScript options determine source validity.
func sourceDefinitionDecorators(node *ast.Node) []*ast.Node {
	var result []*ast.Node
	appendModifiers := func(target *ast.Node) {
		if modifiers := target.Modifiers(); modifiers != nil {
			for _, modifier := range modifiers.Nodes {
				if ast.IsDecorator(modifier) {
					result = append(result, modifier)
				}
			}
		}
	}
	appendModifiers(node)
	if ast.IsFunctionLike(node) {
		for _, parameter := range node.Parameters() {
			appendModifiers(parameter)
		}
	}
	return result
}

// Raw definition facts retain the default's existing phase obligation. Actual
// instantiated demands keep the protocol uncertainty after default selection.
func sourceDecoratorApplicationEffect(node, boundary *ast.Node, name string) EnvironmentEffectSource {
	effect := environmentSource("unknown", "implicit decorator application", name)
	effect.Opaque = true

	return sourceDefaultPhaseEffect(effect, node, boundary)
}

// A callable's definition expressions belong to its surrounding evaluation,
// unlike its parameter defaults and body.
func sourceDefinitionExpressionContains(callable, node *ast.Node) bool {
	for _, decorator := range sourceDefinitionDecorators(callable) {
		if decorator.Contains(node) {
			return true
		}
	}
	name := callable.Name()
	return name != nil && ast.IsComputedPropertyName(name) && name.Contains(node)
}

// Only a raw definition contribution gains this enclosing default guard. An
// instantiated caller can reference the same AST with a different owning fact.
func sourceDefaultPhaseEffect(effect EnvironmentEffectSource, operation, boundary *ast.Node) EnvironmentEffectSource {
	if initializer := sourceParameterDefault(operation, boundary); initializer != nil && enclosingCallableNode(initializer) == boundary {
		effect.callOrigin = &sourceCallOutcome{declaration: boundary, operation: initializer, consumer: boundary, phase: sourceDefaultEvaluation}
	}
	return effect
}
