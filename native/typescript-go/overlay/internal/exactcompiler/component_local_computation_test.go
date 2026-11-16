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

// A structural field can invoke an unknown getter without erasing the selected
// browser operation. Emission preserves that Get before the clipboard Call.
func TestOpaqueCallbackInputConservesKnownEffects(t *testing.T) {
	source := `export function copy(props:{source:string}){navigator.clipboard.writeText(props.source)}`
	r := NewSession().Execute(Request{Kind: "compile", ID: "opaque-callback-input.ts", Target: TargetClient, Source: source, Diagnostics: "semantic", PreserveOrdinaryModules: true})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatalf("host-owned callback: %s %#v", r.Error, r.Diagnostics)
	}
	// This ordinary export has no component consumer. Its authored Get/Call/Throw
	// remains intact; the component callback below covers summary conservation.
	if len(r.Analysis.Callables) != 0 {
		t.Fatal("unrelated ordinary callback became an analysis root", r.Analysis.Callables)
	}
	sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm');
let gets=0,calls=0;const order=[];const stop={};
const sandbox={exports:{},navigator:{clipboard:{writeText(value){calls++;order.push('call');if(value!=='safe')throw Error('argument')}}}};
vm.runInNewContext('(function(exports){'+fs.readFileSync(process.argv[1],'utf8')+'\n})(exports)',sandbox);
if(gets||calls)throw Error('deferred callback executed');
sandbox.exports.copy({get source(){gets++;order.push('get');return 'safe'}});
if(gets!==1||calls!==1||order.join()!=='get,call')throw Error('callback order');
try{sandbox.exports.copy({get source(){gets++;throw stop}});throw Error('missing Throw')}catch(error){if(error!==stop)throw error}
if(gets!==2||calls!==1)throw Error('Throw did not stop clipboard Call');`)
}

func TestSessionBrandsBrowserComponentWithOpaqueSetupCalls(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			declare class Component<State> { state: State }
			declare function tokenize(source: string): string[];
			export function CodeBlock(
				this: Component<{ copied: boolean }>,
				props: { source: string },
			) {
				void tokenize(props.source);
				const copy = () => navigator.clipboard.writeText(props.source);
				return () => <button onClick={() => void copy()}>Copy</button>;
			}
		`,
		JSXInterop: &JSXInterop{
			AdapterModule: "@exactjs/react-compat/exact",
			AdapterExport: "adaptReactComponent",
		},
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", response.Diagnostics)
	}
	component := findComponent(t, response.Analysis.Components, "CodeBlock")
	copy := findCallable(t, response.Analysis.Callables, "copy")
	knownBrowser, unknownInput := false, false
	for _, effect := range copy.EffectSources {
		knownBrowser = knownBrowser || effect.Environment == "browser"
		unknownInput = unknownInput || effect.Environment == "unknown"
	}
	// The structural props read can invoke an unknown getter. Its residual
	// must coexist with the independent clipboard dependency.
	if component.Placement != "unknown" || component.EnvironmentEffect != "unknown" || len(component.ArtifactTargets) != 0 ||
		!strings.Contains(strings.Join(component.Diagnostics, "\n"), "opaque call") ||
		!strings.Contains(response.Code, `, "`+component.ID+`"`) || !strings.Contains(response.Code, `placement: "unknown"`) || !knownBrowser || !unknownInput || copy.Effect != "unknown" {
		t.Fatalf("local artifact lost opaque availability or its known browser callback: %#v %#v\n%s", component, copy, response.Code)
	}
}
