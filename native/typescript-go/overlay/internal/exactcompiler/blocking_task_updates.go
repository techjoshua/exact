package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// lowerBlockingConsumedUpdate evaluates a consumed synchronous update against invocation-local
// values. Publication uses the ordinary state path so parent replacement and reconciliation agree.
func (lowering *jsxLowering) lowerBlockingConsumedUpdate(node *ast.Node, write StateWrite, signal *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	if len(lowering.blockingLocals) == 0 || lowering.blockingLocals[len(lowering.blockingLocals)-1].writes[nodeSpanKey(node)] == nil {
		return nil
	}
	read := func(target *ast.Node) *ast.Node {
		result := visitor.VisitNode(target)
		if local := lowering.blockingLocalForPath(write.Path); local != nil {
			result = lowering.blockingLocalRead(local, result)
		}
		return result
	}
	var target, value, condition *ast.Node
	if ast.IsBinaryExpression(node) {
		binary := node.AsBinaryExpression()
		operator, valid := compoundStateOperator(binary.OperatorToken.Kind)
		if !valid {
			return nil
		}
		target = binary.Left
		previous := lowering.mutationTemporary(target)
		rhs := visitor.VisitNode(binary.Right)
		value = lowering.binary(previous, operator, rhs)
		switch operator {
		case ast.KindAmpersandAmpersandToken:
			condition = previous
			value = rhs
		case ast.KindBarBarToken:
			condition = lowering.factory.NewPrefixUnaryExpression(ast.KindExclamationToken, previous)
			value = rhs
		case ast.KindQuestionQuestionToken:
			condition = lowering.binary(lowering.binary(previous, ast.KindEqualsEqualsEqualsToken, lowering.factory.NewKeywordExpression(ast.KindNullKeyword)), ast.KindBarBarToken, lowering.binary(previous, ast.KindEqualsEqualsEqualsToken, lowering.factory.NewVoidExpression(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone))))
			value = rhs
		}
		assignment := lowering.stagedTaskAssignment(value, write, signal, node.Pos())
		if condition != nil {
			assignment = lowering.factory.NewIfStatement(condition, assignment, nil)
		}
		return lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewExpressionStatement(lowering.binary(previous, ast.KindEqualsToken, read(target))), assignment}), true)
	}
	var operator ast.Kind
	if ast.IsPrefixUnaryExpression(node) {
		target = node.AsPrefixUnaryExpression().Operand
		operator = node.AsPrefixUnaryExpression().Operator
	}
	if ast.IsPostfixUnaryExpression(node) {
		target = node.AsPostfixUnaryExpression().Operand
		operator = node.AsPostfixUnaryExpression().Operator
	}
	if target == nil || (operator != ast.KindPlusPlusToken && operator != ast.KindMinusMinusToken) {
		return nil
	}
	previous := lowering.mutationTemporary(target)
	return lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{
		lowering.factory.NewExpressionStatement(lowering.binary(previous, ast.KindEqualsToken, read(target))),
		lowering.factory.NewExpressionStatement(lowering.factory.NewPrefixUnaryExpression(operator, previous)),
		lowering.stagedTaskAssignment(previous, write, signal, node.Pos()),
	}), true)
}
