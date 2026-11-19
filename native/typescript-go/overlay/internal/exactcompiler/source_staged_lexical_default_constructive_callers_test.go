package exactcompiler

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

// These three source forms share one original program. consume owns invocation;
// default-bearing declarations only return or forward their stored formal DATA.
const stagedLexicalDefaultConstructiveSource = `
function quiet(){return 'quiet'}
function browser(){return window.name}
function dormant(){return document.title}
function consume(callback:()=>string){return callback()}
function direct(callback:()=>string=quiet){return callback}
function forward(callback:()=>string=quiet){return consume(callback)}
function mixed(tag:()=>string,callback:()=>string=quiet,unused:()=>string=dormant){return ({get value(){return callback}}).value}
export function directProvided(){return consume(direct(browser))}
export function directOmitted(){return consume(direct())}
export function directUndefined(){return consume(direct(undefined))}
export function directPartial(other:(()=>string)|undefined){consume(direct(browser));return consume(direct(other))}
export function directStored(){return direct()}
export function forwardProvided(){return forward(browser)}
export function forwardOmitted(){return forward()}
export function forwardUndefined(){return forward(undefined)}
export function forwardPartial(other:(()=>string)|undefined){forward(browser);return forward(other)}
export function mixedProvided(){return consume(mixed(quiet,browser))}
export function mixedOmitted(){return consume(mixed(quiet))}
export function mixedUndefined(){return consume(mixed(quiet,undefined))}
export function mixedPartial(other:(()=>string)|undefined){consume(mixed(quiet,browser));return consume(mixed(quiet,other))}
export function mixedStored(){return mixed(quiet)}
`

func TestStagedLexicalDefaultConstructiveCallers(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			var application Response
			for _, packageType := range []string{"application", "library"} {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/lexical-default-constructive.ts", Source: stagedLexicalDefaultConstructiveSource, Target: target, PackageType: packageType, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal("entry experiment compilation", packageType, response.Error, response.Diagnostics)
				}
				if packageType == "application" {
					application = response
				} else {
					appContract, err := json.Marshal(application.Analysis.Callables)
					if err != nil {
						t.Fatal(err)
					}
					libraryContract, err := json.Marshal(response.Analysis.Callables)
					if err != nil {
						t.Fatal(err)
					}
					if application.Code != response.Code || !bytes.Equal(appContract, libraryContract) || !reflect.DeepEqual(application.Diagnostics, response.Diagnostics) {
						t.Fatal("package context changed implementation or portable public callable contract")
					}
				}
			}
			file := filepath.Join(t.TempDir(), "constructive-default.mts")
			if err := os.WriteFile(file, []byte(application.Code), 0600); err != nil {
				t.Fatal(err)
			}
			const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];globalThis.window={get name(){events.push('browser');return'known'}};globalThis.document={get title(){throw'unused-default-sentinel'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);for(const family of['direct','forward','mixed']){assert.equal(m[family+'Omitted'](),'quiet');assert.equal(m[family+'Undefined'](),'quiet');assert.deepEqual(events,[]);assert.equal(m[family+'Provided'](),'known');assert.deepEqual(events,['browser']);events.length=0;assert.equal(m[family+'Partial'](undefined),'quiet');assert.deepEqual(events,['browser']);events.length=0;assert.equal(m[family+'Partial'](()=>{events.push('other');return'other'}),'other');assert.deepEqual(events,['browser','other']);events.length=0;assert.throws(()=>m[family+'Partial'](()=>{events.push('throw');throw'sentinel'}),e=>e==='sentinel');assert.deepEqual(events,['browser','throw']);events.length=0}for(const name of['directStored','mixedStored']){const saved=m[name]();assert.equal(typeof saved,'function');assert.deepEqual(events,[]);assert.equal(saved(),'quiet');assert.deepEqual(events,[])}`
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatal(err, string(output))
			}
		})
	}
}
