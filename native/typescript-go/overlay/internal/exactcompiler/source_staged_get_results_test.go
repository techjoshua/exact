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

// Ordinary Get DATA reaches the existing argument consumer. Getter invocation
// and callback invocation are distinct, and neither executes a stored callback.
func TestStagedGetResultSessionAndArtifacts(t *testing.T) {
	for _, row := range []struct{ name, declarations, actual string }{
		{"data", "", `({callback:()=>{window.name;return()=>document.title}}).callback`},
		{"method", "", `({callback(){window.name;return()=>document.title}}).callback`},
		{"element", "", `({callback:()=>{window.name;return()=>document.title}})["callback"]`},
		{"getter", "", `({get callback(){foreign();return()=>{window.name;return()=>document.title}}}).callback`},
		{"throw", "", `({get callback(){if(foreign())throw "sentinel";return()=>{window.name;return()=>document.title}}}).callback`},
		{"call", `function leaf(){foreign();return()=>{window.name;return()=>document.title}}`, `({get callback(){return leaf()}}).callback`},
		{"return", `function factory(){return ({get callback(){foreign();return()=>{window.name;return()=>document.title}}}).callback}`, `factory()`},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare function foreign():boolean;function latent(target:{callback:()=>()=>string}){foreign();target.callback=()=>{window.name;return()=>document.title}}` + row.declarations + `function consume(callback:()=>()=>string){return callback()}export function invoke(){return consume(` + row.actual + `)}`
			for _, target := range []Target{TargetClient, TargetServer} {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/get-result.ts", Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
				}
				filename := filepath.Join(t.TempDir(), "get-result.mts")
				if err := os.WriteFile(filename, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];let shouldThrow=false;globalThis.foreign=()=>{events.push('getter');return shouldThrow};globalThis.window={get name(){events.push('callback');return'known'}};globalThis.document={get title(){events.push('later');return'later'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);if(process.argv[2]==='throw'){shouldThrow=true;assert.throws(()=>m.invoke(),e=>e==='sentinel');assert.deepEqual(events,['getter']);events.length=0;shouldThrow=false}const stored=m.invoke();assert.equal(typeof stored,'function');assert.deepEqual(events,['getter','throw','call','return'].includes(process.argv[2])?['getter','callback']:['callback']);assert.equal(stored(),'later');assert.equal(events.at(-1),'later');`
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, filename, row.name).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatalf("%s runtime: %v %s", target, err, output)
				}
			}
		})
	}
}

// Current original Get and real getter B must be reissued in a fresh graph.
// Cached DATA is a description, while every canonical body stays unready here.
func TestStagedGetResultOriginalDataAndFreshGraph(t *testing.T) {
	for _, row := range []struct {
		name, body string
		complete   bool
	}{
		{"complete", `return()=>window.name`, true},
		{"known_pending", `if(foreign())return other();return()=>window.name`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare function foreign():boolean;declare function other():()=>string;function factory(){return ({get callback(){` + row.body + `}}).callback}export function invoke(){return factory()}`
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
				file := ast.GetSourceFileOfNode(call)
				var get *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "callback" {
						get = node
					}
					return true
				})
				facts := stagedReturnSourceFacts(file)
				work := registerCallableEffectWork(facts)
				caller := work.memberNodes[enclosingCallableNode(get)]
				request := stagedGetResultRequest(get, facts[caller].node, "value", nil)
				if _, ok := work.registerStagedGetResult(facts, caller, get, owner); !ok {
					t.Fatal("original Get registration refused")
				}
				if len(work.operationIDs) != 0 {
					t.Fatal("passive registration adopted a consumer")
				}
				id, ok := work.requireOperation(facts, request)
				if !ok {
					t.Fatal("actual DATA subscription refused")
				}
				resolveCallableEffectsWithWork(facts, owner, &work)
				delivery, available := work.stagedCallResultData(request)
				if !available || delivery.delta.extracted != row.complete || len(delivery.delta.exposures) != 1 || work.closedOperationDependencies()[id.index] {
					t.Fatalf("DATA prefix/body pending split: available=%v delta=%+v", available, delivery.delta)
				}
				var original *sourceRelativeInputEdge
				for _, entry := range facts[caller].staged.calls {
					if entry.invocation.operation == get {
						original = entry.inputs
					}
				}
				if original == nil || !original.delivered {
					t.Fatal("original getter did not publish actual B")
				}
				cloned := make([]callableFacts, len(facts))
				for i := range facts {
					cloned[i] = cloneProjectCallableFact(facts[i])
				}
				fresh := registerCallableEffectWork(cloned)
				if _, ok := fresh.registerStagedGetResult(cloned, caller, get, owner); !ok {
					t.Fatal("fresh current owner registration refused")
				}
				freshID, ok := fresh.requireOperation(cloned, request)
				if !ok {
					t.Fatal("cloned DATA demand refused")
				}
				if fresh.memberCoverageObserved[request.producer] != nil || fresh.closedOperationDependencies()[freshID.index] {
					t.Fatal("cached DATA supplied current Get authority")
				}
				resolveCallableEffectsWithWork(cloned, owner, &fresh)
				freshData, available := fresh.stagedCallResultData(request)
				if !available || freshData.delta.extracted != row.complete || len(freshData.delta.exposures) != 1 || fresh.memberCoverageObserved[request.producer] != owner.values.generation || fresh.closedOperationDependencies()[freshID.index] {
					t.Fatalf("fresh Get failed to deliver conditional DATA/body debt: available=%v delta=%+v observed=%v", available, freshData.delta, fresh.memberCoverageObserved[request.producer] != nil)
				}
				var rebound *sourceRelativeInputEdge
				for _, entry := range cloned[caller].staged.calls {
					if entry.invocation.operation == get {
						rebound = entry.inputs
					}
				}
				if rebound == nil || rebound == original {
					t.Fatal("fresh original Get reused cached B authority")
				}
				for _, fact := range cloned {
					if fact.staged.ready || len(fact.summary.DirectEffectSources) != 0 {
						t.Fatal("DATA subscription executed canonical body")
					}
				}
			})
		})
	}
}

// Unadmitted receiver DATA retains the ordinary owner.
func TestStagedGetResultUnadmittedReceiver(t *testing.T) {
	for _, source := range []string{
		`function consume(callback:()=>string){return callback()}export function invoke(){const object={callback:()=>window.name};return consume(object.callback)}`,
		`function consume(callback:()=>string){return callback()}function factory(callback:()=>string){const local=callback;return consume(({get callback(){return local}}).callback)}export function invoke(){return factory(()=>window.name)}`,
		`declare const key:"callback";function consume(callback:()=>string){return callback()}export function invoke(){return consume(({callback:()=>window.name})[key])}`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			session := NewSession()
			request := Request{Kind: "compile", ID: "/virtual/get-gap.ts", Source: source, Target: target, Diagnostics: "semantic"}
			response := session.Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal("ordinary Get fallback", response.Error, response.Diagnostics)
			}
		}
	}
}
