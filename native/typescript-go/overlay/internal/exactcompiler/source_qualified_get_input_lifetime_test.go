package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The permission belongs to the original live owner, not cloned descriptions
// or a saved Get input. No observation/issuer/generation flag is installed here.
func TestOriginalQualifiedGetInputLifetime(t *testing.T) {
	var expired func() bool
	var released func() bool
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		var input sourceAssignmentEffectsInput
		count := 0
		for _, recipe := range work.operationRecipes {
			s := recipe.callResult
			if s != nil && s.getResult != nil && s.getResult.role == "effects" && sameOperationRequest(s.getResult.sourceInput.parent, root) && sourceText(file, s.request.use) == "this.tag" {
				input = s.getResult.sourceInput
				count++
			}
		}
		if count != 1 || !work.qualifiedGetSourceInputsCurrent(input, owner) {
			t.Fatal("ENTRY: exact original owner-bearing argument quorum absent")
		}
		observation := work.assignmentObserved[root.producer]
		if observation == nil || observation.local || observation.effects == nil || observation.effects.generation != owner.values.generation {
			t.Fatal("ENTRY: actual prelocal SOURCE publisher absent")
		}
		generation := work.operationGeneration
		if generation == nil || !generation.active || owner.project.activeGeneration != generation {
			t.Fatal("ENTRY: original live generation absent")
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		// Prove the relevant immutable description survived; refusal must not be
		// explained by omitting the original Get from the clone input.
		copied := false
		for _, fact := range clones {
			for _, recipe := range fact.staged.operationRecipes {
				s := recipe.callResult
				copied = copied || s != nil && s.getResult != nil && s.getResult.role == "effects" && sameAssignmentEffectsInput(s.getResult.sourceInput, input)
			}
		}
		if !copied {
			t.Fatal("ENTRY: clone lost original qualified Get description")
		}
		fresh := registerCallableEffectWork(clones)
		if fresh.qualifiedGetSourceInputsCurrent(input, owner) || len(fresh.operationIDs) != 0 || len(fresh.assignmentObserved) != 0 {
			t.Fatal("cloned description reused original quorum/authority")
		}
		if !work.qualifiedGetSourceInputsCurrent(input, owner) {
			t.Fatal("clone inspection revoked genuine original permission")
		}
		expired = func() bool { return work.qualifiedGetSourceInputsCurrent(input, owner) }
		released = func() bool { return !generation.active || owner.project.activeGeneration != generation }
	})
	if expired == nil || released == nil {
		t.Fatal("ENTRY: genuine original lifetime not reached")
	}
	if !released() {
		t.Fatal("original collector did not actually release its generation")
	}
	if expired() {
		t.Fatal("released owner retained qualified Get input permission")
	}
}
