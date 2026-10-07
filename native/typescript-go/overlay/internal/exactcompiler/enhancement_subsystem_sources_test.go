package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Namespace sources protect export ownership, finite activators and analyzer-only fields.
func TestEnhancementSubsystemNamespaceSources(t *testing.T) {
	root, err := os.MkdirTemp(".", ".enhancement-source-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	files := map[string]string{
		"tsconfig.json": `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","jsx":"preserve","jsxImportSource":"@exactjs/jsx","skipLibCheck":true},"include":["*.ts","*.tsx"]}`,
		"implementation.tsx": `import type {Child} from '@exactjs/core';interface Props {
value?:number;
/** Ordinary description. */
label?:string;
/** @exact analyzer-only */
hint?:'brief'|'full';
content?:Child;
children?:Child
}export function Main(props:Props){return()=> <_>{props.children}</_>}export function Zero(){return()=> <i>zero</i>}export const invalid=42;`,
		"facade.ts":                   `export {Main as default,Main as pulse,Main as pulseAlias} from './implementation.js' with {type:'exact-enhancement'};`,
		"named.ts":                    `export {Main as pulse} from './implementation.js' with {type:'exact-enhancement'};`,
		"required.ts":                 `export {Required as default} from './required-implementation.js' with {type:'exact-enhancement'};`,
		"required-implementation.tsx": `export function Required(props:{value:number}){return()=> <i>{props.value}</i>}`,
		"zero.ts":                     `export {Zero as zero} from './implementation.js' with {type:'exact-enhancement'};`,
		"invalid.ts":                  `export {invalid as default} from './implementation.js' with {type:'exact-enhancement'};`,
		"reserved.ts":                 `export {Main as children} from './implementation.js' with {type:'exact-enhancement'};`,
		"duplicate.ts":                `export {Main as pulseAlias,Main as 'pulse-alias'} from './implementation.js' with {type:'exact-enhancement'};`,
		"ordinary.ts":                 `export {Main as default} from './implementation.js';`,
		"empty.ts":                    `export const description='ordinary module';`,
		"star.ts":                     `export * from './facade.js';`,
		"cycle.ts":                    `export * from './cycle-peer.js';export * from './facade.js';`,
		"cycle-peer.ts":               `export * from './cycle.js';`,
	}
	for name, source := range files {
		if err := os.WriteFile(filepath.Join(root, name), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, c := range []struct {
		name, imports, setup, view, diagnostic string
		runtime                                bool
	}{
		{"named-only-missing-selector", `import * as skin from './named.js' with {type:'exact-enhancement'};`, "", `<div skin:value={1}/>`, "EXACT6014", false},
		{"named-only-selected", `import * as skin from './named.js' with {type:'exact-enhancement'};`, "", `<div skin:pulse skin:value={1}/>`, "", true},
		{"required-prop-missing", `import skin from './required.js' with {type:'exact-enhancement'};`, "", `<div skin:root/>`, "EXACT6011", false},
		{"required-prop-present", `import skin from './required.js' with {type:'exact-enhancement'};`, "", `<div skin:value={1}/>`, "", true},
		{"stable-identifier-spread", `import skin from './facade.js' with {type:'exact-enhancement'};`, `const settings={'skin:value':1};`, `<div {...settings}/>`, "", true},
		{"runtime-union-spread", `import skin from './facade.js' with {type:'exact-enhancement'};`, `const settings=Math.random()>0.5?{'skin:value':1}:{'skin:value':2};`, `<div {...settings}/>`, "", true},
		{"stable-property-spread", `import skin from './facade.js' with {type:'exact-enhancement'};`, `const settings={inner:{'skin:value':1}};`, `<div {...settings.inner}/>`, "", true},
		{"unstable-inline-spread", `import skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div {...{'skin:value':1}}/>`, "EXACT6009", false},
		{"enabled-open-spread", `import skin from './facade.js' with {type:'exact-enhancement'};`, `const settings:Record<string,string>={'data-label':'ordinary'};`, `<div {...settings}/>`, "EXACT6008", false},
		{"unknown-prefix-spread", `import skin from './facade.js' with {type:'exact-enhancement'};`, `const settings={'other:value':1};`, `<div {...settings}/>`, "", false},
		{"target-activation", `import skin from './facade.js' with {type:'exact-enhancement'};declare function _target(props:Record<string,unknown>):unknown;`, "", `<_target skin:value={1}/>`, "", true},
		{"element-opening", `import skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:value={1}>inside</div>`, "", true},
		{"canonical-prefix-alias-props", `import skin from './facade.js' with {type:'exact-enhancement'};import paint from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:value={1} paint:label='two'/>`, "", true},
		{"canonical-prefix-alias-order", `import skin from './facade.js' with {type:'exact-enhancement'};import paint from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:root paint:value={1} skin:label='two'/>`, "", true},
		{"raw-jsx-prop-valid", `import skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:content=<span>nested</span>/>`, "", true},
		{"raw-jsx-prop-invalid", `import skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:value=<span/>/>`, "EXACT6011", false},
		{"raw-jsx-metadata-invalid", `import skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:hint=<span/>/>`, "EXACT6011", false},
		{"namespace-default", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:value={1}/>`, "", true},
		{"namespace-activator", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:pulse skin:value={1}/>`, "", true},
		{"namespace-alias-activators", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:pulse skin:pulse-alias skin:value={1}/>`, "", true},
		{"namespace-analysis-only", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:hint='brief'/>`, "", false},
		{"namespace-analysis-type", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:hint={42}/>`, "EXACT6011", false},
		{"namespace-analysis-spread", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, `const settings={'skin:hint':'brief' as const};`, `<div {...settings}/>`, "", false},
		{"namespace-analysis-union-valid", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, `const settings=Math.random()>0.5?{'skin:hint':'brief' as const}:{'skin:hint':'full' as const};`, `<div {...settings}/>`, "", false},
		{"namespace-analysis-union-absent", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, `const settings=Math.random()>0.5?{'skin:hint':'brief' as const}:{'data-label':'ordinary'};`, `<div {...settings}/>`, "", false},
		{"namespace-analysis-union-absent-invalid", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, `const settings=Math.random()>0.5?{'data-label':'ordinary'}:{'skin:hint':42};`, `<div {...settings}/>`, "EXACT6011", false},
		{"namespace-analysis-readonly-alias", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, `const input:Readonly<{'skin:hint':'brief'|'full'}>={'skin:hint':'brief'};const settings=input;`, `<div {...settings}/>`, "", false},
		{"namespace-analysis-union-invalid-last", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, `const settings=Math.random()>0.5?{'skin:hint':'brief' as const}:{'skin:hint':42};`, `<div {...settings}/>`, "EXACT6011", false},
		{"namespace-analysis-union-invalid-first", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, `const settings=Math.random()>0.5?{'skin:hint':42}:{'skin:hint':'brief' as const};`, `<div {...settings}/>`, "EXACT6011", false},
		{"namespace-selector-spread-rejected", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, `const settings={'skin:pulse':true as const,'skin:value':1};`, `<div {...settings}/>`, "EXACT6015", false},
		{"namespace-valued-activator", `import * as skin from './facade.js' with {type:'exact-enhancement'};`, "", `<div skin:pulse={1}/>`, "EXACT6015", false},
		{"ordinary-import-prefix", `import * as skin from './facade.js';`, "", `<div skin:value={1}/>`, "EXACT6005", false},
		{"ordinary-spread-prefix", `import * as skin from './facade.js';`, `const settings={'skin:value':1};`, `<div {...settings}/>`, "EXACT6005", false},
		{"ordinary-spread-with-enabled-module", `import * as skin from './facade.js';import * as paint from './facade.js' with {type:'exact-enhancement'};`, `const settings={'skin:value':1};`, `<div {...settings}/>`, "EXACT6005", false},
		{"ordinary-spread-readonly", `import * as skin from './facade.js';`, `const settings:Readonly<{'skin:value':number}>={'skin:value':1};const alias=settings;`, `<div {...alias}/>`, "EXACT6005", false},
		{"ordinary-spread-union", `import * as skin from './facade.js';declare const input:{'skin:value':number}|{'skin:label':string};`, `const settings=input;`, `<div {...settings}/>`, "EXACT6005", false},
		{"ordinary-data-spread", `import * as skin from './facade.js';`, `const settings={'data-label':'ordinary'};`, `<div {...settings}/>`, "", false},
		{"ordinary-open-data-spread", `import * as skin from './facade.js';`, `const settings:Record<string,string>={'data-label':'ordinary'};`, `<div {...settings}/>`, "", false},
		{"unattributed-default", `import skin from './ordinary.js' with {type:'exact-enhancement'};`, "", `<div skin:value={1}/>`, "EXACT6010", false},
		{"empty-namespace", `import * as skin from './empty.js' with {type:'exact-enhancement'};`, "", `<div/>`, "EXACT6004", false},
		{"invalid-default", `import skin from './invalid.js' with {type:'exact-enhancement'};`, "", `<div/>`, "EXACT6004", false},
		{"reserved-activator", `import * as skin from './reserved.js' with {type:'exact-enhancement'};`, "", `<div/>`, "EXACT6006", false},
		{"duplicate-activator", `import * as skin from './duplicate.js' with {type:'exact-enhancement'};`, "", `<div/>`, "EXACT6012", false},
		{"zero-prop-activator", `import * as skin from './zero.js' with {type:'exact-enhancement'};`, "", `<div skin:zero/>`, "", true},
		{"star-reexport", `import * as skin from './star.js' with {type:'exact-enhancement'};`, "", `<div skin:pulse skin:value={1}/>`, "", true},
		{"cyclic-reexport", `import * as skin from './cycle.js' with {type:'exact-enhancement'};`, "", `<div skin:pulse skin:value={1}/>`, "", true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				entry := filepath.Join(root, "entry.tsx")
				source := c.imports + `export function Page(){` + c.setup + `return()=> ` + c.view + `}`
				if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				response := NewSession().Execute(Request{Kind: "compile", ID: entry, Source: source, ConfigFile: config, Target: target, Diagnostics: "semantic"})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				for _, diagnostic := range response.Diagnostics {
					if strings.HasPrefix(diagnostic.Code, "TS") {
						t.Fatalf("source or emitted TypeScript rejected: %s %s", diagnostic.Code, diagnostic.Message)
					}
				}
				if c.diagnostic != "" {
					if !hasDiagnosticCode(response.Diagnostics, c.diagnostic) {
						t.Fatalf("lost %s: %#v", c.diagnostic, response.Diagnostics)
					}
					return
				}
				if len(response.Diagnostics) != 0 {
					t.Fatalf("supported enhancement source rejected: %#v", response.Diagnostics)
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("enhancement source lost portable placement: %#v", response.Analysis.Components)
				}
				if c.runtime && len(response.Analysis.EnhancementActivations) == 0 {
					t.Fatalf("runtime enhancement lost its activation: %s", response.Code)
				}
				if c.runtime && strings.HasSuffix(c.name, "spread") {
					if len(response.Analysis.EnhancementActivations) != 1 {
						t.Fatalf("spread alternatives duplicated ownership: %#v", response.Analysis.EnhancementActivations)
					}
					activation := response.Analysis.EnhancementActivations[0]
					if activation.Namespace != "skin" || activation.Identity == "" || activation.Start < 0 || activation.Start+activation.Length > len(source) || !strings.Contains(source[activation.Start:activation.Start+activation.Length], "...") {
						t.Fatalf("spread activation lost source ownership: %#v", activation)
					}
				}
				if !c.runtime && (len(response.Analysis.EnhancementActivations) != 0 || strings.Contains(response.Code, "createEnhancementNode") || strings.Contains(response.Code, "hint:")) {
					t.Fatalf("analyzer-only fields leaked into runtime composition:\n%s", response.Code)
				}
			})
		}
	}
}

// Metadata production uses the same directive grammar as field consumption.
func TestEnhancementSubsystemMetadataDirectiveProducer(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, c := range []struct{ marker, diagnostic string }{
		{"@exact analyzer-only", ""},
		{"@exact analyzer-only-extra", "EXACT1001"},
		{"@exact analyzer-only=true", "EXACT1001"},
		{"@exact plugin.analyzer-only", "EXACT1001"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.marker+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "enhancement-metadata-producer.tsx", ConfigFile: config, Target: target, Diagnostics: "semantic", Source: "interface Props {\n/** " + c.marker + " */\nhint?:'brief'|'full';\n}\nexport function Page(props:Props){return()=> <output>ready</output>}"})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if c.diagnostic != "" {
					if !hasDiagnosticCode(response.Diagnostics, c.diagnostic) {
						t.Fatalf("malformed marker lost its diagnostic: %#v", response.Diagnostics)
					}
				} else if len(response.Diagnostics) != 0 || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("metadata producer lost its portable contract: %#v", response)
				}
			})
		}
	}
}

// Similar marker spellings must retain ordinary runtime props when declarations are consumed.
func TestEnhancementSubsystemMetadataConsumerGrammar(t *testing.T) {
	root, err := os.MkdirTemp(".", ".enhancement-marker-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	for file, source := range map[string]string{
		"tsconfig.json": `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","jsx":"preserve","skipLibCheck":true},"include":["*.ts","*.tsx"]}`,
		"facade.ts":     `export {Main as default} from './implementation.js' with {type:'exact-enhancement'};`,
	} {
		if err := os.WriteFile(filepath.Join(root, file), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, marker := range []string{"@exact analyzer-only", "@exact analyzer-only-extra", "@exact analyzer-only=true", "@exact plugin.analyzer-only"} {
		implementation := "export interface Props {\n/** " + marker + " */\nhint?:'brief'|'full';\n}\nexport declare function Main(props:Props):unknown;"
		if err := os.WriteFile(filepath.Join(root, "implementation.d.ts"), []byte(implementation), 0600); err != nil {
			t.Fatal(err)
		}
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(marker+"/"+string(target), func(t *testing.T) {
				entry := filepath.Join(root, "entry.tsx")
				source := `import skin from './facade.js' with {type:'exact-enhancement'};export function Page(){return()=> <div skin:hint='brief'/>}`
				if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				response := NewSession().Execute(Request{Kind: "compile", ID: entry, Source: source, ConfigFile: config, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("declaration consumer rejected: %s %#v", response.Error, response.Diagnostics)
				}
				metadata := marker == "@exact analyzer-only"
				if (len(response.Analysis.EnhancementActivations) == 0) != metadata {
					t.Fatalf("marker changed runtime ownership: %#v", response.Analysis.EnhancementActivations)
				}
			})
		}
	}
}

// Virtual package imports retain authored offsets and enforce the same namespace ownership.
func TestEnhancementSubsystemPackageBoundaries(t *testing.T) {
	root, err := os.MkdirTemp(".", ".enhancement-package-source-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	for name, source := range map[string]string{
		"tsconfig.json":      `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","jsx":"preserve","skipLibCheck":true},"include":["*.ts","*.tsx"]}`,
		"implementation.tsx": `export function Main(props:{value?:number}){return()=> <i>{props.value}</i>}`,
		"facade.ts":          `export {Main as default} from './implementation.js' with {type:'exact-enhancement'};`,
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	plain := `import * as skin from './facade.js' with {type:'exact-enhancement'};`
	scoped := `import * as skin from './facade.js' with {type:'exact-enhancement',scope:'package'};`
	page := `export function Page(){const settings={'skin:value':1};return()=> <div {...settings}/>}`
	for _, c := range []struct {
		name, source, diagnostic string
		boundary                 int
	}{
		{"authored-scope", scoped + page, "EXACT6018", 0},
		{"virtual-scope", page + "\n" + scoped, "", len(page)},
		{"virtual-binding", page + "\n" + plain, "", len(page)},
		{"duplicate-binding", plain + page + "\n" + plain, "EXACT6017", len(plain + page)},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "entry.tsx"), Root: root, ConfigFile: filepath.Join(root, "tsconfig.json"), Source: c.source, Target: target, Diagnostics: "semantic", PackageEnhancementBoundary: c.boundary})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if c.diagnostic != "" {
					if !hasDiagnosticCode(response.Diagnostics, c.diagnostic) {
						t.Fatalf("lost %s: %#v", c.diagnostic, response.Diagnostics)
					}
					return
				}
				if len(response.Diagnostics) != 0 || len(response.Analysis.EnhancementActivations) != 1 || response.Analysis.EnhancementActivations[0].Start >= c.boundary {
					t.Fatalf("virtual bindings lost authored spread ownership: %#v", response)
				}
			})
		}
	}
}
