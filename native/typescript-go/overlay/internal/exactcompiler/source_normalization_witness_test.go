package exactcompiler

import (
	"strings"
	"testing"
)

// Source witnesses cross normalizer decisions with actual checking and executable lowering.
func TestNormalizationSetupSourceWitnesses(t *testing.T) {
	for _, c := range []struct{ name, prefix, setup string }{
		{"acyclic", "", `this.state.a = props.input; this.state.b = this.state.a + 1;`},
		{"duplicate-destination", "", `if (props.input) this.state.a = props.input; else this.state.a = 2;`},
		{"async-input", "", `this.state.a = await Promise.resolve(props.input);`},
		{"async-local", "", `const value=await Promise.resolve(props.input);this.state.a=value;`},
		{"unary-read", "", `this.state.a = -props.input;`},
		{"nested-path", "", `this.state.object.a = props.input; this.state.b = this.state.object.a;`},
		{"snapshot", `import {peek} from '@exactjs/core';`, `this.state.a = peek(() => this.state.a) + props.input;`},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := c.prefix + `declare class Component<S>{state:S} export function Probe(this:Component<{a:number;b:number;object:{a:number}}>,props:{input:number}){` + c.setup + `return () => <output>{this.state.a}</output>;}`
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				response := NewSession().Execute(Request{ID: c.name + ".tsx", Kind: "compile", Target: target, Source: source})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if response.Code == "" {
					t.Fatal("normalization witness did not reach lowering")
				}
				if c.name == "async-input" && strings.Contains(response.Code, "activateTaskOnceForHost") {
					t.Fatal("compiler-inferred async setup lost reactivation")
				}
			}
		})
	}
}

// Async regions retain setup registrations and share one compiler-owned policy import.
func TestNormalizationAsyncRegionSourceWitnesses(t *testing.T) {
	for _, c := range []struct {
		name, statement string
		registration    bool
	}{
		{"onMount", `this.onMount(()=>1);`, true}, {"onRender", `this.onRender(()=>1);`, true},
		{"onUnmount", `this.onUnmount(()=>1);`, true}, {"onActivate", `this.onActivate(()=>1);`, true},
		{"onDeactivate", `this.onDeactivate(()=>1);`, true}, {"setContext", `this.setContext(token,1);`, true},
		{"ordinary-call", `sideEffect();`, false}, {"ordinary-member", `this.log.info('before await');`, false},
		{"ordinary-expression", `void 0;`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `import {createContext,type Component} from '@exactjs/core';const token=createContext<number>('normalization');function load(){return Promise.resolve(1)}function sideEffect(){return 1}export function One(this:Component<{a:number}>){` + c.statement + `this.state.a=await load();return()=> <p/>;}export async function Two(this:Component<{a:number}>){const value=await load();this.state.a=value;return()=> <p/>;}`
			normalized, err := normalizeAuthoredSource(normalizationTestFile(t, "regions.tsx"), source)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Count(normalized.text, `import { TaskContext as __exactTaskContext }`) != 1 {
				t.Fatal("async regions duplicated policy identity")
			}
			helper := strings.Index(normalized.text, "async function __exactComponentSetupTask_")
			statement := strings.Index(normalized.text, c.statement)
			if helper < 0 || statement < 0 || (statement < helper) != c.registration {
				t.Fatal("setup registration crossed the managed async region")
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", ID: "async-registration.tsx", Source: source, Target: target})
				if response.Error != "" || response.Code == "" {
					t.Fatalf("registration did not reach target lowering: %s", response.Error)
				}
				if len(response.Analysis.Tasks) != 2 {
					t.Fatal("async regions lost independent task ownership")
				}
			}

		})
	}
	for _, body := range []string{
		`this.state.a = await load(); return () => <p/>;`,
		`try { this.state.a = await load(); } catch ({message}) { this.state.error = message; } return () => <p/>;`,
		`const [value,,...rest] = await load(); this.state.a = value; return () => <p/>;`,
		`const {value:renamed} = await load(); this.state.a = renamed; return () => <p/>;`,
		`const compute = async () => { await load(); }; this.state.a = 1; return () => <p/>;`,
	} {
		if _, err := normalizeAuthoredSource(normalizationTestFile(t, "async.tsx"), `export function Probe(this:Component){`+body+`}`); err != nil {
			t.Fatal(err)
		}
	}
}

// Ordinary expressions and rejected callable cycles retain their authored return boundary.
func TestNormalizationCallableReturnSourceWitnesses(t *testing.T) {
	for _, declarations := range []string{
		`function helper(){return () => <p/>;} export function Probe(){return helper();}`,
		`function first(){return second();} function second(){return () => <p/>;} export function Probe(){return first();}`,
		`function first(){return second();} function second(){return first();} export function Probe(this:Component){return first();}`,
		`function helper(){return 1;} export function Probe(this:Component){return helper();}`,
		`function helper(){return;} export function Probe(this:Component){return helper();}`,
		`export function Probe(this:Component){return (() => 1)();}`,
		`export function Probe(this:Component){return unknown();}`,
		`export function Probe(this:Component){return helper.bind(this);}`,
	} {
		if _, err := normalizeAuthoredSource(normalizationTestFile(t, "return.tsx"), declarations); err != nil {
			t.Fatal(err)
		}
	}
}

// Invalid setup patterns fail at authored targets while valid patterns retain defaults and rest.
func TestNormalizationDestructuringSourceWitnesses(t *testing.T) {
	for _, c := range []struct {
		pattern string
		invalid bool
	}{
		{`[this.state.a,,...this.state.rest]`, false},
		{`{value: {nested: this.state.a = 1}, ...this.state.rest}`, false},
		{`[local]`, true}, {`{local}`, true}, {`[...local]`, true},
		{`{...local}`, true}, {`{value:local=1}`, true},
	} {
		_, err := normalizeAuthoredSource(normalizationTestFile(t, "pattern.tsx"), `export function Probe(this:Component){(`+c.pattern+`=values);return () => <p/>;}`)
		if c.invalid != (err != nil) {
			t.Fatalf("pattern %s classification: %v", c.pattern, err)
		}
	}
}

// Pre-bind environment discovery accepts every import form without making host placement claims.
func TestNormalizationEnvironmentSourceWitnesses(t *testing.T) {
	for _, imports := range []string{"import env from 'node:process';", "import 'node:fs';", "import * as env from 'node:process';", "import {version as env} from 'node:process';"} {
		if _, err := normalizeAuthoredSource(normalizationTestFile(t, "environment.tsx"), imports+`export function Probe(this:Component){this.state.a=env;return () => <p/>;}`); err != nil {
			t.Fatal(err)
		}
	}
}

// Collection callback locals remain inside the invocation that supplies their parameters.
func TestNormalizationCallbackScopeLowering(t *testing.T) {
	for _, returned := range []string{"value", "(value)", "value + value", "value?.toFixed(0)"} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			response := NewSession().Execute(Request{
				ID: "callback-scope.tsx", Kind: "compile", Target: target, Diagnostics: "semantic",
				Source: `declare class Component<S>{state:S}export function Probe(this:Component<{step:number}>){this.state.step=1;return()=> <p>{[2].map(input=>{const value=input+this.state.step;return ` + returned + `;})}</p>;}`,
			})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "TS2304" || diagnostic.Code == "TS2552" {
					t.Fatalf("callback local escaped: %#v", diagnostic)
				}
			}
		}
	}
}

// Ordinary callback functions and block arrows publish the same keyed return structure.
func TestNormalizationCallbackBodyShapes(t *testing.T) {
	for _, callback := range []string{
		`input => { const value = input + offset; return value; }`,
		`function(input) { const value = input + offset; return value; }`,
		`input => { const value = input + offset; if (input > 0) return value; return null; }`,
		`input => input + offset`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{
				ID: "callback-body.tsx", Kind: "compile", Target: target, Diagnostics: "semantic",
				Source: `declare class Component<S>{state:S}export function Probe(this:Component<{step:number}>){this.state.step=1;const offset=this.state.step;return()=> <p>{[2].map(` + callback + `)}</p>;}`,
			})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "TS2304" || diagnostic.Code == "TS2552" {
					t.Fatalf("callback body lost scope: %#v", diagnostic)
				}
			}
		}
	}
}
