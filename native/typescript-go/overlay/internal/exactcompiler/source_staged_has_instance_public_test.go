package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// Session enrollment and both emitted artifacts protect source placement,
// dormant operands and native result/Throw behavior independently of receipts.
func TestStagedHasInstanceSessionAndArtifacts(t *testing.T) {
	for _, row := range []struct {
		name, source, runner string
		browser              bool
	}{
		{"null", `export function invoke(){return (null as unknown as object) instanceof WeakMap}`, `assert.equal(m.invoke(),false);`, false},
		{"genuine saved", `const Receiver=WeakMap;export function invoke(){return (null as unknown as object) instanceof Receiver}`, `assert.equal(m.invoke(),false);`, false},
		{"ordinary dormant", `export function invoke(){return ({get value(){return window.name},callback:()=>document.title}) instanceof WeakMap}`, `let getters=0,calls=0;globalThis.window={get name(){getters++;return 'name'}};globalThis.document={get title(){calls++;return 'title'}};assert.equal(m.invoke(),false);assert.equal(getters,0);assert.equal(calls,0);`, false},
		{"custom method", `class Receiver{static [Symbol.hasInstance](_value:unknown){window.name;return true}}export function invoke(){return (()=>document.title) instanceof Receiver}`, `let reads=0,dormant=0;globalThis.window={get name(){reads++;return 'name'}};globalThis.document={get title(){dormant++;return 'title'}};assert.equal(m.invoke(),true);assert.equal(reads,1);assert.equal(dormant,0);`, true},
		{"getter then method", `const Receiver={get [Symbol.hasInstance](){window.name;return (_value:unknown)=>{window.name;return true}}};export function invoke(){return (()=>document.title) instanceof Receiver}`, `const order=[];let dormant=0;globalThis.window={get name(){order.push('step');return 'name'}};globalThis.document={get title(){dormant++;return 'title'}};assert.equal(m.invoke(),true);assert.deepEqual(order,['step','step']);assert.equal(dormant,0);`, true},
		{"method Throw", `class Receiver{static [Symbol.hasInstance](_value:unknown):boolean{window.name;throw 'has-instance-stop'}}export function invoke(){return (()=>document.title) instanceof Receiver}`, `const order=[];let dormant=0;globalThis.window={get name(){order.push('method');return 'name'}};globalThis.document={get title(){dormant++;return 'title'}};assert.throws(()=>m.invoke(),error=>error==='has-instance-stop');assert.deepEqual(order,['method']);assert.equal(dormant,0);`, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(row.name+"/"+string(target), func(t *testing.T) {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/has-instance-public.ts", Source: row.source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					for _, fact := range stagedDeclarationFacts(session) {
						if fact.summary.Name != "invoke" {
							continue
						}
						for _, recipe := range fact.staged.operationRecipes {
							if source := recipe.hasInstance; source != nil {
								t.Logf("HasInstance phase=%q extracted=%v required=%#v", source.role, recipe.delta.extracted, recipe.delta.required)
							}
						}
						for _, call := range fact.staged.calls {
							if call.inputs != nil {
								t.Logf("body edge=%s delivered=%v gap=%v", stagedDeclarationCallEdge(fact.summary.ID, call.invocation), call.inputs.delivered, call.inputs.relative.unsupported)
							}
						}
					}
					t.Fatal(response.Error, response.Diagnostics)
				}
				summary := executableSummary(t, response, "invoke")
				browser := false
				for _, effect := range summary.EffectSources {
					browser = browser || effect.Environment == "browser"
					if effect.Environment == "unknown" {
						t.Fatal("original operator introduced an unrepresented runtime unknown", effect)
					}
				}
				if browser != row.browser {
					t.Fatalf("actual method donor browser=%v, want %v", browser, row.browser)
				}
				adopted := false
				for _, fact := range stagedDeclarationFacts(session) {
					if fact.summary.Name != "invoke" {
						continue
					}
					for _, use := range fact.staged.operationUses {
						if use.request.producer.selector != (sourceStagedOperationSelector{}) {
							continue
						}
						for _, recipe := range fact.staged.operationRecipes {
							if recipe.key == use.request.producer && recipe.hasInstance != nil {
								adopted = fact.staged.settled && !fact.staged.operationsPending
								if _, legacy := fact.staged.legacy[recipe.key.operation]; legacy {
									t.Fatal("covered operator retained legacy preparation")
								}
							}
						}
					}
				}
				if !adopted {
					t.Fatal("ordinary collector did not settle original operator")
				}
				file := filepath.Join(t.TempDir(), "has-instance.mts")
				if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);` + row.runner
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatalf("%s: %v %s", target, err, output)
				}
			})
		}
	}
}
