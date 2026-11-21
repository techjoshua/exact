package exactcompiler

import (
	"strings"
	"testing"
)

func TestPartitionPortableEventsRemainAvailableInBothArtifacts(t *testing.T) {
	source := `const target=new EventTarget();export function dispatch(){const event=new Event('probe');target.dispatchEvent(event);return event.type;}export function width(){return window.innerWidth;}`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/events.ts", Target: target, Source: source})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("portable events rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if !strings.Contains(response.Code, "export function dispatch") {
			t.Fatalf("%s omitted a portable event primitive:\n%s", target, response.Code)
		}
		if !strings.Contains(response.Code, "export function width") {
			t.Fatalf("%s lost the browser-only control:\n%s", target, response.Code)
		}
		for _, c := range response.Analysis.Callables {
			if c.Name == "dispatch" && c.Effect != "neutral" {
				t.Fatalf("portable receiver classified %s", c.Effect)
			}
		}
	}
}

func TestPartitionAvailabilityGuardsKeepUniversalExports(t *testing.T) {
	source := `export function guarded(){return typeof window==='undefined'?0:window.innerWidth;}export const guardedValue=typeof window==='undefined'?0:window.innerWidth;export function unguarded(value=window.innerWidth){return value;}`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/guards.ts", Target: target, Source: source})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("availability guard rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if !strings.Contains(response.Code, "export function guarded") || !strings.Contains(response.Code, "guardedValue") {
			t.Fatalf("%s removed a guarded universal export:\n%s", target, response.Code)
		}
		if !strings.Contains(response.Code, "export function unguarded") {
			t.Fatalf("%s lost unguarded default placement:\n%s", target, response.Code)
		}
	}
}

// A task supplies the placement consumer for the selected method declaration.
// Fresh dispatch is listener-free. A structural receiver with an unavailable
// implementation and a DOM-specific method retain their distinct requirements.
func TestPartitionPortableEventTypeViews(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, row := range []struct{ name, setup, expected string }{
		{"Event", "const e:Readonly<Event>=new Event('p');void e.composedPath()", ""},
		{"EventTarget", "const target:EventTarget=new EventTarget();target.dispatchEvent(new Event('p'))", ""},
		{"alias", "const target:Readonly<Shared>=new EventTarget();target.dispatchEvent(new Event('p'))", ""},
		{"pick", "const target:Pick<EventTarget,'dispatchEvent'>=new EventTarget();target.dispatchEvent(new Event('p'))", ""},
		{"button", "function focus(target:Readonly<HTMLButtonElement>){target.focus()}focus(props.button)", "browser"},
		{"structural", "props.local.dispatchEvent(new Event('p'))", "opaque"},
		{"option getter", "new Event('p',{get bubbles(){document.title;return true}})", "browser"},
		{"unread option", "const opts={get unused(){document.title;return true},bubbles:true};new Event('p',opts)", ""},
		{"listener dispatch", "const t=new EventTarget();t.addEventListener('p',()=>{document.title});t.dispatchEvent(new Event('p'))", "browser"},
		{"object method", "const t=new EventTarget();t.addEventListener('p',{handleEvent(){document.title}});t.dispatchEvent(new Event('p'))", "browser"},
		{"object getter", "const t=new EventTarget();t.addEventListener('p',{get handleEvent(){document.title;return ()=>{}}});t.dispatchEvent(new Event('p'))", "browser"},
		{"object returned callback", "const t=new EventTarget();const h={get handleEvent(){return ()=>{document.title}}};t.addEventListener('p',h);t.dispatchEvent(new Event('p'))", "browser"},
		{"paired object accessors", "const t=new EventTarget();t.addEventListener('p',{get handleEvent(){document.title;return ()=>{}},set handleEvent(f:EventListener){}});t.dispatchEvent(new Event('p'))", "browser"},
		{"object field", "const t=new EventTarget();t.addEventListener('p',{handleEvent:()=>{document.title}});t.dispatchEvent(new Event('p'))", "browser"},
		{"object stored", "const t=new EventTarget();t.addEventListener('p',{get handleEvent(){document.title;return ()=>{}}})", "server permitted"},
		{"listener stored", "const t=new EventTarget();t.addEventListener('p',()=>{document.title})", "server permitted"},
		{"other event", "const t=new EventTarget();t.addEventListener('q',()=>{document.title});t.dispatchEvent(new Event('p'))", "server permitted"},
		{"removed listener", "const t=new EventTarget();function read(){document.title};t.addEventListener('p',read);t.removeEventListener('p',read);t.dispatchEvent(new Event('p'))", "server permitted"},
		{"capture mismatch", "const t=new EventTarget();function read(){document.title};t.addEventListener('p',read,true);t.removeEventListener('p',read);t.dispatchEvent(new Event('p'))", "browser"},
		{"shadow", "class EventTarget {constructor(){document.title}}void new EventTarget()", "browser"},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := "import {TaskContext,type Component} from '@exactjs/core';type Shared=EventTarget;interface Local{dispatchEvent(event:Event):boolean}export function Page(this:Component<{}>,props:{button:HTMLButtonElement,local:Local}){function run(task:TaskContext=TaskContext.normal()){" + row.setup + "}return()=> <button onClick={()=>run()}>run</button>}"
			if row.expected == "browser" || row.expected == "server permitted" {
				source = strings.Replace(source, "TaskContext.normal()", "TaskContext.server()", 1)
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				r := formsCompileSource(t, root, config, source, target)
				if row.expected == "" || row.expected == "server permitted" {
					if r.Code == "" || hasErrorDiagnostic(r.Diagnostics) {
						t.Fatalf("%s: %v", target, formsDiagnosticDetails(r.Diagnostics))
					}
					if len(r.Analysis.Tasks) != 1 || row.expected == "" && r.Analysis.Tasks[0].EnvironmentEffect != "neutral" {
						t.Fatalf("%s: %v", target, r.Analysis.Tasks)
					}
					continue
				}
				rejected := false
				for _, diagnostic := range r.Diagnostics {
					if diagnostic.Severity == "error" {
						if diagnostic.Code != "EXACT2001" || !strings.Contains(diagnostic.Message, row.expected) {
							t.Fatalf("%s: %v", target, diagnostic)
						}
						rejected = true
					}
				}
				if !rejected || r.Code != "" {
					t.Fatalf("%s: expected %s placement diagnostic: %v", target, row.expected, r.Diagnostics)
				}
			}
		})
	}
}
