package exactcompiler

import (
	"strings"
	"testing"
)

func TestPartitionDerivedCapturesBridgeOrdinaryInputs(t *testing.T) {
	for _, definition := range []string{
		`const prefix='Count';const label=props.label+prefix;`,
		`function decorate(value:string){return value+'!'}const label=decorate(props.label);`,
	} {
		source := `import {type Component} from '@exactjs/core';export function Probe(this:Component<{count:number}>,props:{label:string}){this.state.count=0;` + definition + `return()=> <button onClick={()=>this.state.count++}>{label}:{this.state.count}</button>;}`
		server := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/derived-inputs.tsx", Target: TargetServer, ServerComponents: true, Source: source})
		if server.Error != "" || len(server.Diagnostics) != 0 {
			t.Fatalf("derived source rejected: %s %#v", server.Error, server.Diagnostics)
		}
		if !strings.Contains(server.Code, `"__exactCapture"`) || !strings.Contains(server.Code, `props: { label: props["label"] }`) {
			t.Fatalf("transitive props input missing:\n%s", server.Code)
		}
		client := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/derived-inputs.tsx", Target: TargetClient, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Source: source})
		if client.Error != "" || len(client.Diagnostics) != 0 {
			t.Fatalf("derived client rejected: %s %#v", client.Error, client.Diagnostics)
		}
		if !strings.Contains(client.Code, "Probe_ExactClient_1") || !strings.Contains(client.Code, "__exactCapture") {
			t.Fatalf("client reconstruction lost the input envelope:\n%s", client.Code)
		}
	}
}
