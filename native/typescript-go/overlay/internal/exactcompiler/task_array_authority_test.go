package exactcompiler

import (
	"strings"
	"testing"
)

// A proven mutator owns the complete array at its finite receiver path. The
// variable set of edited cells does not make that receiver path uncertain.
func TestTaskArrayMutationAuthority(t *testing.T) {
	for _, work := range []string{
		`this.state.values.push(3);`, `this.state.values.pop();`,
		`this.state.values.shift();`, `this.state.values.unshift(3);`,
		`this.state.values.splice(0,1,3);`, `this.state.values.reverse();`,
		`this.state.values.sort();`, `this.state.values.fill(3);`,
		`this.state.values.copyWithin(0,1);`,
		`const values=this.state.values;values["push"](3);`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", Target: target, ID: "array-authority.tsx", Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core'; export function Page(this:Component<{values:number[]}>){this.state.values=[1,2]; async function update(task:TaskContext=TaskContext.server()){await Promise.resolve();` + work + `} return()=> <button onClick={()=>update()}>Update</button>;}`})
			if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
				t.Fatalf("%s/%s: %s %#v", target, work, response.Error, response.Diagnostics)
			}
			found := false
			for _, task := range response.Analysis.Tasks {
				for _, write := range task.Writes {
					if write.Path == "values" {
						found = true
						if write.Confidence != "exact" {
							t.Fatalf("%s/%s lost finite array authority: %#v", target, work, write)
						}
					}
				}
			}
			if !found {
				t.Fatalf("%s/%s lost array output", target, work)
			}
			if target == TargetServer && (!strings.Contains(response.Code, "mutateReactiveArray") || !strings.Contains(response.Code, "stateWrites")) {
				t.Fatalf("%s lost server mutation lowering", work)
			}
		}
	}
}
