package exactcompiler

import (
	"os"
	"strings"
	"testing"
)

const memberInputChild = `import type {Component} from '@exactjs/core';
export function Child(this:Component<{}>,props:{item:{value:number;other?:number};label?:string}){
 const cell=this.reactive(()=>props.item.value);
 return()=> <output>{cell.get()}</output>;
}`

func TestComponentMemberInputUsePlacement(t *testing.T) {
	for _, row := range []struct {
		name, child, composition, want string
	}{
		{"reached", memberInputChild, `<Child item={{get value(){return document.title.length}}}/>`, "client"},
		{"inert before", memberInputChild, `<Child label="inert" item={{get value(){return document.title.length}}}/>`, "client"},
		{"inert after", memberInputChild, `<Child item={{get value(){return document.title.length}}} label={'inert'}/>`, "client"},
		{"selected state capture", memberInputChild, `<Child label="inert" item={{other:this.state.n,get value(){return this.other+document.title.length}}}/>`, "client"},
		{"unrelated state read", memberInputChild, `<Child label={this.state.label} item={{get value(){return document.title.length}}}/>`, "unknown"},
		{"spread preserves", memberInputChild, `<Child item={{get value(){return document.title.length}}} {...{label:'inert'}}/>`, "client"},
		{"getter supplied by spread", memberInputChild, `<Child {...{item:{get value(){return document.title.length}}}}/>`, "client"},
		{"spread selected state capture", memberInputChild, `<Child {...{item:{other:this.state.n,get value(){return this.other+document.title.length}} as {other:number;value:number}}}/>`, "client"},
		{"later spread supplies getter", memberInputChild, `<Child item={{value:1}} {...({item:{get value(){return document.title.length}}} as {item?:{value:number}})}/>`, "client"},
		{"later direct input overrides spread getter", memberInputChild, `<Child {...{item:{get value(){return document.title.length}}}} item={{value:1}}/>`, "unknown"},
		{"later spread overrides spread getter", memberInputChild, `<Child {...{item:{get value(){return document.title.length}}}} {...{item:{value:1}}}/>`, "unknown"},
		{"unknown spread after spread getter", memberInputChild, `<Child {...{item:{get value(){return document.title.length}}}} {...optionalInputs}/>`, "unknown"},
		{"unknown spread before spread getter", memberInputChild, `<Child {...inputs} {...{item:{get value(){return document.title.length}}}}/>`, "unknown"},
		{"effectful spread item", memberInputChild, `<Child {...{get item(){mark();return {get value(){return document.title.length}}}}}/>`, "unknown"},
		{"effectful earlier spread item", memberInputChild, `<Child {...{get item(){mark();return {value:1}}}} {...{item:{get value(){return document.title.length}}}}/>`, "unknown"},
		{"effectful spread construction", memberInputChild, `<Child {...{label:mark(),item:{get value(){return document.title.length}}}}/>`, "unknown"},
		{"spread overrides", memberInputChild, `<Child item={{get value(){return document.title.length}}} {...({item:{value:1}} as {item?:{value:number}})}/>`, "unknown"},
		{"direct overrides spread", memberInputChild, `<Child {...{item:{value:1}}} item={{get value(){return document.title.length}}}/>`, "client"},
		{"unknown spread after", memberInputChild, `<Child item={{get value(){return document.title.length}}} {...optionalInputs}/>`, "unknown"},
		{"unknown spread before", memberInputChild, `<Child {...inputs} item={{get value(){return document.title.length}}}/>`, "unknown"},
		{"effectful direct sibling", memberInputChild, `<Child item={{get value(){return document.title.length}}} label={mark()}/>`, "unknown"},
		{"effectful spread sibling", memberInputChild, `<Child item={{get value(){return document.title.length}}} {...{get label(){return mark()}}}/>`, "unknown"},
		{"spread key", memberInputChild, `<Child {...{key:'identity'}} item={{get value(){return document.title.length}}}/>`, "unknown"},
		{"key", memberInputChild, `<Child key="identity" item={{get value(){return document.title.length}}}/>`, "unknown"},
		{"same child plain", memberInputChild, `<Child item={{value:1}}/>`, "unknown"},
		{"dormant", memberInputChild, `<Child item={{value:1,get other(){return document.title.length}}}/>`, "unknown"},
		{"object spread", memberInputChild, `<Child item={{...{get value(){return document.title.length}}}}/>`, "unknown"},
		{"JSX spread", memberInputChild, `<Child {...inputs}/>`, "unknown"},
		{"mutable alias", memberInputChild, `<Child item={input}/>`, "unknown"},
		{"event only", strings.Replace(memberInputChild,
			"const cell=this.reactive(()=>props.item.value);\n return()=> <output>{cell.get()}</output>;",
			"return()=> <button onClick={()=>void props.item.value}>read</button>;", 1),
			`<Child item={{get value(){return document.title.length}}}/>`, "isomorphic"},
	} {
		t.Run(row.name, func(t *testing.T) {
			setup := "declare const inputs:{item:{value:number}},optionalInputs:{item?:{value:number}};let count=0;function mark(){count++;return 'marked';}"
			if row.name == "mutable alias" {
				setup = "let input={get value(){return document.title.length}};"
			}
			parent := "export function Parent(){"
			if strings.HasSuffix(row.name, "state capture") || row.name == "unrelated state read" {
				setup += "import type {Component} from '@exactjs/core';"
				parent = "export function Parent(this:Component<{n:number;label:string}>){this.state.n=2;this.state.label='label';"
			}
			fixture := newExecutableFixture(t, map[string]string{
				"child.tsx": row.child,
				"entry.tsx": "import {Child} from './child.js';" + setup +
					parent + "return()=> <main>" + row.composition + "</main>}",
			})
			config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"jsx":"react-jsx","jsxImportSource":"@exactjs/jsx"},"files":["child.tsx","entry.tsx"]}`
			if err := os.WriteFile(fixture.request("compile", "entry.tsx").ConfigFile, []byte(config), 0600); err != nil {
				t.Fatal(err)
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				var application string
				for _, mode := range []string{"application", "library"} {
					request := fixture.request("compile", "entry.tsx")
					request.Target, request.PackageType = target, mode
					result := NewSession().Execute(request)
					if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) || len(result.Analysis.Components) != 1 {
						t.Fatal(target, mode, result.Error, result.Diagnostics)
					}
					edges := result.Analysis.Components[0].RenderEdges
					if len(edges) != 1 || edges[0].Placement != row.want {
						t.Fatal(target, mode, edges)
					}
					if strings.HasPrefix(row.name, "effectful") && strings.Count(result.Code, "mark()") < 2 {
						t.Fatal(target, "unrelated attribute evaluation disappeared")
					}
					if row.want == "client" && strings.Contains(result.Code, "document.title") != (target == TargetClient) {
						t.Fatal(target, "authored getter entered the wrong artifact")
					}
					if mode == "application" {
						application = result.Code
					} else if result.Code != application {
						t.Fatal(target, "application and library emitted different code")
					}
				}
			}
		})
	}
}

func TestComponentMemberInputChildPortability(t *testing.T) {
	fixture := newExecutableFixture(t, map[string]string{
		"child.tsx": memberInputChild,
		"entry.tsx": `import {Child} from './child.js';
export function Parent(){return()=> <main><Child {...{item:{get value(){return document.title.length}}}}/></main>}`,
	})
	configFile := fixture.request("compile", "child.tsx").ConfigFile
	const config = `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"jsx":"react-jsx","jsxImportSource":"@exactjs/jsx"},"files":`
	for _, target := range []Target{TargetClient, TargetServer} {
		var standalone Response
		for _, files := range []string{`["child.tsx"]`, `["child.tsx","entry.tsx"]`} {
			if err := os.WriteFile(configFile, []byte(config+files+"}"), 0600); err != nil {
				t.Fatal(err)
			}
			for _, mode := range []string{"application", "library"} {
				request := fixture.request("compile", "child.tsx")
				request.Target, request.PackageType = target, mode
				result := NewSession().Execute(request)
				if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) || len(result.Analysis.Components) != 1 {
					t.Fatal(target, mode, result.Error, result.Diagnostics)
				}
				if standalone.Code == "" {
					standalone = result
				}
				if result.Code != standalone.Code || result.Analysis.Components[0].ID != standalone.Analysis.Components[0].ID ||
					result.Analysis.Components[0].Placement != standalone.Analysis.Components[0].Placement {
					t.Fatal(target, mode, "the caller changed the child's implementation or identity")
				}
			}
		}
	}
}
