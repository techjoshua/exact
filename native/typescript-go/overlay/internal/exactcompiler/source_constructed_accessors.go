package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceConstructedMemberDemand keeps the constructor source and its member
// observation together without creating an instance or a descriptor proof.
type sourceConstructedMemberDemand struct {
	source     *ast.Node
	projection []string
	name       string
	mode       accessorTraversal
}

// visitConstructedAccessor resolves member effects of source constructor results.
// Structural result types cannot account for foreign or Proxy Get/Set effects.
func (query *sourceValueQuery) visitConstructedAccessor(demand sourceConstructedMemberDemand, arguments sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool), visitOrigins func([]sourceValue, []string, bool)) {
	value, projection, name, mode := demand.source, demand.projection, demand.name, demand.mode

	if (len(projection) > 0 || name != "") && query.possibleProxyGetEffects(value, projection, name, mode, arguments, result) {
		return
	}
	// A structural array type can revoke completeness, never prove native identity.
	if len(projection) > 0 && query.owner.checker.IsArrayLikeType(query.owner.checker.GetTypeAtLocation(value)) {
		result.opaque = true
	}
	sourceInstance := false
	if definition, selected := query.executable.definition(value.AsNewExpression().Expression); selected {
		result.selected = true
		if definition == nil {
			result.opaque = true
		} else {
			sourceInstance = (ast.IsClassDeclaration(definition) || ast.IsClassExpression(definition)) && !ast.GetSourceFileOfNode(definition).IsDeclarationFile
			visit(definition, projection, true)
		}
		if !sourceInstance && (len(projection) > 0 || name != "") {
			result.receiverIncomplete = true
			result.opaque = true
		}
		return
	}
	symbol := sourceCallableReferenceSymbol(value.AsNewExpression().Expression, query.owner.checker)
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = query.sourceAlias(symbol, result)
	}
	if symbol != nil {
		if argument, exists := arguments[ast.GetSymbolId(symbol)]; exists {
			visitOrigins(argument, projection, true)
		}
		for _, declaration := range symbol.Declarations {
			if ast.IsClassDeclaration(declaration) {
				sourceInstance = !ast.GetSourceFileOfNode(declaration).IsDeclarationFile
				visit(declaration, projection, true)
			}
			if ast.IsVariableDeclaration(declaration) {
				initializer := unwrapSourceCallableReference(declaration.Initializer())
				sourceInstance = sourceInstance || initializer != nil && ast.IsClassExpression(initializer) && !ast.GetSourceFileOfNode(initializer).IsDeclarationFile
				visit(declaration.AsVariableDeclaration().Initializer, projection, true)
			}
		}
	}
	// An unmodeled constructor result may be a Proxy or foreign object.
	// Structural callable/member types do not account for its Get/Set effects.
	if !sourceInstance && (len(projection) > 0 || name != "") {
		result.receiverIncomplete = true
		result.opaque = true
		// An unmodeled callable constructor result may be a Proxy. Its
		// compatible Function methods cannot discharge real Get/trap
		// effects. This withholds authority, never asserts native identity.
		if nativeFunctionInvocation(value, "call", query.owner.checker) {
			result.opaque = true
			result.cause = value
		}
	}
	return

}
