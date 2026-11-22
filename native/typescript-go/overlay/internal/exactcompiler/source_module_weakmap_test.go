package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestModuleWeakMapArtifactPlacement(t *testing.T) {
	root, config := formsSourceFixture(t)
	entry := filepath.Join(root, "WeakMap.tsx")
	for _, fixture := range []struct {
		name, setup, method, placement string
	}{
		{"portable", `map.set(key, 'ready');`, "map", "isomorphic"},
		{"browser value", `map.set(key, document.title);`, "map", "client"},
		{"browser key", `map.set(document.title ? key : key, 'ready');`, "map", "client"},
		{"own replacement", `map.set = function (_key:object, _value:string) {return this}; map.set(key, 'ready');`, "map", "isomorphic"},
		{"authored browser effects", `map.set = function (_key:object, _value:string) {document.title; return this}; map.set(key, 'ready');`, "map", "client"},
		{"unresolved alternative", `declare const choose:boolean; declare const foreign:typeof map.set; if(choose) map.set = foreign; map.set(key, 'ready');`, "map", ""},
		{"escaped receiver", `const alias=map; map.set(key, document.title);`, "alias", ""},
		{"returned receiver", `const alias=map.set(key, document.title);`, "alias", ""},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			source := `import type {Component} from '@exactjs/core';
const map = new WeakMap<object,string>(); const key = {};` + fixture.setup + `
export function Page(this:Component<{}>){return()=> <p>{` + fixture.method + `.get(key) ?? 'missing'}:{` + fixture.method + `.get({}) ?? 'miss'}</p>}`
			if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
			for _, target := range []Target{TargetServer, TargetClient} {
				var prior Response
				for _, packageType := range []string{"application", "library"} {
					result := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: target, Source: source, ConfigFile: config, Diagnostics: "semantic", PackageType: packageType, SourceMap: true})
					if fixture.placement == "" {
						// A browser-only write is unsafe only on the opposite target.
						if target == TargetServer || fixture.name == "unresolved alternative" {
							if result.Error != "" || !containsDiagnosticCode(result.Diagnostics, "EXACT2101") || result.Code != "" || result.SourceMap != nil {
								t.Fatalf("%s %s accepted an unsupported write: %s %v", packageType, target, result.Error, formsDiagnosticDetails(result.Diagnostics))
							}
						}
						continue
					}
					if result.Error != "" || result.Code == "" || hasErrorDiagnostic(result.Diagnostics) || len(result.Analysis.Components) != 1 || result.Analysis.Components[0].Placement != fixture.placement {
						t.Fatalf("%s %s: expected %s placement, got %v: %s %v", packageType, target, fixture.placement, result.Analysis.Components, result.Error, formsDiagnosticDetails(result.Diagnostics))
					}
					emitsRead := strings.Contains(result.Code, "map.get(key)")
					if emitsRead != (target == TargetClient || fixture.placement == "isomorphic") {
						t.Fatalf("%s %s has incorrect read placement: %s", packageType, target, result.Code)
					}
					if prior.Code != "" && result.Code != prior.Code {
						t.Fatalf("%s implementation differs between application and library", target)
					}
					prior = result
				}
			}
		})
	}
}
