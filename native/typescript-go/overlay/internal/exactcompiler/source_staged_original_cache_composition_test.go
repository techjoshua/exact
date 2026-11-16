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

func TestStagedOriginalCacheCompositionSessionAndArtifacts(t *testing.T) {
	f := newStagedOriginalCacheFixture(t)
	for _, target := range []Target{TargetClient, TargetServer} {
		request := f.request("compile", "component-abi/opaque-operation.ts")
		request.Target, request.stagedReplacement = target, true
		response := f.session.Execute(request)
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(target, response.Error, response.Diagnostics)
		}
		for _, name := range []string{"invoke", "probe"} {
			for _, effect := range executableSummary(t, response, name).EffectSources {
				if effect.Environment == "browser" || effect.Environment == "unknown" {
					t.Fatal("cache activated stored inputs or lost source coverage", name, effect)
				}
			}
		}
		checkStagedOriginalCacheOwners(t, f.session)
		root := t.TempDir()
		module := filepath.Join(root, "component-abi", "opaque-operation.mts")
		version := filepath.Join(root, "component", "contract-versions.js")
		for path, contents := range map[string]string{module: response.Code, version: `export const componentContractVersion=6;`} {
			if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte(contents), 0600); err != nil {
				t.Fatal(err)
			}
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);const execute=function(target){events.push([this,target]);return 'executed'},domain={executionRoot:'one'};const first=m.probe(execute,domain),proto=Object.getPrototypeOf(first);const identity=Symbol.for('@exactjs/opaque-target-operation'),generation=Symbol.for('@exactjs/opaque-component-input-generation'),execution=Symbol.for('@exactjs/opaque-target-operation-execution'),metadata=Symbol.for('@exactjs/opaque-target-operation-metadata');assert.equal(Object.isFrozen(first),true);assert.equal(Object.isFrozen(proto),true);assert.equal(proto[identity],true);assert.equal(proto[generation],6);assert.equal(proto[execution],execute);assert.equal(first[metadata].domain,domain);assert.equal(Object.isFrozen(first[metadata]),true);assert.equal(Object.getOwnPropertyDescriptor(first,metadata).writable,false);assert.equal(m.probe(execute,domain),first);assert.notEqual(m.probe(execute,{executionRoot:'two'}),first);assert.notEqual(m.probe(()=>0,domain),first);const empty=m.probe(undefined,domain);assert.equal(Object.getPrototypeOf(empty)[execution],undefined);assert.equal(m.probe(undefined,domain),empty);let traps=0;const handlers={get(){traps++;throw 'get'},getPrototypeOf(){traps++;throw 'prototype'},apply(){traps++;throw 'apply'}};m.probe(new Proxy(()=>0,handlers),new Proxy({executionRoot:'proxy'},handlers));assert.equal(traps,0);assert.deepEqual(events,[]);const receiver={},target={};assert.equal(proto[execution].call(receiver,target),'executed');assert.deepEqual(events,[[receiver,target]]);assert.throws(()=>m.probe(execute,null),TypeError);assert.equal(events.length,1);assert.equal(Object.isFrozen(m.invoke()),true);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s original cache artifact: %v %s", target, err, output)
		}
	}
}

// Every original native member Call has an ordinary source owner. In particular
// the second table's receiver retains the first Get's delivered payload request.
func checkStagedOriginalCacheOwners(t *testing.T, session *Session) {
	t.Helper()
	found := 0
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name != "operationPrototype" && fact.summary.Name != "domainOperationPrototype" {
			continue
		}
		found++
		if !fact.staged.settled || fact.staged.operationsPending {
			t.Fatal("original cache source unsettled", fact.summary.Name)
		}
		walkNode(fact.node.Body(), func(node *ast.Node) bool {
			if !ast.IsCallExpression(node) || !ast.IsPropertyAccessExpression(node.Expression()) {
				return true
			}
			var selected *sourceStagedOperationRecipe
			for _, use := range fact.staged.operationUses {
				if use.request.producer.operation != node || use.request.producer.kind != relativeDemandEffects || use.request.producer.selector != (sourceStagedOperationSelector{}) {
					continue
				}
				for index := range fact.staged.operationRecipes {
					if fact.staged.operationRecipes[index].key == use.request.producer {
						selected = &fact.staged.operationRecipes[index]
					}
				}
			}
			if selected == nil || !validOperationEnvelope(*selected) || selected.nativeGet == nil && len(selected.constructedGroup) == 0 {
				t.Fatal("original native Call bypassed its source owner", fact.summary.Name, sourceText(fact.sourceFile, node))
			}
			if _, legacy := fact.staged.legacy[node]; legacy {
				t.Fatal("original native Call entered legacy recovery", sourceText(fact.sourceFile, node))
			}
			if fact.summary.Name == "operationPrototype" && node.Expression().Name().Text() == "get" {
				accounted := false
				for _, recipe := range fact.staged.operationRecipes {
					if recipe.memberSource == nil || recipe.memberSource.call == nil {
						continue
					}
					for _, branch := range recipe.memberSource.call.standard {
						if branch.request.producer.operation != node || branch.get != node.Expression() {
							continue
						}
						if !validStagedMemberCallRecipe(recipe) || !recipe.memberSource.call.complete || !recipe.delta.extracted {
							t.Fatal("original method source not accounted")
						}
						for _, required := range standardMemberCallRequirements(&branch) {
							present := false
							for _, actual := range recipe.delta.required {
								present = present || sameOperationRequest(actual, required)
							}
							if !present {
								t.Fatal("original method source lost exact required role", required.producer.selector.field)
							}
						}
						accounted = true
					}
				}
				if !accounted {
					t.Fatal("original direct Get bypassed its method disposition")
				}
			}
			receiver, _ := accessorReceiver(node.Expression())
			if ast.IsIdentifier(receiver) && receiver.Text() == "domains" {
				if len(selected.constructedInputs) == 0 {
					t.Fatal("original inner receiver lost outer Get DATA")
				}
				for _, input := range selected.constructedInputs {
					if input.reading.operation == nil || input.reading.operation == node || input.inputs != nil {
						t.Fatal("receiver DATA became a later input binder")
					}
				}
			}
			return true
		})
	}
	if found != 2 {
		t.Fatal("original cache bodies absent", found)
	}
}
