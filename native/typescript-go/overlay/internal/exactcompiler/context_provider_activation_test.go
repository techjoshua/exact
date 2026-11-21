package exactcompiler

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestMutableContextProviderRetainsOneActivationOwner(t *testing.T) {
	for _, fixture := range []struct {
		name, setup, render string
		published           bool
	}{
		{"provider", `this.state.count=1;const state=this.state;this.setContext(Control,{get count(){return state.count;},increment(){state.count++;}});`, `<section data-count={this.state.count}>{props.children}</section>`, true},
		{"provider-own-handler", `this.state.count=1;const state=this.state;this.setContext(Control,{get count(){return state.count;},increment(){state.count++;}});`, `<section data-count={this.state.count}><button onClick={()=>this.state.count++}>Increment</button>{props.children}</section>`, true},
		{"static-provider", `this.setContext(Control,{count:props.initial});`, `<section>{props.children}</section>`, false},
		{"state-without-context", `this.state.count=props.initial;`, `<section data-count={this.state.count}>{props.children}</section>`, false},
		{"stateful-consumer", `this.state.count=props.initial;this.getContext(Control);`, `<section data-count={this.state.count}>{props.children}</section>`, false},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{
					Kind: "compile", ID: "context-provider.tsx", Target: target, ServerComponents: true,
					Source: `import {createContext,type Component} from "@exactjs/core";const Control=createContext<{count:number;increment?():void}>("Control"); export function Provider(this:Component<{count:number}>,props:{initial:number;children?:unknown}){` + fixture.setup + `return()=> ` + fixture.render + `;}`,
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

func TestContextProviderStateInputDelivery(t *testing.T) {
	root, config := formsSourceFixture(t)
	source := `import {createContext,type Component} from '@exactjs/core';
const Control=createContext<{count:number;increment():void}>('control');
function Child(this:Component<{}>){const ctx=this.getContext(Control);return()=> <button onClick={()=>ctx.increment()}>{ctx.count}</button>}
export function Provider(this:Component<{count:number}>,props:{initial:number}){
  this.state.count=props.initial;
  const state=this.state;
  this.setContext(Control,{get count(){return state.count},increment(){state.count++}});
  return()=> <section data-count={this.state.count}><Child/></section>
}
export function Root(){return()=> <Provider initial={1}/>}
export function ServerPage(){return()=> <main data-host={process.platform}><Provider initial={1}/></main>}
export function Spread(props:{input:{initial:number}}){return()=> <Provider {...props.input}/>}
export function Read(props:{input:{initial:number}}){return()=> <Provider initial={props.input.initial}/>}`
	want := map[string]struct {
		placement  string
		standalone bool
		delivered  bool
	}{
		"Provider":   {"unknown", false, false},
		"Root":       {"isomorphic", true, true},
		"ServerPage": {"server", false, true},
		"Spread":     {"isomorphic", false, true},
		"Read":       {"isomorphic", false, false},
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		r := NewSession().Execute(Request{Kind: "compile", Target: target, ID: filepath.Join(root, "provider.tsx"), Root: root, ConfigFile: config, Source: source, ServerComponents: true})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatalf("%s: %s %v", target, r.Error, formsDiagnosticDetails(r.Diagnostics))
		}
		seen := 0
		for _, c := range r.Analysis.Components {
			expect, ok := want[c.Name]
			if !ok {
				continue
			}
			seen++
			if c.Placement != expect.placement || c.StandaloneClientActivation != expect.standalone || (c.ClientIslandCount == 1) != expect.delivered {
				t.Errorf("%s %s: placement=%s, activation=%v, islands=%d; want %+v", target, c.Name, c.Placement, c.StandaloneClientActivation, c.ClientIslandCount, expect)
			}
		}
		if seen != len(want) {
			t.Fatalf("%s: found %d of %d components", target, seen, len(want))
		}
	}
}
