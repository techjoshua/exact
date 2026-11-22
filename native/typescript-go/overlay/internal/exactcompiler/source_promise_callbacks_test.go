package exactcompiler

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The executor runs during construction even when a component helper discards the Promise.
func TestComponentTaskQualifiedPromiseExecutor(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name, constructor, body string
		browser                 bool
	}{
		{"portable", "globalThis.Promise", "", false},
		{"browser", "globalThis.Promise", "document.title = 'ready';", true},
		{"element", "globalThis['Promise']", "document.title = 'ready';", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := fmt.Sprintf(`import {type Component, TaskContext} from '@exactjs/core';
function select(){void new %s<void>(resolve=>{%s resolve()});return 'done'}
export function Page(this:Component<{label:string}>){
	this.state.label='';
	const run=(task:TaskContext=TaskContext.server())=>{this.state.label=select()};
	return ()=> <button onClick={()=>run()}>{this.state.label}</button>
}`, test.constructor, test.body)
			r := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, ID: filepath.Join(root, "promise-task.tsx"), Source: source, ConfigFile: timeSemanticConfig(t), Diagnostics: "semantic"})
			assertComponentCallbackPolicy(t, r, test.browser)
		})
	}
}

// A task can settle a Promise through the resolver saved by its eager executor.
// A descriptor on a fresh object must leave the task's placement available.
func TestComponentTaskSavedPromiseResolver(t *testing.T) {
	const isolated = `Object.defineProperty({}, "Promise", {value: class Foreign{}});`
	for _, row := range []struct {
		name, setup, executor string
		browser               bool
	}{
		{"portable", "", "", false},
		{"isolated descriptor", isolated, "", false},
		{"dormant browser work", isolated, "const dormant=()=>{document.title='dormant'};", false},
		{"reached browser work", isolated, "document.title='executor';", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {type Component, TaskContext} from '@exactjs/core';
function select(){` + row.setup + `
	let notify:()=>void=()=>undefined;
	void new Promise<void>(resolve=>{` + row.executor + `notify=resolve});
	notify();
	return 'done';
}
export function Page(this:Component<{label:string}>){
	this.state.label='';
	const run=(task:TaskContext=TaskContext.server())=>{this.state.label=select()};
	return ()=> <button onClick={()=>run()}>{this.state.label}</button>
}`
			f := newPublicAwaitRequiredFixture(t, source)
			for _, kind := range []string{"application", "library"} {
				t.Run(kind, func(t *testing.T) {
					request := f.request("compile", "entry.tsx")
					request.Target, request.PackageType = TargetServer, kind
					r := NewSession().Execute(request)
					assertComponentCallbackPolicy(t, r, row.browser)
				})
			}
		})
	}
}

// Standard executor inputs retain their callable origin across module assignments.
// Every initial/replacement alternative and the executor's actual body still matters.
func TestPromiseExecutorCallableProvenance(t *testing.T) {
	for _, test := range []struct {
		name, source, required string
		opaque                 bool
	}{
		{"initial and reset", `let notify:()=>void=()=>undefined;export function reset(){new Promise<void>(resolve=>{notify=resolve;});}export function wait(){notify();}wait();`, "", false},
		{"repeated reset", `let notify:()=>void=()=>undefined;function reset(){new Promise<void>(resolve=>{notify=resolve;});}reset();reset();notify();`, "", false},
		{"separate constructors", `let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve;});new Promise<void>(resolve=>resolve());notify();`, "", false},
		{"conditional writer", `declare const choice:boolean;let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{if(choice)notify=resolve;});notify();`, "", false},
		{"captured forwarding", `let notify:(v:number)=>void=()=>undefined;new Promise<number>(resolve=>{notify=input=>resolve(input)});notify(2);`, "", false},
		{"executor body", `new Promise<void>(resolve=>{document.title="executor";resolve();});`, "browser", false},
		{"reassigned input", `new Promise<void>(resolve=>{resolve=()=>{document.title="replacement"};resolve();});`, "browser", false},
		{"explicit this input", `let notify:(v:unknown)=>void=()=>undefined;new Promise<unknown>(function(this:void,resolve){notify=resolve;});notify({get then(){document.title="then";return undefined;}});`, "browser", false},
		{"unknown producer", `declare const foreign:()=>void;declare const choice:boolean;let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve;});if(choice)notify=foreign;notify();`, "unknown", true},
		{"shadow constructor", `declare const Promise:{new(executor:(resolve:()=>void)=>void):object};let notify:()=>void=()=>undefined;new Promise(resolve=>{notify=resolve;});notify();`, "unknown", true},
		{"unknown executor", `declare const executor:(resolve:()=>void)=>void;new Promise<void>(executor);`, "unknown", true},
		{"generator executor", `let notify:()=>void=()=>undefined;new Promise<void>(function*(resolve){notify=resolve;document.title="generator";});notify();`, "unknown", true},
		{"isolated reflection", `Object.defineProperty({},"Promise",{value:class Foreign{}});let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve;});notify();`, "", false},
	} {
		t.Run(test.name, func(t *testing.T) { assertPromiseSourceRequirements(t, test.source, test.required, test.opaque) })
	}
}

// Ordinary invocation normalization is shared by source bodies and intrinsic
// inputs. A finite empty apply vector is never an unresolved argument vector.
func TestPromiseResolverOrdinaryInvocationParity(t *testing.T) {
	for _, form := range []struct{ name, call string }{
		{"direct", `notify(ARG)`},
		{"call", `notify.call(undefined,ARG)`},
		{"apply", `notify.apply(undefined,[ARG])`},
	} {
		for _, input := range []struct{ name, argument, required string }{
			{"primitive", `2`, ""},
			{"undefined", `undefined`, ""},
			{"argument Get", `({get value(){return document.title}}).value`, "browser"},
			{"then Get", `{get then(){document.title="getter";return undefined}}`, "browser"},
			{"then body", `{then(){document.title="body"}}`, "browser"},
		} {
			t.Run(form.name+"/"+input.name, func(t *testing.T) {
				source := `let notify:(v:unknown)=>void=()=>undefined;new Promise<unknown>(resolve=>{notify=resolve;});` + strings.ReplaceAll(form.call, "ARG", input.argument) + `;`
				assertPromiseSourceRequirements(t, source, input.required, false)
			})
		}
		t.Run(form.name+"/ordinary body", func(t *testing.T) {
			assertPromiseSourceRequirements(t, `let notify=(input:unknown)=>{document.title="ordinary"};`+strings.ReplaceAll(form.call, "ARG", `2`)+`;`, "browser", false)
		})
		t.Run(form.name+"/replaced body", func(t *testing.T) {
			assertPromiseSourceRequirements(t, `let notify:(input:unknown)=>void=()=>undefined;notify=()=>{document.title="replacement"};`+strings.ReplaceAll(form.call, "ARG", `2`)+`;`, "browser", false)
		})
	}
	for _, expression := range []string{`saved(2)`, `saved.call(undefined,2)`, `saved.apply(undefined,[2])`} {
		t.Run("borrowed/"+expression, func(t *testing.T) {
			assertPromiseSourceRequirements(t, `let notify:(v:unknown)=>void=()=>undefined;new Promise<unknown>(resolve=>{notify=resolve});const holder={callback:notify};const saved=holder.callback;`+expression+`;`, "", false)
		})
	}
	assertPromiseSourceRequirements(t, `let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve});const receiver={get value(){document.title="receiver";return undefined}};notify.call(receiver.value);`, "browser", false)
	assertPromiseSourceRequirements(t, `let notify:(v:unknown)=>void=()=>undefined;new Promise<unknown>((resolve,reject)=>{notify=reject});const argument={get value(){document.title="argument";return undefined}};notify(argument.value);`, "browser", false)
	for _, invocation := range []string{`notify()`, `notify.call(undefined)`, `notify.apply(undefined,[])`} {
		t.Run("empty/"+invocation, func(t *testing.T) {
			assertPromiseSourceRequirements(t, `let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve;});`+invocation+`;`, "", false)
		})
	}
	assertPromiseSourceRequirements(t, `declare const inputs:[unknown];let notify:(v:unknown)=>void=()=>undefined;new Promise<unknown>(resolve=>{notify=resolve;});notify.apply(undefined,inputs);`, "unknown", true)
	assertPromiseSourceRequirements(t, `let notify:(v:unknown)=>void=()=>undefined;new Promise<unknown>((resolve,reject)=>{notify=reject;});notify({get then(){document.title="not assimilated";return undefined}});`, "", false)
	// Reflective descriptors retain the existing incomplete-operation contract.
	assertPromiseSourceRequirements(t, `let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve;});Object.defineProperty(notify,"call",{get(){document.title="lookup";return ()=>undefined}});notify.call(undefined);`, "browser", true)
	assertPromiseSourceRequirements(t, `let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{const holder={get callback(){document.title="lookup";return resolve}};notify=holder.callback;});notify();`, "browser", false)
}

// Requirements are observable effect facts, not printed implementation details.
// Both targets must retain known host requirements alongside any uncertainty.
func assertPromiseSourceRequirements(t *testing.T, source, required string, opaque bool) {
	t.Helper()
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/promise-input.tsx", Source: source + `export {};`, Target: target, Diagnostics: "semantic"})
		if response.Error != "" {
			t.Fatalf("request failed: %s", response.Error)
		}
		environments := map[string]bool{}
		for _, callable := range response.Analysis.Callables {
			if callable.Kind == "module-initializer" {
				for _, effect := range callable.EffectSources {
					environments[effect.Environment] = true
				}
			}
		}
		if required != "" && !environments[required] {
			t.Fatalf("lost %s requirement: %#v", required, response.Analysis.Callables)
		}
		if required == "" && len(environments) != 0 {
			t.Fatalf("unexpected requirements: %#v", environments)
		}
		found := false
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Code == "EXACT2101" {
				found = true
				continue
			}
			if diagnostic.Severity == "error" {
				t.Fatalf("invalid witness: %#v", response.Diagnostics)
			}
		}
		if opaque && !environments["unknown"] {
			t.Fatalf("unavailable source gained portability: %#v", response.Diagnostics)
		}
		if required == "" && found {
			t.Fatalf("ordinary settlement rejected: %#v", response.Diagnostics)
		}
	}
}

// Compilation consumes the target library's Promise contract. Installing a
// conforming implementation never requires auditing its implementation body.
func TestPromiseBuiltinContractAcrossSourceEntries(t *testing.T) {
	for _, source := range []string{
		`function install(value:PromiseConstructor){globalThis.Promise=value}install(Promise);let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve});notify();`,
		`declare const alternative:PromiseConstructor;function install(value:PromiseConstructor){globalThis.Promise=value}install(alternative);function run(){let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve});notify()}run();`,
		`declare const unknownWork:()=>void;function unused(){unknownWork()}function run(){let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve});notify()}run();`,
		`function run(){let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{globalThis.Promise=Promise;notify=resolve});notify()}run();`,
		`function run(){let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve});globalThis.Promise=Promise;notify()}run();run();`,
	} {
		assertPromiseSourceRequirements(t, source, "", false)
	}
	assertPromiseSourceRequirements(t, `function install(value:PromiseConstructor){document.title="install";globalThis.Promise=value}install(Promise);new Promise<void>(resolve=>resolve());`, "browser", false)
}

// apply performs element Gets even when the callee never observes its formal.
// Reflective descriptors keep their existing incomplete provenance beside known
// effects, for ordinary bodies and intrinsic inputs under the same invocation plan.
func TestInvocationVectorMaterializationEffects(t *testing.T) {
	for _, setup := range []string{`function notify(value:unknown){}`, `let notify:(value:unknown)=>void=()=>undefined;new Promise<unknown>((resolve,reject)=>{notify=resolve});`, `let notify:(value:unknown)=>void=()=>undefined;new Promise<unknown>((resolve,reject)=>{notify=reject});`} {
		for _, call := range []string{`notify(args[0]);`, `notify.call(undefined,args[0]);`, `notify.apply(undefined,args);`} {
			assertPromiseSourceRequirements(t, setup+`const args:[unknown]=[2];Object.defineProperty(args,"0",{get(){document.title="read";return 2}});`+call, "browser", true)
		}
		for _, call := range []string{`notify(2);`, `notify.call(undefined,2);`, `notify.apply(undefined,[2]);`} {
			assertPromiseSourceRequirements(t, setup+call, "", false)
		}
	}
	assertPromiseSourceRequirements(t, `function notify(value:unknown){}declare const args:[unknown];notify.apply(undefined,args);`, "unknown", true)
}

// Authored call/apply methods retain their raw input contracts.
func TestAuthoredApplyDoesNotMaterializeNativeInputs(t *testing.T) {
	assertPromiseSourceRequirements(t, `let notify:(value:unknown)=>void=()=>{};notify.apply=(_receiver:unknown,_args?:unknown)=>{throw 0};const args:[unknown]=[2];Object.defineProperty(args,"0",{get(){document.title="unread";return 2}});notify.apply(undefined,args);`, "", false)
}

// A complete finite vector's data slot is not a Get of its stored object's then.
// Reject and an ordinary unused formal share those materialization effects.
func TestRejectedFiniteVectorDoesNotAssimilateStoredValue(t *testing.T) {
	for _, setup := range []string{
		`let notify:Function & ((value:unknown)=>void)=()=>undefined;`,
		`let notify:Function & ((value:unknown)=>void)=()=>undefined;new Promise<unknown>((resolve,reject)=>{notify=reject});`,
	} {
		assertPromiseSourceRequirements(t, setup+`const args={length:1,0:{get then(){document.title="unread";return undefined}}};notify.apply(undefined,args);`, "", false)
	}
}

// Conditional own-method replacement keeps the original native-adapter path as
// well as the authored path. Completed replacement removes only that old path.
func TestOrdinaryAdapterMayReplacementRetainsRequirements(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, method := range []string{"call", "apply"} {
		for _, conditional := range []bool{true, false} {
			setup := `/// <reference types="node"/>
declare const choose:boolean;let notify:(value:unknown)=>void=()=>{process.cwd()};`
			if conditional {
				setup += `if(choose)`
			}
			parameters := `(_receiver:unknown,_args?:unknown)`
			if method == "call" {
				parameters = `(_receiver:unknown,..._args:unknown[])`
			}
			setup += `notify.` + method + `=` + parameters + `=>{document.title="client";throw 0};`
			argument := `2`
			if method == "apply" {
				argument = `[2]`
			}
			source := setup + `notify.` + method + `(undefined,` + argument + `);export {};`
			for _, target := range []Target{TargetClient, TargetServer} {
				request := Request{Kind: "analyze", ID: filepath.Join(root, "adapter-alternatives.ts"), ConfigFile: config, Source: source, Target: target, Diagnostics: "semantic"}
				response := NewSession().Execute(request)
				raw, _ := json.Marshal(struct {
					Request  Request
					Response Response
				}{request, response})
				t.Log(string(raw))
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity == "error" && diagnostic.Code != "EXACT2101" {
						t.Fatalf("invalid witness: %#v", response.Diagnostics)
					}
				}
				environments := map[string]bool{}
				for _, callable := range response.Analysis.Callables {
					if callable.Kind == "module-initializer" {
						for _, effect := range callable.EffectSources {
							environments[effect.Environment] = true
						}
					}
				}
				if !environments["browser"] || environments["server"] != conditional {
					t.Fatalf("conditional=%v method=%s lost actual alternatives: %#v", conditional, method, environments)
				}
			}
		}
	}
}

// Constructor-supplied functions have the same prototype interference as source
// functions. Direct calls avoid the mutated adapter lookup, not the callable policy.
func TestPromiseResolverPrototypeLookupEffects(t *testing.T) {
	for _, method := range []string{"call", "apply"} {
		prefix := `Object.defineProperty(Function.prototype,"` + method + `",{get(){document.title="lookup";return ()=>undefined}});`
		assertPromiseSourceRequirements(t, prefix+`new Promise<void>(resolve=>resolve());`, "", false)
		call := `resolve.call(undefined)`
		if method == "apply" {
			call = `resolve.apply(undefined,[])`
		}
		assertPromiseSourceRequirements(t, prefix+`new Promise<void>(resolve=>{`+call+`});`, "browser", true)
	}
}

// Type-only dependencies retain ordinary type checking without executing their
// module initializers. Ordinary type checking remains independent.
func TestPromiseTypeOnlyEdgesKeepTypeChecking(t *testing.T) {
	for _, prefix := range []string{`import type {Shape} from "./helper.js";`, `import {type Shape} from "./helper.js";`, `export type {Shape} from "./helper.js";`, `export {type Shape} from "./helper.js";`} {
		root := t.TempDir()
		id := filepath.Join(root, "entry.ts")
		config := filepath.Join(root, "tsconfig.json")
		source := prefix + `let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve});notify();export const stable=1;`
		if strings.HasPrefix(prefix, "import") {
			source += `const checked:Shape={value:2};`
		}
		for name, text := range map[string]string{id: source, filepath.Join(root, "helper.ts"): `declare const replacement:PromiseConstructor;globalThis.Promise=replacement;export interface Shape{readonly value:number}`, config: `{"compilerOptions":{"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext","strict":true,"types":[]},"files":["entry.ts"]}`} {
			if err := os.WriteFile(name, []byte(text), 0600); err != nil {
				t.Fatal(err)
			}
		}
		for _, target := range []Target{TargetClient, TargetServer} {
			request := Request{Kind: "analyze", ID: id, Root: root, ConfigFile: config, Source: source, Target: target, Diagnostics: "semantic"}
			response := NewSession().Execute(request)
			raw, _ := json.Marshal(struct {
				Request  Request
				Response Response
			}{request, response})
			t.Log(string(raw))
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("type-only startup acquired runtime effects: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.HasPrefix(prefix, "import") {
				request.Source = strings.Replace(source, `value:2`, `value:"wrong"`, 1)
				invalid := NewSession().Execute(request)
				raw, _ := json.Marshal(struct {
					Request  Request
					Response Response
				}{request, invalid})
				t.Log(string(raw))
				found := false
				for _, diagnostic := range invalid.Diagnostics {
					if diagnostic.Code == "TS2322" {
						found = true
					} else if diagnostic.Severity == "error" {
						t.Fatalf("unexpected invalid-control diagnostic: %#v", invalid.Diagnostics)
					}
				}
				if !found {
					t.Fatalf("type-only runtime exclusion weakened ordinary types: %#v", invalid.Diagnostics)
				}
			}
		}
	}
}

// Standard acquisition precedes executor execution and later replacement. The
// captured resolver keeps that origin after the global changes.
func TestPromiseAcquisitionRetainsOrigin(t *testing.T) {
	for _, body := range []string{
		`let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{notify=resolve});globalThis.Promise=Promise;notify();`,
		`let notify:()=>void=()=>undefined;new Promise<void>(resolve=>{globalThis.Promise=Promise;notify=resolve});notify();`,
	} {
		assertPromiseSourceRequirements(t, body, "", false)
	}
	for _, argument := range []string{`1n`, `-1`, `"plain"`, "`literal`"} {
		for _, form := range []string{`resolve(ARG)`, `resolve.call(undefined,ARG)`, `resolve.apply(undefined,[ARG])`} {
			assertPromiseSourceRequirements(t, `new Promise<unknown>(resolve=>{`+strings.ReplaceAll(form, "ARG", argument)+`});`, "", false)
		}
	}
}
