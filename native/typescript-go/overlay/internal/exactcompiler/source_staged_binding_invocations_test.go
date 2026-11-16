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

const stagedBindingInvocationSource = `
function browser(){return window.name}
function quiet(){return 'quiet'}
function make(){return()=>window.name}
function unusedFactory(){return()=>document.title}
function relay(callback:()=>string){return callback}
export function direct(){const fn=make();return fn()}
export function saved(){const first=make();const fn=first;const unused=unusedFactory();return fn()}
export function forwarded(){const fn=relay(browser);return fn()}
export function independent(){const first=relay(browser);const second=relay(quiet);first();return second()}
export function partial(other:()=>string){const known=relay(browser);const unknown=relay(other);known();return unknown()}
`

// Only original local-callee Calls activate the returned DATA. Immutable aliases
// retain their producing requirements and independent Calls cannot retarget them.
func TestStagedBindingInvocationSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/binding-invocation.ts", Source: stagedBindingInvocationSource, Target: target, Diagnostics: "semantic", stagedReplacement: true})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		for name, wantUnknown := range map[string]bool{"direct": false, "saved": false, "forwarded": false, "independent": false, "partial": true} {
			known, unknown, dormant := false, false, false
			for _, effect := range executableSummary(t, response, name).EffectSources {
				known = known || effect.Environment == "browser" && effect.Description == "window"
				unknown = unknown || effect.Environment == "unknown"
				dormant = dormant || effect.Environment == "browser" && effect.Description == "document"
			}
			if !known || unknown != wantUnknown || dormant {
				t.Fatalf("%s lost invocation/unknown or activated unused DATA: %#v", name, executableSummary(t, response, name))
			}
		}
		file := filepath.Join(t.TempDir(), "binding-invocation.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.window={get name(){events.push('browser');return 'known'}};globalThis.document={get title(){throw 'unused-data-sentinel'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);assert.equal(m.direct(),'known');assert.equal(m.saved(),'known');assert.equal(m.forwarded(),'known');assert.equal(m.independent(),'quiet');assert.equal(m.partial(()=>{events.push('other');return 'other'}),'other');assert.deepEqual(events,['browser','browser','browser','browser','browser','other']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("runtime %s: %v %s", target, err, output)
		}
	}
}

// Source DATA and required child membership alone do not invoke a callback.
// The actual collector-issued use is the activation boundary, and canonical
// body delivery remains independent of registering that actual invocation.
func TestStagedBindingInvocationOriginalSource(t *testing.T) {
	const source = `function factory(){const fn=()=>window.name;return (fn)()}export function invoke(){return factory()}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(creating))
		work := registerCallableEffectWork(facts)
		var call *ast.Node
		caller := -1
		for index, fact := range facts {
			if fact.summary.Name == "factory" {
				caller = index
				walkNode(fact.node.Body(), func(node *ast.Node) bool {
					if ast.IsCallExpression(node) {
						call = node
					}
					return true
				})
			}
		}
		if caller < 0 || call == nil {
			t.Fatal("original local Call missing")
		}
		read := unwrapSourceCallableReference(call.Expression())
		work.indexOperationSources(facts)
		work.operationGeneration = owner.values.generation
		producer, supported := work.describeStagedCallResultSource(facts, caller, read, owner)
		if !supported || !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: producer.request.producer, callResult: producer}) {
			t.Fatal("original binding DATA producer refused")
		}
		if _, required := work.requireOperation(facts, producer.request); !required {
			t.Fatal("original DATA requirement refused")
		}
		work.prepareOperationUses(facts, owner)
		work.prepareBindingInvocations(facts, owner)
		if len(facts[caller].summary.Calls) != 0 {
			t.Fatal("DATA without reached use invoked a body")
		}
		if !work.stageStagedBindingInvocation(facts, caller, call, owner) {
			t.Fatal("original collector Call refused")
		}
		if len(facts[caller].summary.Calls) != 0 {
			t.Fatal("registration invoked a body")
		}
		work.prepareOperationUses(facts, owner)
		work.prepareBindingInvocations(facts, owner)
		if len(facts[caller].summary.Calls) != 1 {
			t.Fatal("actual local-callee DATA not consumed exactly once")
		}
		work.prepareBindingInvocations(facts, owner)
		if len(facts[caller].summary.Calls) != 1 {
			t.Fatal("cumulative DATA replay duplicated invocation")
		}
		data, available := work.stagedCallResultData(producer.request)
		if !available || len(data.delta.exposures) != 1 || data.delta.exposures[0].creating != nil {
			t.Fatal("binding DATA lost prefix or fabricated B")
		}
		for _, dependency := range work.stagedRequired {
			if dependency.consumed != 0 {
				t.Fatal("invocation membership fabricated canonical delivery")
			}
		}
		body := work.memberNodes[data.delta.exposures[0].endpoint.expression]
		membership := false
		for _, dependency := range work.stagedRequired {
			membership = membership || dependency.operation == call && dependency.producer == body && dependency.consumed == 0
		}
		if !membership || facts[body].staged.ready {
			t.Fatal("actual invocation lost its independent unready canonical body")
		}
	})
}

func TestStagedBindingInvocationUnsupportedInputs(t *testing.T) {
	for _, row := range []struct {
		name, body string
		registered bool
	}{
		{"default", `const fn=(value=window.name)=>value;return fn()`, true},
		{"rest", `const fn=(...values:string[])=>window.name;return fn()`, true},
		{"receiver", `const fn:()=>string=function(this:{value:string}){return this.value};return fn()`, true},
		{"capture", `let value='captured';const fn=()=>value;return fn()`, true},
		{"unavailable", `const fn=opaque();return fn()`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare function opaque():()=>string;function factory(){` + row.body + `}export function invoke(){return factory()}`
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
				facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(creating))
				work := registerCallableEffectWork(facts)
				caller := -1
				var call *ast.Node
				for index, fact := range facts {
					if fact.summary.Name == "factory" {
						caller = index
						walkNode(fact.node.Body(), func(node *ast.Node) bool {
							if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "fn" {
								call = node
							}
							return true
						})
					}
				}
				if caller < 0 || call == nil {
					t.Fatal("actual local invocation missing")
				}
				if registered := work.stageStagedBindingInvocation(facts, caller, call, owner); registered != row.registered {
					t.Fatalf("registration=%t want%t", registered, row.registered)
				}
				work.prepareOperationUses(facts, owner)
				work.prepareBindingInvocations(facts, owner)
				if len(facts[caller].summary.Calls) != 0 {
					t.Fatal("unsupported DATA inputs invoked canonical body")
				}
				if !row.registered {
					return
				}
				pending := false
				for _, use := range facts[caller].staged.operationUses {
					id := work.operationIDs[use.request.producer]
					pending = pending || !work.operations[id.index].delta.extracted
				}
				for _, dependency := range work.stagedRequired {
					pending = pending || dependency.projectionPending
				}
				if !pending {
					t.Fatal("unsupported invocation lost compiler input debt")
				}
				for _, effect := range facts[caller].summary.DirectEffectSources {
					if effect.Environment == "unknown" {
						t.Fatal("compiler input gap became runtime unknown")
					}
				}
			})
		})
	}
}
