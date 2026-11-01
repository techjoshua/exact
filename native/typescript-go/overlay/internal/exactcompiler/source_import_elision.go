package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// prepareImportElision consumes the active request's original-source capability.
// An owner with no current generation keeps the syntactic dependency unknown.
func (owner *sourceValueOwner) prepareImportElision(source *ast.SourceFile, imports []*ast.Node) (map[*ast.Node]bool, bool) {
	generation := owner.generation
	if generation == nil || generation.checker != owner.checker || generation.program != owner.program {
		return nil, false
	}
	return generation.importElisionReceipt(source, imports)
}

// emittedImportDeclarationErased combines the existing type eraser's explicit
// type-only removal with the prepared import elider's alias decisions. Only the
// entire ES import declaration is certified absent. Other declaration forms and
// side-effect-only imports retain their original dependency semantics.
func emittedImportDeclarationErased(node *ast.Node, resolver *checker.EmitResolver) bool {
	if node == nil || !ast.IsImportDeclaration(node) || !ast.IsParseTreeNode(node) || resolver == nil {
		return false
	}
	clause := node.AsImportDeclaration().ImportClause
	if clause == nil {
		return false
	}
	imported := clause.AsImportClause()
	if imported.IsTypeOnly() {
		return true
	}
	if imported.Name() != nil && resolver.IsReferencedAliasDeclaration(clause) {
		return false
	}
	bindings := imported.NamedBindings
	if bindings == nil {
		return true
	}
	if !ast.IsParseTreeNode(bindings) {
		return false
	}
	if ast.IsNamespaceImport(bindings) {
		return !resolver.IsReferencedAliasDeclaration(bindings)
	}
	if !ast.IsNamedImports(bindings) {
		return false
	}
	for _, specifier := range bindings.AsNamedImports().Elements.Nodes {
		if !ast.IsImportSpecifier(specifier) || !ast.IsParseTreeNode(specifier) {
			return false
		}
		if !specifier.IsTypeOnly() && resolver.IsReferencedAliasDeclaration(specifier) {
			return false
		}
	}
	return true
}

// dependencyEdgeErased never overrides a host-selected executable edge. A
// reentrant or unprepared index supplies no absence proof. Syntactic import
// inventory remains intact for selection and all conservative consumers.
func (query *sourceValueQuery) dependencyEdgeErased(slot *ast.Node) bool {
	if slot == nil {
		return false
	}
	if query.executable != nil {
		if _, owned := query.executable.selectedModule(slot); owned {
			return false
		}
	}
	source := ast.GetSourceFileOfNode(slot)
	if source == nil {
		return false
	}
	index := query.owner.index(source)
	return !index.incomplete && index.erasedImports[slot]
}

// hasRuntimeDependency preserves selection precedence for direct inventory
// guards as well as dependency traversal. Incomplete inventory is never empty.
func (query *sourceValueQuery) hasRuntimeDependency(index sourceValueIndex) bool {
	if index.incomplete {
		return true
	}
	for _, slot := range index.runtimeImports {
		if !query.dependencyEdgeErased(slot) {
			return true
		}
	}
	return false
}
