package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
	"testing"
)

// Qualification facts cannot cross checker namespaces or survive source/program invalidation.
func TestProjectPolicyTypeOwnership(t *testing.T) {
	state := &projectState{program: &compiler.Program{}}
	first, second := &checker.Checker{}, &checker.Checker{}
	state.completedPolicyTypes(first)[1] = true
	state.completedPolicyTypes(second)[1] = false
	if !state.completedPolicyTypes(first)[1] || state.completedPolicyTypes(second)[1] {
		t.Fatal("checker type namespaces mixed")
	}
	state.program = &compiler.Program{}
	if len(state.completedPolicyTypes(first)) != 0 {
		t.Fatal("program replacement retained qualifications")
	}
	state.completedPolicyTypes(first)[1] = true
	state.invalidateChangedProjectSources("/changed.ts")
	if len(state.completedPolicyTypes(first)) != 0 {
		t.Fatal("source invalidation retained qualifications")
	}
	state.completedPolicyTypes(first)[1] = true
	state.invalidateAnalysisCaches()
	if len(state.completedPolicyTypes(first)) != 0 {
		t.Fatal("full invalidation retained qualifications")
	}
}
