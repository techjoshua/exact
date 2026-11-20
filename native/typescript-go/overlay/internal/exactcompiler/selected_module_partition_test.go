package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
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

// Declaration-list formatting cannot join independent target projections into
// an indivisible initializer. A single expression requiring both still conflicts.
func TestSelectedModuleDeclaratorBoundaries(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, test := range []struct {
			name, declarations string
			reject             bool
		}{
			{"separate", `export const client=browserValue;export const server=serverValue;`, false},
			{"same statement", `export const client=browserValue, server=serverValue;`, false},
			{"uninitialized sibling", `let untouched:number,client=browserValue;export {client};`, false},
			{"direct same statement", `export const client=document.title, server=process.version;`, target == TargetClient},
			{"direct separate statements", `export const client=document.title;export const server=process.version;`, target == TargetClient},
			{"dormant captured declarator", `export const client=()=>browserValue, server=()=>serverValue;`, false},
			{"indivisible", `export const client=browserValue+serverValue;`, true},
			{"indivisible sibling", `export const stable=1, client=browserValue+serverValue;`, true},
			{"dependent siblings", `export const client=browserValue,server=client+serverValue;`, true},
			{"destructuring sibling", `export const stable=1,[client,server]=[browserValue,serverValue];`, true},
			{"invoked callable sibling", `export const stable=1, invoke=()=>browserValue+serverValue;export const client=invoke();`, true},
			{"opaque callable sibling", `declare const foreign:()=>string;export const stable=0,invoke=foreign;export const client=invoke();`, true},
			{"dormant capture", `export function dormant(){return serverValue;}export const client=browserValue;`, false},
			{"invoked capture", `function invoke(){return serverValue+browserValue;}export const client=invoke();`, true},
		} {
			t.Run(string(target)+"/"+test.name, func(t *testing.T) {
				f := newExecutableFixture(t, map[string]string{"entry.ts": `import {browserValue,serverValue} from './helper.js';` + test.declarations, "helper.d.ts": `export declare const browserValue:string,serverValue:string;`, "helper.js": `export const browserValue=document.title;export const serverValue=process.version;`})
				if test.name == "direct same statement" || test.name == "direct separate statements" {
					config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"allowJs":true,"types":["node"]},"files":["entry.ts"]}`
					if err := os.WriteFile(filepath.Join(f.root, "tsconfig.json"), []byte(config), 0600); err != nil {
						t.Fatal(err)
					}
				}
				if r := f.synchronizeTarget([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}, target); r.Error != "" {
					t.Fatal(r.Error)
				}
				req := f.request("compile", "entry.ts")
				req.Target = target
				r := f.session.Execute(req)
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				for _, d := range r.Diagnostics {
					if strings.HasPrefix(d.Code, "TS") {
						t.Fatalf("invalid fixture: %#v", r.Diagnostics)
					}
				}
				if containsDiagnosticCode(r.Diagnostics, "EXACT2101") != test.reject {
					t.Fatalf("declarator boundary: %#v\n%s", r.Diagnostics, r.Code)
				}
				if !test.reject && (test.name == "same statement" || test.name == "separate" || test.name == "direct same statement" || test.name == "dormant captured declarator") {
					retained, removed := "client =", "server ="
					if target == TargetServer {
						retained, removed = removed, retained
					}
					if !strings.Contains(r.Code, retained) || strings.Contains(r.Code, removed) {
						t.Fatalf("wrong projection: %s", r.Code)
					}
				}
			})
		}
	}
}

// Coordinated components retain their server task and browser interaction parts
// while the surrounding module declarations project independently.
func TestSelectedModuleCoordinatedDeclarators(t *testing.T) {
	const source = `import {TaskContext,type Component} from '@exactjs/core';import {browserValue,serverValue} from './helper.js';export const client=browserValue,server=serverValue;export function View(this:Component<{value:string}>){this.state.value='ready';async function load(task:TaskContext=TaskContext.server()){return server;}return()=> <button onClick={async()=>{this.state.value=client+await load();}}>{this.state.value}</button>;}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			f := newExecutableFixture(t, map[string]string{"entry.ts": `export {};`, "view.tsx": source, "helper.d.ts": `export declare const browserValue:string,serverValue:string;`, "helper.js": `export const browserValue=document.title;export const serverValue=process.version;`})
			edges := []ExecutableEdge{{"view.tsx", 0, "@exactjs/core", "import", ""}, {"view.tsx", 1, "./helper.js", "import", "helper.js"}}
			if r := f.synchronizeTarget(edges, target); r.Error != "" {
				t.Fatal(r.Error)
			}
			req := f.request("compile", "view.tsx")
			req.Target = target
			req.ServerComponents = true
			r := f.session.Execute(req)
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatalf("coordinated component rejected: %s %#v", r.Error, r.Diagnostics)
			}
			component := findComponent(t, r.Analysis.Components, "View")
			if component.Placement != "isomorphic" || len(component.ArtifactTargets) != 2 {
				t.Fatalf("lost component coordination: %#v", component)
			}
			found := false
			for _, task := range r.Analysis.Tasks {
				found = found || task.RequestedPlacement == "server" && task.Placement == "server"
			}
			if !found || r.Code == "" {
				t.Fatalf("missing emitted task/component: %#v", r.Analysis.Tasks)
			}
			// Host ownership of ordinary modules cannot redefine a component contract.
			req.PreserveOrdinaryModules = true
			application := f.session.Execute(req)
			if application.Error != "" || hasErrorDiagnostic(application.Diagnostics) {
				t.Fatalf("application component rejected: %s %#v", application.Error, application.Diagnostics)
			}
			if !reflect.DeepEqual(r.Analysis.Components, application.Analysis.Components) || !reflect.DeepEqual(r.Analysis.Tasks, application.Analysis.Tasks) {
				t.Fatal("host module ownership changed component definition")
			}
		})
	}
}

// Repeated var bindings still own distinct initializer positions. Removing the
// opposite initializer must not remove the retained declaration with that name.
func TestSelectedModuleRepeatedDeclarators(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			f := newExecutableFixture(t, map[string]string{"entry.ts": `var value=document.title,value=process.version;export {value};`})
			config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"types":["node"]},"files":["entry.ts"]}`
			if err := os.WriteFile(filepath.Join(f.root, "tsconfig.json"), []byte(config), 0600); err != nil {
				t.Fatal(err)
			}
			if r := f.synchronizeTarget(nil, target); r.Error != "" {
				t.Fatal(r.Error)
			}
			req := f.request("compile", "entry.ts")
			req.Target = target
			req.PreserveOrdinaryModules = true
			r := f.session.Execute(req)
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatalf("invalid repeated binding: %s %#v", r.Error, r.Diagnostics)
			}
			want, absent := "document.title", "process.version"
			if target == TargetServer {
				want, absent = absent, want
			}
			if !strings.Contains(r.Code, "value =") || !strings.Contains(r.Code, want) || strings.Contains(r.Code, absent) {
				t.Fatalf("initializer identity lost: %s", r.Code)
			}
		})
	}
}

// A shared initializer can map a fresh entries array without leaving an opaque
// indexed read. The original enumeration and callback still determine placement.
func TestEntriesMapModulePlacement(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		for _, test := range []struct {
			name, input, entries string
			browser, reject      bool
		}{
			{"direct", `{ a: 'safe' }`, "", false, false},
			{"map identity", `{ a: 'safe' }`, `.map(pair => pair)`, false, false},
			{"map fresh entry", `{ a: 'safe' }`, `.map(([id, value]) => [id, value])`, false, false},
			{"map literal key", `{ a: 'safe' }`, `.map(() => ['key', { get data() { return document.title; } }])`, false, false},
			{"map authored effects", `{ a: 'safe' }`, `.map(([id, value]) => [id, (document.title, process.version, value)])`, false, true},
			{"open input", `foreignEntriesInput`, `.map(pair => pair)`, false, true},
			{"mixed getters", `{ get a() { return document.title; }, get b() { return process.version; } }`, `.map(pair => pair)`, false, true},
			{"eager getter", `{ get a() { return document.title; } }`, `.map(pair => pair)`, true, false},
			{"deferred getter in callback result", `{ a: 'safe' }`, `.map(() => ({get 0() { return document.title; }, 1: 'safe'}) as unknown as [string, string])`, false, true},
			{"map fresh entry after edits", `{ a: 'safe' }`, `.map(([id, value]) => [id, value])`, false, false},
			{"map identity after edits", `{ a: 'safe' }`, `.map(pair => pair)`, false, false},
		} {
			t.Run(string(target)+"/"+test.name, func(t *testing.T) {
				source := `declare const foreignEntriesInput: Record<string, string>; const input = ` + test.input + `; export const observation = Object.fromEntries(Object.entries(input)` + test.entries + `);`
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/entries-map.ts", Source: source, Target: target, Diagnostics: "semantic"})
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity == "error" && strings.HasPrefix(diagnostic.Code, "TS") {
						t.Fatalf("invalid source: %#v", response.Diagnostics)
					}
				}
				if test.reject {
					if response.Error != "" || !containsDiagnosticCode(response.Diagnostics, "EXACT2101") {
						t.Fatal("expected placement diagnostic", response.Error, response.Diagnostics)
					}
					return
				}
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatal(response.Error, response.Diagnostics)
				}
				if retained := strings.Contains(response.Code, "const observation"); retained != (!test.browser || target == TargetClient) {
					t.Fatalf("incorrect initializer projection: %s", response.Code)
				}
			})
		}
	}
}

func TestEntriesMapExplicitReplacement(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, member := range []string{"Object.entries", "Object['entries']"} {
			t.Run(string(target)+"/"+member, func(t *testing.T) {
				source := member + ` = (() => ({
					length: 1, 0: ['a', 'safe'],
					get map() { void document.title; return Array.prototype.map; }
				})) as unknown as typeof Object.entries;
				const input = {a: 'safe'};
				export const observation = Object.entries(input).map(pair => pair);`
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/entries-replaced.ts", Source: source, Target: target, Diagnostics: "semantic"})
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity == "error" && strings.HasPrefix(diagnostic.Code, "TS") {
						t.Fatalf("invalid source: %#v", response.Diagnostics)
					}
				}
				if response.Error != "" || !containsDiagnosticCode(response.Diagnostics, "EXACT2101") {
					t.Fatalf("the replacement must retain unresolved placement: %s %#v", response.Error, response.Diagnostics)
				}
			})
		}
	}
}

// A replacement can read beyond the two entry slots and invoke an authored getter.
func TestEntriesMapFromEntriesReplacement(t *testing.T) {
	for _, member := range []string{"Object.fromEntries", "Object['fromEntries']"} {
		t.Run(member, func(t *testing.T) {
			source := member + ` = ((entries: Iterable<readonly [PropertyKey, unknown]>) => {
                const entry = Array.from(entries)[0]!;
                return {a: (entry[1] as {data: string}).data};
            }) as typeof Object.fromEntries;
            export const observation = Object.fromEntries(
                Object.entries({a: 'safe'}).map(() => ['a', {get data() { return document.title; }}])
            );`
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/from-entries-replaced.ts", Source: source, Target: TargetServer, Diagnostics: "semantic"})
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" && strings.HasPrefix(diagnostic.Code, "TS") {
					t.Fatalf("invalid source: %#v", response.Diagnostics)
				}
			}
			if response.Error != "" ||
				(hasErrorDiagnostic(response.Diagnostics) && !containsDiagnosticCode(response.Diagnostics, "EXACT2101")) ||
				strings.Contains(response.Code, "const observation") {
				t.Fatalf("a replacement reaches the browser getter: %s %#v", response.Error, response.Diagnostics)
			}
		})
	}
}
