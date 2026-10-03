package exactcompiler

import "testing"

// Compilation must retain valid task inputs while lowering overlapping writes through one pending owner.
func TestTaskPendingOverlappingPathsCompile(t *testing.T) {
	for _, work := range []string{
		`const state=this.state;state.count+=1;this.state.trace=String(state.count);`,
		`const state=this.state;const key:'count'='count';state[key]+=1;this.state.trace=String(state[key]);`,
		`const {nested}=this.state;nested.value??=1;this.state.trace=String(nested.value);`,
		`this.state.nested={value:2};this.state.nested.value+=1;this.state.trace=String(this.state.nested.value);`,
		`this.state.nested.value=2;this.state.nested={value:this.state.nested.value+1};`,
		`const read=(value=this.state.count)=>value;this.state.count=2;this.state.trace=String(read());`,
		`this.state.values.push(2);this.state.values[0]+=1;this.state.trace=String(this.state.values.at(0));`,
		`const source={nested:[2,3]};({nested:[this.state.count,this.state.values[0]]}=source);`,
		`const value=this.state.nested?.value??this.state.count;await Promise.resolve();this.state.trace=String(value);`,
	} {
		for _, placement := range []string{"client", "server"} {
			t.Run(placement+"/"+work, func(t *testing.T) {
				session := NewSession()
				source := `import {TaskContext,type Component} from '@exactjs/core';
export function Probe(this:Component<{count:number;nested:{value:number};values:number[];trace:string}>){
this.state.count=0;this.state.nested={value:0};this.state.values=[0];this.state.trace='';
const run=async(task:TaskContext=TaskContext.` + placement + `().blocking())=>{` + work + `};
return()=> <button onClick={()=>run()}>{this.state.trace}</button>;}`
				for _, target := range []Target{TargetClient, TargetServer} {
					response := session.Execute(Request{Kind: "compile", ID: "pending-paths.tsx", Source: source, Target: target})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					computedContinuation := placement == "server" && work == `const state=this.state;const key:'count'='count';state[key]+=1;this.state.trace=String(state[key]);`
					if computedContinuation {
						if !hasDiagnosticCode(response.Diagnostics, "EXACT2001") {
							t.Fatalf("unrepresentable continuation accepted: %#v", response.Diagnostics)
						}
					} else {
						for _, diagnostic := range response.Diagnostics {
							if diagnostic.Severity == "error" {
								t.Fatalf("valid pending paths rejected: %#v", response.Diagnostics)
							}
						}
					}
				}
			})
		}
	}
}
