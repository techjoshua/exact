package exactcompiler

import (
	"strings"
	"testing"
)

func TestTaskHelperStateViewWarningAndAcknowledgment(t *testing.T) {
	for _, acknowledgment := range []string{"", "/** @exact state-view */"} {
		source := `import {TaskContext,type Component} from '@exactjs/core';
const original={count:0};function compare(state:{count:number}){return state===original;}
export function Page(this:Component<{count:number}>){this.state.count=0;
const run=(task:TaskContext=TaskContext.client().blocking())=>{` + acknowledgment + `
this.state.count=compare(this.state)?1:0;};return()=> <button onClick={()=>run()} />;}`
		response := NewSession().Execute(Request{Kind: "compile", Target: TargetClient, ID: "view-warning.tsx", Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		warned := hasDiagnosticCode(response.Diagnostics, "EXACT2231")
		if warned != (acknowledgment == "") {
			t.Fatalf("unexpected view warning for %q: %#v", acknowledgment, response.Diagnostics)
		}
	}
}

func TestTaskHelperClassBoundaryCannotBeAcknowledgedAway(t *testing.T) {
	for _, receiver := range []string{"this.state.counter.read", `this.state.counter["read"]`, "this.state.counter.field", `this.state.counter["field"]`, "service.read", `service["read"]`, "service.field", `service["field"]`} {
		source := `import {TaskContext,type Component} from '@exactjs/core';
class Counter{count=1;#value=0;read(){return ++this.#value;}field=()=>++this.#value;}const service=new Counter();
export function Page(this:Component<{count:number;counter:Counter}>){this.state.count=0;this.state.counter=new Counter();
const run=(task:TaskContext=TaskContext.client().blocking())=>{/** @exact state-view */
this.state.count=this.state.counter.count;
/** @exact state-view */ this.state.count=` + receiver + `();};return()=> <button onClick={()=>run()} />;}`
		response := NewSession().Execute(Request{Kind: "compile", Target: TargetClient, ID: "view-class.tsx", Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if hasDiagnosticCode(response.Diagnostics, "EXACT2230") != strings.HasPrefix(receiver, "this.state.counter") {
			t.Fatalf("unexpected class boundary for %s: %#v", receiver, response.Diagnostics)
		}
		if strings.Contains(response.Code, "registerTaskHelper") {
			t.Fatal("ordinary class acquired a generated companion")
		}
	}
}
