package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Difference intent is explicit. Arithmetic supplies endpoints, never intent.
// Values retain authored evaluation order while indexes select left minus right.
type intlUnitDifferencePlan struct {
	values  []*ast.Node
	reverse bool
	mode    string
}

func intlUnitDifferenceOption(attributes, activation *ast.Node) (*ast.Node, bool) {
	attribute := intlUnitOptionAttribute(attributes, "difference")
	if attribute != nil {
		value := attribute.AsJsxAttribute().Initializer
		if value == nil {
			return attribute, true
		}
		if ast.IsJsxExpression(value) {
			value = value.AsJsxExpression().Expression
		}
		return unwrapRenderExpression(value), true
	}
	if activation == nil || activation.AsJsxAttribute().Initializer == nil {
		return nil, true
	}
	value := activation.AsJsxAttribute().Initializer
	if ast.IsJsxExpression(value) {
		value = unwrapRenderExpression(value.AsJsxExpression().Expression)
	}
	if value != nil && ast.IsObjectLiteralExpression(value) {
		member, proven := intlActivationObjectMemberProof(value, "difference")
		return unwrapRenderExpression(member), proven
	}
	return nil, true
}

func planIntlUnitDifference(attributes, activation *ast.Node, expressions []*ast.Node, quantity, sourceUnit, convertTo string, typeChecker *checker.Checker, build *intlPatternBuild) (intlUnitDifferencePlan, bool) {
	plan := intlUnitDifferencePlan{values: expressions}
	option, proven := intlUnitDifferenceOption(attributes, activation)
	if !proven {
		build.failure = "intl difference must be explicit after unknown option spreads"
		return plan, false
	}
	if option == nil || option.Kind == ast.KindFalseKeyword {
		return plan, true
	}
	bare := ast.IsJsxAttribute(option)
	if !bare && option.Kind != ast.KindTrueKeyword && !ast.IsObjectLiteralExpression(option) {
		build.failure = "intl difference requires true, false, or explicit numeric {from, to} endpoints"
		return plan, false
	}
	if len(expressions) != 1 {
		build.failure = "intl difference formats one change. Put independent differences in separate elements"
		return plan, false
	}
	var left, right *ast.Node
	if ast.IsObjectLiteralExpression(option) {
		if len(option.AsObjectLiteralExpression().Properties.Nodes) != 2 {
			build.failure = "intl difference objects require exactly two numeric properties: from and to"
			return plan, false
		}
		left = intlActivationObjectMember(option, "to")
		right = intlActivationObjectMember(option, "from")
	} else if expression := unwrapRenderExpression(expressions[0]); ast.IsBinaryExpression(expression) && expression.AsBinaryExpression().OperatorToken.Kind == ast.KindMinusToken {
		left, right = expression.AsBinaryExpression().Left, expression.AsBinaryExpression().Right
	}
	if ast.IsObjectLiteralExpression(option) || left != nil {
		if !intlDifferenceNumber(left, typeChecker) || !intlDifferenceNumber(right, typeChecker) {
			build.failure = "intl difference endpoints must both be numbers in the declared source unit"
			return plan, false
		}
		plan.mode = "endpoints"
		plan.values = []*ast.Node{left, right}
		if ast.IsObjectLiteralExpression(option) && right.Pos() < left.Pos() {
			plan.values, plan.reverse = []*ast.Node{right, left}, true
		}
		return plan, true
	}
	if !intlDifferenceNumber(expressions[0], typeChecker) {
		build.failure = "intl difference requires a numeric change in the declared source unit"
		return plan, false
	}
	if quantity == "fuel-economy" && convertTo != sourceUnit {
		build.failure = "Nonlinear intl differences need both endpoints. Write {current - previous} in the view or supply difference={{from: previous, to: current}}"
		return plan, false
	}
	plan.mode = "value"
	return plan, true
}

func intlDifferenceNumber(value *ast.Node, typeChecker *checker.Checker) bool {
	return value != nil && typeChecker != nil && intlHomogeneousPrimitive(typeChecker.GetTypeAtLocation(value), "number")
}
