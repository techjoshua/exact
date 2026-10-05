package exactcompiler

import "testing"

// A purity proof authorizes reevaluation, never secret output. Callable aliases retain both facts.
func TestPolicyCallableAliasRetainsSecretReturn(t *testing.T) {
	for _, setup := range []string{
		`/** @exact pure */ const read=()=>kept+props.suffix;const alias=read;`,
		`/** @exact pure */ const read=()=>kept+props.suffix;const first=read;const alias=first;`,
		`/** @exact pure */ const read=()=>kept+props.suffix;const alias=(read satisfies ()=>string);`,
		`const table={read:()=>kept+props.suffix};const alias=table.read;`,
		`const table={read:()=>kept+props.suffix};const alias=table['read'];`,
		`const read=()=>kept+props.suffix;const table={read};const alias=table.read;`,
		`const read=()=>kept+props.suffix;const table={read:read};const alias=table.read;`,
		`const read=()=>kept+props.suffix;const table={read};const alias=()=>table.read();`,
		`const read=()=>kept+props.suffix;const table={read};const alias=()=>table['read']();`,
	} {
		for _, secret := range []bool{false, true} {
			annotation := ""
			if secret {
				annotation = "/** @exact keep=secret */"
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", ID: "page.tsx", Target: target, Source: annotation + `declare const kept:string;export function Page(props:{suffix:string}){` + setup + `const value=alias();return()=> <p>{value}</p>;}`})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				if containsDiagnosticCode(r.Diagnostics, "EXACT3020") != secret || (!secret && len(r.Diagnostics) != 0) {
					t.Fatalf("policy lost through %s secret=%v target=%s: %#v", setup, secret, target, r.Diagnostics)
				}
			}
		}
	}
}
