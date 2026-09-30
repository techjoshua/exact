package exactcompiler

import "testing"

func TestDerivedPurityRejectsBorrowedMutationAndImpostorMethods(t *testing.T) {
	for _, body := range []string{
		`return [value].map(v => { const alias = shared; alias.value = v; return v; }).join("");`,
		`return fake.trim() + value;`,
		`counter++; return value + "@exact pure";`,
		`/* @exact pure */ counter++; return value;`,
		`return [shared].map(alias => { alias.value = value; return value; }).join("");`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{ID: "purity.tsx", Kind: "compile", Target: target, Source: `
let counter = 0;
const shared = {value: ""};
class ImpostorString { trim() { counter++; return "changed"; } }
const fake = new ImpostorString();
function helper(value: string) { ` + body + ` }
export function Probe(props: {value:string}) {
 const label = helper(props.value);
 return () => <p>{label}</p>;
}`})
			found := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "EXACT2202" {
					found = true
				}
			}
			if !found {
				t.Fatalf("unsafe derived helper accepted (%s): %s\n%#v", target, body, response)
			}
		}
	}
}
