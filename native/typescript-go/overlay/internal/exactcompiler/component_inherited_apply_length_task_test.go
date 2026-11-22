package exactcompiler

import "testing"

// A task observes the selected length hook before its indexed reads or callback.
// A proven throw skips those effects, while a conditional throw retains them.
func TestComponentInheritedApplyLengthTask(t *testing.T) {
	const browserHook = `[Symbol.toPrimitive](){return Number(document.title.length > 0)}`
	const neutralHook = `[Symbol.toPrimitive](){return 1}`
	const throwingHook = `[Symbol.toPrimitive](){throw Error('stop')}`
	for _, adapter := range []string{"reflect", "function"} {
		for _, row := range []struct {
			name, setup, vector string
			browser             bool
		}{
			{"method", "", `{length:{__proto__:{` + browserHook + `}}}`, true},
			{"getter", "", `{length:{__proto__:{get [Symbol.toPrimitive](){void document.title;return ()=>1}}}}`, true},
			{"own-mask", "", `{length:{__proto__:{` + browserHook + `},` + neutralHook + `}}`, false},
			{"normal", "", `{get 0(){return document.title},length:{__proto__:{` + neutralHook + `}}}`, true},
			{"abrupt", "", `{get 0(){return document.title},length:{__proto__:{` + throwingHook + `}}}`, false},
			{"uncertain", `const mayStop = this.state.label === 'stop';`, `{get 0(){return document.title},length:{__proto__:{[Symbol.toPrimitive](){if(mayStop) throw Error('stop');return 1}}}}`, true},
			{"spread-may-mask", `const own = this.state.label === 'stop' ? {} : {[Symbol.toPrimitive]: () => 1};`, `{get 0(){return document.title},length:{__proto__:{` + throwingHook + `},...own}}`, true},
			{"computed-may-mask", `const key = this.state.label === 'stop' ? 'other' : Symbol.toPrimitive;`, `{get 0(){return document.title},length:{[key](){return 1},__proto__:{` + throwingHook + `}}}`, true},
			{"ordinary-prototype", "", `{length:{valueOf(){return 1}}}`, false},
			{"stored-vector", `const vector = { get 0(){return document.title}, length:{valueOf(){return 1}} };`, `vector`, true},
			{"non-final-length", "", `{length:{valueOf(){return 1}},get 0(){return document.title}}`, true},
		} {
			t.Run(adapter+"/"+row.name, func(t *testing.T) {
				args := "(" + row.vector + ") as unknown as [string]"
				call := "Reflect.apply(callback, undefined, " + args + ")"
				if adapter == "function" {
					call = "callback.apply(undefined, " + args + ")"
				}
				source := `import {type Component,TaskContext} from '@exactjs/core';
export function Page(this:Component<{label:string}>){
  this.state.label='initial';
  function show(task:TaskContext=TaskContext.server()){
    void task;
    const callback = (value: string) => value;
    ` + row.setup + `
    try { this.state.label = ` + call + `; }
    catch { this.state.label = 'stopped'; }
  }
  return ()=> <button onClick={() => show()}>{this.state.label}</button>;
}`
				fixture := newPublicAwaitRequiredFixture(t, source)
				for _, target := range []Target{TargetClient, TargetServer} {
					request := fixture.request("compile", "entry.tsx")
					request.Target = target
					response := NewSession().Execute(request)
					if response.Error != "" || len(response.Analysis.Tasks) != 1 {
						t.Fatal(target, response.Error, response.Diagnostics, response.Analysis.Tasks)
					}
					task := response.Analysis.Tasks[0]
					browser := false
					for _, effect := range task.EffectSources {
						browser = browser || effect.Environment == "browser" && effect.Description == "document"
					}
					if !task.FunctionDefined || browser != row.browser ||
						hasErrorDiagnostic(response.Diagnostics) != row.browser ||
						containsDiagnosticCode(response.Diagnostics, "EXACT2001") != row.browser ||
						(response.Code == "") != row.browser {
						for _, diagnostic := range response.Diagnostics {
							t.Log(diagnostic.Severity, diagnostic.Code, diagnostic.Message)
						}
						t.Fatalf("%s: expected document effect=%t, got %t; emitted=%t", target, row.browser, browser, response.Code != "")
					}
				}
			})
		}
	}
}
