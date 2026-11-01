package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// compileNarrowFinally admits one terminal try/finally and no catch/fallthrough.
// Audited symbol-to-formal associations are borrowed from the creation proof.
// Assignment expressions retain their acquired values. Only routing erases a
// Normal finalizer's unobserved value, never the expression producer.
func compileNarrowFinally(x *expressionLowerer, body *ast.Node) bool {
	child := x.storageBuilder
	if !x.mark(body) || len(body.AsBlock().Statements.Nodes) != 1 {
		return false
	}
	statement := body.AsBlock().Statements.Nodes[0]
	if !x.mark(statement) || !ast.IsTryStatement(statement) {
		return false
	}
	attempt := statement.AsTryStatement()
	if !x.mark(attempt.TryBlock) || !x.mark(attempt.FinallyBlock) || attempt.CatchClause != nil || attempt.FinallyBlock == nil || len(attempt.TryBlock.AsBlock().Statements.Nodes) != 1 {
		return false
	}
	terminal := func(n *ast.Node) bool {
		if !x.mark(n) || (!ast.IsReturnStatement(n) && !ast.IsThrowStatement(n)) {
			return false
		}
		operand := n.Expression()
		if operand == nil {
			return false
		}
		value, ok := x.value(operand)
		if !ok {
			return false
		}
		kind := "Return"
		if ast.IsThrowStatement(n) {
			kind = "Throw"
		}
		child.event(storageEvent{kind: kind, node: n, a: value})
		return !child.exhausted
	}
	if !terminal(attempt.TryBlock.AsBlock().Statements.Nodes[0]) {
		return false
	}
	plan := &storageFinallyRecipe{node: statement, park: len(child.recipe.events)}
	child.event(storageEvent{kind: "FinallyPark", node: statement})
	statements := attempt.FinallyBlock.AsBlock().Statements.Nodes
	for i, s := range statements {
		if !x.mark(s) {
			return false
		}
		if ast.IsReturnStatement(s) || ast.IsThrowStatement(s) {
			if i != len(statements)-1 || !terminal(s) {
				return false
			}
			continue
		}
		if !ast.IsExpressionStatement(s) || !ast.IsBinaryExpression(s.Expression()) {
			return false
		}
		assignment := s.Expression().AsBinaryExpression()
		if assignment.OperatorToken.Kind != ast.KindEqualsToken || !ast.IsIdentifier(assignment.Left) {
			return false
		}
		if _, ok := x.value(s.Expression()); !ok {
			return false
		}
	}
	plan.route = len(child.recipe.events)
	child.event(storageEvent{kind: "FinallyRoute", node: statement})
	child.recipe.finally = plan
	return !child.exhausted
}
