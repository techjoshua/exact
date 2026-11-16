package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Real selected source supplies the outer vector. Describing initializer work
// must leave actual binding, summary subscriptions and publication with central.
func TestStagedNativeEagerCallsOriginalSource(t *testing.T) {
	for _, row := range []struct {
		name, source string
		count        int
	}{
		{"body effects and dormant return", `declare function foreign():void;function makeValue(){window.name;foreign();return()=>document.title}export function invoke(){return Object.defineProperty({},'run',{value:makeValue()})}`, 1},
		{"property order", `function makeValue(){window.name;return 1}function makeFlag(){window.name;return true}export function invoke(){return Object.defineProperty({},'run',{value:makeValue(),enumerable:makeFlag()})}`, 2},
		{"throwing initializer", `function makeValue():never{window.name;throw 1}export function invoke(){return Object.defineProperty({},'run',{value:makeValue()})}`, 1},
		{"inert only", `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, 0},
		{"default", `function makeValue(value=1){return value}export function invoke(){return Object.defineProperty({},'run',{value:makeValue()})}`, 0},
		{"rest", `function makeValue(...values:number[]){return values}export function invoke(){return Object.defineProperty({},'run',{value:makeValue()})}`, 0},
		{"actual", `function makeValue(value:number){return value}export function invoke(){return Object.defineProperty({},'run',{value:makeValue(1)})}`, 0},
		{"capture", `const captured=1;function makeValue(){return captured}export function invoke(){return Object.defineProperty({},'run',{value:makeValue()})}`, 0},
		{"receiver", `function makeValue(this:object){return this}export function invoke(){return Object.defineProperty({},'run',{value:makeValue.call({})})}`, 0},
		{"nested effectful creation", `function makeValue(){return 1}export function invoke(){return Object.defineProperty({},'run',{value:{nested:makeValue()}})}`, 0},
		{"computed", `function makeValue(){return 1}export function invoke(){const key='value';return Object.defineProperty({},'run',{[key]:makeValue()})}`, 0},
		{"spread", `function makeValue(){return 1}export function invoke(extra:PropertyDescriptor){return Object.defineProperty({},'run',{...extra,value:makeValue()})}`, 0},
		{"special prototype", `declare global{interface PropertyDescriptor{__proto__?:null}}function makeValue(){return 1}export function invoke(){return Object.defineProperty({},'run',{__proto__:null,value:makeValue()})}`, 0},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(parent *sourceValueQuery, candidate *ast.Node) {
				var call *ast.Node
				walkNode(enclosingCallableNode(candidate).Body(), func(node *ast.Node) bool {
					if ast.IsCallExpression(node) && node.Parent != nil && ast.IsReturnStatement(node.Parent) {
						call = node
					}
					return !ast.IsFunctionLike(node)
				})
				if call == nil {
					t.Fatal("missing outer source operation")
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
					plan, described := describeStagedNativeEagerCallInputs(selection, caller, query.executable)
					if before != callableAnalysisFingerprint(callableAnalysis{facts: facts}) {
						t.Fatal("description mutated source facts or published work")
					}
					if described != (row.count != 0) {
						t.Fatalf("description=%t wantCalls=%d", described, row.count)
					}
					if !described {
						return
					}
					if len(plan.calls) != row.count || !sameOperationRequest(plan.request, nativeRootDebtRequest(&sourceStagedNativeGetSource{request: selection.request, get: selection.get}, "eager-inputs")) {
						t.Fatal("original eager request or source Call population lost")
					}
					previous := 0
					for _, entry := range plan.calls {
						invocation := entry.invocation
						if entry.actual != 2 || entry.property.Parent != selection.descriptorGet || !ast.IsPropertyAssignment(entry.property) || entry.property.AsPropertyAssignment().Initializer != invocation.operation || entry.property.Pos() < previous || invocation.declaration == nil || !invocation.actualsKnown || len(invocation.actuals)+len(invocation.captures) != 0 || invocation.cut != (sourceRelativeCut{operation: invocation.operation, use: invocation.operation, reading: invocation.operation}) {
							t.Fatal("initializer occurrence/order/original invocation description lost")
						}
						previous = entry.property.Pos()
						if _, gap := stageDeclarationCall(caller, invocation.operation, query.owner.checker, query.executable); gap != stagedCallValueConsumer {
							t.Fatal("shared ordinary collector terminal-use restriction changed")
						}
					}
					for index, actual := range plan.actuals {
						if !sameOperationEndpoint(actual, selection.actuals[index]) {
							t.Fatal("outer ordered endpoint/cut changed")
						}
					}
					original := plan.actuals[2]
					selection.actuals[2].expression = selection.actuals[0].expression
					if !sameOperationEndpoint(plan.actuals[2], original) {
						t.Fatal("plan retained borrowed vector")
					}
					if _, ok := describeStagedNativeEagerCallInputs(selection, caller, query.executable); ok {
						t.Fatal("mismatched original vector accepted")
					}
				})
				if !installed {
					t.Fatal("source selection owner refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				if deliveries == 0 {
					t.Fatal("original selected alternative missing")
				}
			})
		})
	}
}

// An unrepresented target does not erase an independently represented original
// initializer Call. It also cannot become full eager construction coverage.
func TestStagedNativeEagerCallPendingTargetPrefix(t *testing.T) {
	for _, row := range []struct {
		name, source string
		prefix, full bool
	}{
		{"installed getter witness", `function makeGetter(){return()=>window.name}export function invoke(){Object.defineProperty(Object.prototype,'value',{get:makeGetter()});return Object.defineProperty({},'run',{})}`, true, false},
		{"unknown target", `function makeGetter(){return()=>window.name}export function invoke(target:object){return Object.defineProperty(target,'value',{get:makeGetter()})}`, true, false},
		{"effectful fresh target", `declare function getTarget():object;function makeGetter(){return()=>window.name}export function invoke(){return Object.defineProperty({nested:getTarget()},'value',{get:makeGetter()})}`, true, false},
		{"full fresh target", `function makeGetter(){return()=>window.name}export function invoke(){return Object.defineProperty({},'value',{get:makeGetter()})}`, false, true},
		{"unrepresented key", `function makeGetter(){return()=>window.name}export function invoke(key:PropertyKey){return Object.defineProperty(Object.prototype,key,{get:makeGetter()})}`, false, false},
		{"computed descriptor", `function makeGetter(){return()=>window.name}export function invoke(){const key='get';return Object.defineProperty(Object.prototype,'value',{[key]:makeGetter()})}`, false, false},
		{"no initializer Call", `export function invoke(){return Object.defineProperty(Object.prototype,'value',{get:()=>window.name})}`, false, false},
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
					t.Fatal("missing original native operation")
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
					plan, described := describeStagedNativeEagerCallPrefix(selection, caller, query.executable)
					if described != row.prefix {
						t.Fatalf("pending target prefix=%t want=%t", described, row.prefix)
					}
					_, full := describeStagedNativeEagerCallInputs(selection, caller, query.executable)
					_, construction := describeStagedEagerCallConstruction(selection.actuals, caller, query.executable)
					if full != row.full || construction != row.full {
						t.Fatal("prefix broadened full producer or ordinary construction domain")
					}
					if before != callableAnalysisFingerprint(callableAnalysis{facts: facts}) {
						t.Fatal("prefix mutated source facts")
					}
					if !described {
						return
					}
					if !plan.targetPending || len(plan.calls) != 1 || plan.calls[0].actual != 2 || plan.calls[0].property.Parent != selection.descriptorGet || !sameOperationRequest(plan.request, nativeRootDebtRequest(&sourceStagedNativeGetSource{request: selection.request, get: selection.get}, "eager-inputs")) {
						t.Fatal("pending target or original initializer relationship lost")
					}
					for index, actual := range plan.actuals {
						if !sameOperationEndpoint(actual, selection.actuals[index]) {
							t.Fatal("prefix retargeted original ordered endpoints")
						}
					}
					original := plan.actuals[0]
					selection.actuals[0].expression = selection.actuals[2].expression
					if !sameOperationEndpoint(plan.actuals[0], original) {
						t.Fatal("prefix retained borrowed actual vector")
					}
					if _, accepted := describeStagedNativeEagerCallPrefix(selection, caller, query.executable); accepted {
						t.Fatal("mismatched original target endpoint accepted")
					}
				})
				if !installed {
					t.Fatal("original selected owner refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				if deliveries == 0 {
					t.Fatal("missing original selected native handoff")
				}
			})
		})
	}
}
