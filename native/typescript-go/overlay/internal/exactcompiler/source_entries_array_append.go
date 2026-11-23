package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// visitEnumeratedAppendValue retains a possible appended member origin for
// value enumeration of a confined local array's selected element.
func (q *sourceValueQuery) visitEnumeratedAppendValue(origin *ast.Node, bindings sourceValueBindings, result *accessorCandidates, visit func(sourceValue)) {
	input := q.owner.standardEntriesArgument(q.reading)
	if input == nil {
		return
	}
	index := q.owner.index(ast.GetSourceFileOfNode(origin))
	plan := index.entriesAppendPlans[q.reading]
	if index.incomplete || plan.origin != origin || plan.declaration != q.initializing ||
		input != plan.operand {
		reader := q.entriesIndexRead(origin, input)
		if reader == nil {
			return
		}
		push := confinedEntriesAppend(origin, &index, q.owner.checker, func(use *ast.Node) bool {
			return q.charge(result, use)
		})
		if push == nil || q.active[push] {
			return
		}
		plan.push = push
		plan.entries, plan.step, plan.child = entriesAppendSuppliers(origin, reader, push, q.reading, &index, q.owner.checker)
	}
	push, entries, step, child := plan.push, plan.entries, plan.step, plan.child
	if q.active[push] {
		return
	}
	if len(entries) == 0 {
		return
	}
	q.withActiveInvocation(push, func() {
		var roots []sourceValue
		for _, entry := range entries {
			q.projectEntriesAppendOperand(entry, push, bindings, result, func(value sourceValue) {
				roots = append(roots, value)
			})
		}
		q.visitEntriesAppendSuccessors(step, push, child, roots, bindings, result, visit)
	})
}

func confinedEntriesAppend(origin *ast.Node, index *sourceValueIndex, c *checker.Checker, charge func(*ast.Node) bool) *ast.Node {
	d := origin.Parent
	if d == nil || !ast.IsVariableDeclaration(d) || d.Initializer() != origin || !ast.IsIdentifier(d.Name()) || d.Parent.Flags&ast.NodeFlagsConst == 0 {
		return nil
	}
	owner := enclosingCallableNode(d)
	symbol := c.GetSymbolAtLocation(d.Name())
	if owner == nil || symbol == nil || index.incomplete || index.normalDynamicScope || index.privateUses == nil ||
		!index.privateUses.complete || len(index.privateUses.unresolved[d.Name().Text()]) != 0 {
		return nil
	}
	var appendCall *ast.Node
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		member := use.node.Parent
		if member == nil || charge != nil && !charge(use.node) || !ast.IsAccessExpression(member) || member.Expression() != use.node ||
			!owner.Contains(member) {
			return nil
		}
		if ast.IsElementAccessExpression(member) || member.Name().Text() == "length" {
			read, write := accessorEvaluationMode(member)
			if !read || write || nativeAssignmentPatternTarget(member) || ast.IsCallExpression(member.Parent) && member.Parent.Expression() == member {
				return nil
			}
			continue
		}
		call := member.Parent
		if call == nil || appendCall != nil || member.Name().Text() != "push" || ast.IsOptionalChain(member) || !ast.IsCallExpression(call) ||
			call.Expression() != member || call.AsCallExpression().QuestionDotToken != nil || len(callArguments(call)) != 1 {
			return nil
		}
		appendCall = call
	}
	return appendCall
}

func (q *sourceValueQuery) projectEntriesAppendOperand(call, push *ast.Node, bindings sourceValueBindings, result *accessorCandidates, visit func(sourceValue)) {
	if q.active[call] {
		return
	}
	if possible, _ := q.reachable(call, bindings); !possible {
		return
	}
	writer := enclosingCallableNode(push)
	argument := restrictedInvocationArguments(push.AsCallExpression())[0]
	reading, initializing, member := q.reading, q.initializing, q.protectedMember
	q.initializing, q.protectedMember = call, nil
	defer func() { q.reading, q.initializing, q.protectedMember = reading, initializing, member }()
	part := q.consumeInvocation(call, bindings, sourceInvocationConsumer{
		body: func(declaration *ast.Node, captures sourceValueBindings, inputs *sourceValueInputs, _ *ast.Node, selected *accessorCandidates) {
			if declaration != writer {
				return
			}
			prior := q.inputs
			q.inputs = inputs
			defer func() { q.inputs = prior }()
			if possible, _ := q.reachable(push, captures); !possible {
				return
			}
			scope := q.acquireCallableScope(captures, selected)
			scope.creators[writer] = sourceValueCreation{invocation: call}
			for _, value := range q.originsAt(argument, push, captures, selected) {
				if value.capture == nil {
					value.capture = &scope
				}
				visit(value)
			}
		},
	})
	result.valueIncomplete = result.valueIncomplete || part.valueIncomplete || part.opaque
}

// entriesIndexRead preserves the original indexed acquisition for an entries
// operand, including a const that saves that exact element before enumeration.
func (q *sourceValueQuery) entriesIndexRead(array, input *ast.Node) *ast.Node {
	c := q.owner.checker
	expression := unwrapSourceCallableReference(input)
	if expression == nil || !ast.IsIdentifier(expression) || q.initializing == nil || !ast.IsVariableDeclaration(q.initializing) ||
		q.initializing.Parent.Flags&ast.NodeFlagsConst == 0 {
		return nil
	}
	binding := c.GetSymbolAtLocation(expression)
	if binding == nil || binding.ValueDeclaration != q.initializing {
		return nil
	}
	expression = unwrapSourceCallableReference(q.initializing.Initializer())
	if expression == nil || !ast.IsElementAccessExpression(expression) || !ast.IsIdentifier(expression.Expression()) {
		return nil
	}
	receiver := c.GetSymbolAtLocation(expression.Expression())
	index := c.GetTypeAtLocation(expression.AsElementAccessExpression().ArgumentExpression)
	if receiver == nil || receiver.ValueDeclaration != array.Parent || index == nil || index.Flags()&checker.TypeFlagsNumberLike == 0 {
		return nil
	}
	return expression
}

// sourceEntriesAppendPlan contains only generation-owned lexical links.
type sourceEntriesAppendPlan struct {
	origin, declaration, operand, push, step *ast.Node
	entries                                  []*ast.Node
	child                                    *ast.Symbol
}

func entriesAppendLoopCandidate(call *ast.Node) bool {
	parent, method := call.Parent, call.Expression()
	if parent == nil || !ast.IsForOfStatement(parent) || parent.AsForInOrOfStatement().Expression != call ||
		!ast.IsPropertyAccessExpression(method) || method.Name().Text() != "entries" ||
		!ast.IsIdentifier(method.Expression()) || method.Expression().Text() != "Object" {
		return false
	}
	outer := parent.Parent
	if outer == nil || !ast.IsBlock(outer) || outer.Parent == nil || !ast.IsForStatement(outer.Parent) ||
		outer.Parent.AsForStatement().Statement != outer {
		return false
	}
	statements := outer.AsBlock().Statements.Nodes
	return len(statements) != 0 && statements[len(statements)-1] == parent
}

// indexEntriesAppendPlan closes forward references against the completed
// private-use inventory. The original reader still authenticates Entries.
func (owner *sourceValueOwner) indexEntriesAppendPlan(index *sourceValueIndex, read *ast.Node) {
	if index.objectEntriesWritten || index.normalDynamicScope {
		return
	}
	args := callArguments(read)
	if len(args) != 1 || !ast.IsIdentifier(args[0]) {
		return
	}
	c := owner.checker
	binding := c.GetSymbolAtLocation(args[0])
	if binding == nil || binding.ValueDeclaration == nil || !ast.IsVariableDeclaration(binding.ValueDeclaration) {
		return
	}
	declaration := binding.ValueDeclaration
	if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
		return
	}
	reader := unwrapSourceCallableReference(declaration.Initializer())
	if reader == nil || !ast.IsElementAccessExpression(reader) || !ast.IsIdentifier(reader.Expression()) {
		return
	}
	receiver := c.GetSymbolAtLocation(reader.Expression())
	indexType := c.GetTypeAtLocation(reader.AsElementAccessExpression().ArgumentExpression)
	if receiver == nil || receiver.ValueDeclaration == nil || !ast.IsVariableDeclaration(receiver.ValueDeclaration) ||
		indexType == nil || indexType.Flags()&checker.TypeFlagsNumberLike == 0 {
		return
	}
	origin := receiver.ValueDeclaration.Initializer()
	if origin == nil || !ast.IsArrayLiteralExpression(origin) || ast.GetSourceFileOfNode(origin) != ast.GetSourceFileOfNode(read) {
		return
	}
	plan := sourceEntriesAppendPlan{origin: origin, declaration: declaration, operand: args[0]}
	plan.push = confinedEntriesAppend(origin, index, c, nil)
	if plan.push != nil {
		plan.entries, plan.step, plan.child = entriesAppendSuppliers(origin, reader, plan.push, read, index, c)
	}
	// This exact reader can reuse declined and seed-only outcomes as well.
	// Neither outcome closes another binding or source acquisition.
	if index.entriesAppendPlans == nil {
		index.entriesAppendPlans = make(map[*ast.Node]sourceEntriesAppendPlan)
	}
	index.entriesAppendPlans[read] = plan
}

// entriesAppendSuppliers keeps only the actual lexical invocations of the
// confined writer. A later use must take its operand from this exact loop's
// yielded value and be able to reach a subsequent indexed read.
func entriesAppendSuppliers(origin, reader, push, read *ast.Node, index *sourceValueIndex, c *checker.Checker) (entries []*ast.Node, step *ast.Node, value *ast.Symbol) {
	if read.Parent == nil || !ast.IsForOfStatement(read.Parent) || read.Parent.AsForInOrOfStatement().Expression != read {
		return nil, nil, nil
	}
	loop := read.Parent
	binding := entriesIterationBinding(loop.Initializer())
	if binding == nil {
		return nil, nil, nil
	}
	writer := enclosingCallableNode(push)
	owner := enclosingCallableNode(read)
	if writer == nil || !ast.IsArrowFunction(writer) || ast.HasSyntacticModifier(writer, ast.ModifierFlagsAsync) ||
		writer.Parent == nil || !ast.IsVariableDeclaration(writer.Parent) || writer.Parent.Initializer() != writer ||
		!ast.IsIdentifier(writer.Parent.Name()) || writer.Parent.Parent.Flags&ast.NodeFlagsConst == 0 ||
		enclosingCallableNode(writer) != owner || len(writer.Parameters()) != 1 {
		return nil, nil, nil
	}
	formal := writer.Parameters()[0]
	operand := restrictedInvocationArguments(push.AsCallExpression())[0]
	if formal.Name() == nil || !ast.IsIdentifier(formal.Name()) || formal.Initializer() != nil ||
		formal.AsParameterDeclaration().DotDotDotToken != nil || !ast.IsIdentifier(operand) {
		return nil, nil, nil
	}
	if binding := c.GetSymbolAtLocation(operand); binding == nil || binding.ValueDeclaration != formal {
		return nil, nil, nil
	}
	method := c.GetSymbolAtLocation(push.Expression().Name())
	if method == nil || standardArrayMemberValue(origin, method.ValueDeclaration, push.Expression()).native == nil {
		return nil, nil, nil
	}
	symbol := c.GetSymbolAtLocation(writer.Parent.Name())
	child := c.GetSymbolAtLocation(binding.Name())
	if symbol == nil || child == nil || index.incomplete || index.normalDynamicScope || index.privateUses == nil ||
		!index.privateUses.complete || len(index.privateUses.unresolved[writer.Parent.Name().Text()]) != 0 {
		return nil, nil, nil
	}
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		call := use.node.Parent
		if call == nil || !ast.IsCallExpression(call) || call.Expression() != use.node ||
			call.AsCallExpression().QuestionDotToken != nil || enclosingCallableNode(call) != owner {
			return nil, nil, nil
		}
		if call.End() <= reader.Pos() {
			entries = append(entries, call)
			continue
		}
		if !loop.AsForInOrOfStatement().Statement.Contains(call) {
			continue
		}
		args := restrictedInvocationArguments(call.AsCallExpression())
		if step != nil || len(args) != 1 || !ast.IsIdentifier(args[0]) || c.GetSymbolAtLocation(args[0]) != child {
			return entries, nil, nil
		}
		step = call
	}
	outer := loop.Parent
	if step == nil || outer == nil || !ast.IsBlock(outer) || outer.Parent == nil || !ast.IsForStatement(outer.Parent) ||
		outer.Parent.AsForStatement().Statement != outer {
		return entries, nil, nil
	}
	statements := outer.AsBlock().Statements.Nodes
	if len(statements) == 0 || statements[len(statements)-1] != loop || !entriesAppendIndexLoop(outer.Parent, reader, index.privateUses, c) {
		return entries, nil, nil
	}
	return entries, step, child
}

// A retained element is an input to a later original read only when the
// enclosing counted loop can continue through appended elements. Refuse
// other index writers and loops with a fixed or unrelated bound.
func entriesAppendIndexLoop(loop, reader *ast.Node, uses *sourcePrivateUses, c *checker.Checker) bool {
	selection := reader.AsElementAccessExpression()
	if !ast.IsIdentifier(selection.ArgumentExpression) {
		return false
	}
	target := c.GetSymbolAtLocation(selection.Expression)
	index := c.GetSymbolAtLocation(selection.ArgumentExpression)
	if target == nil || index == nil {
		return false
	}
	forLoop := loop.AsForStatement()
	if forLoop.Initializer == nil || !ast.IsVariableDeclarationList(forLoop.Initializer) || forLoop.Initializer.Flags&ast.NodeFlagsLet == 0 ||
		forLoop.Condition == nil || !ast.IsBinaryExpression(forLoop.Condition) ||
		forLoop.Incrementor == nil || !ast.IsPostfixUnaryExpression(forLoop.Incrementor) {
		return false
	}
	initializers := forLoop.Initializer.AsVariableDeclarationList().Declarations.Nodes
	if len(initializers) != 1 || initializers[0] != index.ValueDeclaration || initializers[0].Initializer() == nil ||
		!ast.IsNumericLiteral(initializers[0].Initializer()) || initializers[0].Initializer().Text() != "0" {
		return false
	}
	increment := forLoop.Incrementor.AsPostfixUnaryExpression()
	condition := forLoop.Condition.AsBinaryExpression()
	if increment.Operator != ast.KindPlusPlusToken || !ast.IsIdentifier(increment.Operand) || c.GetSymbolAtLocation(increment.Operand) != index ||
		condition.OperatorToken.Kind != ast.KindLessThanToken || !ast.IsIdentifier(condition.Left) || c.GetSymbolAtLocation(condition.Left) != index ||
		!ast.IsPropertyAccessExpression(condition.Right) {
		return false
	}
	length := condition.Right.AsPropertyAccessExpression()
	if length.Name().Text() != "length" || !ast.IsIdentifier(length.Expression) || c.GetSymbolAtLocation(length.Expression) != target {
		return false
	}
	if uses == nil || !uses.complete {
		return false
	}
	for _, use := range uses.uses[ast.GetSymbolId(index)] {
		if use.node != selection.ArgumentExpression && use.node != increment.Operand && use.node != condition.Left {
			return false
		}
	}
	return true
}

func (q *sourceValueQuery) visitEntriesAppendSuccessors(step, push *ast.Node, child *ast.Symbol, roots []sourceValue, bindings sourceValueBindings, result *accessorCandidates, visit func(sourceValue)) {
	if step == nil {
		for _, value := range roots {
			visit(value)
		}
		return
	}
	read := q.reading
	q.walkLoopReceiverOrigins(roots, result, visit, func(value sourceValue, next func(sourceValue)) {
		if len(value.path) != 0 || !entriesAppendOrdinary(value.node) {
			return
		}
		reading, initializing, member := q.reading, q.initializing, q.protectedMember
		q.reading, q.initializing, q.protectedMember = read, read, nil
		values := q.accessorsAtGetOutput(nil, nil, "", accessorEnumerateValues, bindings, nil, nil, nil, nil, value)
		q.reading, q.initializing, q.protectedMember = reading, initializing, member
		for _, childValue := range values.values {
			if childValue.node == nil || len(childValue.path) != 0 || !entriesAppendOrdinary(childValue.node) {
				continue
			}
			scope := make(sourceValueBindings, len(bindings)+1)
			for id, alternatives := range bindings {
				scope[id] = alternatives
			}
			scope[ast.GetSymbolId(child)] = []sourceValue{childValue}
			if possible, _ := q.reachable(step, scope); !possible {
				continue
			}
			if q.completion(read.Parent.AsForInOrOfStatement().Statement, scope).kind != sourceCompletionNormal {
				continue
			}
			q.projectEntriesAppendOperand(step, push, scope, result, next)
		}
	})
}

func entriesAppendOrdinary(value *ast.Node) bool {
	if ast.IsArrayLiteralExpression(value) {
		return true
	}
	if !ast.IsObjectLiteralExpression(value) {
		return false
	}
	for _, property := range value.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsPropertyAssignment(property) && property.Name() != nil && !ast.IsComputedPropertyName(property.Name()) && callableNameText(property.Name()) == "__proto__" &&
			unwrapSourceCallableReference(property.Initializer()).Kind != ast.KindNullKeyword {
			return false
		}
	}
	return true
}
