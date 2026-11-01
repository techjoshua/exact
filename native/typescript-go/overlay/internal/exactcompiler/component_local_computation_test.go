package exactcompiler

import (
	"strings"
	"testing"
)

// Opaque structural access retains unknown availability while target-local setup
// keeps the client observation owner and avoids distributed execution.
func TestCompilerOpaqueComputationStaysTargetLocal(t *testing.T) {
	source := `import{type Component}from'@exactjs/core';
 interface Instant{readonly epochMilliseconds:number}
 interface Clock{now():Instant}
 /** @exact pure */
 function sample(clock:Clock){return clock.now().epochMilliseconds}
 export function Provider(this:Component<{initialSample:number}>,props:{clock:Clock}){
 this.state.initialSample=sample(props.clock);return()=>this.state.initialSample;}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "time-local-computation.ts", Target: target, Source: source})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
			}
			found := false
			for _, component := range response.Analysis.Components {
				if component.Name == "Provider" {
					found = true
				}
				if component.Name == "Provider" && (component.Placement != "unknown" || len(component.ArtifactTargets) != 0) {
					t.Fatalf("false availability: %#v", component)
				}
			}
			if !found {
				t.Fatal("component analysis missing")
			}
			if target == TargetServer && strings.Contains(response.Code, "activateComputationForHost as") {
				t.Fatal("server setup allocated a client observation owner")
			}
			if strings.Contains(response.Code, "activateTaskForHost as") || strings.Contains(response.Code, "activateServerComponentTaskForHost as") {
				t.Fatal("opaque computation scheduled as distributed task")
			}
			if target == TargetClient && (!strings.Contains(response.Code, "activateComputationForHost as") || !strings.Contains(response.Code, "constructTaskComponentInstance as")) {
				t.Fatal("client observation owner missing")
			}
		})
	}
}

// Independent residency requirements outrank opacity from an unrelated setup accessor.
func TestOpaqueComputationPreservesKnownComponentResidency(t *testing.T) {
	prefix := `import{type Component}from'@exactjs/core';interface Instant{readonly epochMilliseconds:number}interface Clock{now():Instant}/** @exact pure */ function sample(clock:Clock){return clock.now().epochMilliseconds}`
	for _, fixture := range []struct{ name, imports, proof, placement, read string }{
		{"browser", "", "void window.innerWidth;", "client", "window.innerWidth"},
		{"server", `import{readFileSync}from'node:fs';`, `void readFileSync('unused','utf8');`, "server", "readFileSync("},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fixture.name+"/"+string(target), func(t *testing.T) {
				source := fixture.imports + prefix + `export function Provider(this:Component<{initialSample:number}>,props:{clock:Clock}){this.state.initialSample=sample(props.clock);` + fixture.proof + `return()=>this.state.initialSample;}`
				response := NewSession().Execute(Request{Kind: "compile", ID: "opaque-parent-" + fixture.name + ".ts", Target: target, Source: source})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
				}
				found := false
				for _, component := range response.Analysis.Components {
					if component.Name != "Provider" {
						continue
					}
					found = true
					if component.Placement != fixture.placement || len(component.ArtifactTargets) != 1 || component.ArtifactTargets[0] != fixture.placement {
						t.Fatalf("known residency lost: %#v", component)
					}
				}
				if !found {
					t.Fatal("component analysis missing")
				}
				if strings.Contains(response.Code, fixture.read) != (string(target) == fixture.placement) {
					t.Fatalf("restricted operation leaked or disappeared in %s output", target)
				}
			})
		}
	}
}
