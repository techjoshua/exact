package exactcompiler

import (
	"testing"
)

func TestNullishFormalDefaultBrowserEffect(t *testing.T) {
	for _, args := range []string{"input", "input,5"} {
		source := `export {};const read=(input:{value:number|null|undefined},x:number=input.value??7)=>x;const input={get value(){return window.innerWidth}};read(` + args + `);`
		s := NewSession()
		r := s.Execute(Request{Kind: "compile", ID: "/virtual/nullish-browser.ts", Source: source, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
		browser := false
		for _, f := range r.Analysis.Callables {
			for _, e := range f.EffectSources {
				browser = browser || e.Environment == "browser"
			}
		}
		if !browser {
			t.Fatal("known browser effect lost")
		}
		for _, project := range s.projects {
			if project.callableCache == nil {
				continue
			}
			for _, fact := range project.callableCache.merged.facts {
				for _, call := range fact.fieldCalls {
					for _, o := range call.outcomes {
						if o.fulfilled {
							t.Fatal("getter received DATA coverage")
						}
					}
				}
			}
		}
		want, gets := 42, 1
		if args == "input,5" {
			want, gets = 5, 0
		}
		conditionalNodeCompletion(t, r.Code, want, gets)
	}
}
