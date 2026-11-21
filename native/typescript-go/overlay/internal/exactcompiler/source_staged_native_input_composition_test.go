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

// Child creation and parent freeze must compose as source obligations without
// executing prototype properties or freezing the supplied prototype itself.
func TestStagedNativeCreateFreezeCompositionSession(t *testing.T) {
	const source = `export function invoke(prototype:object){return Object.freeze(Object.create(prototype))}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/create-freeze.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			for _, effect := range executableSummary(t, response, "invoke").EffectSources {
				if effect.Environment == "browser" || effect.Environment == "unknown" {
					t.Fatalf("composition activated prototype or lost source coverage: %#v", effect)
				}
			}
			migrated := false
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "invoke" {
					continue
				}
				outer := fact.node.Body().AsBlock().Statements.Nodes[0].Expression()
				if !ast.IsCallExpression(outer) {
					t.Fatal("missing original parent Call")
				}
				child := restrictedInvocationArguments(outer.AsCallExpression())[0]
				if !ast.IsCallExpression(child) {
					t.Fatal("missing original child Call")
				}
				for _, use := range fact.staged.operationUses {
					if use.request.producer.declaration == fact.node && use.request.producer.operation == outer && use.request.producer.selector == (sourceStagedOperationSelector{}) {
						migrated = fact.staged.settled && !fact.staged.operationsPending
					}
				}
				for _, operation := range []*ast.Node{outer, child} {
					if _, legacy := fact.staged.legacy[operation]; legacy {
						t.Fatal("covered parent/child retained legacy recursive preparation")
					}
				}
			}
			if !migrated {
				t.Fatal("ordinary composition source obligations did not settle")
			}
			file := filepath.Join(t.TempDir(), "composition.mts")
			if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);let reads=0,calls=0,traps=0;const prototype={get value(){reads++;return 'value'},callback(){calls++;return 'callback'}};const value=m.invoke(prototype);assert.equal(Object.getPrototypeOf(value),prototype);assert.equal(Object.isFrozen(value),true);assert.equal(Object.isFrozen(prototype),false);assert.equal(reads,0);assert.equal(calls,0);prototype.added='mutable';assert.equal(value.added,'mutable');assert.equal(value.value,'value');assert.equal(value.callback(),'callback');assert.equal(reads,1);assert.equal(calls,1);const proxy=new Proxy(prototype,{get(t,k,r){traps++;return Reflect.get(t,k,r)},getPrototypeOf(t){traps++;return Reflect.getPrototypeOf(t)},ownKeys(t){traps++;return Reflect.ownKeys(t)},getOwnPropertyDescriptor(t,k){traps++;return Reflect.getOwnPropertyDescriptor(t,k)}});const proxied=m.invoke(proxy);assert.equal(Object.getPrototypeOf(proxied),proxy);assert.equal(Object.isFrozen(proxied),true);assert.equal(traps,0);assert.equal(proxied.value,'value');assert.equal(traps,1);assert.equal(reads,2);let functionCalls=0;function callable(){functionCalls++}const callableValue=m.invoke(callable);assert.equal(Object.getPrototypeOf(callableValue),callable);assert.equal(Object.isFrozen(callableValue),true);assert.equal(Object.isFrozen(callable),false);assert.equal(functionCalls,0);const failure=new Error('later getter');const throwing=m.invoke({get value(){throw failure}});assert.equal(Object.isFrozen(throwing),true);assert.throws(()=>throwing.value,error=>error===failure);const empty=m.invoke(null);assert.equal(Object.getPrototypeOf(empty),null);assert.equal(Object.isFrozen(empty),true);assert.throws(()=>m.invoke(1),TypeError);assert.throws(()=>Object.defineProperty(value,'own',{value:1}),TypeError);`
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatalf("%s: %v %s", target, err, output)
			}
		})
	}
}
