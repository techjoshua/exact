package exactcompiler

import (
	"strings"
	"testing"
)

// An imported callable's captured initialization must remain available wherever
// its caller survives projection. Selected source is independent of authored types.
func TestSelectedModuleCapturedInitialization(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			eager, body := `document.title`, `process.version`
			if target == TargetClient {
				eager, body = body, eager
			}
			f := newExecutableFixture(t, map[string]string{
				"entry.ts":    `import {read} from './helper.js';export const value=read();`,
				"helper.d.ts": `export declare function read():string;`,
				"helper.js":   `const eager=` + eager + `;export function read(){return ` + body + `+eager;}`,
			})
			if r := f.synchronizeTarget([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}, target); r.Error != "" {
				t.Fatal(r.Error)
			}
			request := f.request("compile", "entry.ts")
			request.Target = target
			r := f.session.Execute(request)
			for _, d := range r.Diagnostics {
				if strings.HasPrefix(d.Code, "TS") {
					t.Fatalf("invalid fixture: %#v", r.Diagnostics)
				}
			}
			found := false
			for _, d := range r.Diagnostics {
				found = found || d.Code == "EXACT2101"
			}
			if !found || r.Code != "" {
				t.Fatalf("retained caller lost selected initialization: diagnostics=%#v code=%s", r.Diagnostics, r.Code)
			}
		})
	}
}

// Dependency routes share captured-definition requirements, while independent
// declarations remain eligible for their ordinary per-target projection.
func TestSelectedModulePartitionControls(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		local, opposite := `document.title`, `process.version`
		if target == TargetServer {
			local, opposite = opposite, local
		}
		for _, test := range []struct {
			name, entry, helper string
			extra               map[string]string
			edges               []ExecutableEdge
			reject              bool
		}{
			{name: "dormant opposite function", entry: `import {read} from './helper.js';export const value=read();`, helper: `export function dormant(){return ` + opposite + `;}export function read(){return "safe";}`},
			{name: "legal target capture", entry: `import {read} from './helper.js';export const value=read();`, helper: `const eager=` + local + `;export function read(){return eager;}`},
			{name: "independent declaration projection", entry: `import {read} from './helper.js';export const value=read();`, helper: `export const unused=` + opposite + `;export function read(){return "safe";}`},
			{name: "unknown beside known", entry: `import {read} from './helper.js';declare const foreign:()=>string;export const value=read()+foreign();`, helper: `const eager=` + opposite + `;export function read(){return ` + local + `+eager;}`, reject: true},
			{name: "side effect import remains opaque", entry: `import './helper.js';export const value=1;`, helper: `globalThis.foreign();`},
			{name: "side effect beside retained export", entry: `import './helper.js';import {read} from './helper.js';export const value=read();`, helper: `const eager=` + opposite + `;export function read(){return ` + local + `+eager;}`, edges: []ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}, {"entry.ts", 1, "./helper.js", "import", "helper.js"}}, reject: true},
			{name: "reexport route", entry: `import {read} from './barrel.js';export const value=read();`, helper: `const eager=` + opposite + `;export function read(){return ` + local + `+eager;}`, extra: map[string]string{"barrel.d.ts": `export {read} from './helper.js';`, "barrel.js": `export {read} from './helper.js';`}, edges: []ExecutableEdge{{"entry.ts", 0, "./barrel.js", "import", "barrel.js"}, {"barrel.js", 0, "./helper.js", "import", "helper.js"}}, reject: true},
			{name: "eager dependency", entry: `import {read} from './helper.js';export const value=read();`, helper: `import {eager} from './dependency.js';export function read(){return ` + local + `+eager;}`, extra: map[string]string{"dependency.d.ts": `export declare const eager:string;`, "dependency.js": `export const eager=` + opposite + `;`}, edges: []ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}, {"helper.js", 0, "./dependency.js", "import", "dependency.js"}}, reject: true},
		} {
			t.Run(string(target)+"/"+test.name, func(t *testing.T) {
				// Authored signatures and selected JavaScript remain independent inputs.
				files := map[string]string{"entry.ts": test.entry, "helper.d.ts": `export declare function read():string;`, "helper.js": test.helper}
				for name, source := range test.extra {
					files[name] = source
				}
				f := newExecutableFixture(t, files)
				edges := test.edges
				if edges == nil {
					edges = []ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}
				}
				if r := f.synchronizeTarget(edges, target); r.Error != "" {
					t.Fatal(r.Error)
				}
				request := f.request("compile", "entry.ts")
				request.Target = target
				r := f.session.Execute(request)
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				for _, d := range r.Diagnostics {
					if strings.HasPrefix(d.Code, "TS") {
						t.Fatalf("invalid fixture: %#v", r.Diagnostics)
					}
				}
				if containsDiagnosticCode(r.Diagnostics, "EXACT2101") != test.reject {
					t.Fatalf("projection result: %#v\n%s", r.Diagnostics, r.Code)
				}
				if test.name == "side effect import remains opaque" {
					unknown := false
					for _, summary := range r.Analysis.Callables {
						unknown = unknown || summary.Kind == "module-initializer" && summary.Effect == "unknown"
					}
					if !unknown {
						t.Fatal("selected side-effect import acquired a false purity guarantee")
					}
				}
				if test.reject && r.Code != "" {
					t.Fatal("invalid target emitted code")
				}
				if !test.reject && !strings.Contains(r.Code, "value") {
					t.Fatalf("legal entry lost: %s", r.Code)
				}
			})
		}
	}
}
