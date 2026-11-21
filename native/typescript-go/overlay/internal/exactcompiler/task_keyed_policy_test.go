package exactcompiler

import (
	"fmt"
	"os"
	"strings"
	"testing"
)

// Key extraction must retain authored inputs while erasing the final policy builder.
// Observable cancellation/publication is covered by the paired keyed-policy compiler journey.
func TestKeyedTaskPolicyAcrossDeclarationShapesAndTargets(t *testing.T) {
	for _, shape := range []string{"declaration", "arrow", "expression"} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			for _, priority := range []string{"immediate", "normal", "deferred"} {
				t.Run(fmt.Sprintf("%s/%s/%s", shape, target, priority), func(t *testing.T) {
					signature := `(key:string,value:number,task:TaskContext=TaskContext.client().latest().key(key).` + priority + `().blocking())`
					body := `{await Promise.resolve();this.state.value=value;}`
					definition := `async function run` + signature + body
					if shape == "arrow" {
						definition = `const run=async ` + signature + `=>` + body + `;`
					}
					if shape == "expression" {
						definition = `const run=async function` + signature + body + `;`
					}
					response := NewSession().Execute(Request{Kind: "compile", ID: "keyed-policy.tsx", Target: target, InstrumentInspection: shape == "expression", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;` + definition + `return()=> <button onClick={()=>run('a',1)}>{this.state.value}</button>;}`})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					for _, d := range response.Diagnostics {
						if d.Severity == "error" {
							t.Fatalf("valid keyed policy rejected: %#v", response.Diagnostics)
						}
					}
					if len(response.Analysis.Tasks) != 1 {
						t.Fatalf("missing task: %#v", response.Analysis.Tasks)
					}
					task := response.Analysis.Tasks[0]
					if task.KeyLength == 0 || task.Priority != priority || task.Readiness != "blocking" || task.Concurrency != "latest" {
						t.Fatalf("lost keyed policy: %#v", task)
					}
					if target != TargetServer && !strings.Contains(response.Code, "concurrencyKey") {
						t.Fatal("key was analyzed but not emitted")
					}
				})
			}
		}
	}
}

// Transport and continuation decoration may erase callable parameters. Key
// resolution must retain the authored bindings after defaults have been captured.
var keyedTransportControls = []struct{ name, definition, argument, key string }{
	{"declaration", `async function run(key:string,value:number,task:TaskContext=TaskContext.server().latest().key(key).blocking()){return value;}`, `'a',1`, `(key, value) => key`},
	{"destructured-arrow", `const run=async({key}:{key:string},value:number,task:TaskContext=TaskContext.server().latest().key(prefix+key).blocking())=>value;`, `{key:'a'},1`, `({ key }, value) => prefix + key`},
	{"captured-default-expression", `const run=async function(key:string=defaultKey(),value:number,task:TaskContext=TaskContext.server().queue().key(prefix+key).blocking()){return value;};`, `undefined,1`, `(key, value) => prefix + key`},
	{"computed-current", `async function run(key:string,value:number,task:TaskContext=TaskContext.latest().key(prefix+key).blocking()){return value;}`, `'a',1`, `(key, value) => prefix + key`},
	{"current", `async function run(key:string,value:number,task:TaskContext=TaskContext.latest().key(key).blocking()){return value;}`, `'a',1`, `(key, value) => key`},
}

func keyedTransportControlSource(definition, argument string) string {
	return `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const prefix='tenant:';const defaultKey=()=>'a';` + definition + `const invoke=run;return()=> <button onClick={()=>invoke(` + argument + `)}>Run</button>;}`
}
func TestKeyedTransportRetainsAuthoredParameterBindings(t *testing.T) {
	for _, c := range keyedTransportControls {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "keyed-transport-" + c.name + ".tsx", Target: target, Diagnostics: "semantic", Source: keyedTransportControlSource(c.definition, c.argument)})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				for _, d := range response.Diagnostics {
					if d.Severity == "error" {
						t.Fatalf("valid authored key rejected: %#v", response.Diagnostics)
					}
				}
				if target == TargetClient && !strings.Contains(response.Code, "concurrencyKey: "+c.key) {
					t.Fatalf("key resolver omitted its authored parameters: %s", response.Code)
				}
			})
		}
	}
}

// A retained task contributes the authored concurrency key and executable task work
// to its component's placement. A nested callback's platform read is deferred.
func TestRetainedKeyedTaskPlacement(t *testing.T) {
	root, config := formsSourceFixture(t)
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"target":"ESNext","module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","jsxImportSource":"@exactjs/jsx","skipLibCheck":true,"types":["node"]}}`), 0600); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct{ key, use, placement string }{
		{"'lane'", "void cb", "isomorphic"},
		{"'lane'", "cb()", "server"},
		{"process.cwd()", "void cb", "server"},
	} {
		source := "import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{}>){function run(task:TaskContext=TaskContext.latest().key(" + c.key + ")){const cb=()=>process.cwd();" + c.use + "}const bag={run};void bag;return()=> <span/>}"
		for _, target := range []Target{TargetClient, TargetServer} {
			r := formsCompileSource(t, root, config, source, target)
			got := findComponent(t, r.Analysis.Components, "Page").Placement
			if hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || got != c.placement {
				t.Fatalf("%s %s on %s: want %s, got %+v, %v", c.key, c.use, target, c.placement, got, formsDiagnosticDetails(r.Diagnostics))
			}
		}
	}
}
