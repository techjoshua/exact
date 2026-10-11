package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Indexed work roots and disjoint-subtree pruning must retain nested helpers while excluding
// neighboring functions. Missing indexes and malformed spans retain the original fallback.
func TestPendingHelperSearchPreservesWorkScope(t *testing.T) {
	source := parseNormalizationSource("/virtual/pending-scope.ts", `function outer(){const ignored=(value:number)=>value;const run=()=>{const helper=(x:number)=>x;helper(1);};const lone=()=>1;}`)
	lowering := &jsxLowering{sourceFile: source, pendingHelperCalls: make(map[SourceSpan]bool)}
	var tasks []Task
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionLike(node) {
			tasks = append(tasks, Task{WorkStart: node.Pos(), WorkLength: node.End() - node.Pos()})
		}
		if ast.IsCallExpression(node) {
			lowering.pendingHelperCalls[nodeSourceSpan(node)] = true
		}
		return true
	})
	tasks = append(tasks, Task{WorkStart: -1, WorkLength: 1})
	for _, indexed := range []bool{false, true} {
		if indexed {
			lowering.ensureMutationSources()
		}
		for _, task := range tasks {
			expected := false
			walkNode(source.AsNode(), func(node *ast.Node) bool {
				if node.Pos() < task.WorkStart || node.End() > task.WorkStart+task.WorkLength {
					return true
				}
				if lowering.pendingHelperCalls[nodeSourceSpan(node)] || ast.IsFunctionLike(node) && node.Pos() != task.WorkStart && len(node.Parameters()) > 0 {
					expected = true
					return false
				}
				return !expected
			})
			if lowering.taskHasPendingHelper(task) != expected {
				t.Fatalf("helper selection changed with index=%t for %+v", indexed, task)
			}
		}
	}
}
