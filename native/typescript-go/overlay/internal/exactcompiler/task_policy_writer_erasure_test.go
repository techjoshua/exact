package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPublicTaskPolicyWriterErasureBoundary(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct{ name, work, policy string }{
		{"ordinary-default", `function read(input=document.title){return input} void read();`, ""},
		{"shadowed-method", `const TaskContext={client(){return document.title}}; function read(input=TaskContext.client()){return input} void read();`, ""},
		{"body-getter", `const source={get value(){return document.title}}; void source.value;`, ""},
		{"policy-argument", "", "Policy.client().latest().blocking().key(document.title)"},
	} {
		t.Run(c.name, func(t *testing.T) {
			policy := c.policy
			if policy == "" {
				policy = "Policy.client().latest().blocking()"
			}
			source := `import {TaskContext as Policy,type Component} from '@exactjs/core';
export function Page(this:Component<{count:number}>){
 this.state.count=0;
 const run=(task:Policy=` + policy + `)=>{
  void task; ` + c.work + ` this.state.count++;
 };
 return()=> <button onClick={()=>run()}>{this.state.count}</button>;
}`
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "policy-writer-"+c.name+".tsx"), Source: source, Target: target, Diagnostics: "semantic"})
				if c.name == "shadowed-method" {
					if r.Error != "" || r.Code != "" || r.SourceMap != nil || len(r.Diagnostics) != 1 || r.Diagnostics[0].Code != "EXACT2001" || r.Diagnostics[0].Severity != "error" || r.Diagnostics[0].Message != "error: task policy must be rooted at TaskContext imported from @exactjs/core" {
						t.Fatalf("shadowed policy acquired an artifact or lost its original refusal: %s %#v", r.Error, r.Diagnostics)
					}
					continue
				}
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
					t.Fatalf("public component %s rejected: %s %#v", target, r.Error, r.Diagnostics)
				}
				if len(r.Analysis.Components) != 1 || len(r.Analysis.Continuations) != 0 {
					t.Fatal("component/transport ownership changed", r.Analysis.Components, r.Analysis.Continuations)
				}
				var task *Task
				for i := range r.Analysis.Tasks {
					if r.Analysis.Tasks[i].Component == "Page" && r.Analysis.Tasks[i].RequestedPlacement == "client" {
						if task != nil {
							t.Fatal("duplicate task")
						}
						task = &r.Analysis.Tasks[i]
					}
				}
				if task == nil || task.Placement != "client" || task.Concurrency != "latest" || task.Readiness != "blocking" || !task.BrowserEffects {
					t.Fatal("erasure lost task policy or real default/body browser effect", r.Analysis.Tasks)
				}
				read, write := false, false
				for _, e := range task.Reads {
					read = read || e.Path == "count" || e.Path == "*"
				}
				for _, e := range task.Writes {
					write = write || e.Path == "count" || e.Path == "*"
				}
				if !read || !write {
					t.Fatal("task state effects lost", task.Reads, task.Writes)
				}
			}
		})
	}
}
