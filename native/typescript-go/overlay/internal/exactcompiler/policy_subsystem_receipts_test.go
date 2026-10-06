package exactcompiler

import "testing"

// Assignment defaults must retain secrecy even when their source container is public.
func TestPolicySubsystemAssignmentDefaults(t *testing.T) {
	prefix := `declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};declare const credential:Protected<string>;`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, example := range []struct {
			body   string
			denied bool
		}{
			{`let value='';[value=credential]=[];`, true},
			{`let value='';({value=credential}={});`, true},
			{`let value='';({entry:value=credential}={});`, true},
			{`let value='';({entry:[value=credential]}={entry:[]});`, true},
			{`let value='';[value='public']=[];`, false},
			{`let value:Protected<string>=credential;[value=credential]=[];`, false},
			{`let value:Protected<string>=credential;({value=credential}={});`, false},
			{`let value='';[(value)=credential]=[];`, true},
			{`let value='';({[credential]:value}={public:'ok'});`, true},
			{`for(const {[credential]:value} of [{public:'ok'}]){void value;}`, true},
			{`const helper=({value=credential}:{value?:string})=>void value;`, true},
			{`const {[credential]:value}:{[key:string]:string}={public:'ok'};`, true},
			{`let value='';({entry:{value=credential}}={entry:{}});`, true},
			{`const {value=credential}:{value?:string}={};`, true},
			{`const helper=({value=credential}:{value?:string}={})=>void value;`, true},
			{`const helper=({value=credential}:{value?:Protected<string>}={})=>void value;`, false},
		} {
			t.Run(string(target)+"/"+example.body, func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "analyze", ID: "policy-defaults.tsx", Target: target, Source: prefix + `function work(){` + example.body + `}export function Page(){return()=> <p>Public</p>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if hasDiagnosticCode(response.Diagnostics, "EXACT3003") != example.denied {
					t.Fatalf("incorrect assignment receipt: %#v", response.Diagnostics)
				}
			})
		}
	}
}

// Computed native forwarders use the same declared authority as dotted invocation.
func TestPolicySubsystemComputedForwarders(t *testing.T) {
	prefix := `declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};declare const credential:Protected<string>;`
	for _, member := range []string{"call", "apply", "bind"} {
		for _, qualified := range []bool{false, true} {
			parameter := "T"
			if qualified {
				parameter = "Protected<T>"
			}
			argument := "credential"
			if member == "apply" {
				argument = "[credential]"
			}
			for _, accessor := range []string{"." + member, `["` + member + `"]`} {
				source := prefix + `declare function helper<T>(value:` + parameter + `):void;function work(){helper` + accessor + `(null,` + argument + `);}export function Page(){return()=> <p>Public</p>;}`
				response := NewSession().Execute(Request{Kind: "analyze", ID: "policy-forward.tsx", Target: TargetServer, Source: source})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if hasDiagnosticCode(response.Diagnostics, "EXACT3003") == qualified {
					t.Errorf("member=%s qualified=%t diagnostics=%#v", accessor, qualified, response.Diagnostics)
				}
			}
		}
	}
}
