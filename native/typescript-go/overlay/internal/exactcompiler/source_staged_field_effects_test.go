package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The field Effects request is issued by the registered native source producer.
// Its consumer requests canonical getter declarations without a normal frame or
// value query. Receiver/member selection and body transfer remain pending.
func TestStagedFieldEffectsIssuanceSourceRequirements(t *testing.T) {
	for _, row := range []struct {
		name, source   string
		getter, formal bool
	}{
		{"getter", `export function invoke(){return Object.defineProperty({},'run',{get value():never{window.name;throw 1}})}`, true, false},
		{"computed getter", `const field:string=Math.random()?"value":"other";export function invoke(){return Object.defineProperty({},'run',{enumerable:true,get [field]():never{window.name;throw 1}})}`, true, false},
		{"stored callback", `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, false, false},
		{"unobserved formal", `export function invoke(this:unknown,descriptor:PropertyDescriptor){return Object.defineProperty({},'run',descriptor)}`, false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(query)
				declaration := enclosingCallableNode(call)
				request := sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: restrictedInvocationArguments(call.AsCallExpression())[2], request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, edge: "source-field-effects", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
				work := callableEffectWork{extracting: -1}
				revoke, ok := beginStagedNativeDescriptorSource(query, &work, facts, request)
				if !ok {
					t.Fatal("native source issuer refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				if query.inputs != nil || query.operation != nil {
					t.Fatal("source issuer installed a normal frame")
				}
				before := query.executable.values.work
				for index := 1; index < len(work.operations); index++ {
					work.prepareFieldGetterRequirements(facts, sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}, query.executable)
				}
				if query.inputs != nil || query.operation != nil || query.executable.values.work != before {
					t.Fatal("field Effects consumption entered value/callee acquisition")
				}
				key := request.request.producer
				key.selector = sourceStagedOperationSelector{occurrence: request.descriptorGet, field: "value"}
				id, found := work.operationIDs[key]
				if !found {
					t.Fatal("missing actual source field request")
				}
				state := &work.operations[id.index]
				if state.effectsDemand == nil || state.effectsDemand.request.producer != key || state.effectsDemand.producer.epoch != work.operationEpoch {
					t.Fatal("unowned field Effects request")
				}
				if row.formal {
					role := state.effectsDemand.receiver.role
					if state.effectsDemand.receiver.kind != relativeEndpointRole || role.kind != relativeRoleFormal || role.declaration != declaration || role.slot != 0 || state.getterRequirementsRegistered {
						t.Fatal("definition formal specialized or treated as covered empty")
					}
				}
				if (len(state.getters) != 0) != row.getter {
					t.Fatalf("getter requirement/dormancy mismatch: %#v", state.getters)
				}
				for _, getter := range state.getters {
					target := work.memberNodes[getter.declaration]
					consumer := work.memberNodes[declaration]
					dependency := work.stagedRequired[sourceStagedDependencyKey{consumer: consumer, edge: getter.edge}]
					if dependency == nil || dependency.producer != target || dependency.operation != call || dependency.consumed != 0 || !getter.receiverPending || !getter.selectionPending || getter.bodyTransferred || !getter.bodyReady {
						t.Fatal("known getter requirement conflated with receiver/selection/body delivery")
					}
					known := false
					for _, effect := range facts[target].summary.EffectSources {
						known = known || effect.Environment == "browser" && effect.Description == "window"
					}
					if !known {
						t.Fatal("required source getter lost known window donor")
					}
					for _, edge := range facts[consumer].summary.Calls {
						if edge.ID == getter.edge {
							t.Fatal("requesting getter summary activated body effects")
						}
					}
				}
				if state.delta.extracted || state.revision != 0 || work.closedOperationDependencies()[id.index] {
					t.Fatal("required/pending field declared covered")
				}
				beforeRequirements := len(work.stagedRequired)
				for index := 1; index < len(work.operations); index++ {
					work.prepareFieldGetterRequirements(facts, sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}, query.executable)
				}
				if len(work.stagedRequired) != beforeRequirements || len(work.operations[id.index].getters) != len(state.getters) {
					t.Fatal("identical source demand duplicated requirements")
				}
			})
		})
	}
}
