package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Snapshot callbacks remain execution reads without subscribing their enclosing task.
func TestNormalizationSnapshotTaskActivation(t *testing.T) {
	root := t.TempDir()
	pkg := filepath.Join(root, "node_modules", "@exactjs", "core")
	if err := os.MkdirAll(pkg, 0700); err != nil {
		t.Fatal(err)
	}
	for file, source := range map[string]string{
		"package.json": `{"name":"@exactjs/core","types":"index.d.ts"}`,
		"index.d.ts":   `/** @exact pure */ export declare function peek<T>(read:()=>T):T; export declare class TaskContext { static client():TaskContext; peek<T>(read:()=>T):T; }`,
	} {
		if err := os.WriteFile(filepath.Join(pkg, file), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, c := range []struct {
		prelude, expression string
		snapshot            bool
	}{
		{`import {peek} from '@exactjs/core';`, `peek(()=>this.state.a)+props.input`, true},
		{`import {peek as read} from '@exactjs/core';`, `read(()=>this.state.a)+props.input`, true},
		{`import * as core from '@exactjs/core';`, `core['peek'](()=>this.state.a)+props.input`, true},
		{`import {peek} from '@exactjs/core';const read=peek;`, `read(()=>this.state.a)+props.input`, true},
		{`import {peek} from '@exactjs/core';`, `peek(()=>props.input)+props.input`, true},
		{`function read(fn:()=>number){return fn();}`, `read(()=>this.state.a)+props.input`, false},
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", Root: root, ID: filepath.Join(root, "page.tsx"), Target: target,
				Source: c.prelude + `declare class Component<S>{state:S} export function Probe(this:Component<{a:number}>,props:{input:number}){function run(){this.state.a=` + c.expression + `;}run();return()=> <p>{this.state.a}</p>;} import {TaskContext} from '@exactjs/core';`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if len(r.Analysis.Tasks) != 1 {
				t.Fatalf("missing task: %#v", r.Analysis.Tasks)
			}
			state := false
			for _, dependency := range r.Analysis.Tasks[0].Dependencies {
				state = state || dependency.Source == "state"
			}
			if state == c.snapshot {
				t.Fatalf("snapshot became an activation input: %#v", r.Analysis.Tasks[0].Dependencies)
			}
		}
	}
	for _, c := range []struct {
		expression string
		snapshot   bool
	}{
		{`peek(()=>value)`, true}, {`value`, false}, {`peek(()=>value)+value`, false},
		{`peek(snapshot)`, true}, {`peek(alias)`, true},
		{`peek(true ? snapshot : () => 0)`, true}, {`peek((0,snapshot))`, true},
		{`peek(snapshot)+snapshot()`, false}, {`snapshot()+peek(alias)`, false},
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", Root: root, ID: filepath.Join(root, "helper.tsx"), Target: target, Source: `import {peek,TaskContext} from '@exactjs/core';declare class Component<S>{state:S} export function Probe(this:Component<{a:number}>,props:{input:number;other:number}){const value=props.other;const snapshot=()=>value;const alias=snapshot;function read(){return ` + c.expression + `;}function run(){this.state.a=read()+props.input;}run();return()=> <p>{this.state.a}</p>;}`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if len(r.Analysis.Tasks) != 1 || len(r.Analysis.Tasks[0].helperCaptures) != 1 {
				t.Fatalf("missing helper capture: %#v", r.Analysis.Tasks)
			}
			if r.Analysis.Tasks[0].helperCaptures[0].snapshot != c.snapshot {
				t.Fatal("helper snapshot broadened activation ownership")
			}
			if r.Code == "" {
				t.Fatal("helper witness did not reach lowering")
			}
		}
	}

	for _, c := range []struct {
		call         string
		dependencies int
	}{
		{`run();`, 2}, {`run(props.input);`, 1},
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", Root: root, ID: filepath.Join(root, "explicit.tsx"), Target: target, Source: `import {TaskContext} from '@exactjs/core';declare class Component<S>{state:S} export function Probe(this:Component<{a:number}>,props:{input:number;other:number}){function run(input:number=1,task:TaskContext=TaskContext.client()){this.state.a=task.peek(()=>this.state.a)+props.other+input;}` + c.call + `return()=> <p>{this.state.a}</p>;}`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if len(r.Analysis.Tasks) != 1 || len(r.Analysis.Tasks[0].Dependencies) != c.dependencies {
				t.Fatalf("startup availability or supplied activation inputs were lost: %#v", r.Analysis.Tasks)
			}
			if len(r.Analysis.Tasks[0].Reads) == 0 {
				t.Fatal("activation filtering discarded execution read authority")
			}
			if r.Code == "" {
				t.Fatal("explicit task witness did not reach lowering")
			}
			if c.call == "run();" && target != TargetServer && !strings.Contains(r.Code, "activateTaskOnceForHost as") {
				t.Fatal("startup-only activation helper was not imported")
			}
		}
	}

}
