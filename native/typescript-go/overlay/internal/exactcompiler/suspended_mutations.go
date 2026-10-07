package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// mutationFrame owns suspension temporaries per invocation, never on a durable component instance.
type mutationFrame struct {
	declarations []*ast.Node
	work         *ast.Node
}

func (lowering *jsxLowering) mutationTemporary(source *ast.Node) *ast.Node {
	typeNode := lowering.mutationFacts.at(nodeSourceSpan(source)).pending
	if typeNode == nil {
		typeNode = lowering.taskDependencyType(source)
	}
	return lowering.mutationTypedTemporary(source, typeNode)
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
	declaration := lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList(frame.declarations), ast.NodeFlagsLet))
	body := work.Body()
	statements := []*ast.Node{declaration}
	if ast.IsBlock(body) {
		statements = append(statements, body.AsBlock().Statements.Nodes...)
	} else {
		statements = append(statements, lowering.factory.NewReturnStatement(body))
	}
	block := lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true)
	if ast.IsFunctionDeclaration(work) {
		function := work.AsFunctionDeclaration()
		return lowering.factory.UpdateFunctionDeclaration(function, function.Modifiers(), function.AsteriskToken, function.Name(), function.TypeParameters, function.Parameters, function.Type, function.FullSignature, block)
	}
	return lowering.updateTaskWorkBody(work, block)
}

// lowerSuspendedStateWrite leaves suspension in its authored callable. Only the final commit
// enters a synchronous task fence, preserving reference selection, short-circuiting and results.
func (lowering *jsxLowering) lowerSuspendedStateWrite(node *ast.Node, write StateWrite, signal *ast.Node, staged bool, taskVisitor *ast.NodeVisitor) *ast.Node {
	if len(lowering.mutationFrames) == 0 {
		return nil
	}
	visit := lowering.visitor.VisitNode
	if taskVisitor != nil {
		visit = func(node *ast.Node) *ast.Node { return lowering.visitor.VisitNode(taskVisitor.VisitNode(node)) }
	}
	plan := planMutationOperation(node)
	target := plan.target
	if plan.kind == mutationRead {
		return nil
	}
	receiver, key, computed := plan.reference()
	if receiver == nil {
		return nil
	}
	if !computed {
		key = lowering.factory.NewStringLiteral(key.Text(), ast.TokenFlagsNone)
	}
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
		if len(lowering.pendingStates) > 0 && lowering.pendingStates[len(lowering.pendingStates)-1] != nil {
			context := lowering.pendingStates[len(lowering.pendingStates)-1]
			computed = lowering.factory.NewCallExpression(lowering.factory.NewPropertyAccessExpression(context, nil, lowering.factory.NewIdentifier("key"), ast.NodeFlagsNone), nil, nil, lowering.factory.NewNodeList([]*ast.Node{computed}), ast.NodeFlagsNone)
			frame := lowering.mutationFrames[len(lowering.mutationFrames)-1]
			frame.declarations[len(frame.declarations)-1] = lowering.factory.NewVariableDeclaration(keyValue, nil, lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier("PropertyKey"), nil), nil)
		}
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
		if lowering.target == TargetServer {
			return lowering.binary(reference, ast.KindEqualsToken, value)
		}
		result := lowering.call(lowering.names.write, []*ast.Node{parent, lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{key}), false), lowering.arrow(value)})
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
		result = commit(lowering.reflectCall("apply", []*ast.Node{method, parent, args}))
	} else if ast.IsDeleteExpression(node) {
		result = commit(lowering.factory.NewDeleteExpression(reference))
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
			if staged {
				result = lowering.binary(result, ast.KindCommaToken, value)
			}
			if logical {
				result = lowering.binary(previous, operator, lowering.factory.NewParenthesizedExpression(result))
			}
		} else {
			steps = append(steps, lowering.binary(value, ast.KindEqualsToken, rhs))
			if local != nil {
				steps = append(steps, lowering.rememberBlockingLocal(local, value))
			}
			result = commit(writeValue(value))
			if staged {
				result = lowering.binary(result, ast.KindCommaToken, value)
			}
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
