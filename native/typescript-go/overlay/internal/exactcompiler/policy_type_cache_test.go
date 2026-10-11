package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Completed type facts may be reused across component analyses but never across checker generations.
func TestPolicyTypeCacheGenerationIsolation(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	helper := filepath.Join(root, "helper.ts")
	first := filepath.Join(root, "First.tsx")
	second := filepath.Join(root, "Second.tsx")
	page := filepath.Join(root, "Page.tsx")
	sources := map[string]string{
		config: `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","jsx":"preserve"}}`,
		first:  `import {read} from './helper.js';export function First(){return()=> <p>{read().value}</p>;}`,
		second: `import {read} from './helper.js';export function Second(){return()=> <p>{read().value}</p>;}`,
		page:   `import {First} from './First.js';import {Second} from './Second.js';export function Page(){return()=> <main><First/><Second/></main>;}`,
	}
	for file, source := range sources {
		if err := os.WriteFile(file, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	for _, annotation := range []string{"/** @exact keep=secret */", "", "/** @exact keep=secret */"} {
		source := `declare const marker:unique symbol;
` + annotation + `type Value=string&{readonly[marker]:true};type Link<T>={value:T;next?:Link<T>};declare const data:Link<Value>;export function read(){return data;}`
		if err := os.WriteFile(helper, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		response := session.Execute(Request{Kind: "compile", ID: helper, Root: root, ConfigFile: config, Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		for _, file := range []string{page, second, first} {
			for _, target := range []Target{TargetClient, TargetServer} {
				request := Request{Kind: "compile", ID: file, Root: root, ConfigFile: config, Source: sources[file], Target: target}
				cached, fresh := session.Execute(request), NewSession().Execute(request)
				if cached.Error != "" || fresh.Error != "" {
					t.Fatalf("cached %s, fresh %s", cached.Error, fresh.Error)
				}
				if !reflect.DeepEqual(cached.Diagnostics, fresh.Diagnostics) || !reflect.DeepEqual(cached.Analysis.Policy, fresh.Analysis.Policy) || cached.Code != fresh.Code {
					t.Fatalf("policy cache diverged for %s %s", file, target)
				}
				if file != page && hasDiagnosticCode(cached.Diagnostics, "EXACT3020") != (annotation != "") {
					t.Fatalf("qualification lost for %s: %#v", file, cached.Diagnostics)
				}
			}
		}
	}
}
