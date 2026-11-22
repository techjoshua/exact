package exactcompiler

import "testing"

// The deferred task reads either the live state slot or an explicit setup
// snapshot. Authored getter effects follow the selected array alternatives.
func TestDeferredTaskComponentStateCapturePlacement(t *testing.T) {
	const browserArray = `[{get id(){return document.title.length}}]`
	cases := []struct{ name, initial, binding, setup, extra, placement string }{
		{"live-current-getter", "[{id:2}]", "this.state.items", "this.state.items=" + browserArray + ";", "", "client"},
		{"snapshot-skips-replacement-getter", "[{id:2}]", "peek(()=>this.state.items)", "this.state.items=" + browserArray + ";", "", "isomorphic"},
		{"snapshot-keeps-selected-getter", browserArray, "peek(()=>this.state.items)", "this.state.items=[{id:2}];", "", "client"},
		{"indexed-alias-write", "[{id:2}]", "this.state.items", "items[0]=" + browserArray + "[0]!;", "", "unknown"},
		{"authored-method", "[{id:2}]", "this.state.items", "items.push=function(...rows){document.title;return rows.length};", "items.push({id:first});", "unknown"},
		{"opaque-sibling", "[{id:2}]", "this.state.items", "", "unavailable().value;", "unknown"},
	}
	for _, row := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			for _, mode := range []string{"application", "library"} {
				t.Run(row.name+"/"+string(target)+"/"+mode, func(t *testing.T) {
					source := `
import {TaskContext,peek,type Component} from '@exactjs/core';
declare function unavailable(): {value:number};
export function Page(this:Component<{items:{id:number}[];result:number}>){
  this.state.items=` + row.initial + `;
  this.state.result=0;
  const items=` + row.binding + `;
  ` + row.setup + `
  async function load(task:TaskContext=TaskContext.deferred()){
    const first=items[0]!.id;
    this.state.result=first;
    ` + row.extra + `
  }
  load();
  return()=> <output>{this.state.result}</output>;
}`
					response := NewSession().Execute(Request{
						Kind: "compile", ID: "component-capture.tsx", Source: source, Target: target, PackageType: mode,
					})
					if response.Error != "" {
						t.Fatalf("could not analyze task: %s", response.Error)
					}
					if tasks := response.Analysis.Tasks; len(tasks) != 1 || tasks[0].Placement != row.placement {
						t.Fatalf("expected one %s task, got %#v", row.placement, tasks)
					}
					if row.placement != "unknown" {
						assertReactiveCompilation(t, response, source)
					} else if response.Code != "" || !hasErrorDiagnostic(response.Diagnostics) {
						t.Fatalf("unresolved task emitted executable code or omitted its diagnostic: %#v", response.Diagnostics)
					}
				})
			}
		}
	}
}
