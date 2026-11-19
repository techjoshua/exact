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
		"entry.ts":  `export {};`,
		"entry.tsx": `import {TaskContext,type Component} from '@exactjs/core';import {apply} from './helper.js';export function Page(this:Component<{value:number}>){this.state.value=0;async function save(task:TaskContext=TaskContext.server()){apply(this.state);return this.state.value;}return()=> <button onClick={()=>save()}>save</button>;}`,
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
