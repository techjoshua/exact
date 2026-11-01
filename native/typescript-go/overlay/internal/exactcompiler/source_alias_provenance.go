package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// selectedAliasProvenance joins the checker's canonical export identity to the
// existing executable dependency owner. It does not resolve another module or
// execute its initializer. All initialization effects remain independent demands.
// Local DFS completion validates an acyclic selected graph, never an active proof.
func (query *sourceValueQuery) selectedAliasProvenance(edge *ast.Node, module, original, canonical *ast.Symbol, result *accessorCandidates) bool {
	if query.executable == nil || module == nil || canonical == nil || canonical.ValueDeclaration == nil || query.owner.bindingWritten(original) || query.owner.bindingWritten(canonical) {
		return false
	}
	declaration := canonical.ValueDeclaration
	if !ast.IsFunctionDeclaration(declaration) || declaration.Body() == nil {
		return false
	}
	target := ast.GetSourceFileOfNode(declaration)
	if target == nil || target.IsDeclarationFile {
		return false
	}
	// GetAliasedSymbol selected the original binding. The immediate module must
	// actually export that same canonical identity under executable selection.
	exportedIdentity := false
	for _, exported := range query.owner.checker.GetExportsOfModule(module) {
		if !query.charge(result, edge) {
			return false
		}
		if selected, owned := query.executable.symbol(exported, make(map[ast.SymbolId]bool)); owned {
			if selected == nil {
				return false
			}
			exported = selected
		}
		if resolvedCallableSymbol(exported, query.owner.checker) == canonical {
			exportedIdentity = true
		}
	}
	if !exportedIdentity {
		return false
	}
	start, state := query.operationDependencyState(edge, result)
	if state != sourceDependencyAvailable || start == nil || start != moduleSourceFile(module) {
		return false
	}
	states := make(map[*ast.SourceFile]uint8)
	reached := false
	var visit func(*ast.SourceFile) bool
	visit = func(source *ast.SourceFile) bool {
		if source == nil || source.IsDeclarationFile || !query.charge(result, edge) {
			return false
		}
		if states[source] == 1 {
			return false
		}
		if states[source] == 2 {
			return true
		}
		states[source] = 1
		index := query.owner.index(source)
		if index.incomplete {
			return false
		}
		reached = reached || source == target
		for _, dependency := range index.runtimeImports {
			selected, availability := query.operationDependencyState(dependency, result)
			if availability == sourceDependencyErased {
				continue
			}
			// Canonical checker aliases describe the authored graph. A different
			// host-selected edge needs its own identity proof and remains refused.
			reference, _ := executableDeclarationReference(dependency)
			var bound *ast.SourceFile
			if reference != nil {
				bound = moduleSourceFile(query.owner.checker.GetSymbolAtLocation(reference))
			}
			if availability != sourceDependencyAvailable || selected != bound || !visit(selected) {
				return false
			}
		}
		states[source] = 2
		return true
	}
	return visit(start) && reached
}
