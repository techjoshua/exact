package exactcompiler

import (
	"testing"
)

func TestNullishFormalDefaultBrowserEffect(t *testing.T) {
	const definitions = `const read=(input:{value:number|null|undefined},x:number=input.value??7)=>x;const input={get value(){return window.innerWidth}};`
	for _, args := range []string{"input", "input,5"} {
		t.Run(args, func(t *testing.T) {
			use := "read(" + args + ")"
			wantBrowser := args == "input"
			checkFormalGetterComponent(t, definitions, use, wantBrowser)

			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/nullish-browser.ts", Source: "export {};" + definitions + use + ";", Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			want, gets := 5, 0
			if wantBrowser {
				want, gets = 42, 1
			}
			conditionalNodeCompletion(t, r.Code, want, gets)
		})
	}
}
