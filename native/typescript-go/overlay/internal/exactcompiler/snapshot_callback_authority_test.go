package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Executed snapshot callbacks retain state authority without becoming activation inputs.
// Ordinary stored callbacks are a negative control for accidental eager execution.
func TestNormalizationHelperSnapshotAuthority(t *testing.T) {
	root := t.TempDir()
	pkg := filepath.Join(root, "node_modules", "@exactjs", "core")
	if err := os.MkdirAll(pkg, 0700); err != nil {
		t.Fatal(err)
	}
	for file, source := range map[string]string{
		"package.json": `{"name":"@exactjs/core","types":"index.d.ts"}`,
		"index.d.ts":   `/** @exact pure */ export declare function peek<T>(read:()=>T):T; export interface TaskContext {peek<T>(read:()=>T):T} export declare const TaskContext:{server():TaskContext};`,
	} {
		if err := os.WriteFile(filepath.Join(pkg, file), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, c := range []struct {
		name, helper, call string
		read               bool
	}{
		{"inline", `function read(){return peek(()=>this.state.a)}`, "read()", true},
		{"named", `function snapshot(){return this.state.a} function read(){return peek(snapshot)}`, "read()", true},
		{"alias", `const snapshot=()=>this.state.a;const alias=snapshot;function read(){return peek(alias)}`, "read()", true},
		{"mapper", `function snapshot(){return this.state.a} function read(){return [1].map(snapshot)[0]}`, "read()", true},
		{"conditional", `function read(){return peek(this.state.input ? ()=>this.state.a : ()=>1)}`, "read()", true},
		{"conditional-alias", `const selected=this.state.input ? ()=>this.state.a : ()=>1;function read(){return peek(selected)}`, "read()", true},
		{"context", `function read(task:TaskContext){return task.peek(()=>this.state.a)}`, "read(task)", true},
		{"context-reassigned-prop", `function read(task:TaskContext){let snapshot=task.peek;snapshot=task.peek;return snapshot(()=>props.other)}`, "read(task)", false},
		{"context-alias-prop", `function read(task:TaskContext){const snapshot=task.peek;return snapshot(()=>props.other)}`, "read(task)", false},
		{"context-prop", `function read(task:TaskContext){return task.peek(()=>props.other)}`, "read(task)", false},
		{"context-prop-live", `function read(task:TaskContext){return task.peek(()=>props.other)+props.other}`, "read(task)", false},
		{"context-named-prop", `const snapshot=()=>props.other;function read(task:TaskContext){return task.peek(snapshot)}`, "read(task)", false},
		{"computed-method", `const key="peek";interface Other{[key](read:()=>number):number}const store:Other={peek(){return 1}};function read(){return store[key](()=>this.state.a)}`, "read()", false},
		{"iterator", `const items:Iterable<number>=[1];function read(){return items[Symbol.iterator]().next().value ?? 0}`, "read()", false},
		{"ordinary-function", `function defer(read:()=>number){return 1}function read(){return defer(()=>this.state.a)}`, "read()", false},
		{"stored", `const store={peek(fn:()=>number){return 1}};function read(){return store.peek(()=>this.state.a)}`, "read()", false},
	} {
		t.Run(c.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", Root: root, ID: filepath.Join(root, "authority.tsx"), Target: target, Source: `import {peek,TaskContext} from '@exactjs/core';declare class Component<S>{state:S}export function Probe(this:Component<{a:number;input:number;output:number}>,props:{other:number}){this.state.a=1;this.state.input=1;this.state.output=0;` + c.helper + `const run=(input:number,task:TaskContext=TaskContext.server())=>{this.state.output=` + c.call + `+input};run(this.state.input);return()=> <p>{this.state.output}</p>;}`})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				if len(r.Analysis.Tasks) != 1 {
					t.Fatal("missing task")
				}
				found := false
				for _, read := range r.Analysis.Tasks[0].Reads {
					found = found || read.Path == "a"
				}
				if found != c.read {
					t.Fatalf("snapshot authority=%v, want %v", found, c.read)
				}
				if strings.HasPrefix(c.name, "context-") {
					if len(r.Analysis.Tasks[0].helperCaptures) != 1 || r.Analysis.Tasks[0].helperCaptures[0].snapshot != (c.name != "context-prop-live") {
						t.Fatal("context snapshot capture lost ownership")
					}
				}
				deps := r.Analysis.Tasks[0].Dependencies
				if len(deps) != 1 || deps[0].Path != "this.state.input" {
					t.Fatalf("snapshot altered activation: %#v", deps)
				}
				if !strings.Contains(r.Code, "run") {
					t.Fatal("authority witness did not reach lowering")
				}
			}
		})
	}
}
