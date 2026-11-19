package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const stagedGetFormalCaptureSource = `
function factory(callback:()=>string,unused:()=>string){return ({get callback(){callback();return()=>window.name}}).callback}
function browser(){return document.title}
function quiet(){return 'quiet'}
function dormant(){return navigator.userAgent}
function consume(callback:()=>string){return callback()}
export function direct(){return consume(factory(browser,dormant))}
export function independent(){factory(browser,dormant);return consume(factory(quiet,dormant))}
export function partial(other:()=>string){factory(browser,dormant);return consume(factory(other,dormant))}
`

// The getter invokes its enclosing formal eagerly. Its returned callback is
// independent DATA and runs only when the original argument consumer invokes it.
func TestStagedGetFormalCaptureSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/get-formal-capture.ts", Source: stagedGetFormalCaptureSource, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		file := filepath.Join(t.TempDir(), "get-formal-capture.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get userAgent(){throw 'unused-input-sentinel'}}});globalThis.document={get title(){events.push('getter-input');return 'input'}};globalThis.window={get name(){events.push('returned');return 'result'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);assert.equal(m.direct(),'result');assert.deepEqual(events,['getter-input','returned']);events.length=0;assert.equal(m.independent(),'result');assert.deepEqual(events,['getter-input','returned']);events.length=0;assert.equal(m.partial(()=>{events.push('other');return 'other'}),'result');assert.deepEqual(events,['getter-input','other','returned']);events.length=0;assert.throws(()=>m.partial(()=>{events.push('throw');throw 'sentinel'}),e=>e==='sentinel');assert.deepEqual(events,['getter-input','throw']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("runtime %s: %v %s", target, err, output)
		}
	}
}

// The original Get must describe its capture relationship before the canonical
// getter body has issued demands. Later body extraction retains independent
// required membership; it does not require a second Get or a rebound receiver.
func TestStagedGetFormalCaptureBeforeCanonicalBody(t *testing.T) {
	withStagedReturnProgram(t, stagedGetFormalCaptureSource, func(owner *executableBodyOwner, creating *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(creating))
		work := registerCallableEffectWork(facts)
		var operation *ast.Node
		caller := -1
		for index, fact := range facts {
			if fact.summary.Name != "factory" {
				continue
			}
			caller = index
			walkNode(fact.node.Body(), func(node *ast.Node) bool {
				if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "callback" {
					operation = node
				}
				return true
			})
		}
		if caller < 0 || operation == nil {
			t.Fatal("original immediate Get missing")
		}
		work.indexOperationSources(facts)
		work.operationGeneration = owner.values.generation
		work.observeStagedGetResult(facts, caller, operation, owner)
		effects := stagedGetResultRequest(operation, facts[caller].node, "effects", nil)
		if !work.operationRecipes[effects.producer].delta.extracted {
			t.Fatal("first original Get withheld its lexical capture source")
		}
		found := false
		for _, call := range facts[caller].staged.calls {
			if !originalStagedGetterCall(call) {
				continue
			}
			getter := work.memberNodes[call.invocation.declaration]
			if facts[getter].staged.ready || len(facts[getter].staged.invoked) != 0 {
				t.Fatal("source description fabricated canonical body extraction")
			}
			var identifier *ast.Node
			walkNode(call.invocation.declaration.Body(), func(node *ast.Node) bool {
				if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) {
					identifier = node.Expression()
				}
				return true
			})
			if !work.stagedGetCaptureConsumer(&facts[caller], identifier, owner) {
				t.Fatal("original source/B membership did not admit capture use")
			}
			key := sourceStagedDependencyKey{caller, stagedDeclarationCallEdge(facts[caller].summary.ID, call.invocation)}
			membership := work.stagedRequired[key]
			if membership == nil || membership.consumed != 0 {
				t.Fatal("source admission fabricated body revision")
			}
			delete(work.stagedRequired, key)
			if work.stagedGetCaptureConsumer(&facts[caller], identifier, owner) {
				t.Fatal("capture admitted without canonical required membership")
			}
			work.stagedRequired[key] = membership
			found = true
		}
		if !found {
			t.Fatal("original Get did not bind its real receiver")
		}
	})
}

// Missing receiver/local/parameter activation authority must not publish a
// complete Get merely because another captured invocation is representable.
// Local extraction is deliberately separate from independent body closure.
func TestStagedGetFormalCaptureUnavailableInputsRemainPending(t *testing.T) {
	for _, row := range []struct{ name, parameters, body string }{
		{"receiver before capture", "callback:()=>string", `this.x;callback();`},
		{"receiver after capture", "callback:()=>string", `callback();this.x;`},
		{"local capture", "callback:()=>string", `local();callback();`},
		{"written formal", "callback:()=>string", `callback=()=> 'changed';callback();`},
		{"default formal", "callback:()=>string=()=> 'default'", `callback();`},
		{"rest formal", "...callback:Array<()=>string>", `callback[0]();`},
	} {
		t.Run(row.name, func(t *testing.T) {
			actual := "browser"
			source := `function browser(){return document.title}function factory(` + row.parameters + `){const local=()=>navigator.userAgent;return ({x:'receiver',get callback(){` + row.body + `return()=>window.name}}).callback}export function invoke(){return factory(` + actual + `)}`
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
				facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(creating))
				work := registerCallableEffectWork(facts)
				caller := -1
				var operation *ast.Node
				for index, fact := range facts {
					if fact.summary.Name != "factory" {
						continue
					}
					caller = index
					walkNode(fact.node.Body(), func(node *ast.Node) bool {
						if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "callback" {
							operation = node
						}
						return true
					})
				}
				if caller < 0 || operation == nil {
					t.Fatal("original Get source missing")
				}
				work.indexOperationSources(facts)
				work.operationGeneration = owner.values.generation
				request := stagedGetResultRequest(operation, facts[caller].node, "value", nil)
				if _, registered := work.registerStagedGetResult(facts, caller, operation, owner); !registered {
					t.Fatal("source roles missing")
				}
				id, required := work.requireOperation(facts, request)
				if !required {
					t.Fatal("original Get requirement refused")
				}
				work.prepareStagedGetResult(facts, id, owner)
				recipe := work.operationRecipes[request.producer]
				t.Logf("local extracted=%t required=%d source=%+v", recipe.delta.extracted, len(recipe.delta.required), recipe.callResult.getResult)
				if work.closedOperationDependencies()[id.index] {
					t.Fatal("unavailable source inputs acquired complete Get DATA")
				}
				if row.name == "written formal" || row.name == "default formal" || row.name == "rest formal" {
					effects := stagedGetResultRequest(operation, facts[caller].node, "effects", nil)
					if work.operationRecipes[effects.producer].delta.extracted {
						t.Fatal("unsupported formal activation acquired local Get coverage")
					}
				}
				// No original callable summary has been delivered in this source control.
				// Independent required bodies must remain unconsumed even if a local source
				// relation was described beside the unsupported input.
				for _, dependency := range work.stagedRequired {
					if dependency.consumed != 0 {
						t.Fatal("source description fabricated body delivery")
					}
				}
			})
		})
	}
}
