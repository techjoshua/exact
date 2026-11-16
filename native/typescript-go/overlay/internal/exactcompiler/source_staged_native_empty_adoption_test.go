package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original direct source publisher adopts the three pending phase tickets
// before invoking this same production descriptor consumer. Registration of an
// empty algorithm must not prevent its actual selected owner's atomic admission.
// This checks membership/publication only; it grants no target/current/closure.
func TestStagedNativeDescriptorAdoptedEmptyOriginalAdmission(t *testing.T) {
	const source = `export function invoke(){return Object.defineProperty({},'value',{})}`
	withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
		var call *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) {
				call = node
			}
			return true
		})
		if call == nil {
			t.Fatal("original source Call absent")
		}
		facts := stagedReturnSourceFacts(file)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		caller, known := work.memberNodes[enclosingCallableNode(call)]
		if !known {
			t.Fatal("original source owner absent")
		}
		original, owned := stagedNativeInputOccurrenceRequest(&facts[caller], call)
		if !owned {
			t.Fatal("original source request absent")
		}
		actuals := restrictedInvocationArguments(call.AsCallExpression())
		if len(actuals) != 3 {
			t.Fatal("original source vector absent")
		}
		request := sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: actuals[2], request: original}
		admissions, emptyWitness, publishedWitness := 0, false, false
		var heldAdmission func(sourceStagedNativeDescriptorPlan) bool
		var heldPlan sourceStagedNativeDescriptorPlan
		var algorithm sourceStagedOperationKey
		drive := func() {
			query := newSourceDependencyQuery(call, owner.checker, owner, facts[caller].node)
			defer query.publishDependencyStatistics()
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, request, func(selection sourceStagedNativeSelection, admit func(sourceStagedNativeDescriptorPlan) bool) {
				root := work.operationRecipes[selection.request.producer].nativeGet
				if root == nil {
					t.Fatal("genuine selected root absent")
				}
				algorithm = nativeRootDebtRequest(root, "algorithm").producer
				id, adopted := work.operationIDs[algorithm]
				if !adopted || id.index == 0 {
					t.Fatal("original adopted algorithm positive UNREACHED")
				}
				before := work.operationRecipes[algorithm]
				state := &work.operations[id.index]
				if admissions == 0 {
					if !state.dependenciesRegistered || before.delta.extracted || operationDeltaSize(before.delta) != 0 || state.revision != 0 {
						t.Fatal("original adopted EMPTY/unextracted/rev0 witness UNREACHED")
					}
					emptyWitness = true
				} else {
					if !state.dependenciesRegistered || state.revision == 0 || !state.delta.extracted {
						t.Fatal("actual published algorithm witness UNREACHED")
					}
					publishedWitness = true
				}
				count := admissions
				consumeStagedNativeDescriptorAlgorithm(selection, func(plan sourceStagedNativeDescriptorPlan) bool {
					if !admit(plan) {
						t.Fatal("genuine selected empty-ticket admission refused")
					}
					admissions++
					current := work.operationRecipes[algorithm]
					if current.nativeGet == nil || current.nativeGet.descriptorGet != actuals[2] || current.nativeGet.installation == nil || current.delta.extracted || len(current.delta.required) != 6 {
						t.Fatal("actual atomic six-field/source admission UNREACHED")
					}
					for i, required := range current.delta.required {
						expected := selection.request
						expected.producer.selector = sourceStagedOperationSelector{occurrence: actuals[2], field: reflectiveDescriptorKeys[i]}
						child, exists := work.operationIDs[required.producer]
						if !sameOperationRequest(required, expected) || !exists || child.index == 0 {
							t.Fatal("field not registered before admission returned")
						}
						field := work.operationRecipes[required.producer]
						if len(field.delta.required) != 2 || field.delta.extracted || work.operations[child.index].subscribers[sourceStagedOperationConsumer{required.consumer, required.edge}] == nil {
							t.Fatal("field/source factory membership absent or syntax paid field")
						}
					}
					// All refusals follow the genuine selected/empty-ticket positive.
					savedRevision := work.operations[id.index].revision
					bad := plan
					bad.eager.key.selector.field = "foreign-algorithm"
					if admit(bad) {
						t.Fatal("foreign phase acquired original admission")
					}
					bad = plan
					bad.fields[0].request.cut.initializing = call
					if admit(bad) {
						t.Fatal("foreign physical field cut acquired admission")
					}
					bad = plan
					bad.eager.delta.required = nil
					if admit(bad) {
						t.Fatal("missing original field population acquired admission")
					}
					if !admit(plan) || work.operations[id.index].revision != savedRevision {
						t.Fatal("idempotent authentic admission changed publication")
					}
					heldAdmission, heldPlan = admit, plan
					return true
				})
				if admissions != count+1 {
					t.Fatal("original descriptor consumer not reached")
				}
			})
			if !installed {
				t.Fatal("original direct member-owner entry refused")
			}
			defer revoke()
			query.receiverCandidates(call, nil)
			revoke()
			if heldAdmission == nil || heldAdmission(heldPlan) {
				t.Fatal("retained/copied description revived expired admission interval")
			}
		}
		// The maintained callee-only owner may run before an algorithm consumer.
		// Enter its SAME source publisher without the descriptor consumer. This
		// creates genuine selected source/Get factories but no descriptor plan;
		// the later selected drive then encounters an existing adopted root.
		func() {
			query := newSourceDependencyQuery(call, owner.checker, owner, facts[caller].node)
			defer query.publishDependencyStatistics()
			getRequest := request
			getRequest.descriptorGet = nil
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, getRequest)
			if !installed {
				t.Fatal("original Get-only source owner unavailable")
			}
			defer revoke()
			query.receiverCandidates(call, nil)
			source := work.operationRecipes[original.producer].nativeGet
			if source == nil || source.kind != sourceNativeObjectDefineProperty || query.stagedNativeGet == nil || !query.stagedNativeGet.sourceObserved {
				t.Fatal("genuine preceding Get-only source event UNREACHED")
			}
			algorithm := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer]
			if algorithm.nativeGet == nil || algorithm.nativeGet.descriptorGet != nil || algorithm.delta.extracted || operationDeltaSize(algorithm.delta) != 0 {
				t.Fatal("Get-only source supplied descriptor algorithm semantics")
			}
		}()
		drive()
		if !emptyWitness || admissions != 1 {
			t.Fatal("adopted-empty positive UNREACHED")
		}
		work.prepareOperationUses(facts, owner)
		id := work.operationIDs[algorithm]
		if id.index == 0 || work.operations[id.index].revision == 0 || !work.operations[id.index].delta.extracted {
			t.Fatal("original algorithm local publication UNREACHED")
		}
		// A fresh genuine original Get may reaffirm its SAME immutable six-field
		// description, while foreign/missing prefixes remain refused after publication.
		drive()
		if !publishedWitness || admissions != 2 {
			t.Fatal("actual published/idempotent admission controls UNREACHED")
		}
	})
}
