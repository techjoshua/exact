package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/jsnum"
)

// numberArithmeticWork retains the existing normalized advisory estimate at the
// same work owner. It is neither CPU instructions nor semantic fuel.
const numberArithmeticWork = 27

func numberArithmeticName(operator ast.Kind) string {
	switch operator {
	case ast.KindPlusToken:
		return "Addition"
	case ast.KindMinusToken:
		return "Subtraction"
	case ast.KindAsteriskToken:
		return "Multiplication"
	case ast.KindSlashToken:
		return "Division"
	case ast.KindPercentToken:
		return "Remainder"
	}
	return ""
}

// acquiredNumberArithmetic decides over two already acquired Numbers. Every event
// rounds to binary64 before issuance or any later operation. Direct arithmetic on
// jsnum.Number follows the native owner contract, including signed zero and NaN.
// Unknown categories never invoke ToPrimitive and never acquire a default zero.
func acquiredNumberArithmetic(b languageBranch, left, right languageValue, operator ast.Kind) (jsnum.Number, string) {
	name := numberArithmeticName(operator)
	if name == "" {
		return 0, "Arithmetic operator unavailable"
	}
	if b.owner == nil || !b.owner.live(b) {
		return 0, name + " ownership"
	}
	l, lok := numericNumberPayload(left)
	r, rok := numericNumberPayload(right)
	if !lok || !rok {
		return 0, name + " numeric operand unavailable"
	}
	switch operator {
	case ast.KindPlusToken:
		return jsnum.Number(float64(l + r)), ""
	case ast.KindMinusToken:
		return jsnum.Number(float64(l - r)), ""
	case ast.KindAsteriskToken:
		return jsnum.Number(float64(l * r)), ""
	case ast.KindSlashToken:
		return jsnum.Number(float64(l / r)), ""
	case ast.KindPercentToken:
		return jsnum.Number(float64(l.Remainder(r))), ""
	}
	return 0, "Arithmetic operator unavailable"
}

// arithmeticSuccessor contributes only this operation's result or refusal. The
// existing sequence adopts predecessor effects/history once. Headers/family and
// Call associations remain separate from the actual acquired expression operand.
func arithmeticSuccessor(prior languageAlternative, left, right languageValue, origin *ast.Node, work *languageCopyWork, disposition *expressionSelectionDisposition, operator ast.Kind) languageAlternative {
	if prior.completion != languageNormal {
		return prior
	}
	name := numberArithmeticName(operator)
	if name == "" {
		return shortCircuitCut(prior, "Arithmetic operator unavailable", languageValue{})
	}
	if !shortCircuitCanonical(prior) {
		return shortCircuitCut(prior, name+" invalid Normal pending metadata", languageValue{})
	}
	if work == nil {
		return shortCircuitCut(prior, name+" work context unavailable", languageValue{})
	}
	work.spend(numberArithmeticWork)
	result, reason := acquiredNumberArithmetic(prior.branch, left, right, operator)
	if reason != "" {
		if disposition != nil {
			*disposition = expressionPredicateUnavailable
		}
		return shortCircuitCut(prior, reason, left)
	}
	work.spend(prior.branch.owner.numericArtifactCost())
	out := shortCircuitHeader(prior)
	out.value, _ = prior.branch.owner.numericNumberArtifact(result, origin)
	return out
}
