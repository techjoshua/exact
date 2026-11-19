package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Descriptor retrieval stores the callback. Its browser effect belongs to a
// task only if an actual invocation consumes the stored value.
func TestComponentInvokesStoredDescriptorCallback(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	const source = `import {TaskContext,type Component} from '@exactjs/core';
function read(){return document.title;}
function select(source:string){
	const capture={read};
	const target={value:()=>capture.read()+source};
	const descriptor=Object.getOwnPropertyDescriptor(target,'value');
	return BODY;
}
export function Page(this:Component<{label:string,input:string}>,props:{input:string}){
	this.state.label='';this.state.input=props.input;
	const run=(task:TaskContext=TaskContext.server())=>{this.state.label=select(this.state.input)};
	return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
	for _, row := range []struct {
		name, body string
		invoked    bool
	}{
		{"stored", "descriptor ? source : ''", false},
		{"invoked", "descriptor?.value() ?? source", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, ID: filepath.Join(root, "stored-descriptor.tsx"), Source: strings.Replace(source, "BODY", row.body, 1), ConfigFile: timeSemanticConfig(t), Diagnostics: "semantic"})
			assertComponentCallbackPolicy(t, r, row.invoked)
			for _, summary := range r.Analysis.Callables {
				if summary.Name != "select" {
					continue
				}
				browser := false
				for _, effect := range summary.EffectSources {
					browser = browser || effect.Environment == "browser" && effect.Description == "document"
				}
				if browser != row.invoked {
					t.Fatalf("select browser donor: %#v", summary.EffectSources)
				}
				return
			}
			t.Fatal("missing select callable")
		})
	}
}
