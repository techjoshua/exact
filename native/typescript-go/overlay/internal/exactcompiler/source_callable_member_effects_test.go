package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"path/filepath"
	"testing"
)

// Source bodies are may-execution edges even when the acquired property remains
// incomplete. Neither that uncertainty nor a checker signature may erase them.
func TestSourceCallablePropertyEffects(t *testing.T) {
	for _, test := range []struct {
		name, source, caller, environment string
		requireUnknown                    bool
	}{
		{"function property", `function f(){return 0}f.run=()=>0;const saved=f;saved.run=()=>document.title.length;export function probe(){return saved.run()}`, "probe", "browser", false},
		{"captured object property", `function f(){return 0}f.run=()=>0;const box={m:f};const saved=box.m;saved.run=()=>document.title.length;export function probe(){return saved.run()}`, "probe", "browser", false},
		{"arrow property", `const f=()=>0;f.run=()=>0;const saved=f;saved.run=()=>document.title.length;export function probe(){return saved.run()}`, "probe", "browser", false},
		{"conditional foreign", `declare const foreign:typeof f;declare const choose:boolean;function f(){return 0}f.run=()=>document.title.length;const saved=choose?f:foreign;export function probe(){return saved.run()}`, "probe", "browser", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/callable-property.ts", Source: test.source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
				}
				var caller *CallableSummary
				bodies := map[string]bool{}
				for i := range response.Analysis.Callables {
					fact := &response.Analysis.Callables[i]
					if fact.Name == test.caller {
						caller = fact
					}
					if fact.DirectEffect == test.environment {
						bodies[fact.ID] = true
					}
				}
				if caller == nil {
					t.Fatal("lost caller")
				}
				edge, effect, unknown := false, false, false
				for _, call := range caller.Calls {
					edge = edge || bodies[call.TargetID]
				}
				for _, source := range caller.EffectSources {
					effect = effect || source.Environment == test.environment
					unknown = unknown || source.Environment == "unknown"
				}
				if !edge || !effect || test.requireUnknown && !unknown {
					t.Fatalf("lost body edge/effect or unresolved alternative: %#v", caller)
				}
			}
		})
	}
}

// Operating on a property and invoking it have different execution obligations.
func TestSourceCallablePropertyNonInvocation(t *testing.T) {
	prefix := `function f(){return 0}f.run=()=>document.title.length;const saved=f;`
	for _, test := range []struct{ name, body string }{
		{"direct function", `export const value=saved()`},
		{"read", `export const value=typeof saved.run`},
		{"write", `saved.run=()=>1;export const value="safe"`},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, prefix+test.body+";", "isomorphic") })
	}
}

// A computed name executes in the enclosing region. Its body's later execution
// must not own an earlier descriptor mutation, including reached nested regions.
func TestSourceCallableComputedNameEffects(t *testing.T) {
	prefix := `function f(){}f.run=()=>0;function patch():string{Object.defineProperty(f,"run",{get(){return document.title}});return "key"}`
	for _, test := range []struct{ name, middle, placement string }{
		{"method", `const unused={ [patch()](){} };`, "unknown"},
		{"getter", `const unused={ get [patch()](){return 0} };`, "unknown"},
		{"setter", `const unused={ set [patch()](value:number){} };`, "unknown"},
		{"reached nested name", `function make(){return { [patch()](){} }}make();`, "unknown"},
		{"deferred nested name", `function make(){return { [patch()](){} }}`, "isomorphic"},
		{"deferred method", `const unused={ method(){patch()} };`, "isomorphic"},
		{"deferred getter", `const unused={ get method(){patch();return 0} };`, "isomorphic"},
		{"deferred setter", `const unused={ set method(value:number){patch()} };`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := prefix + test.middle + `export const value=typeof f.run;`
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/computed-name.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid authored fixture: %s %#v", response.Error, response.Diagnostics)
			}
			found := false
			for _, export := range response.Analysis.Exports {
				if export.Name == "value" {
					found = true
					valid := export.Placement == test.placement
					if test.placement == "unknown" {
						valid = export.Placement == "client" || export.Placement == "unknown"
					}
					if !valid {
						t.Fatalf("placement %s want %s", export.Placement, test.placement)
					}
				}
			}
			if !found {
				t.Fatal("lost export")
			}
		})
	}
}

// Exhausted callee resolution cannot fabricate an empty actual vector or execute
// defaults. Existing invocation/body authority survives the incomplete input plan.
func TestSourceInvocationInputBudgetBoundary(t *testing.T) {
	source := `function read(a=document.title,b=2,c=3,d=4,e=5){return a}export const value=read("safe",2,3,4,5);declare const actuals:Parameters<typeof read>;export const uncertain=read.apply(undefined,actuals);`
	request := Request{Kind: "compile", ID: "/virtual/input-budget.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"}
	session := NewSession()
	response := session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("invalid fixture: %s %#v", response.Error, response.Diagnostics)
	}
	defaultBodyEffect := false
	for _, callable := range response.Analysis.Callables {
		if callable.Name == "read" {
			for _, effect := range callable.EffectSources {
				defaultBodyEffect = defaultBodyEffect || effect.Environment == "browser"
			}
		}
	}
	if !defaultBodyEffect {
		t.Fatal("lost possible browser requirement from formal default")
	}
	checked := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile(request.ID)
		if file == nil || project.callableCache.owner == nil {
			continue
		}
		executable := project.callableCache.owner
		var declaration, call, unknownCall *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsFunctionDeclaration(node) && node.Name() != nil && node.Name().Text() == "read" {
				declaration = node
			}
			if ast.IsCallExpression(node) && ast.IsIdentifier(node.AsCallExpression().Expression) && node.AsCallExpression().Expression.Text() == "read" {
				call = node
			}
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) && node.AsCallExpression().Expression.AsPropertyAccessExpression().Name().Text() == "apply" {
				unknownCall = node
			}
			return true
		})
		if declaration == nil || call == nil {
			t.Fatal("lost source nodes")
		}
		checked = true
		if unknownCall == nil {
			t.Fatal("lost unknown-vector invocation")
		}
		owner := newSourceValueOwner(executable.values.checker)
		owner.index(file)
		q := sourceValueQuery{owner: owner, executable: executable, remaining: 4096, active: make(map[*ast.Node]bool)}
		result := accessorCandidates{declarations: []*ast.Node{declaration}}
		possible := q.bindInputs(declaration, unknownCall, nil, &result)
		defaultEntry := possible.defaults[declaration.Parameters()[0].Initializer()]
		if defaultEntry.bindings == nil || !defaultEntry.conditional {
			t.Fatal("unknown vector lost possible browser default")
		}
		first := owner.checker.GetSymbolAtLocation(declaration.Parameters()[0].Name())
		alternatives := possible.bindings[ast.GetSymbolId(first)]
		knownDefault := false
		for _, value := range alternatives {
			knownDefault = knownDefault || value.node != nil && ast.IsIdentifier(value.node) && value.node.Text() == "document" && len(value.path) == 1 && value.path[0] == "title"
		}
		if !knownDefault {
			t.Fatal("unknown vector lost known default value alternative")
		}
		for _, sourceMethod := range []bool{false, true} {
			for _, budget := range []int{0, 1, 2, 4096} {
				owner := newSourceValueOwner(executable.values.checker)
				owner.index(file)
				q := sourceValueQuery{owner: owner, executable: executable, remaining: budget, active: make(map[*ast.Node]bool), reading: call, invoking: call}
				result := accessorCandidates{declarations: []*ast.Node{declaration}, invocationOwned: true}
				inputs := q.bindInvocationInputs(declaration, call, nil, &result, sourceMethod)
				if inputs.declaration != declaration || inputs.invocation != call || len(result.declarations) != 1 || result.declarations[0] != declaration || !result.invocationOwned {
					t.Fatal("lost invocation/body authority")
				}
				if q.reading != call || q.invoking != call || q.initializing != nil || len(q.active) != 0 {
					t.Fatal("leaked input context")
				}
				if result.opaque {
					t.Fatalf("successful input binding opaque, method %v", sourceMethod)
				}
				if len(inputs.bindings) != 5 {
					t.Fatalf("lost five actuals: %d", len(inputs.bindings))
				}
				for _, parameter := range declaration.Parameters() {
					symbol := owner.checker.GetSymbolAtLocation(parameter.Name())
					values := inputs.bindings[ast.GetSymbolId(symbol)]
					if len(values) != 1 || values[0].node == nil || values[0].undefined {
						t.Fatal("lost provided actual")
					}
				}
				if inputs.defaults[declaration.Parameters()[0].Initializer()].bindings != nil {
					t.Fatal("provided first actual activated browser default")
				}
			}
		}
	}
	if !checked {
		t.Fatal("source project unavailable")
	}
}

// Ordinary invocation keeps the selected source body and its input scope separate
// from real lookup effects. A receiving module cannot borrow an imported body's
// descriptor history or restore that body over a modeled own method.
func TestImportedInvocationOperationFacts(t *testing.T) {
	cases := []struct{ name, helper, entry, barrel, contract string }{
		{`imported-own-call`, `export function read(){return document.title}`, `import {read} from './helper.js';Object.defineProperty(read,'call',{value:()=> 'safe'});export const value=read.call(undefined);`, ``, `replacement`},
		{`imported-call-getter`, `export function read(){return 1}`, `import {read} from './helper.js';Object.defineProperty(read,'call',{get(){return document.title.length?Function.prototype.call:Function.prototype.call}});export const value=read.call(undefined);`, ``, `restricted`},
		{`own-receiver-default`, `export function read(){return document.title}`, `import {read} from './helper.js';Object.defineProperty(read,'call',{value:function(this:typeof read,v='default'){return this===read?v:'wrong'}});export const value=read.call(undefined);`, ``, `replacement`},
		{`getter-mixed`, `export function read(){return document.title}`, `/// <reference types="node"/>
import {read} from './helper.js';const box={get read(){void process.pid;return read}};export function probe(){return box.read.call(undefined)}`, ``, `mixed`},
		{`prototype-getter`, `export function read(){return 1}`, `import {read} from './helper.js';Object.defineProperty(Function.prototype,'apply',{get(){return ()=>document.title},configurable:true});export const value=read.apply(undefined,[]);`, ``, `restricted`},
		{`late-descriptor`, `export function read(){return 1}`, `import {read} from './helper.js';export const value=read.call(undefined);Object.defineProperty(read,'call',{get(){return ()=>document.title}});`, ``, `portable`},
		{`uncalled-descriptor`, `export function read(){return 1}`, `import {read} from './helper.js';function unused(){Object.defineProperty(read,'call',{get(){return ()=>document.title}})}export const value=read.call(undefined);`, ``, `restricted`},
		{`namespace-own-call`, `export function read(){return document.title}`, `import * as helper from './helper.js';Object.defineProperty(helper.read,'call',{value:()=> 'safe'});export const value=helper.read.call(undefined);`, ``, `replacement`},
		{`namespace-barrel-getter`, `export function read(){return 1}`, `import * as ns from './barrel.js';export const value=ns.read.call(undefined);`, `export {read} from './helper.js';import {read} from './helper.js';Object.defineProperty(read,'call',{get(){return ()=>document.title}});`, `restricted`},
		{`namespace-barrel-index`, `export function read(){return 1}`, `import * as ns from './barrel.js';export const value=ns['read'].call(undefined);`, `export {read} from './helper.js';import {read} from './helper.js';Object.defineProperty(read,'call',{get(){return ()=>document.title}});`, `restricted`},
		{`namespace-barrel-alias`, `export function read(){return 1}`, `import * as ns from './barrel.js';const alias=ns;export const value=alias.read.call(undefined);`, `export {read} from './helper.js';import {read} from './helper.js';Object.defineProperty(read,'call',{get(){return ()=>document.title}});`, `restricted`},
		{`namespace-direct`, `export function read(){return 1}`, `import * as ns from './helper.js';export const value=ns.read.call(undefined);`, ``, `portable`},
		{`namespace-barrel-known-body`, `export function read(){return document.title}`, `import * as ns from './barrel.js';export const value=ns.read.call(undefined);`, `export {read} from './helper.js';`, `browser`},
		{`barrel-getter`, `export function read(){return 1}`, `import {read} from './barrel.js';export const value=read.call(undefined);`, `export {read} from './helper.js';import {read} from './helper.js';Object.defineProperty(read,'call',{get(){return ()=>document.title}});`, `restricted`},
		{`throwing-call-getter`, `export const failure=new Error('lookup');export function read(){return 1}`, `import {read,failure} from './helper.js';Object.defineProperty(read,'call',{get(){throw failure}});export const value=read.call(undefined);`, ``, `restricted`},
		{`argument-mutation`, `export function read(value:unknown){return value}`, `import {read} from './helper.js';export const value=read.call(undefined,(Object.defineProperty(read,'call',{value:()=>document.title}),'captured'));`, ``, `portable`},
		{`nested-get-invocation`, `export function read(ignored:{value:string}){return 'safe'}export function side(owner:{value:string}){return owner.value}`, `import {read,side} from './helper.js';const foreign={get value(){return document.title}};const box={get read(){side.call(undefined,{value:'safe'});return read}};export const value=box.read.call(undefined,foreign);`, ``, `portable`},
		{`proxy-callable`, `export function read(){return 1}`, `import {read} from './helper.js';const wrapped=new Proxy(read,{apply(){return document.title}});export const value=wrapped.call(undefined);`, ``, `restricted`},
		{`native-date-opposite`, `export function read(){return 1}`, `export const value=new Date(0).getTime();`, ``, `portable`},
	}
	// An own data-slot override is an ordinary callable for all three adapter
	// spellings. Neither imported identity nor a familiar name restores the
	// intrinsic adapter after the descriptor's conversion has completed.
	for _, method := range []string{"call", "apply", "bind"} {
		arguments := "undefined"
		if method == "apply" {
			arguments += ",[]"
		}
		for _, imported := range []bool{false, true} {
			name, declaration := "local-own-"+method, `function read(){return document.title}`
			if imported {
				name, declaration = "imported-override-"+method, `import {read} from './helper.js';`
			}
			cases = append(cases, struct{ name, helper, entry, barrel, contract string }{
				name, `export function read(){return document.title}`,
				declaration + `Object.defineProperty(read,'` + method + `',{value:()=> 'safe'});export const value=read.` + method + `(` + arguments + `);`, "", "replacement",
			})
		}
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			root, err := os.MkdirTemp(".", ".ordinary-invocation-")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = os.RemoveAll(root) })
			root, err = filepath.Abs(root)
			if err != nil {
				t.Fatal(err)
			}
			files := map[string]string{"helper.ts": c.helper, "entry.ts": c.entry, "tsconfig.json": `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","skipLibCheck":true},"include":["*.ts"]}`}
			if c.barrel != "" {
				files["barrel.ts"] = c.barrel
			}
			for name, source := range files {
				if err = os.WriteFile(filepath.Join(root, name), []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				session := NewSession()
				for _, name := range []string{"helper.ts", "entry.ts"} {
					response := session.Execute(Request{Kind: "compile", ID: filepath.Join(root, name), Source: files[name], Root: root, ConfigFile: filepath.Join(root, "tsconfig.json"), Target: target, Diagnostics: "semantic"})
					if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
						t.Fatalf("%s/%s: %s %#v", target, name, response.Error, response.Diagnostics)
					}
					if name != "entry.ts" {
						if c.contract == "browser" {
							found := false
							for _, callable := range response.Analysis.Callables {
								if callable.Name == "read" && callable.Effect == "browser" {
									found = true
								}
							}
							if !found {
								t.Fatal("lost known definition's browser requirement")
							}
						}
						continue
					}
					if c.contract == "mixed" {
						found := false
						for _, callable := range response.Analysis.Callables {
							if callable.Name == "probe" {
								found = true
								if callable.Effect != "mixed" {
									t.Fatalf("lost getter/body conflict: %#v", callable)
								}
							}
						}
						if !found {
							t.Fatal("lost invocation consumer")
						}
						continue
					}
					found := false
					for _, export := range response.Analysis.Exports {
						if export.Name != "value" {
							continue
						}
						found = true
						if c.contract == "portable" && export.Placement != "isomorphic" {
							t.Fatalf("lost acquisition ordering: %#v", export)
						}
						if c.contract == "browser" && export.Placement != "unknown" {
							t.Fatalf("unproved intermediate work lost uncertainty: %#v", export)
						}
						if c.contract == "restricted" && export.Placement != "unknown" && export.Placement != "client" {
							t.Fatalf("unaccounted Get certified portable: %#v", export)
						}
						if c.contract == "replacement" && export.Placement == "client" {
							t.Fatalf("own method inherited browser base body: %#v", export)
						}
					}
					if !found {
						t.Fatal("lost authored export fact")
					}
				}
			}
		})
	}
}

// Descriptor installation and later property evaluation have separate execution owners.
// Known reached bodies survive uncertainty, while deferred definitions cannot affect an eager read.
func TestSourceDescriptorOperationOwnership(t *testing.T) {
	prefix := `function f(){}f.run=()=>0;function install(){Object.defineProperty(f,"run",{get(){document.title="read";return ()=>0}});}`
	cases := []struct {
		name, source, caller string
		neutral              bool
	}{
		{"later install", prefix + `export const value=typeof f.run;install();`, "", true},
		{"conditional install", prefix + `declare const choose:boolean;if(choose)install();typeof f.run;export const value=0;`, "", false},
		{"repeated install", prefix + `install();typeof f.run;install();typeof f.run;export const value=0;`, "", false},
		{"actual deferred entry", prefix + `export function run(){install();return typeof f.run}`, "run", false},
		{"reached setter", `function f(){}f.run=()=>0;function install(){Object.defineProperty(f,"run",{set(value:unknown){document.title="write"}});}install();f.run=()=>1;export const value=0;`, "", false},
	}
	for _, call := range []string{`f.run()`, `f.run.call(undefined)`, `f.run.apply(undefined,[])`} {
		cases = append(cases, struct {
			name, source, caller string
			neutral              bool
		}{call, prefix + `install();` + call + `;export const value=0;`, "", false})
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/descriptor-operation.ts", Source: test.source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity == "error" && diagnostic.Code != "EXACT2101" {
						t.Fatalf("invalid source or emitted code: %#v", diagnostic)
					}
				}
				knownBrowser := false
				for _, fact := range response.Analysis.Callables {
					if test.caller == "" && fact.Kind != "module-initializer" || test.caller != "" && fact.Name != test.caller {
						continue
					}
					for _, effect := range fact.EffectSources {
						knownBrowser = knownBrowser || effect.Environment == "browser"
					}
				}
				if knownBrowser == test.neutral {
					t.Fatalf("descriptor body lost or acquired the wrong execution owner: %#v", response.Analysis.Callables)
				}
				if test.neutral {
					for _, value := range response.Analysis.Exports {
						if value.Name == "value" && value.Placement != "isomorphic" {
							t.Fatalf("later installation contaminated earlier read: %#v", value)
						}
					}
				}
			}
		})
	}
}
