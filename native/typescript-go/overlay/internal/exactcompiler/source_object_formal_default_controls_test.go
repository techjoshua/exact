package exactcompiler

import (
	"testing"
)

func TestObjectFormalDefaultBrowserGetter(t *testing.T) {
	for _, args := range []string{`input`, `input,5`, `input,undefined`} {
		t.Run(args, func(t *testing.T) {
			source := `export {};const read=(input:{value:number},x:number=input.value)=>x;const input={get value(){return window.innerWidth}};read(` + args + `);`
			session := NewSession()
			r := session.Execute(Request{Kind: "compile", ID: "/virtual/object-default-browser.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			browser := false
			for _, fact := range r.Analysis.Callables {
				for _, effect := range fact.EffectSources {
					browser = browser || effect.Environment == "browser"
				}
			}
			if !browser {
				t.Fatal("independent browser getter effect erased")
			}
			for _, project := range session.projects {
				if project.callableCache == nil {
					continue
				}
				for _, fact := range project.callableCache.merged.facts {
					for _, call := range fact.fieldCalls {
						for _, out := range call.outcomes {
							// Dependency fulfillment accounts effects and supplies no normal DATA.
							if out.fulfilled && !call.dependencies {
								t.Fatal("accessor granted normal DATA coverage")
							}
						}
					}
				}
			}
			want, gets := 42, 1
			if args == `input,5` {
				want, gets = 5, 0
			}
			conditionalNodeCompletion(t, r.Code, want, gets)
		})
	}
}
