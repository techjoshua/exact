package exactcompiler

import "testing"

// Construction leaves prototype bodies dormant. An inherited Get or Call in
// the task must contribute its effect at the use that supplies rendered state.
func TestComponentCreatedPrototypeTaskEffects(t *testing.T) {
	const getter = `({seed:'prototype',get value():string{return this.seed+window.name}} satisfies {seed:string;readonly value:string} & ThisType<{seed:string}>)`
	const method = `{seed:'prototype',value(this:{seed:string}):string{return this.seed+window.name}}`
	for _, row := range []struct {
		name, body, placement, unknown string
		browser                        bool
	}{
		{"direct-get", `this.state.label=Object.create(` + getter + `).value`, "server", "", true},
		{"frozen-get", `this.state.label=Object.freeze(Object.create(` + getter + `) as {value:string}).value`, "server", "", true},
		{"saved-frozen-get", `const created=Object.freeze(Object.create(` + getter + `) as {value:string});this.state.label=created.value`, "server", "", true},
		{"inherited-call", `this.state.label=Object.create(` + method + `).value()`, "server", "", true},
		{"saved-call", `const created: {value():string}=Object.create(` + method + `);this.state.label=created.value()`, "server", "", true},
		{"frozen-call", `this.state.label=Object.freeze(Object.create(` + method + `) as {value():string}).value()`, "server", "", true},
		{"construction-only", `this.state.label=Object.isFrozen(Object.freeze(Object.create(` + getter + `)))?'ready':'missing'`, "server", "", false},
		{"own-get-shadow", `this.state.label=Object.create(` + getter + `,{value:{value:'own'}}).value`, "server", "", false},
		{"own-call-shadow", `this.state.label=Object.create(` + method + `,{value:{value:()=>'own'}}).value()`, "server", "", false},
		{"getter-and-unknown", `this.state.label=Object.create({get value(){return window.name+foreign()}}).value`, "client", "unresolved call foreign", true},
		{"getter-with-foreign-alternative", `this.state.label=(this.state.label==='initial'?Object.create(` + getter + `):foreignBox()).value`, "client", "unresolved call foreignBox", true},
		{"method-with-foreign-alternative", `this.state.label=(this.state.label==='initial'?(Object.create(` + method + `) as {value():string}):foreignMethodBox()).value()`, "client", "unresolved call foreignMethodBox", true},
		{"method-and-unknown", `this.state.label=Object.create({value(){return window.name+foreign()}}).value()`, "client", "unresolved call foreign", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {type Component,TaskContext} from '@exactjs/core';
declare function foreign():string;
declare function foreignBox():{value:string};
declare function foreignMethodBox():{value():string};
export function Page(this:Component<{label:string}>){
  this.state.label='initial';
  function show(task:TaskContext=TaskContext.` + row.placement + `()){void task;` + row.body + `}
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
				browser, unknown := false, false
				for _, effect := range task.EffectSources {
					browser = browser || effect.Environment == "browser" && effect.Description == "window"
					unknown = unknown || effect.Environment == "unknown" && effect.Description == row.unknown
				}
				if !task.FunctionDefined || browser != row.browser || row.unknown != "" && !unknown {
					t.Fatalf("%s: unexpected task effects: %#v", target, task.EffectSources)
				}
				denied := row.browser && row.placement == "server"
				if hasErrorDiagnostic(response.Diagnostics) != denied ||
					containsDiagnosticCode(response.Diagnostics, "EXACT2001") != denied ||
					(response.Code == "") != denied {
					t.Fatal(target, response.Diagnostics)
				}
			}
		})
	}
}
