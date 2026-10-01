package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// lowerTaskHelperBody carries ownership through the helper's own suspension and nested callables.
func (lowering *jsxLowering) lowerTaskHelperBody(work, context *ast.Node) *ast.Node {
	return lowering.lowerTaskHelperNode(work, context, work.Body())
}

// lowerTaskHelperNode applies invocation ownership to bodies and parameter-time expressions.
func (lowering *jsxLowering) lowerTaskHelperNode(work, context, source *ast.Node) *ast.Node {
	frame := &mutationFrame{work: work}
	lowering.mutationFrames = append(lowering.mutationFrames, frame)
	lowering.pendingStates = append(lowering.pendingStates, context)
	lowering.helperVariantDepth++
	defer func() {
		lowering.mutationFrames = lowering.mutationFrames[:len(lowering.mutationFrames)-1]
		lowering.pendingStates = lowering.pendingStates[:len(lowering.pendingStates)-1]
		lowering.helperVariantDepth--
	}()
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if ast.IsBlock(node) {
			return lowering.lowerHelperRegistrationBlock(node, visitor.VisitEachChild)
		}
		if node != work {
			if nested := lowering.helperInitializers[nodeSpanKey(node)]; nested != nil {
				return lowering.lowerTaskHelperInitializer(nested)
			}
		}
		if ast.IsIdentifier(node) && node.Text() == "arguments" && !ast.IsArrowFunction(work) && !isNonReferenceComponentIdentifier(node) {
			owner := node.Parent
			for owner != nil && (!ast.IsFunctionLike(owner) || ast.IsArrowFunction(owner)) {
				owner = owner.Parent
			}
			symbol := lowering.checker.GetSymbolAtLocation(node)
			if owner == work && (symbol == nil || len(symbol.Declarations) == 0) {
				return lowering.helperContextCall(context, "arguments", []*ast.Node{node})
			}
		}
		if operation := lowering.helperPrivateOperation(node, context, visitor); operation != nil {
			return operation
		}
		if operation := lowering.helperSuperOperation(node, context, visitor); operation != nil {
			return operation
		}
		if ast.IsAwaitExpression(node) {
			value := visitor.VisitNode(node.AsAwaitExpression().Expression)
			return lowering.factory.NewAwaitExpression(lowering.helperContextCall(context, "await", []*ast.Node{value}))
		}
		if operation := lowering.pendingStateOperation(node, context, visitor); operation != nil {
			return operation
		}
		return visitor.VisitEachChild(node)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	body := visitor.VisitNode(source)
	body = lowering.lowerExecutableSubtree(body)
	statements := []*ast.Node{}
	if len(frame.declarations) != 0 {
		statements = append(statements, lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList(frame.declarations), ast.NodeFlagsLet)))
	}
	if source == work.Body() {
		// Native parameter binding consumes views. Restore extracted reference identity before the
		// authored body runs, while compiler operations continue to address the same pending cells.
		for _, parameter := range work.Parameters() {
			if !ast.IsBindingPattern(parameter.Name()) {
				continue
			}
			for _, binding := range bindingIdentifiers(parameter.Name()) {
				name := lowering.factory.NewIdentifier(binding.Text())
				statements = append(statements, lowering.factory.NewExpressionStatement(lowering.binary(name, ast.KindEqualsToken, lowering.helperContextCall(context, "value", []*ast.Node{name}))))
			}
		}
	}
	if len(statements) == 0 {
		return body
	}
	if ast.IsBlock(body) {
		statements = append(statements, body.AsBlock().Statements.Nodes...)
	} else {
		statements = append(statements, lowering.factory.NewReturnStatement(body))
	}
	block := lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true)
	if source == work.Body() {
		return block
	}
	// Parameter initializers execute before body locals exist. Their reference temporaries belong
	// to a separate lexical expression, preserving default selection and left-to-right binding.
	arrow := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList(nil), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), block)
	return lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(arrow), nil, nil, lowering.factory.NewNodeList(nil), ast.NodeFlagsNone)
}

func (lowering *jsxLowering) helperContextCall(context *ast.Node, method string, arguments []*ast.Node) *ast.Node {
	return lowering.factory.NewCallExpression(lowering.factory.NewPropertyAccessExpression(context, nil, lowering.factory.NewIdentifier(method), ast.NodeFlagsNone), nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
}

// helperPrivateOperation retains class brands, authored update conversion and expression results.
func (lowering *jsxLowering) helperPrivateOperation(node, context *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	plan := planMutationOperation(node)
	target := plan.target
	if !ast.IsPropertyAccessExpression(target) || target.AsPropertyAccessExpression().Name().Kind != ast.KindPrivateIdentifier {
		return nil
	}
	token := lowering.helperPrivateTokens[nodeSpanKey(target)]
	if token == nil {
		return nil
	}
	member := target.AsPropertyAccessExpression()
	receiver := visitor.VisitNode(member.Expression)
	owner := lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactPrivateOwner_%d", target.Pos())))
	ownerParameter := lowering.factory.NewParameterDeclaration(nil, nil, owner, nil, nil, nil)
	access := lowering.factory.NewPropertyAccessExpression(owner, nil, member.Name(), ast.NodeFlagsNone)
	read := func(receiver *ast.Node) *ast.Node {
		if symbol := lowering.privateAccessorCompanion(target, false); symbol != nil {
			result := lowering.privateAccessorInvocation(context, receiver, symbol, nil)
			if typeNode := lowering.mutationFacts.at(nodeSpanKey(target)).pending; typeNode != nil {
				result = lowering.factory.NewAsExpression(result, typeNode)
			}
			return result
		}
		callback := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList([]*ast.Node{ownerParameter}), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), access)
		return lowering.helperContextCall(context, "privateRead", []*ast.Node{receiver, token, callback})
	}
	write := func(receiver, value *ast.Node) *ast.Node {
		if symbol := lowering.privateAccessorCompanion(target, true); symbol != nil {
			return lowering.privateAccessorAssignment(context, receiver, symbol, value, target)
		}
		input := lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactPrivateValue_%d", target.Pos())))
		parameter := lowering.factory.NewParameterDeclaration(nil, nil, input, nil, nil, nil)
		callback := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList([]*ast.Node{ownerParameter, parameter}), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), lowering.binary(access, ast.KindEqualsToken, input))
		reader := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList([]*ast.Node{ownerParameter}), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), access)
		return lowering.helperContextCall(context, "privateWrite", []*ast.Node{receiver, token, value, callback, reader})
	}
	if plan.kind == mutationCall {
		return lowering.privateHelperCall(node, context, visitor, read)
	}
	if node == target {
		if pendingReadIsWriteTarget(node) || node.Parent != nil && ast.IsCallExpression(node.Parent) && node.Parent.AsCallExpression().Expression == node {
			return nil
		}
		return read(receiver)
	}
	if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		return write(receiver, visitor.VisitNode(plan.value))
	}
	parent := lowering.mutationTemporary(member.Expression)
	previous := lowering.mutationTemporary(target)
	steps := []*ast.Node{lowering.binary(parent, ast.KindEqualsToken, receiver), lowering.binary(previous, ast.KindEqualsToken, read(parent))}
	var result *ast.Node
	if ast.IsPrefixUnaryExpression(node) || ast.IsPostfixUnaryExpression(node) {
		value := lowering.mutationTemporary(target)
		var update *ast.Node
		if ast.IsPrefixUnaryExpression(node) {
			update = lowering.factory.NewPrefixUnaryExpression(node.AsPrefixUnaryExpression().Operator, previous)
		} else {
			update = lowering.factory.NewPostfixUnaryExpression(previous, node.AsPostfixUnaryExpression().Operator)
		}
		steps = append(steps, lowering.binary(value, ast.KindEqualsToken, update), write(parent, previous))
		result = value
	} else {
		operator, valid, logical := plan.compoundOperator()
		if !valid {
			return nil
		}
		value := visitor.VisitNode(plan.value)
		if logical {
			result = lowering.binary(previous, operator, write(parent, value))
		} else {
			result = write(parent, lowering.binary(previous, operator, value))
		}
	}
	steps = append(steps, result)
	result = steps[0]
	for _, step := range steps[1:] {
		result = lowering.binary(result, ast.KindCommaToken, step)
	}
	return lowering.factory.NewParenthesizedExpression(result)
}
