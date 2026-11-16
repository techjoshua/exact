package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This before/after test uses only pre-existing graph APIs, so the exact test
// also compiles on the dependency-only parent. A BODY read on its own is not
// enough: the original writer must demand it through the original Set root.
func TestOriginalSetReadWriteDependencyConsumer(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		id, issued := work.operationIDs[root.producer]
		if !issued {
			t.Fatal("ENTRY: actual original writer did not enroll its Set root")
		}
		writer := false
		for key, recipe := range work.operationRecipes {
			s := recipe.memberSource
			if s == nil || s.protocolSource == nil || !s.protocolSource.setEffects || stagedSetWriterOperation(s.candidate) != root.use {
				continue
			}
			writerID, present := work.operationIDs[key]
			if !present || !validStagedSetWriterRecipe(recipe) {
				continue
			}
			for _, dependency := range work.operations[writerID.index].dependencies {
				writer = writer || dependency.producer == id && sameOperationRequest(dependency.request, root)
			}
		}
		if !writer {
			t.Fatal("ENTRY: original writer Effects subscriber absent")
		}
		found := false
		for _, dependency := range work.operations[id.index].dependencies {
			r := dependency.request
			if r.use != nil && sourceText(file, r.use) == "captured.count" && ast.IsSetAccessorDeclaration(r.consumer) && sameOperationRequest(r, stagedGetResultRequest(r.use, r.consumer, "effects", nil)) {
				found = true
			}
		}
		if !found {
			t.Fatal("original writer missing source-qualified captured.count Get Effects dependency")
		}
	})
}
