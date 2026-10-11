package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// Native spelling is not native identity. Imports and custom receivers must keep
// their native call contract, while immutable aliases retain discoverable ownership.
func TestTaskResourceFactoryIdentity(t *testing.T) {
	for _, c := range []struct{ name, declaration, body, kind string }{
		{"global-timer", ``, `const timer=setTimeout(()=>{},10);void timer;`, "timeout"},
		{"alias-timer", `const wait=setTimeout;`, `const timer=wait(()=>{},10);void timer;`, "timeout"},
		{"wrapped-alias-timer", `const wait=(setTimeout);`, `const timer=wait(()=>{},10);void timer;`, "timeout"},
		{"global-member-timer", ``, `const timer=globalThis.setTimeout(()=>{},10);void timer;`, "timeout"},
		{"indexed-global-timer", ``, `const timer=globalThis['setTimeout'](()=>{},10);void timer;`, "timeout"},
		{"custom-member-timer", `const target={setTimeout(callback:()=>void,delay:number){return 1;}};`, `target.setTimeout(()=>{},10);`, ""},
		{"custom-member-fetch", `const target={fetch(value:string){return 1;}};`, `target.fetch('/x');`, ""},
		{"imported-timer", `import {setTimeout} from './helper.js';`, `setTimeout(()=>{},10);`, ""},
		{"imported-fetch", `import {fetch} from './helper.js';`, `fetch('/x');`, ""},
		{"shadowed-global", `const globalThis={setTimeout(callback:()=>void,delay:number){return 1;}};`, `globalThis.setTimeout(()=>{},10);`, ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			root := t.TempDir()
			if err := os.WriteFile(filepath.Join(root, "helper.ts"), []byte(`export function setTimeout(callback:()=>void,delay:number){return 1;}export function fetch(value:string){return 1;}`), 0600); err != nil {
				t.Fatal(err)
			}
			r := NewSession().Execute(Request{Kind: "compile", Root: root, ID: filepath.Join(root, "page.tsx"), Target: TargetClient, Source: `import {TaskContext} from '@exactjs/core';` + c.declaration + `export function Page(){function run(task:TaskContext=TaskContext.client()){` + c.body + `}run();return()=> <output/>;}`})
			if r.Error != "" || len(r.Analysis.Tasks) != 1 {
				t.Fatalf("missing task: %s", r.Error)
			}
			resources := r.Analysis.Tasks[0].Resources
			if c.kind == "" {
				if len(resources) != 0 || len(r.Analysis.Tasks[0].SignalCalls) != 0 {
					t.Fatalf("custom factory rewritten: %#v", resources)
				}
			} else if !containsTaskResource(resources, c.kind, "") {
				t.Fatalf("native alias lost ownership: %#v", resources)
			}
		})
	}
}
