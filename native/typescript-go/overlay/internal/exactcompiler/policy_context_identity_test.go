package exactcompiler

import (
	"strings"
	"testing"
)

// Context policy belongs to the lexical token and compiler-owned operation,
// rather than another receiver's method name or a shadowed token spelling.
func TestPolicyContextOperationIdentity(t *testing.T) {
	for _, c := range []struct {
		name, body string
		server     bool
	}{
		{"set", `this.setContext(Token,1);return()=> <p>public</p>;`, true},
		{"native", `const label=this.getContext(Token);return()=> <p>{label}</p>;`, true},
		{"token-alias", `const Alias=Token;const label=this.getContext(Alias);return()=> <p>{label}</p>;`, true},
		{"computed-native", `const label=this['getContext'](Token);return()=> <p>{label}</p>;`, true},
		{"lookalike", `const other={getContext(token:unknown){return 'public'}};const label=other.getContext(Token);return()=> <p>{label}</p>;`, false},
		{"shadowed-token", `const Token={};const label=this.getContext(Token);return()=> <p>{label}</p>;`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `import{createContext}from '@exactjs/core';const Token=createContext('token',{scope:'request'});export function Page(this:{getContext(token:unknown):string;setContext(token:unknown,value:number):void}){` + c.body + `}`
			r := NewSession().Execute(Request{Kind: "compile", ID: "context-operation-identity.tsx", Source: source, Target: TargetServer})
			if r.Error != "" || len(r.Analysis.Components) != 1 {
				t.Fatalf("invalid fixture: %s %#v", r.Error, r.Diagnostics)
			}
			if got := r.Analysis.Components[0].Placement; (got == "server") != c.server {
				t.Fatalf("incorrect context ownership: placement=%s diagnostics=%#v", got, r.Diagnostics)
			}
			if r.Code == "" || !strings.Contains(r.Code, `placement: "`+r.Analysis.Components[0].Placement+`"`) {
				t.Fatalf("emitted server contract lost context residency: %#v", r.Diagnostics)
			}
		})
	}
}

// A native context contract supplies no release authority for an independently
// secret-qualified result field, including through an ordinary lookalike method.
func TestPolicyContextOperationKeepsIndependentSecret(t *testing.T) {
	for _, call := range []string{"this.getContext(Token)", "other.getContext(Token)"} {
		source := `import{createContext}from '@exactjs/core';declare const marker:unique symbol;
/** @exact keep=secret */ type Credential=string&{readonly[marker]:true};
declare const payload:{label:string;credential:Credential};
const Token=createContext('token',{keep:'shared'});
export function Page(this:{getContext(token:unknown):typeof payload}){
const other={getContext(token:unknown){return payload}};
const value=` + call + `;return()=> <p>{value.credential}</p>;}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "context-independent-secret.tsx", Source: source})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		if !hasDiagnosticCode(r.Diagnostics, "EXACT3020") || r.Code != "" {
			t.Fatalf("%s released independent secret: %#v", call, r.Diagnostics)
		}
	}
}

// Residency narrows available targets. It cannot erase another operation's
// opaque writer or known browser effect to manufacture server execution proof.
func TestPolicyContextResidencyPreservesIndependentEffects(t *testing.T) {
	for _, fixture := range []struct{ name, work, effect string }{
		{"unknown-writer", `mutate(this);`, "unknown"},
		{"browser", `void document.title;`, "browser"},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			source := `import{createContext}from '@exactjs/core';declare function mutate(value:unknown):void;const Token=createContext('token',{scope:'request'});export function Page(this:{getContext(token:unknown):string}){` + fixture.work + `const label=this.getContext(Token);return()=> <p>{label}</p>;}`
			r := NewSession().Execute(Request{Kind: "analyze", ID: "context-independent-effects.tsx", Source: source})
			if r.Error != "" || len(r.Analysis.Components) != 1 {
				t.Fatalf("invalid fixture: %s %#v", r.Error, r.Diagnostics)
			}
			component := r.Analysis.Components[0]
			if component.EnvironmentEffect != fixture.effect {
				t.Fatalf("context cleared independent effect: %#v", component)
			}
			if fixture.name == "unknown-writer" && len(component.ArtifactTargets) != 0 {
				t.Fatalf("context granted target authority: %#v", component)
			}
		})
	}
}

// The same authored token name must acquire policy from the current source
// generation, including after reset, rather than retaining a prior scope.
func TestPolicyContextGenerationIsolation(t *testing.T) {
	session := NewSession()
	for _, reset := range []bool{false, true} {
		for _, scope := range []string{"request", "component", "request"} {
			if reset {
				if r := session.Execute(Request{Kind: "reset"}); r.Error != "" {
					t.Fatal(r.Error)
				}
			}
			source := `import{createContext}from '@exactjs/core';export const Token=createContext('token',{scope:'` + scope + `'});export function Page(this:{getContext(token:unknown):string}){const label=this.getContext(Token);return()=> <p>{label}</p>;}`
			request := Request{Kind: "analyze", ID: "context-generation.tsx", Source: source}
			for _, r := range []Response{session.Execute(request), NewSession().Execute(request)} {
				if r.Error != "" || len(r.Analysis.Components) != 1 {
					t.Fatalf("invalid fixture: %s %#v", r.Error, r.Diagnostics)
				}
				if server := r.Analysis.Components[0].Placement == "server"; server != (scope == "request") {
					t.Fatalf("scope=%s stale context policy: %#v", scope, r.Analysis.Components)
				}
			}
		}
	}
}

// An untrusted protocol key cannot borrow the known getContext contract or use
// a token's residency as execution proof for whichever method it selects.
func TestPolicyContextUnknownOperation(t *testing.T) {
	source := `import{createContext}from '@exactjs/core';declare const key:string;const Token=createContext('token',{scope:'request'});export function Page(this:{[method:string]:(token:unknown)=>string}){const label=this[key](Token);return()=> <p>{label}</p>;}`
	r := NewSession().Execute(Request{Kind: "analyze", ID: "context-unknown-operation.tsx", Source: source})
	if r.Error != "" || len(r.Analysis.Components) != 1 {
		t.Fatalf("invalid fixture: %s %#v", r.Error, r.Diagnostics)
	}
	component := r.Analysis.Components[0]
	if component.EnvironmentEffect != "unknown" || len(component.ArtifactTargets) != 0 {
		t.Fatalf("unknown operation acquired authority: %#v", component)
	}
}

// A context read owned by a server task restricts that task, while the component
// keeps its independently available client/server facets and client invocation.
func TestPolicyContextTaskOwnership(t *testing.T) {
	source := `import{createContext,TaskContext}from '@exactjs/core';const Token=createContext('token',{scope:'request'});export function Page(this:{getContext(token:unknown):string}){const run=(_task:TaskContext=TaskContext.server())=>{this.getContext(Token)};return()=> <button onClick={()=>run()}>Read</button>;}`
	for _, target := range []Target{TargetServer, TargetClient} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "context-task-owner.tsx", Source: source, Target: target})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || len(r.Analysis.Components) != 1 || r.Code == "" {
			t.Fatalf("%s compilation failed: %s %#v", target, r.Error, r.Diagnostics)
		}
		if r.Analysis.Components[0].Placement != "isomorphic" {
			t.Fatalf("context task restricted the component: %#v", r.Analysis.Components)
		}
		if len(r.Analysis.Tasks) != 1 || r.Analysis.Tasks[0].Placement != "server" {
			t.Fatalf("context lost task residency: %#v", r.Analysis.Tasks)
		}
		if target == TargetClient && strings.Contains(r.Code, "this.getContext(Token)") {
			t.Fatal("server context read retained in client task body")
		}
	}
}
