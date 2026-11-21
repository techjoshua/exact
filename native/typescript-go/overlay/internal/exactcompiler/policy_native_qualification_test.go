package exactcompiler

import "testing"

// Native payload and authored augmentation members have separate disclosure
// obligations. Library method families cannot make a finite public payload secret.
func TestPolicyNativeAugmentedQualification(t *testing.T) {
	for _, test := range []struct {
		name, declarations, valueType, expression string
		secret                                    bool
	}{
		{"array public", `interface Array<T>{custom():void;label:string}`, `Array<number>`, `candidate`, false},
		{"readonly public", `interface ReadonlyArray<T>{custom():void;label:string}`, `ReadonlyArray<number>`, `candidate`, false},
		{"map public", `interface Map<K,V>{custom():void;label:string}`, `Map<string,number>`, `candidate`, false},
		{"merged public property", `interface Array<T>{length:number;label:string}`, `Array<number>`, `candidate`, false},
		{"merged protected property", `interface Array<T>{
/** @exact keep=secret */ length:number;label:string}`, `Array<number>`, `candidate`, true},
		{"merged protected leaf", `interface Array<T>{
/** @exact keep=secret */ length:number;label:string}`, `Array<number>`, `candidate.length`, true},
		{"merged public sibling", `interface Array<T>{
/** @exact keep=secret */ length:number;label:string}`, `Array<number>`, `candidate.label`, false},
		{"stored whole", `interface Array<T>{extra:Tagged;label:string}`, `Array<number>`, `candidate`, true},
		{"stored public sibling", `interface Array<T>{extra:Tagged;label:string}`, `Array<number>`, `candidate.label`, false},
		{"stored secret leaf", `interface Array<T>{extra:Tagged;label:string}`, `Array<number>`, `candidate.extra.value`, true},
		{"deferred whole", `interface Array<T>{extra():Tagged;label:string}`, `Array<number>`, `candidate`, true},
		{"deferred public sibling", `interface Array<T>{extra():Tagged;label:string}`, `Array<number>`, `candidate.label`, false},
		{"array payload", `interface Array<T>{custom():void}`, `Array<Tagged>`, `candidate`, true},
		{"map payload", `interface Map<K,V>{custom():void}`, `Map<string,Tagged>`, `candidate`, true},
		{"map payload unaugmented size", ``, `Map<string,Tagged>`, `candidate.size`, true},
		{"map payload size", `interface Map<K,V>{custom():void}`, `Map<string,Tagged>`, `candidate.size`, true},
		{"map augmentation", `interface Map<K,V>{extra:Tagged;label:string}`, `Map<string,number>`, `candidate`, true},
		{"map public sibling", `interface Map<K,V>{extra:Tagged;label:string}`, `Map<string,number>`, `candidate.label`, false},
		{"phantom public", `interface Array<T>{custom():void}`, `Array<Phantom<Tagged>>`, `candidate`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `export {};interface Tagged{
/** @exact keep=secret */ value:string}
interface Phantom<T>{label:string}declare global{` + test.declarations + `};declare const candidate:` + test.valueType + `;export function work(){console.log(` + test.expression + `);}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "native-qualification.ts", Source: source, SourceMap: true, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, d := range response.Diagnostics {
				if len(d.Code) > 2 && d.Code[:2] == "TS" {
					t.Fatal("invalid fixture", response.Diagnostics)
				}
			}
			secret := hasDiagnosticCode(response.Diagnostics, "EXACT3003") || hasDiagnosticCode(response.Diagnostics, "EXACT3020")
			if secret != test.secret {
				t.Fatalf("whole/selected qualification=%v want=%v: %#v", secret, test.secret, response.Diagnostics)
			}
			if test.secret && (response.Code != "" || response.SourceMap != nil) {
				t.Fatal("protected disclosure emitted artifact")
			}
			if !test.secret && (hasErrorDiagnostic(response.Diagnostics) || response.Code == "") {
				t.Fatal("public projection did not emit", response.Diagnostics)
			}
		})
	}
}

// Public native API bytes retain ordinary JavaScript alias behavior. Readonly
// remains a TypeScript restriction and cannot freeze the writable backing array.
func TestPolicyNativeAugmentedPublicRuntime(t *testing.T) {
	source := `export {};declare global{interface Array<T>{custom():void}}const backing=[1,2];const view:readonly number[]=backing;export function work(){backing.push(3);return view.map(value=>value*2).join(',')}`
	response := NewSession().Execute(Request{Kind: "compile", ID: "native-public-runtime.ts", Source: source, Diagnostics: "semantic", SourceMap: true})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" || response.SourceMap == nil {
		t.Fatal("public native artifact missing", response.Error, response.Diagnostics)
	}
	sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');const sandbox={exports:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);if(sandbox.exports.work()!=='2,4,6'||sandbox.exports.work()!=='2,4,6,6')throw Error('readonly alias was frozen or detached');`)
}

// Compatibility declarations for browser objects keep authored qualifications
// visible without manufacturing one from recursive native methods.
func TestPolicyNativeAugmentedEventInput(t *testing.T) {
	const compatibility = `declare global {interface HTMLInputElement{} interface File{} interface Blob{} interface ReadableStream<R=any>{}}`
	for _, row := range []struct {
		name, declarations, expression string
		secret                         bool
	}{
		{"public", "", `target.name`, false},
		{"authored field", `declare global {interface HTMLInputElement {
/** @exact keep=secret */
authToken:string}}`, `target.authToken`, true},
		{"merged field", `declare global {interface HTMLInputElement {
/** @exact keep=secret */
name:string}}`, `target.name`, true},
		{"authored method", `declare global {interface HTMLInputElement {authToken():Tagged}}`, `target.authToken()`, true},
		{"authored payload", `declare global {interface File {authToken:Tagged}}`, `target.files?.[0]?.authToken`, true},
		{"stream payload", `declare const stream:ReadableStream<Tagged>;`, `stream`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			root, config := formsSourceFixture(t)
			source := `import {type Component} from '@exactjs/core';
type Tagged={
/** @exact keep=secret */
value:string};
` + compatibility + "\n" + row.declarations + `
export function Page(this:Component<{}>){
  function report(target:HTMLInputElement){console.log(` + row.expression + `);}
  return ()=> <input onClick={event=>{
    if(event.currentTarget instanceof HTMLInputElement)report(event.currentTarget);
  }}/>;
}`
			for _, target := range []Target{TargetClient, TargetServer} {
				response := formsCompileSource(t, root, config, source, target)
				protected := hasDiagnosticCode(response.Diagnostics, "EXACT3003") || hasDiagnosticCode(response.Diagnostics, "EXACT3020")
				if protected != row.secret || hasErrorDiagnostic(response.Diagnostics) != row.secret || (response.Code == "") != row.secret {
					t.Fatal(target, response.Diagnostics)
				}
			}
		})
	}
}
