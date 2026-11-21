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
	return owner == nil || owner.values == nil || !inertLiteralConversion(singleUseLiteral(operand, owner.values, ast.KindObjectLiteralExpression), true)
}

// A private plain literal needs no hook analysis when its first applicable
// method returns a literal without exposing its receiver. The inherited
// Object valueOf returns the receiver and Object toString returns a string.
func inertLiteralConversion(literal *ast.Node, stringHint bool) bool {
	if literal == nil {
		return false
	}
	var valueOf, toString *ast.Node
	for _, member := range literal.AsObjectLiteralExpression().Properties.Nodes {
		name := member.Name()
		if name == nil || ast.IsSpreadAssignment(member) || ast.IsComputedPropertyName(name) {
			return false
		}
		switch callableNameText(name) {
		case "__proto__":
			return false
		case "valueOf":
			valueOf = member
		case "toString":
			toString = member
		}
	}
	first := toString
	if !stringHint && valueOf != nil {
		first = valueOf
	}
	if first == nil {
		return true
	}
	if !ast.IsMethodDeclaration(first) || ast.HasSyntacticModifier(first, ast.ModifierFlagsAsync) || first.AsMethodDeclaration().AsteriskToken != nil || len(first.Parameters()) != 0 {
		return false
	}
	body := first.Body()
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
	return (ast.IsLiteralExpression(value) && value.Kind != ast.KindRegularExpressionLiteral) ||
		value.Kind == ast.KindTrueKeyword || value.Kind == ast.KindFalseKeyword || value.Kind == ast.KindNullKeyword
}

// Retain implicit conversion effects at the consuming operation.
func (q *sourceValueQuery) primitiveConversionEffects(node, operand *ast.Node, bindings sourceValueBindings, stringHint bool, result *accessorCandidates) {
	if ast.IsPropertyAccessExpression(operand) && checkedPrimitiveType(q.componentOperandType(operand)) {
		return
	}
	origins := q.originsAt(operand, node, bindings, result)
	if len(origins) == 0 {
		result.opaque = true
		return
	}
	scope := q.acquireCallableScope(bindings, result)
	values := make([]sourceObservedValue, 0, len(origins))
	for _, origin := range origins {
		if origin.node != nil && ast.IsCallExpression(origin.node) && len(origin.path) == 0 && q.dependenciesOnly {
			projected := q.projectSourceCallReturns(origin.node, bindings, sourceCallResultInterest{purpose: resultSourceProjection}, func(value sourceValue, captures sourceValueBindings) {
				values = append(values, sourceObservedValue{value: value, scope: q.acquireCallableScope(captures, result)})
			}, func() { result.opaque = true })
			mergeAccessorCandidates(result, projected)
			continue
		}
		values = append(values, sourceObservedValue{value: origin, scope: scope})
	}
	q.primitiveHintEffects(node, values, stringHint, result)
}
