package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Registry sources keep source wrappers, scoped capabilities and finite keys aligned with build facts.
func TestRegistrySubsystemSources(t *testing.T) {
	root, config := registrySourceFixture(t)
	for _, c := range []struct {
		name, definition, key string
		lazy                  bool
	}{
		{"direct", `createComponentRegistry(()=>({row:Row}))`, "row", false},
		{"parenthesized-registry", `(createComponentRegistry(()=>({row:Row})))`, "row", false},
		{"satisfies-registry", `createComponentRegistry(()=>({row:Row})) satisfies Readonly<Record<'row',typeof Row>>`, "row", false},
		{"asserted-registry", `createComponentRegistry(()=>({row:Row})) as ComponentRegistry<{row:typeof Row}>`, "row", false},
		{"non-null-registry", `createComponentRegistry(()=>({row:Row}))!`, "row", false},
		{"block-arrow-definition", `createComponentRegistry(()=>{return {row:Row}})`, "row", false},
		{"function-definition", `createComponentRegistry(function(){return {row:Row}})`, "row", false},
		{"function-lazy-definition", `createComponentRegistry(function({lazy:load}){return {row:load(function(){return import('./Row.js').then(function(module){return module.Row})})}})`, "row", true},
		{"quoted-capability-binding", `createComponentRegistry(({'lazy':load})=>({row:load(()=>import('./Row.js').then(module=>module.Row))}))`, "row", true},
		{"quoted-export-binding", `createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(({'Row':Chosen})=>Chosen))}))`, "row", true},
		{"wrapped-lazy-definition", `createComponentRegistry((({lazy})=>({row:lazy(()=>import('./Row.js').then(module=>module.Row))})))`, "row", true},
		{"direct-lazy", `createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(module=>module.Row))}))`, "row", true},
		{"renamed-lazy", `createComponentRegistry(({lazy:load})=>({row:load(()=>import('./Row.js').then(module=>module.Row))}))`, "row", true},
		{"parenthesized-lazy", `createComponentRegistry(({lazy})=>({row:(lazy(()=>import('./Row.js').then(module=>module.Row)))}))`, "row", true},
		{"wrapped-lazy-reference", `createComponentRegistry(({lazy})=>({row:(lazy)(()=>import('./Row.js').then(module=>module.Row))}))`, "row", true},
		{"wrapped-definition", `createComponentRegistry((()=>({row:Row})))`, "row", false},
		{"registry-alias", `createComponentRegistry(()=>({row:Row}));const Alias=Views`, "row", false},
		{"registry-alias-chain", `createComponentRegistry(()=>({row:Row}));const First=Views;const Alias=(First satisfies typeof Views)`, "row", false},
		{"wrapped-selection", `createComponentRegistry(()=>({row:Row}))`, "row", false},
		{"asserted-selection", `createComponentRegistry(()=>({row:Row}))`, "row", false},
		{"builder-lazy", `createComponentRegistry(builder=>({row:builder.lazy(()=>import('./Row.js').then(module=>module.Row))}))`, "row", true},
		{"builder-indexed-lazy", `createComponentRegistry(builder=>({row:builder['lazy'](()=>import('./Row.js').then(module=>module.Row))}))`, "row", true},
		{"template-import", "createComponentRegistry(({lazy})=>({row:lazy(()=>import(`./Row.js`).then(module=>module.Row))}))", "row", true},
		{"template-export", "createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(module=>module[`Row`]))}))", "row", true},
		{"unrelated-writes", `createComponentRegistry(()=>({row:Row}));let count=0;count++;const box={value:0};box.value++`, "row", false},
		{"unicode-key", `createComponentRegistry(()=>({'café🎛':Row}))`, "café🎛", false},
		{"quote-key", `createComponentRegistry(()=>({'quote"key':Row}))`, "quote\"key", false},
		{"quoted-key", `createComponentRegistry(()=>({"'quoted'":Row}))`, "'quoted'", false},
		{"slash-key", `createComponentRegistry(()=>({'slash\\key':Row}))`, "slash\\key", false},
		{"newline-key", `createComponentRegistry(()=>({'line\nkey':Row}))`, "line\nkey", false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				entry := filepath.Join(root, "Page.tsx")
				registryName := "Views"
				if strings.HasPrefix(c.name, "registry-alias") {
					registryName = "Alias"
				}
				selection := registryName + "[props.key]"
				if c.name == "wrapped-selection" {
					selection = "(" + selection + ")"
				} else if c.name == "asserted-selection" {
					selection = "(" + selection + " as typeof Row)"
				}
				source := `import {createComponentRegistry,type KeyOf,type ComponentRegistry} from '@exactjs/core';import {Row} from './Row.js';const Views=` + c.definition + `;export function Page(props:{key:KeyOf<typeof Views>}){const Current=` + selection + `;return()=> <Current/>}`
				if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				response := NewSession().Execute(Request{Kind: "compile", ID: entry, Source: source, ConfigFile: config, Target: target, Diagnostics: "semantic", JSXInterop: &JSXInterop{AdapterModule: "@exactjs/react-compat", AdapterExport: "adaptReactComponent"}})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("supported registry source rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("registry selection lost portable placement: %#v", response.Analysis.Components)
				}
				if len(response.Analysis.Registries) != 1 || len(response.Analysis.Registries[0].Entries) != 1 {
					t.Fatalf("registry facts lost: %#v", response.Analysis.Registries)
				}
				value := response.Analysis.Registries[0].Entries[0]
				mode := "eager"
				if c.lazy {
					mode = "lazy"
				}
				if value.Key != c.key || value.Mode != mode || value.ComponentID == "" || value.ModuleSpecifier != "./Row.js" || value.ExportName != "Row" {
					t.Fatalf("registry lost canonical source provenance: %#v", value)
				}
				if strings.Contains(response.Code, "adaptReactComponent") {
					t.Fatalf("native registry crossed the compatibility boundary: %s", response.Code)
				}
				if !strings.Contains(response.Code, "__exactComponentRegistry") {
					t.Fatalf("registry escaped compiler lowering: %s", response.Code)
				}
			})
		}
	}
}

// Each source fixture resolves the real framework declarations and owns all generated files.
func registrySourceFixture(t *testing.T) (string, string) {
	t.Helper()
	root, err := os.MkdirTemp(".", ".registry-source-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	for name, source := range map[string]string{
		"tsconfig.json": `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","jsx":"preserve","jsxImportSource":"@exactjs/jsx","skipLibCheck":true},"include":["*.ts","*.tsx"]}`,
		"Row.tsx":       `export function Row(){return()=> <p>row</p>}export default Row;`,
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return root, config
}

// Invalid controls keep finite identity and the scoped loader capability from granting broader authority.
func TestRegistrySubsystemRejectedSources(t *testing.T) {
	root, config := registrySourceFixture(t)
	for _, c := range []struct{ name, source, detail string }{
		{"no-definition", `const Views=createComponentRegistry();`, "one declarative"},
		{"extra-definition", `const Views=createComponentRegistry(()=>({row:Row}),()=>({row:Row}));`, "one declarative"},
		{"loop-definition", `for(const Views=createComponentRegistry(()=>({row:Row}));false;) {}`, "module-level"},
		{"duplicate-key", `const Views=createComponentRegistry(()=>({row:Row,row:Row}));`, "more than once"},
		{"no-loader", `const Views=createComponentRegistry(({lazy})=>({row:lazy()}));`, "one loader"},
		{"extra-loader", `const load=()=>import('./Row.js').then(module=>module.Row);const Views=createComponentRegistry(({lazy})=>({row:lazy(load,load)}));`, "one loader"},
		{"cyclic-loader", `const a=b;const b=a;const Views=createComponentRegistry(({lazy})=>({row:lazy(a)}));`, "one static import"},
		{"zero-selector-parameters", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(()=>Row))}));`, "one static import"},
		{"foreign-selector", `const choose=(module:typeof import('./Row.js'))=>module.Row;const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(choose))}));`, "one static import"},
		{"array-selector-binding", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(([Chosen])=>Chosen))}));`, "one static import"},
		{"rest-selector-parameter", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then((...modules)=>modules[0].Row))}));`, "one static import"},
		{"wrong-selector-receiver", `declare const other:typeof import('./Row.js');const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(module=>other.Row))}));`, "one static import"},
		{"selector-local-array", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(({Row})=>[Row]))}));`, "one static import"},
		{"mutable", `let Views=createComponentRegistry(()=>({row:Row}));`, "immutable named"},
		{"unnamed", `export default createComponentRegistry(()=>({row:Row}));`, "immutable named"},
		{"nested", `function make(){const Views=createComponentRegistry(()=>({row:Row}));return Views}`, "module-level"},
		{"extra-after-return", `const Views=createComponentRegistry(()=>{return {row:Row};console.log('unreachable')});`, "without side effects"},
		{"branching-block", `const Views=createComponentRegistry(()=>{if(true)return {row:Row};return {row:Row}});`, "without side effects"},
		{"empty-block", `const Views=createComponentRegistry(()=>{});`, "without side effects"},
		{"bare-return", `const Views=createComponentRegistry(()=>{return;});`, "without side effects"},
		{"effectful-definition", `const Views=createComponentRegistry(()=>{console.log('setup');return {row:Row}});`, "without side effects"},
		{"named-definition", `const define=()=>({row:Row});const Views=createComponentRegistry(define);`, "declarative callback"},
		{"branching", `const Views=createComponentRegistry(()=>({row:Math.random()?Row:Row}));`, "runtime branching"},
		{"computed", `const Views=createComponentRegistry(()=>({['row']:Row}));`, "non-computed"},
		{"empty-key", `const Views=createComponentRegistry(()=>({'':Row}));`, "empty entry key"},
		{"prototype-key", `const Views=createComponentRegistry(()=>({'__proto__':Row}));`, "unsafe prototype"},
		{"constructor-key", `const Views=createComponentRegistry(()=>({constructor:Row}));`, "unsafe prototype"},
		{"ordinary-lazy", `function lazy(loader:()=>Promise<typeof Row>){return Row}const Views=createComponentRegistry(()=>({row:lazy(()=>import('./Row.js').then(module=>module.Row))}));`, "scoped lazy"},
		{"mutable-loader", `let load=()=>import('./Row.js').then(module=>module.Row);load=()=>import('./Row.js').then(module=>module.Row);const Views=createComponentRegistry(({lazy})=>({row:lazy(load)}));`, "one static import"},
		{"parameterized-loader", `const Views=createComponentRegistry(({lazy})=>({row:lazy((unused=0)=>import('./Row.js').then(module=>module.Row))}));`, "one static import"},
		{"extra-then-handler", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(module=>module.Row,()=>Row))}));`, "one static import"},
		{"missing-import", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>Promise.resolve(Row))}));`, "one static import"},
		{"unowned-selector", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(module=>Row))}));`, "one static import"},
		{"dynamic-selector", `declare const selected:'Row'|'default';const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(module=>module[selected]))}));`, "one static import"},
		{"extra-selector-binding", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(({Row,default:Other})=>Row))}));`, "one static import"},
		{"default-selector-binding", `const fallback=Row;const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(({Row=fallback})=>Row))}));`, "one static import"},
		{"computed-selector-binding", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(({['Row']:Chosen})=>Chosen))}));`, "one static import"},
		{"default-module-parameter", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then((module={Row,default:Row})=>module.Row))}));`, "one static import"},
		{"shorthand-capability", `const Views=createComponentRegistry(({lazy})=>({lazy}));`, "may not escape"},
		{"renamed-shorthand-capability", `const Views=createComponentRegistry(({lazy:load})=>({load}));`, "may not escape"},
		{"effectful-loader", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>{console.log('load');return import('./Row.js').then(module=>module.Row)})}));`, "one static import"},
		{"effectful-selector", `const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import('./Row.js').then(module=>{console.log('select');return module.Row}))}));`, "one static import"},
		{"dynamic-module", `const request='./Row.js';const Views=createComponentRegistry(({lazy})=>({row:lazy(()=>import(request).then(module=>module.Row))}));`, "one static import"},
		{"escaped-capability", `const Views=createComponentRegistry(({lazy})=>({row:lazy}));`, "may not escape"},
		{"renamed-escaped-capability", `const Views=createComponentRegistry(({lazy:load})=>({row:load}));`, "may not escape"},
		{"deleted-entry", `const Views=createComponentRegistry(()=>({row:Row}));delete (Views as {row?:typeof Row}).row;`, "may not be reassigned or mutated"},
		{"alias-deleted-entry", `const Views=createComponentRegistry(()=>({row:Row}));const Alias=Views;delete (Alias as {row?:typeof Row}).row;`, "may not be reassigned or mutated"},
		{"builder-escaped-capability", `const Views=createComponentRegistry(builder=>({row:builder.lazy}));`, "may not escape"},
		{"indexed-escaped-capability", `const Views=createComponentRegistry(builder=>({row:builder['lazy']}));`, "may not escape"},
		{"untrusted-key", `const Views=createComponentRegistry(()=>({row:Row}));declare const key:string;const Current=Views[key];`, "keys must be proven"},
		{"any-key", `const Views=createComponentRegistry(()=>({row:Row}));declare const key:any;const Current=Views[key];`, "keys must be proven"},
		{"missing-union-key", `const Views=createComponentRegistry(()=>({row:Row}));declare const key:'row'|'absent';const Current=Views[key];`, "keys must be proven"},
		{"wrapped-mutation", `const Views=createComponentRegistry(()=>({row:Row}));(Views as {row:typeof Row}).row=Row;`, "may not be reassigned or mutated"},
		{"alias-mutation", `const Views=createComponentRegistry(()=>({row:Row}));const Alias=Views;(Alias as {row:typeof Row}).row=Row;`, "may not be reassigned or mutated"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				entry := filepath.Join(root, "Page.tsx")
				source := `import {createComponentRegistry} from '@exactjs/core';import {Row} from './Row.js';` + c.source
				if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				response := NewSession().Execute(Request{Kind: "compile", ID: entry, Source: source, ConfigFile: config, Target: target, Diagnostics: "semantic"})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				found := false
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Code == "EXACT_COMPONENT_REGISTRY" && strings.Contains(diagnostic.Message, c.detail) {
						found = true
					}
				}
				if !found {
					t.Fatalf("lost registry contract %q: %#v", c.detail, response.Diagnostics)
				}
			})
		}
	}
}

// Imported registries retain finite key proof at the consuming module boundary.
func TestRegistrySubsystemImportedSources(t *testing.T) {
	root, config := registrySourceFixture(t)
	registry := `import {createComponentRegistry} from '@exactjs/core';import {Row} from './Row.js';export const Views=(createComponentRegistry(()=>({'quote"key':Row})));`
	if err := os.WriteFile(filepath.Join(root, "Registry.tsx"), []byte(registry), 0600); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		name, imports, binding, selected, key string
		valid                                 bool
	}{
		{"named", `import {Views} from './Registry.js';`, "", "Views", `'quote"key'`, true},
		{"namespace", `import * as Registries from './Registry.js';`, "", "Registries.Views", `'quote"key'`, true},
		{"local-alias", `import {Views} from './Registry.js';`, `const Alias=Views;`, "Alias", `'quote"key'`, true},
		{"untrusted", `import {Views} from './Registry.js';`, "", "Views", "string", false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				entry := filepath.Join(root, "Page.tsx")
				source := c.imports + c.binding + `export function Page(props:{choice:` + c.key + `}){const Current=` + c.selected + `[props.choice];return()=> <Current/>}`
				if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				response := NewSession().Execute(Request{Kind: "compile", ID: entry, Source: source, ConfigFile: config, Target: target, Diagnostics: "semantic", JSXInterop: &JSXInterop{AdapterModule: "@exactjs/react-compat", AdapterExport: "adaptReactComponent"}})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if !c.valid {
					if !hasDiagnosticCode(response.Diagnostics, "EXACT_COMPONENT_REGISTRY") {
						t.Fatalf("import lost finite key guard: %#v", response.Diagnostics)
					}
					return
				}
				if len(response.Diagnostics) != 0 || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" || strings.Contains(response.Code, "adaptReactComponent") {
					t.Fatalf("imported registry lost its native contract: %#v\n%s", response.Analysis.Components, response.Code)
				}
			})
		}
	}
}
