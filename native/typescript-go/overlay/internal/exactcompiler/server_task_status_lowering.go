package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Client-only work has no server generation. Preserve status observation without constructing a
// durable task host or passing the server's inert callback to the client task runtime.
func (lowering *jsxLowering) lowerServerClientTaskStatus(node *ast.Node) *ast.Node {
	if lowering.target != TargetServer {
		return nil
	}
	if ast.IsPropertyAccessExpression(node) {
		member := node.AsPropertyAccessExpression()
		if lowering.isServerClientTaskReference(member.Expression) {
			return lowering.idleTaskStatusField(member.Name().Text())
		}
	}
	if ast.IsElementAccessExpression(node) {
		member := node.AsElementAccessExpression()
		if ast.IsStringLiteral(member.ArgumentExpression) && lowering.isServerClientTaskReference(member.Expression) {
			return lowering.idleTaskStatusField(member.ArgumentExpression.Text())
		}
	}
	if !ast.IsCallExpression(node) {
		return nil
	}
	call := node.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
		return nil
	}
	if !isTaskStatusCall(node, lowering.externalImports, lowering.checker) {
		return nil
	}
	if !lowering.isServerClientTaskReference(call.Arguments.Nodes[0]) {
		return nil
	}
	fields := []*ast.Node{}
	for _, field := range []string{"pending", "pendingCount", "generation", "result", "error", "cancel"} {
		fields = append(fields, lowering.property(lowering.factory.NewIdentifier(field), lowering.idleTaskStatusField(field)))
	}
	result := lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(fields), false)
	// Even inert status preserves evaluation of the task argument and optional owner/key inputs.
	for index := len(call.Arguments.Nodes) - 1; index >= 0; index-- {
		result = lowering.factory.NewParenthesizedExpression(lowering.factory.NewBinaryExpression(nil,
			lowering.visitor.VisitNode(call.Arguments.Nodes[index]), nil,
			lowering.factory.NewToken(ast.KindCommaToken), result))
	}
	return result
}

// Resolve transparent type assertions without changing the callable's identity.
func (lowering *jsxLowering) isServerClientTaskReference(expression *ast.Node) bool {
	for expression != nil {
		switch {
		case ast.IsParenthesizedExpression(expression):
			expression = expression.AsParenthesizedExpression().Expression
		case ast.IsAsExpression(expression):
			expression = expression.AsAsExpression().Expression
		case ast.IsSatisfiesExpression(expression):
			expression = expression.AsSatisfiesExpression().Expression
		default:
			task, found := lowering.taskDefinitionAtCall(expression)
			return found && task.Placement == "client"
		}
	}
	return false
}

func (lowering *jsxLowering) idleTaskStatusField(field string) *ast.Node {
	switch field {
	case "pending":
		return lowering.factory.NewFalseExpression()
	case "pendingCount", "generation":
		return lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone)
	case "result", "error":
		return lowering.factory.NewVoidExpression(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone))
	case "cancel":
		return lowering.inertClientTaskCallable()
	default:
		return nil
	}
}
