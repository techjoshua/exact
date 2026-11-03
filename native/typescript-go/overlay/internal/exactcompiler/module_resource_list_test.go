package exactcompiler

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// qualifyResourceModule checks authored resource syntax with the installed TS7,
// before native analysis. Temporary inputs and all child processes are test-owned.
func qualifyResourceModule(t *testing.T, source string) (string, string) {
	t.Helper()
	dir := t.TempDir()
	file := filepath.Join(dir, "input.mts")
	config := filepath.Join(dir, "tsconfig.json")
	if err := os.WriteFile(file, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","target":"ES2022","strict":true,"types":[],"lib":["ES2022","ESNext.Disposable"],"noEmit":true},"files":["input.mts"]}`), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	resolved, err := exec.CommandContext(ctx, "node", "-p", `require.resolve('@typescript/native/package.json')`).CombinedOutput()
	if err != nil {
		t.Fatal(err, string(resolved))
	}
	cli := filepath.Join(filepath.Dir(strings.TrimSpace(string(resolved))), "lib", "tsc.js")
	if out, err := exec.CommandContext(ctx, "node", cli, "-p", config).CombinedOutput(); err != nil {
		t.Fatalf("invalid TS7 resource fixture: %v %s", err, out)
	}
	return file, config
}

// A resource list owns one implicit disposal operation. Its declarators cannot
// replace the enclosing list as the traversal root, even when there are several.
func TestModuleResourceListOwnership(t *testing.T) {
	for _, keyword := range []string{"using", "await using"} {
		for _, form := range []string{"single", "multi", "separate"} {
			t.Run(keyword+"/"+form, func(t *testing.T) {
				resource := `{[Symbol.dispose](){},async [Symbol.asyncDispose](){}}`
				declaration := keyword + ` a=` + resource + `;`
				want := 1
				if form == "multi" {
					declaration = keyword + ` a=` + resource + `,b=` + resource + `;`
				}
				if form == "separate" {
					declaration += keyword + ` b=` + resource + `;`
					want = 2
				}
				source := `export {};` + declaration
				file, config := qualifyResourceModule(t, source)
				session := NewSession()
				r := session.Execute(Request{Kind: "analyze", ID: file, Source: source, ConfigFile: config, Diagnostics: "semantic"})
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
					t.Fatal(r.Error, r.Diagnostics)
				}
				count := 0
				for _, fact := range r.Analysis.Callables {
					if fact.Kind == "module-initializer" {
						for _, effect := range fact.EffectSources {
							if effect.Description == "implicit resource disposal" {
								if effect.Environment != "unknown" || !effect.Opaque {
									t.Fatal("disposal gained authority", effect)
								}
								count++
							}
						}
					}
				}
				if count != want {
					t.Fatalf("disposal operations=%d want=%d", count, want)
				}
				for _, target := range []Target{TargetClient, TargetServer} {
					compiled := session.Execute(Request{Kind: "compile", ID: file, Source: source, ConfigFile: config, Diagnostics: "semantic", Target: target})
					if compiled.Error != "" || !containsDiagnosticCode(compiled.Diagnostics, "EXACT2101") || compiled.Code != "" {
						t.Fatalf("opaque disposal lost target refusal: %s %#v", compiled.Error, compiled.Diagnostics)
					}
				}
			})
		}
	}
}

// JavaScript retains acquisition, reverse disposal, and abrupt-completion order.
// Explicit ordinary-module ownership permits emission without proving disposal pure.
func TestModuleResourceListCompletion(t *testing.T) {
	for _, keyword := range []string{"using", "await using"} {
		for _, test := range []struct {
			name, declarations, body, throwDispose string
			events                                 []string
			failure                                string
			disposal                               bool
		}{
			{"single", `a=make('a')`, `events.push('body');`, "", []string{"open:a", "body", "close:a"}, "", true},
			{"multi", `a=make('a'),b=make('b')`, `events.push('body');`, "", []string{"open:a", "open:b", "body", "close:b", "close:a"}, "", true},
			{"first abrupt", `a=stop(),b=make('b')`, `events.push('body');`, "", []string{"open:failed"}, "init", false},
			{"second abrupt", `a=make('a'),b=stop()`, `events.push('body');`, "", []string{"open:a", "open:failed", "close:a"}, "init", true},
			{"disposal abrupt", `a=make('a'),b=make('b')`, `events.push('body');`, "if(name==='b')throw new Error('dispose');", []string{"open:a", "open:b", "body", "close:b", "close:a"}, "dispose", true},
			{"body abrupt", `a=make('a'),b=make('b')`, `events.push('body');throw new Error('body');`, "", []string{"open:a", "open:b", "body", "close:b", "close:a"}, "body", true},
		} {
			t.Run(keyword+"/"+test.name, func(t *testing.T) {
				source := `export {};const events=(globalThis as typeof globalThis & {__exactResourceTrace:string[]}).__exactResourceTrace;function stop():never{events.push('open:failed');throw new Error('init');}function close(name:string){events.push('close:'+name);` + test.throwDispose + `}function make(name:string){events.push('open:'+name);return {[Symbol.dispose](){close(name)},async [Symbol.asyncDispose](){await Promise.resolve();close(name)}}}` + keyword + ` ` + test.declarations + `;` + test.body
				file, config := qualifyResourceModule(t, source)
				for _, target := range []Target{TargetClient, TargetServer} {
					r := NewSession().Execute(Request{Kind: "compile", ID: file, Source: source, ConfigFile: config, Diagnostics: "semantic", Target: target, PreserveOrdinaryModules: true})
					if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
						t.Fatal(r.Error, r.Diagnostics)
					}
					disposal := false
					for _, fact := range r.Analysis.Callables {
						if fact.Kind == "module-initializer" {
							for _, effect := range fact.EffectSources {
								disposal = disposal || effect.Description == "implicit resource disposal" && effect.Opaque
							}
						}
					}
					if disposal != test.disposal {
						t.Fatalf("acquired disposal=%v want=%v", disposal, test.disposal)
					}
					output := filepath.Join(t.TempDir(), "emitted.mts")
					if err := os.WriteFile(output, []byte(r.Code), 0600); err != nil {
						t.Fatal(err)
					}
					events, _ := json.Marshal(test.events)
					script := fmt.Sprintf(`import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';globalThis.__exactResourceTrace=[];let failure;try{await import(pathToFileURL(process.argv[1]).href)}catch(error){failure=error}assert.deepEqual(globalThis.__exactResourceTrace,%s);assert.equal(failure?.message,%s);`, events, func() string {
						if test.failure == "" {
							return "undefined"
						}
						v, _ := json.Marshal(test.failure)
						return string(v)
					}())
					ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
					defer cancel()
					if out, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", script, output).CombinedOutput(); err != nil {
						t.Fatalf("resource completion: %v %s", err, out)
					}
				}
			})
		}
	}
}
