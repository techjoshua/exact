package exactcompiler

import (
	"encoding/json"
	"strings"
	"testing"
)

func fieldArtifactPrefix() string {
	return `export {};declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
`
}

// Field declaration policy remains authoritative when inference retains only an
// ordinary string type. Whole disclosure and public sibling selection differ.
func TestPolicyClassFieldAggregateQualification(t *testing.T) {
	for _, definition := range []string{
		`const record={label:'public',factory:class{
/** @exact keep=secret */ value='PRIVATE_FIELD_VALUE';}};`,
		`interface Payload{
/** @exact keep=secret */ value:string;label:string}declare const record:Readonly<Payload>;`,
		`class Base{
/** @exact keep=secret */ value='private'}class Derived extends Base{label='public'}declare const record:Derived;`,
	} {
		for _, c := range []struct {
			expression string
			denied     bool
		}{{"record", true}, {"record.label", false}} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "field-aggregate.ts", Source: fieldArtifactPrefix() + definition + `export function work(){console.log(` + c.expression + `);}`, Target: TargetServer})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if hasDiagnosticCode(r.Diagnostics, "EXACT3020") != c.denied {
				t.Fatalf("%s disclosure mismatch: %#v", c.expression, r.Diagnostics)
			}
			if !c.denied && r.Code == "" {
				t.Fatalf("public sibling did not lower: %#v", r.Diagnostics)
			}
		}
	}
}

// A public projection does not authorize delivery of a retained private initializer.
func TestPolicyRetainedFieldInitializerClientArtifact(t *testing.T) {
	for _, field := range []string{
		`value='PRIVATE_FIELD_VALUE' as Protected<string>;`,
		`value=<Protected<string>>'PRIVATE_FIELD_VALUE';`,
		`value:Protected<string>='PRIVATE_FIELD_VALUE' as any;`,
		`value():Protected<string>{return 'PRIVATE_FIELD_VALUE' as any;}`,
		`value():{value:Protected<string>}{return {value:'PRIVATE_FIELD_VALUE' as any}}`,
		`value():{value:Protected<string>}{const value='PRIVATE_FIELD_VALUE' as any;return {value}}`,
		`value():Tagged{return {value:'PRIVATE_FIELD_VALUE'}}`,
		`value():Readonly<Tagged>{return {value:'PRIVATE_FIELD_VALUE'}}`,
		`value():Tagged{const value='PRIVATE_FIELD_VALUE';return {value}}`,
		`value:{value:Protected<string>}={value:'PRIVATE_FIELD_VALUE' as any};`,
		`value:Protected<string>[]=['PRIVATE_FIELD_VALUE' as any];`,
		`value:Promise<Protected<string>>=Promise.resolve('PRIVATE_FIELD_VALUE' as any);`,
		`value:Map<string,Protected<string>>=new Map([['key','PRIVATE_FIELD_VALUE' as any]]);`,
		`value:()=>Protected<string>=()=> 'PRIVATE_FIELD_VALUE' as any;`,
		`value={value:'PRIVATE_FIELD_VALUE' as any} satisfies {value:Protected<string>};`,
		`/** @exact keep=secret */ value='PRIVATE_FIELD_VALUE';`,
		`/** @exact keep=secret */ get value(){return 'PRIVATE_FIELD_VALUE';}`,
	} {
		source := fieldArtifactPrefix() + `interface Tagged{
/** @exact keep=secret */ value:string}
const record={label:'public',factory:class{
` + field + `}};export function work(){console.log(record.label);}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "retained-field.ts", Source: source, Target: TargetClient, SourceMap: true})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		if !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
			t.Fatalf("retained qualified initializer (%s) was delivered: diagnostics=%#v code=%v map=%v", field, r.Diagnostics, r.Code != "", r.SourceMap != nil)
		}
	}
}

// A dead pure definition can be removed, while an ambient public projection
// has no private initializer to deliver. Both remain valid client artifacts.
func TestPolicyFieldArtifactSafeClientControls(t *testing.T) {
	for _, definition := range []string{
		`const unused=class{value='PRIVATE_FIELD_VALUE' as Protected<string>};export function work(){return 'public'}`,
		`class Unused{value='PRIVATE_FIELD_VALUE' as Protected<string>}export function work(){return 'public'}`,
		`const record={label:'public',factory:class{value:Promise<unknown>=Promise.resolve('ordinary' as any)}};export function work(){console.log(record.label)}`,
		`const record={label:'public',factory:class{value:ThisType<Protected<string>>={}}};export function work(){console.log(record.label)}`,
		`function unused(){return class{value='PRIVATE_FIELD_VALUE' as Protected<string>}}export function work(){return 'public'}`,
		`function unused(n=0):unknown{return n?unused(n-1):class{value='PRIVATE_FIELD_VALUE' as Protected<string>}}export function work(){return 'public'}`,
		`function left():unknown{return right()}function right():unknown{return Math.random()?left():class{value='PRIVATE_FIELD_VALUE' as Protected<string>}}export function work(){return 'public'}`,
		`declare const record:{label:string;factory:new()=>{value:Protected<string>}};export function work(){return record.label}`,
		`const Kept=class{value='PRIVATE_FIELD_VALUE' as Protected<string>};export const registry={Kept};export function work(){return 'public'}`,
		`const Kept=class{value='PRIVATE_FIELD_VALUE' as Protected<string>};export const registry={factory:Kept};export function work(){return 'public'}`,
	} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "safe-field.ts", Source: fieldArtifactPrefix() + definition, Target: TargetClient, SourceMap: true})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
			t.Fatalf("safe client artifact rejected: %s %#v", r.Error, r.Diagnostics)
		}
		data, _ := json.Marshal(r.SourceMap)
		if strings.Contains(r.Code, "PRIVATE_FIELD_VALUE") || strings.Contains(string(data), "PRIVATE_FIELD_VALUE") {
			t.Fatal("dead private initializer retained in code or map")
		}
	}
}

// Dead-definition projection must preserve exported bindings and creation effects.
func TestPolicyFieldArtifactRetainedDefinitionControls(t *testing.T) {
	for _, definition := range []string{
		`const unused=class{value='PRIVATE_FIELD_VALUE' as Protected<string>};export {unused};`,
		`export class Kept{value='PRIVATE_FIELD_VALUE' as Protected<string>}`,
		`const unused=class{static effect=console.log('effect');value='PRIVATE_FIELD_VALUE' as Protected<string>};`,
		`const unused=class{static{console.log('effect')}value='PRIVATE_FIELD_VALUE' as Protected<string>};`,
		`const unused=class extends (class{}){value='PRIVATE_FIELD_VALUE' as Protected<string>};`,
		`export let effects=0;const unused=class{[(effects++, 'key')](){};value='PRIVATE_FIELD_VALUE' as Protected<string>};`,
		`const unused={...{},factory:class{value='PRIVATE_FIELD_VALUE' as Protected<string>}};`,
		`const unused=class{value='PRIVATE_FIELD_VALUE' as Protected<string>};eval('void unused');`,
		`const unused=class{value='PRIVATE_FIELD_VALUE' as Protected<string>};export type Shape=InstanceType<typeof unused>;`,
	} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "retained-definition.ts", Target: TargetClient, SourceMap: true, Source: fieldArtifactPrefix() + definition + `export function work(){return 'public'}`})
		if r.Error != "" || !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
			t.Fatalf("retained definition lost protection (%s): %s %#v", definition, r.Error, r.Diagnostics)
		}
	}
}

// Qualification plans belong to the current source generation, including maps.
func TestPolicyFieldArtifactSessionReplacement(t *testing.T) {
	session := NewSession()
	for _, reset := range []bool{false, true} {
		for _, secret := range []bool{true, true, false, false, true, true} {
			if reset {
				session.Execute(Request{Kind: "reset"})
			}
			field := `value='public'`
			if secret {
				field = `/** @exact keep=secret */ value='PRIVATE_FIELD_VALUE'`
			}
			r := session.Execute(Request{Kind: "compile", ID: "replaced-field.ts", Target: TargetClient, SourceMap: true, Source: `export {};const record={label:'public',factory:class{
` + field + `}};export function work(){return record.label}`})
			if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT3022") != secret {
				t.Fatalf("stale qualification: %s %#v", r.Error, r.Diagnostics)
			}
			if secret {
				if r.Code != "" || r.SourceMap != nil {
					t.Fatal("secret generation emitted")
				}
			} else if r.Code == "" || r.SourceMap == nil || len(r.SourceMap.SourcesContent) == 0 {
				t.Fatalf("public generation lost artifact: %#v", r.Diagnostics)
			}
		}
	}
}

// Client execution preserves live public siblings and ordinary effects while a
// shadowed private binding is removed without executing its deferred initializer.
func TestPolicyFieldArtifactPublicEmittedSemantics(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		source := fieldArtifactPrefix() + `let reads=0,constructed=0;
const unused=class{value='PRIVATE_FIELD_VALUE' as Protected<string>;constructor(){constructed++}},record={get label(){reads++;return 'public'},factory:class{value='public';constructor(){constructed++}}};
export function work(){const unused='local';console.log(record.label);return {reads,constructed,unused}};`
		r := NewSession().Execute(Request{Kind: "compile", ID: "field-execution.ts", Source: source, Target: target, SourceMap: true})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
			t.Fatalf("safe execution rejected: %s %#v", r.Error, r.Diagnostics)
		}
		if target == TargetClient {
			data, _ := json.Marshal(r.SourceMap)
			if strings.Contains(r.Code, "PRIVATE_FIELD_VALUE") || strings.Contains(string(data), "PRIVATE_FIELD_VALUE") {
				t.Fatal("private definition delivered")
			}
		}
		sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm');const logs=[];const sandbox={exports:{},console:{log:v=>logs.push(v)}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);const r=sandbox.exports.work();if(r.reads!==1||r.constructed!==0||r.unused!=='local'||JSON.stringify(logs)!=='["public"]')throw Error(JSON.stringify({r,logs}));`)
	}
}

// A server task's erased body is not a retained client initializer. Its source
// map must not republish the authored server body after successful projection.
func TestPolicyFieldArtifactServerTaskProjection(t *testing.T) {
	source := fieldArtifactPrefix() + `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{}>){const run=(task:TaskContext=TaskContext.server())=>{const privateFactory=class{value='PRIVATE_FIELD_VALUE' as Protected<string>};void privateFactory;};return()=> <button onClick={()=>run()}>Run</button>;}`
	r := NewSession().Execute(Request{Kind: "compile", ID: "field-task.tsx", Source: source, Target: TargetClient, SourceMap: true, ServerComponents: true})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatalf("server projection rejected: %s %#v", r.Error, r.Diagnostics)
	}
	data, _ := json.Marshal(r.SourceMap)
	if strings.Contains(r.Code, "PRIVATE_FIELD_VALUE") || strings.Contains(string(data), "PRIVATE_FIELD_VALUE") {
		t.Fatal("server body delivered in client artifact")
	}
}

// Leaf selection remains protected independently of whole-record qualification.
func TestPolicyFieldArtifactLeafDisclosure(t *testing.T) {
	for _, expression := range []string{"record", "new record.factory()", "(new record.factory()).value"} {
		source := `export {};const record={label:'public',factory:class{
/** @exact keep=secret */ value='private'}};export function work(){console.log(` + expression + `);}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "field-leaf.ts", Source: source, Target: TargetServer})
		if r.Error != "" || !hasDiagnosticCode(r.Diagnostics, "EXACT3020") || r.Code != "" {
			t.Fatalf("field disclosure accepted: %s %#v", r.Error, r.Diagnostics)
		}
	}
}

// Constructor writes and annotated deferred methods retain the same declaration
// policy as a field initializer, even when the assigned value is an ordinary string.
func TestPolicyFieldArtifactDeferredAssignment(t *testing.T) {
	for _, members := range []string{
		`/** @exact keep=secret */ value:string;constructor(){this.value='PRIVATE_FIELD_VALUE'}`,
		`/** @exact keep=secret */ value:string;constructor(){this['value']='PRIVATE_FIELD_VALUE'}`,
		`/** @exact keep=secret */ value(){return 'PRIVATE_FIELD_VALUE'}`,
		`/** @exact keep=secret */ value!:string;constructor(){[this.value]=['PRIVATE_FIELD_VALUE' as any]}`,
		`/** @exact keep=secret */ value!:string;constructor(){({value:this.value}={value:'PRIVATE_FIELD_VALUE' as any})}`,
		`/** @exact keep=secret */ value!:string;constructor(){for(this.value of ['PRIVATE_FIELD_VALUE' as any]){}}`,
		`/** @exact keep=secret */ value!:string;constructor(){for(this.value in {'PRIVATE_FIELD_VALUE':true}){}}`,
	} {
		members = strings.ReplaceAll(members, "constructor(){", "constructor(){constructed++;")
		members = strings.ReplaceAll(members, "value(){return", "value(){constructed++;return")
		source := `export {};let reads=0,constructed=0;const record={get label(){reads++;return 'public'},factory:class{
` + members + `}};export function work(){console.log(record.label);return {reads,constructed}}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "deferred-field-write.ts", Source: source, Target: TargetClient, SourceMap: true})
		if r.Error != "" || !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
			t.Fatalf("qualified deferred body delivered (%s): %s %#v", members, r.Error, r.Diagnostics)
		}
		server := NewSession().Execute(Request{Kind: "compile", ID: "deferred-field-write.ts", Source: source, Target: TargetServer})
		if server.Error != "" || hasErrorDiagnostic(server.Diagnostics) || server.Code == "" {
			t.Fatalf("public sibling rejected: %s %#v", server.Error, server.Diagnostics)
		}
		sourceNodeScript(t, server.Code, `const fs=require('node:fs'),vm=require('node:vm');const logs=[];const sandbox={exports:{},console:{log:v=>logs.push(v)}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);const r=sandbox.exports.work();if(r.reads!==1||r.constructed!==0||JSON.stringify(logs)!=='["public"]')throw Error(JSON.stringify({r,logs}));`)
	}
}

// An unknown computed destination can reach a known qualified field. A narrowed
// public key must retain its independent policy instead of inheriting a sibling's.
func TestPolicyFieldArtifactComputedDestination(t *testing.T) {
	for _, c := range []struct {
		generic, key string
		denied       bool
	}{
		{"", "string", true}, {"", "'value'", true}, {"", "'label'", false},
		{"", "'label'|'other'", false}, {"", "'label'|'value'", true},
		{"<K extends 'label'>", "K", false}, {"<K extends 'value'>", "K", true},
	} {
		source := `export {};const record={label:'public',factory:class` + c.generic + `{[key:string]:unknown;
/** @exact keep=secret */ value!:string;label!:string;other!:string;constructor(key:` + c.key + `){this[key]='PRIVATE_FIELD_VALUE' as any;}}};export function work(){console.log(record.label)}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "computed-field.ts", Source: source, Target: TargetClient, SourceMap: true})
		if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT3022") != c.denied {
			t.Fatalf("computed destination %s %s: %s %#v", c.generic, c.key, r.Error, r.Diagnostics)
		}
		if c.denied {
			if r.Code != "" || r.SourceMap != nil {
				t.Fatal("qualified write delivered")
			}
		} else if r.Code == "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatalf("public write rejected: %#v", r.Diagnostics)
		}
	}
}

// Native data-carrier recursion retains an incomplete obligation. Finite nested
// public instantiations must complete without an arbitrary depth or width budget.
func TestPolicyFieldArtifactRecursiveNativeCarriers(t *testing.T) {
	for _, c := range []struct {
		definition, valueType string
		denied                bool
	}{
		{`type Growing<T extends unknown[]>=Array<T['length'] extends 12?Protected<string>:Growing<[...T,0]>>;`, `Growing<[]>`, true},
		{`type Wrap<T>=Array<T>;`, `Wrap<Wrap<Wrap<Wrap<Wrap<string>>>>>`, false},
	} {
		source := fieldArtifactPrefix() + c.definition + `const record={label:'public',factory:class{value:` + c.valueType + `=[]}};export function work(){console.log(record.label)}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "recursive-data-carrier.ts", Source: source, Target: TargetClient, SourceMap: true})
		if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT3022") != c.denied {
			t.Fatalf("carrier %s: %s %#v", c.valueType, r.Error, r.Diagnostics)
		}
		if c.denied {
			if r.Code != "" || r.SourceMap != nil {
				t.Fatal("incomplete carrier emitted")
			}
		} else if r.Code == "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatalf("finite public carrier rejected: %#v", r.Diagnostics)
		}
	}
}
