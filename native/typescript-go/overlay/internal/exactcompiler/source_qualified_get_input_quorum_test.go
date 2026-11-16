package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func TestOriginalQualifiedGetInputQuorumRefusers(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		found := false
		for _, recipe := range work.operationRecipes {
			source := recipe.callResult
			if source == nil || source.getResult == nil || source.getResult.role != "effects" || source.getResult.sourceInput.parent.use != root.use || sourceText(file, source.request.use) != "this.tag" {
				continue
			}
			input := source.getResult.sourceInput
			if !work.qualifiedGetSourceInputsCurrent(input) {
				t.Fatal("ENTRY: authentic original input quorum absent")
			}
			found = true
			bad := input
			bad.parent.edge += ":foreign"
			if work.qualifiedGetSourceInputsCurrent(bad) {
				t.Fatal("foreign original Set request admitted")
			}
			bad = input
			bad.access.cut.reading = root.use
			if work.qualifiedGetSourceInputsCurrent(bad) {
				t.Fatal("foreign Get cut admitted")
			}
			bad = input
			bad.access.generation = nil
			if work.qualifiedGetSourceInputsCurrent(bad) {
				t.Fatal("foreign generation admitted")
			}
			bad = input
			bad.access.receiver = source.request.use
			if work.qualifiedGetSourceInputsCurrent(bad) {
				t.Fatal("foreign receiver source admitted")
			}
		}
		if !found {
			t.Fatal("ENTRY: original argument Get absent")
		}
	})
}
