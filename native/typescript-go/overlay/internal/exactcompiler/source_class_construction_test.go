package exactcompiler

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Exercise revocation on an output produced by the real indexed normal owner.
// Copies and mismatched identities are lookup-only controls, never publishers.
func TestDefaultClassConstructionLiveOwnership(t *testing.T) {
	request := Request{Kind: "analyze", ID: "/virtual/live-construction.ts", Source: `function initialize(){return 1}export function read(){class Holder{value=initialize();later=initialize()}return new Holder();}`}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(generation.release)
	collectProjectCallableEffects(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, analyzeAssets(generation.sourceFile, generation.checker, request), nil, nil)
	owner := project.callableCache.owner
	var body, site *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionDeclaration(node) && node.Name().Text() == "read" {
			body = node
		}
		if ast.IsNewExpression(node) {
			site = node
		}
		return true
	})
	if body == nil || site == nil {
		t.Fatal("missing source construction")
	}
	inputs := &sourceValueInputs{declaration: body, bindings: make(sourceValueBindings), returnedGets: make([]sourceGetReturn, 0)}
	q := &sourceValueQuery{owner: owner.values, executable: owner, effectOwner: body, inputs: inputs, active: make(map[*ast.Node]bool), remaining: 4096, operation: &sourceOperationContext{owner: body, inputs: inputs}}
	t.Cleanup(func() { releaseNormalOperations(inputs) })
	q.executeInputs(body, inputs.bindings, &accessorCandidates{}, nil, inputs)
	slot := inputs.operations[site]
	if slot == nil || len(slot.output.values) != 1 || slot.output.values[0].value.instance == nil {
		t.Fatal("actual normal construction output missing")
	}
	instance := slot.output.values[0].value.instance
	if !instance.live(q) {
		t.Fatal("original live output refused")
	}
	var fieldInputs []*sourceValueInputs
	for _, field := range instance.fields {
		for _, output := range field.observed.values {
			if output.inputs == nil || output.inputs.declaration != field.definition || output.inputs.operationLifetime == nil || output.value.acquired == nil {
				t.Fatal("actual DefineField did not retain field inputs and original Call output")
			}
			fieldInputs = append(fieldInputs, output.inputs)
		}
	}
	t.Run("may-prefix-guard", func(t *testing.T) {
		// Membership/order can be checked on a source prefix projection. This
		// copy cannot become a live allocation or reopen its retired selection.
		projection := *instance
		projection.fields = instance.fields[:1]
		prefix := &sourceConstructionMayPrefix{instance: &projection, field: instance.fields[1].definition, completed: 1}
		defer func() { q.constructionMay = nil }()
		q.constructionMay = prefix
		if !prefix.indexedField(q) {
			t.Fatal("original indexed source prefix refused")
		}
		if prefix.live(q) {
			t.Fatal("copied completed allocation reopened")
		}
		copy := *prefix
		if copy.live(q) {
			t.Fatal("copied borrowed relation accepted")
		}
		prefix.completed = 0
		if prefix.indexedField(q) {
			t.Fatal("wrong completed prefix accepted")
		}
		prefix.completed = 1
		prefix.field = nil
		if prefix.indexedField(q) {
			t.Fatal("missing current field accepted")
		}
		prefix.field = instance.fields[0].definition
		if prefix.indexedField(q) {
			t.Fatal("preceding field accepted as suffix")
		}
		q.constructionMay = nil
		if prefix.live(q) {
			t.Fatal("expired borrow accepted")
		}
	})
	for _, name := range []string{"copied", "wrong-mode", "wrong-caller", "wrong-source", "wrong-occurrence", "unpublished"} {
		t.Run(name, func(t *testing.T) {
			copy := *instance
			defer func() { *instance = copy }()
			if name == "copied" {
				if copy.live(q) {
					t.Fatal("copied occurrence accepted")
				}
				return
			}
			switch name {
			case "wrong-mode":
				instance.mode = "foreign"
			case "wrong-caller":
				instance.caller = instance.target
			case "wrong-source":
				instance.sourceFile = nil
			case "wrong-occurrence":
				instance.entry = &sourceNormalOccurrence{}
			case "unpublished":
				instance.publisher = &sourceNormalOperation{}
			}
			if instance.live(q) {
				t.Fatal("foreign/copied output accepted")
			}
		})
	}
	// A real generation closes before this observer attempts another read.
	generation.release()
	if instance.live(q) {
		t.Error("dead generation retained live construction")
	}
	releaseNormalOperations(inputs)
	if instance.inputs != nil || instance.live(q) {
		t.Fatal("disposed input retained construction")
	}
	for _, inputs := range fieldInputs {
		if inputs.operationLifetime != nil {
			t.Fatal("field frame survived original owner disposal")
		}
	}
}

// Runtime witnesses keep field evaluation on actual construction: a called
// initializer runs once, prior fields and captures precede later fields, and two
// invocations of the same allocating expression produce distinct instances.
func TestDefaultClassConstructionRuntimeInputs(t *testing.T) {
	for _, test := range []struct {
		name, source, expected, events string
		reads, initialized             int
	}{
		{"called-initializer", `export let initialized=0;function initialize(){initialized++;return {get value(){return window.location.href;}};}export function read(){class Holder{nested=initialize();}return JSON.stringify(new Holder());}`, `{"nested":{"value":"browser"}}`, "", 1, 1},
		{"capture-and-order", `export let events='';export let initialized=0;export function read(){const captured='kept';class Holder{first=(events+='first;',captured);second=(events+='second;',this.first);nested={get value(){return window.location.href;}};}return JSON.stringify(new Holder());}`, `{"first":"kept","second":"kept","nested":{"value":"browser"}}`, "first;second;", 1, 0},
		{"repeated-allocation", `export let initialized=0;class Holder{nested={get value(){return window.location.href;}};}function make(){return new Holder();}export function read(){const first=make();const second=make();if(first===second)throw new Error('shared allocation');return JSON.stringify([first,second]);}`, `[{"nested":{"value":"browser"}},{"nested":{"value":"browser"}}]`, "", 2, 0},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(test.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/class-runtime.ts", Source: test.source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
				}
				browser := false
				for _, callable := range response.Analysis.Callables {
					if callable.Name == "read" {
						browser = settlementBrowser(callable)
					}
				}
				if !browser {
					t.Fatal("actual constructed getter browser effect lost")
				}
				module := filepath.Join(t.TempDir(), "fields.mts")
				if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				expected, err := json.Marshal(struct {
					Value, Events      string
					Reads, Initialized int
				}{test.expected, test.events, test.reads, test.initialized})
				if err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				t.Cleanup(cancel)
				const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const before=Object.getOwnPropertyDescriptor(globalThis,'window');const expected=JSON.parse(process.argv[2]);let reads=0;try{Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{get href(){reads++;return 'browser'}}}});const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(m.read(),expected.Value);assert.equal(m.initialized,expected.Initialized);if(expected.Events)assert.equal(m.events,expected.Events);assert.equal(reads,expected.Reads)}finally{if(before)Object.defineProperty(globalThis,'window',before);else delete globalThis.window}assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'window'),before);`
				if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module, string(expected)).CombinedOutput(); err != nil {
					t.Fatalf("runtime: %v %s", err, output)
				}
			})
		}
	}
}

// An abrupt initializer retains its real earlier write, stops later fields and
// does not manufacture a complete instance from the missing normal result.
func TestDefaultClassConstructionAbruptField(t *testing.T) {
	const source = `function stop():never{document.title='stopped';throw 9}export function read(){class Holder{first=stop();later=window.name;}return new Holder();}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/abrupt-field.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
			}
			browser, incomplete := false, false
			for _, callable := range response.Analysis.Callables {
				if callable.Name != "read" {
					continue
				}
				incomplete = callable.Effect == "unknown"
				for _, effect := range callable.EffectSources {
					browser = browser || effect.Environment == "browser"
				}
			}
			if !browser || !incomplete {
				t.Fatal("abrupt construction lost write or became complete")
			}
			module := filepath.Join(t.TempDir(), "abrupt.mts")
			if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			t.Cleanup(cancel)
			const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const beforeWindow=Object.getOwnPropertyDescriptor(globalThis,'window');const beforeDocument=Object.getOwnPropertyDescriptor(globalThis,'document');let reads=0,writes=0;try{Object.defineProperty(globalThis,'window',{configurable:true,value:{get name(){reads++;return 'late'}}});Object.defineProperty(globalThis,'document',{configurable:true,value:{set title(value){assert.equal(value,'stopped');writes++}}});const m=await import(pathToFileURL(process.argv[1]).href);assert.throws(()=>m.read(),error=>error===9);assert.equal(writes,1);assert.equal(reads,0)}finally{if(beforeWindow)Object.defineProperty(globalThis,'window',beforeWindow);else delete globalThis.window;if(beforeDocument)Object.defineProperty(globalThis,'document',beforeDocument);else delete globalThis.document}assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'window'),beforeWindow);assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'document'),beforeDocument);`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module).CombinedOutput(); err != nil {
				t.Fatalf("runtime: %v %s", err, output)
			}
		})
	}
}

// Potential suffix effects are retained in analysis without moving execution
// ahead of the foreign Call. Actual Normal and Throw each run that Call once.
func TestDefaultClassConstructionConditionalRuntime(t *testing.T) {
	for _, fixture := range []struct{ name, source, expected string }{
		{"direct", `declare function foreign():unknown;export function read(){class Holder{first=foreign();later=document.title}return JSON.stringify(new Holder());}`, `{"first":1,"later":"browser"}`},
		{"nested", `declare function foreign():unknown;export function read(){class Inner{value=document.title}class Holder{first=foreign();later=new Inner()}return JSON.stringify(new Holder());}`, `{"first":1,"later":{"value":"browser"}}`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/conditional-fields.ts", Source: fixture.source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
			}
			unknown, browser := false, false
			for _, callable := range response.Analysis.Callables {
				if callable.Name == "read" {
					unknown = callable.Effect == "unknown"
					for _, effect := range callable.EffectSources {
						browser = browser || effect.Environment == "browser"
					}
				}
			}
			if !unknown || !browser {
				t.Fatal("conditional constructor lost unknown or browser")
			}
			for _, outcome := range []string{"normal", "throw"} {
				t.Run(fixture.name+"/"+string(target)+"/"+outcome, func(t *testing.T) {
					module := filepath.Join(t.TempDir(), "conditional.mts")
					if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
						t.Fatal(err)
					}
					ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
					t.Cleanup(cancel)
					const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const beforeForeign=Object.getOwnPropertyDescriptor(globalThis,'foreign');const beforeDocument=Object.getOwnPropertyDescriptor(globalThis,'document');const abrupt=process.argv[2]==='throw';let calls=0,reads=0;try{Object.defineProperty(globalThis,'foreign',{configurable:true,value(){calls++;if(abrupt)throw 9;return 1}});Object.defineProperty(globalThis,'document',{configurable:true,value:{get title(){reads++;return 'browser'}}});const m=await import(pathToFileURL(process.argv[1]).href);if(abrupt)assert.throws(()=>m.read(),error=>error===9);else assert.equal(m.read(),process.argv[3]);assert.equal(calls,1);assert.equal(reads,abrupt?0:1)}finally{if(beforeForeign)Object.defineProperty(globalThis,'foreign',beforeForeign);else delete globalThis.foreign;if(beforeDocument)Object.defineProperty(globalThis,'document',beforeDocument);else delete globalThis.document}assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'foreign'),beforeForeign);assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'document'),beforeDocument);`
					if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module, outcome, fixture.expected).CombinedOutput(); err != nil {
						t.Fatalf("runtime: %v %s", err, output)
					}
				})
			}
		}
	}
}

// The ordinary instance field contains an enumerable getter. Construction must
// retain its actual value, and serialization must retain the getter's browser
// effect rather than treating missing construction output as a neutral value.
func TestDefaultClassConstructionJSON(t *testing.T) {
	const source = `export function read(){class Holder{nested={get value(){return window.location.href;}};}return JSON.stringify(new Holder());}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/default-class-json.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			found := false
			for _, callable := range response.Analysis.Callables {
				if callable.Name == "read" {
					found = true
					if !settlementBrowser(callable) {
						t.Fatalf("browser effect lost: %#v", callable)
					}
				}
			}
			if !found {
				t.Fatal("missing source callable")
			}
			module := filepath.Join(t.TempDir(), "constructed.mts")
			if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			t.Cleanup(cancel)
			const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const before=Object.getOwnPropertyDescriptor(globalThis,'window');const nested=Object.getOwnPropertyDescriptor(Object.prototype,'nested');let reads=0,sets=0;try{Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{get href(){reads++;return 'browser'}}}});Object.defineProperty(Object.prototype,'nested',{configurable:true,set(){sets++}});const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(m.read(),'{"nested":{"value":"browser"}}');assert.equal(reads,1);assert.equal(sets,0)}finally{if(before)Object.defineProperty(globalThis,'window',before);else delete globalThis.window;if(nested)Object.defineProperty(Object.prototype,'nested',nested);else delete Object.prototype.nested}assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'window'),before);assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype,'nested'),nested);`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module).CombinedOutput(); err != nil {
				t.Fatalf("runtime: %v %s", err, output)
			}
		})
	}
}

// A live occurrence cannot enter detached history, and a missing original
// publisher/input lifetime cannot be replaced by a copied AST association.
func TestDefaultClassConstructionAuthorityRefusals(t *testing.T) {
	q := &sourceValueQuery{}
	instance := &sourceConstructedInstance{}
	if instance.live(q) {
		t.Fatal("missing actual owner accepted")
	}
	if _, ok := q.detachPropertyValue(sourceValue{instance: instance}, &accessorCandidates{}, nil); ok {
		t.Fatal("live instance detached")
	}
}

// Construction input and ordering controls exercise the normal expression owner,
// not an evaluator in the serialization consumer. Unsupported alternatives keep
// their independent browser effects beside the incomplete construction output.
func TestDefaultClassConstructionInputs(t *testing.T) {
	for _, test := range []struct {
		name, body, effect string
		browser            bool
	}{
		{"capture-and-this", `const captured='kept';class Holder{first=captured;second=this.first}return JSON.stringify(new Holder());`, "neutral", false},
		{"present-undefined", `class Holder{value:undefined;}return JSON.stringify(new Holder());`, "neutral", false},
		{"ignored-argument", `class Holder{value=1}const C:new(...args:unknown[])=>Holder=Holder;return JSON.stringify(new C(document.title));`, "browser", true},
		{"independent-write", `document.title='kept';class Holder{value=1}return JSON.stringify(new Holder());`, "browser", true},
		{"unknown-field", `class Holder{value=foreign()}return JSON.stringify(new Holder());`, "unknown", false},
		{"unknown-first-retains-later-effect", `class Holder{first=foreign();later=document.title}return JSON.stringify(new Holder());`, "unknown", true},
		{"unknown-retains-prefix-getter", `class Holder{first={get value(){return window.location.href}};middle=foreign();later=this.first.value}return JSON.stringify(new Holder());`, "unknown", true},
		{"unknown-instance-mutation-retains-alternative", `class Holder{first={get value(){return window.location.href}};middle=mutate(this);later=this.first.value}return JSON.stringify(new Holder());`, "unknown", true},
		{"unknown-retains-captured-call-effect", `const value={get title(){return document.title}};const readCaptured=()=>value.title;class Holder{first=foreign();later=readCaptured()}return JSON.stringify(new Holder());`, "unknown", true},
		{"unknown-retains-nested-construction-effect", `class Inner{value=document.title}class Holder{first=foreign();later=new Inner()}return JSON.stringify(new Holder());`, "unknown", true},
		{"nested-abrupt-first-skips-effect", `function stop():never{throw 9}class Inner{value=document.title}class Holder{first=stop();later=new Inner()}return JSON.stringify(new Holder());`, "neutral", false},
		{"nested-ignored-argument-effect", `class Inner{value=1}const C:new(...args:unknown[])=>Inner=Inner;class Holder{first=foreign();later=new C(document.title)}return JSON.stringify(new Holder());`, "unknown", true},
		{"nested-creating-capture-effect", `const captured={get value(){return document.title}};class Inner{value=captured.value}class Holder{first=foreign();later=new Inner()}return JSON.stringify(new Holder());`, "unknown", true},
		{"nested-this-is-not-outer", `class Inner{value:unknown=(this as unknown as {prefix:{value:string}}).prefix.value}class Holder{prefix={get value(){return document.title}};first=foreign();later=new Inner()}return JSON.stringify(new Holder());`, "unknown", true},
		{"nested-this-later-projection", `class Inner{value:unknown=(this as unknown as {prefix:{value:string}}).prefix.value}class Holder{prefix={get value(){return document.title}};first=foreign();later=new Inner()}return JSON.stringify(new Holder().later);`, "unknown", false},
		{"nested-unavailable-this-retains-independent-effect", `class Inner{first:unknown=(this as unknown as {missing:string}).missing;later=document.title}class Holder{first=foreign();later=new Inner()}return JSON.stringify(new Holder());`, "unknown", true},
		{"nested-changed-target", `class Inner{value=document.title}let C:new()=>{value:string}=Inner;C=class{value='safe'};class Holder{first=foreign();later=new C()}return JSON.stringify(new Holder());`, "unknown", false},
		{"nested-unknown-target", `const C=foreign() as new()=>unknown;class Holder{first=foreign();later=new C()}return JSON.stringify(new Holder());`, "unknown", false},
		{"abrupt-first-skips-later-effect", `function stop():never{throw 9}class Holder{first=stop();later=document.title}return JSON.stringify(new Holder());`, "neutral", false},
		{"unavailable-field-retains-browser", `class Holder{value=window.name}return JSON.stringify(new Holder());`, "browser", true},
		{"source-constructor", `class Holder{constructor(){document.title='kept'}}return JSON.stringify(new Holder());`, "browser", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/class-inputs.ts", Source: `declare function foreign():unknown;declare function mutate(value:unknown):unknown;export function read(){` + test.body + `}`, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid input: %s %#v", response.Error, response.Diagnostics)
			}
			found := false
			for _, callable := range response.Analysis.Callables {
				if callable.Name == "read" {
					found = true
					browser := false
					for _, effect := range callable.EffectSources {
						browser = browser || effect.Environment == "browser"
					}
					if callable.Effect != test.effect || browser != test.browser {
						t.Fatalf("effect=%s browser=%v, want %s/%v: %#v", callable.Effect, browser, test.effect, test.browser, callable)
					}
				}
			}
			if !found {
				t.Fatal("missing original callable")
			}
		})
	}
}

// A MAY-only nested constructor contributes effects without publishing an Inner
// allocation, normal operation or result receipt into the actual caller.
func TestDefaultClassConstructionConditionalNewNoReceipt(t *testing.T) {
	request := Request{Kind: "analyze", ID: "/virtual/conditional-new-receipts.ts", Source: `declare function foreign():unknown;export function read(){class Inner{value=document.title}class Holder{first=foreign();later=new Inner()}return new Holder()}`}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(generation.release)
	collectProjectCallableEffects(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, analyzeAssets(generation.sourceFile, generation.checker, request), nil, nil)
	owner := project.callableCache.owner
	var body, nested *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionDeclaration(node) && node.Name().Text() == "read" {
			body = node
		}
		if ast.IsNewExpression(node) && node.Expression().Text() == "Inner" {
			nested = node
		}
		return true
	})
	if body == nil || nested == nil {
		t.Fatal("missing original source")
	}
	inputs := &sourceValueInputs{declaration: body, bindings: make(sourceValueBindings), returnedGets: make([]sourceGetReturn, 0)}
	q := &sourceValueQuery{owner: owner.values, executable: owner, effectOwner: body, inputs: inputs, active: make(map[*ast.Node]bool), remaining: 4096, operation: &sourceOperationContext{owner: body, inputs: inputs}}
	t.Cleanup(func() { releaseNormalOperations(inputs) })
	part := accessorCandidates{}
	q.executeInputs(body, inputs.bindings, &part, nil, inputs)
	if !part.opaque || inputs.operations[nested] != nil {
		t.Fatal("conditional New gained actual completion or operation")
	}
	for _, receipt := range part.normalCalls {
		if receipt.operation == nested {
			t.Fatal("conditional New gained normal result receipt")
		}
	}
	for _, value := range part.values {
		if value.instance != nil && value.instance.site == nested {
			t.Fatal("conditional New published an instance")
		}
	}
	// A revoked or absent original prefix cannot fall back to class execution.
	q.operation, q.constructionMay = nil, nil
	refused := accessorCandidates{}
	q.constructMaySourceClass(nested, inputs.bindings, &refused)
	if !refused.opaque || !refused.valueIncomplete || len(refused.values) != 0 || len(refused.normalCalls) != 0 || len(refused.effects) != 0 || len(refused.writes) != 0 {
		t.Fatal("dead prefix granted construction authority")
	}
}
