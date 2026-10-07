package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Installed ownership is proved by the package's exact protocol, subpath and export facts.
func TestInstalledComponentBuildFactBoundaries(t *testing.T) {
	for _, scenario := range []struct {
		name, module, build string
		native              bool
	}{
		{"root", "@fixture/native", `{"protocol":2,"package":{"name":"@fixture/native"},"exports":[{"subpath":".","exportName":"Native"}]}`, true},
		{"subpath", "@fixture/native/view", `{"protocol":2,"package":{"name":"@fixture/native"},"exports":[{"subpath":"./view","exportName":"Native"}]}`, true},
		{"missing", "@fixture/native", "", false},
		{"malformed", "@fixture/native", "{", false},
		{"protocol", "@fixture/native", `{"protocol":1,"package":{"name":"@fixture/native"},"exports":[{"subpath":".","exportName":"Native"}]}`, false},
		{"package", "@fixture/native", `{"protocol":2,"package":{"name":"@fixture/other"},"exports":[{"subpath":".","exportName":"Native"}]}`, false},
		{"export", "@fixture/native", `{"protocol":2,"package":{"name":"@fixture/native"},"exports":[{"subpath":".","exportName":"Other"}]}`, false},
		{"subpath-mismatch", "@fixture/native/view", `{"protocol":2,"package":{"name":"@fixture/native"},"exports":[{"subpath":".","exportName":"Native"}]}`, false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(scenario.name+"/"+string(target), func(t *testing.T) {
				root := t.TempDir()
				dependency := filepath.Join(root, "node_modules", "@fixture", "native")
				if err := os.MkdirAll(dependency, 0o755); err != nil {
					t.Fatal(err)
				}
				write := func(name, source string) {
					t.Helper()
					if err := os.WriteFile(filepath.Join(dependency, name), []byte(source), 0o600); err != nil {
						t.Fatal(err)
					}
				}
				write("package.json", `{"name":"@fixture/native","types":"./index.d.ts","exports":{".":{"types":"./index.d.ts"},"./view":{"types":"./index.d.ts"}},"exactComponentLibrary":{"protocol":2,"build":"./build.json"}}`)
				write("index.d.ts", `export declare function Native(props:{label:string}):unknown;`)
				if scenario.build != "" {
					write("build.json", scenario.build)
				}
				response := NewSession().Execute(Request{
					Kind: "compile", ID: filepath.Join(root, "entry.tsx"), Root: root, Target: target,
					Source:     `import{Native}from'` + scenario.module + `';export function Parent(){return()=> <main><Native label="one"/><Native label="two"/></main>}`,
					JSXInterop: &JSXInterop{AdapterModule: "@exactjs/react-compat", AdapterExport: "adaptReactComponent"},
				})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("package boundary compile failed: %s %#v", response.Error, response.Diagnostics)
				}
				if target == TargetClient {
					if strings.Contains(response.Code, `{ component: Native`) == scenario.native {
						t.Fatalf("package ownership proof selected wrong renderer: %s", response.Code)
					}
					if scenario.native && !strings.Contains(response.Code, `__exactComponentReceipt(Native,`) {
						t.Fatalf("native package export lost receipt ownership: %s", response.Code)
					}
				} else {
					if strings.Contains(response.Code, `__exactSsr.reference(Native,`) != scenario.native {
						t.Fatalf("package ownership proof selected wrong server renderer: %s", response.Code)
					}
					if !scenario.native && !strings.Contains(response.Code, `kind: "client-island"`) {
						t.Fatalf("foreign package export lost compatibility boundary: %s", response.Code)
					}
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement == "unknown" {
					t.Fatalf("package fixture has unproven placement: %#v", response.Analysis.Components)
				}
			})
		}
	}
}
