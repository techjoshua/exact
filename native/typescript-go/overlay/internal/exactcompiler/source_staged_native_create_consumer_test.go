package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// Component setup can allocate a value without executing prototype members.
// The emitted operator separately protects prototype identity and native Throw.
func TestStagedNativeCreateConsumerSession(t *testing.T) {
	for _, row := range []struct{ name, source, consumer, runner string }{
		{"formal", `export function invoke(prototype:object){return Object.create(prototype)}`, `invoke({})`, `let reads=0,calls=0,traps=0,prototypeTraps=0;const prototype={get value(){reads++;return 'value'},callback(){calls++;return 'callback'}};const value=m.invoke(prototype);assert.equal(Object.getPrototypeOf(value),prototype);assert.equal(reads,0);assert.equal(calls,0);assert.equal(value.value,'value');assert.equal(value.callback(),'callback');assert.equal(reads,1);assert.equal(calls,1);let functionCalls=0;function callable(){functionCalls++}const callableValue=m.invoke(callable);assert.equal(Object.getPrototypeOf(callableValue),callable);assert.equal(functionCalls,0);const proxy=new Proxy(prototype,{get(t,k,r){traps++;return Reflect.get(t,k,r)},getPrototypeOf(t){prototypeTraps++;return Reflect.getPrototypeOf(t)}});const proxyValue=m.invoke(proxy);assert.equal(Object.getPrototypeOf(proxyValue),proxy);assert.equal(traps,0);assert.equal(prototypeTraps,0);assert.equal(proxyValue.value,'value');assert.equal(traps,1);assert.equal(reads,2);const failure=new Error('prototype getter');const throwing=m.invoke({get value(){throw failure}});assert.throws(()=>throwing.value,error=>error===failure);assert.throws(()=>m.invoke(1),TypeError);assert.equal(Object.getPrototypeOf(m.invoke(null)),null);`},
		{"null", `export function invoke(){return Object.create(null)}`, `invoke()`, `const value=m.invoke();assert.equal(Object.getPrototypeOf(value),null);assert.deepEqual(Reflect.ownKeys(value),[]);`},
		{"inert literal", `export function invoke(){return Object.create({get value(){window.name;return 'value'},callback:()=>document.title})}`, `invoke()`, `let reads=0,calls=0;globalThis.window={get name(){reads++;return 'name'}};globalThis.document={get title(){calls++;return 'title'}};const value=m.invoke();const prototype=Object.getPrototypeOf(value);assert.equal(Object.getPrototypeOf(prototype),Object.prototype);assert.deepEqual(Reflect.ownKeys(value),[]);assert.equal(reads,0);assert.equal(calls,0);assert.equal(value.value,'value');assert.equal(value.callback(),'title');assert.equal(reads,1);assert.equal(calls,1);`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(row.name+"/"+string(target), func(t *testing.T) {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/create-input-consumer.ts", Source: row.source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				for _, effect := range executableSummary(t, analyzeComponentNativeCall(t, row.source, row.consumer, target), "invoke").EffectSources {
					if effect.Environment == "browser" || effect.Environment == "unknown" {
						t.Fatalf("prototype acquisition or stored body activated: %#v", effect)
					}
				}
				file := filepath.Join(t.TempDir(), "create.mts")
				if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);` + row.runner
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatalf("%s: %v %s", target, err, output)
				}
			})
		}
	}
}

// Component task placement uses the executed constructor and freeze effects.
// Authored replacements and an opaque producer keep their independent requirements.
func TestComponentNativeObjectConstructionTaskEffects(t *testing.T) {
	for _, row := range []struct {
		name, declarations, body, effect string
	}{
		{"shadowed create", `const Object={create(_prototype:object|null){window.name;return {value:1}}};`, `this.state.label=String(Object.create(null).value)`, "browser"},
		{"replaced create", ``, `const owner={create:Object.create};owner.create=function replacement(_prototype:object|null){window.name;return {value:1}};this.state.label=String(owner.create(null).value)`, "browser"},
		{"descriptor argument", ``, `const candidate=Object.create(null,{value:{value:1}});this.state.label=String(candidate.value)`, ""},
		{"spread create", ``, `const proto={};const params:[object]=[proto];this.state.label=String(Object.getPrototypeOf(Object.create(...params))===proto)`, ""},
		{"module prototype", `const proto={};`, `this.state.label=String(Object.getPrototypeOf(Object.create(proto))===proto)`, ""},
		{"freeze descriptor result", ``, `const candidate=Object.freeze(Object.create(null,{value:{value:1}}));this.state.label=String(candidate.value)`, ""},
		{"freeze opaque result", `declare function make():object;`, `this.state.label=String(Object.isFrozen(Object.freeze(make())))`, "unknown"},
		{"replaced freeze", ``, `const owner={freeze:Object.freeze};owner.freeze=function replacement<T>(value:T){window.name;return value};this.state.label=String(owner.freeze(Object.create(null,{value:{value:1}})).value)`, "browser"},
		{"authored freeze", `const owner={freeze(value:object){window.name;return value}};`, `this.state.label=String(Object.isFrozen(owner.freeze(Object.create(null))))`, "browser"},
		{"saved freeze", ``, `const freeze=Object.freeze;this.state.label=String(Object.isFrozen(freeze(Object.create(null))))`, ""},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {type Component,TaskContext} from '@exactjs/core';
` + row.declarations + `
export function Page(this:Component<{label:string}>){
  this.state.label='ready';
  function show(task:TaskContext=TaskContext.server()){` + row.body + `}
  return ()=> <button onClick={show}>{this.state.label}</button>;
}`
			fixture := newPublicAwaitRequiredFixture(t, source)
			for _, target := range []Target{TargetClient, TargetServer} {
				request := fixture.request("compile", "entry.tsx")
				request.Target = target
				response := NewSession().Execute(request)
				denied := row.effect == "browser"
				if response.Error != "" || len(response.Analysis.Tasks) != 1 ||
					hasErrorDiagnostic(response.Diagnostics) != denied ||
					containsDiagnosticCode(response.Diagnostics, "EXACT2001") != denied ||
					(response.Code == "") != denied {
					t.Fatal(target, response.Error, response.Diagnostics)
				}
				browser, opaque := false, false
				for _, effect := range response.Analysis.Tasks[0].EffectSources {
					browser = browser || effect.Environment == "browser" && effect.Description == "window"
					opaque = opaque || effect.Environment == "unknown" && effect.Description == "unresolved call make"
				}
				if browser != denied || row.effect == "unknown" && !opaque {
					t.Fatal(target, response.Analysis.Tasks[0].EffectSources)
				}
			}
		})
	}
}

// analyzeComponentNativeCall anchors helper Effects to a read in component
// initialization. Runtime controls may compile the ordinary helper separately
// to execute its authored operations without installing a component runtime.
func analyzeComponentNativeCall(t *testing.T, source, invocation string, target Target) Response {
	t.Helper()
	return executeComponentNativeCall(t, nativeComponentCallFixture(t, source, invocation), target, "")
}

func nativeComponentCallFixture(t *testing.T, source, invocation string) *executableFixture {
	t.Helper()
	contents := "import type { Component } from '@exactjs/core';\n" + source + `
export function Page(this: Component<{}>) {
    const created = ` + invocation + `;
    return () => created !== null ? 'ready' : 'missing';
}
`
	return newExecutableFixture(t, map[string]string{"entry.ts": contents})
}

func executeComponentNativeCall(t *testing.T, fixture *executableFixture, target Target, packageType string) Response {
	t.Helper()
	request := fixture.request("analyze", "entry.ts")
	request.Target, request.PackageType = target, packageType
	response := fixture.session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || len(response.Analysis.Components) != 1 {
		t.Fatal(response.Error, response.Diagnostics, response.Analysis.Components)
	}
	invoke, page := executableSummary(t, response, "invoke"), executableSummary(t, response, "Page")
	for _, edge := range page.Calls {
		if edge.Resolved && edge.TargetID == invoke.ID {
			return response
		}
	}
	t.Fatalf("component setup has no original helper edge: %#v", page.Calls)
	return response
}
