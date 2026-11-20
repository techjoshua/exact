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
	if loop.Statement != body || len(args) != 1 || !ast.IsIdentifier(args[0]) || loop.Initializer == nil || !ast.IsVariableDeclarationList(loop.Initializer) || loop.Incrementor == nil || !ast.IsBinaryExpression(loop.Incrementor) {
		return nil, nil
	}
	current := q.owner.checker.GetSymbolAtLocation(args[0])
	decls := loop.Initializer.AsVariableDeclarationList().Declarations.Nodes
	if current == nil || len(decls) != 1 || current.ValueDeclaration != decls[0] || decls[0].Initializer() == nil {
		return nil, nil
	}
	step := loop.Incrementor.AsBinaryExpression()
	get = unwrapSourceCallableReference(step.Right)
	if step.OperatorToken.Kind != ast.KindEqualsToken || !ast.IsIdentifier(step.Left) || q.owner.checker.GetSymbolAtLocation(step.Left) != current || !ast.IsPropertyAccessExpression(get) || !ast.IsIdentifier(get.Expression()) || q.owner.checker.GetSymbolAtLocation(get.Expression()) != current {
		return nil, nil
	}
	writes := index.bindings[ast.GetSymbolId(current)]
	if len(writes) != 1 || writes[0].left != step.Left {
		return nil, nil
	}
	// A source read inside or before capture can still use ordinary analysis.
	if at := q.readPosition(); at != nil && enclosingCallableNode(at) == enclosingCallableNode(d) && at.Pos() < body.Parent.End() {
		return nil, nil
	}
	return decls[0].Initializer(), get
}

// visitLocalArrayRecurrence forwards known source alternatives beside an
// unresolved tail. Each member edge uses the existing Get visitor. Following a
// repeated source origin widens the tail instead of unrolling runtime iterations.
func (q *sourceValueQuery) visitLocalArrayRecurrence(origin *ast.Node, rest []string, bindings sourceValueBindings, result *accessorCandidates, visit func(sourceValue)) {
	entry, get := q.localArrayRecurrence(origin, result)
	if entry == nil {
		return
	}
	result.opaque, result.valueIncomplete = true, true
	if q.active[origin] {
		return
	}
	q.active[origin] = true
	defer delete(q.active, origin)

	acquire := func(receiver *ast.Node, path []string, at *ast.Node, alternatives ...sourceValue) accessorCandidates {
		previousRead, previousInit, previousMember := q.reading, q.initializing, q.protectedMember
		q.reading, q.initializing, q.protectedMember = at, at, nil
		defer func() {
			q.reading, q.initializing, q.protectedMember = previousRead, previousInit, previousMember
		}()
		values := q.accessorsAtGetOutput(receiver, path, "", accessorAcquire, bindings, nil, nil, nil, nil, alternatives...)
		mergeAccessorCandidates(result, values)
		return values
	}
	active := make(map[*ast.Node]bool)
	var follow func(sourceValue, int)
	follow = func(value sourceValue, depth int) {
		if value.node == nil || !q.charge(result, value.node) {
			return
		}
		for _, projected := range q.boundProjection([]sourceValue{value}, rest, result) {
			visit(projected)
		}
		if active[value.node] || depth == 128 {
			return
		}
		active[value.node] = true
		defer delete(active, value.node)
		next := acquire(nil, []string{get.Name().Text()}, get, value)
		for _, alternative := range next.values {
			follow(alternative, depth+1)
		}
	}
	for _, value := range acquire(entry, nil, entry).values {
		follow(value, 0)
	}
}
