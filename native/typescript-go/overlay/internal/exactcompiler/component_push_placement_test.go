package exactcompiler_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/exactcompiler"
)

func TestComponentPushPlacement(t *testing.T) {
	const empty = "const history:{box:{l:number}}[]=[];"
	const once = "history.push({box:make(flag)});"
	const loop = "for(const branch of [flag,!flag]){const box=make(branch);history.push({box})}"
	const alias = "const alias=history[0];"
	for _, c := range []struct {
		name, appendSource, selection, later, read string
		browser                                    bool
	}{
		{"one", once, "alias.box", "", "box.l", true},
		{"repeated factory", loop, "alias.box", "", "box.l", true},
		{"first", loop, "history[0].box", "", "box.l", true},
		{"second", loop, "history[1].box", "", "box.l", false},
		{"separate arrays and creators", once + "const other:{box:{l:number}}[]=[];other.push({box:make(!flag)});", "other[0].box", "", "box.l", false},
		{"wrapper field replaced", once, "alias.box", "alias.box=make(!flag);", "box.l", false},
		{"dormant", loop, "alias.box", "", "0", false},
		{"slot replaced after capture", once, "alias.box", "history[0]={box:make(!flag)};", "box.l", true},
		{"later array alias", once, "alias.box", "const other=history;other[0]={box:make(!flag)};", "box.l", true},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `import {TaskContext,type Component} from '@exactjs/core';
function parse(s:string){return s.length}
function make(flag:boolean){if(flag)return {l:1};return {l:2}}
function compute(value:string|number,flag:boolean){
 const parsed=typeof value==='string'?parse(value):value;
 ` + empty + c.appendSource + alias + "const box=" + c.selection + ";" + c.later + `
 function install(wrapper:typeof alias){Object.defineProperty(wrapper.box,'l',{get(){document.title='getter';return parsed}})}
 const invoke=(f:()=>void)=>f();invoke(()=>install(alias));return ` + c.read + `;
}
export function Page(this:Component<{count:number}>,props:{flag:boolean,value:string|number}){
 this.state.count=0;const run=(task:TaskContext=TaskContext.server())=>{this.state.count=compute(props.value,props.flag)};
 return ()=> <button onClick={()=>run()}>{this.state.count}</button>;
}`
			id, err := filepath.Abs("task-push-placement.tsx")
			if err != nil {
				t.Fatal(err)
			}
			r := exactcompiler.NewSession().Execute(exactcompiler.Request{Kind: "compile", ID: id, Source: source, Target: exactcompiler.TargetServer, Diagnostics: "semantic"})
			found := false
			for _, d := range r.Diagnostics {
				if d.Code == "EXACT2001" && strings.Contains(d.Message, "document") {
					found = true
				} else if d.Severity == "error" {
					t.Fatal(d)
				}
			}
			if r.Error != "" || found != c.browser || (r.Code == "") != c.browser {
				t.Fatalf("emitted=%v, error=%q, diagnostics=%v", r.Code != "", r.Error, r.Diagnostics)
			}
		})
	}
}

// A pushed getter stays dormant if an authored method discards the argument,
// or a previously populated array supplies an earlier element.
func TestComponentPushReceiverPlacement(t *testing.T) {
	for _, setup := range []string{
		"const xs=input;",
		"const xs:{l:number}[]=[];const alias=xs;alias.push=()=>{xs[0]={l:4};return 1};",
	} {
		source := `import {TaskContext,type Component} from '@exactjs/core';
function compute(input:{l:number}[]){` + setup + `
 xs.push({get l(){return document.title.length}});return xs[0].l;
}
export function Page(this:Component<{count:number}>){
 this.state.count=0;const run=(task:TaskContext=TaskContext.server())=>{this.state.count=compute([{l:4}])};
 return ()=> <button onClick={()=>run()}>{this.state.count}</button>;
}`
		id, err := filepath.Abs("task-push-receiver.tsx")
		if err != nil {
			t.Fatal(err)
		}
		r := exactcompiler.NewSession().Execute(exactcompiler.Request{Kind: "compile", ID: id, Source: source, Target: exactcompiler.TargetServer, Diagnostics: "semantic"})
		if r.Error != "" || r.Code == "" {
			t.Fatal(setup, r.Error, r.Diagnostics)
		}
	}
}
