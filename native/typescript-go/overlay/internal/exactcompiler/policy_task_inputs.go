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
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		key := nodeSpanKey(node)
		if !works[key] || node.Body() == nil {
			return true
		}
		analysis.taskPolicies[key] = policyInputsForBoundary(node.Body(), typeChecker, analysis.subjects, true, works)
		return true
	})
}
