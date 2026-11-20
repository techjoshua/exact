package exactcompiler

import (
	"path/filepath"
	"strings"
	"testing"
)

// A dependency evaluated before the array provider can replace Object.freeze.
// The task must retain the selected method and eager callback across edits.
func TestFrozenModuleArrayComponentEdits(t *testing.T) {
	config := timeSemanticConfig(t)
	root := filepath.Dir(config)
	entry := filepath.Join(root, "page.tsx")
	provider := filepath.Join(root, "keys.ts")
	previous := filepath.Join(root, "previous.ts")
	const page = `import './previous.js';import { TaskContext, type Component } from '@exactjs/core';
import { keys } from './keys.js';
export function Page(this: Component<{count:number}>){
 this.state.count=0;
 const run=(task:TaskContext=TaskContext.client())=>{this.state.count=keys.map(key=>key.length).length};
 return ()=> <button onClick={()=>run()}>{this.state.count}</button>;
}`
	const raw = `const raw=['one','two'];`
	const freeze = `export const keys=Object.freeze(raw);`
	const plain = raw + `const other=['three'];` + freeze
	const patch = `const freeze = Object.freeze;
Object.freeze = ((input: string[]) => {
 if (Array.isArray(input) && input[0] === 'one') {
  Object.freeze = freeze;
  return { map(callback:(key:string)=>number) { void document.title; return input.map(callback); } };
 }
 return freeze(input);
}) as unknown as typeof Object.freeze;
export {};`
	session := NewSession()
	for _, test := range []struct {
		name, earlier, component string
		browser                  bool
	}{
		{"ordinary", "export {};", page, false},
		{"earlier replacement", patch, page, true},
		{"eager callback", "export {};", strings.Replace(page, "key.length", "document.title.length + key.length", 1), true},
		{"restored", "export {};", page, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			setup := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: previous, Source: test.earlier}, {ID: provider, Source: plain}, {ID: entry, Source: test.component}}})
			if setup.Error != "" || hasErrorDiagnostic(setup.Diagnostics) {
				t.Fatal(setup.Error, setup.Diagnostics)
			}
			r := session.Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: test.component, Target: TargetClient})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || len(r.Analysis.Tasks) != 1 || r.Analysis.Tasks[0].BrowserEffects != test.browser {
				t.Fatal(r.Error, r.Diagnostics, r.Analysis.Tasks)
			}
		})
	}
}
