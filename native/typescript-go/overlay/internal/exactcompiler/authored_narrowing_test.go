package exactcompiler

import (
	"os"
	"path/filepath"
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

// A module containing JSX uses the checking projection for its ordinary guards too.
// Optional receiver guards must stay intact while moved derived values retain their types.
func TestAuthoredOptionalReadGuardProjection(t *testing.T) {
	for _, test := range []struct {
		name, source, diagnostic string
		invalid                  bool
	}{
		{"property-valid", `export function probe(input:AbortSignal|undefined,error:unknown){const signal=input;if(signal?.aborted && error===signal.reason){return <output/>;}return <output/>;}`, "TS18048", false},
		{"element-valid", `export function probe(input:AbortSignal|undefined,error:unknown){const signal=input;if(signal?.['aborted'] && error===signal.reason){return <output/>;}return <output/>;}`, "TS18048", false},
		{"property-invalid", `export function probe(input:AbortSignal|undefined,error:unknown){const signal=input;if(error===signal.reason){return <output/>;}return <output/>;}`, "TS18048", true},
		{"element-invalid", `export function probe(input:AbortSignal|undefined,error:unknown){const signal=input;if(error===signal['reason']){return <output/>;}return <output/>;}`, "TS18048", true},
		{"derived-valid", `export function Probe(props:{source?:{flag:boolean}}){const flag=props.source?.flag;return()=> <output>{flag ? flag.toString() : 'empty'}</output>;}`, "TS2339", false},
		{"derived-invalid", `export function Probe(props:{source?:{flag:boolean}}){const flag=props.source?.flag;return()=> <output>{flag ? flag.missing() : 'empty'}</output>;}`, "TS2339", true},
		{"genuine-valid", `export function probe(s:{flag:boolean|'skip'|undefined,reason:string}|undefined){if(s?.flag!=='skip' && s?.flag && s.reason){return <output>{s.reason}</output>;}return <output/>;}`, "TS18048", false},
		{"genuine-invalid", `export function probe(s:{flag:boolean|'skip'|undefined,reason:string}|undefined){if(s.flag!=='skip' && s?.flag && s.reason){return <output>{s.reason}</output>;}return <output/>;}`, "TS18048", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			dir, err := os.MkdirTemp(".", ".optional-read-proof-")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				if err := os.RemoveAll(dir); err != nil {
					t.Error(err)
				}
			})
			root, err := filepath.Abs(dir)
			if err != nil {
				t.Fatal(err)
			}
			file, config := filepath.Join(root, "probe.tsx"), filepath.Join(root, "tsconfig.json")
			for path, text := range map[string]string{file: test.source, config: `{"compilerOptions":{"strict":true,"target":"ES2022","lib":["ES2022","DOM"],"types":[],"module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","jsxImportSource":"@exactjs/jsx","skipLibCheck":true},"include":["*.tsx"]}`} {
				if err := os.WriteFile(path, []byte(text), 0600); err != nil {
					t.Fatal(err)
				}
			}
			request := Request{Kind: "compile", ID: file, Root: root, ConfigFile: config, Source: test.source, Diagnostics: "semantic"}
			check := func(response Response) {
				t.Helper()
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				// A moved getter expression reports the same unsafe receiver as TS2532.
				matches := hasDiagnosticCode(response.Diagnostics, test.diagnostic) ||
					test.diagnostic == "TS18048" && hasDiagnosticCode(response.Diagnostics, "TS2532")
				if hasErrorDiagnostic(response.Diagnostics) != test.invalid || test.invalid && !matches {
					t.Errorf("invalid=%v diagnostics=%#v", test.invalid, response.Diagnostics)
				}
			}
			qualification := NewSession().validateAuthoredJavaScript(request)
			check(qualification)
			for _, target := range []Target{TargetClient, TargetServer} {
				request.Target = target
				session := NewSession()
				synchronization := Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: file, Source: test.source}}}
				synchronized := session.Execute(synchronization)
				if synchronized.Error != "" || hasErrorDiagnostic(synchronized.Diagnostics) {
					t.Fatalf("synchronize: %s %#v", synchronized.Error, synchronized.Diagnostics)
				}
				response := session.Execute(request)
				check(response)
			}
		})
	}
}
