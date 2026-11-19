package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Optional imported lookups retain their authored token without a pre-activation helper contract.
func TestEnhancementSubsystemImportedContextSources(t *testing.T) {
	root, err := os.MkdirTemp(".", ".enhancement-context-source-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	helperSource := `import {createContext,type Component} from '@exactjs/core';const Token=createContext<number>('private-probe');export function read(owner:Component<{}>){return owner.hasContext(Token)}`
	for name, source := range map[string]string{"tsconfig.json": `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","jsx":"preserve","skipLibCheck":true},"include":["*.ts","*.tsx"]}`, "helper.ts": helperSource} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, c := range []struct {
		name, imports, setup, invocation string
		replacement                      bool
	}{
		{"call", `import {read} from './helper.js';`, "", `read.call(undefined,this)`, false},
		{"apply", `import {read} from './helper.js';`, "", `read.apply(undefined,[this])`, false},
		{"parenthesized", `import {read} from './helper.js';`, "", `(read).call(undefined,this)`, false},
		{"namespace-call", `import * as helpers from './helper.js';`, "", `helpers.read.call(undefined,this)`, false},
		{"namespace-apply", `import * as helpers from './helper.js';`, "", `helpers.read.apply(undefined,[this])`, false},
		{"local-alias", `import {read} from './helper.js';`, `const alias=read;`, `alias.call(undefined,this)`, false},
		{"eager-callback", `import {read} from './helper.js';`, `const owners=[this];`, `owners.map(read)`, false},
		{"alias-chain", `import {read} from './helper.js';`, `const a=read;const alias=a;`, `alias.call(undefined,this)`, false},
		{"typed-alias", `import {read} from './helper.js';`, `const alias=(read satisfies typeof read);`, `alias.apply(undefined,[this])`, false},
		{"mutable-alias", `import {read} from './helper.js';`, `let alias=read;alias=()=>false;`, `alias.call(undefined,this)`, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				session := NewSession()
				helper := session.Execute(Request{Kind: "compile", ID: filepath.Join(root, "helper.ts"), Root: root, ConfigFile: config, Source: helperSource, Target: target, Diagnostics: "semantic"})
				if helper.Error != "" || len(helper.Diagnostics) != 0 {
					t.Fatalf("context producer rejected: %s %#v", helper.Error, helper.Diagnostics)
				}
				if strings.Contains(helper.Code, "attachCompiledEnhancementContexts") || strings.Contains(helper.Code, "readCompiledEnhancementContextDependency") {
					t.Fatalf("optional lookup modified the ordinary helper: %s", helper.Code)
				}
				entry := filepath.Join(root, "entry.tsx")
				source := c.imports + `import type {Component} from '@exactjs/core';export function Page(this:Component<{}>){` + c.setup + `const first=` + c.invocation + `;const second=` + c.invocation + `;return()=> <output>{String(first&&second)}</output>}`
				if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				response := session.Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("context consumer rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if c.replacement {
					// The selected neutral body is portable independently of the imported
					// helper's token contract. Mutable type compatibility supplies neither.
					if strings.Contains(response.Code, "readCompiledEnhancementContextDependency") || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
						t.Fatalf("neutral replacement lost availability or inherited the helper contract: %#v\n%s", response.Analysis.Components, response.Code)
					}
					return
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" || strings.Contains(response.Code, "readCompiledEnhancementContextDependency") {
					t.Fatalf("optional lookup acquired an unnecessary helper contract: %#v\n%s", response.Analysis.Components, response.Code)
				}
			})
		}
	}
}

// A helper's token expression belongs to its declaring module, including when
// the component has a different token with the same local name.
func TestComponentEnhancementContextTokenOwnership(t *testing.T) {
	root, err := os.MkdirTemp(".", ".enhancement-token-owner-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	helper := `import {createContext,type Component} from '@exactjs/core';
export const shared=createContext<string>('shared');
const token=createContext<string>('helper');
export const tokens={value:token};
export function readMember(owner:Component<{}>){return owner.getContext(tokens.value)}
export function provide(owner:Component<{}>){owner.setContext(token,'helper');return 'ready'}
export function read(owner:Component<{}>){return owner.getContext(token)}`
	for name, source := range map[string]string{
		"tsconfig.json": `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","jsx":"preserve","skipLibCheck":true},"include":["*.ts","*.tsx"]}`,
		"helper.ts":     helper,
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, control := range []struct {
		name, declaration, body, kind, token string
		physical, owned                      int
		opaque                               bool
	}{
		{"provider-source", "", "const label=provide(this);return()=> <_target title={label}/>", "write", "token", 1, 0, false},
		{"opaque-provider", "", "provide(this);return()=> <_target/>", "write", "token", 1, 0, true},
		{"consumer-collision", "const token=createContext<string>('different');", "const label=read(this);return()=> <_target title={label}/>", "read", "token", 1, 0, false},
		{"import-alias", "import {shared as token} from './helper.js';", "const label=this.getContext(token);return()=> <_target title={label}/>", "read", "token", 1, 1, false},
		{"combined-members", "const tokens={value:createContext<string>('local')};", "const a=readMember(this);const b=this.getContext(tokens.value);return()=> <_target title={a+b}/>", "read", "tokens.value", 2, 1, false},
	} {
		t.Run(control.name, func(t *testing.T) {
			entry := filepath.Join(root, control.name+".tsx")
			source := `import {createContext,type Component} from '@exactjs/core';
import {provide,read,readMember} from './helper.js';
` + control.declaration + `
export function Example(this:Component<{}>){` + control.body + `}`
			if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
			response := NewSession().Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: source, Target: TargetServer, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if control.opaque {
				if response.Code != "" || len(response.Diagnostics) != 1 || response.Diagnostics[0].Severity != "error" || response.Diagnostics[0].Code != "EXACT2001" || !strings.Contains(response.Diagnostics[0].Message, "task placement depends on an opaque call") {
					t.Fatalf("unexpected placement diagnostics: %#v", response.Diagnostics)
				}
				return
			}
			if len(response.Diagnostics) != 0 || !strings.Contains(response.Code, "function Example") {
				t.Fatalf("expected emitted component: %#v\n%s", response.Diagnostics, response.Code)
			}
			component := findComponent(t, response.Analysis.Components, "Example")
			if len(component.Contexts) != control.physical {
				t.Fatalf("unexpected physical effects: %#v", component.Contexts)
			}
			for _, effect := range component.Contexts {
				if effect.Kind != control.kind || effect.Token != control.token || effect.Confidence != "exact" {
					t.Fatalf("wrong physical token: %#v", effect)
				}
			}
			tokens := component.EnhancementContexts.Requires
			if control.kind == "write" {
				tokens = component.EnhancementContexts.Provides
			}
			if len(tokens) != control.owned || (control.owned == 1 && tokens[0] != control.token) {
				t.Fatalf("wrong component binding: %#v", tokens)
			}
			property := "requires"
			if control.kind == "write" {
				property = "provides"
			}
			compact := strings.Join(strings.Fields(response.Code), "")
			if strings.Contains(compact, property+":["+control.token+".id") != (control.owned == 1) || strings.Contains(compact, "is.on.id") {
				t.Fatalf("wrong attachment: %s", response.Code)
			}
		})
	}
}
