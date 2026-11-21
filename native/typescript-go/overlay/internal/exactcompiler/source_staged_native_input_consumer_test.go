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

// Freezing a literal for a component retains its supplied formal and leaves
// the stored bodies dormant until the application reads or calls them.
func TestStagedNativeLiteralInputSession(t *testing.T) {
	const source = `export function invoke(domain:object){return Object.freeze({domain,get value(){window.name;return 1},callback:()=>document.title})}`
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/freeze-input.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(response.Error, response.Diagnostics)
		}
		for _, effect := range executableSummary(t, analyzeComponentNativeCall(t, source, "invoke({})", target), "invoke").EffectSources {
			if effect.Environment == "browser" || effect.Environment == "unknown" {
				t.Fatalf("stored body or formal value acquired: %#v", effect)
			}
		}
		file := filepath.Join(t.TempDir(), "freeze.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let reads=[];globalThis.window={get name(){reads.push('get');return 'name'}};globalThis.document={get title(){reads.push('callback');return 'title'}};const m=await import(pathToFileURL(process.argv[1]).href);const domain={};const value=m.invoke(domain);assert.equal(value.domain,domain);assert.equal(Object.isFrozen(value),true);assert.deepEqual(reads,[]);assert.equal(value.value,1);assert.equal(value.callback(),'title');assert.deepEqual(reads,['get','callback']);assert.throws(()=>Object.defineProperty(value,'extra',{value:1}),TypeError);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s: %v %s", target, err, output)
		}
	}
}

// Original source selection may describe an input even while creation Effects
// remain unsupported. Algorithm readiness cannot pay this independent debt.
func TestStagedNativeLiteralInputIndependentDebts(t *testing.T) {
	for _, row := range []struct {
		name, source string
		ready        bool
	}{
		{"formal", `export function invoke(domain:object){return Object.freeze({domain})}`, true},
		{"lexical", `const domain={};export function invoke(){return Object.freeze({domain})}`, true},
		{"dormant", `export function invoke(){return Object.freeze({get value(){window.name;return 1},callback:()=>document.title})}`, true},
		{"computed", `export function invoke(key:string){return Object.freeze({[key]:1})}`, false},
		{"spread", `export function invoke(domain:object){return Object.freeze({...domain})}`, false},
		{"input Get", `export function invoke(domain:{value:object}){return Object.freeze({value:domain.value})}`, false},
		{"input Call", `declare function foreign():object;export function invoke(){return Object.freeze({value:foreign()})}`, false},
		{"ambient lexical", `declare const domain:object;export function invoke(){return Object.freeze({domain})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				for parent := call.Parent; parent != nil && !ast.IsFunctionLike(parent); parent = parent.Parent {
					if ast.IsCallExpression(parent) {
						call = parent
					}
				}
				query = newSourceDependencyQuery(call, query.owner.checker, query.executable, enclosingCallableNode(call))
				facts := installationSourceFacts(query)
				declaration := enclosingCallableNode(call)
				request := sourceStagedNativeRequest{call: call, get: call.Expression(), request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, use: call, edge: "literal-input", cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
				work := callableEffectWork{extracting: -1}
				revoke, installed := query.beginStagedNativeGetSource(&work, facts, request, func(sourceStagedNativeSelection, func(sourceStagedNativeDescriptorPlan) bool) {})
				if !installed {
					t.Fatal("original input source refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				work.prepareOperationUses(facts, query.executable)
				root := work.operationRecipes[request.request.producer].nativeGet
				if root == nil {
					t.Fatal("missing original source")
				}
				algorithmID := work.operationIDs[nativeRootDebtRequest(root, "algorithm").producer]
				eagerID := work.operationIDs[nativeRootDebtRequest(root, "eager-inputs").producer]
				rootID := work.operationIDs[root.request.producer]
				if algorithmID.index == 0 || eagerID.index == 0 || rootID.index == 0 {
					t.Fatal("independent required memberships absent")
				}
				if !work.operations[algorithmID.index].delta.extracted || work.operations[eagerID.index].delta.extracted != row.ready || work.closedOperationDependencies()[rootID.index] != row.ready {
					t.Fatalf("algorithm=%t eager=%t closed=%t want input=%t", work.operations[algorithmID.index].delta.extracted, work.operations[eagerID.index].delta.extracted, work.closedOperationDependencies()[rootID.index], row.ready)
				}
				if len(work.operations[rootID.index].delta.required) != 3 || len(work.operations[algorithmID.index].delta.exposures) != 0 {
					t.Fatal("Effects settlement replaced independent debts or published a result")
				}
				cloned := make([]callableFacts, len(facts))
				for i := range facts {
					cloned[i] = cloneProjectCallableFact(facts[i])
				}
				fresh := callableEffectWork{extracting: -1}
				fresh.prepareOperationUses(cloned, query.executable)
				freshID := fresh.operationIDs[root.request.producer]
				if freshID.index == 0 || fresh.closedOperationDependencies()[freshID.index] != row.ready {
					t.Fatal("clone changed supported versus pending input disposition")
				}
				for _, state := range work.operations {
					if len(state.delta.invoked) != 0 {
						t.Fatal("input creation activated stored callback")
					}
				}
			})
		})
	}
}

const stagedNestedLiteralCallWitness = `declare function foreign():void;function first(){window.name;foreign();return()=>document.title}function second(){window.name;return 2}export function invoke(){return Object.freeze({value:first(),nested:{value:second()}})}`

// Initializer results stay independent of the eager summary. A returned
// callback is stored by the literal and is not activated by freeze.
func TestStagedNativeNestedLiteralCallsSession(t *testing.T) {
	const source = stagedNestedLiteralCallWitness
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/freeze-calls.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(response.Error, response.Diagnostics)
		}
		known, unknown := false, false
		for _, effect := range executableSummary(t, analyzeComponentNativeCall(t, source, "invoke()", target), "invoke").EffectSources {
			known = known || effect.Environment == "browser" && effect.Description == "window"
			unknown = unknown || effect.Environment == "unknown"
			if effect.Environment == "browser" && effect.Description == "document" {
				t.Fatal("initializer return was invoked during freeze")
			}
		}
		if !known || !unknown {
			t.Fatalf("initializer known=%t unknown=%t", known, unknown)
		}
		file := filepath.Join(t.TempDir(), "nested.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let events=[];globalThis.window={get name(){events.push('read');return 'name'}};globalThis.document={get title(){events.push('callback');return 'title'}};globalThis.foreign=()=>events.push('foreign');const m=await import(pathToFileURL(process.argv[1]).href);const value=m.invoke();assert.deepEqual(events,['read','foreign','read']);assert.equal(Object.isFrozen(value),true);assert.equal(Object.isFrozen(value.nested),false);assert.equal(value.nested.value,2);assert.equal(value.value(),'title');assert.deepEqual(events,['read','foreign','read','callback']);events=[];const failure=new Error('stop');globalThis.foreign=()=>{events.push('throw');throw failure};assert.throws(()=>m.invoke(),error=>error===failure);assert.deepEqual(events,['read','throw']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s: %v %s", target, err, output)
		}
	}
}
