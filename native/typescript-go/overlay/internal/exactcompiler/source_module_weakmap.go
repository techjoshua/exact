package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// directWeakMapOperation recognizes the actual source Get or simple Set slot.
// Saved methods, adapters and complex assignments have separate effect owners.
func (q *sourceValueQuery) directWeakMapOperation(mode accessorTraversal) bool {
	member := q.protectedMember
	if q.pendingMemberRequest != nil || member == nil || !ast.IsPropertyAccessExpression(member) || member.Parent == nil {
		return false
	}
	_, name := accessorReceiver(member)
	if name != "get" && name != "set" {
		return false
	}
	parent := member.Parent
	if mode == accessorRead || mode == accessorAcquire {
		return ast.IsCallExpression(parent) && parent.Expression() == member
	}
	return mode == accessorSet|accessorNoGet && ast.IsBinaryExpression(parent) &&
		parent.AsBinaryExpression().Left == member && parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken
}

// moduleWeakMapBinding identifies this direct use of a stable module allocation.
// It does not prove an own slot absent or authorize a normal result.
func (q *sourceValueQuery) moduleWeakMapBinding(site, member *ast.Node) *ast.Symbol {
	construction, found := q.executable.standardConstructions[site]
	if !found || !construction.selectionComplete || !runtimeModuleEvaluation(construction.owner) ||
		site.Parent == nil || !ast.IsVariableDeclaration(site.Parent) || site.Parent.Initializer() != site ||
		member == nil || !ast.IsPropertyAccessExpression(member) || !ast.IsIdentifier(member.Expression()) {
		return nil
	}
	symbol := q.owner.checker.GetSymbolAtLocation(member.Expression())
	if symbol == nil || symbol.ValueDeclaration != site.Parent || q.owner.bindingWritten(symbol) {
		return nil
	}
	return symbol
}

// ordinaryWeakMapMemberEffects recognizes the standard algorithm at the
// original direct invocation. The enclosing source walk owns operand effects.
// The native Call can throw and provides no static result or storage fact.
func (q *sourceValueQuery) ordinaryWeakMapMemberEffects(call *ast.Node, value sourceValue) bool {
	if !q.dependenciesOnly || q.pendingMemberRequest != nil || value.native == nil || !standardMemberEffect(value.native.kind) ||
		value.native.referencesIncomplete || len(value.path) != 0 || !ast.IsCallExpression(call) ||
		!ast.IsPropertyAccessExpression(call.Expression()) {
		return false
	}
	if q.moduleWeakMapBinding(value.native.acquired, call.Expression()) == nil {
		return false
	}
	_, name := accessorReceiver(call.Expression())
	if (name != "get" || value.native.kind != sourceNativeWeakMapGetEffect) &&
		(name != "set" || value.native.kind != sourceNativeWeakMapSetEffect) {
		return false
	}
	return weakMapFixedArguments(call.AsCallExpression())
}

// weakMapFixedArguments leaves iteration and argument expansion on their existing path.
func weakMapFixedArguments(call *ast.CallExpression) bool {
	for _, argument := range restrictedInvocationArguments(call) {
		if ast.IsSpreadElement(argument) {
			return false
		}
	}
	return true
}

// ordinaryWeakMapLookup accounts for the standard prototype branch of the
// original member operation. The same lookup still visits own writers and descriptors.
func (q *sourceValueQuery) ordinaryWeakMapLookup(get *sourceGetInputs, seed sourceValue, mode accessorTraversal) bool {
	if !q.dependenciesOnly || seed.native == nil || !standardMemberEffect(seed.native.kind) ||
		seed.native.referencesIncomplete || !q.directWeakMapOperation(mode) {
		return false
	}
	symbol := q.moduleWeakMapBinding(get.receiver.node, q.protectedMember)
	return symbol != nil && (seed.native.kind != sourceNativeWeakMapSetEffect || q.moduleWeakMapUsesCovered(symbol))
}

// moduleWeakMapUsesCovered keeps target pruning tied to reads the compiler
// can associate with the writer. A receiver that can escape needs its broader
// source path so an unsupported reader cannot silently miss a pruned write.
func (q *sourceValueQuery) moduleWeakMapUsesCovered(symbol *ast.Symbol) bool {
	file := ast.GetSourceFileOfNode(symbol.ValueDeclaration)
	index := q.owner.index(file)
	if index.privateUses == nil || !index.privateUses.complete || index.normalDynamicScope ||
		len(index.privateUses.unresolved[symbol.Name]) != 0 || file.Symbol == nil {
		return false
	}
	for _, exported := range q.owner.checker.GetExportsOfModule(file.Symbol) {
		if q.owner.checker.SkipAlias(exported) == symbol {
			return false
		}
	}
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		access := use.node.Parent
		if access == nil || !ast.IsPropertyAccessExpression(access) || access.Expression() != use.node || access.Parent == nil {
			return false
		}
		_, name := accessorReceiver(access)
		operation := access.Parent
		if ast.IsCallExpression(operation) && operation.Expression() == access {
			if !weakMapFixedArguments(operation.AsCallExpression()) ||
				name != "get" && (name != "set" || operation.Parent == nil || !ast.IsExpressionStatement(operation.Parent)) {
				return false
			}
			continue
		}
		if name != "set" || !ast.IsBinaryExpression(operation) || operation.AsBinaryExpression().Left != access ||
			operation.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
			return false
		}
	}
	return true
}

// retainWeakMapModuleWrites carries a module entry's original effects to a
// component read. The exact key and stored value remain JavaScript operands.
func (q *sourceValueQuery) retainWeakMapModuleWrites(call *ast.Node, value sourceValue, result *accessorCandidates) {
	if value.native.kind != sourceNativeWeakMapGetEffect {
		return
	}
	// The ordinary invocation has already selected the stable receiver binding.
	site := value.native.acquired
	symbol := q.owner.checker.GetSymbolAtLocation(site.Parent.Name())
	index := q.owner.index(ast.GetSourceFileOfNode(site))
	if index.privateUses == nil {
		return
	}
	eagerRead := sourceStagedModuleOwner(call)
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		member := use.node.Parent
		if member == nil || !ast.IsPropertyAccessExpression(member) || member.Expression() != use.node || member.Name().Text() != "set" {
			continue
		}
		write := member.Parent
		if write == nil || !ast.IsCallExpression(write) || write.Expression() != member {
			continue
		}
		producer := sourceStagedModuleOwner(write)
		if producer == nil || producer == q.effectOwner || eagerRead != nil && ast.GetSourceFileOfNode(call) == ast.GetSourceFileOfNode(write) && write.End() > call.Pos() {
			continue
		}
		result.producers = append(result.producers, producer)
	}
}
