package exactcompiler

import (
	"strings"
	"testing"
)

// Provider identity and selector metadata survive server consumption without entering client artifacts.
func TestPolicySubsystemProviderConsumption(t *testing.T) {
	for _, example := range []struct {
		imports, definition string
		selector            string
	}{
		{`import{secret,consume}from '@exactjs/secrets';`, `const value=secret('TOKEN','configured');`, "TOKEN"},
		{`import{secret as load,consume as authorize}from '@exactjs/secrets';`, `const value=load('TOKEN','configured');`, "TOKEN"},
		{`import * as secrets from '@exactjs/secrets';`, `const value=secrets.secret('TOKEN','configured');`, "TOKEN"},
		{`import * as secrets from '@exactjs/secrets';`, `const value=secrets.require('TOKEN');`, "TOKEN"},
		{`import * as secrets from '@exactjs/secrets';`, `const value=secrets.optional('TOKEN');`, "TOKEN"},
		{`import{secret,consume}from '@exactjs/secrets';`, `declare const key:string;const value=secret(key,'configured');`, ""},
		{`import{secret,consume}from '@exactjs/secrets';`, `declare const choose:boolean;const a=secret('A','configured'),b=secret('B','configured');const value=choose?a:b;`, ""},
	} {
		consume := "consume"
		if strings.Contains(example.imports, "as authorize") {
			consume = "authorize"
		}
		if strings.Contains(example.imports, "* as secrets") {
			consume = "secrets.consume"
		}
		for _, target := range []Target{TargetDefault, TargetServer, TargetClient} {
			for _, packageType := range []string{"application", "library"} {
				r := NewSession().Execute(Request{Kind: "compile", ID: "provider-policy.ts", Target: target, PackageType: packageType, PackageName: "test-policy", Source: example.imports + example.definition + `export const result=` + consume + `(value);`})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				if hasDiagnosticCode(r.Diagnostics, "EXACT3004") != (target == TargetClient) {
					t.Fatalf("target=%s imports=%s diagnostics=%#v", target, example.imports, r.Diagnostics)
				}
				if len(r.Analysis.Policy.SecretConsumers) != 1 {
					t.Fatalf("missing consumer: %#v", r.Analysis.Policy)
				}
				consumer := r.Analysis.Policy.SecretConsumers[0]
				if consumer.Selector != example.selector || consumer.Dynamic != (example.selector == "") || consumer.Consumer.Package != "test-policy" {
					t.Fatalf("incorrect consumer metadata: %#v", consumer)
				}
				if target == TargetClient && r.Code != "" {
					t.Fatal("client consumption emitted code")
				}
			}
		}
	}
}

// Repeated secret qualifications preserve nested values and avoid authored alias collisions.
func TestPolicySubsystemQualificationEmission(t *testing.T) {
	source := `declare function load():string;const __ExactSecret=1,__ExactSecret2=2;
/** @exact keep=secret */ const token=load();
/** @exact keep=secret */ function read(){function nested(){return 'public';}if(__ExactSecret)return token;return load();}
/** @exact keep=secret */ function empty(){return;}
export const result={token};`
	r := NewSession().Execute(Request{Kind: "compile", ID: "qualification-policy.ts", Target: TargetServer, Source: source})
	if r.Error != "" {
		t.Fatal(r.Error)
	}
	if len(r.Diagnostics) != 0 {
		t.Fatal(r.Diagnostics)
	}
	if !strings.Contains(r.Code, "Secret as __ExactSecret3") || !strings.Contains(r.Code, "as __ExactSecret3<string>") {
		t.Fatalf("qualification lost: %s", r.Code)
	}
}

// Placement diagnostics explain mixed and opaque dependencies without granting purity authority.
func TestPolicySubsystemPlacementDiagnostics(t *testing.T) {
	for _, source := range []string{
		`import{TaskContext}from '@exactjs/core';export function Page(){const run=(_task:TaskContext=TaskContext.server())=>document.title;return()=> <button onClick={()=>run()}>Go</button>;}`,
		`import{TaskContext}from '@exactjs/core';import{readFileSync}from 'node:fs';export function Page(){const run=(_task:TaskContext=TaskContext.client())=>{readFileSync('file');document.title='x';};return()=> <button onClick={()=>run()}>Go</button>;}`,
	} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "placement-policy.tsx", Target: TargetServer, Source: source})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		if len(r.Diagnostics) == 0 || r.Code != "" {
			t.Fatalf("invalid placement emitted for %s: %#v", source, r.Diagnostics)
		}
	}
}
