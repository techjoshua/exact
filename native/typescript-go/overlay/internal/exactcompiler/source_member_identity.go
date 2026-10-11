package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceLiteralMemberReference preserves the receiver of a statically named source member.
// Only literal indexed names qualify, so a lowering cannot discard computed key evaluation.
func sourceLiteralMemberReference(expression *ast.Node) (*ast.Node, string) {
	expression = unwrapSourceCallableReference(expression)
	if expression == nil {
		return nil, ""
	}
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		return member.Expression, member.Name().Text()
	}
	if ast.IsElementAccessExpression(expression) {
		member := expression.AsElementAccessExpression()
		key := unwrapSourceCallableReference(member.ArgumentExpression)
		if key != nil && (ast.IsStringLiteral(key) || ast.IsNoSubstitutionTemplateLiteral(key)) {
			return member.Expression, key.Text()
		}
	}
	return nil, ""
}
