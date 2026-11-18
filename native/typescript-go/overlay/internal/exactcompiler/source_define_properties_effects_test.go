package exactcompiler

import (
	"os"
	"testing"
)

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

// The immutable supplied binding does not make descriptor fields immutable.
// Original source Has/Get must retain the getter receiver and later field writers.
func TestComponentAliasedDescriptorEffects(t *testing.T) {
	for _, row := range []struct {
		name, descriptor, update string
		browser                  bool
	}{
		{"browser", "{get value(){return document.title;}}", "", true},
		{"quiet", "{get value(){return 'quiet';}}", "", false},
		{"dormant", "{value:()=>document.title}", "", false},
		{"receiver", "{read(){return document.title;},get value(){return this.read();}}", "", true},
		{"written-method", "{read(){return 'quiet';},get value(){return this.read();}}", "descriptor.read=()=>document.title;", true},
		{"abrupt-getter", "{get value():string{void document.title;throw new Error('descriptor');}}", "", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			fixture := newExecutableFixture(t, map[string]string{"entry.tsx": `import type {Component} from '@exactjs/core';
const key=Symbol.for('metadata');
export function Page(this:Component<{label:string}>){
 const target={};const descriptor=` + row.descriptor + `;` + row.update + `
 try{Object.defineProperty(target,key,descriptor);}catch{}
 this.state.label='done';return()=> <p>{this.state.label}</p>;
}`})
			config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"allowJs":true,"jsx":"react-jsx","jsxImportSource":"@exactjs/jsx"},"files":["entry.tsx"]}`
			if err := os.WriteFile(fixture.request("analyze", "entry.tsx").ConfigFile, []byte(config), 0600); err != nil {
				t.Fatal(err)
			}
			response := NewSession().Execute(fixture.request("analyze", "entry.tsx"))
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || len(response.Analysis.Components) != 1 {
				t.Fatal("aliased descriptor Page entry", response.Error, response.Diagnostics)
			}
			page := findCallable(t, response.Analysis.Callables, "Page")
			browser := false
			for _, effect := range page.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != row.browser {
				t.Fatal("aliased descriptor donor", browser, row.browser, page.EffectSources)
			}
			if browser && response.Analysis.Components[0].Placement != "client" {
				t.Fatal("browser descriptor Page not client", response.Analysis.Components[0])
			}
		})
	}
}

// A const loop binding has no initializer and retains the ordinary descriptor
// path. The real component consumer must remain analyzable without a literal grant.
func TestComponentAliasedDescriptorLoopFallback(t *testing.T) {
	fixture := newExecutableFixture(t, map[string]string{"entry.tsx": `import type {Component} from '@exactjs/core';
export function Page(this:Component<{label:string}>,props:{descriptors:PropertyDescriptor[]}){
 const target={};
 for(const descriptor of props.descriptors){Object.defineProperty(target,'label',descriptor);}
 this.state.label='done';return()=> <p>{this.state.label}</p>;
}`})
	config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"allowJs":true,"jsx":"react-jsx","jsxImportSource":"@exactjs/jsx"},"files":["entry.tsx"]}`
	if err := os.WriteFile(fixture.request("analyze", "entry.tsx").ConfigFile, []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	response := NewSession().Execute(fixture.request("analyze", "entry.tsx"))
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Name != "Page" {
		t.Fatal("loop descriptor Page fallback", response.Error, response.Diagnostics, response.Analysis.Components)
	}
	page := findCallable(t, response.Analysis.Callables, "Page")
	if len(page.StateWrites) == 0 || len(response.Analysis.StateReads) == 0 {
		t.Fatal("loop fallback lost rendered component state consumer", page, response.Analysis.StateReads)
	}
}
