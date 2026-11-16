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

// These are authored named-input programs, not replacements for the original
// nested acceptance fixture. Calls remain in their actual JavaScript order.
func TestStagedNativeInputBindingSession(t *testing.T) {
	for _, row := range []struct{ name, source, runtime string }{
		{"module", `const value=Object.defineProperties({}, {x:{value:1}});const frozen=Object.freeze(value);export function invoke(){return frozen}`,
			`const first=m.invoke();assert.equal(m.invoke(),first);assert.equal(first.x,1);assert.equal(Object.isFrozen(first),true);assert.deepEqual(Object.getOwnPropertyDescriptor(first,'x'),{value:1,writable:false,enumerable:false,configurable:false});`},
		{"local", `export function invoke(){const value=Object.defineProperties({}, {x:{value:1}});return Object.freeze(value)}`,
			`const first=m.invoke();assert.notEqual(m.invoke(),first);assert.equal(first.x,1);assert.equal(Object.isFrozen(first),true);`},
		{"stored-getter", `export function invoke(){const value=Object.defineProperties({}, {x:{get(){throw 'stored'}}});return Object.freeze(value)}`,
			`const value=m.invoke();assert.equal(Object.isFrozen(value),true);assert.equal(typeof Object.getOwnPropertyDescriptor(value,'x').get,'function');assert.throws(()=>value.x,e=>e==='stored');`},
	} {
		t.Run(row.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				f := newExecutableFixture(t, map[string]string{"entry.ts": row.source})
				request := f.request("compile", "entry.ts")
				request.Target, request.stagedReplacement = target, true
				response := f.session.Execute(request)
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
				}
				assertNativeInputBindingDescription(t, f.session)
				for _, effect := range executableSummary(t, response, "invoke").EffectSources {
					if effect.provenanceIncomplete {
						t.Fatal("pending source became runtime uncertainty", effect)
					}
				}
				module := filepath.Join(t.TempDir(), "named-input.mts")
				if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				runtime := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);` + row.runtime
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runtime, module).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatalf("%s emitted named input: %v %s", target, err, output)
				}
			}
		})
	}
}

// Compilation owns current closure. Cached recipes here check only that the
// accepted path kept the Identifier, its exact reader and initializer debts.
func assertNativeInputBindingDescription(t *testing.T, session *Session) {
	t.Helper()
	found := false
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		facts := project.callableCache.merged.facts
		for _, fact := range facts {
			recipes := make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
			for _, recipe := range fact.staged.operationRecipes {
				recipes[recipe.key] = recipe
			}
			for _, recipe := range fact.staged.operationRecipes {
				source := recipe.nativeGet
				if source == nil || source.input == nil || source.kind != sourceNativeObjectFreeze || recipe.key.selector.field != "algorithm" || !ast.IsIdentifier(source.input.input.expression) {
					continue
				}
				found = true
				plan := *source.input
				if !validNativeInputBindingPlan(plan, source) || plan.input.expression != restrictedInvocationArguments(source.request.use.AsCallExpression())[0] {
					t.Fatal("input binding was replaced by its initializer")
				}
				for _, role := range []string{"algorithm", "eager-inputs"} {
					phase := recipes[nativeRootDebtRequest(source, role).producer]
					if !operationContainsRequest(phase.delta.required, plan.bindingData) {
						t.Fatal("input phase omitted binding DATA", role)
					}
				}
				binding := recipes[plan.bindingData.producer]
				if binding.callResult == nil || binding.callResult.binding == nil || !validStagedCallResultRecipe(binding) || !validNativeInputBindingReading(binding.callResult, plan.bindingData, plan.request.cut) {
					t.Fatal("original binding source/read cut lost")
				}
				clones := make([]callableFacts, len(facts))
				for i := range facts {
					clones[i] = cloneProjectCallableFact(facts[i])
				}
				fresh := registerCallableEffectWork(clones)
				fresh.operationGeneration = project.callableCache.owner.values.generation
				if _, current := fresh.inputBindingData(clones, plan.request, plan.bindingData); current {
					t.Fatal("cached binding recipe supplied fresh applied DATA")
				}
			}
		}
	}
	if !found {
		t.Fatal("compiled named input did not use the typed binding path")
	}
}
