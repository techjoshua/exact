package exactcompiler

import "testing"

// Construction selection conserves body and field donors beside independent
// allocation uncertainty. A class declaration and expression share this contract.
func TestSourceConstructorDependencies(t *testing.T) {
	for _, test := range []struct {
		name, source         string
		browser, constructor bool
	}{
		{"declaration", `class C{constructor(){document.title}}export function run(){new C()}`, true, true},
		{"expression", `const C=class{constructor(){document.title}};export function run(){new C()}`, true, true},
		{"safe", `class C{constructor(){}}export function run(){new C()}`, false, true},
		{"field", `class C{value=document.title}export function run(){new C()}`, true, false},
		{"base", `class Base{constructor(){document.title}}class C extends Base{}export function run(){new C()}`, true, true},
		{"base field", `class Base{value=document.title}class C extends Base{}export function run(){new C()}`, true, false},
		{"overload body", `class C{constructor(value:string);constructor(value?:string){document.title}}export function run(){new C('safe')}`, true, true},
		{"unknown alternative", `class C{constructor(){document.title}}declare const choose:boolean;declare const Other:typeof C;const Pick=choose?C:Other;export function run(){new Pick()}`, true, true},
		{"function constructor", `const C:any=function(){document.title};export function run(){new C()}`, true, true},
		{"recursive fields", `class C{self:C=new C();value=document.title}export function run(){new C()}`, true, false},
		{"definition key", `class C{[document.title]='safe'}export function run(){new C()}`, false, false},
		{"deferred field", `class C{value=()=>document.title;static immediate='safe'}export function run(){new C()}`, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			id := "/virtual/constructor-dependency.ts"
			if test.name == "definition key" {
				id = "/virtual/constructor-dependency.js"
			}
			response := NewSession().Execute(Request{Kind: "analyze", ID: id, Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			assertConstructorDependencies(t, response, test.browser, test.constructor)
		})
	}
}

func assertConstructorDependencies(t *testing.T, response Response, browser, constructor bool) {
	t.Helper()
	for _, fact := range response.Analysis.Callables {
		if fact.Name != "run" {
			continue
		}
		known, unknown := false, false
		for _, effect := range fact.EffectSources {
			known = known || effect.Environment == "browser"
			unknown = unknown || effect.Environment == "unknown"
		}
		if known != browser || !unknown {
			t.Fatalf("browser=%v unknown=%v sources=%#v", known, unknown, fact.EffectSources)
		}
		if constructor && len(fact.Calls) == 0 {
			t.Fatal("lost selected constructor edge")
		}
		return
	}
	t.Fatal("missing run callable")
}

// Selected executable bodies, including their absence of browser effects, take
// precedence over the type provider's constructor implementation.
func TestSourceConstructorSelectedBody(t *testing.T) {
	for _, browser := range []bool{false, true} {
		t.Run(map[bool]string{false: "selected safe", true: "selected browser"}[browser], func(t *testing.T) {
			typed, selected := `document.title`, ``
			if browser {
				typed, selected = selected, typed
			}
			fixture := newExecutableFixture(t, map[string]string{
				"entry.ts":  `import {C} from './helper.js';export function run(){new C()}`,
				"helper.ts": `export class C{constructor(){` + typed + `}}`,
				"helper.js": `export class C{constructor(){` + selected + `}}`,
			})
			if r := fixture.synchronize([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}); r.Error != "" {
				t.Fatal(r.Error)
			}
			response := fixture.session.Execute(fixture.request("analyze", "entry.ts"))
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			assertConstructorDependencies(t, response, browser, true)
		})
	}
}
