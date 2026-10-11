package exactcompiler

import (
	"strings"
	"testing"
)

func TestLocalClientOwnersPublishWithoutServerContinuations(t *testing.T) {
	for _, fixture := range []struct {
		name, setup, render string
		published           bool
	}{
		{"local-state", `this.state.count=0;`, `<button onClick={()=>this.state.count++}>{this.state.count}</button>`, true},
		{"stateless-handler", ``, `<button onClick={()=>{}}>Action</button>`, true},
		{"mount", `this.onMount(()=>{});`, `<output>Mounted</output>`, true},
		{"passive", ``, `<output>Static</output>`, false},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			response := NewSession().Execute(Request{
				Kind: "compile", ID: "local-owner.tsx", Target: TargetServer,
				Source: `declare class Component<State>{state:State;onMount(callback:()=>void):void;} export function LocalOwner(this:Component<{count:number}>){` + fixture.setup + `return()=> ` + fixture.render + `;}`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("local owner compilation failed: %s %v", response.Error, formsDiagnosticDetails(response.Diagnostics))
			}
			if got := strings.Contains(response.Code, `kind: "resumption"`); got != fixture.published {
				t.Fatalf("publication=%v, expected=%v:\n%s", got, fixture.published, response.Code)
			}
			if fixture.published && strings.Contains(response.Code, `mode: "stateless"`) {
				t.Fatal("activation publication was assigned the stateless executor contract")
			}
		})
	}
}

func TestPartitionedClientOwnersDoNotPublishASecondActivation(t *testing.T) {
	response := NewSession().Execute(Request{
		Kind: "compile", ID: "partitioned-owner.tsx", Target: TargetServer, ServerComponents: true,
		Source: `declare class Component<State>{state:State;} export function LocalOwner(this:Component<{count:number}>){this.state.count=0;return()=> <button onClick={()=>this.state.count++}>{this.state.count}</button>;} /** @exact server */ export function Page(){return()=> <LocalOwner/>;}`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("partitioned owner compilation failed: %s %v", response.Error, formsDiagnosticDetails(response.Diagnostics))
	}
	for _, component := range response.Analysis.Components {
		if component.Name == "LocalOwner" {
			if component.ClientIslandCount == 0 || component.StandaloneClientActivation {
				t.Fatalf("partitioned owner received an overlapping activation: %#v", component)
			}
			return
		}
	}
	t.Fatal("partitioned source lost LocalOwner")
}
