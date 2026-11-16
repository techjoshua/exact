package exactcompiler

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Actual source Calls enter the public task collector. No synthetic Task,
// selected Get, binder, context frame or graph receipt supplies these positives.
func TestTaskStandardCallActivationSources(t *testing.T) {
	for _, row := range []struct {
		name, definition, call string
		explicit, adapted      bool
	}{
		{"implicit-call", `function run(value:number){document.title;return value}`, `run.call(undefined,1);`, false, true},
		{"parenthesized-initializer", `const run=((value:number)=>{document.title;return value});`, `run.call(undefined,1);`, false, true},
		{"asserted-initializer", `const run=((value:number)=>{document.title;return value}) as (value:number)=>number;`, `run.call(undefined,1);`, false, true},
		{"parenthesized-function-initializer", `const run=(function(value:number){document.title;return value});`, `run.call(undefined,1);`, false, true},
		{"nested-transparent-initializer", `const run=(((value:number)=>{document.title;return value}) satisfies (value:number)=>number)!;`, `run.call(undefined,1);`, false, true},
		{"implicit-direct", `function run(value:number){document.title;return value}`, `run(1);`, false, false},
		{"ordinary-alias", `function run(value:number){document.title;return value}const alias=run;`, `alias(1);`, false, false},
		{"const-function-alias", `const run=(function(value:number){document.title;return value});const alias=run;`, `alias(1);`, false, false},
		{"const-function-call-alias", `const run=((value:number)=>{document.title;return value});const alias=run;`, `alias.call(undefined,1);`, false, true},
		{"call-alias", `function run(value:number){document.title;return value}const alias=run;`, `alias.call(undefined,1);`, false, true},
		{"canonical-this", `function run(this:Component<{value:number}>,value:number){this.state.value=value}`, `run.call(this,1);`, false, true},
		{"explicit-call", `function run(value:number,task:TaskContext=TaskContext.client()){document.title;return value}`, `run.call(this,1);`, true, true},
		{"explicit-direct", `function run(value:number,task:TaskContext=TaskContext.client()){document.title;return value}`, `run(1);`, true, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;` + row.definition + row.call + `return()=>null}`
			session := NewSession()
			r := session.Execute(Request{Kind: "compile", ID: "task-standard-call-" + row.name + ".ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
				t.Fatal("actual task activation", r.Error, r.Diagnostics)
			}
			found := false
			for _, task := range r.Analysis.Tasks {
				if task.Invoked {
					continue
				}
				if task.ArgumentCount != 1 || task.ActivationArgumentCount != 1 {
					t.Fatal("receiver changed runtime argument positions", task.ArgumentCount, task.ActivationArgumentCount)
				}
				if len(task.Dependencies) == 0 || task.Dependencies[len(task.Dependencies)-1].Path != "1" {
					t.Fatal("actual task input dependency lost", task.Dependencies)
				}
				if row.adapted {
					d := task.activationSource
					if d == nil || d.hold != "" || len(d.actuals) != 1 || d.receiverMode == 0 || !d.sourceCurrent(d.source, d.call) {
						t.Fatal("UNREACHED original source-owned standard call")
					}
					if d.actuals[0] == d.receiver {
						t.Fatal("receiver became argument0")
					}
				} else if task.activationSource != nil {
					t.Fatal("ordinary alias/direct call acquired native adapter ownership")
				}
				found = true
			}
			if !found {
				t.Fatal("UNREACHED actual task activation")
			}
		})
	}
}

func TestTaskStandardCallExplicitContextRefusers(t *testing.T) {
	for _, call := range []string{`run(1,TaskContext.client());`, `run.call(this,1,TaskContext.client());`} {
		source := `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{}>){function run(value:number,task:TaskContext=TaskContext.client()){document.title} ` + call + `return()=>null}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "task-standard-context-refuser.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
		if r.Error != "" || r.Code != "" {
			t.Fatal("genuine context actual lost user-diagnostic owner", r.Error)
		}
		found := false
		for _, d := range r.Diagnostics {
			found = found || d.Code == "EXACT2001" && strings.Contains(d.Message, "must omit the compiler-supplied TaskContext argument")
		}
		if !found {
			t.Fatal("explicit compiler context actual accepted", r.Diagnostics)
		}
	}
}

// These are entry experiments for actual unconnected task input domains. An
// unrelated native prerequisite or absent task entry is UNREACHED, not a pass.
func TestTaskStandardCallUnconnectedAcquisition(t *testing.T) {
	for _, row := range []struct{ name, setup, call string }{
		{"arbitrary-receiver", `const receiver={};`, `run.call(receiver,1);`},
		{"effectful-receiver", `function receiver(){document.title;return undefined}`, `run.call(receiver(),1);`},
		{"apply-vector", `const actuals:[number]=[1];`, `run.apply(this,actuals);`},
		{"zero-prefix-bind", `const bound=run.bind(undefined);`, `bound(1);`},
		{"captured-bind", `const bound=run.bind(undefined,1);`, `bound();`},
		{"nested-adapter", "", `run.call.call(run,undefined,1);`},
		{"own-call-write", `Object.defineProperty(run,'call',{value:()=>{document.title;return 2}});`, `run.call(undefined,1);`},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import{type Component}from'@exactjs/core';export function Page(this:Component<{}>){function run(value:number){document.title;return value}` + row.setup + row.call + `return()=>null}`
			r := NewSession().Execute(Request{Kind: "compile", ID: "task-native-input-hold-" + row.name + ".ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
			if !strings.Contains(r.Error, "Compiler analysis coverage gap: task activation inputs at") {
				t.Fatal("UNREACHED actual task input hold", r.Error, r.Diagnostics)
			}
			if r.Code != "" || r.SourceMap != nil || len(r.Analysis.Tasks) != 0 || len(r.Analysis.Callables) != 0 {
				t.Fatal("unowned adapter input published partial task artifacts")
			}
		})
	}
}

const taskStandardCallRuntimeSource = `import {TaskContext,type Component}from'@exactjs/core';
function argument(value:string){document.title;return value}
function fallback(){document.baseURI;return '!'}
function Search(this:Component<{query:string}>){const suffix='?';const helper=()=>suffix;
function work(value:string,other:string=fallback(),task:TaskContext=TaskContext.client().blocking()){if(task.signal.aborted)throw new Error('stale task');document.URL;return value+other+helper()}
work.call(undefined,argument(this.state.query));REUSE}`

func TestTaskStandardCallRuntime(t *testing.T) {
	for _, mode := range []string{"reconstructed", "reused"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(mode+"/"+string(target), func(t *testing.T) {
				tail := ""
				if mode == "reused" {
					tail = `return()=>work('event')`
				}
				source := strings.Replace(taskStandardCallRuntimeSource, "REUSE", tail, 1)
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-standard-call-runtime.ts", Source: source, Target: target, Diagnostics: "semantic"})
				assertContinuationTaskCompilation(t, target, r)
				entry := false
				for _, task := range r.Analysis.Tasks {
					if task.Invoked {
						continue
					}
					if task.activationSource != nil {
						if task.ArgumentCount != 2 || task.ActivationArgumentCount != 1 || !containsTaskCapturedParameter(task, 1) || task.ReusesInvokedDefinition != (mode == "reused") {
							t.Fatal("UNREACHED normalized defaults/reuse task", task.ArgumentCount, task.ActivationArgumentCount, task.CapturedParameters, task.ReusesInvokedDefinition)
						}
						entry = true
					}
				}
				if !entry {
					t.Fatal("UNREACHED original normalized activation runtime branch")
				}
				runTaskStandardCallArtifact(t, r.Code, target, taskStandardCallRuntimeConsumer)
			})
		}
	}
}
func containsTaskCapturedParameter(task Task, index int) bool {
	for _, p := range task.CapturedParameters {
		if p == index {
			return true
		}
	}
	return false
}

// Matched existing task owner/frame APIs execute generated code. This proves
// activation inputs/defaults/captures and cleanup, not DOM mounting or hydration.
func runTaskStandardCallArtifact(t *testing.T, code string, target Target, consumer string) {
	t.Helper()
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err = os.Stat(filepath.Join(root, "packages/core/package.json")); err == nil {
			break
		}
		next := filepath.Dir(root)
		if next == root {
			t.Fatal("runtime prerequisites absent")
		}
		root = next
	}
	directory, err := os.MkdirTemp(".", ".task-call-runtime-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(directory) })
	directory, err = filepath.Abs(directory)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(directory, "emitted.mts"), []byte(code+"\nexport{Search};\n"), 0600); err != nil {
		t.Fatal(err)
	}
	config, _ := json.Marshal(map[string]any{"compilerOptions": map[string]any{"target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext", "noCheck": true, "outDir": "erased"}, "include": []string{"emitted.mts"}})
	if err = os.WriteFile(filepath.Join(directory, "tsconfig.json"), config, 0600); err != nil {
		t.Fatal(err)
	}
	erase := exec.Command("node", filepath.Join(root, "node_modules/@typescript/native/bin/tsc"), "-p", filepath.Join(directory, "tsconfig.json"))
	if output, err := erase.CombinedOutput(); err != nil {
		t.Fatalf("official TS erasure: %v %s", err, output)
	}
	file := filepath.Join(directory, "consumer.mjs")
	if err = os.WriteFile(file, []byte(consumer), 0600); err != nil {
		t.Fatal(err)
	}
	args := []string{}
	if target == TargetClient {
		args = append(args, "--conditions=browser")
	}
	args = append(args, file, string(target), filepath.Join(directory, "erased/emitted.mjs"), root)
	if output, err := exec.Command("node", args...).CombinedOutput(); err != nil {
		t.Fatalf("matched actual %s artifact: %v %s", target, err, output)
	} else if strings.TrimSpace(string(output)) != "PASS native call task inputs/defaults/captures/cleanup" {
		t.Fatalf("unexpected runtime report %s", output)
	}
}

const taskStandardCallRuntimeConsumer = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';import{indexedReactive,flushSync}from'@exactjs/reactive';
const[target,module,root]=process.argv.slice(2),folder=pathToFileURL(root+'/packages/core/dist/'+target+'/tasks/');
const{createTaskOwnerRecord}=await import(new URL('frame-runtime.js',folder));const{registerTaskOwnerHost}=await import(new URL('owner-hosts.js',folder));const{deferTaskOwnerActivations,releaseTaskOwnerActivations}=await import(new URL('owner-activations.js',folder));const{taskStatus}=await import(new URL('runtime.js',folder));
const trace=[];globalThis.document={get title(){trace.push('argument');return''},get baseURI(){trace.push('default');return''},get URL(){trace.push('body');return''}};
const{Search}=await import(pathToFileURL(module));const owner=createTaskOwnerRecord('standard-call-consumer'),host={state:indexedReactive(['query'])};host.state.query='initial';registerTaskOwnerHost(host,owner);deferTaskOwnerActivations(owner);
try{Search.call(host);releaseTaskOwnerActivations(owner,()=>false);await new Promise(r=>setImmediate(r));flushSync();if(target==='client'){assert.equal(owner.activationRegistrations.size,1);const registration=[...owner.activationRegistrations][0],status=taskStatus(registration.task,{owner});assert.equal(status.error,undefined);assert.equal(status.result,'initial!?');assert.deepEqual(trace,['argument','default','body']);host.state.query='later';flushSync();await new Promise(r=>setImmediate(r));flushSync();assert.equal(status.result,'later!?');assert.deepEqual(trace,['argument','default','body','argument','default','body'])}else{assert.equal(owner.activationRegistrations.size,0);assert.deepEqual(trace,[])}}
finally{await owner[Symbol.asyncDispose]()}assert.equal(owner.activationRegistrations.size,0);assert.equal(owner.frames.size,0);const prior=trace.length;host.state.query='disposed';flushSync();await new Promise(r=>setImmediate(r));assert.equal(trace.length,prior);console.log('PASS native call task inputs/defaults/captures/cleanup');`

func TestTaskStandardCallRetainedSource(t *testing.T) {
	source := strings.Replace(taskStandardCallRuntimeSource, "REUSE", "", 1)
	session := NewSession()
	request := Request{Kind: "compile", ID: "task-call-retained.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"}
	first := session.Execute(request)
	assertContinuationTaskCompilation(t, TargetClient, first)
	old := actualTaskStandardCall(t, first)
	if !old.activationSource.sourceCurrent(old.activationSource.source, old.activationSource.call) {
		t.Fatal("original description unavailable")
	}
	repeated := session.Execute(request)
	assertContinuationTaskCompilation(t, TargetClient, repeated)
	if first.Code != repeated.Code {
		t.Fatal("retained compiler result changed", repeated.Error, repeated.Diagnostics)
	}
	actualTaskStandardCall(t, repeated)
	left, e := json.Marshal(first.Analysis.Tasks)
	if e != nil {
		t.Fatal(e)
	}
	right, e := json.Marshal(repeated.Analysis.Tasks)
	if e != nil {
		t.Fatal(e)
	}
	if string(left) != string(right) {
		t.Fatal("private execution context changed portable task contract")
	}
	request.Source = strings.Replace(source, "const suffix='?'", "const suffix='#'", 1)
	edited := session.Execute(request)
	assertContinuationTaskCompilation(t, TargetClient, edited)
	fresh := actualTaskStandardCall(t, edited)
	if old.activationSource.sourceCurrent(fresh.activationSource.source, old.activationSource.call) {
		t.Fatal("retired source description acquired fresh source association")
	}
	func() {
		defer func() {
			if recover() == nil {
				t.Fatal("actual fresh consumer accepted retired activation packet")
			}
		}()
		taskActivationActuals(old, old.activationSource.call, fresh.activationSource.source)
	}()
	// A passive copy of a still-compatible description is not a new live loan.
	copied := fresh
	if got := taskActivationActuals(copied, fresh.activationSource.call, fresh.activationSource.source); len(got) != 1 {
		t.Fatal("source-compatible description copy lost actual")
	}
}
func actualTaskStandardCall(t *testing.T, r Response) Task {
	t.Helper()
	for _, task := range r.Analysis.Tasks {
		if task.activationSource != nil && !task.Invoked && task.activationSource.hold == "" {
			return task
		}
	}
	t.Fatal("UNREACHED current original task source packet")
	return Task{}
}

func TestTaskStandardCallAnalysisHold(t *testing.T) {
	source := `import{type Component}from'@exactjs/core';export function Page(this:Component<{}>){function run(value:number){document.title}const other={};run.call(other,1);return()=>null}`
	for _, kind := range []string{"analyze", "compile"} {
		r := NewSession().Execute(Request{Kind: kind, ID: "task-call-analysis-hold.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
		if !strings.Contains(r.Error, "Compiler analysis coverage gap: task activation inputs at") || len(r.Analysis.Tasks) != 0 || r.Code != "" || r.SourceMap != nil {
			t.Fatal("incomplete task inputs became public analysis", kind, r.Error, r.Diagnostics)
		}
	}
}

// Same-source app/library contracts include the corrected argument positions;
// private source/checker pointers never participate in process JSON parity.
func TestTaskStandardCallPortable(t *testing.T) {
	source := strings.Replace(taskStandardCallRuntimeSource, "REUSE", "", 1)
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			var app Response
			for _, kind := range []string{"application", "library"} {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-call-portable.ts", Source: source, Target: target, PackageType: kind, Diagnostics: "semantic"})
				assertContinuationTaskCompilation(t, target, r)
				actualTaskStandardCall(t, r)
				if kind == "application" {
					app = r
				} else {
					a, e := json.Marshal(app.Analysis.Tasks)
					if e != nil {
						t.Fatal(e)
					}
					b, e := json.Marshal(r.Analysis.Tasks)
					if e != nil {
						t.Fatal(e)
					}
					if app.Code != r.Code || string(a) != string(b) {
						t.Fatal("application caller changed component task input contract")
					}
				}
			}
		})
	}
}

const taskStandardCallCanonicalSource = `import{type Component}from'@exactjs/core';async function Search(this:Component<{query:string}>){this.state.query='initial';async function helper(this:{state:{query:string}},value:string){this.state.query=value;return value}await helper.call(this,'changed');return()=>null}`

func TestTaskStandardCallCanonicalReceiverRuntime(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "task-canonical-call-runtime.ts", Source: taskStandardCallCanonicalSource, Target: target, Diagnostics: "semantic"})
			assertContinuationTaskCompilation(t, target, r)
			task := actualTaskStandardCall(t, r)
			if task.ArgumentCount != 1 || task.ActivationArgumentCount != 1 || task.activationSource.receiverMode != 1 {
				t.Fatal("TSthis became a runtime actual", task.ArgumentCount, task.ActivationArgumentCount)
			}
			runTaskStandardCallArtifact(t, r.Code, target, taskStandardCallCanonicalConsumer)
		})
	}
}

const taskStandardCallCanonicalConsumer = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';import{indexedReactive,flushSync}from'@exactjs/reactive';const[target,module,root]=process.argv.slice(2),folder=pathToFileURL(root+'/packages/core/dist/'+target+'/tasks/');const{createTaskOwnerRecord}=await import(new URL('frame-runtime.js',folder));const{registerTaskOwnerHost}=await import(new URL('owner-hosts.js',folder));const{deferTaskOwnerActivations,releaseTaskOwnerActivations}=await import(new URL('owner-activations.js',folder));const{Search}=await import(pathToFileURL(module));const owner=createTaskOwnerRecord('canonical-call-consumer'),host={state:indexedReactive(['query'])};registerTaskOwnerHost(host,owner);deferTaskOwnerActivations(owner);try{const pending=Search.call(host);releaseTaskOwnerActivations(owner,()=>false);await pending;await new Promise(r=>setImmediate(r));flushSync();assert.equal(host.state.query,'changed')}finally{await owner[Symbol.asyncDispose]()}assert.equal(owner.frames.size,0);assert.equal(owner.activationRegistrations.size,0);console.log('PASS native call task inputs/defaults/captures/cleanup');`

func TestTaskStandardCallOrdinaryAdapterOwners(t *testing.T) {
	for _, row := range []struct{ name, body string }{
		{"synchronous", `const result=helper.apply(undefined,[1]);const bound=helper.bind(undefined,2);const second=bound();const third=ordinary.call(3);void[result,second,third];`},
		{"body", `function run(task:TaskContext=TaskContext.client()){const bound=helper.bind(undefined,2);return helper.apply(undefined,[bound()])+ordinary.call(3)}return()=>run();`},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import{TaskContext,type Component}from'@exactjs/core';function helper(value:number){return value}export function Page(this:Component<{}>){const ordinary={call(value:number){return value}};` + row.body + `}`
			r := NewSession().Execute(Request{Kind: "compile", ID: "ordinary-task-adapter-" + row.name + ".ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
			assertContinuationTaskCompilation(t, TargetClient, r)
			for _, task := range r.Analysis.Tasks {
				if task.activationSource != nil {
					t.Fatal("ordinary body/value adapter acquired task input ownership")
				}
			}
		})
	}
}

// The runtime context slot belongs to work shape, not to whether the work
// happens to require an await, signal, child task or state-write transform.
func TestTaskImplicitRuntimeContextShapes(t *testing.T) {
	for _, row := range []struct {
		name, definition, call string
		arguments              int
		adapted                bool
	}{
		{"zero-direct", `function run(){document.title;return 1}`, `run();`, 0, false},
		{"zero-call", `function run(){document.title;return 1}`, `run.call(undefined);`, 0, true},
		{"default-direct", `function run(value:number=1){document.title;return value}`, `run();`, 1, false},
		{"default-call", `function run(value:number=1){document.title;return value}`, `run.call(undefined);`, 1, true},
		{"async-direct", `async function run(value:number){document.title;return value}`, `run(1);`, 1, false},
		{"async-call", `async function run(value:number){document.title;return value}`, `run.call(undefined,1);`, 1, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import{type Component}from'@exactjs/core';export function Page(this:Component<{}>){` + row.definition + row.call + `return()=>null}`
			r := NewSession().Execute(Request{Kind: "compile", ID: "implicit-context-" + row.name + ".ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
				t.Fatal("implicit work context shape", r.Error, r.Diagnostics)
			}
			found := false
			for _, task := range r.Analysis.Tasks {
				if task.Invoked {
					continue
				}
				if task.ArgumentCount != row.arguments {
					t.Fatal("compiler context changed authored runtime positions", task.ArgumentCount)
				}
				if row.adapted != (task.activationSource != nil) {
					t.Fatal("actual implicit call entry missing")
				}
				found = true
			}
			if !found {
				t.Fatal("UNREACHED implicit work context owner")
			}
		})
	}
}

func TestTaskImplicitRestStillRefused(t *testing.T) {
	for _, call := range []string{`run(1);`, `run.call(undefined,1);`} {
		source := `import{type Component}from'@exactjs/core';export function Page(this:Component<{}>){function run(...values:number[]){document.title;return values.length}` + call + `return()=>null}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "implicit-rest-context.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
		if r.Error != "" || r.Code != "" {
			t.Fatal("rest input lost existing diagnostic owner", r.Error, r.Diagnostics)
		}
		found := false
		for _, d := range r.Diagnostics {
			found = found || d.Code == "EXACT2001" && strings.Contains(d.Message, "require fixed argument positions")
		}
		if !found {
			t.Fatal("runtime rest cardinality was invented", r.Diagnostics)
		}
	}
}

// Reuse the original actual-input/default/helper/cleanup consumer. Removing only
// the explicit policy parameter exercises implicit work under the same ABI;
// it neither synthesizes a Task nor changes the authored activation's input.
func TestTaskImplicitRuntimeContextArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			for _, mode := range []string{"direct-reconstructed", "call-reconstructed", "direct-ordinary-value", "call-ordinary-value"} {
				t.Run(mode, func(t *testing.T) {
					source := strings.Replace(taskStandardCallRuntimeSource, ",task:TaskContext=TaskContext.client().blocking()", "", 1)
					source = strings.Replace(source, "if(task.signal.aborted)throw new Error('stale task');", "", 1)
					adapted := strings.HasPrefix(mode, "call-")
					if !adapted {
						source = strings.Replace(source, "work.call(undefined,argument(this.state.query))", "work(argument(this.state.query))", 1)
					}
					ordinaryValue := strings.HasSuffix(mode, "-ordinary-value")
					tail := ""
					if ordinaryValue {
						tail = `return()=>work('event')`
					}
					source = strings.Replace(source, "REUSE", tail, 1)
					r := NewSession().Execute(Request{Kind: "compile", ID: "implicit-runtime-context-" + mode + ".ts", Source: source, Target: target, Diagnostics: "semantic"})
					assertContinuationTaskCompilation(t, target, r)
					found := false
					for _, task := range r.Analysis.Tasks {
						if task.Invoked {
							continue
						}
						if task.ArgumentCount != 2 || task.ActivationArgumentCount != 1 || !containsTaskCapturedParameter(task, 1) || task.ReusesInvokedDefinition || adapted != (task.activationSource != nil) {
							t.Fatal("UNREACHED implicit argument/default/ordinary-value owner", task.ArgumentCount, task.ActivationArgumentCount, task.ReusesInvokedDefinition)
						}
						found = true
					}
					if !found {
						t.Fatal("UNREACHED implicit runtime task")
					}
					consumer := taskStandardCallRuntimeConsumer
					if ordinaryValue {
						consumer = "import{projectPreparedText}from'@exactjs/core/framework/render-structure';\n" + consumer
						if strings.Count(consumer, "try{Search.call(host);") != 1 || strings.Count(consumer, "}else{assert.equal(owner.activationRegistrations.size,0)") != 1 {
							t.Fatal("ordinary value runtime assertions were not attached")
						}
						// The ordinary helper remains inside a component render.
						// Consume its real output through the production text target;
						// the result must not be reinterpreted as an Invoked Task.
						consumer = strings.Replace(consumer, "try{Search.call(host);", "try{const ordinary=Search.call(host);", 1)
						consumer = strings.Replace(consumer, "}else{assert.equal(owner.activationRegistrations.size,0)", ";assert.equal(typeof ordinary,'function');const actualRenderOutput=ordinary();assert.equal(projectPreparedText([actualRenderOutput]),'event!?');assert.equal(status.result,'later!?');assert.equal(owner.activationRegistrations.size,1);assert.deepEqual(trace,['argument','default','body','argument','default','body','default','body'])}else{assert.equal(owner.activationRegistrations.size,0)", 1)
					}
					runTaskStandardCallArtifact(t, r.Code, target, consumer)
				})
			}
		})
	}
}

// A source alias still evaluates its ordinary binding, even when its setup
// invocation is independently reconstructed as task work. Execute that genuine
// generated artifact instead of manufacturing a facade or task reference.
func TestTaskAliasValueArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, adapted := range []bool{false, true} {
			label := "direct"
			if adapted {
				label = "call"
			}
			t.Run(string(target)+"/"+label, func(t *testing.T) {
				source := strings.Replace(taskStandardCallRuntimeSource, ",task:TaskContext=TaskContext.client().blocking()", "", 1)
				source = strings.Replace(source, "if(task.signal.aborted)throw new Error('stale task');", "", 1)
				call := `alias(argument(this.state.query))`
				if adapted {
					call = `alias.call(undefined,argument(this.state.query))`
				}
				source = strings.Replace(source, "work.call(undefined,argument(this.state.query))", "const alias=work;"+call, 1)
				source = strings.Replace(source, "REUSE", "", 1)
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-alias-value-" + label + ".ts", Source: source, Target: target, Diagnostics: "semantic"})
				if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
					t.Fatal("original alias value lost", r.Error, r.Diagnostics)
				}
				found := false
				for _, task := range r.Analysis.Tasks {
					if task.Invoked {
						continue
					}
					if task.ArgumentCount != 2 || task.ActivationArgumentCount != 1 || !containsTaskCapturedParameter(task, 1) || adapted != (task.activationSource != nil) || task.ReusesInvokedDefinition {
						t.Fatal("ordinary alias became invocation authority or lost actual inputs")
					}
					found = true
				}
				if !found {
					t.Fatal("UNREACHED original alias activation")
				}
				runTaskStandardCallArtifact(t, r.Code, target, taskStandardCallRuntimeConsumer)
			})
		}
	}
}

// Real source replacement changes whether an ordinary binding value survives.
// Retention proofs cannot be borrowed from another Program/source version.
func TestTaskAliasValueRetainedSource(t *testing.T) {
	session := NewSession()
	for _, adapted := range []bool{false, true} {
		call := `alias(1);`
		if adapted {
			call = `alias.call(undefined,1);`
		}
		prefix := `import{type Component}from'@exactjs/core';export function Page(this:Component<{}>){function run(value:number){document.title;return value}`
		sources := []string{prefix + `const alias=run;` + call + `return()=>null}`, prefix + `run(1);return()=>null}`, prefix + `const alias=run;` + call + `return()=>null}`}
		for _, source := range sources {
			r := session.Execute(Request{Kind: "compile", ID: "task-alias-source-edit.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
				t.Fatal("current source binding proof was not renewed", r.Error, r.Diagnostics)
			}
			found := false
			for _, task := range r.Analysis.Tasks {
				found = found || !task.Invoked && task.ArgumentCount == 1
			}
			if !found {
				t.Fatal("UNREACHED current task collector")
			}
		}
	}
}

func TestTaskBindingTypeQuerySources(t *testing.T) {
	for _, typed := range []bool{false, true} {
		query := ""
		if typed {
			query = `type Work=typeof run;const value:Work|undefined=undefined;void value;`
		}
		source := `import{type Component}from'@exactjs/core';export function Page(this:Component<{}>){function run(value:number){document.title;return value}` + query + `run(1);return()=>null}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "task-binding-type-query.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
		if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
			t.Fatal("surviving type query or task-only source binding lost", r.Error, r.Diagnostics)
		}
		found := false
		for _, task := range r.Analysis.Tasks {
			found = found || !task.Invoked && task.ArgumentCount == 1
		}
		if !found {
			t.Fatal("UNREACHED original implicit task")
		}
	}
}

// Direct synchronous setup has no outer await for async-component normalization.
// This is a genuine explicit client task with a canonical component receiver;
// the original async managed-setup fixture above remains a separate held control.
const taskStandardCallDirectCanonicalSource = `import{TaskContext,type Component}from'@exactjs/core';function Search(this:Component<{query:string}>){this.state.query='initial';function helper(this:Component<{query:string}>,value:string,task:TaskContext=TaskContext.client().blocking()){if(task.signal.aborted)throw new Error('retired task');document.title;this.state.query=value;return value}helper.call(this,'changed');return()=>null}`

func TestTaskStandardCallDirectCanonicalReceiverRuntime(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "task-direct-canonical-call-runtime.ts", Source: taskStandardCallDirectCanonicalSource, Target: target, Diagnostics: "semantic"})
			assertContinuationTaskCompilation(t, target, r)
			task := actualTaskStandardCall(t, r)
			d := task.activationSource
			if task.ArgumentCount != 1 || task.ActivationArgumentCount != 1 || d.receiverMode != 1 || len(d.actuals) != 1 || d.actuals[0] == d.receiver || !d.sourceCurrent(d.source, d.call) || task.CompilerSetup || task.CompilerComputation || !task.FunctionDefined || task.RequestedPlacement != "client" || task.Placement != "client" {
				t.Fatal("UNREACHED source-owned direct canonical task", task.ArgumentCount, task.ActivationArgumentCount, task.RequestedPlacement, task.Placement, task.CompilerSetup, task.CompilerComputation)
			}
			runTaskStandardCallArtifact(t, r.Code, target, taskStandardCallDirectCanonicalConsumer)
		})
	}
}

const taskStandardCallDirectCanonicalConsumer = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';import{indexedReactive,flushSync}from'@exactjs/reactive';
const[target,module,root]=process.argv.slice(2),folder=pathToFileURL(root+'/packages/core/dist/'+target+'/tasks/');const{createTaskOwnerRecord}=await import(new URL('frame-runtime.js',folder));const{registerTaskOwnerHost}=await import(new URL('owner-hosts.js',folder));const{deferTaskOwnerActivations,releaseTaskOwnerActivations}=await import(new URL('owner-activations.js',folder));const{taskStatus}=await import(new URL('runtime.js',folder));
let bodies=0;globalThis.document={get title(){bodies++;return''}};const{Search}=await import(pathToFileURL(module));const owner=createTaskOwnerRecord('direct-canonical-call-consumer'),host={state:indexedReactive(['query'])};registerTaskOwnerHost(host,owner);deferTaskOwnerActivations(owner);
try{const render=Search.call(host);assert.equal(typeof render,'function');assert.equal(host.state.query,'initial');assert.equal(bodies,0);releaseTaskOwnerActivations(owner,()=>false);await new Promise(r=>setImmediate(r));flushSync();if(target==='client'){assert.equal(owner.activationRegistrations.size,1);const registration=[...owner.activationRegistrations][0],status=taskStatus(registration.task,{owner});assert.equal(status.error,undefined);assert.equal(status.result,'changed');assert.equal(host.state.query,'changed');assert.equal(bodies,1);host.state.query='manual';flushSync();await new Promise(r=>setImmediate(r));flushSync();assert.equal(host.state.query,'manual');assert.equal(status.result,'changed');assert.equal(bodies,1);assert.equal(owner.activationRegistrations.size,1)}else{assert.equal(host.state.query,'initial');assert.equal(bodies,0);assert.equal(owner.activationRegistrations.size,0)}}finally{await owner[Symbol.asyncDispose]()}assert.equal(owner.frames.size,0);assert.equal(owner.activationRegistrations.size,0);const prior=bodies;host.state.query='disposed';flushSync();await new Promise(r=>setImmediate(r));assert.equal(bodies,prior);console.log('PASS native call task inputs/defaults/captures/cleanup');`
