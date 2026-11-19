package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A direct primitive input does not decide the returned object's property
// effects. The server task must still honor the original later member read.
func TestComponentScalarCallEffects(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		name, helper string
		browser      bool
	}{
		{"data", "return {value: text};", false},
		{"returned-getter", "return {get value(){return document.title + text;}};", true},
		{"executed-helper", "void browserTitle(); return {value:text};", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {TaskContext, type Component} from "@exactjs/core";
function browserTitle(){return document.title;}
function parse(text:string){` + row.helper + `}
function read(value:string|number){const fromInput=typeof value==="string"?parse(value):{value:""};return fromInput.value;}
export function Page(this:Component<{label:string}>,props:{input:string}){
	this.state.label="";
	const run=(task:TaskContext=TaskContext.server())=>{this.state.label=read(props.input);};
	return ()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
			r := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "scalar-call-page.tsx"), ConfigFile: timeSemanticConfig(t), Source: source, Target: TargetServer, Diagnostics: "semantic"})
			if r.Error != "" || len(r.Analysis.Tasks) != 1 || r.Analysis.Tasks[0].BrowserEffects != row.browser {
				t.Fatalf("server task browser effects: %s %#v %#v", r.Error, r.Analysis.Tasks, r.Diagnostics)
			}
			if !row.browser {
				if r.Code == "" || hasErrorDiagnostic(r.Diagnostics) || r.Analysis.Tasks[0].Placement != "server" {
					t.Fatalf("ordinary data did not compile for the server: %#v", r.Diagnostics)
				}
				return
			}
			for _, diagnostic := range r.Diagnostics {
				if r.Code == "" && r.SourceMap == nil && diagnostic.Severity == "error" && strings.Contains(diagnostic.Message, "task requests server placement but references browser-only globals") {
					return
				}
			}
			t.Fatalf("missing server refusal for browser work: %#v", r.Diagnostics)
		})
	}
}

// A callback selected through a mutable module binding belongs to the portable
// caller summary as well as the component task that ultimately invokes it.
func TestComponentCallRetainsReassignedHelperEffects(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	source := `import {TaskContext, type Component} from "@exactjs/core";
let selected = (value:string)=>value;
function browser(value:string){return document.title + value;}
function read(value:string){return selected(value);}
function parse(value:string){return {value:read(value)};}
function select(value:string|number, fallback="none"){
	selected=browser;
	const parsed=typeof value==="string"?parse(value):{value:fallback};
	return parsed.value;
}
export function Page(this:Component<{label:string,input:string|number}>,props:{input:string|number}){
	this.state.label=""; this.state.input=props.input;
	const run=(task:TaskContext=TaskContext.server())=>{this.state.label=select(this.state.input);};
	return ()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
	result := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "reassigned-call-page.tsx"), ConfigFile: timeSemanticConfig(t), Source: source, Target: TargetServer, Diagnostics: "semantic"})
	if result.Error != "" || result.Code != "" || !hasErrorDiagnostic(result.Diagnostics) {
		t.Fatalf("expected server-placement refusal, got %s %#v", result.Error, result.Diagnostics)
	}
	for _, callable := range result.Analysis.Callables {
		if callable.Name != "select" {
			continue
		}
		browser, unknown := false, false
		for _, source := range callable.EffectSources {
			browser = browser || source.Environment == "browser" && source.Description == "document"
			unknown = unknown || source.Environment == "unknown"
		}
		if browser && unknown {
			return
		}
		t.Fatalf("select lost a possible callback: %#v", callable.EffectSources)
	}
	t.Fatal("missing select summary")
}
