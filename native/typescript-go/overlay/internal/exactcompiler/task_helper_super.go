package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// helperSuperOperation retains lexical home objects through inherited getters, setters and methods.
// The registry supplies that home object independently of receiver subclasses or class-name writes.
func (lowering *jsxLowering) helperSuperOperation(node, context *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	plan := planMutationOperation(node)
	target := plan.target
	var key *ast.Node
	if ast.IsPropertyAccessExpression(target) && target.AsPropertyAccessExpression().Expression.Kind == ast.KindSuperKeyword {
		key = lowering.factory.NewStringLiteral(target.AsPropertyAccessExpression().Name().Text(), ast.TokenFlagsNone)
	} else if ast.IsElementAccessExpression(target) && target.AsElementAccessExpression().Expression.Kind == ast.KindSuperKeyword {
		key = lowering.helperContextCall(context, "key", []*ast.Node{visitor.VisitNode(target.AsElementAccessExpression().ArgumentExpression)})
	} else {
		return nil
	}
	receiver := lowering.factory.NewKeywordExpression(ast.KindThisKeyword)
	read := func(key *ast.Node) *ast.Node {
		value := lowering.helperContextCall(context, "superRead", []*ast.Node{receiver, key})
		if typeNode := lowering.mutationFacts.at(nodeSpanKey(target)).pending; typeNode != nil {
			return lowering.factory.NewAsExpression(value, typeNode)
		}
		return value
	}
	write := func(key, value *ast.Node) *ast.Node {
		return lowering.helperContextCall(context, "superWrite", []*ast.Node{receiver, key, value})
	}
	if ast.IsCallExpression(node) {
		selected := lowering.helperContextCall(context, "helper", []*ast.Node{read(key), receiver})
		arguments := []*ast.Node{}
		for _, argument := range callArguments(node) {
			arguments = append(arguments, visitor.VisitNode(argument))
		}
		value := lowering.factory.NewCallExpression(selected, nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
		if typeNode := lowering.mutationFacts.at(nodeSpanKey(node)).pending; typeNode != nil {
			return lowering.factory.NewAsExpression(value, typeNode)
		}
		return value
	}
	if node == target {
		if pendingReadIsWriteTarget(node) || node.Parent != nil && ast.IsCallExpression(node.Parent) && node.Parent.AsCallExpression().Expression == node {
			return nil
		}
		return read(key)
	}
	if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		return write(key, visitor.VisitNode(plan.value))
	}
	selectedKey := lowering.mutationTypedTemporary(target, lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier("PropertyKey"), nil))
	previous := lowering.mutationTemporary(target)
	steps := []*ast.Node{lowering.binary(selectedKey, ast.KindEqualsToken, key), lowering.binary(previous, ast.KindEqualsToken, read(selectedKey))}
	var result *ast.Node
	if ast.IsPrefixUnaryExpression(node) || ast.IsPostfixUnaryExpression(node) {
		value := lowering.mutationTemporary(target)
		var update *ast.Node
		if ast.IsPrefixUnaryExpression(node) {
			update = lowering.factory.NewPrefixUnaryExpression(node.AsPrefixUnaryExpression().Operator, previous)
		} else {
			update = lowering.factory.NewPostfixUnaryExpression(previous, node.AsPostfixUnaryExpression().Operator)
		}
		steps = append(steps, lowering.binary(value, ast.KindEqualsToken, update), write(selectedKey, previous))
		result = value
	} else {
		operator, valid, logical := plan.compoundOperator()
		if !valid {
			return nil
		}
		value := visitor.VisitNode(plan.value)
		if logical {
			result = lowering.binary(previous, operator, write(selectedKey, value))
		} else {
			result = write(selectedKey, lowering.binary(previous, operator, value))
		}
	}
	steps = append(steps, result)
	result = steps[0]
	for _, step := range steps[1:] {
		result = lowering.binary(result, ast.KindCommaToken, step)
	}
	return lowering.factory.NewParenthesizedExpression(result)
}
