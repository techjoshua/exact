package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// contextPolicyOperation identifies the compiler-owned component protocol in its
// lexical receiver scope. A structural authored this view retains that protocol,
// while an ordinary receiver with a familiar method name does not acquire it.
// This contributes policy restrictions only, never executable-call authority.
func contextPolicyOperation(expression *ast.Node, c *checker.Checker) bool {
	selected := componentProtocolCallMember(expression, c)
	name, member, dynamic := checkedComponentProtocolMember(selected, c)
	return member && !dynamic && (name == "getContext" || name == "setContext") && componentProtocolReceiverOwned(selected, c)
}

// contextPolicyInput selects current lexical subject identity, including aliases
// already joined by the policy propagation owner. Spelling alone never connects
// a shadowed token to another context's residency or qualification.
func contextPolicyInput(node *ast.Node, analysis *policyAnalysis) (PolicySubject, bool) {
	if analysis.owner == nil || node == nil {
		return PolicySubject{}, false
	}
	c := analysis.owner.checker
	node = unwrapSourceCallableReference(node)
	if !ast.IsIdentifier(node) {
		return PolicySubject{}, false
	}
	symbol := c.GetSymbolAtLocation(node)
	if symbol == nil {
		return PolicySubject{}, false
	}
	subject, exists := analysis.subjects.symbols[ast.GetSymbolId(symbol)]
	return subject, exists
}
