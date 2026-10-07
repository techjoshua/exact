package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Transparent lvalue syntax retains ownership, assignment typing and indexed state writes.
func TestFormsSubsystemWrappedLocations(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, expression := range []string{"this.state.value", "(this.state.value)", "(this.state.value as string)", "this.state.value as string", "this.state.value satisfies string", "(this.state.value satisfies string)", "this.state.value!", "this.state['value']", "(this.state['value'] as string)"} {
		for _, kind := range []string{"intrinsic", "notification"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(kind+"/"+expression+"/"+string(target), func(t *testing.T) {
					element := `<input value:onInput={` + expression + `}/>`
					if kind == "notification" {
						element = `<Control value:changed={` + expression + `}/>`
					}
					source := `import type {Component} from '@exactjs/core';function Control(props:{value:string;changed:(value:string)=>void}){return()=> <button onClick={()=>props.changed('next')}>{props.value}</button>}export function Page(this:Component<{value:string}>){this.state.value='initial';return()=> ` + element + `}`
					response := formsCompileSource(t, root, config, source, target)
					if len(response.Diagnostics) != 0 {
						t.Fatalf("writable binding rejected: %v", formsDiagnosticDetails(response.Diagnostics))
					}
					formsRequirePortable(t, response)
					if len(response.Analysis.ValueBindings) != 1 {
						t.Fatalf("lost binding provenance: %#v", response.Analysis.ValueBindings)
					}
					if target == TargetClient && !strings.Contains(response.Code, "__exactWriteState") {
						t.Fatalf("lost indexed state write: %s", response.Code)
					}
				})
			}
		}
	}
}

// Invalid notification contracts must remain rejected when lvalue syntax is accepted.
func TestFormsSubsystemNotificationContracts(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, c := range []struct{ name, props, attribute, setup, diagnostic string }{
		{"same-member", `value:string;changed:(value:string)=>void`, `value:value={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"missing-value", `changed:(value:string)=>void`, `value:changed={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"missing-callback", `value:string`, `value:changed={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"literal-target", `value:string;changed:(value:string)=>void`, `value:changed={"literal"}`, "", "EXACT_COMPONENT_BINDING"},
		{"non-state", `value:string;changed:(value:string)=>void`, `value:changed={local.value}`, `const local={value:'local'};`, "EXACT_COMPONENT_BINDING"},
		{"value-type", `value:number;changed:(value:string)=>void`, `value:changed={(this.state.value as string)}`, "", "EXACT_COMPONENT_BINDING"},
		{"nullable-callback", `value:string;changed:((value:string)=>void)|null`, `value:changed={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"non-callable", `value:string;changed:string`, `value:changed={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"zero-arguments", `value:string;changed:()=>void`, `value:changed={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"optional-first", `value:string;changed:(value?:string)=>void`, `value:changed={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"replacement-type", `value:string;changed:(value:number)=>void`, `value:changed={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"semantic-return", `value:string;changed:(value:string)=>boolean`, `value:changed={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"explicit-duplicate", `value:string;changed:(value:string)=>void`, `value='explicit' value:changed={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"finite-spread", `value:string;changed:(value:string)=>void`, `{...{value:'spread'}} value:changed={this.state.value}`, "", "EXACT_COMPONENT_BINDING"},
		{"union-spread", `value:string;changed:(value:string)=>void`, `{...spread} value:changed={this.state.value}`, `const spread=props.flag?{value:'a'}:{value:'b'};`, "EXACT_COMPONENT_BINDING"},
		{"optional-spread", `value:string;changed:(value:string)=>void`, `{...spread} value:changed={this.state.value}`, `const spread:{value?:string}={};`, ""},
		{"unrelated-spread", `value:string;changed:(value:string)=>void;title?:string`, `{...{title:'title'}} value:changed={this.state.value}`, "", ""},
		{"index-spread", `value:string;changed:(value:string)=>void`, `{...spread} value:changed={this.state.value}`, `const spread:Record<string,string>={};`, ""},
		{"optional-callback", `value:string;changed?:((value:string)=>void)`, `value:changed={this.state.value}`, "", ""},
		{"extra-arguments", `value:string;changed:(value:string,reason:number)=>void`, `value:changed={this.state.value}`, "", ""},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				source := `import type {Component} from '@exactjs/core';function Control(props:{` + c.props + `}){return()=> <p/>}export function Page(this:Component<{value:string}>,props:{flag:boolean}){this.state.value='initial';` + c.setup + `return()=> <Control ` + c.attribute + `/>}`
				response := formsCompileSource(t, root, config, source, target)
				if c.diagnostic != "" {
					if !hasDiagnosticCode(response.Diagnostics, c.diagnostic) {
						t.Fatalf("missing contract rejection: %v", formsDiagnosticDetails(response.Diagnostics))
					}
				} else if len(response.Diagnostics) != 0 {
					t.Fatalf("valid notification rejected: %v", formsDiagnosticDetails(response.Diagnostics))
				}
			})
		}
	}
}

// Props aliases remain parent owned while fresh copies and helper-owned inputs are writable.
func TestFormsSubsystemOwnershipSources(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, c := range []struct{ name, setup, target, diagnostic string }{
		{"props", "", "(props.value)", "EXACT_FORM_BINDING"},
		{"props-cast", "", "(props.value as string)", "EXACT_FORM_BINDING"},
		{"props-object-alias", "const values=props.nested;", "values.value", "EXACT_FORM_BINDING"},
		{"props-pattern-alias", "const {nested:values}=props;", "values.value", "EXACT_FORM_BINDING"},
		{"props-pattern-wrapped", "const {nested:values}=(props satisfies typeof props);", "values.value", "EXACT_FORM_BINDING"},
		{"props-element", "", "props['value']!", "EXACT_FORM_BINDING"},
		{"copy", "const values={...props.nested};", "values.value", ""},
		{"own-object", "const values={value:'local'};", "values.value", ""},
		{"state-alias", "const values=this.state;", "(values.value)", ""},
		{"readonly", "const values={} as {readonly value:string};", "(values.value)", "TS2540"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				source := `import type {Component} from '@exactjs/core';export function Page(this:Component<{value:string}>,props:{value:string;nested:{value:string}}){this.state.value='initial';` + c.setup + `return()=> <input value:onInput={` + c.target + `}/>}`
				response := formsCompileSource(t, root, config, source, target)
				if c.diagnostic != "" {
					if !hasDiagnosticCode(response.Diagnostics, c.diagnostic) {
						t.Fatalf("ownership or assignment constraint lost: %v", formsDiagnosticDetails(response.Diagnostics))
					}
				} else if len(response.Diagnostics) != 0 {
					t.Fatalf("owned location rejected: %v", formsDiagnosticDetails(response.Diagnostics))
				}
			})
		}
	}
}

// Dynamic path operands survive wrappers in notifications and ordinary assignments.
func TestFormsSubsystemComputedTargets(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, location := range []string{"this.state.fields[this.state.index].value", "(this.state.fields[this.state.index].value)", "(this.state.fields[this.state.index].value as string)", "(this.state.fields[this.state.index].value satisfies string)", "this.state.fields[this.state.index].value!"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(location+"/"+string(target), func(t *testing.T) {
				source := `import type {Component} from '@exactjs/core';type State={fields:{value:string}[];index:number};function Control(props:{value:string;changed:(value:string)=>void}){return()=> <p/>}export function Page(this:Component<State>){this.state.fields=[{value:'A'}];this.state.index=0;return()=> <section><Control value:changed={` + location + `}/><button onClick={()=>{` + location + ` = 'next'}}>Write</button></section>}`
				response := formsCompileSource(t, root, config, source, target)
				if len(response.Diagnostics) != 0 {
					t.Fatalf("computed target rejected: %v", formsDiagnosticDetails(response.Diagnostics))
				}
				found := 0
				for _, write := range response.Analysis.StateWrites {
					if len(write.Path) == 3 && write.Path[0] == "fields" {
						found++
						if len(write.DynamicSegments) != 1 || write.DynamicSegments[1] == nil {
							t.Fatalf("lost computed selection: %#v", write)
						}
					}
				}
				if found != 2 {
					t.Fatalf("missing assignment and notification writes: %#v", response.Analysis.StateWrites)
				}
			})
		}
	}
}

// Notification proof uses the resolved JSX prop type, preserving generic instantiation.
func TestFormsSubsystemResolvedProps(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, c := range []struct{ name, definition, element, diagnostic string }{
		{"binding-only-generic", `function Control<T>(props:{value:T;changed:(value:T)=>void}){return()=> <p/>}`, `<Control value:changed={this.state.value}/>`, ""},
		{"generic-spread", `function Control<T>(props:{value:T;changed:(value:T)=>void}){return()=> <p/>}`, `<Control {...{}} value:changed={this.state.value}/>`, ""},
		{"generic-boolean-attribute", `function Control<T extends string>(props:{value:T;changed:(value:T)=>void}){return()=> <p/>}`, `<Control value:changed/>`, "EXACT_COMPONENT_BINDING"},
		{"generic-literal-attribute", `function Control<T extends string>(props:{value:T;changed:(value:T)=>void}){return()=> <p/>}`, `<Control value:changed="literal"/>`, "EXACT_COMPONENT_BINDING"},
		{"generic-missing-value", `function Control<T extends string>(props:{value:T;changed:(value:T)=>void}){return()=> <p/>}`, `<Control missing:changed={this.state.value}/>`, "EXACT_COMPONENT_BINDING"},
		{"generic-missing-callback", `function Control<T extends string>(props:{value:T;changed:(value:T)=>void}){return()=> <p/>}`, `<Control value:missing={this.state.value}/>`, "EXACT_COMPONENT_BINDING"},
		{"explicit-generic", `function Control<T extends string>(props:{value:T;changed:(value:T)=>void}){return()=> <p>{props.value}</p>}`, `<Control<string> value:changed={this.state.value}/>`, ""},
		{"constrained-generic", `function Control<T extends string>(props:{value:T;changed:(value:T)=>void}){return()=> <p>{props.value}</p>}`, `<Control value:changed={this.state.value}/>`, ""},
		{"inferred-other-prop", `function Control<T>(props:{sample:T;value:T;changed:(value:T)=>void}){return()=> <p/>}`, `<Control sample={this.state.value} value:changed={this.state.value}/>`, ""},
		{"incompatible-generic", `function Control<T>(props:{value:T;changed:(value:T)=>void}){return()=> <p/>}`, `<Control<number> value:changed={this.state.value}/>`, "EXACT_COMPONENT_BINDING"},
		{"index-props", `function Control(props:Record<string,unknown>){return()=> <p/>}`, `<Control value:changed={this.state.value}/>`, "EXACT_COMPONENT_BINDING"},
		{"overloaded-props", `function Control(props:{value:string;changed:(value:string)=>void}):()=>unknown;function Control(props:{value:number;changed:(value:number)=>void}):()=>unknown;function Control(props:unknown){return()=> <p/>}`, `<Control value:changed={this.state.value}/>`, "EXACT_COMPONENT_BINDING"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				source := `import type {Component} from '@exactjs/core';` + c.definition + `export function Page(this:Component<{value:string}>){this.state.value='initial';return()=> ` + c.element + `}`
				response := formsCompileSource(t, root, config, source, target)
				if c.diagnostic != "" {
					if !hasDiagnosticCode(response.Diagnostics, c.diagnostic) {
						t.Fatalf("missing finite props rejection: %v", formsDiagnosticDetails(response.Diagnostics))
					}
				} else if len(response.Diagnostics) != 0 {
					t.Fatalf("resolved JSX props lost: %v", formsDiagnosticDetails(response.Diagnostics))
				}
			})
		}
	}
}

// The fixture owns real framework and library resolution without requiring generated package files.
func formsSourceFixture(t *testing.T) (string, string) {
	t.Helper()
	root, err := os.MkdirTemp(".", ".forms-source-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"target":"ESNext","module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","jsxImportSource":"@exactjs/jsx","skipLibCheck":true}}`), 0600); err != nil {
		t.Fatal(err)
	}
	return root, config
}

func formsCompileSource(t *testing.T, root, config, source string, target Target) Response {
	t.Helper()
	entry := filepath.Join(root, "Forms.tsx")
	if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	response := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: target, Source: source, ConfigFile: config, Diagnostics: "semantic"})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	return response
}

func formsDiagnosticDetails(diagnostics []Diagnostic) []string {
	result := make([]string, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		result = append(result, diagnostic.Code+": "+diagnostic.Message)
	}
	return result
}

// Successful source witnesses must publish portable components, not merely printable code.
func formsRequirePortable(t *testing.T, response Response) {
	t.Helper()
	for _, component := range response.Analysis.Components {
		if component.Name == "Page" {
			if component.Placement != "isomorphic" {
				t.Fatalf("binding lost portable placement: %#v", component)
			}
			return
		}
	}
	t.Fatal("binding component was not discovered")
}
