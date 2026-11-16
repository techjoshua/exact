package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedMapSourceUsesCovered describes complete private source-use coverage for
// one original selected map group. It does not activate a writer, close its RHS
// children or authenticate the live enum observation. The original owner must
// issue that separate issuer/Get/group/cut/generation-correlated disposition.
func (work *callableEffectWork) stagedMapSourceUsesCovered(source *sourceStagedNativeGetSource, group *ast.Node, owner *executableBodyOwner) bool {
	if source == nil || source.descriptorMap == nil || group == nil || !ast.IsObjectLiteralExpression(group) || owner == nil || owner.values == nil || owner.checker == nil || owner.values.program == nil || !validNativeDescriptorMapRecipe(sourceStagedOperationRecipe{key: source.descriptorMap.protocol.producer, nativeGet: source}) {
		return false
	}
	file := ast.GetSourceFileOfNode(group)
	if file == nil || file.IsDeclarationFile || !ast.IsExternalModule(file) || file != ast.GetSourceFileOfNode(source.request.producer.operation) || owner.values.program.GetSourceFile(file.FileName()) != file {
		return false
	}
	index := owner.values.index(file)
	pop := index.privateUses
	if index.incomplete || index.normalDynamicScope || pop == nil || !pop.complete || file.Symbol == nil || len(pop.unresolved[""]) != 0 {
		return false
	}
	aliases := make(map[ast.SymbolId]bool)
	// Follow original lexical assignment relationships, not property contents or
	// a reconstructed map table. The finite source-node set only breaks cycles.
	var reaches func(*ast.Node, map[*ast.Node]bool) bool
	reaches = func(node *ast.Node, seen map[*ast.Node]bool) bool {
		node = unwrapSourceCallableReference(node)
		if node == nil || seen[node] {
			return false
		}
		if node == group {
			return true
		}
		seen[node] = true
		if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
			return reaches(node.AsBinaryExpression().Right, seen)
		}
		if ast.IsConditionalExpression(node) {
			return reaches(node.AsConditionalExpression().WhenTrue, seen) || reaches(node.AsConditionalExpression().WhenFalse, seen)
		}
		if !ast.IsIdentifier(node) {
			return false
		}
		symbol := owner.checker.GetSymbolAtLocation(node)
		if symbol == nil || symbol.ValueDeclaration == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			return false
		}
		if reaches(symbol.ValueDeclaration.Initializer(), seen) {
			return true
		}
		for _, write := range index.bindings[ast.GetSymbolId(symbol)] {
			if reaches(write.right, seen) {
				return true
			}
		}
		return false
	}
	for id, uses := range pop.uses {
		if len(uses) != 0 && reaches(uses[0].node, make(map[*ast.Node]bool)) {
			aliases[id] = true
		}
	}
	for _, exported := range owner.checker.GetExportsOfModule(file.Symbol) {
		if owner.checker.GetTypeOnlyAliasDeclaration(exported) != nil {
			continue
		}
		if resolved := owner.checker.SkipAlias(exported); resolved != nil && aliases[ast.GetSymbolId(resolved)] {
			return false
		}
	}
	writers := stagedMapProtocolPhaseRequest(source, "own-writers")
	selectedInput := stagedMapInputUse(group, source)
	for id := range aliases {
		uses := pop.uses[id]
		if len(uses) != 0 && len(pop.unresolved[uses[0].node.Text()]) != 0 {
			return false
		}
		for _, use := range uses {
			node := unwrapSourceCallableReference(use.node)
			for node.Parent != nil && unwrapSourceCallableReference(node.Parent) == use.node {
				node = node.Parent
			}
			parent := node.Parent
			if parent == nil {
				return false
			}
			if stagedMapInputUse(node, source) {
				selectedInput = true
				continue
			}
			if ast.IsVariableDeclaration(parent) && parent.Initializer() == node {
				symbol := owner.checker.GetSymbolAtLocation(parent.Name())
				if symbol == nil || !aliases[ast.GetSymbolId(symbol)] {
					return false
				}
				continue
			}
			if ast.IsBinaryExpression(parent) && parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken && (parent.AsBinaryExpression().Left == node || parent.AsBinaryExpression().Right == node) {
				symbol := owner.checker.GetSymbolAtLocation(parent.AsBinaryExpression().Left)
				if symbol == nil || !aliases[ast.GetSymbolId(symbol)] {
					return false
				}
				continue
			}
			if ast.IsTypeOfExpression(parent) || ast.IsVoidExpression(parent) || ast.IsPrefixUnaryExpression(parent) && parent.AsPrefixUnaryExpression().Operator == ast.KindExclamationToken || ast.IsIfStatement(parent) && parent.AsIfStatement().Expression == node {
				continue
			}
			if work.stagedWriterUseCovered(writers, group, node, owner, make(map[ast.SymbolId]bool)) {
				continue
			}
			return false
		}
	}
	if !selectedInput {
		return false
	}
	if stagedMapInputUse(group, source) {
		return true
	}
	parent := group.Parent
	if parent == nil || !ast.IsVariableDeclaration(parent) || parent.Initializer() != group || len(aliases) == 0 {
		return false
	}
	for node := parent; node != nil && node != file.AsNode(); node = node.Parent {
		if ast.IsFunctionLike(node) {
			break
		} // Exporting the enclosing function does not export its private local.
		if ast.GetCombinedModifierFlags(node)&(ast.ModifierFlagsExport|ast.ModifierFlagsDefault) != 0 {
			return false
		}
	}
	return true
}

// Only the original selected argument association covers this read use.
// Conditional source alternatives retain that same original argument endpoint.
func stagedMapInputUse(node *ast.Node, source *sourceStagedNativeGetSource) bool {
	if node == nil || source == nil || source.descriptorMap == nil {
		return false
	}
	for node.Parent != nil {
		parent := node.Parent
		if unwrapSourceCallableReference(parent) == node {
			node = parent
			continue
		}
		if ast.IsConditionalExpression(parent) && (parent.AsConditionalExpression().WhenTrue == node || parent.AsConditionalExpression().WhenFalse == node) {
			node = parent
			continue
		}
		break
	}
	return node == source.descriptorMap.descriptors.expression && node.Parent == source.request.producer.operation
}
