package exactcompiler

import (
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// The selected field Get supplies B's receiver and C's declaration-relative
// capture association. M03 D maps only the actual invoked capture. Existing
// function-summary subscribers then carry known and independent unknown donors
// to the caller, while unused callback siblings remain dormant.
func TestStagedFieldGetterInvokedFormalCapture(t *testing.T) {
	definitions := []string{
		`function browser(){return document.title}`,
		`function dormant(){return window.name}`,
		`export function invoke(fn:()=>string,unused:()=>string){return Object.defineProperty({},'run',{get value(){return fn()}})}`,
		`export function run(other:()=>string){invoke(browser,dormant);return invoke(other,dormant)}`,
	}
	definitionsByOrder := make(map[bool]string)
	for _, reverse := range []bool{false, true} {
		for _, packageType := range []string{"application", "library"} {
			source := append([]string(nil), definitions...)
			if reverse {
				for i, j := 0, len(source)-1; i < j; i, j = i+1, j-1 {
					source[i], source[j] = source[j], source[i]
				}
			}
			withSourceCalleeWriteQuery(t, strings.Join(source, "\n"), func(query *sourceValueQuery, call *ast.Node) {
				// This control issues an independent field-capture consumer below.
				// Keep cached summaries, but use the shared isolated-source harness
				// rather than importing another graph's occurrence memberships.
				facts := installationSourceFacts(query)
				declaration := enclosingCallableNode(call)
				descriptor := restrictedInvocationArguments(call.AsCallExpression())[2]
				getter := descriptor.AsObjectLiteralExpression().Properties.Nodes[0]
				request := sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: descriptor, request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, edge: "field-capture", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
				work := callableEffectWork{extracting: -1}
				revoke, ok := beginStagedNativeDescriptorSource(query, &work, facts, request)
				if !ok {
					t.Fatal("source issuer refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				work.prepareOperationUses(facts, query.executable)
				producer := work.memberNodes[getter]
				demands := facts[producer].staged.invoked
				if len(demands) != 1 || demands[0].role.kind != relativeRoleCapture {
					t.Fatalf("missing canonical captured Call requirement: %#v", demands)
				}
				if _, legacy := facts[producer].staged.legacy[demands[0].origin]; legacy {
					t.Fatal("covered capture Call retained recursive legacy preparation")
				}
				key := request.request.producer
				key.selector = sourceStagedOperationSelector{occurrence: descriptor, field: "value"}
				state := &work.operations[work.operationIDs[key].index]
				if len(state.getters) != 1 || state.getters[0].inputs == nil || !state.getters[0].bodyTransferred {
					t.Fatalf("selected Get did not consume capture-role mapping: %#v", state.getters)
				}
				edge := state.getters[0].inputs
				if len(edge.bound.bindings) != 1 {
					t.Fatal("creating caller values entered real receiver B envelope")
				}
				plan := substituteSourceRelativeInvokedInput(edge.relative, demands[0].role, nil)
				if plan.unsupported != relativeInputsSupported || len(plan.bindings) != 1 || len(plan.bindings[0].sources) != 1 || plan.bindings[0].sources[0].role != (sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: 0}) {
					t.Fatalf("wrong original declaration/formal association: %#v", plan)
				}
				if len(resolveCallableEffects(facts, query.executable)) == 0 {
					t.Fatal("captured input paid independent native/prototype/eager debt")
				}
				found := false
				for _, fact := range facts {
					document, window, unknown := false, false, false
					for _, effect := range fact.summary.EffectSources {
						document = document || effect.Environment == "browser" && effect.Description == "document"
						window = window || effect.Environment == "browser" && effect.Description == "window"
						unknown = unknown || effect.Environment == "unknown"
					}
					if fact.summary.Name == "run" {
						found = true
						if !document || window || !unknown {
							t.Fatalf("known/unknown/dormant source transport lost: %#v", fact.summary.EffectSources)
						}
					}
					if fact.node == declaration {
						if document || window {
							t.Fatal("application callback specialized native producer definition")
						}
						encoded, err := json.Marshal(fact.summary.EffectSources)
						if err != nil {
							t.Fatal(err)
						}
						if packageType == "application" {
							definitionsByOrder[reverse] = string(encoded)
						} else if definitionsByOrder[reverse] != string(encoded) {
							t.Fatal("public definition EffectSources depend on application/library context")
						}
					}
				}
				if !found {
					t.Fatal("missing real caller summary")
				}
			}, packageType)
		}
	}
}

// A reassigned formal still needs its completed capture/write producer. The
// relative read must not be reduced to its initial argument or closed unknown.
func TestStagedFieldGetterWrittenCaptureRemainsPending(t *testing.T) {
	withSourceCalleeWriteQueryStatus(t, `function browser(){return document.title}function quiet(){return 'safe'}export function invoke(fn:()=>string){fn=quiet;return Object.defineProperty({},'run',{get value(){return fn()}})}`, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		declaration := enclosingCallableNode(call)
		descriptor := restrictedInvocationArguments(call.AsCallExpression())[2]
		// This is a pending-source producer control. The strict public/terminal
		// compile tests retain their own analysis completion requirements.
		getter := descriptor.AsObjectLiteralExpression().Properties.Nodes[0]
		read := getter.Body().AsBlock().Statements.Nodes[0].AsReturnStatement().Expression.Expression()
		symbol := query.owner.checker.GetSymbolAtLocation(read)
		if symbol == nil || symbol.ValueDeclaration == nil || !query.owner.bindingWritten(symbol) {
			t.Fatal("original reassigned formal not found")
		}
		role := sourceRelativeRole{kind: relativeRoleCapture, declaration: getter, binding: symbol.ValueDeclaration}
		if _, mapped := fieldGetterCaptureFormal(role, declaration, query.executable); mapped {
			t.Fatal("written formal gained immutable-formal substitution")
		}
		if _, mapped := describeStagedCapturedBinding(read, getter, query.executable); mapped {
			t.Fatal("written formal gained declaration-relative read SOURCE without its writer")
		}
		request := sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: descriptor, request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, edge: "written-field-capture", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
		work := callableEffectWork{extracting: -1}
		revoke, ok := beginStagedNativeDescriptorSource(query, &work, facts, request)
		if !ok {
			t.Fatal("source issuer refused")
		}
		defer revoke()
		query.receiverCandidates(call, nil)
		work.prepareOperationUses(facts, query.executable)
		key := request.request.producer
		key.selector = sourceStagedOperationSelector{occurrence: descriptor, field: "value"}
		state := &work.operations[work.operationIDs[key].index]
		if len(state.getters) != 1 || state.getters[0].inputs == nil || state.getters[0].bodyTransferred || work.closedOperationDependencies()[work.operationIDs[key].index] {
			t.Fatal("written capture acquired initial-formal or completion authority")
		}
	}, true)
}
