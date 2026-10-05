package exactcompiler

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Authored controls exercise validation and both lowering targets, rather than fabricated ASTs.
func TestFormBindingSourceContracts(t *testing.T) {
	for _, c := range []struct{ name, kind, control, diagnostic string }{
		{"uppercase checkbox", "boolean", `<input type="CHECKBOX" checked:onChange={this.state.value}/>`, ""},
		{"default radio", "string", `<input type="radio" checked:onChange={this.state.value}/>`, ""},
		{"number range", "number", `<input type="range" value:onInput={this.state.value}/>`, ""},
		{"numeric text", "number|null", `<input type="text" value:onInput={this.state.value}/>`, ""},
		{"numeric default input", "number", `<input value:onChange={this.state.value}/>`, ""},
		{"numeric textarea", "number", `<textarea value:onChange={this.state.value}/>`, ""},
		{"numeric single select", "number", `<select value:onChange={this.state.value}><option value="2">Two</option></select>`, ""},
		{"numeric date", "number", `<input type="date" value:onChange={this.state.value}/>`, ""},
		{"dynamic number type", "number", `<input type={String('text')} value:onInput={this.state.value}/>`, ""},
		{"unknown multiple", "string[]", `<select multiple={Boolean(this.state.value.length)} value:onChange={this.state.value}/>`, "statically known multiple mode"},
		{"multiple true expression", "string[]", `<select multiple={true} value:onChange={this.state.value}/>`, ""},
		{"multiple null", "string", `<select multiple={null} value:onChange={this.state.value}/>`, ""},
		{"false multiple array", "string[]", `<select multiple={false} value:onChange={this.state.value}/>`, "array values require"},
		{"text checkbox type attribute", "boolean", `<textarea type="checkbox" checked:onChange={this.state.value}/>`, "not supported by this control"},
		{"select radio type attribute", "string", `<select type="radio" checked:onChange={this.state.value}/>`, "not supported by this control"},
		{"string radio numeric option", "string", `<input type="radio" value={2} checked:onChange={this.state.value}/>`, ""},
		{"numeric radio numeric option", "number", `<input type="radio" value={2} checked:onChange={this.state.value}/>`, ""},
		{"string group numeric option", "string[]", `<input type="checkbox" value={2} checked:onChange={this.state.value}/>`, ""},
		{"string radio typed option", "string", `<input type="radio" value={('2' as string)} checked:onChange={this.state.value}/>`, ""},
		{"wrapped constant type", "boolean", `<input type={('checkbox' satisfies 'checkbox')} checked:onChange={this.state.value}/>`, ""},
		{"dynamic indexed state", "Record<string,string>", `<input value:onInput={this.state.value[String(0)]}/>`, ""},
		{"nested state", "{label:string}", `<input value:onInput={this.state.value.label}/>`, ""},
		{"nonnullable date", "Date", `<input type="date" value:onChange={this.state.value}/>`, ""},
		{"modal external target", "boolean", `<dialog modal:isOpen={({value:true}).value}/>`, "writable component state location"},
		{"numeric checkbox", "number", `<input type="checkbox" checked:onChange={this.state.value}/>`, "requires a boolean"},
		{"string checkbox", "string", `<input type="checkbox" checked:onChange={this.state.value}/>`, "requires a boolean"},
		{"legacy change", "string", `<input bindChange={this.state.value}/>`, "were removed"},
		{"Date textarea", "Date", `<textarea type="date" value:onChange={this.state.value}/>`, "Date values require"},
		{"boolean group", "boolean[]", `<input type="checkbox" value="true" checked:onChange={this.state.value}/>`, "arrays must contain"},
		{"unknown checkbox", "unknown", `<input type="checkbox" checked:onChange={this.state.value}/>`, ""},
		{"text", "string", `<input value:onInput={this.state.value}/>`, ""},
		{"textarea", "string|undefined", `<textarea value:onChange={this.state.value}/>`, ""},
		{"numeric", "number|null", `<input type="number" value:onInput={this.state.value}/>`, ""},
		{"checkbox expression type", "boolean", `<input type={"checkbox"} checked:onChange={this.state.value}/>`, ""},
		{"radio expression type", "number", `<input type={"radio"} value="2" checked:onChange={this.state.value}/>`, ""},
		{"date expression type", "Date|null", `<input type={"date"} value:onChange={this.state.value}/>`, ""},
		{"single select false multiple", "string", `<select multiple={false} value:onChange={this.state.value}/>`, ""},
		{"checkbox", "boolean", `<input type="checkbox" checked:onChange={this.state.value}/>`, ""},
		{"radio", "number", `<input type="radio" value="2" checked:onChange={this.state.value}/>`, ""},
		{"checkbox group", "number[]|null", `<input type="checkbox" value="2" checked:onChange={this.state.value}/>`, ""},
		{"multiple", "string[]|undefined", `<select multiple value:onChange={this.state.value}><option value="a">A</option></select>`, ""},
		{"date", "Date|null", `<input type="date" value:onChange={this.state.value}/>`, ""},
		{"details", "boolean", `<details open:onToggle={this.state.value}/>`, ""},
		{"modal", "boolean", `<dialog modal:isOpen={this.state.value}/>`, ""},
		{"legacy", "string", `<input bindInput={this.state.value}/>`, "were removed"},
		{"duplicate", "string", `<input value:onInput={this.state.value} value:onChange={this.state.value}/>`, "only one binding"},
		{"unknown event", "string", `<input value:onBlur={this.state.value}/>`, "supported intrinsic bindings"},
		{"missing target", "string", `<input value:onInput/>`, "writable reactive location"},
		{"string initializer", "string", `<input value:onInput="value"/>`, "writable reactive location"},
		{"empty expression", "string", `<input value:onInput={}/>`, "writable reactive location"},
		{"derived target", "string", `<input value:onInput={this.state.value+'!'}/>`, "writable reactive location"},
		{"unsupported object", "{name:string}", `<input value:onInput={this.state.value}/>`, "homogeneous array"},
		{"heterogeneous array", "(string|number)[]", `<select multiple value:onChange={this.state.value}/>`, "homogeneous array"},
		{"mixed array scalar", "string|string[]", `<input value:onInput={this.state.value}/>`, "homogeneous array"},
		{"two empties", "string|null|undefined", `<input value:onInput={this.state.value}/>`, "homogeneous array"},
		{"null only", "null", `<input value:onInput={this.state.value}/>`, "homogeneous array"},
		{"unsupported element", "string", `<div value:onInput={this.state.value}/>`, "supported only"},
		{"wrong event", "boolean", `<input type="checkbox" value:onInput={this.state.value}/>`, "not supported by this control"},
		{"boolean text", "boolean", `<input value:onInput={this.state.value}/>`, "boolean bindings require"},
		{"string details", "string", `<details open:onToggle={this.state.value}/>`, "boolean state location"},
		{"string modal", "string", `<dialog modal:isOpen={this.state.value}/>`, "boolean state location"},
		{"modal conflict", "boolean", `<dialog open modal:isOpen={this.state.value}/>`, "explicit open prop"},
		{"array text", "string[]", `<input value:onInput={this.state.value}/>`, "array values require"},
		{"scalar multiple", "string", `<select multiple value:onChange={this.state.value}/>`, "array values require"},
		{"date array", "Date[]", `<select multiple value:onChange={this.state.value}/>`, "arrays must contain"},
		{"group missing option", "string[]", `<input type="checkbox" checked:onChange={this.state.value}/>`, "explicit value prop"},
		{"date text", "Date", `<input value:onInput={this.state.value}/>`, "Date values require"},
		{"value conflict", "string", `<input value="fixed" value:onInput={this.state.value}/>`, "explicit value prop"},
		{"checked conflict", "boolean", `<input type="checkbox" checked checked:onChange={this.state.value}/>`, "explicit checked prop"},
		{"unknown boolean", "unknown", `<details open:onToggle={this.state.value}/>`, ""},
		{"any value", "any", `<input value:onInput={this.state.value}/>`, ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `declare class Component<S>{state:S} export function Form(this:Component<{value:` + c.kind + `}>){return()=> ` + c.control + `;}`
			generation := formBindingGeneration(t, source)
			analysis := NewSession().Execute(Request{Kind: "analyze", Root: filepath.Dir(generation.sourceFile.FileName()), ID: generation.sourceFile.FileName(), ConfigFile: filepath.Join(filepath.Dir(generation.sourceFile.FileName()), "tsconfig.json"), Source: source})
			bindings, _, diagnostics := analyzeFormBindings(generation.sourceFile, generation.checker, analysis.Analysis.StateReads, analysis.Analysis.Components, enhancementImports{})
			if c.diagnostic != "" {
				found := false
				for _, d := range diagnostics {
					if d.Code == "EXACT_FORM_BINDING" && strings.Contains(d.Message, c.diagnostic) {
						found = true
					}
				}
				if !found {
					t.Fatalf("missing %q: %#v", c.diagnostic, diagnostics)
				}
				if len(bindings) != 0 {
					t.Fatal("invalid control acquired a binding")
				}
				return
			}
			// The modal path needs analyzed state ownership, unlike ordinary property bindings.
			if c.name != "modal" && (len(diagnostics) != 0 || len(bindings) != 1) {
				t.Fatalf("valid binding rejected: %#v", diagnostics)
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", Root: filepath.Dir(generation.sourceFile.FileName()), ID: generation.sourceFile.FileName(), ConfigFile: filepath.Join(filepath.Dir(generation.sourceFile.FileName()), "tsconfig.json"), Source: source, Target: target})
				if response.Error != "" || response.Code == "" || containsDiagnosticCode(response.Diagnostics, "EXACT_FORM_BINDING") {
					t.Fatalf("valid %s lowering failed: %s %#v", target, response.Error, response.Diagnostics)
				}
			}
		})
	}
}

// A strict checker preserves nullable conversion contracts in source witnesses.
func formBindingGeneration(t *testing.T, source string) *projectGeneration {
	t.Helper()
	root := t.TempDir()
	file := filepath.Join(root, "form.tsx")
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"strict":true,"target":"esnext","jsx":"preserve","lib":["esnext","dom"]}}`), 0600); err != nil {
		t.Fatal(err)
	}
	state, _, err := newProjectState(Request{Root: root, ConfigFile: config, Source: source}, file)
	if err != nil {
		t.Fatal(err)
	}
	generation, err := state.advance(context.Background(), file, source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(generation.release)
	return generation
}

// Conversion depends on native declaration identity, not a type's displayed name.
func TestFormBindingDateIdentity(t *testing.T) {
	for _, c := range []struct {
		name, prelude, kind string
		valid               bool
	}{
		{"native", "", "Date", true},
		{"native alias", "type Day=Date;", "Day", true},
		{"native subclass", "class Day extends Date {}", "Day", false},
		{"custom Date", "class Date {label='custom'}", "Date", false},
		{"custom alias", "class Date {label='custom'} type Day=Date;", "Day", false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := c.prelude + `declare class Component<S>{state:S} export function Form(this:Component<{value:` + c.kind + `}>){return()=> <input type="date" value:onChange={this.state.value}/>;}`
			generation := formBindingGeneration(t, source)
			bindings, _, diagnostics := analyzeFormBindings(generation.sourceFile, generation.checker, nil, collectComponents(generation.sourceFile), enhancementImports{})
			if (len(bindings) == 1) != c.valid || (len(diagnostics) == 0) != c.valid {
				t.Fatalf("Date identity lost: %#v %#v", bindings, diagnostics)
			}
		})
	}
}

// TypeScript owns readonly checking. Native props ownership is a separate framework contract.
func TestFormBindingReadonlyAndPropsOwnership(t *testing.T) {
	for _, c := range []struct{ name, source, diagnostic string }{
		{"readonly state", `declare class Component<S>{state:S} export function Form(this:Component<{readonly value:string}>){return()=> <input value:onInput={this.state.value}/>;}`, "TS2540"},
		{"readonly shallow container", `declare class Component<S>{state:S} export function Form(this:Component<{readonly box:{value:string}}>){return()=> <input value:onInput={this.state.box.value}/>;}`, ""},
		{"readonly array", `declare class Component<S>{state:S} export function Form(this:Component<{values:readonly string[]}>){return()=> <input value:onInput={this.state.values[0]}/>;}`, "TS2542"},
		{"component readonly", `declare class Component<S>{state:S} declare function Input(p:{value:string;change(value:string):void}):()=>unknown;export function Form(this:Component<{readonly value:string}>){return()=> <Input value:change={this.state.value}/>;}`, "TS2540"},
		{"component writable", `declare class Component<S>{state:S} declare function Input(p:{value:string;change(value:string):void}):()=>unknown;export function Form(this:Component<{value:string}>){return()=> <Input value:change={this.state.value}/>;}`, ""},
		{"direct props", `export function Form(props:{value:string}){return()=> <input value:onInput={props.value}/>;}`, "EXACT_FORM_BINDING"},
		{"indexed props", `export function Form(props:{value:string}){return()=> <input value:onInput={props['value']}/>;}`, "EXACT_FORM_BINDING"},
		{"nested props", `export function Form(props:{record:{value:string}}){return()=> <input value:onInput={props.record.value}/>;}`, "EXACT_FORM_BINDING"},
		{"aliased props", `export function Form(props:{value:string}){const alias=props;return()=> <input value:onInput={alias.value}/>;}`, "EXACT_FORM_BINDING"},
		{"chained asserted props", `export function Form(props:{value:string}){const first=props;const second=(first as {value:string});return()=> <input value:onInput={second.value}/>;}`, "EXACT_FORM_BINDING"},
		{"satisfies props", `export function Form(props:{value:string}){const alias=props satisfies {value:string};return()=> <input value:onInput={alias.value}/>;}`, "EXACT_FORM_BINDING"},
		{"nonnullable props", `export function Form(props:{value:string}){const alias=props!;return()=> <input value:onInput={alias.value}/>;}`, "EXACT_FORM_BINDING"},
		{"shadowed helper props", `export function Form(props:{value:string}){function render(props:{value:string}){return <input value:onInput={props.value}/>;}return()=>render({value:'owned'});}`, ""},
		{"destructured props", `export function Form(props:{record:{value:string}}){const {record}=props;return()=> <input value:onInput={record.value}/>;}`, "EXACT_FORM_BINDING"},
		{"helper state parameter", `declare class Component<S>{state:S} function field(value:{label:string}){return <input value:onInput={value.label}/>;}export function Form(this:Component<{value:{label:string}}>){return()=> field(this.state.value);}`, ""},
		{"owned copy", `export function Form(props:{value:string}){const copy={...props};return()=> <input value:onInput={copy.value}/>;}`, ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			generation := formBindingGeneration(t, c.source)
			response := NewSession().Execute(Request{Kind: "check", Diagnostics: "semantic", Root: filepath.Dir(generation.sourceFile.FileName()), ID: generation.sourceFile.FileName(), ConfigFile: filepath.Join(filepath.Dir(generation.sourceFile.FileName()), "tsconfig.json"), Source: c.source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if c.diagnostic != "" {
				if !containsDiagnosticCode(response.Diagnostics, c.diagnostic) {
					t.Fatalf("missing assignment obligation %s: %#v", c.diagnostic, response.Diagnostics)
				}
				return
			}
			for _, d := range response.Diagnostics {
				if d.Code == "TS2540" || d.Code == "TS2542" || d.Code == "EXACT_FORM_BINDING" || d.Code == "EXACT_COMPONENT_BINDING" {
					t.Fatalf("valid writable control rejected: %#v", response.Diagnostics)
				}
			}
		})
	}
}

func TestFormBindingExecutableReadonlyProof(t *testing.T) {
	source := `declare class Component<S>{state:S} export function Form(this:Component<{readonly value:string}>){return()=> <input value:onInput={this.state.value}/>;}`
	generation := formBindingGeneration(t, source)
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", Target: target, Diagnostics: "semantic", Root: filepath.Dir(generation.sourceFile.FileName()), ID: generation.sourceFile.FileName(), ConfigFile: filepath.Join(filepath.Dir(generation.sourceFile.FileName()), "tsconfig.json"), Source: source})
		if !containsDiagnosticCode(response.Diagnostics, "TS2540") {
			t.Fatalf("%s skipped binding assignment proof: %#v", target, response.Diagnostics)
		}
	}
}
