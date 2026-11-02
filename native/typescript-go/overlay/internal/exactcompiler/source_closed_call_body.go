package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// closedBodyPlan retains only detached discovery provenance. A plan by itself
// grants callable construction, never live body entry.
type closedBodyPlan struct {
	recipe     *storageRecipe
	parameters *closedParameterMap
	runtime    map[*ast.Node]bool
}

// literalEmptyFinallyTerminal shares only the syntactic walk. Callable kind,
// formal projection and permitted terminal policies remain with its callers.
// Discovery does not issue a value or grant body entry authority.
func literalEmptyFinallyTerminal(body *ast.Node) (*ast.Node, *ast.Node) {
	if body == nil || !ast.IsBlock(body) || len(body.AsBlock().Statements.Nodes) != 1 {
		return nil, nil
	}
	statement := body.AsBlock().Statements.Nodes[0]
	if !ast.IsTryStatement(statement) {
		return nil, nil
	}
	t := statement.AsTryStatement()
	if t.CatchClause != nil || t.FinallyBlock == nil || !ast.IsBlock(t.FinallyBlock) || len(t.FinallyBlock.AsBlock().Statements.Nodes) != 0 || t.TryBlock == nil || !ast.IsBlock(t.TryBlock) || len(t.TryBlock.AsBlock().Statements.Nodes) != 1 {
		return nil, nil
	}
	terminal := t.TryBlock.AsBlock().Statements.Nodes[0]
	if !ast.IsReturnStatement(terminal) && !ast.IsThrowStatement(terminal) {
		return nil, nil
	}
	value := terminal.Expression()
	for value != nil && ast.IsParenthesizedExpression(value) {
		value = value.Expression()
	}
	if !expressionLiteralNode(value) {
		return nil, nil
	}
	return terminal, value
}

// strictFunctionNumberThrowFinally is the finite ordinary-function policy.
// It adds no normal Return output, receiver read or runtime parameter scope.
func strictFunctionNumberThrowFinally(n *ast.Node, mapping *closedParameterMap) bool {
	if n == nil || !ast.IsFunctionExpression(n) || !closedCallableNode(n) || ast.HasDecorators(n) || mapping == nil || mapping.arrow != n || !mapping.validProjection() || len(mapping.physical) != 1 || mapping.erasedThis == nil || len(mapping.declarations) != 0 || len(mapping.references) != 0 {
		return false
	}
	terminal, value := literalEmptyFinallyTerminal(n.Body())
	return terminal != nil && ast.IsThrowStatement(terminal) && value.Kind == ast.KindNumericLiteral
}
