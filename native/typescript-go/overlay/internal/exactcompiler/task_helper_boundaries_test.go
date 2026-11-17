package exactcompiler

import (
	"os"
	"strings"
	"testing"
)

func TestTaskHelperStateViewWarningAndAcknowledgment(t *testing.T) {
	for _, acknowledgment := range []string{"", "/** @exact state-view */"} {
		source := `import {TaskContext,type Component} from '@exactjs/core';
const original={count:0};function compare(state:{count:number}){return state===original;}
export function Page(this:Component<{count:number}>){this.state.count=0;
const run=(task:TaskContext=TaskContext.client().blocking())=>{` + acknowledgment + `
this.state.count=compare(this.state)?1:0;};return()=> <button onClick={()=>run()} />;}`
		response := NewSession().Execute(Request{Kind: "compile", Target: TargetClient, ID: "view-warning.tsx", Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		warned := hasDiagnosticCode(response.Diagnostics, "EXACT2231")
		if warned != (acknowledgment == "") {
			t.Fatalf("unexpected view warning for %q: %#v", acknowledgment, response.Diagnostics)
		}
	}
}

func TestTaskHelperClassBoundaryCannotBeAcknowledgedAway(t *testing.T) {
	for _, receiver := range []string{"this.state.counter.read", `this.state.counter["read"]`, "this.state.counter.field", `this.state.counter["field"]`, "service.read", `service["read"]`, "service.field", `service["field"]`} {
		source := `import {TaskContext,type Component} from '@exactjs/core';
class Counter{count=1;#value=0;read(){return ++this.#value;}field=()=>++this.#value;}const service=new Counter();
export function Page(this:Component<{count:number;counter:Counter}>){this.state.count=0;this.state.counter=new Counter();
const run=(task:TaskContext=TaskContext.client().blocking())=>{/** @exact state-view */
this.state.count=this.state.counter.count;
/** @exact state-view */ this.state.count=` + receiver + `();};return()=> <button onClick={()=>run()} />;}`
		response := NewSession().Execute(Request{Kind: "compile", Target: TargetClient, ID: "view-class.tsx", Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if hasDiagnosticCode(response.Diagnostics, "EXACT2230") != strings.HasPrefix(receiver, "this.state.counter") {
			t.Fatalf("unexpected class boundary for %s: %#v", receiver, response.Diagnostics)
		}
		if strings.Contains(response.Code, "registerTaskHelper") {
			t.Fatal("ordinary class acquired a generated companion")
		}
	}
}

// A server executor owns only the needed lexical definitions. Class identity
// must neither be transported nor replay setup-time work when the task runs.
func TestServerTaskLocalClassDependencies(t *testing.T) {
	for _, row := range []struct {
		name, definitions, body string
		refuse                  bool
	}{
		{"inheritance", `class Parent{read():string{return 'base'}}class Receiver extends Parent{read():string{return super.read()+'-child'}}`, `this.state.label=new Receiver().read()`, false},
		{"receiver capture", `const seed='captured';class Parent{read():string{return seed}}class Receiver extends Parent{read():string{return this.base()}base():string{return super.read()}}`, `this.state.label=new Receiver().read()`, false},
		{"shadow", `class Receiver{read():string{return 'outer'}}`, `{class Receiver{read():string{return 'inner'}}this.state.label=new Receiver().read()}`, false},
		{"client original scope", `class Receiver{static value=1;read():string{return 'value'}}`, `this.state.label=new Receiver().read()`, false},
		{"parameter decorator", `function stamp(_target:object,_key:string|symbol,_index:number){}class Receiver{read(@stamp value=0):string{return 'value'}}`, `this.state.label=new Receiver().read()`, true},
		{"leaked receiver", `function leak(value:unknown):string{return String(value)}class Receiver{read():string{return leak(this)}}`, `this.state.label=new Receiver().read()`, true},
		{"foreign method", `const foreign=function(this:unknown):string{return String(this)};class Receiver{get read(){return foreign}}`, `this.state.label=new Receiver().read()`, true},
		{"mixed shadow", `class Parent{read():string{return 'base'}}class Receiver extends Parent{}`, `const shadow=()=>{class Receiver{read():string{return 'inner'}}return new Receiver().read()};this.state.label=new Receiver().read()+shadow()`, false},
		{"inferred isomorphic", `class Parent{read():string{return 'base'}}class Receiver extends Parent{}`, `this.state.label=new Receiver().read()`, false},
		{"inferred server", `class Parent{read():string{return 'base'}}class Receiver extends Parent{}`, `this.state.label=new Receiver().read()+String(process.pid)`, false},
		{"computed name", `const key='read';class Receiver{[key]():string{return 'value'}}`, `this.state.label=new Receiver().read()`, true},
		{"static initializer", `class Receiver{static value=1;read():string{return 'value'}}`, `this.state.label=new Receiver().read()`, true},
		{"static block", `class Receiver{static{}read():string{return 'value'}}`, `this.state.label=new Receiver().read()`, true},
		{"heritage call", `class Parent{read():string{return 'value'}}function base(){return Parent}class Receiver extends base(){}`, `this.state.label=new Receiver().read()`, true},
		{"identity escape", `class Receiver{read():string{return 'value'}}const saved=Receiver;`, `this.state.label=new Receiver().read()`, true},
		{"binding write", `class Receiver{read():string{return 'value'}}Receiver=class{read():string{return 'changed'}};`, `this.state.label=new Receiver().read()`, true},
		{"instance escape", `class Receiver{read():string{return 'value'}}`, `const value=new Receiver();this.state.label=value.read()`, true},
		{"foreign then callable", `const foreign=(resolve:(value:unknown)=>void)=>resolve(undefined);class Receiver{get then(){return foreign}}`, `await new Receiver();this.state.label='done'`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{label:string}>){this.state.label='initial';` + row.definitions + `;const run=async(task:TaskContext=TaskContext.server())=>{` + row.body + `;};return()=> <button onClick={()=>void run()}>{this.state.label}</button>}`
			if row.name == "inferred isomorphic" || row.name == "inferred server" {
				source = strings.Replace(source, "TaskContext.server()", "TaskContext.parallel()", 1)
			}
			if row.name == "inferred server" {
				source = "declare const process:{pid:number};" + source
			}
			if row.name == "client original scope" {
				source = strings.Replace(source, "TaskContext.server()", "TaskContext.client()", 1)
			}
			f := newExecutableFixture(t, map[string]string{"entry.tsx": source})
			config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"allowJs":true,"jsx":"react-jsx","jsxImportSource":"@exactjs/jsx"},"files":["entry.tsx"]}`
			if row.name == "parameter decorator" {
				config = strings.Replace(config, `"strict":true`, `"strict":true,"experimentalDecorators":true`, 1)
			}
			if err := os.WriteFile(f.request("analyze", "entry.tsx").ConfigFile, []byte(config), 0600); err != nil {
				t.Fatal(err)
			}
			session := NewSession()
			if row.name == "binding write" {
				request := f.request("compile", "entry.tsx")
				request.Target = TargetServer
				r := session.Execute(request)
				if r.Error != "" || !hasDiagnosticCode(r.Diagnostics, "TS2629") || r.Code != "" {
					t.Fatal("ordinary TypeScript class binding immutability lost", r.Error, r.Diagnostics)
				}
				return
			}
			a := session.Execute(f.request("analyze", "entry.tsx"))
			if a.Error != "" || len(a.Analysis.Components) != 1 || a.Analysis.Components[0].Name != "Page" || len(a.Analysis.Tasks) != 1 || len(a.Analysis.Tasks[0].Writes) == 0 {
				t.Fatal("actual component/task/state entry absent", a.Error, a.Diagnostics)
			}

			if row.name == "inferred isomorphic" || row.name == "inferred server" {
				expected := "isomorphic"
				if row.name == "inferred server" {
					expected = "server"
				}
				if a.Analysis.Tasks[0].RequestedPlacement != "" || a.Analysis.Tasks[0].Placement != expected {
					t.Fatal("inferred reconstruction entry absent", a.Analysis.Tasks[0])
				}
			}
			request := f.request("compile", "entry.tsx")
			request.Target = TargetServer
			if row.name == "client original scope" {
				request.Target = TargetClient
			}
			r := session.Execute(request)
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			refusal := false
			for _, d := range r.Diagnostics {
				if d.Severity == "error" {
					if d.Code != "EXACT2001" || !strings.Contains(d.Message, "cannot safely reconstruct this setup-local class") {
						t.Fatal("unexpected compile failure", d)
					}
					refusal = true
				}
			}
			if refusal != row.refuse || row.refuse && r.Code != "" || !row.refuse && r.Code == "" {
				t.Fatal("class reconstruction decision", r.Diagnostics, r.Code)
			}
			if row.name == "client original scope" {
				if !strings.Contains(r.Code, "class Receiver") {
					t.Fatal("client original class scope lost", r.Code)
				}
				return
			}
			if !row.refuse {
				if !strings.Contains(r.Code, "execute:") || !strings.Contains(r.Code, "new Receiver()") {
					t.Fatal("actual executor class use absent", r.Code)
				}
				executor := r.Code[strings.Index(r.Code, "execute:"):]
				if !strings.Contains(executor, "class Receiver") {
					t.Fatal("required executor-local class absent", executor)
				}
				if row.name != "shadow" {
					parent, child, construct := strings.Index(executor, "class Parent"), strings.Index(executor, "class Receiver"), strings.Index(executor, "new Receiver()")
					if parent < 0 || child < parent || construct < child {
						t.Fatal("transitive class declaration order lost", executor)
					}
				}
				if row.name == "receiver capture" && (!strings.Contains(executor, "const seed =") || !strings.Contains(executor, ".dependencies[")) {
					t.Fatal("setup capture activation absent", executor)
				}
			}
		})
	}
}
