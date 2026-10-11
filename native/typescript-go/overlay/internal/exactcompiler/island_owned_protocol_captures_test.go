package exactcompiler

import (
	"strings"
	"testing"
)

// Island transport carries ordinary inputs, while refs and reactive identities are reconstructed.
func TestIslandOwnedProtocolCaptures(t *testing.T) {
	for _, form := range []struct{ name, ref, reactive string }{
		{"dot", "const binding=this.ref(token);", "const value=this.reactive(()=>this.state.count+props.offset);"},
		{"literal", "const binding=this['ref'](token);", "const value=this['reactive'](()=>this.state.count+props.offset);"},
		{"constant", "const key='ref' as const;const binding=this[key](token);", "const method='reactive' as const;const value=this[method](()=>this.state.count+props.offset);"},
		{"optional", "const key='ref' as const;const binding=this[key]?.(token);", "const value=this.reactive(()=>this.state.count+props.offset);"},
		{"alias", "const makeRef=this.ref;const binding=makeRef(token);", "const makeValue=this.reactive;const value=makeValue(()=>this.state.count+props.offset);"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(form.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "island-protocol-captures.tsx", Target: target, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Diagnostics: "semantic", Source: `import{createRef,type Component}from'@exactjs/core';const token=createRef<HTMLElement>('island-owned');export function Page(this:Component<{count:number}>,props:{offset:number}){this.state.count=1;` + form.ref + form.reactive + `return()=> <output ref={binding} onClick={()=>{if(binding.current)this.state.count++}}>{value}</output>}`})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("owned capture source rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("owned values changed placement: %#v", response.Analysis.Components)
				}
				for _, resumption := range response.Analysis.Resumptions {
					for _, capture := range resumption.Client.ValueCaptures {
						if capture == "binding" || capture == "value" || capture == "makeRef" || capture == "makeValue" {
							t.Fatalf("executable identity entered transport: %#v", resumption.Client.ValueCaptures)
						}
					}
				}
				if target == TargetServer && strings.Contains(response.Code, "binding: binding") {
					t.Fatalf("ref binding serialized: %s", response.Code)
				}
				if target == TargetServer {
					boundaryEnd := strings.Index(response.Code, "__exactHydrationFallback:")
					if boundaryEnd >= 0 && strings.Contains(response.Code[:boundaryEnd], "ref: binding") {
						t.Fatalf("request-local ref entered boundary props: %s", response.Code)
					}
				}
				if target == TargetClient && (!strings.Contains(response.Code, "const binding =") || !strings.Contains(response.Code, "const value =")) {
					t.Fatalf("owned identities not reconstructed: %s", response.Code)
				}
			})
		}
	}
}

// A foreign ref method returns application data and must keep the ordinary capture contract.
func TestForeignProtocolNamesRemainIslandData(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "foreign-island-protocol.tsx", Target: target, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';export function Page(this:Component<{count:number}>){this.state.count=0;const foreign={ref(){return 'ordinary'}};const value=foreign.ref();return()=> <button onClick={()=>this.state.count++}>{value}:{this.state.count}</button>}`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("ordinary capture rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if response.Analysis.Components[0].Placement == "unknown" {
			t.Fatalf("ordinary capture fixture has opaque placement: %#v", response.Analysis.Components)
		}
		if !strings.Contains(response.Code, "__exactCapture") {
			t.Fatalf("ordinary data lost transport: %s", response.Code)
		}
	}
}

// Finite spreads recreate client refs and callbacks without transporting either executable value.
func TestFiniteSpreadOwnedRefTransport(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "spread-owned-ref.tsx", Target: target, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Diagnostics: "semantic", Source: `import{createRef,type Component}from'@exactjs/core';const token=createRef<HTMLElement>('spread-owned');export function Page(this:Component<{count:number}>){this.state.count=0;const binding=this.ref(token);return()=> <button {...{ref:binding,onClick:()=>{if(binding.current)this.state.count++}}}>{this.state.count}</button>}`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("finite owned ref spread rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if response.Analysis.Components[0].Placement != "isomorphic" {
			t.Fatalf("finite spread lost placement: %#v", response.Analysis.Components)
		}
		if len(response.Analysis.Boundaries) != 1 || response.Analysis.Boundaries[0].Activation.Mode != "eager" {
			t.Fatalf("spread ref lost eager activation: %#v", response.Analysis.Boundaries)
		}
		if target == TargetServer {
			end := strings.Index(response.Code, "__exactHydrationFallback:")
			if end >= 0 && strings.Contains(response.Code[:end], "ref: binding") {
				t.Fatalf("spread ref entered transport: %s", response.Code)
			}
		}
		if target == TargetClient && !strings.Contains(response.Code, "ref: binding") {
			t.Fatalf("spread ref lost client ownership: %s", response.Code)
		}
	}
}
