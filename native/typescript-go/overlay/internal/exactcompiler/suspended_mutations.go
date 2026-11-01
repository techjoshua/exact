package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// mutationFrame owns suspension temporaries per invocation, never on a durable component instance.
type mutationFrame struct {
	declarations          []*ast.Node
	work                  *ast.Node
	annotationDestination *taskAnnotationDestination
	lexicalTypes          []mutationFrameLexicalType
}

// withMutationFrame keeps reference temporaries local to each authored callable invocation.
func (lowering *jsxLowering) withMutationFrame(node *ast.Node, visit func(*ast.Node) *ast.Node) *ast.Node {
	frame := &mutationFrame{work: node}
	lowering.mutationFrames = append(lowering.mutationFrames, frame)
	defer func() { lowering.mutationFrames = lowering.mutationFrames[:len(lowering.mutationFrames)-1] }()
	return lowering.finishMutationFrame(visit(node), frame)
}

// visitMutationMember visits definition-time names in the enclosing environment.
// Only the body borrows the invocation frame. Defaults get expression-local storage.
func (lowering *jsxLowering) visitMutationMember(node *ast.Node, active *ast.NodeVisitor) *ast.Node {
	frame := &mutationFrame{work: node}
	visitor := ast.NewNodeVisitor(active.Visit, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{
		VisitFunctionBody: func(body *ast.BlockOrExpression, _ *ast.NodeVisitor) *ast.BlockOrExpression {
			lowering.mutationFrames = append(lowering.mutationFrames, frame)
			defer func() { lowering.mutationFrames = lowering.mutationFrames[:len(lowering.mutationFrames)-1] }()
			return active.VisitNode(body)
		},
	})
	return lowering.finishMutationFrame(visitor.VisitEachChild(node), frame)
}

// mutationFrameLexicalType defers lexical admission until final destination
// bindings are known. The provisional declaration retains the old strict type.
type mutationFrameLexicalType struct {
	index      int
	annotation *ast.Node
	fact       *mutationTemporaryLexicalFact
}

func (lowering *jsxLowering) mutationTemporary(source *ast.Node) *ast.Node {
	facts := lowering.mutationFacts.at(nodeSourceSpan(source))
	typeNode := facts.pending
	if typeNode == nil && facts.temporary != nil {
		typeNode = lowering.taskCaptureAnnotation(facts.temporary)
	}
	if typeNode == nil {
		typeNode = lowering.taskDependencyType(source)
	}
	result := lowering.mutationTypedTemporary(source, typeNode)
	if facts.pending == nil && facts.temporaryLexical != nil && !lowering.checking {
		frame := lowering.mutationFrames[len(lowering.mutationFrames)-1]
		frame.annotationDestination = lowering.taskAnnotationDestination
		frame.lexicalTypes = append(frame.lexicalTypes, mutationFrameLexicalType{index: len(frame.declarations) - 1, annotation: facts.temporary, fact: facts.temporaryLexical})
	}
	return result
}

// mutationTypedTemporary stores generated selections whose type differs from the selected value.
func (lowering *jsxLowering) mutationTypedTemporary(source, typeNode *ast.Node) *ast.Node {
	frame := lowering.mutationFrames[len(lowering.mutationFrames)-1]
	name := fmt.Sprintf("__exactMutation_%d_%d", max(source.Pos(), 0), len(frame.declarations))
	identifier := lowering.factory.NewIdentifier(lowering.uniqueMutationName(name))
	frame.declarations = append(frame.declarations, lowering.factory.NewVariableDeclaration(identifier, nil, typeNode, nil))
	return identifier
}

// uniqueMutationName keeps compiler captures distinct from every authored and generated binding.
func (lowering *jsxLowering) uniqueMutationName(name string) string {
	if lowering.mutationNames == nil {
		lowering.mutationNames = map[string]bool{}
		walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
			if ast.IsIdentifier(node) {
				lowering.mutationNames[node.Text()] = true
			}
			return true
		})
	}
	for lowering.mutationNames[name] {
		name += "_"
	}
	lowering.mutationNames[name] = true
	return name
}

func (lowering *jsxLowering) finishMutationFrame(work *ast.Node, frame *mutationFrame) *ast.Node {
	if len(frame.declarations) == 0 || work == nil || work.Body() == nil {
		return work
	}
	for _, lexical := range frame.lexicalTypes {
		if lowering.mutationLexicalTypeAvailable(lexical.fact, frame, work) {
			previous := frame.declarations[lexical.index].AsVariableDeclaration()
			frame.declarations[lexical.index] = lowering.factory.UpdateVariableDeclaration(previous, previous.Name(), previous.ExclamationToken, lexical.annotation, previous.Initializer)
		}
	}
	declaration := lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList(frame.declarations), ast.NodeFlagsLet))
	body := work.Body()
	statements := []*ast.Node{}
	if ast.IsBlock(body) {
		original := body.AsBlock().Statements.Nodes
		insertion := 0
		for insertion < len(original) && isDirectiveStatement(original[insertion]) {
			insertion++
		}
		statements = append(statements, original[:insertion]...)
		statements = append(statements, declaration)
		statements = append(statements, original[insertion:]...)
	} else {
		statements = append(statements, declaration)
		statements = append(statements, lowering.factory.NewReturnStatement(body))
	}
	block := lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true)
	// Preserve callable-specific fields, including methods and accessors.
	return ast.NewNodeVisitor(func(node *ast.Node) *ast.Node { return node }, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{
		VisitFunctionBody: func(_ *ast.BlockOrExpression, _ *ast.NodeVisitor) *ast.BlockOrExpression { return block },
	}).VisitEachChild(work)
}

// lowerSelectedTaskWrite routes scalar statements and consumed expressions through one
// reference owner. Compiler computations and assigned task definitions retain their own lowering.
func (lowering *jsxLowering) lowerSelectedTaskWrite(node *ast.Node, signal *ast.Node, staged bool, visitor *ast.NodeVisitor) *ast.Node {
	if signal == nil {
		return nil
	}
	expression := node
	statement := ast.IsExpressionStatement(node)
	if statement {
		expression = node.AsExpressionStatement().Expression
	}
	write, exists := lowering.writes[nodeSpanKey(expression)]
	if !exists || (write.Operation != "assignment" && write.Operation != "update" && write.Operation != "delete") {
		return nil
	}
	if ast.IsBinaryExpression(expression) && expression.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		if _, _, assigned := lowering.assignedTask(expression.AsBinaryExpression().Right); assigned {
			return nil
		}
	}
	result := lowering.lowerSelectedStateWrite(expression, write, signal, staged, visitor)
	if result != nil && statement {
		return lowering.factory.NewExpressionStatement(result)
	}
	return result
}

// lowerSelectedStateWrite selects the authored receiver and raw key in native order.
// Only the commit enters a synchronous task fence, leaving RHS evaluation and suspension
// in their authored callable and preserving logical skips and expression results.
func (lowering *jsxLowering) lowerSelectedStateWrite(node *ast.Node, write StateWrite, signal *ast.Node, staged bool, taskVisitor *ast.NodeVisitor) *ast.Node {
	// Native defaults retain assignable syntax. The caller still visits their children.
	if ast.IsBinaryExpression(node) && nativeAssignmentTargetRole(node) == nativeAssignmentPattern {
		return nil
	}
	// Decline unsupported references before a wrapper could turn nil into an arrow body.
	plan := planMutationOperation(node)
	target := plan.target
	if plan.kind == mutationRead {
		return nil
	}
	receiver, key, computed := plan.reference()
	if receiver == nil {
		return nil
	}

	// Defaults and fields need storage per evaluation, independent of enclosing invocations.
	// These synchronous expressions retain lexical this/super and their native order.
	if source := lowering.mutationSource(write.Start, write.Length); mutationNeedsExpressionScope(source) &&
		(len(lowering.mutationFrames) == 0 || lowering.mutationFrames[len(lowering.mutationFrames)-1].work != node) {
		work := lowering.withMutationFrame(node, func(_ *ast.Node) *ast.Node {
			return lowering.arrow(lowering.lowerSelectedStateWrite(node, write, signal, staged, taskVisitor))
		})
		return lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(work), nil, nil, lowering.factory.NewNodeList(nil), ast.NodeFlagsNone)
	}
	if len(lowering.mutationFrames) == 0 {
		return nil
	}
	visit := lowering.visitor.VisitNode
	if taskVisitor != nil {
		visit = func(node *ast.Node) *ast.Node { return lowering.visitor.VisitNode(taskVisitor.VisitNode(node)) }
	}
	key = lowering.mutationReferenceKey(key, computed)
	parent := lowering.mutationTemporary(receiver)
	receiverValue := visit(receiver)
	var ownedParent *ast.Node
	steps := []*ast.Node{}
	if staged && len(write.Path) > 1 && len(write.DynamicSegments) == 0 {
		if local := lowering.blockingLocalForPath(write.Path[:len(write.Path)-1]); local != nil {
			ownedParent = lowering.mutationTemporary(receiver)
			frame := lowering.mutationFrames[len(lowering.mutationFrames)-1]
			frame.declarations[len(frame.declarations)-1] = lowering.factory.NewVariableDeclaration(ownedParent, nil, lowering.factory.NewKeywordTypeNode(ast.KindBooleanKeyword), nil)
			steps = append(steps, lowering.binary(ownedParent, ast.KindEqualsToken, lowering.blockingLocalReady(local)))
			receiverValue = lowering.blockingLocalRead(local, receiverValue)
		}
	}
	steps = append(steps, lowering.binary(parent, ast.KindEqualsToken, receiverValue))
	if computed {
		keyValue := lowering.mutationTemporary(key)
		computed := visit(key)
		steps = append(steps, lowering.binary(keyValue, ast.KindEqualsToken, computed))
		key = keyValue
	}
	reference := lowering.factory.NewElementAccessExpression(parent, nil, key, ast.NodeFlagsNone)
	var local *blockingTaskLocal
	if staged && len(lowering.blockingLocals) > 0 {
		local = lowering.blockingLocals[len(lowering.blockingLocals)-1].writes[fmt.Sprintf("%d:%d", write.Start, write.Length)]
	}
	var pendingState *ast.Node
	if len(lowering.pendingStates) > 0 {
		pendingState = lowering.pendingStates[len(lowering.pendingStates)-1]
	}
	pendingOperation := func(method string, arguments []*ast.Node) *ast.Node {
		return lowering.factory.NewCallExpression(lowering.factory.NewPropertyAccessExpression(pendingState, nil, lowering.factory.NewIdentifier(method), ast.NodeFlagsNone), nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
	}
	pendingRead := func() *ast.Node {
		read := reference
		if pendingState != nil {
			read = pendingOperation("read", []*ast.Node{parent, key})
			if typeNode := lowering.mutationFacts.at(nodeSourceSpan(node)).destination; typeNode != nil {
				read = lowering.factory.NewAsExpression(read, typeNode)
			}
		}
		return read
	}
	commit := func(value *ast.Node) *ast.Node {
		value = lowering.fenceTaskMutation(value, signal)
		if staged && pendingState == nil {
			value = lowering.taskHelperCall("stageTaskMutation", lowering.names.stageTaskMutation, []*ast.Node{signal, lowering.capturedTaskMutation(node, value)})
		}
		return value
	}
	writeValue := func(value *ast.Node) *ast.Node {
		if pendingState != nil {
			return pendingOperation("write", []*ast.Node{parent, key, value})
		}
		result := lowering.selectedMutationWrite(node, parent, key, value)
		if ownedParent != nil {
			name, path := lowering.stateWriteReferenceForWrite(write, lowering.names.write, lowering.names.writeState)
			argument := lowering.arrow(value)
			if name == lowering.names.writeState {
				argument = value
			}
			owned := lowering.call(name, []*ast.Node{lowering.stateWriteRoot(write), path, argument})
			result = lowering.conditional(ownedParent, owned, result)
		}
		return result
	}
	var result *ast.Node
	if ast.IsCallExpression(node) {
		method := lowering.mutationTemporary(target)
		steps = append(steps, lowering.binary(method, ast.KindEqualsToken, reference))
		arguments := []*ast.Node{}
		if node.AsCallExpression().Arguments != nil {
			for _, argument := range node.AsCallExpression().Arguments.Nodes {
				value := lowering.mutationArgument(argument)
				if taskVisitor != nil {
					value = taskVisitor.VisitNode(value)
				}
				arguments = append(arguments, value)
			}
		}
		// Arguments evaluate outside the synchronous fence and only after method selection.
		args := lowering.mutationTemporary(node)
		frame := lowering.mutationFrames[len(lowering.mutationFrames)-1]
		frame.declarations[len(frame.declarations)-1] = lowering.factory.NewVariableDeclaration(args, nil, lowering.factory.NewArrayTypeNode(lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)), nil)
		steps = append(steps, lowering.binary(args, ast.KindEqualsToken, lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(arguments), false)))
		call := lowering.reflectCall("apply", []*ast.Node{method, parent, args})
		result = commit(call)
	} else if ast.IsDeleteExpression(node) {
		name, path := lowering.selectedStateWriteReference(node, key, lowering.names.delete, lowering.names.deleteState)
		result = commit(lowering.call(name, []*ast.Node{parent, path}))
	} else if ast.IsPrefixUnaryExpression(node) || ast.IsPostfixUnaryExpression(node) {
		previous := lowering.mutationTemporary(target)
		read := pendingRead()
		if current := lowering.blockingLocalForPath(write.Path); staged && current != nil {
			read = lowering.blockingLocalRead(current, read)
		}
		steps = append(steps, lowering.binary(previous, ast.KindEqualsToken, read))
		value := lowering.mutationTemporary(target)
		var update *ast.Node
		if ast.IsPrefixUnaryExpression(node) {
			update = lowering.factory.NewPrefixUnaryExpression(node.AsPrefixUnaryExpression().Operator, previous)
		} else {
			update = lowering.factory.NewPostfixUnaryExpression(previous, node.AsPostfixUnaryExpression().Operator)
		}
		steps = append(steps, lowering.binary(value, ast.KindEqualsToken, update))
		if local != nil {
			steps = append(steps, lowering.rememberBlockingLocal(local, previous))
		}
		steps = append(steps, commit(writeValue(previous)))
		result = value
	} else {
		value := lowering.mutationTemporary(node)
		rhs := lowering.contextualAssignmentValue(visit(plan.value), write)
		if plan.kind == mutationCompound {
			previous := lowering.mutationTemporary(target)
			read := pendingRead()
			if staged {
				if current := lowering.blockingLocalForPath(write.Path); current != nil {
					read = lowering.blockingLocalRead(current, read)
				}
			}
			steps = append(steps, lowering.binary(previous, ast.KindEqualsToken, read))
			operator, valid, logical := plan.compoundOperator()
			if !valid {
				return nil
			}
			if !logical {
				rhs = lowering.binary(previous, operator, rhs)
			}
			assignment := lowering.binary(value, ast.KindEqualsToken, rhs)
			if local != nil {
				assignment = lowering.binary(assignment, ast.KindCommaToken, lowering.rememberBlockingLocal(local, value))
			}
			writeCall := writeValue(value)
			result = lowering.binary(assignment, ast.KindCommaToken, commit(writeCall))
			// Native assignment yields its captured value after a successful commit,
			// independently of the runtime helper's erased result type.
			result = lowering.binary(result, ast.KindCommaToken, value)
			if logical {
				result = lowering.binary(previous, operator, lowering.factory.NewParenthesizedExpression(result))
			}
		} else {
			steps = append(steps, lowering.binary(value, ast.KindEqualsToken, rhs))
			if local != nil {
				steps = append(steps, lowering.rememberBlockingLocal(local, value))
			}
			result = commit(writeValue(value))
			result = lowering.binary(result, ast.KindCommaToken, value)
		}
	}
	steps = append(steps, result)
	result = steps[0]
	for _, step := range steps[1:] {
		result = lowering.binary(result, ast.KindCommaToken, step)
	}
	if staged && (ast.IsCallExpression(node) || ast.IsDeleteExpression(node)) {
		return lowering.factory.NewParenthesizedExpression(result)
	}
	return lowering.typedMutationResult(node, lowering.factory.NewParenthesizedExpression(result))
}

func (lowering *jsxLowering) reflectCall(method string, arguments []*ast.Node) *ast.Node {
	return lowering.factory.NewCallExpression(lowering.factory.NewPropertyAccessExpression(lowering.factory.NewIdentifier("Reflect"), nil, lowering.factory.NewIdentifier(method), ast.NodeFlagsNone), nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
}

// selectedStateWriteReference keeps indexed top-level commits without resolving a captured parent again.
func (lowering *jsxLowering) selectedStateWriteReference(node, key *ast.Node, pathHelper, indexedHelper string) (string, *ast.Node) {
	if lowering.target == TargetClient {
		if slot, exists := lowering.stateWriteSlots[nodeSpanKey(node)]; exists {
			return indexedHelper, lowering.factory.NewNumericLiteral(fmt.Sprint(slot), ast.TokenFlagsNone)
		}
	}
	return pathHelper, lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{key}), false)
}

// mutationReferenceKey preserves raw computed keys until the existing put hook converts them.
func (lowering *jsxLowering) mutationReferenceKey(key *ast.Node, computed bool) *ast.Node {
	if computed {
		return key
	}
	return lowering.factory.NewStringLiteral(key.Text(), ast.TokenFlagsNone)
}

// selectedMutationWrite shares immediate selected-reference commit construction. Callers own
// value evaluation and the task fence, while existing slot/path policy owns helper selection.
func (lowering *jsxLowering) selectedMutationWrite(source, parent, key, value *ast.Node) *ast.Node {
	name, path := lowering.selectedStateWriteReference(source, key, lowering.names.write, lowering.names.writeState)
	argument := lowering.arrow(value)
	if name == lowering.names.writeState {
		argument = value
	}
	return lowering.call(name, []*ast.Node{parent, path, argument})
}
