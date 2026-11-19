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

const stagedGetCaptureDataSource = `
function factory(callback:()=>string,unused:()=>string){return ({get value(){return callback}}).value}
function browser(){return window.name}
function quiet(){return 'quiet'}
function dormant(){return document.title}
function consume(callback:()=>string){return callback()}
export function direct(){return consume(factory(browser,dormant))}
export function independent(){factory(browser,dormant);return consume(factory(quiet,dormant))}
export function partial(other:()=>string){consume(factory(browser,dormant));return consume(factory(other,dormant))}
export function expose(){return factory(browser,dormant)}
`

// Returning an immutable enclosing formal is DATA, not its invocation. Only the
// actual argument consumer can activate the returned callback's canonical body.
func TestStagedGetCaptureDataSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/get-capture-data.ts", Source: stagedGetCaptureDataSource, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		file := filepath.Join(t.TempDir(), "get-capture-data.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.window={get name(){events.push('browser');return 'known'}};globalThis.document={get title(){throw 'unused-input-sentinel'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);const stored=m.expose();assert.equal(typeof stored,'function');assert.deepEqual(events,[]);assert.equal(stored(),'known');events.length=0;assert.equal(m.direct(),'known');assert.deepEqual(events,['browser']);events.length=0;assert.equal(m.independent(),'quiet');assert.deepEqual(events,[]);assert.equal(m.partial(()=>{events.push('other');return 'other'}),'other');assert.deepEqual(events,['browser','other']);events.length=0;assert.throws(()=>m.partial(()=>{events.push('throw');throw 'sentinel'}),e=>e==='sentinel');assert.deepEqual(events,['browser','throw']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("runtime %s: %v %s", target, err, output)
		}
	}
}

// The original first Get supplies a relative DATA role before canonical body
// delivery. Its actual receiver B is not a creator of the returned callback.
func TestStagedGetCaptureDataOriginalSource(t *testing.T) {
	withStagedReturnProgram(t, stagedGetCaptureDataSource, func(owner *executableBodyOwner, creating *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(creating))
		work := registerCallableEffectWork(facts)
		caller := -1
		var operation *ast.Node
		for index, fact := range facts {
			if fact.summary.Name == "factory" {
				caller = index
				walkNode(fact.node.Body(), func(node *ast.Node) bool {
					if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "value" {
						operation = node
					}
					return true
				})
			}
		}
		if caller < 0 || operation == nil {
			t.Fatal("original Get missing")
		}
		if _, registered := work.registerStagedGetResult(facts, caller, operation, owner); !registered {
			t.Fatal("original source registration refused")
		}
		work.observeStagedGetResult(facts, caller, operation, owner)
		found := false
		for _, call := range facts[caller].staged.calls {
			if !originalStagedGetterCall(call) {
				continue
			}
			getter := work.memberNodes[call.invocation.declaration]
			if len(facts[getter].staged.invoked) != 0 || facts[getter].staged.ready {
				t.Fatal("returning DATA issued invocation/body completion")
			}
			plan, valid := describeStagedCallReturnSources(call, owner)
			if !valid || len(plan.branches) != 1 {
				t.Fatal("original core DATA return missing")
			}
			branch := plan.branches[0]
			if branch.pending || branch.endpoint.kind != relativeEndpointRole || branch.endpoint.role.kind != relativeRoleCapture {
				t.Fatal("immutable captured formal became pending/runtime value")
			}
			if !work.stagedGetCaptureConsumer(&facts[caller], branch.endpoint.expression, owner) {
				t.Fatal("original Get DATA use not admitted")
			}
			for _, binding := range call.inputs.bound.bindings {
				if binding.target.kind == relativeRoleCapture {
					t.Fatal("DATA capture was installed as actual B")
				}
			}
			endpoint, mapped := fieldGetterCaptureSource(call.inputs.relative, branch.endpoint.role)
			if !mapped || endpoint.role.kind != relativeRoleFormal || endpoint.role.declaration != facts[caller].node || endpoint.producer != operation || endpoint.get != operation || endpoint.cut != call.inputs.bound.cut {
				t.Fatal("DATA role lost original formal/Get association")
			}
			edge := stagedDeclarationCallEdge(facts[caller].summary.ID, call.invocation)
			membership := work.stagedRequired[sourceStagedDependencyKey{caller, edge}]
			if membership == nil || membership.consumed != 0 {
				t.Fatal("DATA admission fabricated body revision")
			}
			delete(work.stagedRequired, sourceStagedDependencyKey{caller, edge})
			if work.stagedGetCaptureConsumer(&facts[caller], branch.endpoint.expression, owner) {
				t.Fatal("DATA return admitted without body membership")
			}
			work.stagedRequired[sourceStagedDependencyKey{caller, edge}] = membership
			found = true
		}
		if !found {
			t.Fatal("actual original getter B missing")
		}
	})
}

func TestStagedGetCaptureDataUnsupportedSourceRoles(t *testing.T) {
	for _, row := range []struct{ name, parameters, setup, body string }{
		{"local", "callback:()=>string", "const local=callback;", "return local"},
		{"written", "callback:()=>string", "", "callback=quiet;return callback"},
		{"rest", "...callback:Array<()=>string>", "", "return callback[0]"},
		{"receiver", "callback:()=>string", "", "return this.x"},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function quiet(){return 'quiet'}function browser(){return window.name}function factory(` + row.parameters + `){` + row.setup + `return ({x:'receiver',get value(){` + row.body + `}}).value}export function invoke(){return factory(browser)}`
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
				facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(creating))
				work := registerCallableEffectWork(facts)
				var operation *ast.Node
				caller := -1
				for index, fact := range facts {
					if fact.summary.Name == "factory" {
						caller = index
						walkNode(fact.node.Body(), func(node *ast.Node) bool {
							if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "value" {
								operation = node
							}
							return true
						})
					}
				}
				if caller < 0 || operation == nil {
					t.Fatal("original source Get missing")
				}
				if _, registered := work.registerStagedGetResult(facts, caller, operation, owner); !registered {
					t.Fatal("original roles refused")
				}
				work.observeStagedGetResult(facts, caller, operation, owner)
				request := stagedGetResultRequest(operation, facts[caller].node, "effects", nil)
				if work.operationRecipes[request.producer].delta.extracted {
					t.Fatal("unsupported capture DATA acquired local Get coverage")
				}
			})
		})
	}
}
