package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// booleanSuccessor transports conversion on the common schedule. Sequence adopts paid
// contributions once. Struct copying retains other current and future metadata.
// Immutable Call histories and active/pending boundary authority are copied inertly.
// Nonnormal rows must bypass it through sequence. Invalid Normal pending data is
// preserved behind a residual, never silently overwritten by a conversion.
func booleanSuccessor(prior languageAlternative, operand languageValue, origin *ast.Node, work *languageCopyWork) languageAlternative {
	if prior.completion != languageNormal {
		return prior
	}
	out := prior
	out.objects, out.effects, out.obligations = nil, nil, nil
	if prior.remaining != "" || prior.pending != languageNormal || prior.pendingValue != (languageValue{}) || prior.returnBoundary != (languageID{}) || prior.pendingReturnBoundary != (languageID{}) {
		out.completion = languageResidual
		out.value = languageValue{}
		out.obligations = []string{"LogicalNot invalid Normal pending metadata"}
		return out
	}
	value, reason := prior.branch.owner.logicalNot(prior.branch, operand, origin, work)
	out.value = value
	if reason != "" {
		out.completion = languageResidual
		out.remaining = reason
		out.pendingValue = operand
		out.obligations = []string{reason}
	}
	return out
}
