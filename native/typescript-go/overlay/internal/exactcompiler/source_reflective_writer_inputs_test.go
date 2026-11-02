package exactcompiler

import (
	"fmt"
	"testing"
)

// Descriptor target and RHS inputs belong to each original install Call. A
// sibling allocation cannot borrow its donor, and unresolved routes keep unknown.
func TestReflectiveWriterOriginalInputs(t *testing.T) {
	for _, factory := range []struct{ name, source string }{
		{"literal", `function make(){return {field:{value:"safe"}}}`},
		{"class", `class Box{field={value:"safe"}}function make(){return new Box()}`},
	} {
		for _, row := range []struct {
			name, setup, read string
			browser, unknown  bool
		}{
			{"named descriptor", `installNamed(a,donor);`, `a`, true, false},
			{"same", `install(a,donor);`, `a`, true, false},
			{"other", `install(a,donor);`, `b`, false, false},
			{"reversed calls", `install(b,donor);install(a,safe);`, `b`, true, false},
			{"reversed origins", `install(b,donor);`, `a`, false, false},
			{"installed getter capture", `installGet(a,donor);`, `a`, true, false},
			{"captured rhs", `function rhs(){const saved=donor;return saved}install(a,rhs());`, `a`, true, false},
			{"unknown target", `declare const pick:boolean;declare const external:{field:{value:string}};install(pick?a:external,donor);`, `a`, true, true},
		} {
			t.Run(factory.name+"/"+row.name, func(t *testing.T) {
				source := factory.source + `function install(box:{field:{value:string}},value:{value:string}){Object.defineProperty(box,"field",{value})}function installNamed(box:{field:{value:string}},value:{value:string}){Object.defineProperty(box,"field",{value:value})}function installGet(box:{field:{value:string}},value:{value:string}){Object.defineProperty(box,"field",{get(){return value}})}const safe={value:"safe"};const donor={get value(){return document.title}};const a=make();const b=make();` + row.setup + `export const value=` + row.read + `.field.value;`
				r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reflective-writer-inputs.ts", Source: source, Diagnostics: "semantic"})
				browser, unknown := reentrantInitializerEffects(t, r, source, true)
				if browser != row.browser || row.unknown && !unknown {
					t.Fatalf("browser=%v want=%v unknown=%v require=%v", browser, row.browser, unknown, row.unknown)
				}
			})
		}
	}
}

// Unknown keys and create results remain separate residual cases. No factory
// syntax grants an Object.create allocation or native descriptor certificate.
func TestReflectiveWriterResidualInputs(t *testing.T) {
	for _, create := range []bool{false, true} {
		for _, dynamic := range []bool{false, true} {
			t.Run(fmt.Sprint("create=", create, "/dynamic=", dynamic), func(t *testing.T) {
				factory := `function make(){return {field:{value:"safe"}}}`
				if create {
					factory = `function make(){return Object.create(null) as {field:{value:string}}}`
				}
				key := `"field"`
				prefix := ""
				if dynamic {
					key = "key"
					prefix = `declare const key:string;`
				}
				source := prefix + factory + `function install(box:object,key:string,value:{value:string}){Object.defineProperty(box,key,{value})}const a=make();const donor={get value(){return document.title}};install(a,` + key + `,donor);export const value=a.field.value;`
				response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reflective-residual-inputs.ts", Source: source, Diagnostics: "semantic"})
				browser, unknown := reentrantInitializerEffects(t, response, source, true)
				if !browser {
					t.Fatal("possible descriptor RHS lost known browser donor")
				}
				if (create || dynamic) && !unknown {
					t.Fatal("unsupported target/key became complete")
				}
			})
		}
	}
}

// Original argument and installed getter execution remains ordered and once-only
// in both emitted targets, including the getter's abrupt completion.
func TestReflectiveWriterInputsEmitted(t *testing.T) {
	const source = `export function run(fail:boolean){const trace:string[]=[];function install(box:{field:{value:string}},value:{value:string}){Object.defineProperty(box,"field",{value})}const a={field:{value:"safe"}};function rhs(){trace.push("arg");return {get value(){trace.push("get");if(fail)throw "sentinel";return "donor"}}}install(a,rhs());try{trace.push(a.field.value)}catch(e){trace.push(String(e))}return trace}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/reflective-input-order.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			sourceNodeScript(t, response.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.deepEqual(Array.from(out.run(false)),['arg','get','donor']);assert.deepEqual(Array.from(out.run(true)),['arg','get','sentinel']);`)
		})
	}
}

// Formal member inputs already carry the selected factory allocation/capture.
// Only that represented relation can distinguish two uses of the same return AST.
func TestReflectiveWriterProjectedCreatorContexts(t *testing.T) {
	for _, same := range []bool{false, true} {
		t.Run(fmt.Sprint(same), func(t *testing.T) {
			read := "b"
			if same {
				read = "a"
			}
			source := `function make(){return {box:{field:{value:"safe"}}}}function install(box:{field:{value:string}},value:{value:string}){Object.defineProperty(box,"field",{value:value})}const donor={get value(){return document.title}};const a=make();const b=make();install(a.box,donor);export const value=` + read + `.box.field.value;`
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reflective-creator-context.ts", Source: source, Diagnostics: "semantic"})
			browser, _ := reentrantInitializerEffects(t, response, source, true)
			if browser != same {
				t.Fatalf("represented creator relation browser=%v want=%v", browser, same)
			}
		})
	}
}

// Comparing a deferred target value must not republish its earlier factory body
// or activated default effects at the later read's independent initializer.
func TestReflectiveTargetProjectionDoesNotReplayInputs(t *testing.T) {
	for _, factory := range []string{
		`function make(){document.title;return {field:{value:"safe"}}}`,
		`function make(input=document.title){return {field:{value:"safe"}}}`,
	} {
		t.Run(factory, func(t *testing.T) {
			source := factory + `function install(box:{field:{value:string}},value:{value:string}){Object.defineProperty(box,"field",{value})}const a=make();install(a,{value:"new"});export const value=a.field.value;`
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reflective-target-phase.ts", Source: source, Diagnostics: "semantic"})
			browser, _ := reentrantInitializerEffects(t, response, source, true)
			if browser {
				t.Fatal("target comparison replayed an earlier factory/default effect")
			}
		})
	}
}

// An unavailable selected target return has no allocation certificate. Its raw
// Call origin still receives indexed MAY writes and keeps an independent donor.
func TestReflectiveUnknownTargetReturnKeepsDonor(t *testing.T) {
	const source = `declare function unknownBox():{field:{value:string}};function install(box:{field:{value:string}},value:{value:string}){Object.defineProperty(box,"field",{value})}const box=unknownBox();const donor={get value(){return document.title}};install(box,donor);export const value=box.field.value;`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reflective-unknown-target-return.ts", Source: source, Diagnostics: "semantic"})
	browser, unknown := reentrantInitializerEffects(t, response, source, true)
	if !browser || !unknown {
		t.Fatalf("unknown target lost donor or residual: browser=%v unknown=%v", browser, unknown)
	}
}

// Different factory Calls do not prove distinct New results when one selected
// constructor can return the other receiver. Both creating contexts need the law.
func TestReflectiveCreatorContextCannotExcludeReturningConstructor(t *testing.T) {
	const source = `class Plain{field={value:"safe"}}function make(Ctor:new()=>{field:{value:string}}){return new Ctor()}const b=make(Plain);class Reuse{field={value:"safe"};constructor(){return b}}const a=make(Reuse);function install(box:{field:{value:string}},value:{value:string}){Object.defineProperty(box,"field",{value})}const donor={get value(){return document.title}};install(a,donor);export const value=b.field.value;`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reflective-returning-constructor.ts", Source: source, Diagnostics: "semantic"})
	browser, unknown := reentrantInitializerEffects(t, response, source, true)
	if !browser || !unknown {
		t.Fatalf("unqualified constructor excluded possible donor: browser=%v unknown=%v", browser, unknown)
	}
}

// Getter-valued inputs keep their captured body through descriptor shorthand and
// explicit properties. Earlier argument Gets stay with descriptor installation.
func TestReflectiveGetterFormalInputs(t *testing.T) {
	for _, descriptor := range []string{`{get}`, `{get:get}`} {
		for _, row := range []struct {
			name, setup, getter string
			browser             bool
		}{
			{"captured", `function make(v:{value:string}){return ()=>v}`, `make(donor)`, true},
			{"safe", ``, `()=>({value:'safe'})`, false},
			{"default", ``, `(v=document.title)=>({value:v})`, true},
			{"joined unknown", `declare const choose:boolean;declare function external():{value:string};`, `choose?()=>donor:external`, true},
			{"snapshot", `let chosen=()=>donor;`, `chosen`, true},
			{"earlier Get", `const holder={get reader(){document.title;return ()=>({value:'safe'})}};`, `holder.reader`, false},
		} {
			t.Run(descriptor+"/"+row.name, func(t *testing.T) {
				source := `function install(box:object,get:()=>{value:string}){Object.defineProperty(box,'field',` + descriptor + `)}const target:{field?:{value:string}}={};const donor={get value(){return document.title}};` + row.setup + `install(target,` + row.getter + `);`
				if row.name == "snapshot" {
					source += `chosen=()=>({value:'safe'});`
				}
				source += `export const value=target.field!.value;`
				r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reflective-getter-formal.ts", Source: source, Diagnostics: "semantic"})
				browser, unknown := reentrantInitializerEffects(t, r, source, true)
				if browser != row.browser || !unknown {
					t.Fatal("descriptor getter lost capture, replayed acquisition or lost residual", browser, unknown)
				}
			})
		}
	}
}

func TestReflectiveGetterFormalEmitted(t *testing.T) {
	const source = `export function read(fail:boolean){const trace:string[]=[];function install(box:object,get:()=>{value:string}){Object.defineProperty(box,'field',{get})}let selected={get value(){trace.push('value');if(fail)throw 'stop';return 'browser'}};function make(){trace.push('factory');const saved=selected;return()=>{trace.push('get');return saved}}const box={field:{value:'safe'}};install(box,make());selected={value:'safe'};try{trace.push(box.field.value)}catch(e){trace.push(String(e))}return trace}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/reflective-formal-order.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.deepEqual(Array.from(out.read(false)),['factory','get','value','browser']);assert.deepEqual(Array.from(out.read(true)),['factory','get','value','stop']);`)
		})
	}
}

// Returned New alternatives retain their individual instance identity through
// lowering, including independent descriptor installations on sibling instances.
func TestReflectiveClassWriterInputsEmitted(t *testing.T) {
	const source = `export function run(){class Box{field={value:"safe"}}function make(){return new Box()}function install(box:Box,value:{value:string}){Object.defineProperty(box,"field",{value})}const a=make(),b=make();install(a,{value:"donor"});const first=[a.field.value,b.field.value];install(b,{value:"other"});return [...first,a.field.value,b.field.value,a===b]}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/reflective-class-inputs.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			sourceNodeScript(t, response.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.deepEqual(Array.from(out.run()),['donor','safe','donor','other',false]);`)
		})
	}
}
