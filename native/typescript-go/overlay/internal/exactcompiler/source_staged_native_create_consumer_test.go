package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The ordinary public collector must settle source input relationships without
// acquiring prototype properties or executing stored bodies. Runtime behavior
// separately protects successful prototype association and native Throw.
func TestStagedNativeCreateConsumerSession(t *testing.T) {
	for _, row := range []struct{ name, source, runner string }{
		{"formal", `export function invoke(prototype:object){return Object.create(prototype)}`, `let reads=0,calls=0,traps=0,prototypeTraps=0;const prototype={get value(){reads++;return 'value'},callback(){calls++;return 'callback'}};const value=m.invoke(prototype);assert.equal(Object.getPrototypeOf(value),prototype);assert.equal(reads,0);assert.equal(calls,0);assert.equal(value.value,'value');assert.equal(value.callback(),'callback');assert.equal(reads,1);assert.equal(calls,1);let functionCalls=0;function callable(){functionCalls++}const callableValue=m.invoke(callable);assert.equal(Object.getPrototypeOf(callableValue),callable);assert.equal(functionCalls,0);const proxy=new Proxy(prototype,{get(t,k,r){traps++;return Reflect.get(t,k,r)},getPrototypeOf(t){prototypeTraps++;return Reflect.getPrototypeOf(t)}});const proxyValue=m.invoke(proxy);assert.equal(Object.getPrototypeOf(proxyValue),proxy);assert.equal(traps,0);assert.equal(prototypeTraps,0);assert.equal(proxyValue.value,'value');assert.equal(traps,1);assert.equal(reads,2);const failure=new Error('prototype getter');const throwing=m.invoke({get value(){throw failure}});assert.throws(()=>throwing.value,error=>error===failure);assert.throws(()=>m.invoke(1),TypeError);assert.equal(Object.getPrototypeOf(m.invoke(null)),null);`},
		{"null", `export function invoke(){return Object.create(null)}`, `const value=m.invoke();assert.equal(Object.getPrototypeOf(value),null);assert.deepEqual(Reflect.ownKeys(value),[]);`},
		{"inert literal", `export function invoke(){return Object.create({get value(){window.name;return 'value'},callback:()=>document.title})}`, `let reads=0,calls=0;globalThis.window={get name(){reads++;return 'name'}};globalThis.document={get title(){calls++;return 'title'}};const value=m.invoke();const prototype=Object.getPrototypeOf(value);assert.equal(Object.getPrototypeOf(prototype),Object.prototype);assert.deepEqual(Reflect.ownKeys(value),[]);assert.equal(reads,0);assert.equal(calls,0);assert.equal(value.value,'value');assert.equal(value.callback(),'title');assert.equal(reads,1);assert.equal(calls,1);`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(row.name+"/"+string(target), func(t *testing.T) {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/create-input-consumer.ts", Source: row.source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				for _, effect := range executableSummary(t, response, "invoke").EffectSources {
					if effect.Environment == "browser" || effect.Environment == "unknown" {
						t.Fatalf("prototype acquisition or stored body activated: %#v", effect)
					}
				}
				migrated := false
				for _, fact := range stagedDeclarationFacts(session) {
					if fact.summary.Name != "invoke" {
						continue
					}
					for _, use := range fact.staged.operationUses {
						if use.request.producer.declaration != fact.node || use.request.producer.selector != (sourceStagedOperationSelector{}) {
							continue
						}
						migrated = fact.staged.settled && !fact.staged.operationsPending
						if _, legacy := fact.staged.legacy[use.request.producer.operation]; legacy {
							t.Fatal("create outer Call retained legacy preparation")
						}
					}
				}
				if !migrated {
					t.Fatal("ordinary create input operation did not settle")
				}
				file := filepath.Join(t.TempDir(), "create.mts")
				if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);` + row.runner
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatalf("%s: %v %s", target, err, output)
				}
			})
		}
	}
}

// Unsupported consumers keep their original path. A possible native MAY
// alternative never erases an authored donor or licenses native-only completion.
func TestStagedNativeCreateConsumerLegacyControls(t *testing.T) {
	for _, row := range []struct {
		name, source string
		authored     bool
	}{
		{"shadow", `const Object={create(_prototype:object|null){window.name;return {}}};export function invoke(){return Object.create(null)}`, true},
		{"own authored", `const owner={create:Object.create};owner.create=function replacement(_prototype:object|null){window.name;return {}};export function invoke(){return owner.create(null)}`, true},
		{"two arguments", `export function invoke(prototype:object){return Object.create(prototype,{value:{value:1}})}`, false},
		{"spread", `export function invoke(prototypes:[object]){return Object.create(...prototypes)}`, false},
		{"nonformal", `const prototype={};export function invoke(){return Object.create(prototype)}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/create-legacy.ts", Source: row.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			retained := false
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "invoke" {
					continue
				}
				walkNode(fact.node.Body(), func(node *ast.Node) bool {
					if ast.IsReturnStatement(node) && ast.IsCallExpression(node.Expression()) {
						_, retained = fact.staged.legacy[node.Expression()]
					}
					return !ast.IsFunctionLike(node)
				})
			}
			if !retained {
				t.Fatal("unsupported create consumer lost its original legacy Call")
			}
			if row.authored {
				browser := false
				for _, effect := range findCallable(t, response.Analysis.Callables, "invoke").EffectSources {
					browser = browser || effect.Environment == "browser" && effect.Description == "window"
				}
				if !browser {
					t.Fatal("authored original Call donor erased")
				}
			}
		})
	}
}
