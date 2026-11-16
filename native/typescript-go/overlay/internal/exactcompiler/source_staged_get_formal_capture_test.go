package exactcompiler

import (
	"context"
	"fmt"
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
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/get-formal-capture.ts", Source: stagedGetFormalCaptureSource, Target: target, Diagnostics: "semantic", stagedReplacement: true})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			facts := stagedDeclarationFacts(session)
			t.Logf("cached facts after failure: %d", len(facts))
			for _, fact := range facts {
				t.Logf("fact %s@%d ready=%t settled=%t pending=%t", fact.summary.Name, fact.node.Pos(), fact.staged.ready, fact.staged.settled, fact.staged.operationsPending)
				for _, call := range fact.staged.calls {
					t.Logf("call@%d decl@%d source=%t B=%t legacy=%t", call.invocation.operation.Pos(), call.invocation.declaration.Pos(), call.sourceInputs != nil, call.inputs != nil, call.legacyInputs)
				}
				for _, recipe := range fact.staged.operationRecipes {
					if source := recipe.callResult; source != nil {
						t.Logf("result@%d selector=%s get=%+v extracted=%t required=%d values=%d", recipe.key.operation.Pos(), recipe.key.selector.field, source.getResult, recipe.delta.extracted, len(recipe.delta.required), len(recipe.delta.exposures))
					}
				}
			}
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		for name, wantUnknown := range map[string]bool{"direct": false, "independent": false, "partial": true} {
			getter, returned, unknown, dormant := false, false, false, false
			for _, effect := range executableSummary(t, response, name).EffectSources {
				getter = getter || effect.Environment == "browser" && effect.Description == "document"
				returned = returned || effect.Environment == "browser" && effect.Description == "window"
				unknown = unknown || effect.Environment == "unknown"
				dormant = dormant || effect.Environment == "browser" && effect.Description == "navigator"
			}
			if !getter || !returned || unknown != wantUnknown || dormant {
				logGetFormalCaptureResultPackets(t, session)
				t.Fatalf("%s lost getter/callback/unknown or invoked unused input: %#v", name, executableSummary(t, response, name))
			}
		}
		mappedCapture := false
		for _, fact := range stagedDeclarationFacts(session) {
			if fact.summary.Name != "factory" {
				continue
			}
			for _, call := range fact.staged.calls {
				if !originalStagedGetterCall(call) {
					continue
				}
				for _, binding := range call.inputs.bound.bindings {
					if binding.target.kind == relativeRoleCapture {
						t.Fatal("lexical capture plan was installed as actual receiver B")
					}
				}
				for _, binding := range call.inputs.relative.bindings {
					if binding.target.kind != relativeRoleCapture {
						continue
					}
					if len(binding.sources) != 1 || binding.unknown || len(binding.pending) != 0 {
						t.Fatal("represented getter invocation lost its source input role")
					}
					endpoint := binding.sources[0]
					if endpoint.kind != relativeEndpointRole || endpoint.role.kind != relativeRoleFormal || endpoint.role.declaration != fact.node || endpoint.cut != call.inputs.bound.cut || endpoint.producer != call.invocation.operation {
						t.Fatal("getter capture-to-formal producer or original Get cut changed")
					}
					mappedCapture = true
				}
			}
		}
		if !mappedCapture {
			t.Fatal("production Get did not deliver the relative capture consumer")
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

// Failure-only snapshots use retained Session source facts and never prepare,
// consume or revise a result. This separates queued DATA from return projection.
func logGetFormalCaptureResultPackets(t *testing.T, session *Session) {
	t.Helper()
	nodeText := func(node *ast.Node) string {
		if node == nil {
			return "nil"
		}
		return fmt.Sprintf("%s@%d %q", node.Kind, node.Pos(), sourceText(ast.GetSourceFileOfNode(node), node))
	}
	facts := stagedDeclarationFacts(session)
	for _, fact := range facts {
		if fact.summary.Name != "factory" && fact.summary.Name != "direct" {
			continue
		}
		t.Logf("packet fact=%s ready=%t settled=%t pending=%t", nodeText(fact.node), fact.staged.ready, fact.staged.settled, fact.staged.operationsPending)
		for _, call := range fact.staged.calls {
			t.Logf("packet call=%s declaration=%s source=%p B=%p cut=%+v legacy=%t", nodeText(call.invocation.operation), nodeText(call.invocation.declaration), call.sourceInputs, call.inputs, call.invocation.cut, call.legacyInputs)
		}
		for _, recipe := range fact.staged.operationRecipes {
			source := recipe.callResult
			if source == nil {
				continue
			}
			associated := false
			for _, current := range fact.staged.calls {
				associated = associated || current.sourceInputs == source.association.sourceInputs && current.inputs == source.association.inputs && sameSourceRelativeInvocation(current.invocation, source.association.invocation)
			}
			t.Logf("packet key=%s selector=%+v declaration=%s get=%+v operand=%+v extracted=%t required=%d values=%d currentAssociation=%t assocSource=%p assocB=%p readings=%d inputReadings=%d", nodeText(recipe.key.operation), recipe.key.selector, nodeText(source.declaration), source.getResult, source.operand, recipe.delta.extracted, len(recipe.delta.required), len(recipe.delta.exposures), associated, source.association.sourceInputs, source.association.inputs, len(source.readings), len(source.inputReadings))
			for _, required := range recipe.delta.required {
				t.Logf("packet required=%s selector=%+v consumer=%s cut=%+v edge=%s", nodeText(required.producer.operation), required.producer.selector, nodeText(required.consumer), required.cut, required.edge)
			}
			for _, value := range recipe.delta.exposures {
				endpoint := value.endpoint
				t.Logf("packet exposure kind=%d syntax=%s producer=%s creation=%s returning=%s get=%s cut=%+v creatingB=%p", endpoint.kind, nodeText(endpoint.expression), nodeText(endpoint.producer), nodeText(endpoint.creation), nodeText(endpoint.returning), nodeText(endpoint.get), endpoint.cut, value.creating)
			}
			for _, reading := range source.inputReadings {
				reader := -1
				for index := range facts {
					if facts[index].node == reading.request.consumer {
						reader = index
					}
				}
				t.Logf("packet input current=%t outer=%s source=%p B=%p endpoint=%s producer=%s cut=%+v request=%+v", currentStagedInputAssociation(facts, reader, reading.call, reading.endpoint), nodeText(reading.call.invocation.operation), reading.call.sourceInputs, reading.call.inputs, nodeText(reading.endpoint.expression), nodeText(reading.endpoint.producer), reading.endpoint.cut, reading.request)
			}
		}
	}
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
