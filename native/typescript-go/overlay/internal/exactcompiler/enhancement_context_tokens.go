package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Substitute a sole leaf-helper obligation only when its module binding and a
// component value binding resolve to the same shared context constant.
func directImportedContextContract(component *callableFacts, fallback, contract enhancementCallableContextContract, c *checker.Checker) enhancementCallableContextContract {
	helper := fallback.soleHelper
	if c == nil {
		return fallback
	}
	if helper.summary.Kind == "component" || len(helper.directContext) != 1 || len(contract.dependencies) != 0 || len(contract.effects.Provides)+len(contract.effects.Requires) != 1 || len(contract.effects.OptionallyConsumes) != 0 {
		return fallback
	}
	effect := helper.directContext[0]
	symbol := helper.sourceFile.AsNode().Locals()[effect.Token]
	binding := contextRootBinding(symbol, c)
	if binding == nil || ast.GetNodeId(binding) != effect.rootDeclaration {
		return fallback
	}
	symbol = resolvedCallableSymbol(symbol, c)
	if symbol == nil || symbol.ValueDeclaration == nil {
		return fallback
	}
	token := symbol.ValueDeclaration
	if !ast.IsVariableDeclaration(token) || token.Parent.Flags&ast.NodeFlagsConst == 0 || token.Initializer() == nil || !ast.IsCallExpression(token.Initializer()) {
		return fallback
	}
	call := token.Initializer().AsCallExpression()
	ref, ok := resolvedCoreImportReference(call.Expression, ast.GetSourceFileOfNode(token), c)
	if !ok || ref.moduleSpecifier != "@exactjs/core" || ref.exportName != "createContext" || call.Arguments == nil || len(call.Arguments.Nodes) > 1 {
		return fallback
	}
	slot := componentContextTokenBinding(component.sourceFile, c, token, effect.Kind == "write")
	if slot == nil {
		return fallback
	}
	name := slot.Name().Text()
	if effect.Kind == "write" && len(contract.effects.Provides) == 1 && contract.effects.Provides[0] == effect.Token {
		result := enhancementCallableContextContract{effects: EnhancementContextEffects{Provides: []string{name}}}
		if ast.IsExportSpecifier(slot) {
			for _, edge := range component.summary.Calls {
				op := component.fieldEdgeOperations[edge.ID]
				if edge.Resolved && edge.TargetID == helper.summary.ID && op != nil && ast.IsCallExpression(op) &&
					immediateContextProviderCall(op.AsCallExpression(), helper.node, component.node, c) {
					result.reexportedToken = slot
					return result
				}
			}
			return fallback
		}
		return result
	}
	if effect.Kind == "read" && len(contract.effects.Requires) == 1 && contract.effects.Requires[0] == effect.Token {
		return enhancementCallableContextContract{effects: EnhancementContextEffects{Requires: []string{name}}}
	}
	return fallback
}

// A value re-export already establishes a runtime dependency on its module. A
// forwarded provider may import the very same token under a fresh local name.
// A sibling declaration or erased export cannot supply that binding.
func componentContextTokenBinding(source *ast.SourceFile, c *checker.Checker, token *ast.Node, allowReexport bool) *ast.Node {
	var reexport *ast.Node
	for _, stmt := range source.Statements.Nodes {
		var slots []*ast.Node
		switch stmt.Kind {
		case ast.KindImportDeclaration:
			imp := stmt.AsImportDeclaration()
			if imp.Attributes != nil || imp.ImportClause == nil || imp.ImportClause.AsImportClause().IsTypeOnly() {
				continue
			}
			bindings := imp.ImportClause.AsImportClause().NamedBindings
			if bindings == nil || !ast.IsNamedImports(bindings) {
				continue
			}
			slots = bindings.AsNamedImports().Elements.Nodes
		case ast.KindExportDeclaration:
			exp := stmt.AsExportDeclaration()
			if !allowReexport || exp.ModuleSpecifier == nil || exp.Attributes != nil || exp.IsTypeOnly || exp.ExportClause == nil || !ast.IsNamedExports(exp.ExportClause) {
				continue
			}
			slots = exp.ExportClause.AsNamedExports().Elements.Nodes
		default:
			continue
		}
		for _, spec := range slots {
			if !ast.IsIdentifier(spec.Name()) {
				continue
			}
			symbol := c.GetSymbolAtLocation(spec.Name())
			if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 || c.GetTypeOnlyAliasDeclaration(symbol) != nil {
				continue
			}
			resolved := c.GetAliasedSymbol(symbol)
			if resolved == nil || resolved.ValueDeclaration != token {
				continue
			}
			if ast.IsImportSpecifier(spec) && !spec.AsImportSpecifier().IsTypeOnly {
				return spec
			}
			if ast.IsExportSpecifier(spec) && !spec.AsExportSpecifier().IsTypeOnly && (spec.AsExportSpecifier().PropertyName == nil || ast.IsIdentifier(spec.AsExportSpecifier().PropertyName)) {
				reexport = spec
			}
		}
	}
	return reexport
}

// A synchronous registration receiving the component itself is setup work:
// descendants may need the provided value before the next setup statement.
// Other operations, owners and explicit task policies keep their ordinary rules.
func immediateContextProviderCall(call *ast.CallExpression, work, component *ast.Node, c *checker.Checker) bool {
	if !ast.IsIdentifier(unwrapSourceCallableReference(call.Expression)) || call.Arguments == nil || len(call.Arguments.Nodes) != 1 || call.Arguments.Nodes[0].Kind != ast.KindThisKeyword ||
		ast.HasSyntacticModifier(work, ast.ModifierFlagsAsync) || len(work.Parameters()) != 1 {
		return false
	}
	// A prior use could have exposed the receiver or replaced its writable
	// method. A direct registration at setup entry has no such predecessor.
	for _, formal := range component.Parameters() {
		if formal.Initializer() != nil || formal.Name() == nil || !ast.IsIdentifier(formal.Name()) {
			return false
		}
	}
	setup := component.Body()
	if setup == nil || !ast.IsBlock(setup) || len(setup.AsBlock().Statements.Nodes) == 0 {
		return false
	}
	first := setup.AsBlock().Statements.Nodes[0]
	if !ast.IsExpressionStatement(first) || unwrapSourceCallableReference(first.Expression()) != call.AsNode() {
		return false
	}
	param := work.Parameters()[0]
	if param.Type() == nil || param.Name() == nil || !ast.IsIdentifier(param.Name()) {
		return false
	}
	body := work.Body()
	if !ast.IsBlock(body) || len(body.AsBlock().Statements.Nodes) != 1 {
		return false
	}
	stmt := body.AsBlock().Statements.Nodes[0]
	if !ast.IsExpressionStatement(stmt) || !ast.IsCallExpression(stmt.Expression()) {
		return false
	}
	registration := stmt.Expression().AsCallExpression()
	member := registration.Expression
	if !ast.IsPropertyAccessExpression(member) || member.Name().Text() != "setContext" || !ast.IsIdentifier(member.Expression()) ||
		registration.Arguments == nil || len(registration.Arguments.Nodes) != 2 {
		return false
	}
	symbol := c.GetSymbolAtLocation(member.Expression())
	return symbol != nil && symbol.ValueDeclaration == param && componentReceiverType(param.Type(), map[*ast.Symbol]bool{})
}
