package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
)

// projectPolicyTypes retains only completed type qualification, never inferred subjects or
// provisional recursion outcomes. The program owns its exclusive checker pool. Each checker
// has a separate TypeId namespace, and every program or source invalidation discards all facts.
// Queries and publication run while the session holds the corresponding checker exclusively.
type projectPolicyTypes struct {
	program   *compiler.Program
	byChecker map[*checker.Checker]map[checker.TypeId]bool
}

func (state *projectState) completedPolicyTypes(c *checker.Checker) map[checker.TypeId]bool {
	if state.policyTypes == nil || state.policyTypes.program != state.program {
		state.policyTypes = &projectPolicyTypes{program: state.program, byChecker: make(map[*checker.Checker]map[checker.TypeId]bool)}
	}
	if completed, exists := state.policyTypes.byChecker[c]; exists {
		return completed
	}
	completed := make(map[checker.TypeId]bool)
	state.policyTypes.byChecker[c] = completed
	return completed
}
