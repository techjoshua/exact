package exactcompiler

import (
	"strings"
	"testing"
)

// An object method has its own `this`, while a captured component alias still owns
// its state facade. Mutation helpers must receive that facade rather than the instance.
func TestStateComponentAliasMethodReceivers(t *testing.T) {
	for _, receiver := range []struct{ name, setup, access string }{
		{"component", "const owner=this;", "owner.state"},
		{"state", "const owner=this.state;", "owner"},
		{"wrapped-component", "const owner=((this));", "owner.state"},
	} {
		for _, mutation := range []string{".count=2", ".count++", ".count+=2", ".count&&=2", ".nested.value=2", ".values.push(2)", ".lookup.set('x',2)", ".optional=undefined", "DELETE"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(receiver.name+mutation+string(target), func(t *testing.T) {
					work := receiver.access + mutation + ";"
					if mutation == "DELETE" {
						work = "delete " + receiver.access + ".optional;"
					}
					source := `export function Page(this:{state:{count:number;nested:{value:number};values:number[];lookup:Map<string,number>;optional?:number}}){this.state.count=0;this.state.nested={value:0};this.state.values=[];this.state.lookup=new Map();this.state.optional=1;` + receiver.setup + `const context={run(){` + work + `}};context.run();return()=> <output>{this.state.count}</output>;}`
					response := NewSession().Execute(Request{Kind: "compile", ID: "component-alias.tsx", Target: target, Source: source})
					assertReactiveCompilation(t, response, source)
					if receiver.access == "owner.state" && strings.Contains(response.Code, "(owner,") {
						t.Fatalf("component instance used as state facade:\n%s", response.Code)
					}
					if target == TargetClient && !strings.Contains(response.Code, "("+receiver.access+",") {
						t.Fatalf("authored alias receiver was not retained:\n%s", response.Code)
					}
				})
			}
		}
	}
}
