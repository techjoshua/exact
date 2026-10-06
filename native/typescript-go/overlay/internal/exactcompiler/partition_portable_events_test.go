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
		if strings.Contains(response.Code, "export function width") != (target == TargetClient) {
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
		if strings.Contains(response.Code, "export function unguarded") != (target == TargetClient) {
			t.Fatalf("%s lost unguarded default placement:\n%s", target, response.Code)
		}
	}
}

func TestPartitionPortableEventTypeViews(t *testing.T) {
	for _, view := range []string{"EventTarget", "Shared", "Readonly<EventTarget>", "Readonly<Shared>", "Pick<EventTarget,'dispatchEvent'>", "Readonly<Event>", "Readonly<HTMLElement>", "HTMLButtonElement", "Readonly<HTMLButtonElement>", "ButtonAlias", "Readonly<ButtonAlias>", "Readonly<LocalEventTarget>"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := `type ButtonAlias=HTMLButtonElement;type Shared=EventTarget; interface LocalEventTarget { dispatchEvent(event:Event):boolean; } export function dispatch(target:` + view + `){return `
			if view == "Readonly<Event>" {
				source += `target.composedPath();}`
			} else if strings.Contains(view, "HTMLButtonElement") || strings.Contains(view, "ButtonAlias") || view == "Readonly<HTMLElement>" {
				source += `target.focus();}`
			} else {
				source += `target.dispatchEvent(new Event('probe'));}`
			}
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/event-views.ts", Target: target, Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("%s rejected: %s %#v", view, response.Error, response.Diagnostics)
			}
			portable := !strings.Contains(view, "HTMLButtonElement") && !strings.Contains(view, "ButtonAlias") && view != "Readonly<HTMLElement>"
			if strings.Contains(response.Code, "export function dispatch") != (portable || target == TargetClient) {
				t.Fatalf("%s %s lost placement:\n%s", target, view, response.Code)
			}
			want := "neutral"
			if view == "Readonly<LocalEventTarget>" {
				want = "unknown"
			}
			if !portable {
				want = "browser"
			}
			if response.Analysis.Callables[0].Effect != want {
				t.Fatalf("%s effect %s, want %s", view, response.Analysis.Callables[0].Effect, want)
			}
		}
	}
}
