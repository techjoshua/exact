package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
)

// namespaceImportReference follows the existing immutable receiver owner to its
// actual namespace import binding. Structural types and selected export values
// cannot establish this receiver relation. Mutable or foreign aliases refuse.
func (query *sourceValueQuery) namespaceImportReference(receiver *ast.Node, result *accessorCandidates) (*ast.Symbol, *ast.Node) {
	if receiver == nil || !query.charge(result, receiver) {
		return nil, nil
	}
	root := stableSourceCallableReference(receiver, query.owner.checker)
	if root == nil || !ast.IsIdentifier(root) || !query.charge(result, root) {
		return nil, nil
	}
	original := query.owner.checker.GetSymbolAtLocation(root)
	if original == nil || len(original.Declarations) != 1 {
		return nil, nil
	}
	declaration := original.Declarations[0]
	if !ast.IsNamespaceImport(declaration) || query.owner.checker.GetSymbolAtLocation(declaration.Name()) != original || query.owner.bindingWritten(original) {
		return nil, nil
	}
	for parent := declaration.Parent; parent != nil; parent = parent.Parent {
		if !query.charge(result, parent) {
			return nil, nil
		}
		if ast.IsImportDeclaration(parent) {
			clause := parent.AsImportDeclaration().ImportClause
			if clause == nil || !importHasRuntimeBinding(clause) {
				return nil, nil
			}
			return original, parent
		}
	}
	return nil, nil
}

// namespaceExportReadEffect owns only the current export Get's mutation
// component. The immutable import receiver and selected ESM export route supply
// it, never the returned function, a type or a Module flag. Initializer effects,
// value uncertainty and live writes remain on their existing producers.
func (query *sourceValueQuery) namespaceExportReadEffect(node *ast.Node, slot *sourceNormalOperation, result *accessorCandidates) sourceWriteVerdict {
	if query.owner == nil || query.owner.program == nil || query.owner.generation == nil || !query.owner.generation.active || query.inputs == nil || query.operation == nil || query.operation.node != node || query.operation.inputs != query.inputs || slot == nil || slot.state != sourceOperationInProgress || query.normalOperation(node, false) != slot || !slot.authority.valid(query) || slot.population != query.inputs.population || slot.entry == nil || slot.population.entries[node] != slot.entry {
		return sourceWriteTop
	}
	var receiver *ast.Node
	var key string
	if ast.IsPropertyAccessExpression(node) {
		receiver = node.Expression()
		key = node.Name().Text()
	} else if ast.IsElementAccessExpression(node) {
		receiver = node.Expression()
		operand := unwrapSourceCallableReference(node.AsElementAccessExpression().ArgumentExpression)
		// A computed operand with work cannot borrow this whole-Get component.
		if operand == nil || !ast.IsStringLiteralLike(operand) {
			return sourceWriteTop
		}
		key = operand.Text()
	} else {
		return sourceWriteTop
	}
	original, edge := query.namespaceImportReference(receiver, result)
	if original == nil {
		return sourceWriteTop
	}
	module := query.owner.checker.GetAliasedSymbol(original)
	source, state := query.operationDependencyState(edge, result)
	if state != sourceDependencyAvailable || source == nil || source != moduleSourceFile(module) || source.IsDeclarationFile || !ast.IsExternalModule(source) || source.CommonJSModuleIndicator != nil {
		return sourceWriteTop
	}
	// The configured ESM compilation owns emitted module semantics. Package
	// lookup metadata alone does not override that mode for a bundler project.
	mode := query.owner.program.Options().GetEmitModuleKind()
	esm := mode >= core.ModuleKindES2015 && mode <= core.ModuleKindES2022 || mode == core.ModuleKindESNext || mode == core.ModuleKindPreserve
	if !esm && !(mode >= core.ModuleKindNode16 && mode <= core.ModuleKindNodeNext && query.owner.program.GetEmitModuleFormatOfFile(source) == core.ModuleKindESNext) {
		return sourceWriteTop
	}
	for _, statement := range source.Statements.Nodes {
		if !query.charge(result, statement) || ast.IsExportAssignment(statement) && statement.AsExportAssignment().IsExportEquals {
			return sourceWriteTop
		}
	}
	view := query.propertyView()
	if view == nil || !view.normalSelectionDone || view.normalIdentity == nil {
		return sourceWriteTop
	}
	selected := view.normalSources[source]
	if selected == nil || selected.source != source || selected.cyclic || selected.population == nil {
		return sourceWriteTop
	}
	query.charge(result, nil)
	exported := query.owner.checker.TryGetMemberInModuleExports(key, module)
	if exported == nil {
		return sourceWriteTop
	}
	if chosen, owned := query.executable.symbol(exported, make(map[ast.SymbolId]bool)); owned {
		if chosen == nil {
			return sourceWriteTop
		}
		exported = chosen
	}
	canonical := resolvedCallableSymbol(exported, query.owner.checker)
	// Reuse the existing bounded hoisted-export/dependency contract. Written
	// bindings keep their current value/uncertainty and receive no new purity law.
	if canonical == nil || !query.selectedAliasProvenance(edge, module, original, canonical, result) {
		return sourceWriteTop
	}
	return sourceWriteNoWrites
}
