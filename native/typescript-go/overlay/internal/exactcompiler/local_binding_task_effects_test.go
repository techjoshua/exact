package exactcompiler

import (
	"strings"
	"testing"
)

// A server task may store a browser function. Calling the value acquired by
// its binding pattern requires the browser, even if the original slot changed.
func TestLocalPatternTaskEffects(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, row := range []struct {
		name, body string
		refused    bool
	}{
		{"stored", "const {fn}={fn:browser};void fn", false},
		{"invoked", "const {fn}={fn:browser};fn()", true},
		{"renamed", "const {fn:invoke}={fn:portable};invoke()", false},
		{"original getter result", "const {fn}={get fn(){return browser}};fn()", true},
		{"acquired before overwrite", "const box={fn:browser};const {fn}=box;box.fn=portable;fn()", true},
		{"replaced before acquisition", "const box={fn:browser};box.fn=portable;const {fn}=box;fn()", false},
		{"array element", "const arr=[browser];const [fn]=arr;fn()", true},
		{"array default", "const [fn=browser]=[];fn()", true},
		{"array value before default", "const [fn=browser]=[portable];fn()", false},
		{"array default from earlier binding", "const [first,second=first]=[browser];second()", true},
		{"known and opaque", "const {fn}=flag?{fn:browser}:{fn:externalCall};fn()", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {TaskContext,type Component} from '@exactjs/core';
declare const flag:boolean;declare function externalCall():string;
function browser(){return document.title} function portable(){return 'ok'}
export function Page(this:Component<{}>){function run(task:TaskContext=TaskContext.server()){` + row.body + `}
return()=> <button onClick={()=>run()}>run</button>}`
			for _, target := range []Target{TargetClient, TargetServer} {
				result := formsCompileSource(t, root, config, source, target)
				if row.refused {
					if !containsDiagnosticCode(result.Diagnostics, "EXACT2001") || result.Code != "" {
						t.Errorf("%s accepted browser task: %v", target, formsDiagnosticDetails(result.Diagnostics))
					}
				} else if hasErrorDiagnostic(result.Diagnostics) || result.Code == "" {
					t.Errorf("%s refused portable task: %v", target, formsDiagnosticDetails(result.Diagnostics))
				}
			}
		})
	}
}

// Reading an acquired Array's own length adds no writer. A typed accessor,
// Proxy or reassigned callable can still execute authored code at the same use.
func TestLocalArrayLengthTaskEffects(t *testing.T) {
	const count = `function count(rows:{length:number}){return rows.length}`
	for _, row := range []struct {
		name, reader, input string
		browser             bool
	}{
		{"native-array", count, `[...this.state.items]`, false},
		{"get-length", count, `{get length(){return document.title.length}}`, true},
		{"proxy-length", count, `new Proxy([...this.state.items],{get(target,key,receiver){void document.title;return Reflect.get(target,key,receiver)}})`, true},
		{"replaced-reader", `let count=(rows:{length:number})=>rows.length;count=()=>document.title.length;`, `[...this.state.items]`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := row.reader + publicAwaitRequiredPage("this.state.items=[1];", `const {rows}={rows:`+row.input+`};this.state.label=String(count(rows))`, TargetServer)
			source = strings.Replace(source, "{label:string}", "{label:string;items:number[]}", 1)
			fixture := newPublicAwaitRequiredFixture(t, source)
			for _, target := range []Target{TargetClient, TargetServer} {
				request := fixture.request("compile", "entry.tsx")
				request.Target = target
				response := NewSession().Execute(request)
				if response.Error != "" || len(response.Analysis.Tasks) != 1 || (response.Code == "") != row.browser || hasErrorDiagnostic(response.Diagnostics) != row.browser {
					t.Fatal(target, response.Error, response.Diagnostics)
				}
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity == "error" && (diagnostic.Code != "EXACT2001" || !strings.Contains(diagnostic.Message, "references browser-only globals")) {
						t.Fatal(target, response.Diagnostics)
					}
				}
			}
		})
	}
}
