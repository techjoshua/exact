package exactcompiler

import (
	"strings"
	"testing"
)

// Secret-controlled returns qualify the result even when each returned literal is public.
func TestPolicySubsystemReturnControl(t *testing.T) {
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, body := range []string{`if(credential)return 'a';return 'b';`, `while(credential){return 'a';}return 'b';`, `do{return 'a';}while(credential);`, `for(;credential;){return 'a';}return 'b';`, `switch(credential){case 'x':return 'a';default:return 'b';}`, `if(credential)return;return 'b';`} {
			for _, form := range []struct{ declaration, expression string }{
				{`function label(){BODY}`, `label()`},
				{`const label=()=>{BODY};`, `label()`},
				{`const record={get label(){BODY}};`, `record.label`},
				{`class RecordValue{get label(){BODY}}const record=new RecordValue();`, `record.label`},
			} {
				source := `/** @exact keep=secret */ declare const credential:string;` + strings.ReplaceAll(form.declaration, "BODY", body) + `export function Page(){return()=> <p>{` + form.expression + `}</p>;}`
				r := NewSession().Execute(Request{Kind: "compile", ID: "return-control.tsx", Source: source, Target: target})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				if !hasDiagnosticCode(r.Diagnostics, "EXACT3020") || r.Code != "" {
					t.Errorf("%s %s %s leaked secret control: %#v", target, form.expression, body, r.Diagnostics)
				}
			}
		}
	}
}

// Unrelated nested helpers and public conditions do not qualify a caller's constant result.
func TestPolicySubsystemPublicReturnControls(t *testing.T) {
	for _, definition := range []string{`function label(){if(publicCondition)return 'a';return 'b';}`, `function label(){function nested(){if(credential)return 'a';return 'b';}return 'public';}`, `class RecordValue{get label(){if(publicCondition)return 'a';return 'b';}}const record=new RecordValue();function label(){return record.label;}`} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "return-public.tsx", Target: TargetServer, Source: `/** @exact keep=secret */ declare const credential:string;declare const publicCondition:boolean;` + definition + `export function Page(){return()=> <p>{label()}</p>;}`})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		if len(r.Diagnostics) != 0 || r.Code == "" {
			t.Fatalf("public result rejected: %#v", r.Diagnostics)
		}
	}
}
