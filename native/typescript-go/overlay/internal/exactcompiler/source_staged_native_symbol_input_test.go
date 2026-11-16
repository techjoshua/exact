package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func TestStagedNativeSymbolInputOriginalSelection(t *testing.T) {
	for _, source := range []string{
		`export function invoke(){return Symbol.for('key')}`,
		`export function invoke(key:string){return Symbol.for(key)}`,
		"export function invoke(key:string){return Symbol.for(`prefix:${key}`)}",
		`export function invoke(){return Symbol.for({toString(){window.name;return 'key'}} as unknown as string)}`,
	} {
		withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, call *ast.Node) {
			facts := installationSourceFacts(query)
			declaration := enclosingCallableNode(call)
			graph, issued := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, declaration)], call, relativeDemandEffects, "symbol-input-source")
			if !issued {
				t.Fatal("original source occurrence missing")
			}
			work := callableEffectWork{extracting: -1}
			deliveries := 0
			request := sourceStagedNativeRequest{algorithmKind: sourceNativeSymbolFor, call: call, get: call.Expression(), request: graph}
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, request, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
				deliveries++
				revisions := make(map[sourceStagedOperationKey]uint64)
				extracted := make(map[sourceStagedOperationKey]bool)
				for _, state := range work.operations {
					revisions[state.key] = state.revision
					extracted[state.key] = state.delta.extracted
				}
				before := callableAnalysisFingerprint(callableAnalysis{facts: facts})
				plan, ok := describeSelectedNativeSymbolInput(selection)
				if !ok || plan.kind != sourceNativeSymbolFor || !sameOperationEndpoint(plan.input, selection.actuals[0]) || !sameOperationRequest(plan.request, nativeRootDebtRequest(&sourceStagedNativeGetSource{request: graph, get: call.Expression()}, "algorithm")) {
					t.Fatal("original Symbol input association missing")
				}
				if plan.input.expression != restrictedInvocationArguments(call.AsCallExpression())[0] {
					t.Fatal("template/formal/coercion expression replaced by key value")
				}
				if before != callableAnalysisFingerprint(callableAnalysis{facts: facts}) {
					t.Fatal("pure input helper mutated source facts")
				}
				for _, state := range work.operations {
					if state.revision != revisions[state.key] || state.delta.extracted != extracted[state.key] {
						t.Fatal("helper published native phase readiness")
					}
				}
				for _, mode := range []string{"exposure", "method", "get", "selector", "use", "cut", "extent", "input", "projection", "creation", "returning", "role", "rest", "descriptor"} {
					wrong := selection
					wrong.actuals = append([]sourceRelativeEndpoint(nil), selection.actuals...)
					switch mode {
					case "exposure":
						native := *selection.selected.native
						native.kind = sourceNativeSymbolForExposure
						wrong.selected.native = &native
					case "method":
						wrong.selected.node = declaration
					case "get":
						wrong.get = call
					case "selector":
						wrong.request.producer.selector.field = "other"
					case "use":
						wrong.request.use = nil
					case "cut":
						wrong.request.cut.reading = nil
					case "extent":
						wrong.actuals = nil
					case "input":
						wrong.actuals[0].expression = call.Expression()
					case "projection":
						wrong.actuals[0].projection = []string{"key"}
					case "creation":
						wrong.actuals[0].creation = call
					case "returning":
						wrong.actuals[0].returning = call
					case "role":
						wrong.actuals[0].role.declaration = declaration
					case "rest":
						wrong.actuals[0].restPosition = 1
					case "descriptor":
						wrong.descriptorGet = selection.actuals[0].expression
					}
					if _, accepted := describeSelectedNativeSymbolInput(wrong); accepted {
						t.Fatalf("bad %s association admitted", mode)
					}
				}
				original := plan.input
				selection.actuals[0].expression = call.Expression()
				if !sameOperationEndpoint(plan.input, original) {
					t.Fatal("plan retained borrowed actual vector")
				}
			})
			if !installed {
				t.Fatal("original Symbol selection issuer refused")
			}
			defer revoke()
			query.receiverCandidates(call, nil)
			if deliveries == 0 {
				t.Fatal("genuine Symbol.for source selection missing")
			}
		})
	}
}

// Original Get selection retains authored/unknown alternatives independently.
// A retained MAY native branch is permitted and never becomes native-only ACK.
func TestStagedNativeSymbolInputIndependentAlternatives(t *testing.T) {
	for _, row := range []struct {
		name, source      string
		authored, unknown bool
	}{
		{"shadow", `const Symbol={for(_key:string){window.name;return 1}};export function invoke(){return Symbol.for('key')}`, true, false},
		{"own replacement", `const owner={for:Symbol.for};owner.for=function replacement(_key:string){window.name;return Symbol('custom')};export function invoke(){return owner.for('key')}`, true, false},
		{"mixed", `declare const other:typeof Symbol;export function invoke(flag:boolean){return(flag?Symbol:other).for('key')}`, false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(query)
				graph, issued := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, enclosingCallableNode(call))], call, relativeDemandEffects, "symbol-alternatives-source")
				if !issued {
					t.Fatal("original occurrence missing")
				}
				work := callableEffectWork{extracting: -1}
				revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{algorithmKind: sourceNativeSymbolFor, call: call, get: call.Expression(), request: graph}, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
					if plan, ok := describeSelectedNativeSymbolInput(selection); ok && plan.kind != sourceNativeSymbolFor {
						t.Fatal("exposure upgraded to algorithm category")
					}
				})
				if !installed {
					t.Fatal("original issuer refused")
				}
				defer revoke()
				view := query.receiverWriteCandidates(call, nil)
				authored := false
				for _, value := range view.candidates.values {
					if value.node != nil && ast.IsFunctionLike(value.node) && value.node.Body() != nil {
						authored = true
					}
				}
				if row.authored && !authored {
					t.Fatal("authored source sibling lost")
				}
				if row.unknown && !view.unknown && !view.candidates.opaque && !view.candidates.receiverIncomplete {
					t.Fatal("unresolved sibling became native-only selection")
				}
			})
		})
	}
}
