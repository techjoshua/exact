package exactcompiler

import "testing"

func TestComponentRenderCapabilitySeparatesTaskAndActivation(t *testing.T) {
	const source = `import {TaskContext,type Component} from '@exactjs/core';
 export function View(this:Component<{value:string}>) {
  this.state.value='ready';
  async function load(task:TaskContext=TaskContext.server()) { return 'loaded'; }
  return ()=> <button onClick={async()=>{this.state.value=await load();}}>{this.state.value}</button>;
 }`
	for _, kind := range []string{"analyze", "compile"} {
		for _, target := range []Target{TargetServer, TargetClient} {
			t.Run(kind+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: kind, Target: target, ID: "render-capability.tsx", Source: source, ServerComponents: true})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				component := findComponent(t, response.Analysis.Components, "View")
				if component.RenderCapability != (ComponentRenderCapability{Server: "supported", Client: "supported"}) {
					t.Fatalf("render capability includes deferred work: %#v", component)
				}
				if component.Placement != "isomorphic" || len(component.ArtifactTargets) != 2 {
					t.Fatalf("legacy coordination changed: %#v", component)
				}
				found := false
				for _, task := range response.Analysis.Tasks {
					if task.RequestedPlacement == "server" {
						found = true
						if task.Placement != "server" {
							t.Fatalf("task placement changed: %#v", task)
						}
					}
				}
				if !found {
					t.Fatal("missing server task")
				}
			})
		}
	}
}

// The setup factory creates a view whose own getter executes on each rendered target.
func TestComponentReturnedFactoryGetterPlacement(t *testing.T) {
	root, config := formsSourceFixture(t)
	source := `import type { Component } from '@exactjs/core';const record={get n(){return document.title}};function makeView(){return()=> <p>{record.n}</p>}
export function Page(this:Component<{}>){return makeView()}`
	response := formsCompileSource(t, root, config, source, TargetServer)
	page := findComponent(t, response.Analysis.Components, "Page")
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || page.Placement != "client" || page.RenderCapability.Server != "unsupported" {
		t.Fatalf("factory render placement=%s capability=%v diagnostics=%v error=%s", page.Placement, page.RenderCapability, response.Diagnostics, response.Error)
	}
}

func TestComponentRenderCapabilityKeepsRequirementsAndUnknown(t *testing.T) {
	for _, witness := range []struct {
		name, declarations, expression string
		want                           ComponentRenderCapability
	}{
		{"neutral", "", "'ready'", ComponentRenderCapability{"supported", "supported"}},
		{"browser", "", "window.location.href", ComponentRenderCapability{"unsupported", "supported"}},
		// The existing platform publisher proves this Call's server requirement
		// without an authored callee summary. Preserve the original hard witness.
		{"server-call", `import {readFileSync} from 'node:fs';`, "readFileSync('value','utf8')", ComponentRenderCapability{"supported", "unsupported"}},
		{"server-source", "", "__dirname", ComponentRenderCapability{"supported", "unsupported"}},
		{"mixed-helper", "function mixed(){return window.location.href+__dirname;}", "mixed()", ComponentRenderCapability{"unsupported", "unsupported"}},
		{"mixed-helper-unknown", "declare function foreign():string;function mixed(){return window.location.href+__dirname+foreign();}", "mixed()", ComponentRenderCapability{"unsupported", "unsupported"}},
		{"mixed-default-helper", "function mixed(value=window.location.href){return value+__dirname;}", "mixed()", ComponentRenderCapability{"unsupported", "unsupported"}},
		{"opaque", "declare function foreign():string;", "foreign()", ComponentRenderCapability{"unknown", "unknown"}},
		{"browser-and-unknown", "declare function foreign():string;", "window.location.href+foreign()", ComponentRenderCapability{"unsupported", "unknown"}},
	} {
		t.Run(witness.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "render-requirement.tsx", Source: witness.declarations + `export function View(){return()=> <output>{` + witness.expression + `}</output>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if witness.name == "server-call" {
				independent := false
				for _, callable := range response.Analysis.Callables {
					independent = independent || (containsEnvironment(callable.EffectSources, "server") && !containsEnvironment(callable.EffectSources, "unknown"))
				}
				if !independent {
					t.Fatalf("readFileSync lacks its current qualified server-only effect evidence: %#v", response.Analysis.Callables)
				}
			}
			if witness.name == "mixed-helper-unknown" {
				preserved := false
				for _, callable := range response.Analysis.Callables {
					preserved = preserved || (containsEnvironment(callable.EffectSources, "server") && containsEnvironment(callable.EffectSources, "browser") && containsEnvironment(callable.EffectSources, "unknown"))
				}
				if !preserved {
					t.Fatalf("mixed helper lost independent effect provenance: %#v", response.Analysis.Callables)
				}
			}
			component := findComponent(t, response.Analysis.Components, "View")
			if component.RenderCapability != witness.want {
				t.Fatalf("got %#v, want %#v", component.RenderCapability, witness.want)
			}
		})
	}
}

// State reads force the ordinary normalization/extraction path. The capability
// owner must recover its input requirements after the direct walk skips that task.
func TestComponentRenderCapabilityExtractedSetupInputs(t *testing.T) {
	for _, witness := range []struct {
		name, expression string
		want             ComponentRenderCapability
	}{
		{"neutral", "this.state.base+'ready'", ComponentRenderCapability{"supported", "supported"}},
		{"server", "this.state.base+__dirname", ComponentRenderCapability{"supported", "unsupported"}},
		{"opaque", "this.state.base+foreign()", ComponentRenderCapability{"unknown", "unknown"}},
		{"server-and-opaque", "this.state.base+__dirname+foreign()", ComponentRenderCapability{"unknown", "unsupported"}},
		{"browser-and-opaque", "this.state.base+window.location.href+foreign()", ComponentRenderCapability{"unsupported", "unknown"}},
	} {
		t.Run(witness.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "extracted-render-input.tsx", Source: `import{type Component}from'@exactjs/core';declare function foreign():string;
    export function View(this:Component<{base:string,value:string}>){this.state.base='';this.state.value=` + witness.expression + `;return()=> <output>{this.state.value}</output>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			extracted := false
			for _, task := range response.Analysis.Tasks {
				if task.CompilerComputation && len(task.Writes) != 0 {
					extracted = true
				}
			}
			if !extracted {
				t.Fatalf("fixture did not exercise extraction: %#v", response.Analysis.Tasks)
			}
			component := findComponent(t, response.Analysis.Components, "View")
			if component.RenderCapability != witness.want {
				t.Fatalf("got %#v, want %#v, tasks %#v", component.RenderCapability, witness.want, response.Analysis.Tasks)
			}
		})
	}
}
