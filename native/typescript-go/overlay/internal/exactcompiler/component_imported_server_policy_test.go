package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The helper body is server work; a client continuation is not client retention
// of its consume operation. The public helper-negative test covers the converse.
func TestPublicImportedServerTaskHelperExcludedFromClient(t *testing.T) {
	config := timeSemanticConfig(t)
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	entry, dep := filepath.Join(root, "server-policy-page.tsx"), filepath.Join(root, "server-policy-helper.ts")
	const helper = `import{consume}from'@exactjs/secrets';
/** @exact keep=secret */ declare const credential:string;
export function read(){void consume(credential);return 1;}`
	const source = `import{TaskContext,type Component}from'@exactjs/core';import{read}from'./server-policy-helper.js';
export function Page(this:Component<{result:number}>){this.state.result=0;
const run=(task:TaskContext=TaskContext.server().latest().blocking())=>{void task;this.state.result=read()};
return()=> <button onClick={()=>run()}>{this.state.result}</button>;}`
	session := NewSession()
	setup := session.Execute(Request{Kind: "synchronize", ConfigFile: config, Sources: []ProjectSource{{ID: dep, Source: helper}, {ID: entry, Source: source}}})
	if setup.Error != "" || hasErrorDiagnostic(setup.Diagnostics) {
		t.Fatalf("ENTRY import setup failed: %s %#v", setup.Error, setup.Diagnostics)
	}
	r := session.Execute(Request{Kind: "compile", ID: entry, ConfigFile: config, Source: source, Target: TargetClient, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatalf("ENTRY server-projected helper failed: %s %#v", r.Error, r.Diagnostics)
	}
	var task *Task
	for i := range r.Analysis.Tasks {
		if r.Analysis.Tasks[i].Component == "Page" && r.Analysis.Tasks[i].RequestedPlacement == "server" {
			if task != nil {
				t.Fatal("duplicate server task")
			}
			task = &r.Analysis.Tasks[i]
		}
	}
	if len(r.Analysis.Components) != 1 || task == nil || task.Placement != "server" || len(r.Analysis.Continuations) == 0 {
		t.Fatal("actual server task/continuation not reached", r.Analysis.Tasks, r.Analysis.Continuations)
	}
	if strings.Contains(r.Code, "server-policy-helper.js") {
		t.Fatal("server-only helper import retained in client artifact")
	}
	if len(r.Analysis.Policy.SecretConsumers) != 0 {
		t.Fatal("excluded helper audited as client consumption", r.Analysis.Policy.SecretConsumers)
	}
}
