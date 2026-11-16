package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These controls enter the real selected member handoff. The producer describes
// construction only and cannot publish readiness or execute deferred bodies.
func TestStagedNativeEagerInputsOriginalSource(t *testing.T) {
	for _, row := range []struct {
		name, source string
		want         bool
	}{
		{"quiet", `export function invoke(){return Object.defineProperty({},'run',{})}`, true},
		{"deferred accessor and callback", `export function invoke(){return Object.defineProperty({},'run',{get value(){window.name;throw 1},get:()=>document.title})}`, true},
		{"target setter dormant", `export function invoke(){return Reflect.defineProperty({set run(value:unknown){window.name}},'run',{value:1})}`, true},
		{"primitive key", `export function invoke(){return Object.defineProperty({},1,{value:null})}`, true},
		{"target identifier", `export function invoke(target:object){return Object.defineProperty(target,'run',{})}`, false},
		{"target Proxy", `export function invoke(){return Object.defineProperty(new Proxy({},{}),'run',{})}`, false},
		{"descriptor call", `declare function make():PropertyDescriptor;export function invoke(){return Object.defineProperty({},'run',make())}`, false},
		{"descriptor Get", `declare const holder:{descriptor:PropertyDescriptor};export function invoke(){return Object.defineProperty({},'run',holder.descriptor)}`, false},
		{"spread", `declare const extras:PropertyDescriptor;export function invoke(){return Object.defineProperty({},'run',{...extras})}`, false},
		{"computed", `export function invoke(){const key='value';return Object.defineProperty({},'run',{[key]:1})}`, false},
		{"key identifier", `export function invoke(key:PropertyKey){return Object.defineProperty({},key,{})}`, false},
		{"key object coercion", `export function invoke(){return Object.defineProperty({},({toString(){window.name;return 'run'}} as unknown as PropertyKey),{})}`, false},
		{"primitive result with read", `export function invoke(){return Object.defineProperty({},typeof window,{})}`, false},
		{"primitive result with call", `declare function effect():void;export function invoke(){return Object.defineProperty({},typeof effect(),{})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(parent *sourceValueQuery, candidate *ast.Node) {
				// Nested eager Calls can be the fixture helper's final visited node. Select
				// the original returned operation and give it its own dependency query.
				var call *ast.Node
				walkNode(enclosingCallableNode(candidate).Body(), func(node *ast.Node) bool {
					if ast.IsCallExpression(node) && node.Parent != nil && ast.IsReturnStatement(node.Parent) {
						call = node
					}
					return !ast.IsFunctionLike(node)
				})
				if call == nil {
					t.Fatal("missing original returned operation")
				}
				query := newSourceDependencyQuery(call, parent.owner.checker, parent.executable, enclosingCallableNode(call))
				defer query.publishDependencyStatistics()
				facts := installationSourceFacts(query)
				request := installationSourceRequest(call)
				work := callableEffectWork{extracting: -1}
				deliveries := 0
				revoke, ok := query.beginStagedNativeGetSource(&work, facts, request, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
					deliveries++
					revisions := make([]uint64, len(work.operations))
					extracted := make([]bool, len(work.operations))
					for index, state := range work.operations {
						revisions[index], extracted[index] = state.revision, state.delta.extracted
					}
					plan, described := describeStagedNativeEagerInputs(selection)
					if len(work.operations) != len(revisions) {
						t.Fatal("description registered operation work")
					}
					for index, state := range work.operations {
						if state.revision != revisions[index] || state.delta.extracted != extracted[index] {
							t.Fatal("description published debt readiness")
						}
					}
					if described != row.want {
						t.Fatalf("eager description=%t want=%t", described, row.want)
					}
					if !described {
						return
					}
					source := &sourceStagedNativeGetSource{request: selection.request, get: selection.get, kind: selection.selected.native.kind}
					if !validStagedNativeEagerInputs(plan, source) || !sameOperationRequest(plan.request, nativeRootDebtRequest(source, "eager-inputs")) {
						t.Fatal("independent eager root proof invalid before algorithm attachment")
					}
					source.descriptorGet = selection.descriptorGet
					if !validStagedNativeEagerInputs(plan, source) {
						t.Fatal("algorithm attachment changed eager proof")
					}
					for index, actual := range plan.actuals {
						if !sameOperationEndpoint(actual, selection.actuals[index]) {
							t.Fatal("original ordered endpoint/cut lost")
						}
					}
					for _, mode := range []string{"get", "creation", "returning", "endpoint-role", "rest"} {
						wrong := selection
						wrong.actuals = append([]sourceRelativeEndpoint(nil), selection.actuals...)
						switch mode {
						case "get":
							wrong.actuals[0].get = call
						case "creation":
							wrong.actuals[0].creation = call
						case "returning":
							wrong.actuals[0].returning = call
						case "endpoint-role":
							wrong.actuals[0].role.declaration = call
						case "rest":
							wrong.actuals[0].restPosition = 1
						}
						if _, accepted := describeStagedNativeEagerInputs(wrong); accepted {
							t.Fatalf("noncanonical %s described", mode)
						}
						wrongPlan := plan
						wrongPlan.actuals = wrong.actuals
						if validStagedNativeEagerInputs(wrongPlan, source) {
							t.Fatalf("noncanonical %s validated", mode)
						}
					}
					first := plan.actuals[0]
					selection.actuals[0].expression = selection.actuals[2].expression
					if !sameOperationEndpoint(plan.actuals[0], first) {
						t.Fatal("proof retained borrowed actual vector")
					}
					for _, mode := range []string{"cut", "role", "edge", "order", "descriptor"} {
						wrong := plan
						wrong.actuals = append([]sourceRelativeEndpoint(nil), plan.actuals...)
						other := *source
						switch mode {
						case "cut":
							wrong.actuals[0].cut.use = nil
						case "role":
							wrong.request.producer.selector.field = "callee-get"
						case "edge":
							wrong.request.edge += "wrong"
						case "order":
							wrong.actuals[0], wrong.actuals[1] = wrong.actuals[1], wrong.actuals[0]
						case "descriptor":
							other.descriptorGet = plan.actuals[0].expression
						}
						if validStagedNativeEagerInputs(wrong, &other) {
							t.Fatalf("mismatched %s accepted", mode)
						}
					}
				})
				if !ok {
					t.Fatal("original selected owner refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				if deliveries == 0 {
					t.Fatal("no original selected handoff")
				}
			})
		})
	}
}
