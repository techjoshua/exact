package exactcompiler

import (
	"strings"
	"testing"
)

// A private server declaration can still be the value in an exported module
// receipt. Its inert boundary must survive like exported and value-form peers;
// keeping that reference supplies no server implementation to the client.
func TestClientBoundaryRetainsPrivateServerReferences(t *testing.T) {
	const body = `function prepare(_task:TaskContext=TaskContext.server().blocking()){const secret='SERVER_ONLY_PRIVATE_BODY';void secret;}prepare();return()=> <p>SERVER_RENDER_ONLY</p>;`
	for _, row := range []struct{ name, definition string }{
		{"private-declaration", `function Private(props:{value:number}){` + body + `}`},
		{"exported-declaration", `export function Private(props:{value:number}){` + body + `}`},
		{"private-arrow", `const Private=(props:{value:number})=>{` + body + `};`},
		{"private-function-value", `const Private=function(props:{value:number}){` + body + `};`},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import{TaskContext}from'@exactjs/core';` + row.definition + `export const receipt=<Private value={1}/>;`
			request := Request{Kind: "compile", ID: "client-boundary-reference.tsx", Source: source, Target: TargetClient, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Diagnostics: "semantic"}
			client := NewSession().Execute(request)
			if client.Error != "" || hasErrorDiagnostic(client.Diagnostics) || client.Code == "" {
				t.Fatal("retained client receipt is not a valid module", client.Error, frameworkConsumerDiagnostics(client.Diagnostics))
			}
			found := false
			for _, component := range client.Analysis.Components {
				if component.Name == "Private" {
					found = true
					if component.Placement != "server" {
						t.Fatal("source failed to exercise server elision", component.Placement)
					}
				}
			}
			if !found || !strings.Contains(client.Code, "export const receipt") || !strings.Contains(client.Code, "createServerBoundary") {
				t.Fatal("retained reference lost its inert boundary", client.Code)
			}
			for _, secret := range []string{"SERVER_ONLY_PRIVATE_BODY", "SERVER_RENDER_ONLY", "process"} {
				if strings.Contains(client.Code, secret) {
					t.Fatal("server implementation leaked", secret)
				}
			}
			request.Target = TargetServer
			request.ComponentContractProjection = ComponentContractProjectionComplete
			server := NewSession().Execute(request)
			if server.Error != "" || hasErrorDiagnostic(server.Diagnostics) || server.Code == "" || !strings.Contains(server.Code, "SERVER_RENDER_ONLY") {
				t.Fatal("server implementation lost", server.Error, frameworkConsumerDiagnostics(server.Diagnostics))
			}
		})
	}
}

// A retained stub does not displace the existing authority for a server child
// range. The actual partition edge still owns the client slot replacement.
func TestClientBoundaryKeepsNestedPartition(t *testing.T) {
	const source = `import{TaskContext,type Component}from'@exactjs/core';
 function ServerPart(props:{value:number}){function prepare(_task:TaskContext=TaskContext.server().blocking()){}prepare();return()=> <p>SERVER_ONLY_CHILD_BODY</p>;}
 export function Client(this:Component<{editing:boolean}>){this.state.editing=false;return()=> <section><button onClick={()=>this.state.editing=!this.state.editing}>next</button><ServerPart value={1}/></section>;}
 export const receipt=<Client/>;`
	response := NewSession().Execute(Request{Kind: "compile", ID: "client-boundary-partition.tsx", Source: source, Target: TargetClient, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal("nested partition compile", response.Error, frameworkConsumerDiagnostics(response.Diagnostics))
	}
	contract := ""
	for _, component := range response.Analysis.Components {
		if component.Name == "ServerPart" {
			contract = component.ID
		}
	}
	node := ""
	for _, candidate := range response.Analysis.PartitionPlan.Nodes {
		if candidate.ComponentContract == contract {
			node = candidate.ID
		}
	}
	edge := false
	for _, candidate := range response.Analysis.PartitionPlan.Edges {
		edge = edge || candidate.Child == node
	}
	if contract == "" || node == "" || !edge || !strings.Contains(response.Code, "createServerSlot") || strings.Contains(response.Code, "SERVER_ONLY_CHILD_BODY") {
		t.Fatal("server child lost partition ownership", contract, node, edge, response.Code)
	}
}
