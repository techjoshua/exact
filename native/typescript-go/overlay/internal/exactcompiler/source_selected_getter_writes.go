package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceSelectedGetterWrites belongs to one callable Effects walk. Entries are
// MAY writers from an actual member Get's binder, with no normal input authority.
type sourceSelectedGetterWrites map[*ast.Node][]sourceSelectedGetterWrite

type sourceSelectedGetterWrite struct {
	get, receiver *ast.Node
	scope         acquiredCallableScope
}

func (q *sourceValueQuery) recordSelectedGetterWrite(node *ast.Node, inputs *sourceValueInputs, result *accessorCandidates) {
	if q.selectedGetterWrites == nil || !q.dependenciesOnly || inputs == nil || inputs.get == nil || !ast.IsCallExpression(node) {
		return
	}
	get := inputs.get
	if get.operation == nil || get.operation != q.dependencyUse || !ast.IsFunctionExpression(inputs.declaration) ||
		get.receiver.node == nil || !ast.IsObjectLiteralExpression(get.receiver.node) || len(get.receiver.path) != 0 ||
		enclosingCallableNode(get.receiver.node) != enclosingCallableNode(get.operation) || !q.descriptorWriterCall(node.AsCallExpression()) {
		return
	}
	if target := unwrapSourceCallableReference(node.AsCallExpression().Arguments.Nodes[0]); target == nil || target.Kind != ast.KindThisKeyword {
		return
	}
	table := q.selectedGetterWrites
	if *table == nil {
		*table = make(sourceSelectedGetterWrites)
	}
	for _, previous := range (*table)[node] {
		if previous.get == get.operation && previous.receiver == get.receiver.node && len(inputs.bindings) == 1 {
			return
		}
	}
	(*table)[node] = append((*table)[node], sourceSelectedGetterWrite{get.operation, get.receiver.node, q.acquireCallableScope(inputs.bindings, result)})
}

func (q *sourceValueQuery) selectedGetterWriterInputs(writer, origin *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut, rows []sourceMemberWriterInput) []sourceMemberWriterInput {
	if q.selectedGetterWrites == nil || get == nil || cut == nil || cut.operation != get.operation || get.operation != q.dependencyUse || get.receiver.node != origin {
		return rows
	}
	for _, write := range (*q.selectedGetterWrites)[writer] {
		if write.receiver == origin && enclosingCallableNode(write.get) == enclosingCallableNode(get.operation) && write.get.End() <= get.operation.Pos() {
			rows = append(rows, sourceMemberWriterInput{implicitGet: write.get, scope: write.scope, incomplete: true})
		}
	}
	return rows
}

// prototypeGetterShadowed proves a narrow own-property case at its first use.
// A prior reference could expose the receiver or run a getter that deletes the slot.
func (q *sourceValueQuery) prototypeGetterShadowed(target *ast.Node, get *sourceGetInputs, key string, result *accessorCandidates) bool {
	if q.selectedGetterWrites == nil || get == nil || get.operation == nil || get.operation != q.dependencyUse ||
		get.receiver.node == nil || !ast.IsObjectLiteralExpression(get.receiver.node) || len(get.receiver.path) != 0 {
		return false
	}
	target = unwrapSourceCallableReference(target)
	if target == nil || !ast.IsPropertyAccessExpression(target) || target.AsPropertyAccessExpression().Name().Text() != "prototype" {
		return false
	}
	base := target.Expression()
	if !ast.IsIdentifier(base) || base.Text() != "Object" || !standardLibraryCallRoot(target, q.owner.checker) {
		return false
	}
	receiver, name := accessorReceiver(get.operation)
	if name != key || receiver == nil || !ast.IsIdentifier(receiver) || !directSourceDataSlot(get.receiver.node, []string{key}, get.operation, q.owner.checker) {
		return false
	}
	symbol := q.owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) ||
		symbol.ValueDeclaration.Initializer() != get.receiver.node {
		return false
	}
	index := q.owner.index(ast.GetSourceFileOfNode(receiver))
	uses := index.privateUses
	if index.incomplete || index.normalDynamicScope || uses == nil || !uses.complete || len(uses.unresolved[receiver.Text()]) != 0 {
		return false
	}
	owner := enclosingCallableNode(receiver)
	if owner == nil || owner != enclosingCallableNode(symbol.ValueDeclaration) {
		return false
	}
	for _, use := range uses.uses[ast.GetSymbolId(symbol)] {
		if !q.charge(result, use.node) || use.region != owner || use.node.Pos() < receiver.Pos() {
			return false
		}
	}
	return true
}
