package exactcompiler

import (
	"strings"
	"testing"
)

func TestMutableContextProviderRetainsOneActivationOwner(t *testing.T) {
	for _, fixture := range []struct {
		name, setup, render string
		published           bool
	}{
		{"provider", `this.state.count=props.initial;const state=this.state;this.setContext(Control,{get count(){return state.count;},increment(){state.count++;}});`, `<section data-count={this.state.count}>{props.children}</section>`, true},
		{"provider-own-handler", `this.state.count=props.initial;const state=this.state;this.setContext(Control,{get count(){return state.count;},increment(){state.count++;}});`, `<section data-count={this.state.count}><button onClick={()=>this.state.count++}>Increment</button>{props.children}</section>`, true},
		{"static-provider", `this.setContext(Control,{count:props.initial});`, `<section>{props.children}</section>`, false},
		{"state-without-context", `this.state.count=props.initial;`, `<section data-count={this.state.count}>{props.children}</section>`, false},
		{"stateful-consumer", `this.state.count=props.initial;this.getContext(Control);`, `<section data-count={this.state.count}>{props.children}</section>`, false},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{
					Kind: "compile", ID: "context-provider.tsx", Target: target, ServerComponents: true,
					Source: `declare class Component<State>{state:State;setContext(token:unknown,value:unknown):void;getContext(token:unknown):unknown;} const Control={}; export function Provider(this:Component<{count:number}>,props:{initial:number;children?:unknown}){` + fixture.setup + `return()=> ` + fixture.render + `;}`,
				})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("provider compilation failed: %s %v", response.Error, formsDiagnosticDetails(response.Diagnostics))
				}
				component := response.Analysis.Components[0]
				if component.StandaloneClientActivation != fixture.published || component.ClientIslandCount != 0 {
					t.Fatalf("provider activation=%v islands=%d, expected activation=%v and no detached islands", component.StandaloneClientActivation, component.ClientIslandCount, fixture.published)
				}
				if target == TargetServer && strings.Contains(response.Code, `@exactjs/ssr/runtime/resumption-boundaries`) != fixture.published {
					t.Fatalf("server publication capability differs from provider ownership:\n%s", response.Code)
				}
				if target == TargetServer && strings.Contains(response.Code, `kind: "resumption"`) != fixture.published {
					t.Fatalf("server publication differs from provider ownership:\n%s", response.Code)
				}
			}
		})
	}
}
