package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestClientCallbackServerTaskTransport(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	const callback = "()=>document.title"
	for _, row := range []struct{ name, parameter, body, setup, event, rejected string }{
		{"invoked", "fn:()=>string", "fn()", "", "save(" + callback + ")", callback},
		{"unused", "fn:()=>string", "'done'", "", "save(" + callback + ")", callback},
		{"text", "text:string", "text", "", "save(document.title)", ""},
		{"named-handler", "fn:()=>string", "'done'", "const fn=()=>document.title; const click=()=>save(fn);", "click", "fn"},
		{"event-wrapper", "fn:()=>string", "'done'", "const inner=()=>save(" + callback + ");", "inner()", callback},
		{"server-local", "fn:()=>string", "fn()", "const submit=(t:TaskContext=TaskContext.server())=>save(()=>'local');", "submit()", ""},
		{"repeated", "value:string|(()=>string)", "'done'", "const click=()=>{save('ok');save(" + callback + ")};", "click", callback},
		{"reassigned-handler", "fn:()=>string", "fn()", "let click:()=>void=()=>save(" + callback + ");click=()=>{};", "click", ""},
		{"default-omitted", "fn:string|(()=>string)=" + callback, "'saved'", "", "save()", callback},
		{"default-undefined", "fn:string|(()=>string)=" + callback, "'saved'", "", "save(undefined)", callback},
		{"default-replaced", "fn:string|(()=>string)=" + callback, "'saved'", "", "save('ok')", ""},
		{"tuple-callback", "fn:()=>string", "fn()", "const args=[" + callback + "] as const;", "save(...args)", "...args"},
		{"tuple-prefix", "_:string,fn:()=>string", "fn()", "const prefix=['ok'] as const;", "save(...prefix," + callback + ")", callback},
		{"mount", "fn:()=>string", "fn()", "this.onMount(()=>{save(" + callback + ");});", "void 0", callback},
		{"named-mount", "fn:()=>string", "fn()", "const mounted=()=>{save(" + callback + ");};this.onMount(mounted);", "void 0", callback},
		{"mount-data", "text:string", "text", "this.onMount(()=>{save(document.title);});", "void 0", ""},
		{"local-helper", "text:string", "text", "const apply=(fn:()=>string)=>fn();", "save(apply(" + callback + "))", ""},
	} {
		t.Run(row.name, func(t *testing.T) {
			event := row.event
			if event != "click" {
				event = "()=>" + event
			}
			src := `import {TaskContext,type Component} from "@exactjs/core"; export function Page(this:Component<{label:string}>){this.state.label="";const save=(` + row.parameter + `,task:TaskContext=TaskContext.server())=>{this.state.label=` + row.body + `;};` + row.setup + `return()=> <button onClick={` + event + `}>{this.state.label}</button>;}`
			targets := []Target{TargetClient, TargetServer}
			if row.name == "reassigned-handler" {
				// Only the client installs this mutable DOM handler.
				targets = []Target{TargetClient}
			}
			for _, target := range targets {
				r := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "transport-page.tsx"), ConfigFile: timeSemanticConfig(t), Source: src, Target: target, Diagnostics: "semantic"})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				if row.rejected == "" {
					if r.Code == "" || hasErrorDiagnostic(r.Diagnostics) {
						t.Fatalf("%s: expected emitted code: %#v", target, r.Diagnostics)
					}
					continue
				}
				matched := false
				for _, d := range r.Diagnostics {
					if d.Code == "EXACT2001" && d.Severity == "error" && strings.Contains(d.Message, "server task argument") && src[d.Start:d.Start+d.Length] == row.rejected {
						matched = true
					}
				}
				if !matched || r.Code != "" || r.SourceMap != nil {
					t.Fatalf("%s: expected refusal at %q: %#v", target, row.rejected, r.Diagnostics)
				}
			}
		})
	}
}

// Method calls retain their receiver in server work. The transport must still
// reject an authored callback that would disappear from that receiver in JSON.
func TestCapturedPropFunctionTransport(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct{ name, body, placement, rejected string }{
		{"callback", "props.read()", "server", "props.read"},
		{"computed-callback", "props['read']()", "server", "props['read']"},
		{"callback-slot", "invoke(props.read)", "server", "props.read"},
		{"unused-sibling", "props.title", "server", ""},
		{"native-method", "props.title.trim()", "server", ""},
		{"local-callback", "props.read()", "client", ""},
	} {
		t.Run(row.name, func(t *testing.T) {
			src := `import {TaskContext,type Component} from "@exactjs/core";
function invoke(fn:()=>string){return fn()}
export function Page(this:Component<{label:string}>,props:{title:string;read:()=>string}){
 this.state.label="";const save=(task:TaskContext=TaskContext.` + row.placement + `())=>{this.state.label=` + row.body + `;};
 return()=> <button onClick={()=>save()}>{this.state.label}</button>;}`
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "task-prop-transport.tsx"), ConfigFile: timeSemanticConfig(t), Source: src, Target: target, Diagnostics: "semantic"})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				if row.rejected == "" {
					if r.Code == "" || hasErrorDiagnostic(r.Diagnostics) {
						t.Fatalf("%s: expected emitted task: %v", target, r.Diagnostics)
					}
					continue
				}
				matched := false
				for _, d := range r.Diagnostics {
					matched = matched || d.Code == "EXACT2001" && strings.Contains(d.Message, "component prop supplies a function") && src[d.Start:d.Start+d.Length] == row.rejected
				}
				if !matched || r.Code != "" || r.SourceMap != nil {
					t.Fatalf("%s: expected refusal for %s: %v", target, row.rejected, r.Diagnostics)
				}
			}
		})
	}
}
