package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This drives the original source member owner, not a manually delivered seed.
// Required queue membership must exist at its pre-inventory publication point.
// The still-unconnected algorithm/eager/Get dispositions cannot become coverage.
func TestStagedNativeGetSourceRegistersBeforeInventory(t *testing.T) {
	for _, row := range []struct {
		name, source string
		registered   bool
	}{
		{"genuine", `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, true},
		{"shadow", `const Object={defineProperty(...values:unknown[]){window.name;return values}};export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, false},
		{"ordinary own override", `const owner={defineProperty:Object.defineProperty};owner.defineProperty=function replacement<T>(target:T,key:PropertyKey,descriptor:PropertyDescriptor):T{window.name;return target};export function invoke(){return owner.defineProperty({},'run',{value:()=>document.title})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(query)
				declaration := enclosingCallableNode(call)
				request := sourceStagedNativeRequest{call: call, get: call.Expression(), request: sourceStagedOperationRequest{
					producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, use: call, edge: "native-source-witness", cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
				work := callableEffectWork{extracting: -1}
				revoke, ok := query.beginStagedNativeGetSource(&work, facts, request)
				if !ok {
					t.Fatal("source issuer refused")
				}
				defer revoke()
				borrow := query.stagedNativeGet
				original := borrow.publish
				beforeInventory := false
				borrow.publish = func(q *sourceValueQuery, get *sourceGetInputs, standard *sourceValue, projection []string, name string, bindings sourceValueBindings) {
					original(q, get, standard, projection, name, bindings)
					id, exists := work.operationIDs[request.request.producer]
					if !exists {
						return
					}
					if id.index == 0 || len(work.operations) != 5 || len(work.extractionQueue) != 4 {
						t.Fatal("not all original debts were registered before member inventory")
					}
					root := work.operationRecipes[request.request.producer]
					if len(root.delta.required) != 3 {
						t.Fatal("lost independent callee, eager or algorithm prerequisite")
					}
					for _, debt := range root.delta.required {
						child, exists := work.operationIDs[debt.producer]
						if !exists || work.operations[child.index].subscribers[sourceStagedOperationConsumer{debt.consumer, debt.edge}] == nil {
							t.Fatal("missing required subscriber at source publication")
						}
					}
					beforeInventory = true
				}
				copied := *query
				copied.receiverCandidates(call, nil)
				if len(work.operationIDs) != 0 || len(work.operations) != 1 || len(work.extractionQueue) != 0 {
					t.Fatal("query copy inherited original Get issuer")
				}
				acquired := query.receiverCandidates(call, nil)
				if beforeInventory != row.registered {
					t.Fatalf("source registration=%t want=%t", beforeInventory, row.registered)
				}
				if row.name == "ordinary own override" {
					found := false
					for _, value := range acquired.values {
						found = found || value.node != nil && ast.IsFunctionLike(value.node) && callableNameText(value.node.Name()) == "replacement"
					}
					if !found {
						t.Fatal("own authored replacement lost")
					}
				}
				if !row.registered {
					return
				}
				work.prepareOperationUses(facts, query.executable)
				root := work.operationIDs[request.request.producer]
				if work.closedOperationDependencies()[root.index] {
					t.Fatal("conditional standard alternative paid unresolved source debts")
				}
				for _, debt := range work.operationRecipes[request.request.producer].delta.required {
					state := work.operations[work.operationIDs[debt.producer].index]
					if debt.producer.selector.field == "callee-get" {
						if state.revision == 0 || !state.delta.extracted || state.nativeCallee == nil || !validStagedNativeCalleeEffects(*state.nativeCallee, work.operationRecipes[debt.producer].nativeGet) {
							t.Fatal("original completed Get did not supply its independent source proof")
						}
					} else if sameOperationRequest(debt, work.operationRecipes[request.request.producer].nativeGet.callAlternatives) {
						// The actual completed Get also issued this independent
						// population; queue membership alone did not extract it.
						population := work.operationRecipes[debt.producer]
						if !validStagedMemberCallRecipe(population) || !population.delta.extracted || !state.memberCoverageObserved || work.memberCoverageObserved[debt.producer] != work.operationGeneration {
							t.Fatal("original Get population lacks current source observation")
						}
					} else if state.revision != 0 || state.delta.extracted {
						t.Fatal("pending source requirement auto-extracted from queue membership")
					}
				}
				revoke()
				beforeInventory = false
				query.receiverCandidates(call, nil)
				if beforeInventory || query.stagedNativeGet != nil {
					t.Fatal("expired Get issuer published")
				}
			})
		})
	}
}
