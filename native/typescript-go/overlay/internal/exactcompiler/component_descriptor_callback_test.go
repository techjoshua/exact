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
	const target={value:()=>INITIAL}; BEFORE
	const descriptor=Object.getOwnPropertyDescriptor(target,'value'); AFTER
	return BODY;
}
export function Page(this:Component<{label:string,input:string}>,props:{input:string}){
	this.state.label='';this.state.input=props.input;
	const run=(task:TaskContext=TaskContext.server())=>{this.state.label=select(this.state.input)};
	return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
	for _, row := range []struct {
		name, initial, before, after, body string
		invoked                            bool
	}{
		{"stored", "capture.read()+source", "", "", "descriptor ? source : ''", false},
		{"invoked", "capture.read()+source", "", "", "descriptor?.value() ?? source", true},
		{"alias", "capture.read()+source", "", "const alias=descriptor;", "alias?.value?.() ?? source", true},
		{"replacement-browser", "source", "target.value=()=>capture.read()+source;", "", "descriptor?.value() ?? source", true},
		{"replacement-neutral", "capture.read()+source", "target.value=()=>source;", "", "descriptor?.value() ?? source", false},
		{"snapshot-before-replacement", "capture.read()+source", "", "target.value=()=>source;", "descriptor?.value() ?? source", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, ID: filepath.Join(root, "stored-descriptor.tsx"), Source: strings.NewReplacer("INITIAL", row.initial, "BEFORE", row.before, "AFTER", row.after, "BODY", row.body).Replace(source), ConfigFile: timeSemanticConfig(t), Diagnostics: "semantic"})
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

// A helper may change a callback before the descriptor is read. The component
// later reads a returned getter that can invoke the captured callback.
func TestComponentReadsDescriptorAfterHelperCall(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	const fixture = `import { TaskContext, type Component } from '@exactjs/core';
function replace(target: {value: () => string}, enabled: boolean) { CHANGE }
function select(input: string) {
	const target = {value: () => INITIAL};
	replace(target, ENABLED);
	const descriptor = Object.getOwnPropertyDescriptor(target, 'value');
	return {get label() {return RESULT}};
}
export function Page(this: Component<{input:string,label:string}>, props: {input:string}) {
	this.state.input = props.input;
	this.state.label = '';
	const run = (task: TaskContext = TaskContext.server()) => {
		this.state.label = select(this.state.input).label;
	};
	return () => <button onClick={() => run()}>{this.state.label}</button>;
}`
	const invoke = "descriptor?.value?.() ?? input"
	for _, row := range []struct {
		name, change, initial, enabled, result string
		browser                                bool
	}{
		{"observer", "", "document.title", "true", invoke, true},
		{"portable-replacement", "target.value=()=>''", "document.title", "true", invoke, false},
		{"browser-replacement", "target.value=()=>document.title", "input", "true", invoke, true},
		{"uncertain-write", "if(enabled)target.value=()=>''", "document.title", "input.length>0", invoke, true},
		{"skipped-write", "if(enabled)target.value=()=>document.title", "input", "false", invoke, false},
		{"stored-only", "", "document.title", "true", "descriptor ? input : ''", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := strings.NewReplacer("CHANGE", row.change, "INITIAL", row.initial, "ENABLED", row.enabled, "RESULT", row.result).Replace(fixture)
			r := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, ID: filepath.Join(root, "returned-descriptor.tsx"), Source: source, ConfigFile: timeSemanticConfig(t), Diagnostics: "semantic"})
			assertComponentCallbackPolicy(t, r, row.browser)
		})
	}
}
