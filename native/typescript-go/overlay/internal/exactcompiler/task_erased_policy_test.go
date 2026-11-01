package exactcompiler

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const derivedTaskPolicyFixture = `
import { TaskContext } from "@exactjs/core";
declare class Component<State> { state: State }
function consume(value:string){return value}
function Search(this: Component<{ query: string }>) {
 const label = this.state.query + "!";
 const __fixtureTask10 = (_task: TaskContext = TaskContext.latest()) => consume(label);
 __fixtureTask10();
}`

// Genuine compiler syntax has no runtime Get, unlike ordinary defaults and the
// authored work. Unknown operations must not become inferred client work.
func TestTaskErasedPolicySources(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			request := Request{Kind: "compile", ID: "derived-policy-qualified.ts", Source: derivedTaskPolicyFixture, Target: target, Diagnostics: "semantic"}
			r := session.Execute(request)
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatalf("genuine policy rejected: %s %#v", r.Error, r.Diagnostics)
			}
			if len(r.Analysis.Tasks) != 1 {
				t.Fatal("missing task")
			}
			task := r.Analysis.Tasks[0]
			if task.Placement != "client" || task.Concurrency != "latest" || task.EnvironmentEffect != "neutral" || len(task.Dependencies) != 1 || task.Dependencies[0].Source != "derived" || task.Dependencies[0].Path != "label" {
				t.Fatalf("task dependency contract lost: %#v", task)
			}
			// Retain the original unresolved consumer as a rejected fixture.
			request.Source = `import { TaskContext } from "@exactjs/core";declare class Component<S>{state:S}function Search(this:Component<{query:string}>){const label=this.state.query+"!";const run=(task:TaskContext=TaskContext.latest())=>missing(label);run();}`
			refused := session.Execute(request)
			if !containsDiagnosticCode(refused.Diagnostics, "EXACT2001") || refused.Code != "" {
				t.Fatalf("unresolved body acquired placement: %#v", refused)
			}
		})
	}

	for _, c := range []struct{ name, source string }{
		{"renamed", strings.ReplaceAll(strings.Replace(derivedTaskPolicyFixture, "{ TaskContext }", "{ TaskContext as Policy }", 1), "TaskContext = TaskContext.latest()", "Policy = Policy.latest()")},
		{"namespace", strings.ReplaceAll(strings.Replace(derivedTaskPolicyFixture, "{ TaskContext }", "* as Core", 1), "TaskContext = TaskContext.latest()", "Core.TaskContext = Core.TaskContext.latest()")},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "renamed-policy.ts", Source: c.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal("genuine imported policy lost", r.Error, r.Diagnostics)
			}
		})
	}
	for _, c := range []struct {
		name, source string
		browser      bool
		refused      bool
	}{
		{"ordinary-default", `function value(){return document.title}export function read(input=value()){return input}`, true, false},
		{"shadowed-marker", `import {TaskContext as Framework,type Component}from"@exactjs/core";export function Page(this:Component<{}>){const TaskContext={latest(){return document.title}};const read=(input=TaskContext.latest())=>input;read();}`, true, true},
		{"replaced-local-marker", `import {TaskContext as Framework,type Component}from"@exactjs/core";export function Page(this:Component<{}>){let TaskContext={latest(){return "safe"}};TaskContext={latest(){return document.title}};const read=(input=TaskContext.latest())=>input;read();}`, true, true},
		{"body-browser", `import {TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{}>){const run=(task:TaskContext=TaskContext.latest())=>document.title;run();}`, true, false},
		{"argument-bearing", `import {TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{}>){const run=(task:TaskContext=TaskContext.key(document.title))=>1;run();}`, true, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "policy-domain-control.ts", Source: c.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) != c.refused {
				t.Fatal(r.Error, r.Diagnostics)
			}
			browser := false
			for _, callable := range r.Analysis.Callables {
				for _, effect := range callable.EffectSources {
					browser = browser || effect.Environment == "browser"
				}
			}
			if browser != c.browser {
				t.Fatalf("real default/body effect lost: %#v", r.Analysis.Callables)
			}
		})
	}

	t.Run("ambient-unknown-consumer", func(t *testing.T) {
		source := strings.Replace(derivedTaskPolicyFixture, "function consume(value:string){return value}", "declare function consume(value:string):string;", 1)
		r := NewSession().Execute(Request{Kind: "compile", ID: "ambient-policy.ts", Source: source, Diagnostics: "semantic"})
		if !containsDiagnosticCode(r.Diagnostics, "EXACT2001") || r.Code != "" {
			t.Fatal("ambient unknown was granted body authority", r.Diagnostics)
		}
	})

	t.Run("invalid-marker", func(t *testing.T) {
		source := strings.Replace(derivedTaskPolicyFixture, "TaskContext.latest()", "TaskContext.notAPolicy()", 1)
		r := NewSession().Execute(Request{Kind: "compile", ID: "invalid-policy.ts", Source: source, Diagnostics: "semantic"})
		if !hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal("invalid marker application accepted", r.Diagnostics)
		}
	})

}

func TestTaskErasedPolicyCache(t *testing.T) {
	session := NewSession()
	request := Request{Kind: "compile", ID: "derived-policy-cache.ts", Source: derivedTaskPolicyFixture, Diagnostics: "semantic"}
	first := session.Execute(request)
	if first.Error != "" || hasErrorDiagnostic(first.Diagnostics) || first.Code == "" {
		t.Fatal(first.Error, first.Diagnostics)
	}
	repeated := session.Execute(request)
	if repeated.Code != first.Code || !reflect.DeepEqual(repeated.Analysis, first.Analysis) {
		t.Fatal("repeat changed derived dependency")
	}
	request.Source = `import {TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{}>){const run=(task:TaskContext=TaskContext.latest())=>document.title;run();}`
	changed := session.Execute(request)
	if len(changed.Analysis.Tasks) != 1 || !changed.Analysis.Tasks[0].BrowserEffects {
		t.Fatal("source replacement lost work effects")
	}
	session.Execute(Request{Kind: "reset"})
	request.Source = derivedTaskPolicyFixture
	reset := session.Execute(request)
	if reset.Code != first.Code || !reflect.DeepEqual(reset.Analysis, first.Analysis) {
		t.Fatal("reset lost genuine classification")
	}
}

// Real emitted bodies use their selected indexed state layout and a registered
// durable task owner. Server projection must elide the inferred client task.
// This exercises the activation ABI, not full DOM or component construction.
func TestTaskErasedPolicyRuntime(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err = os.Stat(filepath.Join(root, "packages/core/package.json")); err == nil {
			break
		}
		parent := filepath.Dir(root)
		if parent == root {
			t.Fatal("repository runtime prerequisites missing")
		}
		root = parent
	}
	for _, kind := range []string{"value", "browser", "throw"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(kind+"/"+string(target), func(t *testing.T) {
				source := derivedTaskPolicyFixture
				if kind == "browser" {
					source = strings.Replace(source, "return value}", "document.title;return value}", 1)
				}
				if kind == "throw" {
					source = strings.Replace(source, "return value}", "throw 9}", 1)
				}
				r := NewSession().Execute(Request{Kind: "compile", ID: "derived-policy-runtime.ts", Source: source, Target: target, Diagnostics: "semantic"})
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
					t.Fatal(r.Error, r.Diagnostics)
				}
				directory, err := os.MkdirTemp(".", ".derived-policy-runtime-")
				if err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() { _ = os.RemoveAll(directory) })
				directory, err = filepath.Abs(directory)
				if err != nil {
					t.Fatal(err)
				}
				module := filepath.Join(directory, "emitted.mts")
				if err = os.WriteFile(module, []byte(r.Code+"\nexport {Search};\n"), 0600); err != nil {
					t.Fatal(err)
				}
				config, _ := json.Marshal(map[string]any{"compilerOptions": map[string]any{"target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext", "noCheck": true, "outDir": "erased"}, "include": []string{"emitted.mts"}})
				if err = os.WriteFile(filepath.Join(directory, "tsconfig.json"), config, 0600); err != nil {
					t.Fatal(err)
				}
				// Official TS7 erasure is not additional semantic typechecking.
				eraser := exec.Command("node", filepath.Join(root, "node_modules/@typescript/native/bin/tsc"), "-p", filepath.Join(directory, "tsconfig.json"))
				if output, err := eraser.CombinedOutput(); err != nil {
					t.Fatalf("TS7 erasure: %v %s", err, output)
				}
				consumer := filepath.Join(directory, "consumer.mjs")
				if err = os.WriteFile(consumer, []byte(taskErasedPolicyConsumer), 0600); err != nil {
					t.Fatal(err)
				}
				args := []string{}
				if target == TargetClient {
					args = append(args, "--conditions=browser")
				}
				args = append(args, consumer, string(target), filepath.Join(directory, "erased/emitted.mjs"), root, kind)
				if output, err := exec.Command("node", args...).CombinedOutput(); err != nil {
					t.Fatalf("matched %s consumer: %v %s", target, err, output)
				} else {
					if strings.TrimSpace(string(output)) != "PASS emitted derived dependency/current activation, once/update, effects/Throw and cleanup" {
						t.Fatalf("unexpected framework report: %s", output)
					}
				}
			})
		}
	}
}

const taskErasedPolicyConsumer = `import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {indexedReactive,flushSync} from '@exactjs/reactive';
const [target,module,root,kind]=process.argv.slice(2);
const folder=pathToFileURL(root+'/packages/core/dist/'+target+'/tasks/');
const {createTaskOwnerRecord}=await import(new URL('frame-runtime.js',folder));
const {registerTaskOwnerHost}=await import(new URL('owner-hosts.js',folder));
const {deferTaskOwnerActivations,releaseTaskOwnerActivations}=await import(new URL('owner-activations.js',folder));
const {taskStatus}=await import(new URL('runtime.js',folder));
let reads=0;globalThis.document={get title(){reads++;return 'browser'}};
const {Search}=await import(pathToFileURL(module));
const owner=createTaskOwnerRecord('derived-policy-consumer');
const host={state:indexedReactive(['query'])};host.state.query='initial';
registerTaskOwnerHost(host,owner);deferTaskOwnerActivations(owner);
try {
 Search.call(host);
 assert.equal(reads,0);
 assert.equal(owner.activationRegistrations.size,target==='client'?1:0);
 if(target==='client') {
  const registration=[...owner.activationRegistrations][0];
  const status=taskStatus(registration.task,{owner});assert.equal(status.generation,0);
  host.state.query='current';flushSync();releaseTaskOwnerActivations(owner,()=>false);
  await new Promise(resolve=>setImmediate(resolve));flushSync();
  assert.equal(status.generation,1);
  if(kind==='throw'){assert.equal(status.error,9);assert.equal(status.result,undefined)}
  else {assert.equal(status.error,undefined);assert.equal(status.result,'current!')}
  assert.equal(reads,kind==='browser'?1:0);
  host.state.query='later';flushSync();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(status.generation,1);assert.equal(reads,kind==='browser'?1:0);
  if(kind!=='throw')assert.equal(status.result,'current!');
 } else {releaseTaskOwnerActivations(owner,()=>false);host.state.query='later';flushSync();assert.equal(reads,0)}
} finally {await owner[Symbol.asyncDispose]()}
assert.equal(owner.activationRegistrations.size,0);assert.equal(owner.frames.size,0);
host.state.query='disposed';flushSync();
console.log('PASS emitted derived dependency/current activation, once/update, effects/Throw and cleanup');
`
