package exactcompiler

import (
	"strings"
	"testing"
)

// Hydration contracts protect return values across each supported route declaration form.
func TestPolicySubsystemHydrationSources(t *testing.T) {
	for _, keep := range []string{"secret", "server", "client", "shared"} {
		for _, form := range []string{`const loader=()=>value;const route={loader};`, `const route={loader:()=>value};`, `const route={loader(){return value;}};`, `const route={action:()=>value};`, `const route={loader:function(){return value;}};`} {
			source := `/** @exact keep=` + keep + ` */ declare const value:string;` + form + `export function Page(){return()=> <p>Public</p>;}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "route-policy.tsx", Target: TargetServer, Source: source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			denied := keep == "secret" || keep == "server"
			if hasDiagnosticCode(response.Diagnostics, "EXACT3020") != denied {
				t.Fatalf("keep=%s form=%s diagnostics=%#v", keep, form, response.Diagnostics)
			}
			if denied && response.Code != "" {
				t.Fatal("rejected hydration emitted code")
			}
		}
	}
}

// Secret control inputs retain their policy across every native control structure.
func TestPolicySubsystemControlSources(t *testing.T) {
	for _, control := range []string{`if(value){BODY}`, `while(value){BODY;break;}`, `do{BODY;break;}while(value);`, `for(;value;){BODY;break;}`, `for(const key in value){BODY}`, `for(const item of [value]){BODY}`, `switch(value){case 'x':BODY;}`, `value?(BODY):undefined;`, `value&&(BODY);`, `value||(BODY);`, `value??(BODY);`} {
		for _, sink := range []string{`console.log('public')`, `(()=>{throw 'public';})()`, `(()=>{let destination='';destination+='public';})()`} {
			source := `/** @exact keep=secret */ declare const value:string;function work(){` + strings.ReplaceAll(control, "BODY", sink) + `}export function Page(){return()=> <p>Public</p>;}`
			r := NewSession().Execute(Request{Kind: "analyze", ID: "control-policy.tsx", Source: source})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			// A nested callable owns its control flow. The surrounding condition does not enter its body.
			expected := !strings.Contains(sink, "=>")
			if hasDiagnosticCode(r.Diagnostics, "EXACT3020") != expected {
				t.Fatalf("%s %s: %#v", control, sink, r.Diagnostics)
			}
		}
	}
}

// Type qualification survives standard containers, recursive records and public projections.
func TestPolicySubsystemTypeSources(t *testing.T) {
	prefix := `declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};`
	for _, example := range []struct {
		declarations, expression string
		denied                   bool
	}{
		{`declare const value:Map<string,Protected<string>>;`, `value.size`, true},
		{`declare const value:ReadonlyMap<string,Protected<string>>;`, `value.has('x')`, true},
		{`declare const value:Set<Protected<string>>;`, `value.size`, true},
		{`declare const value:ReadonlySet<Protected<string>>;`, `value.has('x' as Protected<string>)`, true},
		{`declare const value:Promise<Protected<string>>;`, `JSON.stringify(value)`, true},
		{`declare const value:Protected<string>[];`, `value.length`, true},
		{`declare const value:{[key:string]:Protected<string>};`, `Object.keys(value).length`, true},
		{`type RecordValue={next?:RecordValue;credential:Protected<string>;label:string};declare const value:RecordValue;`, `value.label`, false},
		{`type RecordValue={next?:RecordValue;credential:Protected<string>;label:string};declare const value:RecordValue;`, `JSON.stringify(value)`, true},
		{`declare const value:{credential:Protected<string>;label:string};const {['label']:label}=value;`, `label`, false},
		{`declare const value:Map<string,string>;`, `value.size`, false},
		{`declare const value:{credential:Protected<string>;label:string};const {label='public'}=value;`, `label`, true},
		{`declare const value:{credential:Protected<string>;label:string};const {...copy}=value;`, `copy.label`, false},
	} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "type-policy.tsx", Target: TargetServer, Source: prefix + example.declarations + `export function Page(){return()=> <p>{` + example.expression + `}</p>;}`})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		if hasDiagnosticCode(r.Diagnostics, "EXACT3020") != example.denied {
			t.Fatalf("%s: %#v", example.expression, r.Diagnostics)
		}
	}
}

// Scope inference must respect native context lifetime while ordinary lookalikes stay portable.
func TestPolicySubsystemContextSources(t *testing.T) {
	for _, options := range []string{`{scope:'request'}`, `{scope:'application'}`, `{scope:'component'}`, `{}`, `{keep:'server'}`, `{"scope":'request'}`, `{label:"scope:'request'"}`} {
		for _, native := range []bool{true, false} {
			declaration := `import{createContext}from '@exactjs/core';`
			if !native {
				declaration = `function createContext(name:string,options:unknown){return {name};}`
			}
			source := declaration + `const Token=createContext('token',` + options + `);export function Page(this:{getContext(token:unknown):string}){const label=this.getContext(Token);return()=> <p>{label}</p>;}`
			r := NewSession().Execute(Request{Kind: "analyze", ID: "context-policy.tsx", Source: source})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if len(r.Analysis.Components) != 1 {
				t.Fatal(r.Analysis.Components)
			}
			server := native && (options != `{label:"scope:'request'"}` && (strings.Contains(options, "request") || strings.Contains(options, "application") || strings.Contains(options, "server")))
			if (r.Analysis.Components[0].Placement == "server") != server {
				t.Errorf("native=%t options=%s component=%#v", native, options, r.Analysis.Components[0])
			}
		}
	}
}

// Renamed and namespace factories retain residency through reusable native option objects.
func TestPolicySubsystemContextAliases(t *testing.T) {
	for _, factory := range []struct{ declaration, call string }{
		{`import{createContext as context}from '@exactjs/core';`, "context"},
		{`import * as core from '@exactjs/core';`, "core.createContext"},
		{`import * as core from '@exactjs/core';`, `core["createContext"]`},
		{`import{createContext}from '@exactjs/core';const context=createContext;`, "context"},
	} {
		for _, options := range []struct {
			setup, value string
			server       bool
		}{
			{"", `{scope:'request'}`, true},
			{`const options={scope:'request'} as const;`, "options", true},
			{`const options={scope:'request'};`, `{...options}`, true},
			{`const options={scope:'request'};`, `{...options,scope:'component'}`, false},
			{`const options={scope:'request'};`, `{...options,scope:'component',...options}`, true},
			{`const scope='request';`, `{scope}`, true},
			{"", `{['scope']:'request'}`, true},
			{"", `{scope:'request',keep:'shared'}`, false},
		} {
			source := factory.declaration + options.setup + `const Token=` + factory.call + `('token',` + options.value + `);export function Page(this:{getContext(token:unknown):string}){const label=this.getContext(Token);return()=> <p>{label}</p>;}`
			r := NewSession().Execute(Request{Kind: "compile", ID: "context-alias-policy.tsx", Source: source, Target: TargetServer})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if len(r.Diagnostics) != 0 || len(r.Analysis.Components) != 1 {
				t.Fatalf("unexpected diagnostics: %#v", r.Diagnostics)
			}
			if (r.Analysis.Components[0].Placement == "server") != options.server {
				t.Fatalf("%s %s incorrect residency", factory.call, options.value)
			}
		}
	}
}
