package exactcompiler

import (
	"strings"
	"testing"
)

// Setup placement follows reachable browser calls on both compilation targets.
func TestBooleanConditionalSetupPlacement(t *testing.T) {
	for _, tc := range []struct{ expression, placement string }{
		{"false ? fallback() : 'ready'", "isomorphic"},
		{"true ? 'ready' : fallback()", "isomorphic"},
		{"true ? fallback() : 'ready'", "client"},
		{"false ? 'ready' : fallback()", "client"},
		{"props.enabled ? fallback() : 'ready'", "client"},
		{"fallback() ? 'yes' : 'no'", "client"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := "function fallback(){return document.title} export function Page(props:{enabled:boolean}){const title=" + tc.expression + ";return ()=><output>{title}</output>}"
			response := NewSession().Execute(Request{Kind: "compile", ID: "conditional.tsx", Target: target, Source: source, ServerComponents: true})
			if response.Error != "" || len(response.Diagnostics) != 0 || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != tc.placement {
				t.Fatalf("%s target=%s want %s: %s %#v %#v", tc.expression, target, tc.placement, response.Error, response.Diagnostics, response.Analysis.Components)
			}
		}
	}
}

func TestBooleanConditionalServerModuleBinding(t *testing.T) {
	for _, tc := range []struct{ expression, placement string }{
		{"false ? browserTitle : 'ready'", "isomorphic"},
		{"true ? 'ready' : browserTitle", "isomorphic"},
		{"true ? browserTitle : 'ready'", "client"},
		{"false ? 'ready' : browserTitle", "client"},
		{"props.enabled ? browserTitle : 'ready'", "client"},
	} {
		source := "const browserTitle=document.title; export function Page(props:{enabled:boolean}){const title:string=" + tc.expression + ";return ()=><output>{title}</output>}"
		response := NewSession().Execute(Request{Kind: "compile", ID: "conditional.tsx", Diagnostics: "semantic", Target: TargetServer, Source: source, ServerComponents: true})
		if response.Error != "" || len(response.Diagnostics) != 0 || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != tc.placement || strings.Contains(response.Code, "document.title") {
			t.Fatalf("%s: %s %#v %#v\n%s", tc.expression, response.Error, response.Diagnostics, response.Analysis.Components, response.Code)
		}
	}
}

func TestBooleanConditionalOverloadInference(t *testing.T) {
	const overload = "function pick(v:string):1; function pick(v:string|number):2; function pick(v:string|number):1|2{return typeof v==='string'?1:2} "
	for _, tc := range []struct{ module, expression string }{
		{"", "true?'yes':0"},
		{"const browserWidth=document.title.length;", "true?'yes':browserWidth"},
		{"const browserWidth=document.title.length;", "false?browserWidth:'yes'"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := tc.module + overload + "export function Page(){const v=" + tc.expression + ";const tag:2=pick(v);return ()=><output>{tag}</output>}"
			r := NewSession().Execute(Request{Kind: "compile", ID: "conditional.tsx", Diagnostics: "semantic", Target: target, Source: source, ServerComponents: true})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != "isomorphic" || target == TargetServer && strings.Contains(r.Code, "document.title") {
				t.Fatalf("%s %s: %s %#v\n%s", target, tc.expression, r.Error, r.Diagnostics, r.Code)
			}
		}
	}
}

// Dormant shorthand references retain the module binding's type without running its initializer.
func TestBooleanConditionalShorthandModuleBinding(t *testing.T) {
	for _, tc := range []struct{ name, expression, sibling string }{
		{"property value", "({browserWidth}).browserWidth", ""},
		{"assignment default", "({x=browserWidth}={x:0}).x", ""},
		{"assignment default with exported sibling", "({x=browserWidth}={x:0}).x", ", neutral=7"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source := "export const browserWidth=document.title.length" + tc.sibling + "; export function Page(){let x=0; const title=false?" + tc.expression + ":1;return ()=><output>{title}</output>}"
			r := NewSession().Execute(Request{Kind: "compile", ID: "conditional.tsx", Diagnostics: "semantic", Target: TargetServer, Source: source, ServerComponents: true})
			if r.Error != "" || len(r.Diagnostics) != 0 || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != "isomorphic" || strings.Contains(r.Code, "document.title") || !strings.Contains(r.Code, "declare const browserWidth: number") {
				t.Fatalf("%s: %s %#v %#v\n%s", tc.expression, r.Error, r.Diagnostics, r.Analysis.Components, r.Code)
			}
			if strings.Contains(r.Code, "export declare const browserWidth") || tc.sibling != "" && !strings.Contains(r.Code, "export const neutral = 7") {
				t.Fatalf("unexpected server exports:\n%s", r.Code)
			}
		})
	}
}

// A dormant browser read is type-checked without constraining server execution.
func TestBooleanConditionalServerBoundary(t *testing.T) {
	for _, tc := range []struct {
		name, body, placement, diagnostic string
	}{
		{"documented setup", "const title = false ? document.title : \"ready\"; return () => <output>{title}</output>", "isomorphic", ""},
		{"other dormant arm", "return () => <output>{true ? 'ready' : document.title}</output>", "isomorphic", ""},
		{"local helper", "function title(){return false ? document.title : 'ready'} return () => <output>{title()}</output>", "isomorphic", ""},
		{"live read", "return () => <output>{true ? document.title : 'ready'}</output>", "client", ""},
		{"dynamic condition", "return () => <output>{props.enabled ? document.title : 'ready'}</output>", "client", ""},
		{"effectful condition", "return () => <output>{(document.title,false) ? 'unused' : 'ready'}</output>", "client", ""},
		{"type error in dormant arm", "return () => <output>{false ? document.typo : 'ready'}</output>", "isomorphic", "TS2339"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source := "export function Page(props:{enabled:boolean}){" + tc.body + "}"
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", ID: "conditional-boundary.tsx", Diagnostics: "semantic", Target: target, Source: source, ServerComponents: true})
				if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != tc.placement {
					t.Fatalf("%s: %s %#v %#v", target, r.Error, r.Diagnostics, r.Analysis.Components)
				}
				if tc.diagnostic != "" {
					if len(r.Diagnostics) != 1 || r.Diagnostics[0].Code != tc.diagnostic {
						t.Fatalf("%s: want %s, got %#v", target, tc.diagnostic, r.Diagnostics)
					}
					continue
				}
				if len(r.Diagnostics) != 0 || r.Code == "" {
					t.Fatalf("%s: %#v\n%s", target, r.Diagnostics, r.Code)
				}
				if target == TargetServer && tc.placement == "client" && (!strings.Contains(r.Code, "createServerBoundaryReceipt") || strings.Contains(r.Code, "document.title")) {
					t.Fatalf("expected a server boundary for the browser read:\n%s", r.Code)
				}
			}
		})
	}

	t.Run("live read rejected in server component", func(t *testing.T) {
		source := "/** @exact server */\nexport function Page(){const title=true ? document.title : 'ready';return ()=><output>{title}</output>}"
		r := NewSession().Execute(Request{Kind: "compile", ID: "conditional-boundary.tsx", Diagnostics: "semantic", Target: TargetServer, Source: source, ServerComponents: true})
		for _, diagnostic := range r.Diagnostics {
			if diagnostic.Code == "EXACT2211" && r.Code == "" && r.Error == "" {
				return
			}
		}
		t.Fatalf("expected a server boundary diagnostic: %s %#v\n%s", r.Error, r.Diagnostics, r.Code)
	})
}
