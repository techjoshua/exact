package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// copiedFieldEffectOwned accounts only for a present own data field of the
// existing source rest copy. Indexed observation-only uses keep that copy from
// escaping or changing before the read. This supplies no normal object identity,
// descriptor, absent-property proof or returned value, and never repeats its Gets.
func (query *sourceValueQuery) copiedFieldEffectOwned(term sourceValue, path []string, result *accessorCandidates) bool {
	if !query.dependenciesOnly || len(path) != 1 || len(term.path) != 0 || len(term.copied[path[0]]) == 0 {
		return false
	}
	operation := query.protectedMember
	if operation == nil || !ast.IsPropertyAccessExpression(operation) && !ast.IsElementAccessExpression(operation) {
		return false
	}
	receiver, key := accessorReceiver(operation)
	if key != path[0] || !ast.IsIdentifier(receiver) || !sourcePatternParameter(receiver, query.owner.checker) {
		return false
	}
	symbol := query.owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsBindingElement(symbol.ValueDeclaration) || symbol.ValueDeclaration.AsBindingElement().DotDotDotToken == nil || query.owner.bindingWritten(symbol) {
		return false
	}
	declaration := enclosingCallableNode(symbol.ValueDeclaration)
	if declaration == nil || declaration != enclosingCallableNode(operation) {
		return false
	}
	index := query.owner.index(ast.GetSourceFileOfNode(operation))
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete || len(index.privateUses.unresolved[receiver.Text()]) != 0 {
		return false
	}
	seen := false
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		if !query.charge(result, use.node) || enclosingCallableNode(use.node) != declaration {
			return false
		}
		member := use.node.Parent
		if member == nil || !ast.IsPropertyAccessExpression(member) && !ast.IsElementAccessExpression(member) || member.Expression() != use.node {
			return false
		}
		read, write := accessorEvaluationMode(member)
		if !read || write {
			return false
		}
		outer := query.envelopeOuterExpression(member, result)
		if outer == nil || outer.Parent == nil || (ast.IsCallExpression(outer.Parent) || ast.IsNewExpression(outer.Parent) || ast.IsTaggedTemplateExpression(outer.Parent)) && outer.Parent.Expression() == outer {
			return false
		}
		seen = seen || member == operation
	}
	return seen
}
