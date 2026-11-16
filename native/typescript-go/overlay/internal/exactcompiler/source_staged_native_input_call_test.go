package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These written source controls require central's one-input selected dispatch.
// No selected value is supplied by the test. Input evaluation belongs to its
// independent owner even when the algorithm relationship is describable.
func TestStagedNativeInputCallOriginalFreezeSelection(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"literal", `export function invoke(){return Object.freeze({value:1})}`},
		{"shorthand domain", `export function invoke(){const domain='local';return Object.freeze({domain})}`},
		{"dormant accessors and callback", `export function invoke(){return Object.freeze({get value(){window.name;return 1},callback:()=>document.title})}`},
		{"computed creation", `export function invoke(){const key='value';return Object.freeze({[key]:1})}`},
		{"spread creation", `export function invoke(domain:object){return Object.freeze({...domain})}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(query)
				declaration := enclosingCallableNode(call)
				graph := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, use: call, edge: "freeze-input-source", cut: sourceRelativeCut{operation: call, use: call, reading: call}}
				request := sourceStagedNativeRequest{call: call, get: call.Expression(), request: graph}
				work := callableEffectWork{extracting: -1}
				deliveries := 0
				revoke, installed := query.beginStagedNativeGetSource(&work, facts, request, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
					deliveries++
					before := callableAnalysisFingerprint(callableAnalysis{facts: facts})
					plan, described := describeSelectedNativeInputCall(selection)
					if !described || plan.kind != sourceNativeObjectFreeze || !sameOperationEndpoint(plan.input, selection.actuals[0]) || !sameOperationRequest(plan.request, nativeRootDebtRequest(&sourceStagedNativeGetSource{request: graph, get: call.Expression()}, "algorithm")) {
						t.Fatal("selected freeze original input association missing")
					}
					if before != callableAnalysisFingerprint(callableAnalysis{facts: facts}) {
						t.Fatal("input description mutated source facts")
					}
					for _, mode := range []string{"cut", "get-metadata", "creation", "role", "projection", "kind", "method", "path", "rest", "returning", "extent", "input"} {
						wrong := selection
						wrong.actuals = append([]sourceRelativeEndpoint(nil), selection.actuals...)
						switch mode {
						case "cut":
							wrong.request.cut.use = nil
						case "get-metadata":
							wrong.actuals[0].get = call
						case "creation":
							wrong.actuals[0].creation = call
						case "role":
							wrong.actuals[0].role.declaration = declaration
						case "projection":
							wrong.actuals[0].projection = []string{"value"}
						case "kind":
							native := *selection.selected.native
							native.kind = sourceNativeObjectCreateExposure
							wrong.selected.native = &native
						case "method":
							wrong.selected.node = declaration
						case "path":
							wrong.selected.path = []string{"value"}
						case "rest":
							wrong.actuals[0].restPosition = 1
						case "returning":
							wrong.actuals[0].returning = call
						case "extent":
							wrong.actuals = nil
						case "input":
							wrong.actuals[0].expression = call.Expression()
						}
						if _, accepted := describeSelectedNativeInputCall(wrong); accepted {
							t.Fatalf("unsupported %s described freeze association", mode)
						}
					}
					original := plan.input
					selection.actuals[0].expression = call.Expression()
					if !sameOperationEndpoint(plan.input, original) {
						t.Fatal("plan retained borrowed input vector")
					}
				})
				if !installed {
					t.Fatal("original member issuer refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				if deliveries == 0 {
					t.Fatal("one-input original selected dispatch missing")
				}
				for _, effect := range facts[installationFactIndex(t, facts, declaration)].summary.EffectSources {
					if effect.Environment == "browser" && (effect.Description == "window" || effect.Description == "document") {
						t.Fatal("freeze algorithm description invoked stored accessor or callback")
					}
				}
			})
		})
	}
}

// Authored and unknown siblings retain their ordinary original Get owners.
// A possible native branch never licenses exclusive/native-only completion.
func TestStagedNativeInputCallIndependentAlternatives(t *testing.T) {
	for _, row := range []struct {
		name, source string
		authored     bool
	}{
		{"shadow", `const Object={freeze<T>(value:T){window.name;return value}};export function invoke(){return Object.freeze({value:()=>document.title})}`, true},
		{"own authored", `const owner={freeze:Object.freeze};owner.freeze=function replacement<T>(value:T):Readonly<T>{window.name;return value};export function invoke(){return owner.freeze({value:()=>document.title})}`, true},
		{"unknown mixed", `declare const other:typeof Object;export function invoke(flag:boolean){return(flag?Object:other).freeze({value:()=>document.title})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				result := query.receiverWriteCandidates(call, nil)
				authored, unknown := false, result.candidates.opaque || result.candidates.valueIncomplete || result.candidates.receiverIncomplete
				for _, value := range result.candidates.values {
					authored = authored || value.native == nil && value.node != nil && ast.IsFunctionLike(value.node)
					unknown = unknown || value.native == nil && value.node == nil
				}
				if row.authored && !authored {
					t.Fatal("original authored alternative erased")
				}
				if !row.authored && !unknown && len(result.candidates.values) < 2 {
					t.Fatal("mixed original selection became exclusive native proof")
				}
			})
		})
	}
}
