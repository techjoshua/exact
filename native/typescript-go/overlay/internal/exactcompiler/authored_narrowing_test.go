package exactcompiler

import (
	"strings"
	"testing"
)

// Erased source read types preserve render closure flow after direct server slots
// move beside setup defaults. Invalid authored members must still be rejected.
func TestServerRenderClosureUnionReadProof(t *testing.T) {
	for _, test := range []struct{ name, fields, initial, expression, invalid string }{
		{"date", "day:Date|null", "this.state.day=null;", "this.state.day?.toISOString()??'empty'", "this.state.day?.missing()??'empty'"},
		{"object", "item:{name:string}|null", "this.state.item=null;", "this.state.item?.name??'empty'", "this.state.item?.missing??'empty'"},
		{"element", "rows:{name:string}[]|undefined", "this.state.rows=undefined;", "this.state.rows?.[0]?.name??'empty'", "this.state.rows?.[0]?.missing??'empty'"},
		{"optional-non-null", "outer:{nested:{count:number}|undefined}|null", "this.state.outer=null;", "String(this.state.outer?.nested!.count)", "String(this.state.outer?.nested!.missing)"},
		{"optional-element", "outer:{nested:{count:number}|undefined}|null", "this.state.outer=null;", "String(this.state.outer?.[\"nested\"]![\"count\"])", "String(this.state.outer?.[\"nested\"]![\"missing\"])"},
		{"discriminant", "route:{kind:'home'}|{kind:'report';hash:string}", "this.state.route={kind:'home'};", "this.state.route.kind==='report'?this.state.route.hash:'home'", "this.state.route.kind==='home'?this.state.route.hash:'home'"},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `import type {Component} from '@exactjs/core';export function Probe(this:Component<{` + test.fields + `}>){` + test.initial + `return()=> <output>{` + test.expression + `}</output>;}`
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				kind := "compile"
				if target == TargetDefault {
					kind = "check"
				}
				for _, invalid := range []bool{false, true} {
					input := source
					if invalid {
						input = strings.Replace(source, test.expression, test.invalid, 1)
					}
					response := NewSession().Execute(Request{Kind: kind, Target: target, ID: "render-union-proof.tsx", Source: input, Diagnostics: "semantic"})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					code := "TS2339"
					if test.name == "optional-element" {
						code = "TS7053"
					}
					if hasDiagnosticCode(response.Diagnostics, code) != invalid {
						t.Fatalf("%s invalid=%v diagnostics: %#v", target, invalid, response.Diagnostics)
					}
					if !invalid {
						for _, diagnostic := range response.Diagnostics {
							if diagnostic.Severity == "error" {
								t.Fatalf("valid source rejected: %#v", response.Diagnostics)
							}
						}
					}
				}
			}
		})
	}
}
