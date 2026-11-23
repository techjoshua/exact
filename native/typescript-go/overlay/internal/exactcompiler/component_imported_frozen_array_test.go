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

// A later call cannot alter the original acquisition, while an early
// invocation through a cyclic dependency may still supply the replacement.
func TestFrozenModuleArrayBindingOrder(t *testing.T) {
	config := timeSemanticConfig(t)
	root := filepath.Dir(config)
	entry := filepath.Join(root, "page.tsx")
	const page = `import {type Component} from '@exactjs/core';
import {read} from './reader.js';
export function Page(this: Component<{step:number}>) {
 this.state.step=1;
 const text=this.reactive(()=>read(this.state.step));
 return ()=> <button onClick={()=>this.state.step++}>{text.get()}</button>;
}`
	const installer = `export function install() {
 const freeze = Object.freeze;
 Object.freeze = ((input: string[]) => {
   if (Array.isArray(input) && input[0] === 'one') {
     Object.freeze = freeze;
     return {[Symbol.iterator](){ return input[Symbol.iterator](); }, map(callback:(x:string)=>string){ void document.title; return input.map(callback); }};
   }
   return freeze(input);
 }) as unknown as typeof Object.freeze;
}`
	for _, row := range []struct{ name, reader, provider, early, placement string }{
		{"later", `import { keys } from './provider.js';
import { install } from './install.js';
export function read(step:number) {

 const list=keys.map(item=>item+':'+step);
 install();
 return list.join(',');
}`, `import {install} from './install.js';
const raw=['one','two'];
export const keys=Object.freeze(raw);
install();`, `export {};`, "unknown"},
		{"cyclic prior call", `import { keys } from './provider.js';
import { install } from './install.js';
export function read(step:number) {
 if(step===0){ install(); return ''; }
 const list=keys.map(item=>item+':'+step);

 return list.join(',');
}`, `import './early.js';
const raw=['one','two'];
export const keys=Object.freeze(raw);`, `import {read} from './reader.js'; read(0);`, "client"},
	} {
		for _, form := range []struct{ name, expression string }{
			{"direct", "const list=keys.map(item=>item+':'+step);"},
			{"after loop", "for (const key of keys) { void key; }\n const list=[...keys.map(item=>item+':'+step)];"},
		} {
			t.Run(row.name+"/"+form.name, func(t *testing.T) {
				reader := strings.Replace(row.reader, "const list=keys.map(item=>item+':'+step);", form.expression, 1)
				session := NewSession()
				setup := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{
					{ID: entry, Source: page}, {ID: filepath.Join(root, "install.ts"), Source: installer},
					{ID: filepath.Join(root, "reader.ts"), Source: reader}, {ID: filepath.Join(root, "provider.ts"), Source: row.provider},
					{ID: filepath.Join(root, "early.ts"), Source: row.early},
				}})
				if setup.Error != "" || hasErrorDiagnostic(setup.Diagnostics) {
					t.Fatal(setup.Error, setup.Diagnostics)
				}
				response := session.Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config,
					Source: page, Target: TargetServer, Diagnostics: "semantic", ServerComponents: true})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" ||
					len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != row.placement {
					t.Fatal(response.Error, response.Diagnostics, response.Analysis.Components)
				}
			})
		}
	}
}
