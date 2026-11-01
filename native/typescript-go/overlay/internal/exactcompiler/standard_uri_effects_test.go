package exactcompiler

import "testing"

func TestPortableURIGlobalEffects(t *testing.T) {
	for _, name := range []string{"decodeURI", "decodeURIComponent", "encodeURI", "encodeURIComponent", "isFinite", "isNaN"} {
		t.Run(name, func(t *testing.T) {
			source := `export function Page(){const value=` + name + `(`
			if name == "isFinite" || name == "isNaN" {
				source += `42`
			} else {
				source += `"value"`
			}
			source += `);return()=> <p>{String(value)}</p>;}`
			response := NewSession().Execute(Request{ID: "portable-uri.tsx", Kind: "analyze", Source: source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].EnvironmentEffect != "neutral" {
				t.Fatalf("portable standard function lost ownership: %#v", response.Analysis.Components)
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				compiled := NewSession().Execute(Request{ID: "portable-uri.tsx", Kind: "compile", Target: target, Source: source})
				if compiled.Error != "" || compiled.Code == "" {
					t.Fatalf("%s: %s", target, compiled.Error)
				}
			}
		})
	}
	source := `function decodeURIComponent(value:string){return window.location.href;}export function Page(){const value=decodeURIComponent("value");return()=> <p>{value}</p>;}`
	response := NewSession().Execute(Request{ID: "shadowed-uri.tsx", Kind: "analyze", Source: source})
	if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "client" {
		t.Fatalf("local shadow gained standard library authority: %#v", response)
	}
}
