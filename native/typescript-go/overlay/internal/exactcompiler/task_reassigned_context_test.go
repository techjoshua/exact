package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// The initial context read belongs to setup. The server invocation reads the
// present lexical binding unless it is a stable context alias.
func TestInvokedTaskReassignedContextCapture(t *testing.T) {
	for _, c := range []struct {
		name, setup, body, token string
		capture                  bool
	}{
		{"assignment", "let value=this.getContext(Shared); value=local;", "value.role", "", true},
		{"destructuring", "let value=this.getContext(Shared); const replace=()=>{({value}= {value:local});}; replace();", "value.role", "", true},
		{"loop", "let value=this.getContext(Shared); for(value of [local]){}", "value.role", "", true},
		{"late-write", "let value=this.getContext(Shared); const replace=()=>{value=local;};", "value.role", "", true},
		{"stable-let", "let value=this.getContext(Shared);", "value.role", "Shared", false},
		{"shadow", "let value=this.getContext(Shared); {let value=local; value=local;}", "value.role", "Shared", false},
		{"same-token", "let value=this.getContext(Shared); value=local;", "value.role + this.getContext(Shared).role", "Shared", true},
		{"prefix-increment", "let value=this.getContext(Shared); ++(value);", "String(value)", "", true},
		{"postfix-increment", "let value=this.getContext(Shared); value++;", "String(value)", "", true},
		{"prefix-decrement", "let value=this.getContext(Shared); --value;", "String(value)", "", true},
		{"postfix-decrement", "let value=this.getContext(Shared); (value)--;", "String(value)", "", true},
		{"shadow-update", "let value=this.getContext(Shared); {let value=0; value++;}", "String(value)", "Shared", false},
		{"property-update", "let value=this.getContext(Shared); value.count++;", "String(value.count)", "Shared", false},
		{"shorthand-replaced", "let value=this.getContext(Shared); value++;", "String(({value}).value)", "", true},
		{"inner-shadow", "let value=this.getContext(Shared);", "{ { const value=0; void value; } return String(value); }", "Shared", false},
		{"shorthand-stable", "let value=this.getContext(Shared);", "String(({value}).value)", "Shared", false},
		{"unary-read", "let value=this.getContext(Shared); void +value;", "String(value)", "Shared", false},
		{"trim-string", "let value=this.getContext(Shared); value=' replacement ';", "value.trim()", "", true},
		{"trim-authored", "let value=this.getContext(Shared); value={trim(){return 'replacement';}};", "value.trim()", "", true},
		{"body-only-write", "let value=this.getContext(Shared);", "{const before=value.trim(); value=' body '; return before+value.trim();}", "Shared", false},
		{"outer-and-body-write", "let value=this.getContext(Shared); value=' replacement ';", "{const before=value.trim(); value=' body '; return before+value.trim();}", "", true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				typ, local := "{role:string}", "{role:'local'}"
				if strings.Contains(c.body, ".trim()") {
					typ, local = "Trimmable", "' replacement '"
				} else if c.body == "String(value)" || c.body == "String(({value}).value)" || c.name == "inner-shadow" {
					typ, local = "number", "1"
				} else if c.name == "property-update" {
					typ, local = "{count:number}", "{count:1}"
				}
				extra := ""
				if c.name == "late-write" {
					extra = "replace();"
				}
				r := NewSession().Execute(Request{
					Kind: "compile", ID: "reassigned-task-context.tsx", Target: target,
					Diagnostics: "semantic", ServerComponents: true,
					Source: `import {TaskContext,createContext,type Component} from '@exactjs/core';
interface Trimmable { trim(): string }
const Shared=createContext<` + typ + `>('roles',{keep:'shared'});
export function Page(this:Component<{ready:boolean}>){
this.state.ready=true;
const local=` + local + `;
` + c.setup + `
const run=(task:TaskContext=TaskContext.server().blocking())=>` + c.body + `;
return ()=> <button onClick={()=>{` + extra + `return run();}}>{this.state.ready ? 'Run' : ''}</button>;
}`,
				})
				if r.Error != "" || len(r.Diagnostics) != 0 || len(r.Analysis.Continuations) != 1 {
					t.Fatalf("expected a single valid continuation: %s %#v", r.Error, r.Diagnostics)
				}
				activation := r.Analysis.Continuations[0].Activation
				contexts := activation.PublicContexts
				if c.token == "" && len(contexts) != 0 || c.token != "" && (len(contexts) != 1 || contexts[0].Token != c.token) {
					t.Fatalf("unexpected executor contexts: %#v", contexts)
				}
				deps := activation.Dependencies
				if c.capture && (len(deps) != 1 || deps[0].Source != "derived" || deps[0].Path != "value") || !c.capture && len(deps) != 0 {
					t.Fatalf("unexpected executor dependencies: %#v", deps)
				}
				if !strings.Contains(r.Code, ".getContext(Shared)") {
					t.Fatal("setup context read was removed")
				}
			})
		}
	}
}
