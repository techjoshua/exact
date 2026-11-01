package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Preserve the actual imported function object while its own data method wins.
// Compiled helper and consumer execute as real ESM in both artifact targets.
func TestNamespaceOwnOverrideEmitted(t *testing.T) {
	for _, receiver := range []string{"ns.read", "ns['read']", "alias.read"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(receiver+"/"+string(target), func(t *testing.T) {
				prefix := `import * as ns from './helper.js';`
				if receiver == "alias.read" {
					prefix += `const alias=ns;`
				}
				f := newExecutableFixture(t, map[string]string{"helper.ts": `export function read(){return document.title}`, "entry.ts": prefix + `Object.defineProperty(` + receiver + `,'call',{value:()=> 'safe'});export const value=` + receiver + `.call(undefined);`})
				out := t.TempDir()
				for _, name := range []string{"helper.ts", "entry.ts"} {
					request := f.request("compile", name)
					request.Target = target
					request.ModuleRewrite = &ModuleRewrite{ModuleAliases: map[string]string{"./helper.js": "./helper.mjs"}}
					response := f.session.Execute(request)
					if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
						t.Fatal(name, response.Error, response.Diagnostics)
					}
					if err := os.WriteFile(filepath.Join(out, strings.TrimSuffix(name, ".ts")+".mjs"), []byte(response.Code), 0600); err != nil {
						t.Fatal(err)
					}
				}
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				output, err := exec.CommandContext(ctx, "node", "--input-type=module", "-e", `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const result=await import(pathToFileURL(process.argv[1]).href);assert.equal(result.value,'safe');console.log('safe');`, filepath.Join(out, "entry.mjs")).CombinedOutput()
				if err != nil || strings.TrimSpace(string(output)) != "safe" {
					t.Fatalf("namespace artifact value: %v %s", err, output)
				}
			})
		}
	}
}

// Namespace syntax and current source selection are required. Similar types,
// proxies, declarations, CommonJS and cyclic/changed exports cannot gain a pure
// export read or erase independent initialization and getter effects.
func TestNamespaceExportReadBoundaries(t *testing.T) {
	for _, test := range []struct {
		name, helper, entry string
		browser             bool
	}{
		{"shadow-getter", `export function read(){return 1}`, `const ns={get read(){document.title;return ()=>1}};export const value=ns.read();`, true},
		{"foreign", `export function read(){return 1}`, `declare const ns:{read:typeof import('./helper.js').read};Object.defineProperty(ns.read,'call',{value:()=> 'safe'});export const value=ns.read.call(undefined);`, false},
		{"proxy", `export function read(){return 1}`, `import * as source from './helper.js';const ns=new Proxy(source,{get(target,key){document.title;return Reflect.get(target,key)}});export const value=ns.read.call(undefined);`, false},
		{"commonjs-getter", `Object.defineProperty(exports,'read',{get(){document.title;return ()=>1}});`, `import * as ns from './helper.cjs';export const value=ns.read.call(undefined);`, false},
		{"cyclic", `import {token} from './entry.js';void token;export function read(){return 1}`, `import * as ns from './helper.js';export const token=1;Object.defineProperty(ns.read,'call',{value:()=> 'safe'});export const value=ns.read.call(undefined);`, false},
		{"written-export", `export function read(){return 1}read=()=>document.title;`, `import * as ns from './helper.js';Object.defineProperty(ns.read,'call',{value:()=> 'safe'});export const value=ns.read.call(undefined);`, false},
		{"initializer-write", `document.title='initialization';export function read(){return 1}`, `import * as ns from './helper.js';Object.defineProperty(ns.read,'call',{value:()=> 'safe'});export const value=ns.read.call(undefined);`, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			helper := "helper.ts"
			if test.name == "commonjs-getter" {
				helper = "helper.cjs"
			}
			f := newExecutableFixture(t, map[string]string{helper: test.helper, "entry.ts": test.entry})
			response := f.session.Execute(f.request("analyze", "entry.ts"))
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, d := range response.Diagnostics {
				if d.Severity == "error" && d.Code != "EXACT2101" {
					t.Fatal("invalid namespace witness", response.Diagnostics)
				}
			}
			browser := false
			for _, project := range f.session.projects {
				if project.callableCache == nil {
					continue
				}
				for _, fact := range project.callableCache.merged.facts {
					if fact.summary.Kind != "module-initializer" {
						continue
					}
					for _, effect := range fact.summary.EffectSources {
						browser = browser || effect.Environment == "browser"
					}
				}
			}
			if test.browser && !browser {
				t.Fatal("initialization/getter browser work disappeared")
			}
			if !test.browser {
				found := false
				for _, exported := range response.Analysis.Exports {
					if exported.Name == "value" {
						found = true
						if exported.Placement == "isomorphic" {
							t.Fatal("unproved namespace read became portable")
						}
					}
				}
				if !found {
					t.Fatal("missing export")
				}
			}
		})
	}
}
