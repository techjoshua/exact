package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// TypeScript roots retain full project context, without making an unrelated
// component's descriptor/task graph a prerequisite of this public compilation.
func TestPublicComponentRequestedProjectScope(t *testing.T) {
	root, config := formsSourceFixture(t)
	entry := filepath.Join(root, "chosen.tsx")
	unrelated := filepath.Join(root, "unrelated.tsx")
	source := `export function Chosen(this:{state:{count:number}}){this.state.count=0;return()=> <button onClick={()=>this.state.count++}>{this.state.count}</button>;}`
	if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	var placement string
	for _, enlarged := range []bool{false, true} {
		if enlarged {
			extra := `export function Unrelated(){const value=Object.freeze(Object.defineProperty(Object.create(null),'callback',{value:()=>document.title,enumerable:true}));return()=> <p>{typeof value.callback}</p>;}`
			if err := os.WriteFile(unrelated, []byte(extra), 0600); err != nil {
				t.Fatal(err)
			}
		}
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: source, Target: TargetClient, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" || len(response.Analysis.Components) != 1 {
			t.Fatalf("selected component enlarged=%t: %s %#v", enlarged, response.Error, response.Diagnostics)
		}
		component := response.Analysis.Components[0]
		if component.Name != "Chosen" || len(component.StateSlots) != 1 || component.StateSlots[0] != "count" || len(response.Analysis.Continuations) != 0 {
			t.Fatal("selected public storage/transport contract changed", response.Analysis)
		}
		read, write := false, false
		for _, r := range response.Analysis.StateReads {
			read = read || r.Component == "Chosen" && len(r.Path) > 0 && r.Path[0] == "count"
		}
		for _, w := range response.Analysis.StateWrites {
			write = write || w.Component == "Chosen" && len(w.Path) > 0 && w.Path[0] == "count"
		}
		if !read || !write {
			t.Fatal("selected render/mutation dependencies lost")
		}
		if !enlarged {
			placement = component.Placement
			continue
		}
		if component.Placement != placement {
			t.Fatal("unrelated Program root changed portable placement", placement, component.Placement)
		}
		inventoried := false
		for _, project := range session.projects {
			if project.program.GetSourceFile(unrelated) == nil {
				t.Fatal("unrelated TypeScript root was removed from Program")
			}
			if project.callableCache == nil {
				continue
			}
			for _, fact := range project.callableCache.merged.facts {
				if fact.sourceFile.FileName() == unrelated && fact.node.Name() != nil && fact.node.Name().Text() == "Unrelated" {
					inventoried = true
					if fact.staged.ready || fact.staged.settled {
						t.Fatal("unrelated component body became selected execution demand")
					}
				}
			}
		}
		if !inventoried {
			t.Fatal("unrelated static inventory missing; test did not exercise enlarged Program")
		}
	}
}

// Aliased callable helpers, imported JSX component definitions and actual module
// initialization still enter through the requested component's real references.
func TestPublicRequestedComponentTransitiveDemand(t *testing.T) {
	root, config := formsSourceFixture(t)
	entry := filepath.Join(root, "chosen.tsx")
	helper := filepath.Join(root, "helper.tsx")
	init := filepath.Join(root, "init.ts")
	source := `import './init';import{read as alias,Child}from './helper';export function Chosen(){const label=alias();return()=> <section><Child/>{label}</section>;}`
	for name, contents := range map[string]string{entry: source, helper: `export function read(){return document.title}export function Child(){return()=> <span>child</span>;}`, init: `document.title='initialized';export {};`} {
		if err := os.WriteFile(name, []byte(contents), 0600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: source, Target: TargetClient, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "client" {
		t.Fatalf("transitive browser dependency lost: %s %#v %#v", response.Error, response.Diagnostics, response.Analysis.Components)
	}
	called, child, module := false, false, false
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		for _, fact := range project.callableCache.merged.facts {
			if fact.node.Name() != nil && fact.sourceFile.FileName() == helper {
				called = called || fact.node.Name().Text() == "read" && fact.staged.ready
				child = child || fact.node.Name().Text() == "Child" && fact.staged.ready
			}
			module = module || fact.sourceFile.FileName() == init && runtimeModuleEvaluation(fact.node) && fact.staged.ready
		}
	}
	if !called || !child || !module {
		t.Fatalf("actual transitive demand missing: alias=%t JSX=%t module=%t", called, child, module)
	}
	// Compiling the imported component independently must still supply its own
	// implementation; a caller does not authorize or define that implementation.
	standalone := NewSession().Execute(Request{Kind: "compile", ID: helper, Root: root, ConfigFile: config, Source: `export function read(){return document.title}export function Child(){return()=> <span>child</span>;}`, Target: TargetClient, Diagnostics: "semantic"})
	if standalone.Error != "" || hasErrorDiagnostic(standalone.Diagnostics) || standalone.Code == "" || len(standalone.Analysis.Components) != 1 || standalone.Analysis.Components[0].Name != "Child" {
		t.Fatal("standalone imported component lost portable implementation", standalone.Error, standalone.Diagnostics)
	}
}

func TestPublicRequestedComponentRetainsHelperPlacementRefusal(t *testing.T) {
	root, config := formsSourceFixture(t)
	helper := filepath.Join(root, "helper.ts")
	if err := os.WriteFile(helper, []byte(`export function read(){return document.title}`), 0600); err != nil {
		t.Fatal(err)
	}
	source := `import{TaskContext}from'@exactjs/core';import{read as alias}from './helper';export function Chosen(){const run=(task:TaskContext=TaskContext.server().blocking())=>{void task;return alias()};return()=> <button onClick={()=>run()}>run</button>;}`
	entry := filepath.Join(root, "chosen.tsx")
	if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	response := NewSession().Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: source, Target: TargetClient, Diagnostics: "semantic"})
	if !hasDiagnosticCode(response.Diagnostics, "EXACT2001") || response.Code != "" {
		t.Fatal("requested task dropped imported browser conflict", response.Error, response.Diagnostics)
	}
}
