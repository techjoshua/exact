package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The active original collector issues the native parent descriptions used
// here. Comparisons do not register/adopt a new scope, select a callee or create
// Get/input/current receipts. Detached branch cases test key encoding only.
func TestStagedNativeScopeRequestIdentityOriginalSource(t *testing.T) {
	const id = "/virtual/eager-wait-scope.ts"
	request := Request{Kind: "analyze", ID: id, Source: stagedNativeEagerSymbolChildSource, Diagnostics: "semantic"}
	withActiveModuleSourceWork(t, request, map[string]string{id: stagedNativeEagerSymbolChildSource}, nil, func(_ []callableFacts, work *callableEffectWork, _ *executableBodyOwner) {
		parents, registered, cases := 0, 0, 0
		for _, recipe := range work.operationRecipes {
			if nativeWriterScopeRequested(recipe) {
				s := recipe.memberSource
				if !validStagedMemberCallRecipe(recipe) {
					t.Fatal("original registered native scope description invalid")
				}
				descriptor := descriptorCalleeRequested(recipe)
				expected := legacyNativeScopeRequestIdentity(s.parent, s.candidate, descriptor)
				actual := nativeWriterScopeRequestKey(s.parent, s.candidate, descriptor)
				if !sameOperationRequest(actual, s.request) || !sameOperationRequest(actual, expected) {
					t.Fatal("registered native scope request identity changed")
				}
				registered++
			}
			source := recipe.nativeGet
			if source == nil || recipe.key != source.request.producer {
				continue
			}
			call := source.request.producer.operation
			if call == nil || !ast.IsCallExpression(call) || !ast.IsPropertyAccessExpression(call.Expression()) {
				continue // The existing native/descriptor scope family is property-call only.
			}
			if !validNativeGetRecipe(recipe) {
				t.Fatal("original registered native parent description invalid")
			}
			parent := source.request
			// This existing constructor describes the candidate at the REAL parent;
			// neither its result nor the branch copies below enters the work graph.
			base := requestedMemberCallCandidate(nativeWriterSourceOccurrence(parent))
			base.origin = base.value.expression
			for _, flags := range [][3]bool{{true, false, false}, {false, true, false}, {false, false, false}, {false, false, true}, {true, true, true}} {
				candidate := base
				candidate.getContribution, candidate.invoking, candidate.runtimeUnknown = flags[0], flags[1], flags[2]
				for _, descriptor := range []bool{false, true} {
					expected := legacyNativeScopeRequestIdentity(parent, candidate, descriptor)
					actual := nativeWriterScopeRequestKey(parent, candidate, descriptor)
					if !sameOperationRequest(expected, actual) {
						t.Fatal("native scope encoding changed branch/cut/input/reading identity", flags, descriptor)
					}
					cases++
				}
			}
			native := nativeWriterSourceRequestKey(parent, base)
			descriptor := descriptorCalleeRequestKey(parent, base)
			if native.producer == descriptor.producer || native.edge == descriptor.edge {
				t.Fatal("native and descriptor SOURCE roles aliased")
			}
			if native.cut != parent.cut || descriptor.cut != parent.cut || native.inputs != parent.inputs || descriptor.inputs != parent.inputs || native.reading != parent.reading || descriptor.reading != parent.reading {
				t.Fatal("scope encoding changed parent cut/input/reading")
			}
			parents++
		}
		if parents == 0 {
			t.Fatal("genuine original native parent description entry UNREACHED")
		}
		t.Logf("original native parents=%d registered scope identities=%d pure branch/role identities=%d; no current/adoption authority inferred", parents, registered, cases)
	}, activeModuleCompleteAnalysis)
}

// The baseline is the exact former construction. Its local request/string
// work is pure and exists here only to protect complete description identities.
func legacyNativeScopeRequestIdentity(parent sourceStagedOperationRequest, candidate sourceStagedMemberCandidate, descriptor bool) sourceStagedOperationRequest {
	request := stagedMemberCandidateRequest(parent, candidate)
	field := "native-input-source-request"
	if descriptor {
		field = "descriptor-callee-source-request"
	}
	request.producer.selector.field = field
	request.edge = parent.edge + ":" + field
	return request
}
