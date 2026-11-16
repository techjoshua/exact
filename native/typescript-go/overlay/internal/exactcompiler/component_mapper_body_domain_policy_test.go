package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// One public component journey covers the native callback producer's acquired
// body domain. Each shape proves public browser/task/state/render entry before
// requiring exact secret rejection; server and stored-only cases deny inherited
// client retention and invocation respectively. No callback signature is authority.
func TestPublicImportedMapperBodyDomain(t *testing.T) {
	config := timeSemanticConfig(t)
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	entry, dependency := filepath.Join(root, "mapper-domain-policy-page.tsx"), filepath.Join(root, "mapper-domain-policy-helper.ts")
	const clientSource = `import {TaskContext,type Component} from '@exactjs/core';import {read} from './mapper-domain-policy-helper.js';
export function Page(this:Component<{result:number}>){this.state.result=0;
 const run=(task:TaskContext=TaskContext.client().latest().blocking())=>{void task;this.state.result=read()};
 return()=> <button onClick={()=>run()}>{this.state.result}</button>;
}`
	for _, shape := range []struct {
		name, prefix, declarations, invoke string
		consumers                          int
	}{
		{"declaration", "", `function mapper(){BODY}`, `[1].map(mapper);`, 1},
		{"method-value", "", `const mapper={run(){BODY}};`, `[1].map(mapper.run);`, 1},
		{"alternatives", `declare const choose:boolean;`, `const left=()=>{BODY};const right=()=>{BODY};`, `[1].map(choose?left:right);`, 2},
	} {
		t.Run(shape.name, func(t *testing.T) {
			for _, mode := range []struct {
				name                           string
				secret, denied, server, stored bool
			}{
				{name: "public-entry"},
				{name: "client-secret-refusal", secret: true, denied: true},
				{name: "server-exclusion", secret: true, server: true},
				{name: "stored-not-invoked", secret: true, stored: true},
			} {
				t.Run(mode.name, func(t *testing.T) {
					body := "return 1;"
					if mode.secret {
						body = "void consume(credential);" + body
					}
					if !mode.server {
						body = "void document.title;" + body
					}
					helper := shape.prefix
					if mode.secret {
						helper = "import {consume} from '@exactjs/secrets';\n/** @exact keep=secret */ declare const credential:string;\n" + helper
					}
					helper += "export function read(){" + strings.ReplaceAll(shape.declarations, "BODY", body)
					if mode.stored {
						helper += "void document.title;"
					} else {
						helper += shape.invoke
					}
					helper += "return 1;}"
					source := clientSource
					if mode.server {
						source = strings.Replace(source, "TaskContext.client()", "TaskContext.server()", 1)
					}
					session := NewSession()
					setup := session.Execute(Request{Kind: "synchronize", ConfigFile: config, Sources: []ProjectSource{{ID: dependency, Source: helper}, {ID: entry, Source: source}}})
					if setup.Error != "" || hasErrorDiagnostic(setup.Diagnostics) {
						t.Fatalf("ENTRY import setup: %s %#v", setup.Error, setup.Diagnostics)
					}
					r := session.Execute(Request{Kind: "compile", ID: entry, ConfigFile: config, Source: source, Target: TargetClient, Diagnostics: "semantic"})
					if mode.server {
						if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
							t.Fatalf("ENTRY server-projected helper: %s %#v", r.Error, r.Diagnostics)
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
						if strings.Contains(r.Code, "mapper-domain-policy-helper.js") {
							t.Fatal("server-only helper import retained in client artifact")
						}
						if len(r.Analysis.Policy.SecretConsumers) != 0 {
							t.Fatal("excluded helper audited as client consumption", r.Analysis.Policy.SecretConsumers)
						}
						return
					}
					if r.Error != "" {
						t.Fatalf("ENTRY %s did not reach public component planning: %s %#v", mode.name, r.Error, r.Diagnostics)
					}
					for _, e := range r.Diagnostics {
						if e.Severity == "error" && (!mode.denied || e.Code != "EXACT3004") {
							t.Fatalf("ENTRY %s unexpected setup/type/coverage diagnostic: %#v", mode.name, r.Diagnostics)
						}
					}
					if len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Name != "Page" {
						t.Fatalf("ENTRY %s selected component missing: %#v", mode.name, r.Analysis.Components)
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
						t.Fatalf("ENTRY %s imported browser effect or task policy missing: %#v", mode.name, r.Analysis.Tasks)
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
						t.Fatalf("ENTRY %s task/render/transport contract missing", mode.name)
					}
					if mode.denied {
						if !hasDiagnosticCode(r.Diagnostics, "EXACT3004") || r.Code != "" || r.SourceMap != nil {
							t.Fatalf("imported client secret consumption not rejected: %#v", r.Diagnostics)
						}
						consumers := r.Analysis.Policy.SecretConsumers
						if len(consumers) != shape.consumers || consumers[0].Authorization != "denied" {
							t.Fatal("actual imported secret consumer missing or authorized", consumers)
						}
					} else if hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || len(r.Analysis.Policy.SecretConsumers) != 0 {
						t.Fatalf("ENTRY public imported helper not compiled: %#v", r.Diagnostics)
					}
				})
			}
		})
	}
}
