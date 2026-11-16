package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The actual selected member owner lends the original reflective vector. The
// producer must leave registration, selection, binding and readiness unchanged.
func TestStagedNativeReflectiveInputsOriginalSource(t *testing.T) {
	for _, row := range []struct {
		name, source       string
		supported, pending bool
		calls, operations  int
	}{
		{"original nested input", `export function invoke(prototype:object,domain:object){const descriptors=Object.create(prototype);return Object.freeze(Object.defineProperty(descriptors,'metadata',{value:Object.freeze({domain})}))}`, true, true, 0, 1},
		{"both channels", `function makeGetter(){return()=>window.name}export function invoke(domain:object){return Object.defineProperty({},'run',{get:makeGetter(),value:Object.freeze({domain})})}`, true, false, 1, 1},
		{"direct target Call", `declare function target():object;export function invoke(){return Object.defineProperty(target(),'run',{value:1})}`, true, true, 0, 0},
		{"shorthand", `export function invoke(value:unknown){return Object.defineProperty({},'run',{value})}`, true, false, 0, 0},
		{"deferred bodies", `export function invoke(){return Object.defineProperty({},'run',{get value(){window.name;return()=>document.title},set(){document.title}})}`, true, false, 0, 0},
		{"unsupported target property", `declare const holder:{target:object};export function invoke(){return Object.defineProperty(holder.target,'run',{value:1})}`, false, false, 0, 0},
		{"computed descriptor", `export function invoke(key:string){return Object.defineProperty({},'run',{[key]:1})}`, false, false, 0, 0},
		{"spread descriptor", `export function invoke(extra:PropertyDescriptor){return Object.defineProperty({},'run',{...extra})}`, false, false, 0, 0},
		{"special prototype", `declare global{interface PropertyDescriptor{__proto__?:null}}export function invoke(){return Object.defineProperty({},'run',{__proto__:null,value:1})}`, false, false, 0, 0},
		{"unrepresented sibling", `declare function foreign():unknown;export function invoke(){return Object.defineProperty({},'run',{value:Object.freeze({}),get:foreign() as ()=>unknown})}`, false, false, 0, 0},
		{"custom child", `const local={freeze(value:object){window.name;return value}};export function invoke(){return Object.defineProperty({},'run',{value:local.freeze({})})}`, false, false, 0, 0},
		{"shadow child", `const local=Object.freeze;export function invoke(){return Object.defineProperty({},'run',{value:local({})})}`, false, false, 0, 0},
		{"unknown child", `declare const other:typeof Object;export function invoke(flag:boolean){return Object.defineProperty({},'run',{value:(flag?Object:other).freeze({})})}`, false, false, 0, 0},
		{"default source Call", `function make(value=1){return value}export function invoke(){return Object.defineProperty({},'run',{value:make()})}`, false, false, 0, 0},
		{"captured source Call", `const capture=1;function make(){return capture}export function invoke(){return Object.defineProperty({},'run',{value:make()})}`, false, false, 0, 0},
		{"object key coercion", `export function invoke(){return Object.defineProperty({},({toString(){window.name;return 'run'}} as unknown as PropertyKey),{value:1})}`, false, false, 0, 0},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(parent *sourceValueQuery, candidate *ast.Node) {
				var call *ast.Node
				walkNode(enclosingCallableNode(candidate).Body(), func(node *ast.Node) bool {
					if call == nil && ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "defineProperty" {
						call = node
					}
					return !ast.IsFunctionLike(node)
				})
				if call == nil {
					t.Fatal("missing original reflective operation")
				}
				query := newSourceDependencyQuery(call, parent.owner.checker, parent.executable, enclosingCallableNode(call))
				defer query.publishDependencyStatistics()
				facts := installationSourceFacts(query)
				caller := &facts[installationFactIndex(t, facts, enclosingCallableNode(call))]
				request := installationSourceRequest(call)
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
					plan, described := describeStagedNativeReflectiveInputs(selection, caller, query.executable)
					if described != row.supported {
						t.Fatalf("reflective inputs=%t want=%t", described, row.supported)
					}
					if before != callableAnalysisFingerprint(callableAnalysis{facts: facts}) || len(work.operations) != len(revisions) {
						t.Fatal("description published source work")
					}
					for index, state := range work.operations {
						if state.revision != revisions[index] || state.delta.extracted != extracted[index] {
							t.Fatal("description changed readiness")
						}
					}
					if !described {
						if len(plan.calls)+len(plan.operations) != 0 {
							t.Fatal("unsupported descriptor authorized partial construction")
						}
						return
					}
					if plan.targetPending != row.pending || len(plan.calls) != row.calls || len(plan.operations) != row.operations || !sameOperationRequest(plan.request, nativeRootDebtRequest(&sourceStagedNativeGetSource{request: selection.request, get: selection.get}, "eager-inputs")) {
						t.Fatal("original request, channels or target disposition lost")
					}
					previous := 0
					for _, entry := range plan.calls {
						if entry.actual != 2 || entry.property.Parent != selection.descriptorGet || entry.property.AsPropertyAssignment().Initializer != entry.invocation.operation || entry.property.Pos() < previous {
							t.Fatal("source Call property position lost")
						}
						previous = entry.property.Pos()
					}
					previous = 0
					for _, entry := range plan.operations {
						if entry.actual != 2 || entry.property.Parent != selection.descriptorGet || entry.property.AsPropertyAssignment().Initializer != entry.operation || entry.property.Pos() < previous {
							t.Fatal("native input operation property position lost")
						}
						previous = entry.property.Pos()
					}
					for index, actual := range plan.actuals {
						if !sameOperationEndpoint(actual, selection.actuals[index]) {
							t.Fatal("ordered source endpoint/cut retargeted")
						}
					}
					original := plan.actuals[0]
					selection.actuals[0].expression = selection.actuals[2].expression
					if !sameOperationEndpoint(plan.actuals[0], original) {
						t.Fatal("plan retained borrowed vector")
					}
					if _, accepted := describeStagedNativeReflectiveInputs(selection, caller, query.executable); accepted {
						t.Fatal("mismatched original vector accepted")
					}
				})
				if !installed {
					t.Fatal("original selected source owner refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				if deliveries == 0 {
					t.Fatal("original selected reflective handoff missing")
				}
			})
		})
	}
}
