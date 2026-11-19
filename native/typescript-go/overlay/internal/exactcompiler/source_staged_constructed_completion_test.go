package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

const stagedConstructedReducedChain = `const operationPrototypes=new WeakMap<object,object>();
const domainOperationPrototypes=new WeakMap<object,WeakMap<object,object>>();
function operationPrototype(execute:object){let prototype=operationPrototypes.get(execute);if(!prototype){prototype={};operationPrototypes.set(execute,prototype)}return prototype}
function domainOperationPrototype(prototype:object,domain:object){let domains=domainOperationPrototypes.get(prototype);if(!domains)domainOperationPrototypes.set(prototype,(domains=new WeakMap<object,object>()));let owned=domains.get(domain);if(!owned){owned={};domains.set(domain,owned)}return owned}
function dormant(){return document.title}
export function invoke(execute:object,domain:object){return domainOperationPrototype(operationPrototype(execute),domain)}`

// This is the complete reduced original receiver chain. Emitted execution owns
// actual key/instance behavior, which analysis must preserve without reconstructing
// a table. Closed Effects must neither invoke stored data nor imply normal output.
func TestStagedConstructedReducedChainSession(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/staged-complete-domains.ts", Source: stagedConstructedReducedChain, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				for _, fact := range stagedDeclarationFacts(session) {
					for _, recipe := range fact.staged.operationRecipes {
						if recipe.constructed != nil {
							t.Log(fact.summary.Name, recipe.key.selector.field, recipe.delta.extracted, recipe.constructed.construction.selectionComplete, recipe.constructedDisposition != nil)
						}
					}
				}
				t.Fatal(response.Error, response.Diagnostics)
			}
			count := 0
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "operationPrototype" && fact.summary.Name != "domainOperationPrototype" {
					continue
				}
				if fact.staged.operationsPending || !fact.staged.settled {
					t.Fatal("native source group did not settle", fact.summary.Name)
				}
				for _, occurrence := range fact.staged.constructedOccurrences {
					count++
					if _, legacy := fact.staged.legacy[occurrence.request.producer.operation]; legacy {
						t.Fatal("settled source re-entered legacy member recovery")
					}
				}
			}
			if count != 6 {
				t.Fatal("original native occurrence coverage", count)
			}
			for _, effect := range executableSummary(t, response, "invoke").EffectSources {
				if effect.Environment == "browser" || effect.Environment == "unknown" {
					t.Fatal("source chain activated data or dropped source coverage", effect)
				}
			}
			path := filepath.Join(t.TempDir(), "chain.mts")
			if err := os.WriteFile(path, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0,calls=0,traps=0;Object.defineProperty(globalThis,'document',{get(){reads++;return{title:'dormant'}}});const m=await import(pathToFileURL(process.argv[1]).href);const execute=()=>{calls++},domain={};const first=m.invoke(execute,domain);assert.equal(m.invoke(execute,domain),first);assert.notEqual(m.invoke(execute,{}),first);assert.notEqual(m.invoke(()=>{},domain),first);const proxy=new Proxy({}, {get(){traps++;throw Error('get')},getPrototypeOf(){traps++;throw Error('prototype')}});m.invoke(proxy,proxy);assert.equal(reads,0);assert.equal(calls,0);assert.equal(traps,0);assert.throws(()=>m.invoke(null,{}),TypeError);`
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, path).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatalf("emitted %s: %v %s", target, err, output)
			}
		})
	}
}

// Complete reference population must refuse an exposed receiver even when a
// genuine native branch and known payload have already been delivered. Unknown
// external writers do not become empty or pay the original member obligations.
func TestStagedConstructedReceiverEscapeRemainsPending(t *testing.T) {
	source := `declare function expose(value:object):void;` + stagedConstructedReducedChain + `expose(domainOperationPrototypes);`
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: "/virtual/staged-escaped-domains.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
	if hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Diagnostics)
	}
	if response.Error == "" || response.Code != "" || len(response.Analysis.Callables) != 0 {
		t.Fatal("unrepresented external writer paid source coverage", response.Error)
	}
	found := false
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name != "domainOperationPrototype" {
			continue
		}
		for _, recipe := range fact.staged.operationRecipes {
			if recipe.constructed == nil || recipe.key.selector.field != "own-writers" {
				continue
			}
			if sourceText(fact.sourceFile, recipe.constructed.construction.site) == `new WeakMap<object,WeakMap<object,object>>()` {
				found = true
				if recipe.delta.extracted || recipe.constructedDisposition != nil {
					t.Fatal("receiver escape was certified private")
				}
			}
		}
	}
	if !found {
		t.Fatal("escaped original receiver source was dropped")
	}
}
