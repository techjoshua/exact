package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// The tag receives the original substitution. Untagged interpolation converts
// its evaluated input; a checked primitive cannot enter an authored hook.
func templateNeedsConversionEffects(span *ast.Node, c *checker.Checker, owner *executableBodyOwner) bool {
	template := span.Parent
	if template != nil && template.Parent != nil && ast.IsTaggedTemplateExpression(template.Parent) && template.Parent.AsTaggedTemplateExpression().Template == template {
		return false
	}
	operand := span.AsTemplateSpan().Expression
	if checkedPrimitiveOperand(operand, c) {
		return false
	}
	return owner == nil || owner.values == nil || !inertLiteralStringConversion(singleUseObjectLiteral(operand, owner))
}

// A private plain literal with no exotic hook uses its own toString or the
// standard Object method. A literal-return method cannot expose its receiver.
// Either completes conversion before valueOf. Field initializers remain eager.
func inertLiteralStringConversion(literal *ast.Node) bool {
	if literal == nil {
		return false
	}
	for _, member := range literal.AsObjectLiteralExpression().Properties.Nodes {
		name := member.Name()
		if name == nil || ast.IsSpreadAssignment(member) || ast.IsComputedPropertyName(name) || callableNameText(name) == "__proto__" {
			return false
		}
		if callableNameText(name) != "toString" {
			continue
		}
		if !ast.IsMethodDeclaration(member) || ast.HasSyntacticModifier(member, ast.ModifierFlagsAsync) || member.AsMethodDeclaration().AsteriskToken != nil || len(member.Parameters()) != 0 {
			return false
		}
		body := member.Body()
		if body == nil || !ast.IsBlock(body) || len(body.AsBlock().Statements.Nodes) != 1 {
			return false
		}
		stmt := body.AsBlock().Statements.Nodes[0]
		if !ast.IsReturnStatement(stmt) {
			return false
		}
		value := unwrapSourceCallableReference(stmt.AsReturnStatement().Expression)
		if value == nil {
			return false
		}
		switch value.Kind {
		case ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindNoSubstitutionTemplateLiteral, ast.KindBigIntLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		default:
			return false
		}
	}
	return true
}

// String-hint conversion needs the original hooks' effects, not their results.
func (q *sourceValueQuery) templateConversionEffects(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	operand := node.AsTemplateSpan().Expression
	origins := q.originsAt(operand, node, bindings, result)
	if len(origins) == 0 {
		result.opaque = true
		return
	}
	scope := q.acquireCallableScope(bindings, result)
	values := make([]sourceObservedValue, 0, len(origins))
	for _, origin := range origins {
		values = append(values, sourceObservedValue{value: origin, scope: scope})
	}
	q.stringHintEffects(node, values, result)

}
