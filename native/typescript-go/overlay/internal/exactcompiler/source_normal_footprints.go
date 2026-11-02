package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// NoWrites classifies mutation of preexisting externally reachable storage. It
// does not classify placement, throws, return identity, exposure or settlement.
// The zero value is deliberately Top, including for a missing child component.
type sourceWriteVerdict uint8

const (
	sourceWriteTop sourceWriteVerdict = iota
	sourceWriteNoWrites
)

type sourceNormalEventKind uint8

const (
	sourceNormalEnter sourceNormalEventKind = iota
	sourceNormalFinish
	sourceNormalCreation
	sourceNormalErased
	sourceNormalResidual
)

type sourceNormalFold struct {
	kind           sourceNormalEventKind
	node           *ast.Node
	children       []*ast.Node
	erasedChildren []bool
	creation       bool
}

type sourceInstalledFormal struct {
	symbol    *ast.Symbol
	parameter *ast.Node
	inputs    *sourceValueInputs
}

// consumeNormalFold composes only events supplied by the actual normal driver.
// It does not evaluate syntax, resolve values or enter deferred callable work.
func (query *sourceValueQuery) consumeNormalFold(fold sourceNormalFold, result *accessorCandidates) {
	defer query.normalWork(result, fold.node).finish(result)
	inputs := query.inputs
	if inputs == nil || !query.charge(result, fold.node) {
		return
	}
	if inputs.writeComponents == nil {
		inputs.writeComponents = make(map[*ast.Node]sourceWriteVerdict)
	}
	inputs.writeComponents[fold.node] = sourceNormalWriteEffect(fold, sourceNormalWriteContext{
		charge:    func(node *ast.Node) bool { return query.charge(result, node) },
		component: func(node *ast.Node) sourceWriteVerdict { return inputs.writeComponents[node] },
		read: func(node *ast.Node) sourceWriteVerdict {
			symbol := query.owner.checker.GetSymbolAtLocation(node)
			// Use the same checker-owned undefined identity as literalDecision.
			// A shadow, ambient lookalike or assignment expression gains no law.
			if query.owner.checker.IsUndefinedSymbol(symbol) {
				return sourceWriteNoWrites
			}
			if symbol != nil {
				installed, ok := inputs.installedFormals[ast.GetSymbolId(symbol)]
				if ok && installed.symbol == symbol && installed.inputs == inputs && installed.parameter.Name() != nil && query.owner.checker.GetSymbolAtLocation(installed.parameter.Name()) == symbol {
					return sourceWriteNoWrites
				}
			}
			// Reuse the checked hoisted declaration's nonexecuting binding-read law.
			// Imported initialization and actual body effects stay separately owned.
			if query.preservationDeclarationRead(node, query.propertyView(), result) != nil {
				return sourceWriteNoWrites
			}
			if query.initializedModuleCallable(node, result) {
				return sourceWriteNoWrites
			}
			return sourceWriteTop
		},
		operation: func(node *ast.Node) sourceWriteVerdict {
			if slot := query.normalOperation(node, false); slot != nil && slot.state == sourceOperationConsumed {
				return slot.writeEffect
			}
			return sourceWriteTop
		},
	})
}

func sourceNormalStructural(node *ast.Node) bool {
	return ast.IsTypeNode(node) || ast.IsPartOfTypeNode(node) || normalStructuralSyntax(node)
}
func normalStructuralSyntax(node *ast.Node) bool {
	if node == nil {
		return false
	}
	if ast.IsComputedPropertyName(node) {
		return false
	}
	if node.Kind != ast.KindUnknown && node.Kind <= ast.KindLastToken && !ast.IsExpression(node) {
		return true
	}
	if ast.IsTypeAliasDeclaration(node) || ast.IsInterfaceDeclaration(node) {
		return true
	}
	if node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) && node.Parent.Name() == node {
		return false
	}
	// Both the local name and imported/exported name are binding syntax.
	// Renaming does not introduce an identifier Get on the foreign spelling.
	if node.Parent != nil && (ast.IsImportSpecifier(node.Parent) || ast.IsExportSpecifier(node.Parent) || ast.IsNamespaceImport(node.Parent) || ast.IsImportClause(node.Parent)) {
		return true
	}
	if ast.IsDeclarationName(node) || isStaticPropertyName(node) {
		return true
	}
	// Static module clauses establish bindings. Their runtime dependency and
	// initialization work belongs to the selected source graph, not to these
	// syntax nodes. Dynamic import and evaluating export assignments stay work.
	switch node.Kind {
	case ast.KindImportDeclaration, ast.KindImportClause, ast.KindNamedImports, ast.KindImportSpecifier, ast.KindNamespaceImport, ast.KindExportDeclaration, ast.KindNamedExports, ast.KindExportSpecifier:
		return true
	case ast.KindExportKeyword, ast.KindDefaultKeyword, ast.KindAsyncKeyword, ast.KindDeclareKeyword, ast.KindReadonlyKeyword, ast.KindPublicKeyword, ast.KindPrivateKeyword, ast.KindProtectedKeyword, ast.KindStaticKeyword:
		return true
	}
	return false
}

// initializedModuleCallable proves only an unwritten direct module const that
// necessarily completed before this unconditional same-source read. Available
// callee values and lexical cell existence supply no initialization authority.
func (query *sourceValueQuery) initializedModuleCallable(read *ast.Node, result *accessorCandidates) bool {
	if !ast.IsIdentifier(read) || query.inputs == nil || query.inputs.population == nil || !query.charge(result, read) {
		return false
	}
	population := query.inputs.population
	source := ast.GetSourceFileOfNode(read)
	if source == nil || source.ExternalModuleIndicator == nil || source.IsDeclarationFile {
		return false
	}
	use := population.entries[read]
	if use == nil || use.region != nil || !use.once || population.moduleEntry(read, use.statement) == nil {
		return false
	}
	symbol := query.owner.checker.GetSymbolAtLocation(read)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || len(symbol.Declarations) != 1 || symbol.ValueDeclaration != symbol.Declarations[0] {
		return false
	}
	declaration := symbol.ValueDeclaration
	if !ast.IsVariableDeclaration(declaration) || !ast.IsIdentifier(declaration.Name()) || query.owner.checker.GetSymbolAtLocation(declaration.Name()) != symbol || ast.GetSourceFileOfNode(declaration) != source {
		return false
	}
	list := declaration.Parent
	if list == nil || !ast.IsVariableDeclarationList(list) || list.Flags&ast.NodeFlagsConst == 0 {
		return false
	}
	statement := list.Parent
	if statement == nil || !ast.IsVariableStatement(statement) || statement.Parent != source.AsNode() || ast.HasSyntacticModifier(statement, ast.ModifierFlagsExport|ast.ModifierFlagsAmbient) {
		return false
	}
	entry := population.entries[declaration]
	if entry == nil || !entry.once || entry.region != nil || entry.statement != statement || entry.ordinal >= use.ordinal {
		return false
	}
	initializer := declaration.Initializer()
	if initializer == nil || !(ast.IsArrowFunction(initializer) || ast.IsFunctionExpression(initializer)) || ast.HasSyntacticModifier(initializer, ast.ModifierFlagsAsync) {
		return false
	}
	async, ordinary := ordinaryResultCategory(initializer)
	if async || !ordinary {
		return false
	}
	index := query.owner.index(source)
	if index.incomplete || index.privateUses == nil || !index.privateUses.complete || len(index.privateUses.unresolved[read.Text()]) != 0 || query.owner.bindingWritten(symbol) {
		return false
	}
	if index.normalExportUnknown || index.normalDynamicScope || index.normalExported[ast.GetSymbolId(symbol)] {
		return false
	}
	return query.charge(result, declaration)
}

// normalFoldKind classifies syntax during cached plan construction. Unsupported
// runtime operators retain an explicit residual, rather than disappearing when
// they have no legacy sparse demand. Containers do not require whole-root purity.
func normalFoldKind(node *ast.Node, creation bool) sourceNormalEventKind {
	if sourceNormalStructural(node) {
		return sourceNormalErased
	}
	if creation {
		if node.Name() != nil && ast.IsComputedPropertyName(node.Name()) {
			return sourceNormalResidual
		}
		return sourceNormalCreation
	}
	switch node.Kind {
	case ast.KindSourceFile, ast.KindBlock, ast.KindEmptyStatement, ast.KindExpressionStatement, ast.KindReturnStatement, ast.KindVariableStatement, ast.KindVariableDeclarationList, ast.KindVariableDeclaration, ast.KindParameter,
		ast.KindIdentifier, ast.KindNumericLiteral, ast.KindStringLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword,
		ast.KindVoidExpression, ast.KindParenthesizedExpression, ast.KindAsExpression, ast.KindTypeAssertionExpression, ast.KindSatisfiesExpression, ast.KindNonNullExpression,
		ast.KindObjectLiteralExpression, ast.KindCallExpression, ast.KindPropertyAccessExpression, ast.KindElementAccessExpression, ast.KindAwaitExpression,
		ast.KindFunctionDeclaration, ast.KindFunctionExpression, ast.KindArrowFunction, ast.KindGetAccessor, ast.KindSetAccessor, ast.KindMethodDeclaration,
		ast.KindImportDeclaration, ast.KindImportClause, ast.KindNamedImports, ast.KindImportSpecifier, ast.KindNamespaceImport, ast.KindExportDeclaration, ast.KindNamedExports, ast.KindExportSpecifier:
		return sourceNormalFinish
	case ast.KindPropertyAssignment:
		if node.Name() != nil && !ast.IsComputedPropertyName(node.Name()) && node.Name().Text() != "__proto__" {
			return sourceNormalFinish
		}
	}
	return sourceNormalResidual
}
