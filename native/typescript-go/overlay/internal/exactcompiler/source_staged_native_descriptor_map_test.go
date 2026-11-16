package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Real original selection must supply the two-input map algorithm. These
// controls require the shared per-occurrence dispatch, not a fabricated seed.
// Describing an empty or dynamic map grants no ownKeys/entry disposition.
func TestStagedNativeDescriptorMapOriginalSelection(t *testing.T) {
	for _, source := range []string{
		`export function invoke(){return Object.defineProperties({},{})}`,
		`export function invoke(target:object,descriptors:PropertyDescriptorMap){return Object.defineProperties(target,descriptors)}`,
		`const key=Symbol.for('tag');export function invoke(execute:()=>unknown){return Object.defineProperties({},{[key]:{value:execute}})}`,
		`export function invoke(){return Object.defineProperties({},{get run(){window.name;return{value:()=>document.title}}})}`,
	} {
		withSourceCalleeWriteQueryStatus(t, source, func(query *sourceValueQuery, call *ast.Node) {
			facts := installationSourceFacts(query)
			declaration := enclosingCallableNode(call)
			fact := &facts[installationFactIndex(t, facts, declaration)]
			graph, issued := sourceStagedOccurrenceRequest(fact, call, relativeDemandEffects, "descriptor-map-source")
			if !issued {
				t.Fatal("original occurrence issuer refused map request")
			}
			request := sourceStagedNativeRequest{algorithmKind: sourceNativeObjectDefineProperties, call: call, get: call.Expression(), request: graph}
			work := callableEffectWork{extracting: -1}
			deliveries := 0
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, request, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
				deliveries++
				before := callableAnalysisFingerprint(callableAnalysis{facts: facts})
				revisions := make([]uint64, len(work.operations))
				extracted := make([]bool, len(work.operations))
				for index, state := range work.operations {
					revisions[index], extracted[index] = state.revision, state.delta.extracted
				}
				plan, described := describeSelectedNativeDescriptorMap(selection)
				if !described || !sameOperationEndpoint(plan.target, selection.actuals[0]) || !sameOperationEndpoint(plan.descriptors, selection.actuals[1]) {
					t.Fatal("original ordered target/map association missing")
				}
				expected := graph
				expected.producer.selector = sourceStagedOperationSelector{occurrence: selection.actuals[1].expression, field: "descriptor-map"}
				expected.edge += ":descriptor-map"
				if !sameOperationRequest(plan.protocol, expected) || !sameOperationRequest(plan.algorithm, nativeRootDebtRequest(&sourceStagedNativeGetSource{request: graph, get: call.Expression()}, "algorithm")) {
					t.Fatal("algorithm/map requests lost original occurrence/use/cut/consumer")
				}
				if before != callableAnalysisFingerprint(callableAnalysis{facts: facts}) || len(work.operations) != len(revisions) {
					t.Fatal("map description published work or interpreted entries")
				}
				for index, state := range work.operations {
					if state.revision != revisions[index] || state.delta.extracted != extracted[index] {
						t.Fatal("map description granted readiness")
					}
				}
				for _, mode := range []string{"order", "cut", "extent", "get", "creation", "role", "rest", "method", "kind"} {
					wrong := selection
					wrong.actuals = append([]sourceRelativeEndpoint(nil), selection.actuals...)
					switch mode {
					case "order":
						wrong.actuals[0], wrong.actuals[1] = wrong.actuals[1], wrong.actuals[0]
					case "cut":
						wrong.request.cut.reading = nil
					case "extent":
						wrong.actuals = wrong.actuals[:1]
					case "get":
						wrong.actuals[1].get = call
					case "creation":
						wrong.actuals[1].creation = call
					case "role":
						wrong.actuals[1].role.declaration = declaration
					case "rest":
						wrong.actuals[1].restPosition = 1
					case "method":
						wrong.selected.node = declaration
					case "kind":
						native := *selection.selected.native
						native.kind = sourceNativeObjectDefineProperty
						wrong.selected.native = &native
					}
					if _, accepted := describeSelectedNativeDescriptorMap(wrong); accepted {
						t.Fatal("mismatched map metadata accepted", mode)
					}
				}
				original := plan.descriptors
				selection.actuals[1].expression = selection.actuals[0].expression
				if !sameOperationEndpoint(plan.descriptors, original) {
					t.Fatal("map plan retained borrowed input vector")
				}
			})
			if !installed {
				t.Fatal("original selected member issuer refused")
			}
			defer revoke()
			query.receiverCandidates(call, nil)
			if deliveries == 0 {
				t.Fatal("two-input selected map dispatch not connected")
			}
		}, true)
	}
}

// The existing standard-member acquisition owns algorithm identity, including
// saved acquisition. It must preserve authored/unknown siblings independently.
func TestStagedNativeDescriptorMapAcquisition(t *testing.T) {
	for _, row := range []struct {
		name, source            string
		native, authored, mixed bool
	}{
		{"genuine", `export function invoke(){return Object.defineProperties({},{})}`, true, false, false},
		{"saved native", `const define=Object.defineProperties;export function invoke(){return define({},{})}`, true, false, false},
		{"shadow", `const Object={defineProperties<T>(target:T,_map:PropertyDescriptorMap){window.name;return target}};export function invoke(){return Object.defineProperties({},{})}`, false, true, false},
		{"own override", `const owner={defineProperties:Object.defineProperties};owner.defineProperties=function replacement<T>(target:T,_map:PropertyDescriptorMap){window.name;return target};export function invoke(){return owner.defineProperties({},{})}`, false, true, false},
		{"unknown mixed", `declare const other:typeof Object;export function invoke(flag:boolean){return(flag?Object:other).defineProperties({},{})}`, false, false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQueryStatus(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				result := query.receiverWriteCandidates(call, nil)
				native, authored := false, false
				for _, value := range result.candidates.values {
					native = native || value.native != nil && value.native.kind == sourceNativeObjectDefineProperties
					authored = authored || value.native == nil && value.node != nil && ast.IsFunctionLike(value.node)
				}
				if row.native && !native {
					t.Fatal("actual genuine acquisition lost algorithm category")
				}
				if row.authored && !authored {
					t.Fatal("authored override lost its original alternative")
				}
				if row.mixed && !result.candidates.opaque && !result.candidates.valueIncomplete && !result.candidates.receiverIncomplete && len(result.candidates.values) < 2 {
					t.Fatal("unknown sibling became exclusive native selection")
				}
				if nativeInvocable(sourceNativeObjectDefineProperties) || reflectiveNative(sourceNativeObjectDefineProperties) {
					t.Fatal("map category entered legacy strong three-input conversion")
				}
			}, true)
		})
	}
}

// Independent declarators retain their actual module initializer boundaries.
// Ownership issues a graph request, never execution of another initializer or
// of the descriptor callback stored by this source occurrence.
func TestStagedNativeDescriptorMapModuleOccurrence(t *testing.T) {
	const source = `const first=Object.defineProperties({},{}),sibling=Object.defineProperties({},{run:{value:()=>document.title}});export function invoke(){return Object.freeze(first)}`
	withSourceCalleeWriteQuery(t, source, func(parent *sourceValueQuery, anchor *ast.Node) {
		facts := installationSourceFacts(parent)
		sourceFile := ast.GetSourceFileOfNode(anchor)
		var calls []*ast.Node
		walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && enclosingCallableNode(node) == nil && ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "defineProperties" {
				calls = append(calls, node)
			}
			return true
		})
		if len(calls) != 2 {
			t.Fatal("missing original module map operations")
		}
		for index, call := range calls {
			module := sourceStagedModuleOwner(call)
			if module == nil || !ast.IsVariableDeclaration(module) {
				t.Fatal("module declarator partition missing")
			}
			fact := &facts[installationFactIndex(t, facts, module)]
			graph, issued := sourceStagedOccurrenceRequest(fact, call, relativeDemandEffects, "module-map:"+module.Name().Text())
			if !issued || graph.producer.declaration != module || graph.consumer != module || graph.use != call || graph.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) {
				t.Fatal("map occurrence retargeted to another module owner")
			}
			if _, issued := sourceStagedOccurrenceRequest(fact, calls[(index+1)%len(calls)], relativeDemandEffects, "wrong-partition"); issued {
				t.Fatal("sibling initializer inherited source ownership")
			}
			query := newSourceDependencyQuery(call, parent.owner.checker, parent.executable, module)
			defer query.publishDependencyStatistics()
			work := callableEffectWork{extracting: -1}
			deliveries := 0
			request := sourceStagedNativeRequest{algorithmKind: sourceNativeObjectDefineProperties, call: call, get: call.Expression(), request: graph}
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, request, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
				deliveries++
				before := callableAnalysisFingerprint(callableAnalysis{facts: facts})
				plan, described := describeSelectedNativeDescriptorMap(selection)
				if !described || plan.algorithm.producer.declaration != module || plan.protocol.consumer != module || plan.algorithm.producer.operation != call || plan.protocol.use != call || plan.protocol.cut != graph.cut || plan.protocol.producer.selector.occurrence != restrictedInvocationArguments(call.AsCallExpression())[1] {
					t.Fatal("module map plan lost original source occurrence")
				}
				if before != callableAnalysisFingerprint(callableAnalysis{facts: facts}) {
					t.Fatal("module map description invoked initializer or published work")
				}
			})
			if !installed {
				t.Fatal("original module member issuer refused")
			}
			defer revoke()
			query.receiverCandidates(call, nil)
			revoke()
			if deliveries == 0 {
				t.Fatal("original module selected map handoff missing")
			}
		}
	})
}
