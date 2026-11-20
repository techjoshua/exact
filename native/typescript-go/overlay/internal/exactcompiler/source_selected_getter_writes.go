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
	if get.operation == nil || !q.selectedGetterWriteOperation(get.operation) || !ast.IsFunctionExpression(inputs.declaration) ||
		get.receiver.node == nil || !ast.IsObjectLiteralExpression(get.receiver.node) || len(get.receiver.path) != 0 ||
		enclosingCallableNode(get.receiver.node) != enclosingCallableNode(q.dependencyUse) || !q.descriptorWriterCall(node.AsCallExpression()) {
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
	if q.selectedGetterWrites == nil || get == nil || cut == nil || cut.operation != get.operation || !q.selectedGetterWriteOperation(get.operation) || get.receiver.node != origin {
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
	if q.selectedGetterWrites == nil || get == nil || get.operation == nil || !q.selectedGetterWriteOperation(get.operation) ||
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
	if get.operation != q.dependencyUse {
		receiver = q.firstForwardedGetterActual(receiver, get.operation)
		if receiver == nil {
			return false
		}
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

func (q *sourceValueQuery) selectedGetterWriteOperation(op *ast.Node) bool {
	return op == q.dependencyUse || q.forwardedGetterWriteRead(op)
}

// A direct lexical Call already owns instantiated Effects through its normal
// source publisher. Borrow only its real binder for intra-body MAY writes.
func (q *sourceValueQuery) lexicalGetterWriteBody() bool {
	i := q.installedMemberInput
	if !q.installedMemberInputOwned(i) || q.installedCallBody != nil || i.inputs.invocation != q.dependencyUse ||
		!ast.IsFunctionDeclaration(i.inputs.declaration) || !ast.IsIdentifier(i.inputs.invocation.Expression()) {
		return false
	}
	symbol := q.owner.checker.GetSymbolAtLocation(i.inputs.invocation.Expression())
	return symbol != nil && symbol.ValueDeclaration == i.inputs.declaration
}

func (q *sourceValueQuery) forwardedGetterWriteRead(op *ast.Node) bool {
	i := q.installedMemberInput
	return op != nil && q.selectedGetterWrites != nil && i != nil && i.live && i.issuer == q &&
		i.generation == q.owner.generation && i.inputs.invocation == q.dependencyUse &&
		op == q.protectedMember && enclosingCallableNode(op) == i.inputs.declaration
}

// Before the first body operation, a simple formal with a direct actual may
// use the caller's fresh own slot. Default or prior body work could remove it,
// including by reading through the implicit arguments object.
func (q *sourceValueQuery) firstForwardedGetterActual(formal, get *ast.Node) *ast.Node {
	if !q.lexicalGetterWriteBody() {
		return nil
	}
	input := q.installedMemberInput
	body := input.inputs.declaration
	symbol := q.owner.checker.GetSymbolAtLocation(formal)
	if symbol == nil {
		return nil
	}
	statement := get.Parent
	if ast.IsVoidExpression(statement) {
		statement = statement.Parent
	}
	if !ast.IsExpressionStatement(statement) && !ast.IsReturnStatement(statement) {
		return nil
	}
	statements := body.Body().AsBlock().Statements.Nodes
	if len(statements) == 0 || statements[0] != statement {
		return nil
	}
	ordinal := -1
	for n, param := range body.Parameters() {
		if !ast.IsIdentifier(param.Name()) || param.Initializer() != nil || param.AsParameterDeclaration().DotDotDotToken != nil || param.Name().Text() == "this" {
			return nil
		}
		if param == symbol.ValueDeclaration {
			ordinal = n
		}
	}
	actuals := input.binding.request.actuals
	if ordinal < 0 || ordinal >= len(actuals) || actuals[ordinal].ordinal != ordinal ||
		actuals[ordinal].spread || !ast.IsIdentifier(actuals[ordinal].expression) {
		return nil
	}
	return actuals[ordinal].expression
}
