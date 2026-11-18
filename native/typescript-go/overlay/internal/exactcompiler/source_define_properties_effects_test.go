package exactcompiler

import "testing"

// A descriptor's value accessor executes during the original native Call,
// independently of whether the installed target value can be reconstructed.
func TestComponentDefinePropertiesDescriptorGetterEffects(t *testing.T) {
	for _, row := range []struct {
		name, descriptor, expression string
		browser                      bool
	}{
		{"browser", "{get value(){return document.title;}}", "target.label", true},
		{"quiet", "{get value(){return 'quiet';}}", "target.label", false},
		{"dormant-function-data", "{value:()=>document.title}", "typeof target.label", false},
		{"getter-receiver", "{read(){return document.title},get value(){return this.read();}}", "target.label", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			fixture := newExecutableFixture(t, map[string]string{"entry.tsx": `import type {Component} from '@exactjs/core';
export function Page(this:Component<{label:string}>){
 const target={label:''};
 Object.defineProperties(target,{label:` + row.descriptor + `});
 this.state.label=` + row.expression + `;
 return()=> <p>{this.state.label}</p>;
}`})
			request := fixture.request("analyze", "entry.tsx")
			request.Diagnostics = "syntax"
			response := NewSession().Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || len(response.Analysis.Components) != 1 {
				t.Fatal("original Page entry failed", response.Error, response.Diagnostics)
			}
			page := findCallable(t, response.Analysis.Callables, "Page")
			browser := false
			for _, effect := range page.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != row.browser {
				t.Fatalf("descriptor getter Page browser=%v; want %v: %#v", browser, row.browser, page.EffectSources)
			}
		})
	}
}

// A sole computed entry retains its original descriptor Gets independently of
// optional key/value precision. Installed callback DATA remains dormant.
func TestComponentSingleComputedDescriptorEffects(t *testing.T) {
	for _, row := range []struct {
		name, descriptor, expression string
		browser                      bool
	}{
		{"browser", "{get value(){return document.title;}}", "typeof target.label", true},
		{"quiet", "{get value(){return 'quiet';}}", "typeof target.label", false},
		{"dormant-data", "{value:()=>document.title}", "typeof target.label", false},
		{"descriptor-receiver", "{get:()=>document.title,get enumerable(){return !!this.get!();}}", "'done'", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			fixture := newExecutableFixture(t, map[string]string{"entry.tsx": `import type {Component} from '@exactjs/core';
export function Page(this:Component<{label:string}>,props:{key:string}){
 const target={label:''};
 Object.defineProperties(target,{[props.key]:` + row.descriptor + `});
 this.state.label=` + row.expression + `;
 return()=> <p>{this.state.label}</p>;
}`})
			request := fixture.request("analyze", "entry.tsx")
			request.Diagnostics = "syntax"
			response := NewSession().Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || len(response.Analysis.Components) != 1 {
				t.Fatal("original computed Page entry failed", response.Error, response.Diagnostics)
			}
			page := findCallable(t, response.Analysis.Callables, "Page")
			browser := false
			for _, effect := range page.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != row.browser {
				t.Fatalf("computed descriptor Page browser=%v want %v: %#v", browser, row.browser, page.EffectSources)
			}
			if browser && response.Analysis.Components[0].Placement != "client" {
				t.Fatal("browser descriptor Page not client", response.Analysis.Components[0])
			}
		})
	}
}

// Original single-property conversion invokes descriptor getters without a
// normal inspection frame. Stored function DATA is not invoked by installation.
func TestComponentSingleDefinePropertyEffects(t *testing.T) {
	for _, row := range []struct {
		name, descriptor string
		browser          bool
	}{
		{"browser", "{get value(){return document.title;}}", true},
		{"quiet", "{get value(){return 'quiet';}}", false},
		{"dormant-data", "{value:()=>document.title}", false},
		{"descriptor-receiver", "{get:()=>document.title,get enumerable(){return !!this.get!();}}", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			fixture := newExecutableFixture(t, map[string]string{"entry.tsx": `import type {Component} from '@exactjs/core';
const key=Symbol.for('metadata');
export function Page(this:Component<{label:string}>){
 const target={};
 Object.defineProperty(target,key,` + row.descriptor + `);
 Object.freeze({});
 this.state.label='done';
 return()=> <p>{this.state.label}</p>;
}`})
			request := fixture.request("analyze", "entry.tsx")
			request.Diagnostics = "syntax"
			response := NewSession().Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || len(response.Analysis.Components) != 1 {
				t.Fatal("single property Page entry failed", response.Error, response.Diagnostics)
			}
			page := findCallable(t, response.Analysis.Callables, "Page")
			browser := false
			for _, effect := range page.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != row.browser {
				t.Fatalf("single property Page browser=%v want %v: %#v", browser, row.browser, page.EffectSources)
			}
			if browser && response.Analysis.Components[0].Placement != "client" {
				t.Fatal("browser single property Page not client", response.Analysis.Components[0])
			}
		})
	}
}
