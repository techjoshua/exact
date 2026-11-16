package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The existing generic analysis fingerprint already includes complete retained
// delta values. Exercise actual produced payloads and detached descriptions;
// this test supplies no graph issuer, subscriber or consumer acceptance.
func TestProducedSetPayloadCloneFingerprint(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		factIndex, recipeIndex, accessIndex := -1, -1, -1
		for i := range facts {
			for j, recipe := range facts[i].staged.operationRecipes {
				if recipe.key != root.producer {
					continue
				}
				for k, access := range recipe.delta.readWrites {
					if sourceText(file, access.operation) == "selected=next" && access.target.expression != nil && access.writtenFrom.expression != nil && len(access.required) != 0 {
						factIndex, recipeIndex, accessIndex = i, j, k
					}
				}
			}
		}
		if factIndex < 0 {
			t.Fatal("actual produced nonempty original store payload absent")
		}
		original := callableAnalysis{facts: facts}
		fingerprint := callableAnalysisFingerprint(original)
		clone := func() callableAnalysis {
			out := callableAnalysis{facts: make([]callableFacts, len(facts))}
			for i := range facts {
				out.facts[i] = cloneProjectCallableFact(facts[i])
			}
			return out
		}
		detached := clone()
		if callableAnalysisFingerprint(detached) != fingerprint {
			t.Fatal("equal detached source descriptions changed existing analysis fingerprint")
		}
		for _, field := range []string{"target", "writtenFrom", "required"} {
			changed := clone()
			access := &changed.facts[factIndex].staged.operationRecipes[recipeIndex].delta.readWrites[accessIndex]
			switch field {
			case "target":
				access.target.expression = root.use.AsBinaryExpression().Left
			case "writtenFrom":
				access.writtenFrom.expression = root.use.AsBinaryExpression().Left
			case "required":
				access.required = nil
			}
			if callableAnalysisFingerprint(changed) == fingerprint {
				t.Fatal("changed produced payload omitted from existing fingerprint", field)
			}
			if callableAnalysisFingerprint(original) != fingerprint {
				t.Fatal("detached payload edit mutated original retained storage", field)
			}
		}
		fresh := registerCallableEffectWork(detached.facts)
		if len(fresh.operationIDs) != 0 || fresh.assignmentSourceEffectsCurrent(work.assignmentObserved[root.producer].effects) {
			t.Fatal("equal source fingerprint lent graph-local issuer or consumed authority")
		}
	})
}
