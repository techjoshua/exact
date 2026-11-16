package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

const stagedBindingDataSource = `
function browser(){return window.name}
function quiet(){return 'quiet'}
function dormant(){return document.title}
function consume(callback:()=>string){return callback()}
function factory(callback:()=>string,unused:()=>string){return ({get value(){return callback}}).value}
function relay(callback:()=>string){const alias=callback;return consume(alias)}
function returnAlias(callback:()=>string){const alias=callback;return alias}
export function savedGet(){const saved=({get value(){return()=>window.name}}).value;return consume(saved)}
export function savedCall(){const saved=factory(browser,dormant);return consume(saved)}
export function literal(){const saved=()=>window.name;return consume(saved)}
export function formal(){return relay(browser)}
export function returned(){return consume(returnAlias(browser))}
export function independent(){const first=factory(browser,dormant);const second=factory(quiet,dormant);return consume(second)}
export function partial(other:()=>string){const known=returnAlias(browser);consume(known);const incoming=returnAlias(other);return consume(incoming)}
export function expose(){const saved=()=>window.name;return saved}
`

// Binding DATA keeps the original Identifier and initializer producer. Merely
// retaining a callback does not invoke it or consume its canonical body.
func TestStagedBindingDataSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/binding-data.ts", Source: stagedBindingDataSource, Target: target, Diagnostics: "semantic", stagedReplacement: true})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		for name, want := range map[string]struct{ known, unknown bool }{"savedGet": {true, false}, "savedCall": {true, false}, "literal": {true, false}, "formal": {true, false}, "returned": {true, false}, "independent": {false, false}, "partial": {true, true}, "expose": {false, false}} {
			known, unknown, dormant := false, false, false
			for _, effect := range executableSummary(t, response, name).EffectSources {
				known = known || effect.Environment == "browser" && effect.Description == "window"
				unknown = unknown || effect.Environment == "unknown"
				dormant = dormant || effect.Environment == "browser" && effect.Description == "document"
			}
			if known != want.known || unknown != want.unknown || dormant {
				t.Fatalf("%s binding DATA donor/dormancy: %#v", name, executableSummary(t, response, name))
			}
		}
		file := filepath.Join(t.TempDir(), "binding-data.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.window={get name(){events.push('window');return 'known'}};globalThis.document={get title(){throw 'dormant'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);const saved=m.expose();assert.deepEqual(events,[]);assert.equal(saved(),'known');for(const name of ['savedGet','savedCall','literal','formal','returned']){events.length=0;assert.equal(m[name](),'known');assert.deepEqual(events,['window'])}events.length=0;assert.equal(m.independent(),'quiet');assert.deepEqual(events,[]);assert.equal(m.partial(()=>{events.push('other');return 'other'}),'other');assert.deepEqual(events,['window','other']);events.length=0;assert.throws(()=>m.partial(()=>{events.push('throw');throw 'sentinel'}),e=>e==='sentinel');assert.deepEqual(events,['window','throw']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s emitted binding DATA: %v %s", target, err, output)
		}
	}
}

func TestStagedBindingDataOriginalSource(t *testing.T) {
	const source = `function browser(){return window.name}function factory(callback:()=>string){return callback()}export function invoke(){const saved=({get value(){return()=>window.name}}).value;return factory(saved)}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
		work := registerCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(call)]
		endpoint := call.AsCallExpression().Arguments.Nodes[0]
		var get *ast.Node
		walkNode(facts[caller].node.Body(), func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "value" {
				get = node
			}
			return true
		})
		if _, registered := work.registerStagedGetResult(facts, caller, get, owner); !registered {
			t.Fatal("original Get source registration refused")
		}
		source, valid := work.describeStagedCallResultSource(facts, caller, endpoint, owner)
		if !valid || source.binding == nil || source.request.producer.operation != endpoint {
			t.Fatal("original binding source missing")
		}
		if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
			t.Fatal("binding registration refused")
		}
		id, valid := work.requireOperation(facts, source.request)
		if !valid {
			t.Fatal("binding DATA demand refused")
		}
		resolveCallableEffectsWithWork(facts, owner, &work)
		data, available := work.stagedCallResultData(source.request)
		if !available || !data.delta.extracted || len(data.delta.exposures) != 1 || len(data.delta.required) != 1 || !ast.IsPropertyAccessExpression(data.delta.required[0].producer.operation) || data.delta.exposures[0].creating != nil || work.closedOperationDependencies()[id.index] {
			t.Fatalf("binding source/child/body split lost: available=%v delta=%+v", available, data.delta)
		}
		cloned := make([]callableFacts, len(facts))
		for index := range facts {
			cloned[index] = cloneProjectCallableFact(facts[index])
		}
		fresh := registerCallableEffectWork(cloned)
		if _, registered := fresh.registerStagedGetResult(cloned, caller, get, owner); !registered {
			t.Fatal("fresh source generation registration refused")
		}
		freshID, valid := fresh.requireOperation(cloned, source.request)
		if !valid || fresh.closedOperationDependencies()[freshID.index] || fresh.operations[freshID.index].resultProjection != nil {
			t.Fatal("cached binding DATA completed fresh source observation")
		}
		resolveCallableEffectsWithWork(cloned, owner, &fresh)
		current, available := fresh.stagedCallResultData(source.request)
		if !available || !current.delta.extracted || len(current.delta.exposures) != 1 || fresh.operations[freshID.index].resultProjection == nil || fresh.closedOperationDependencies()[freshID.index] {
			t.Fatal("fresh original binding/Get/body split unavailable")
		}
		for _, fact := range facts {
			if fact.staged.ready || len(fact.summary.DirectEffectSources) != 0 {
				t.Fatal("binding DATA invoked dormant body")
			}
		}
	})
}

func TestStagedBindingDataUnsupportedSource(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"written formal", `function factory(callback:()=>string){return callback()}function quiet(){return 'quiet'}export function invoke(saved:()=>string){saved=quiet;return factory(saved)}`},
		{"outer", `function factory(callback:()=>string){return callback()}export function invoke(saved:()=>string){return()=>factory(saved)}`},
		{"default", `function factory(callback:()=>string){return callback()}export function invoke(saved:()=>string=()=>window.name){return factory(saved)}`},
		{"rest", `function factory(callbacks:Array<()=>string>){return callbacks}export function invoke(...saved:Array<()=>string>){return factory(saved)}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedReturnProgram(t, row.source, func(owner *executableBodyOwner, call *ast.Node) {
				read := call.AsCallExpression().Arguments.Nodes[0]
				if !ast.IsIdentifier(read) || stagedBindingDataDeclaration(read, enclosingCallableNode(read), owner) != nil {
					t.Fatal("unprovided binding state became DATA")
				}
			})
		})
	}
}

// A pending child does not discard an independently represented callback. The
// missing Get remains a compiler obligation, never an invented unknown DATA value.
func TestStagedBindingDataKnownPrefix(t *testing.T) {
	const source = `declare const foreign:{value:()=>string};function factory(flag:boolean){if(flag)return()=>window.name;return foreign.value}function consume(callback:()=>string){return callback()}export function invoke(){const saved=factory(true);return consume(saved)}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
		work := registerCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(call)]
		work.extracting = caller
		if !work.stageSourceDeclarationCall(facts, caller, call, owner) {
			t.Fatal("original child Call source association refused")
		}
		work.extracting = -1
		work.prepareOperationUses(facts, owner)
		var read *ast.Node
		walkNode(facts[caller].node.Body(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "consume" {
				read = node.AsCallExpression().Arguments.Nodes[0]
			}
			return true
		})
		dataSource, valid := work.describeStagedCallResultSource(facts, caller, read, owner)
		if !valid || !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: dataSource.request.producer, callResult: dataSource}) {
			t.Fatal("binding prefix source refused")
		}
		if _, valid := work.requireOperation(facts, dataSource.request); !valid {
			t.Fatal("binding prefix demand refused")
		}
		work.prepareOperationUses(facts, owner)
		data, available := work.stagedCallResultData(dataSource.request)
		if !available || data.delta.extracted || len(data.delta.exposures) != 1 || !ast.IsArrowFunction(data.delta.exposures[0].endpoint.expression) || len(data.delta.required) != 1 {
			t.Fatalf("known DATA beside pending child lost: available=%v delta=%+v", available, data.delta)
		}
	})
}

func TestStagedBindingDataCapturedPrefix(t *testing.T) {
	const source = `function factory(callback:()=>string){return callback()}export function invoke(callback:()=>string){const saved=()=>{window.name;return callback()};return factory(saved)}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
		work := registerCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(call)]
		work.prepareOperationUses(facts, owner)
		read := call.AsCallExpression().Arguments.Nodes[0]
		dataSource, valid := work.describeStagedCallResultSource(facts, caller, read, owner)
		if !valid || !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: dataSource.request.producer, callResult: dataSource}) {
			t.Fatal("captured binding source refused")
		}
		if _, valid := work.requireOperation(facts, dataSource.request); !valid {
			t.Fatal("captured binding demand refused")
		}
		resolveCallableEffectsWithWork(facts, owner, &work)
		data, available := work.stagedCallResultData(dataSource.request)
		if !available || data.delta.extracted || len(data.delta.exposures) != 1 || !ast.IsArrowFunction(data.delta.exposures[0].endpoint.expression) || data.delta.exposures[0].creating != nil {
			t.Fatal("unprovided capture erased source prefix or fabricated creator")
		}
	})
}

// Only an actual ordinary callee-use wakes the relative invocation consumer.
// Source DATA publication alone neither invokes its body nor repeats a cursor.
func TestStagedBindingInvocationDataNotification(t *testing.T) {
	const source = `function factory(){return 'unused'}export function invoke(){factory();const saved=()=>window.name;return saved()}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, original *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(original))
		work := registerCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(original)]
		var call *ast.Node
		walkNode(facts[caller].node.Body(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "saved" {
				call = node
			}
			return true
		})
		if !work.stageStagedBindingInvocation(facts, caller, call, owner) || len(facts[caller].staged.operationUses) != 1 {
			t.Fatal("original callee DATA marker refused")
		}
		use := facts[caller].staged.operationUses[0]
		if actual, owned := work.stagedBindingInvocation(use); !owned || actual != call || use.call != nil || use.request.reading != (sourceStagedOperationKey{}) {
			t.Fatal("callee marker fabricated a reading or Call receipt")
		}
		changed := use
		changed.request.edge += "changed"
		if _, owned := work.stagedBindingInvocation(changed); owned {
			t.Fatal("changed DATA edge became original invocation")
		}
		work.prepareOperationUses(facts, owner)
		data, available := work.stagedCallResultData(use.request)
		if !available || !data.delta.extracted || len(data.delta.exposures) != 1 || !work.inputDataChanged {
			t.Fatal("new original callee DATA failed to notify consumer")
		}
		work.inputDataChanged = false
		work.prepareOperationUses(facts, owner)
		if work.inputDataChanged {
			t.Fatal("cached DATA extraction repeated notification")
		}
		for _, fact := range facts {
			if fact.staged.ready || len(fact.summary.Calls) != 0 || len(fact.summary.DirectEffectSources) != 0 {
				t.Fatal("DATA marker alone activated a callable")
			}
		}
	})
}
