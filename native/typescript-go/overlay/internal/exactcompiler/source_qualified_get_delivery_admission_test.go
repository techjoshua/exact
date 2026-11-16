package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func TestOriginalQualifiedGetDeliveryAdmission(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		found := false
		for _, recipe := range work.operationRecipes {
			source := recipe.callResult
			if source == nil || source.getResult == nil || source.getResult.role != "receiver" || source.getResult.sourceInput.parent.use != root.use || sourceText(file, source.request.use) != "this.tag" {
				continue
			}
			if work.assignmentEffectsInputCurrent(source.getResult.sourceInput) {
				t.Fatal("ENTRY: original incomplete input unexpectedly complete-local")
			}
			if !work.qualifiedGetEffectsInputCurrent(source) {
				t.Fatal("original observed receiver Effects not admitted")
			}
			found = true
			bad := *source
			bad.request.edge += ":foreign"
			if work.qualifiedGetEffectsInputCurrent(&bad) {
				t.Fatal("foreign contextual request admitted")
			}
			get := *source.getResult
			bad = *source
			bad.getResult = &get
			get.role = "value"
			if work.qualifiedGetEffectsInputCurrent(&bad) {
				t.Fatal("early input quorum admitted normal DATA")
			}
			get.role = "body"
			if work.qualifiedGetEffectsInputCurrent(&bad) {
				t.Fatal("early input quorum admitted BODY DATA")
			}
		}
		if !found {
			t.Fatal("ENTRY: actual argument receiver SOURCE absent")
		}
	})
}
