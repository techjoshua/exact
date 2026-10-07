package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Imported helper contexts retain opaque token ownership through call, apply and aliases.
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
		opaque                           bool
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
				entry := filepath.Join(root, "entry.tsx")
				source := c.imports + `import type {Component} from '@exactjs/core';export function Page(this:Component<{}>){` + c.setup + `const first=` + c.invocation + `;const second=` + c.invocation + `;return()=> <output>{String(first&&second)}</output>}`
				if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				response := session.Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("context consumer rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if c.opaque {
					if strings.Contains(response.Code, "readCompiledEnhancementContextDependency") || response.Analysis.Components[0].Placement == "isomorphic" {
						t.Fatalf("mutable alias inherited the original helper contract: %s", response.Code)
					}
					return
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" || !strings.Contains(response.Code, "readCompiledEnhancementContextDependency") {
					t.Fatalf("helper token ownership was lost: %#v\n%s", response.Analysis.Components, response.Code)
				}
			})
		}
	}
}
