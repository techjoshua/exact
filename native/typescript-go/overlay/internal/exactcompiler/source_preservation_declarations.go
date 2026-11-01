package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// preservationDeclarationRead validates an existing declaration selection as a
// nonexecuting lexical/import binding read. It does not resolve values, follow
// source aliases or enter a body. Only identifier reads of module-level hoisted ordinary function
// declarations qualify, avoiding const initialization, live-write and TDZ claims.
// Their body, captures and actual arguments remain independent proof obligations.
func (query *sourceValueQuery) preservationDeclarationRead(expression *ast.Node, view *sourcePropertyReferenceView, result *accessorCandidates) *ast.Node {
	if expression == nil || view == nil || !query.charge(result, expression) {
		return nil
	}
	expression = unwrapSourceCallableReferenceWithBudget(expression, func(n *ast.Node) bool { return query.charge(result, n) })
	if expression == nil {
		return nil
	}
	if !ast.IsIdentifier(expression) {
		return nil
	}

	original := sourceCallableReferenceSymbol(expression, query.owner.checker)
	if original == nil {
		return nil
	}
	canonical := resolvedCallableSymbol(original, query.owner.checker)
	if canonical == nil || len(canonical.Declarations) != 1 {
		return nil
	}
	// Mutable bindings and const aliases deliberately remain unsupported. A live
	// import is safe only when it denotes this checked, unwritten hoisted binding.
	declaration := canonical.Declarations[0]
	if !ast.IsFunctionDeclaration(declaration) || declaration.Body() == nil || len(declaration.Parameters()) != 0 {
		return nil
	}
	source := ast.GetSourceFileOfNode(declaration)
	if source == nil || source.IsDeclarationFile || declaration.Parent != source.AsNode() {
		return nil
	}
	selected := view.normalSources[source]
	origin := ast.GetSourceFileOfNode(expression)
	if selected == nil || selected.source != source || selected.cyclic || view.normalSources[origin] == nil {
		return nil
	}
	if query.owner.bindingWritten(canonical) || query.owner.bindingWritten(original) {
		return nil
	}
	async, ordinary := ordinaryResultCategory(declaration)
	if async || !ordinary {
		return nil
	}
	// This is the same nonexecuting declaration owner used by prepareInvocation.
	// No receiving/capturing frame or installed operation is supplied to it.
	selectionQuery := sourceValueQuery{owner: query.owner, executable: query.executable}
	selection := accessorCandidates{}
	alternatives := selectionQuery.callDeclarations(expression, &selection)
	if selection.opaque || len(alternatives) != 1 || alternatives[0] != declaration {
		return nil
	}
	return declaration
}
