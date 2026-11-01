package exactcompiler

import (
	"fmt"
	"path/filepath"
	"testing"
)

// Selection belongs to each original Call, independently of a selected factory
// in its callee's history. Returned closures retain that factory's actual inputs.
func TestExecutableClosureSelectionComposition(t *testing.T) {
	for _, destination := range []struct{ name, setup, call string }{
		{"array", `const xs=[make(input)];`, `xs[0]!()`},
		{"object", `const box={read:make(input)};`, `box.read()`},
		{"binding", `const read=make(input);`, `read()`},
		{"factory alias", `const factory=make;const read=factory(input);`, `read()`},
	} {
		for _, browser := range []bool{false, true} {
			t.Run(fmt.Sprint(destination.name, "/", browser), func(t *testing.T) {
				typed, runtime := `input.value`, `"safe"`
				want := "isomorphic"
				if browser {
					typed, runtime = runtime, typed
					want = "client"
				}
				f := newExecutableFixture(t, map[string]string{
					"entry.ts":  `import {make} from './helper.js';const input={get value(){return document.title}};` + destination.setup + `export const value=` + destination.call + `;export function run(){return ` + destination.call + `}`,
					"helper.ts": `export function make(input:{value:string}){return ()=>` + typed + `}`,
					"helper.js": `export function make(input){return ()=>` + runtime + `}`,
				})
				edge := ExecutableEdge{"entry.ts", 0, "./helper.js", "import", "helper.js"}
				if r := f.synchronize([]ExecutableEdge{edge}); r.Error != "" {
					t.Fatal(r.Error)
				}
				r := f.session.Execute(f.request("analyze", "entry.ts"))
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
					t.Fatal(r.Error, r.Diagnostics)
				}
				found := false
				for _, export := range r.Analysis.Exports {
					if export.Name == "value" {
						found = true
						if export.Placement != want {
							t.Fatalf("selected closure placement=%s want=%s", export.Placement, want)
						}
					}
				}
				if !found {
					t.Fatal("value export missing")
				}
				run := executableSummary(t, r, "run")
				known := false
				for _, effect := range run.EffectSources {
					known = known || effect.Environment == "browser"
				}
				if known != browser {
					t.Fatal("selected closure lost runtime-body effect", run)
				}
				// The array witness also executes both target artifacts against the selected
				// physical JavaScript helper, after the usual official TS7 erasure.
				// Definition availability is separate from invocation placement. Server
				// import must omit the client initializer without calling deferred run.
				if destination.name != "array" {
					return
				}
				for _, target := range []Target{TargetClient, TargetServer} {
					if r := f.synchronizeTarget([]ExecutableEdge{edge}, target); r.Error != "" {
						t.Fatal(r.Error)
					}
					request := f.request("compile", "entry.ts")
					request.Target = target
					compiled := f.session.Execute(request)
					if compiled.Error != "" || hasErrorDiagnostic(compiled.Diagnostics) || compiled.Code == "" {
						t.Fatal(target, compiled.Error, compiled.Diagnostics)
					}
					sourceNodeScript(t, compiled.Code, `const fs=require('node:fs'),vm=require('node:vm');let gets=0;
globalThis.document={get title(){gets++;return 'host'}};
const helper=require(process.argv[2]),out={};
vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out,require(name){if(name!=='./helper.js')throw Error(name);return helper},document:globalThis.document});
const browser=process.argv[3]==='true',server=process.argv[4]==='server';
if(browser&&server){if(gets||Object.hasOwn(out,'value'))throw Error('server evaluated client initializer')}
else{const expected=browser?'host':'safe';if(out.value!==expected||gets!==(browser?1:0))throw Error('initializer result/Get count');if(out.run()!==expected||gets!==(browser?2:0))throw Error('returned closure result/Get count')}`, filepath.Join(f.root, "helper.js"), fmt.Sprint(browser), string(target))
				}
			})
		}
	}
}
