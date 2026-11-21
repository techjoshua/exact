package exactcompiler

import "testing"

// A server task may store a browser function. Calling the value acquired by
// its binding pattern requires the browser, even if the original slot changed.
func TestLocalPatternTaskEffects(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, row := range []struct {
		name, body string
		refused    bool
	}{
		{"stored", "const {fn}={fn:browser};void fn", false},
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
