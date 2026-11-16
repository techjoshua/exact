package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A stable const mapper is passed by identifier to the same standard Array.map
// component task journey. Its body alone supplies the browser donor and optional
// secret consumption. Missing public callback entry cannot qualify rejection.
func TestPublicImportedStableMapperClientPolicy(t *testing.T) {
	config := timeSemanticConfig(t)
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	entry, dependency := filepath.Join(root, "stable-mapper-client-policy-page.tsx"), filepath.Join(root, "stable-mapper-client-policy-helper.ts")
	const source = `import {TaskContext,type Component} from '@exactjs/core';import {read} from './stable-mapper-client-policy-helper.js';
export function Page(this:Component<{result:number}>){this.state.result=0;
 const run=(task:TaskContext=TaskContext.client().latest().blocking())=>{void task;this.state.result=read()};
 return()=> <button onClick={()=>run()}>{this.state.result}</button>;
}`
	for _, c := range []struct {
		name, helper string
		denied       bool
	}{
		{"public-entry", `export function read(){const mapper=()=>{void document.title;return 1};[1].map(mapper);return 1;}`, false},
		{"client-secret-refusal", `import {consume} from '@exactjs/secrets';
/** @exact keep=secret */ declare const credential:string;
export function read(){const mapper=()=>{void document.title;void consume(credential);return 1};[1].map(mapper);return 1;}`, true},
	} {
		session := NewSession()
		setup := session.Execute(Request{Kind: "synchronize", ConfigFile: config, Sources: []ProjectSource{{ID: dependency, Source: c.helper}, {ID: entry, Source: source}}})
		if setup.Error != "" || hasErrorDiagnostic(setup.Diagnostics) {
			t.Fatalf("ENTRY %s import setup: %s %#v", c.name, setup.Error, setup.Diagnostics)
		}
		r := session.Execute(Request{Kind: "compile", ID: entry, ConfigFile: config, Source: source, Target: TargetClient, Diagnostics: "semantic"})
		if r.Error != "" {
			t.Fatalf("ENTRY %s did not reach public component planning: %s %#v", c.name, r.Error, r.Diagnostics)
		}
		for _, e := range r.Diagnostics {
			if e.Severity == "error" && (!c.denied || e.Code != "EXACT3004") {
				t.Fatalf("ENTRY %s unexpected setup/type/coverage diagnostic: %#v", c.name, r.Diagnostics)
			}
		}
		if len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Name != "Page" {
			t.Fatalf("ENTRY %s selected component missing: %#v", c.name, r.Analysis.Components)
		}
		var task *Task
		for i := range r.Analysis.Tasks {
			if r.Analysis.Tasks[i].Component == "Page" && r.Analysis.Tasks[i].RequestedPlacement == "client" {
				if task != nil {
					t.Fatal("duplicate selected task")
				}
				task = &r.Analysis.Tasks[i]
			}
		}
		if task == nil || task.Placement != "client" || task.Concurrency != "latest" || task.Readiness != "blocking" || !task.BrowserEffects {
			t.Fatalf("ENTRY %s imported browser effect or task policy missing: %#v", c.name, r.Analysis.Tasks)
		}
		write, render := false, false
		for _, e := range task.Writes {
			write = write || e.Path == "result" || e.Path == "*"
		}
		start := strings.Index(source, "return()=> <button")
		for _, e := range r.Analysis.StateReads {
			render = render || e.Component == "Page" && e.Start >= start && len(e.Path) > 0 && e.Path[0] == "result"
		}
		if !write || !render || len(r.Analysis.Continuations) != 0 {
			t.Fatalf("ENTRY %s task/render/transport contract missing", c.name)
		}
		if c.denied {
			if !hasDiagnosticCode(r.Diagnostics, "EXACT3004") || r.Code != "" || r.SourceMap != nil {
				t.Fatalf("imported client secret consumption not rejected: %#v", r.Diagnostics)
			}
			consumers := r.Analysis.Policy.SecretConsumers
			if len(consumers) != 1 || consumers[0].Authorization != "denied" {
				t.Fatal("actual imported secret consumer missing or authorized", consumers)
			}
		} else if hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || len(r.Analysis.Policy.SecretConsumers) != 0 {
			t.Fatalf("ENTRY public imported helper not compiled: %#v", r.Diagnostics)
		}
	}
}

// A stable mapper inside a server-task-only helper stays excluded from client
// delivery with that helper. Identifier spelling grants no server authority.
func TestPublicImportedStableMapperServerExclusion(t *testing.T) {
	config := timeSemanticConfig(t)
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	entry, dep := filepath.Join(root, "stable-mapper-server-policy-page.tsx"), filepath.Join(root, "stable-mapper-server-policy-helper.ts")
	const helper = `import{consume}from'@exactjs/secrets';
/** @exact keep=secret */ declare const credential:string;
export function read(){const mapper=()=>{void consume(credential);return 1};[1].map(mapper);return 1;}`
	const source = `import{TaskContext,type Component}from'@exactjs/core';import{read}from'./stable-mapper-server-policy-helper.js';
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
	if strings.Contains(r.Code, "stable-mapper-server-policy-helper.js") {
		t.Fatal("server-only helper import retained in client artifact")
	}
	if len(r.Analysis.Policy.SecretConsumers) != 0 {
		t.Fatal("excluded helper audited as client consumption", r.Analysis.Policy.SecretConsumers)
	}
}
