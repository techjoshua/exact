package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// Native integrity changes descriptors, not getter behavior or object identity.
// Refusal cases must retain independently evaluated arguments and getter effects.
func TestNativeFreezeSourceEffects(t *testing.T) {
	for _, test := range []struct {
		name, body, effect string
		browser            bool
	}{
		{"plain-getter", `const o={get value(){return document.title}};return o.value`, "browser", true},
		{"frozen-getter", `const o=Object.freeze({get value(){return document.title}});return o.value`, "browser", true},
		{"plain-data", `const o={value:1};return o.value`, "neutral", false},
		{"frozen-data", `const o=Object.freeze({value:1});return o.value`, "neutral", false},
		{"frozen-shorthand", `const value=1;const o=Object.freeze({value});return o.value`, "neutral", false},
		// Ordinary browser RHS effects match plain literal input relationships.
		{"frozen-named-browser", `const value=document.title;const o=Object.freeze({value:value});return o.value`, "browser", true},
		{"frozen-shorthand-browser", `const value=document.title;const o=Object.freeze({value});return o.value`, "browser", true},
		{"callee-alias", `const freeze=Object.freeze;const o=freeze({get value(){return document.title}});return o.value`, "browser", true},
		{"alias-setter", `const freeze=Object.freeze;const o=freeze({set value(v:string){document.title=v}});(o as {value:string}).value='kept';return 1`, "browser", true},
		{"target-alias-residual-keeps-getter", `const original={get value(){return document.title}};const o=Object.freeze(original);return o.value`, "unknown", true},
		{"getter-write", `const o=Object.freeze({get value(){document.title='kept';return 1}});return o.value`, "browser", true},
		{"getter-throw-effect", `const o=Object.freeze({get value():never{document.title='kept';throw 9}});return o.value`, "browser", true},
		{"shadowed-freeze", `const Object={freeze(input:unknown){document.title='kept';return {value:1}}};return Object.freeze({value:0}).value`, "browser", true},
		{"noncallable-keeps-argument", `const Object={freeze:0 as unknown as (x:unknown)=>unknown};return Object.freeze(document.title)`, "unknown", true},
		{"primitive-residual", `return Object.freeze(1)`, "unknown", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/freeze-effects.ts", Source: `export function read(){` + test.body + `}`, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatalf("invalid fixture: %s %#v", r.Error, r.Diagnostics)
			}
			for _, c := range r.Analysis.Callables {
				if c.Name == "read" {
					browser := false
					for _, e := range c.EffectSources {
						browser = browser || e.Environment == "browser"
					}
					if c.Effect != test.effect || browser != test.browser {
						t.Fatalf("effect=%s browser=%v want %s/%v: %#v", c.Effect, browser, test.effect, test.browser, c)
					}
					return
				}
			}
			t.Fatal("missing original callable")
		})
	}
}

// Execute both maintained emissions. External observation counts the getter's
// browser access without adding a captured counter to the authored getter.
func TestNativeFreezeEmittedIntegrity(t *testing.T) {
	const source = `export const object=Object.freeze({data:'kept',get value(){return window.location.href},set input(value:string){window.document.title=value}});export const alias=object;export function read(){return object.value}export function set(value:string){(object as {input:string}).input=value}export function strictWrite(){(object as {data:string}).data='changed'}export function strictAdd(){(object as unknown as {extra:string}).extra='changed'}export function strictDelete(){delete (object as {data?:string}).data}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/freeze-runtime.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatalf("compile: %s %#v", r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "freeze.mts")
			if err := os.WriteFile(file, []byte(r.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			t.Cleanup(cancel)
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const before=Object.getOwnPropertyDescriptor(globalThis,'window');let reads=0,writes=0;const thrown={};try{Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{get href(){reads++;return 'browser'}},document:{set title(v){assert.equal(v,'written');writes++}}}});const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(reads,0);assert.equal(m.object,m.alias);assert.equal(m.read(),'browser');assert.equal(reads,1);m.set('written');assert.equal(writes,1);assert.equal(Reflect.set(m.alias,'input','written'),true);assert.equal(writes,2);const savedDocument=window.document;window.document={set title(value){throw thrown}};assert.throws(()=>m.set('written'),e=>e===thrown);assert.throws(()=>Reflect.set(m.alias,'input','written'),e=>e===thrown);window.document=savedDocument;assert.equal(Object.isExtensible(m.object),false);assert.equal(Object.getPrototypeOf(m.object),Object.prototype);assert.equal(Object.isFrozen(m.object),true);const data=Object.getOwnPropertyDescriptor(m.object,'data');const value=Object.getOwnPropertyDescriptor(m.object,'value');assert.deepEqual([data.value,data.writable,data.configurable,data.enumerable],['kept',false,false,true]);assert.equal(typeof value.get,'function');assert.deepEqual([value.configurable,value.enumerable],[false,true]);assert.throws(m.strictWrite,TypeError);assert.throws(m.strictAdd,TypeError);assert.throws(m.strictDelete,TypeError);assert.equal(Reflect.set(m.object,'data','changed'),false);assert.equal(Reflect.defineProperty(m.object,'extra',{value:1}),false);assert.equal(Reflect.deleteProperty(m.object,'data'),false);assert.throws(()=>Object.defineProperty(m.object,'extra',{value:1}),TypeError);assert.throws(()=>Object.setPrototypeOf(m.object,null),TypeError);assert.equal(m.object.data,'kept');assert.equal('extra'in m.object,false);Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{get href(){reads++;throw thrown}}}});assert.throws(m.read,e=>e===thrown);assert.equal(reads,2)}finally{if(before)Object.defineProperty(globalThis,'window',before);else delete globalThis.window}assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'window'),before);`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput(); err != nil {
				t.Fatalf("runtime: %v %s", err, output)
			}
		})
	}
}

// Use an event produced by the actual normal owner. Wrong readers and revoked
// inputs cannot acquire its output, and native integrity is not body entry.
func TestNativeFreezeOriginalOutputAuthority(t *testing.T) {
	request := Request{Kind: "analyze", ID: "/virtual/freeze-authority.ts", Source: `export function read(){const o=Object.freeze({get value(){return document.title}});return o.value}`}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(generation.release)
	collectProjectCallableEffects(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, analyzeAssets(generation.sourceFile, generation.checker, request), nil)
	owner := project.callableCache.owner
	var body, site *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
		if ast.IsFunctionDeclaration(n) && n.Name().Text() == "read" {
			body = n
		}
		if ast.IsCallExpression(n) {
			site = n
		}
		return true
	})
	inputs := &sourceValueInputs{declaration: body, bindings: make(sourceValueBindings), returnedGets: make([]sourceGetReturn, 0)}
	q := &sourceValueQuery{owner: owner.values, executable: owner, effectOwner: body, inputs: inputs, active: make(map[*ast.Node]bool), remaining: 4096, operation: &sourceOperationContext{owner: body, inputs: inputs}}
	t.Cleanup(func() { releaseNormalOperations(inputs) })
	part := accessorCandidates{}
	q.executeInputs(body, inputs.bindings, &part, nil, inputs)
	slot := inputs.operations[site]
	if slot == nil || slot.output.effects != sourceEffectsAccounted || len(slot.output.values) != 1 {
		t.Fatal("original native output missing")
	}
	q.returnObservation = &sourceReturnObservation{owner: body, frame: inputs, reader: site}
	observed, found := q.acquireNormalCallResult(site, &accessorCandidates{})
	if !found || observed.incomplete || len(observed.values) != 1 {
		t.Fatal("original output refused")
	}
	for _, receipt := range part.normalCalls {
		if receipt.operation == site {
			t.Fatal("native result minted a source-body receipt")
		}
	}
	for _, receipt := range part.nativeCalls {
		if receipt.operation == site {
			t.Fatal("native result minted a Promise receipt")
		}
	}
	q.returnObservation.owner = site
	if _, found := q.acquireNormalCallResult(site, &accessorCandidates{}); found {
		t.Fatal("wrong caller acquired output")
	}
	q.returnObservation.owner = body
	releaseNormalOperations(inputs)
	if _, found := q.acquireNormalCallResult(site, &accessorCandidates{}); found {
		t.Fatal("released input acquired output")
	}
}

// Integrity changes cannot make a retained setter opaque by themselves, and
// cannot erase independent unknown execution or a setter's own Throw effects.
func TestNativeFreezeSetterEffectBoundaries(t *testing.T) {
	for _, test := range []struct{ name, prefix, body, effect string }{
		{"plain-parameter", "", `const o={set value(v:string){document.title=v}};o.value='kept';return 1`, "browser"},
		{"frozen-constant", "", `const o=Object.freeze({set value(v:string){document.title='kept'}});(o as {value:string}).value='kept';return 1`, "browser"},
		{"frozen-throw", "", `const o=Object.freeze({set value(v:string){document.title=v;throw 9}});(o as {value:string}).value='kept';return 1`, "browser"},
		{"setter-unknown", "declare function foreign():void;", `const o=Object.freeze({set value(v:string){document.title=v;foreign()}});(o as {value:string}).value='kept';return 1`, "unknown"},
		{"independent-unknown", "declare function foreign(value:unknown):void;", `const o=Object.freeze({set value(v:string){document.title=v}});foreign(o);(o as {value:string}).value='kept';return 1`, "unknown"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/frozen-setter-boundary-" + test.name + ".ts", Source: test.prefix + `export function read(){` + test.body + `}`, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			found := false
			for _, c := range response.Analysis.Callables {
				if c.Name == "read" {
					found = true
					browser := false
					for _, e := range c.EffectSources {
						browser = browser || e.Environment == "browser"
					}
					if c.Effect != test.effect || !browser {
						t.Fatalf("setter effect=%s browser=%v want %s: %#v", c.Effect, browser, test.effect, c)
					}
				}
			}
			if !found {
				t.Fatal("original callable missing")
			}
		})
	}
}

// Missing external RHS values stay incomplete in both property spellings.
// Independently evaluated browser work must survive that refusal.
func TestNativeFreezeShorthandUnknownRHS(t *testing.T) {
	for _, browser := range []bool{false, true} {
		for _, shorthand := range []bool{false, true} {
			name := "named"
			member := "value:value"
			if shorthand {
				name = "shorthand"
				member = "value"
			}
			if browser {
				name += "-browser"
			}
			t.Run(name, func(t *testing.T) {
				rhs := "foreign()"
				if browser {
					rhs = "(document.title,foreign())"
				}
				source := `declare function foreign():string;export function read(){const value=` + rhs + `;const o=Object.freeze({` + member + `});return o.value}`
				r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/freeze-shorthand-unknown.ts", Source: source, Diagnostics: "semantic"})
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
					t.Fatal("invalid fixture", r.Error, r.Diagnostics)
				}
				for _, c := range r.Analysis.Callables {
					if c.Name == "read" {
						knownBrowser := false
						for _, e := range c.EffectSources {
							knownBrowser = knownBrowser || e.Environment == "browser"
						}
						if c.Effect != "unknown" || knownBrowser != browser {
							t.Fatalf("RHS effects=%s browser=%v want unknown/%v: %#v", c.Effect, knownBrowser, browser, c)
						}
						return
					}
				}
				t.Fatal("original callable missing")
			})
		}
	}
}

func TestNativeFreezeShorthandEmitted(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/frozen-shorthand-runtime.ts", Source: `const value=1;export const object=Object.freeze({value});export const alias=object;`, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "shorthand.mts")
			if err := os.WriteFile(file, []byte(r.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(m.object,m.alias);assert.equal(Object.isFrozen(m.object),true);assert.equal(Object.isExtensible(m.object),false);assert.deepEqual(Object.getOwnPropertyDescriptor(m.object,'value'),{value:1,writable:false,enumerable:true,configurable:false});assert.equal(Reflect.set(m.object,'value',2),false);assert.equal(Reflect.defineProperty(m.object,'extra',{value:1}),false);assert.equal(m.object.value,1);`
			if out, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput(); err != nil {
				t.Fatalf("runtime %v %s", err, out)
			}
		})
	}
}
