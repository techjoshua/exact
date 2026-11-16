package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Conditional source DATA after an invoked capture must not require a normal
// captured value. Actual getter/capture body dependencies remain independently open.
func TestStagedReturnDataAfterCapturedInvocation(t *testing.T) {
	const source = `function factory(callback:()=>string){return ({get value(){callback();return()=>window.name}}).value}function consume(callback:()=>string){return callback()}export function invoke(){return consume(factory(()=>document.title))}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		file := ast.GetSourceFileOfNode(call)
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		var get *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "value" {
				get = node
			}
			return true
		})
		calling := work.memberNodes[enclosingCallableNode(call)]
		work.extracting = calling
		if !work.stageSourceDeclarationCall(facts, calling, call, owner) {
			invocation, gap := stageDeclarationCall(&facts[calling], call, owner.checker, owner)
			inputs, bound := bindStagedDeclarationInputs(&facts[calling], invocation, owner)
			target, known := work.memberNodes[invocation.declaration]
			if gap != stagedCallSupported || !bound || !known || !work.deferDeclarationCall(facts, calling, target, inputs.request, inputs) {
				t.Fatal("original source/binder Call association refused")
			}
		}
		work.extracting = -1
		var factoryCall sourceStagedDeclarationCall
		for _, entry := range facts[calling].staged.calls {
			if entry.invocation.operation == call {
				factoryCall = entry
			}
		}
		outer, valid := describeStagedCallReturnSources(factoryCall, owner)
		if !valid || len(outer.branches) != 1 || outer.branches[0].endpoint.expression != get {
			t.Fatal("original factory return Get inventory missing")
		}
		outerProjection := describeStagedReturnBindings(outer, owner)
		if !outerProjection.locallyRepresented || len(outerProjection.branches) != 1 || outerProjection.branches[0].endpoint.expression != get {
			t.Fatalf("conditional Get operand filtered by stronger getter completion: %+v", outerProjection)
		}
		caller := work.memberNodes[enclosingCallableNode(get)]
		if !work.stageStagedGetResult(facts, caller, get, owner) {
			t.Fatal("actual source Get refused")
		}
		var actual sourceStagedDeclarationCall
		for _, entry := range facts[caller].staged.calls {
			if originalStagedGetterCall(entry) {
				actual = entry
			}
		}
		plan, valid := describeStagedCallReturnSources(actual, owner)
		if !valid || len(plan.branches) != 1 {
			t.Fatalf("original getter return inventory missing: valid=%v branches=%+v", valid, plan.branches)
		}
		projection := describeStagedReturnBindings(plan, owner)
		if !projection.locallyRepresented || len(projection.branches) != 1 || projection.branches[0].pending {
			t.Fatalf("conditional return DATA demanded captured outcome: %+v", projection)
		}
		request := stagedGetResultRequest(get, facts[caller].node, "value", nil)
		id, valid := work.requireOperation(facts, request)
		if !valid {
			t.Fatal("Get DATA subscription refused")
		}
		resolveCallableEffectsWithWork(facts, owner, &work)
		data, available := work.stagedCallResultData(request)
		if !available || !data.delta.extracted || len(data.delta.exposures) != 1 || work.closedOperationDependencies()[id.index] {
			t.Fatalf("DATA/canonical-body split lost: available=%v delta=%+v", available, data.delta)
		}
		outerCall := call.Parent
		work.extracting = calling
		if outerCall == nil || !ast.IsCallExpression(outerCall) || !work.stageSourceDeclarationCall(facts, calling, outerCall, owner) {
			t.Fatal("original argument consumer source association refused")
		}
		work.extracting = -1
		var outerInput sourceStagedDeclarationCall
		for _, entry := range facts[calling].staged.calls {
			if entry.invocation.operation == outerCall {
				outerInput = entry
			}
		}
		reading, registered := work.prepareStagedInputCallResult(facts, calling, outerInput, outerInput.invocation.actuals[0].endpoint, owner)
		if !registered {
			t.Fatal("current original input DATA reader refused")
		}
		reader, required := work.requireOperation(facts, reading)
		if !required {
			t.Fatal("actual input DATA subscriber refused")
		}
		work.prepareOperationUses(facts, owner)
		input, available := work.stagedInputCallResultData(facts, reading)
		if !available || len(input.delta.exposures) != 1 || !work.inputDataChanged {
			t.Fatal("new DATA delivery did not notify actual input consumer")
		}
		work.inputDataChanged = false
		work.deliverOperationSubscribers(facts, reader, owner)
		repeated, _ := work.stagedInputCallResultData(facts, reading)
		if work.inputDataChanged || len(repeated.delta.exposures) != 1 {
			t.Fatal("cached extraction read renotified consumer or duplicated DATA")
		}

	})
}

// The original Get binder may describe a lexical DATA role without supplying
// the captured value or becoming its creator. Unsupported metadata stays pending.
func TestStagedReturnDataGetterCaptureRole(t *testing.T) {
	const source = `function factory(callback:()=>string){return ({get value(){callback();return callback}}).value}export function invoke(){return factory(()=>window.name)}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		file := ast.GetSourceFileOfNode(call)
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		var get *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "value" {
				get = node
			}
			return true
		})
		caller := work.memberNodes[enclosingCallableNode(get)]
		if _, registered := work.registerStagedGetResult(facts, caller, get, owner); !registered {
			t.Fatal("original Get source registration refused")
		}
		work.observeStagedGetResult(facts, caller, get, owner)
		var actual sourceStagedDeclarationCall
		for _, candidate := range facts[caller].staged.calls {
			if originalStagedGetterCall(candidate) {
				actual = candidate
			}
		}
		plan, valid := describeStagedCallReturnSources(actual, owner)
		if !valid || len(plan.branches) != 1 || plan.branches[0].pending || plan.branches[0].endpoint.kind != relativeEndpointRole || plan.branches[0].endpoint.role.kind != relativeRoleCapture || plan.branches[0].endpoint.role.declaration != actual.invocation.declaration {
			t.Fatalf("matching capture DATA role missing: valid=%v plan=%+v", valid, plan)
		}
		if len(plan.branches[0].captures) != 0 {
			t.Fatal("DATA binding was interpreted as a newly created literal")
		}
		for _, change := range []func(*sourceRelativeEndpoint){func(e *sourceRelativeEndpoint) { e.cut.reading = call }, func(e *sourceRelativeEndpoint) { e.producer = call }, func(e *sourceRelativeEndpoint) { e.get = call }, func(e *sourceRelativeEndpoint) { e.role.slot++ }} {
			copy := actual
			edge := *actual.inputs
			edge.relative = cloneSourceRelativeBoundInputs(edge.relative)
			copy.inputs = &edge
			for i := range edge.relative.bindings {
				if edge.relative.bindings[i].target.kind == relativeRoleCapture {
					change(&edge.relative.bindings[i].sources[0])
				}
			}
			bad, valid := describeStagedCallReturnSources(copy, owner)
			if !valid || len(bad.branches) != 1 || !bad.branches[0].pending {
				t.Fatal("altered descriptive source association completed captured DATA")
			}
		}
	})
}

// Passing an existing callable through a DATA role is not creation of that
// callable by the relay. No callee B or normal result law is manufactured.
func TestStagedReturnDataDeclaredCallableReference(t *testing.T) {
	const source = `function factory(callback:()=>string){return callback}function browser(){return window.name}export function invoke(){return [factory(browser)]}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
		work := registerCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(call)]
		work.extracting = caller
		if !work.stageSourceDeclarationCall(facts, caller, call, owner) {
			t.Fatal("original source-only relay association refused")
		}
		work.extracting = -1
		work.prepareOperationUses(facts, owner)
		source, described := work.describeStagedCallResultSource(facts, caller, call, owner)
		if !described || !work.registerOperationSourcePrefix(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
			t.Fatal("relay DATA source refused")
		}
		id, valid := work.requireOperation(facts, source.request)
		if !valid {
			t.Fatal("relay DATA subscriber refused")
		}
		resolveCallableEffectsWithWork(facts, owner, &work)
		data, available := work.stagedCallResultData(source.request)
		if !available || !data.delta.extracted || len(data.delta.exposures) != 1 || !ast.IsFunctionDeclaration(data.delta.exposures[0].endpoint.expression) || data.delta.exposures[0].endpoint.expression.Name().Text() != "browser" || data.delta.exposures[0].creating != nil || work.closedOperationDependencies()[id.index] {
			t.Fatalf("declared callable DATA lost or given relay creator: available=%v delta=%+v", available, data.delta)
		}
		for _, fact := range facts {
			if fact.staged.ready || len(fact.summary.DirectEffectSources) != 0 {
				t.Fatal("DATA reference invoked/completed canonical body")
			}
		}
	})
}
