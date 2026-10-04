package exactcompiler

import "testing"

// Nested qualifications preserve valid helper declarations without authorizing client disclosure.
func TestNestedSecretQualificationContracts(t *testing.T) {
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, result := range []string{`{get value(){return credential;}}`, `{get value(){return ()=>credential;}}`, `{value:credential}`} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "nested-secret.tsx", Target: target, Source: `/** @exact keep=secret */ declare const credential:string;function read(){return ` + result + `;}export function Page(){return()=> <p>public</p>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" {
					t.Fatalf("valid unused helper rejected: %#v", response.Diagnostics)
				}
			}
			if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
				t.Fatalf("unused helper changed component ownership: %#v", response.Analysis.Components)
			}
		}
	}
}
