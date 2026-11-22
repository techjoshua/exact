package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestComponentOriginalHelperMutation keeps server ownership at the component call site.
func TestComponentOriginalHelperMutation(t *testing.T) {
	for _, row := range []struct{ name, helper, call string }{
		{"direct", `function apply(state:{value:number}){state.value=2;return state;}`, `apply(this.state);return this.state.value`},
		{"default-server", `function apply(state:{value:number}){state.value=2;return state;}`, `apply(this.state);return this.state.value`},
		{"alias", `function apply(state:{value:number}){state.value=2;return state;}const alias=apply;`, `alias(this.state);return this.state.value`},
		{"collection-direct", `function apply(state:{value:number}){state.value=2;return state;}`, `this.state.values.push(2);return this.state.values.length`},
		{"nested-only", `function apply(state:{value:number}){state.value=2;return state;}`, `function scalar(value:number){return value+1}return scalar(this.state.value)`},
		{"async", `async function apply(state:{value:number}){await Promise.resolve();state.value=2;return state;}`, `await apply(this.state);return this.state.value`},
		{"signal", `function observe(state:{value:number}){return state.value;}async function apply(signal?:AbortSignal){await Promise.resolve();return signal?.aborted;}function unrelated(value?:number){return value;}function choose(active:boolean){return active?{apply,unrelated}:undefined;}`, `observe(this.state);await apply();await apply(task.signal);const present=choose(true);await present?.apply();await choose(true)?.apply();await choose(false)?.apply(task.signal);choose(true)?.unrelated();unrelated();return this.state.value`},
		{"subscription", `function apply(state:{value:number}){return state.value;}`, `apply(this.state);const store={subscribe(){return ()=>{};},ordinary(){return ()=>{};}};const owned=store.subscribe();void owned;const ordinary=store.ordinary();void ordinary;return this.state.value`},
	} {
		t.Run(row.name, func(t *testing.T) {
			root, err := os.MkdirTemp(".", ".component-original-helper-")
			if err != nil {
				t.Fatal(err)
			}
			defer os.RemoveAll(root)
			root, err = filepath.Abs(root)
			if err != nil {
				t.Fatal(err)
			}
			source := `import {TaskContext,type Component} from '@exactjs/core';` + row.helper + `export function Page(this:Component<{value:number;values:number[]}>){this.state.value=0;this.state.values=[];const save=async(task:TaskContext=TaskContext.server().blocking())=>{` + row.call + `};save();return()=>this.state.value}`
			if row.name == "default-server" {
				source = strings.Replace(source, "TaskContext.server().blocking()", "TaskContext.server()", 1)
			}
			file := filepath.Join(root, "page.ts")
			config := filepath.Join(root, "tsconfig.json")
			if err = os.WriteFile(file, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
			if err = os.WriteFile(config, []byte(`{"compilerOptions":{"target":"esnext","module":"esnext","moduleResolution":"bundler","lib":["esnext","dom"],"strict":true,"noEmit":true,"skipLibCheck":true},"files":["page.ts"]}`), 0600); err != nil {
				t.Fatal(err)
			}
			r := NewSession().Execute(Request{Kind: "compile", ID: file, Root: root, ConfigFile: config, Source: source, Target: TargetServer, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics, r.Code)
			}
			if strings.Contains(r.Code, "__exact_owned_") {
				t.Fatal("ordinary helper acquired a companion", r.Code)
			}
			if row.name == "collection-direct" || row.name == "nested-only" {
				if strings.Contains(r.Code, "__exactCreateTaskState") {
					t.Fatal("unrelated direct server work was staged", r.Code)
				}
			} else if !strings.Contains(r.Code, ".helper(") || !strings.Contains(r.Code, ".read(") {
				t.Fatal("component lost pending invocation/read", r.Code)
			}
			if row.name == "signal" {
				if len(r.Analysis.Tasks) != 1 || len(r.Analysis.Tasks[0].SignalCalls) != 5 ||
					strings.Count(r.Code, ".helper(apply)(") < 2 ||
					strings.Contains(r.Code, ".helper(apply)()") ||
					strings.Contains(r.Code, "?.apply()") ||
					!strings.Contains(r.Code, "?.unrelated()") ||
					!strings.Contains(r.Code, ".helper(unrelated)()") {
					t.Fatal("pending helper lost task cancellation", r.Analysis.Tasks, r.Code)
				}
			}
			if row.name == "subscription" {
				for _, line := range strings.Split(r.Code, "\n") {
					if strings.Contains(line, `helperMember(store, "subscribe"`) && !strings.Contains(line, "__exactTaskResource(") {
						t.Fatal("pending subscription lost generation ownership", line, r.Code)
					}
					if strings.Contains(line, `helperMember(store, "ordinary"`) && strings.Contains(line, "__exactTaskResource(") {
						t.Fatal("ordinary pending callable acquired generation ownership", line, r.Code)
					}
				}
				if !strings.Contains(r.Code, `helperMember(store, "subscribe"`) || !strings.Contains(r.Code, `helperMember(store, "ordinary"`) {
					t.Fatal("expected pending member calls", r.Code)
				}
			}
			if !strings.Contains(r.Code, "function apply(") {
				t.Fatal("ordinary helper binding lost", r.Code)
			}
		})
	}
}

// TestComponentOriginalImportedInvokedHelper covers the public event-invoked server owner,
// separately from setup-owned task activation. The selected JS body remains ordinary.
func TestComponentOriginalImportedInvokedHelper(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.ts": `export {};`,
		"entry.tsx": `import {TaskContext,type Component} from '@exactjs/core';import {apply} from './helper.js';
async function selected(signal?:AbortSignal){return signal?.aborted;}
export function Page(this:Component<{value:number}>){
	this.state.value=0;
	async function save(task:TaskContext=TaskContext.server()){
		apply(this.state);
		await selected();
		const store={subscribe(){return ()=>{};}};
		const unsubscribe=store.subscribe();void unsubscribe;
		return this.state.value;
	}
	return()=> <button onClick={()=>save()}>save</button>;
}`,
		"helper.ts": `export function apply(state:{value:number}){state.value=2;}`,
		"helper.js": `/** @param {{value:number}} state */ export function apply(state){state.value=99;}`,
	})
	if r := f.synchronizeTarget([]ExecutableEdge{{"entry.tsx", 1, "./helper.js", "import", "helper.js"}}, TargetServer); r.Error != "" {
		t.Fatal(r.Error)
	}
	request := f.request("compile", "entry.tsx")
	request.Target = TargetServer
	r := f.session.Execute(request)
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatal(r.Error, r.Diagnostics, r.Code)
	}
	if len(r.Analysis.Tasks) != 1 || !r.Analysis.Tasks[0].Invoked || !r.Analysis.Tasks[0].FunctionDefined || len(r.Analysis.Tasks[0].Writes) != 1 || r.Analysis.Tasks[0].Writes[0].Path != "value" {
		t.Fatal("lost actual invoked state write", r.Analysis.Tasks)
	}
	invocation := false
	for _, c := range r.Analysis.Continuations {
		invocation = invocation || c.Invocation != nil
	}
	if !invocation {
		t.Fatal("missing public invocation", r.Analysis.Continuations)
	}
	if strings.Contains(r.Code, "__exact_owned_") {
		t.Fatal("companion emitted", r.Code)
	}
	if !containsString(executableImportBindings(r.Code, "./helper.js"), "apply") {
		t.Fatal("ordinary import lost", r.Code)
	}
	// Both the component placeholder and reconstructed executor must call the original helper
	// through their caller-owned context and retain the later pending read.
	if strings.Count(r.Code, ".helper(") < 2 || strings.Count(r.Code, ".read(") < 2 {
		t.Fatal("invoked executor bypassed pending helper/read", r.Code)
	}
	if strings.Contains(r.Code, ".helper(selected)()") || !strings.Contains(r.Code, ".helper(selected)(") {
		t.Fatal("invoked helper lost task cancellation", r.Code)
	}
	for _, line := range strings.Split(r.Code, "\n") {
		if strings.Contains(line, `helperMember(store, "subscribe"`) && !strings.Contains(line, "__exactTaskResource(") {
			t.Fatal("invoked helper lost subscription ownership", line, r.Code)
		}
	}
	if !strings.Contains(r.Code, `helperMember(store, "subscribe"`) {
		t.Fatal("expected invoked pending subscription", r.Code)
	}
}

// TestComponentActivationPendingHelperCapture exercises source-spanned activation
// arguments in pending lowering alongside the authored receiver of a writing helper.
func TestComponentActivationPendingHelperCapture(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, effect := range []string{"void left.value", "left.value='after'"} {
			t.Run(string(target)+"/"+effect, func(t *testing.T) {
				source := `import {TaskContext,type Component} from '@exactjs/core';
import {apply} from './helper.js';
export function Page(this:Component<{left:{value:string;sibling:string};result:string}>){
this.state.left={value:'before',sibling:'take'};this.state.result='';
async function run(snapshot=this.state.left.value,task:TaskContext=TaskContext.` + string(target) + `().blocking()){
const entry=this.state.left.value;
apply(this.state.left,this.state.left.sibling==='take');
this.state.result=snapshot+':'+entry+':'+this.state.left.value+':'+this.state.left.sibling;
}
run();return()=> <output>{this.state.result}</output>;
}`
				f := newExecutableFixture(t, map[string]string{
					"entry.ts":  "export {};",
					"entry.tsx": source,
					"helper.ts": `export function apply(left:{value:string},enabled:boolean){if(enabled){` + effect + `;}}`,
				})
				request := f.request("compile", "entry.tsx")
				request.Target = target
				response := f.session.Execute(request)
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				if !strings.Contains(response.Code, ".helper(apply)(") {
					t.Fatal("original helper lost its pending caller", response.Code)
				}
			})
		}
	}
}

// TestPendingServerContinuationContextCalls retains direct component context operations
// while ordinary member calls in the same task keep their pending receiver.
func TestPendingServerContinuationContextCalls(t *testing.T) {
	const source = `
import { createContext, TaskContext, type Component } from '@exactjs/core';
export const ServerValue = createContext<number>('server-value', { keep: 'server', scope: 'request' });
const PublicValue = createContext<number>('public-value', { keep: 'shared' });
function read(state: { value: number }) { return state.value; }
export function Page(this: Component<{ value: number }>) {
	this.state.value = 1;
	this.setContext(PublicValue, 0);
	async function run(task: TaskContext = TaskContext.server().blocking()) {
		void task;
		const reader = { getContext() { return 2; } };
		const value = read(this.state) + this.getContext(ServerValue) + reader.getContext();
		this.setContext(PublicValue, value);
		this.state.value = value;
	}
	void run();
	return () => <button onClick={() => run()}>{this.state.value}</button>;
}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			f := newExecutableFixture(t, map[string]string{"entry.ts": "export {};", "entry.tsx": source})
			request := f.request("compile", "entry.tsx")
			request.Target = target
			r := f.session.Execute(request)
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics, r.Code)
			}
			if target == TargetClient {
				if strings.Contains(r.Code, "server-value") {
					t.Fatal("private token reached the client", r.Code)
				}
				return
			}
			if !strings.Contains(r.Code, `.getContext(ServerValue, "ServerValue")`) ||
				!strings.Contains(r.Code, `["PublicValue"] = value`) ||
				!strings.Contains(r.Code, `.helperMember(reader, "getContext",`) ||
				strings.Contains(r.Code, `"getContext", false)(ServerValue)`) {
				t.Fatal("context and ordinary calls lost their respective receivers", r.Code)
			}
		})
	}
}
