package exactcompiler

import "testing"

// The task's canonical async body has no installed argument values. The
// checked primitive Get and Call still have their standard effects, while an
// authored receiver retains its getter and its placement requirement.
func TestCheckedPrimitiveStartupTaskPlacement(t *testing.T) {
	cases := []struct{ name, body, placement string }{
		{"startup", `this.state.result+=query.toUpperCase();`, "isomorphic"},
		{"member-only", `const method=query.toUpperCase;void method;this.state.result+=query;`, "isomorphic"},
		{"computed-member", `const key='toUpperCase' as const;this.state.result+=query[key]();`, "isomorphic"},
		{"authored-getter", `const box={get toUpperCase(){document.title;return ()=>query;}};this.state.result+=box.toUpperCase();`, "client"},
	}
	for _, row := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			for _, mode := range []string{"application", "library"} {
				t.Run(row.name+"/"+string(target)+"/"+mode, func(t *testing.T) {
					source := `
import {type Component} from '@exactjs/core';
export function Page(this:Component<{query:string;result:string}>){
  this.state.query='first';
  this.state.result='';
  const load=async(query:string)=>{
    await Promise.resolve();
    ` + row.body + `
  };
  load(this.state.query);
  return()=> <button onClick={()=>{this.state.query='second';}}>{this.state.result}</button>;
}`
					response := NewSession().Execute(Request{
						Kind: "compile", ID: "primitive-startup.tsx", Source: source, Target: target, PackageType: mode,
					})
					assertReactiveCompilation(t, response, source)
					if tasks := response.Analysis.Tasks; len(tasks) != 1 || tasks[0].Placement != row.placement {
						t.Fatalf("expected one %s task, got %#v", row.placement, tasks)
					}
				})
			}
		}
	}
}
