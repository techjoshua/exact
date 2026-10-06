package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// collectTaskPolicyInputs checks qualified values used inside each compiler-owned task body.
// Consumption ends result tracking but remains a server execution requirement. Nested task bodies
// have independent placement. Work spans are deduplicated across repeated activations.
func collectTaskPolicyInputs(source *ast.SourceFile, typeChecker *checker.Checker, tasks []Task, analysis *policyAnalysis) {
	works := make(map[string]bool)
	for _, task := range tasks {
		works[fmt.Sprintf("%d:%d", task.WorkStart, task.WorkLength)] = true
	}
	analysis.taskPolicies = make(map[string][]PolicySubject)
	analysis.taskCapturePolicies = make(map[string][]PolicySubject)
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		key := nodeSpanKey(node)
		if !works[key] || node.Body() == nil {
			return true
		}
		analysis.taskPolicies[key] = policyInputsForBoundary(node.Body(), typeChecker, analysis.subjects, true, works)
		// Transport authority belongs to default initializers, not the task body.
		// A server-only resource consumed by work must not taint an unrelated capture.
		for _, parameter := range node.Parameters() {
			initializer := parameter.AsParameterDeclaration().Initializer
			if initializer != nil {
				analysis.taskCapturePolicies[key] = append(analysis.taskCapturePolicies[key],
					policyInputsForBoundary(initializer, typeChecker, analysis.subjects, true, works)...)
			}
		}
		return true
	})
}
