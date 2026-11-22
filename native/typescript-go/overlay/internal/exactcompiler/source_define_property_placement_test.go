package exactcompiler

import (
	"strings"
	"testing"
)

// A discarded definition can affect placement through the original argument
// evaluations or descriptor conversion, even when its target stays local.
func TestComponentTaskDiscardedPropertyDefinition(t *testing.T) {
	for _, row := range []struct {
		name, helper, policy, placement string
		browser, opaque                 bool
	}{
		{"portable", "", "latest", "isomorphic", false, false},
		{"explicit server", `Object.defineProperty({}, 'item', {value: class Foreign {}});`, "server", "server", false, false},
		{"number", `Object.defineProperty({}, 'item', {value: 2});`, "latest", "isomorphic", false, false},
		{"class", `Object.defineProperty({}, 'item', {value: class Foreign {}});`, "latest", "isomorphic", false, false},
		{"dormant value", `Object.defineProperty({}, 'item', {value: () => document.title});`, "latest", "isomorphic", false, false},
		{"static work", `Object.defineProperty({}, 'item', {value: class Foreign {static {document.title = 'static';}}});`, "latest", "client", true, false},
		{"value argument", `Object.defineProperty({}, 'item', {value: ({get title(){return document.title;}}).title});`, "latest", "client", true, false},
		{"key argument", `Object.defineProperty({}, (document.title = 'key', 'item'), {value: 2});`, "latest", "client", true, false},
		{"own descriptor getter", `Object.defineProperty({}, 'item', {get value(){return document.title;}});`, "latest", "client", true, true},
		{"standard prototype descriptor getter", `Object.defineProperty(Object.prototype, 'enumerable', {get(){document.title='prototype';return false;}}); Object.defineProperty({}, 'item', {value: 1});`, "latest", "client", true, true},
		{"prototype descriptor getter", `Object.defineProperty({}, 'item', {__proto__: {get value(){return document.title;}}} as PropertyDescriptor);`, "latest", "unknown", false, true},
		{"unknown key producer", `Object.defineProperty({}, foreign(), {value: 2});`, "latest", "unknown", false, true},
		{"independent unknown call", `Object.defineProperty({}, 'item', {value: 2}); foreign();`, "latest", "unknown", false, true},
		{"proxy descriptor", `Object.defineProperty({}, 'item', new Proxy({value: 1}, {has(target, key){document.title = "trap";return Reflect.has(target,key);}}));`, "latest", "unknown", false, true},
		{"saved resolver", `Object.defineProperty({}, 'item', {value: class Foreign {}}); let notify: () => void = () => undefined; void new Promise<void>(resolve => {notify = resolve;}); notify();`, "latest", "isomorphic", false, false},
		{"bracket member and numeric key", `Object['defineProperty']({}, 3, {value: 2});`, "latest", "isomorphic", false, false},
		{"shadowed callee", `const Object={defineProperty(_target:object,_key:string,_descriptor:object){document.title='authored';}}; Object.defineProperty({}, 'item', {value: 1});`, "latest", "client", true, false},
		{"opaque value argument", `Object.defineProperty({}, 'item', {value: foreign()});`, "latest", "unknown", false, true},
		{"consumed result", `const target=Object.defineProperty({}, 'item', {value: 1}); void target;`, "latest", "unknown", false, true},
		{"opaque descriptor", `Object.defineProperty({}, 'item', input);`, "latest", "unknown", false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {type Component, TaskContext} from '@exactjs/core';
declare function foreign(): string;
declare const input: PropertyDescriptor;
function select() {` + row.helper + ` return 'done'; }
export function Page(this: Component<{label: string}>) {
	this.state.label = '';
	function run(task: TaskContext = TaskContext.` + row.policy + `()) {
		this.state.label = select();
	}
	return () => <button onClick={() => run()}>{this.state.label}</button>;
}`
			fixture := newPublicAwaitRequiredFixture(t, source)
			var application Response
			for _, kind := range []string{"application", "library"} {
				request := fixture.request("compile", "entry.tsx")
				request.Target, request.PackageType = TargetServer, kind
				response := NewSession().Execute(request)
				if response.Error != "" {
					t.Fatalf("%s request failed: %s", kind, response.Error)
				}
				if row.placement == "unknown" {
					refused := false
					for _, diagnostic := range response.Diagnostics {
						refused = refused || diagnostic.Code == "EXACT2001" && strings.Contains(diagnostic.Message, "opaque")
					}
					if !refused || response.Code != "" {
						t.Fatalf("%s did not refuse the unresolved operation: %#v", kind, response.Diagnostics)
					}
				} else if response.Code == "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("%s did not emit: %#v", kind, response.Diagnostics)
				}
				found := false
				for _, task := range response.Analysis.Tasks {
					if !task.FunctionDefined || task.CompilerComputation || task.CompilerSetup {
						continue
					}
					found = true
					if task.Placement != row.placement || task.BrowserEffects != row.browser {
						t.Fatalf("%s task placement or browser effects differ: %#v", kind, task)
					}
					opaque := false
					for _, effect := range task.EffectSources {
						opaque = opaque || effect.Environment == "unknown"
					}
					if opaque != row.opaque {
						t.Fatalf("%s task opacity = %t, want %t: %#v", kind, opaque, row.opaque, task.EffectSources)
					}
				}
				if !found {
					t.Fatalf("%s did not publish the function-defined task", kind)
				}
				if kind == "application" {
					application = response
				} else if response.Code != application.Code {
					t.Fatal("the same component emitted different server code in the two package modes")
				}
			}
		})
	}
}
