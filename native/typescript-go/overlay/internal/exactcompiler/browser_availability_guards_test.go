package exactcompiler

import (
	"strings"
	"testing"
)

func TestBrowserAvailabilityAfterTerminalGuard(t *testing.T) {
	cases := []struct {
		name     string
		body     string
		portable bool
	}{
		{"unrecognized conditional", `return Date.now() ? window.location.href : "server";`, false},
		{"conditional absent alternative", `return typeof window !== "undefined" ? "server" : window.location.href;`, false},
		{"if absent then with else", `if(typeof window === "undefined") return window.location.href; else return "server";`, false},
		{"if available then with unsafe else", `if(typeof window !== "undefined") return "server"; else return window.location.href;`, false},
		{"nonliteral guard", `if(typeof window === undefined) return; return window.location.href;`, false},
		{"member typeof guard", `if(typeof window.location === "undefined") return; return window.location.href;`, false},
		{"nonterminal nested then", `if(typeof window === "undefined") {if(Date.now()){}else return;}return window.location.href;`, false},
		{"preceding declaration", `const value=1;if(typeof window === "undefined") return value; return window.location.href;`, true},
		{"parenthesized guard", `if((typeof (window)) == ("undefined")) return; return window.location.href;`, true},
		{"conditional available", `return typeof window !== "undefined" ? window.location.href : "server";`, true},
		{"conditional unavailable", `return typeof window === "undefined" ? window.location.href : "server";`, false},
		{"if unavailable read", `if(typeof window === "undefined") return window.location.href; return "server";`, false},
		{"unknown guarded read", `if(Date.now()) return window.location.href; return "server";`, false},
		{"binary left read", `return window.location.href && (typeof window !== "undefined");`, false},
		{"unrecognized short circuit", `return Date.now() && window.location.href;`, false},
		{"wrong short circuit", `return typeof window === "undefined" && window.location.href;`, false},
		{"wrong disjunction", `return typeof window !== "undefined" || window.location.href;`, false},
		{"nonlogical operator", `return (typeof window === "undefined") == window.location.href;`, false},
		{"return", `if(typeof window === "undefined") return "server"; return window.location.href;`, true},
		{"loose reversed", `if("undefined" == (typeof window)) return; return window.location.href;`, true},
		{"block", `if(typeof window === "undefined") { const value=1; return value; } return window.location.href;`, true},
		{"throw", `if(typeof window === "undefined") throw new Error("absent"); return window.location.href;`, true},
		{"else", `if(typeof window !== "undefined") {} else return; return window.location.href;`, true},
		{"both nested exits", `if(typeof window === "undefined") { if(Date.now()) return; else throw new Error("absent"); } return window.location.href;`, true},
		{"nested block", `if(typeof window === "undefined") return; { return window.location.href; }`, true},
		{"empty branch", `if(typeof window === "undefined") {} return window.location.href;`, false},
		{"available exit", `if(typeof window !== "undefined") return; return window.location.href;`, false},
		{"partial nested exit", `if(typeof window === "undefined") { if(Date.now()) return; } return window.location.href;`, false},
		{"nested callable", `if(typeof window === "undefined") { function stop(){return;} } return window.location.href;`, false},
		{"loop", `if(typeof window === "undefined") { while(false) return; } return window.location.href;`, false},
		{"late guard", `const value=window.location.href; if(typeof window === "undefined") return; return value;`, false},
		{"different global", `if(typeof navigator === "undefined") return; return window.location.href;`, false},
		{"unknown predicate", `if(Date.now()) return; return window.location.href;`, false},
		{"nonavailability comparison", `if(typeof window === "object") return; return window.location.href;`, false},
	}
	for _, scenario := range cases {
		t.Run(scenario.name, func(t *testing.T) {
			source := `function read(){` + scenario.body + `} export function Page(){const value=read();return()=> <p>{value ? "ready" : "empty"}</p>;}`
			response := NewSession().Execute(Request{
				ID: "availability-guard.tsx", Kind: "analyze",
				Source: source,
			})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			callable := findCallable(t, response.Analysis.Callables, "read")
			want := "browser"
			placement := "client"
			if scenario.portable {
				want = "neutral"
				placement = "isomorphic"
			}
			if callable.Effect != want {
				t.Fatalf("effect %s, want %s: %#v", callable.Effect, want, callable.EffectSources)
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				compiled := NewSession().Execute(Request{ID: "availability-guard.tsx", Kind: "compile", Target: target, Source: source})
				if compiled.Error != "" || !strings.Contains(compiled.Code, "Page") {
					t.Fatalf("missing %s projection: %s\n%s", target, compiled.Error, compiled.Code)
				}
			}
			if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != placement {
				t.Fatalf("component placement must follow the guarded helper: %#v", response.Analysis.Components)
			}
		})
	}
}

func TestBrowserAvailabilityModuleTerminalGuard(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		source := `if(typeof window === "undefined") throw new Error("absent");export const href=window.location.href;`
		response := NewSession().Execute(Request{ID: "module-availability.ts", Kind: "compile", Target: target, Source: source})
		if response.Error != "" || !strings.Contains(response.Code, "href") || !strings.Contains(response.Code, "absent") {
			t.Fatalf("%s lost authored module guard or value: %s\n%s", target, response.Error, response.Code)
		}
	}
}

func TestBrowserAvailabilityUnguardedModule(t *testing.T) {
	response := NewSession().Execute(Request{ID: "module-unavailable.ts", Kind: "compile", Target: TargetServer, Source: `export const href=window.location.href;`})
	if response.Error != "" || strings.Contains(response.Code, "window.location") {
		t.Fatalf("unguarded module read entered the server artifact: %s\n%s", response.Error, response.Code)
	}
}
