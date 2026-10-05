package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// nativeTemporalInputType identifies numeric values whose native surface is formatted calendar text.
func nativeTemporalInputType(kind string) bool {
	switch strings.ToLower(kind) {
	case "date", "datetime-local", "month", "time", "week":
		return true
	default:
		return false
	}
}

// serverFormBindingsRequireType keeps a temporal value and its authored type in one prop bag.
// Scalar SSR attribute operations cannot discover the sibling type or safely reevaluate it.
func (lowering *jsxLowering) serverFormBindingsRequireType(attributes *ast.Node) bool {
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		if attribute.Initializer == nil || !ast.IsJsxExpression(attribute.Initializer) {
			continue
		}
		target := attribute.Initializer.AsJsxExpression().Expression
		if target == nil {
			continue
		}
		binding, exists := lowering.formBindings[target.Pos()]
		if exists && binding.name == jsxAttributeText(attribute.Name()) && binding.valueKind == "number" && (binding.temporalNumber || binding.dynamicInput) {
			return true
		}
	}
	return false
}

// formBindingProjection preserves the control surface while retaining typed receipt units.
func (lowering *jsxLowering) formBindingProjection(
	binding formBinding,
	target *ast.Node,
) *ast.Node {
	switch binding.control {
	case "radio":
		return lowering.binary(
			target,
			ast.KindEqualsEqualsEqualsToken,
			lowering.formBindingOption(binding),
		)
	case "checkbox-group":
		values := lowering.binary(
			target,
			ast.KindQuestionQuestionToken,
			lowering.factory.NewArrayLiteralExpression(nil, false),
		)
		return lowering.memberCall(
			lowering.factory.NewParenthesizedExpression(values),
			"includes",
			lowering.formBindingOption(binding),
		)
	case "checked", "open", "modal":
		return lowering.binary(
			target,
			ast.KindQuestionQuestionToken,
			lowering.factory.NewFalseExpression(),
		)
	case "multiple":
		return lowering.binary(
			target,
			ast.KindQuestionQuestionToken,
			lowering.factory.NewArrayLiteralExpression(nil, false),
		)
	}
	if binding.valueKind == "number" {
		empty := lowering.binary(
			target,
			ast.KindEqualsEqualsToken,
			lowering.factory.NewKeywordExpression(ast.KindNullKeyword),
		)
		nan := lowering.memberCall(
			lowering.factory.NewIdentifier("Number"),
			"isNaN",
			target,
		)
		value := lowering.call("String", []*ast.Node{target})
		if binding.temporalNumber || binding.dynamicInput {
			// Preserve numeric units until the renderer can see the input's effective type.
			value = target
		}
		return lowering.conditional(
			lowering.binary(empty, ast.KindBarBarToken, nan),
			lowering.factory.NewStringLiteral("", ast.TokenFlagsNone),
			value,
		)
	}
	if binding.valueKind == "string" {
		return lowering.binary(
			target,
			ast.KindQuestionQuestionToken,
			lowering.factory.NewStringLiteral("", ast.TokenFlagsNone),
		)
	}
	return target
}
