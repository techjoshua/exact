package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// localArrayRecurrence identifies the entry value and the original member
// producer of a loop-carried append. It proves neither that the loop executes
// nor that any runtime element has a particular position or descriptor.
func (q *sourceValueQuery) localArrayRecurrence(origin *ast.Node, result *accessorCandidates) (entry, get *ast.Node) {
	d := origin.Parent
	if d == nil || !ast.IsVariableDeclaration(d) || d.Initializer() != origin || !ast.IsIdentifier(d.Name()) || d.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(d) == nil {
		return nil, nil
	}
	block := d.Parent.Parent.Parent
	if !ast.IsBlock(block) {
		return nil, nil
	}
	symbol := q.owner.checker.GetSymbolAtLocation(d.Name())
	index := q.owner.index(ast.GetSourceFileOfNode(origin))
	if symbol == nil || index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete || len(index.privateUses.unresolved[d.Name().Text()]) != 0 {
		return nil, nil
	}
	var push *ast.Node
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		if !q.charge(result, use.node) || enclosingCallableNode(use.node) != enclosingCallableNode(d) {
			return nil, nil
		}
		member := use.node.Parent
		if ast.IsReturnStatement(member) {
			// A returned alias can carry these MAY origins to another reader.
			// Its ordinary write and interference analysis still applies.
			continue
		}
		if !ast.IsPropertyAccessExpression(member) && !ast.IsElementAccessExpression(member) || member.Expression() != use.node {
			return nil, nil
		}
		read, write := accessorEvaluationMode(member)
		if !read || write || nativeAssignmentPatternTarget(member) {
			return nil, nil
		}
		if ast.IsElementAccessExpression(member) || member.Name().Text() == "length" {
			parent := member.Parent
			if ast.IsCallExpression(parent) && parent.Expression() == member || ast.IsTaggedTemplateExpression(parent) && parent.AsTaggedTemplateExpression().Tag == member {
				return nil, nil
			}
			continue
		}
		candidate := member.Parent
		if push != nil || member.Name().Text() != "push" || !ast.IsCallExpression(candidate) || candidate.Expression() != member || candidate.AsCallExpression().QuestionDotToken != nil || member.AsPropertyAccessExpression().QuestionDotToken != nil || !ast.IsExpressionStatement(candidate.Parent) {
			return nil, nil
		}
		method := q.owner.checker.GetSymbolAtLocation(member.Name())
		if method == nil || standardArrayMemberValue(origin, method.ValueDeclaration, member).native == nil {
			return nil, nil
		}
		push = candidate
	}
	if push == nil {
		return nil, nil
	}
	body := push.Parent
	if ast.IsBlock(body.Parent) {
		body = body.Parent
	}
	if body.Parent == nil || !ast.IsForStatement(body.Parent) || body.Parent.Parent != block || body.Parent.Pos() < d.End() {
		return nil, nil
	}
	loop := body.Parent.AsForStatement()
	args := push.AsCallExpression().Arguments.Nodes
	if loop.Statement != body || len(args) != 1 || !ast.IsIdentifier(args[0]) || loop.Incrementor == nil || !ast.IsBinaryExpression(loop.Incrementor) {
		return nil, nil
	}
	get = unwrapSourceCallableReference(loop.Incrementor.AsBinaryExpression().Right)
	entry = q.loopMemberBackedge(get, result)
	if entry == nil || q.owner.checker.GetSymbolAtLocation(args[0]) != q.owner.checker.GetSymbolAtLocation(get.Expression()) {
		return nil, nil
	}
	// A source read inside or before capture can still use ordinary analysis.
	if at := q.readPosition(); at != nil && enclosingCallableNode(at) == enclosingCallableNode(d) && at.Pos() < body.Parent.End() {
		return nil, nil
	}
	return entry, get
}

// loopMemberBackedge recognizes a loop-local binding whose sole reassignment
// gets a member of its previous value. Entry acquisition belongs to the loop
// initializer. Subsequent alternatives belong to the original increment Get.
func (q *sourceValueQuery) loopMemberBackedge(get *ast.Node, result *accessorCandidates) *ast.Node {
	if get == nil || !ast.IsPropertyAccessExpression(get) || !ast.IsIdentifier(get.Expression()) {
		return nil
	}
	rhs := get
	for rhs.Parent != nil && unwrapSourceCallableReference(rhs.Parent) == get {
		rhs = rhs.Parent
	}
	stepNode := rhs.Parent
	if stepNode == nil || !ast.IsBinaryExpression(stepNode) || stepNode.AsBinaryExpression().Right != rhs ||
		stepNode.Parent == nil || !ast.IsForStatement(stepNode.Parent) {
		return nil
	}
	step, loop := stepNode.AsBinaryExpression(), stepNode.Parent.AsForStatement()
	if loop.Incrementor != stepNode || step.OperatorToken.Kind != ast.KindEqualsToken || !ast.IsIdentifier(step.Left) ||
		loop.Initializer == nil || !ast.IsVariableDeclarationList(loop.Initializer) {
		return nil
	}
	current := q.owner.checker.GetSymbolAtLocation(get.Expression())
	decls := loop.Initializer.AsVariableDeclarationList().Declarations.Nodes
	if current == nil || len(decls) != 1 || current.ValueDeclaration != decls[0] || !ast.IsIdentifier(decls[0].Name()) ||
		q.owner.checker.GetSymbolAtLocation(step.Left) != current {
		return nil
	}
	entry := decls[0].Initializer()
	if entry == nil {
		return nil
	}
	index := q.owner.index(ast.GetSourceFileOfNode(get))
	if index.incomplete || index.normalDynamicScope || !q.charge(result, get) {
		return nil
	}
	writes := index.bindings[ast.GetSymbolId(current)]
	if len(writes) != 1 || writes[0].left != step.Left {
		return nil
	}
	return entry
}

// visitLocalArrayRecurrence forwards MAY origins to the later indexed reader.
// Its own member lookup retains the later read's writer cut.
func (q *sourceValueQuery) visitLocalArrayRecurrence(origin *ast.Node, rest []string, bindings sourceValueBindings, result *accessorCandidates, visit func(sourceValue)) {
	entry, get := q.localArrayRecurrence(origin, result)
	if entry == nil {
		return
	}
	q.visitLoopMemberReceivers(entry, get, bindings, result, func(value sourceValue) {
		for _, projected := range q.boundProjection([]sourceValue{value}, rest, result) {
			visit(projected)
		}
	})
}

// visitLoopMemberReceivers follows source origins through successful Get
// outputs. Repetition on a branch leaves the runtime continuation unknown.
// The guard bounds exploration by source syntax and never identifies captures.
func (q *sourceValueQuery) visitLoopMemberReceivers(entry, get *ast.Node, bindings sourceValueBindings, result *accessorCandidates, visit func(sourceValue)) {
	result.opaque, result.valueIncomplete = true, true
	if q.active[get] {
		return
	}
	q.active[get] = true
	defer delete(q.active, get)

	acquire := func(at, receiver *ast.Node, path []string, reference *sourceGetReference, alternatives ...sourceValue) accessorCandidates {
		previousRead, previousInit, previousMember := q.reading, q.initializing, q.protectedMember
		q.reading, q.initializing, q.protectedMember = at, at, nil
		if reference != nil {
			q.protectedMember = get
		}
		defer func() {
			q.reading, q.initializing, q.protectedMember = previousRead, previousInit, previousMember
		}()
		values := q.accessorsAtGetOutput(receiver, path, "", accessorAcquire, bindings, nil, nil, nil, reference, alternatives...)
		mergeAccessorCandidates(result, values)
		return values
	}
	key := get.Name().Text()
	reference := sourceGetReferenceFor(get, get.Expression(), nil, key, accessorRead)
	q.walkLoopReceiverOrigins(acquire(entry, entry, nil, nil).values, result, visit, func(value sourceValue, next func(sourceValue)) {
		for _, alternative := range acquire(get, nil, []string{key}, reference, value).values {
			next(alternative)
		}
	})
}

// walkLoopReceiverOrigins follows possible source receivers through a selected
// loop's original update. Repeated syntax widens a branch without equating its
// captures or determining which runtime iterations execute.
func (q *sourceValueQuery) walkLoopReceiverOrigins(roots []sourceValue, result *accessorCandidates, visit func(sourceValue), successors func(sourceValue, func(sourceValue))) {
	active := make(map[*ast.Node]bool)
	var follow func(sourceValue)
	follow = func(value sourceValue) {
		if value.node == nil || !q.charge(result, value.node) {
			return
		}
		if visit != nil {
			visit(value)
		}
		if active[value.node] {
			return
		}
		active[value.node] = true
		defer delete(active, value.node)
		successors(value, follow)
	}
	for _, value := range roots {
		follow(value)
	}
}
