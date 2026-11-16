package exactcompiler

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"
)

// These are actual Session updates, not another resolution of cached facts.
// The compiler's publication gates own current Get/DATA/event authority; the
// cached descriptions below check only their generation and factory correlation.
func TestStagedQualifiedSessionIncremental(t *testing.T) {
	for _, name := range []string{"global-store", "named-module", "named-local"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			if !t.Run(name+"/"+string(target), func(t *testing.T) {
				file := "entry.ts"
				source := `const value=Object.defineProperties({}, {x:{value:1}});const frozen=Object.freeze(value);export function invoke(){return frozen}`
				if name == "named-local" {
					source = `export function invoke(){const value=Object.defineProperties({}, {x:{value:1}});return Object.freeze(value)}`
				}
				var f *executableFixture
				if name == "global-store" {
					f = newStagedGlobalStoreFixture(t)
					file = "component-abi/opaque-operation.ts"
					source = f.files[file]
				} else {
					f = newExecutableFixture(t, map[string]string{file: source})
				}
				request := f.request("compile", file)
				request.Target, request.stagedReplacement = target, true
				initial := f.session.Execute(request)
				assertQualifiedIncrementalResponse(t, initial, name == "global-store")
				repeated := f.session.Execute(request)
				assertQualifiedIncrementalResponse(t, repeated, name == "global-store")
				assertQualifiedIncrementalSemantics(t, initial, repeated)
				project := qualifiedIncrementalProject(t, f.session)
				assertQualifiedIncrementalSources(t, project, name == "global-store")
				oldProgram, oldCache := project.program, project.callableCache

				changed := strings.Replace(source, "value:1", "value:2", 1)
				if name == "global-store" {
					changed = strings.Replace(source, "sharedOpaqueOperationStore('fixture')", "sharedOpaqueOperationStore('edited')", 1)
				}
				if changed == source {
					t.Fatal("actual source edit missing")
				}
				f.files[file] = changed
				if err := os.WriteFile(request.ID, []byte(changed), 0600); err != nil {
					t.Fatal(err)
				}
				request.Source = changed // The existing public source-override entry.
				reused := f.session.Execute(request)
				freshSession := NewSession()
				fresh := freshSession.Execute(request)
				assertQualifiedIncrementalResponse(t, reused, name == "global-store")
				assertQualifiedIncrementalResponse(t, fresh, name == "global-store")
				assertQualifiedIncrementalSemantics(t, reused, fresh)
				current := qualifiedIncrementalProject(t, f.session)
				cache := current.callableCache
				if current.program == oldProgram || oldCache.ownsGeneration(current.program, cache.owner.checker) || cache.ownsGeneration(oldProgram, oldCache.owner.checker) {
					t.Fatal("edited program accepted retired checker-bound callable ownership")
				}
				assertQualifiedIncrementalSources(t, current, name == "global-store")
				assertQualifiedIncrementalSources(t, qualifiedIncrementalProject(t, freshSession), name == "global-store")
				for _, response := range []Response{reused, fresh} {
					runtime := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);const value=m.invoke();assert.equal(value.x,2);assert.equal(Object.isFrozen(value),true);`
					if name == "global-store" {
						runtime = stagedGlobalStoreRuntime + `assert.equal(realm[key('edited')],first);assert.equal(realm[key('fixture')],undefined);`
					} else if name == "named-module" {
						runtime += `assert.equal(m.invoke(),value);`
					} else {
						runtime += `assert.notEqual(m.invoke(),value);`
					}
					runQualifiedIncrementalArtifact(t, response.Code, runtime)
				}
			}) {
				return
			}
		}
	}
}

func assertQualifiedIncrementalResponse(t *testing.T, response Response, runtimeUnknown bool) {
	t.Helper()
	if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
		t.Fatal(response.Error, response.Diagnostics)
	}
	unknown := false
	for _, source := range executableSummary(t, response, "invoke").EffectSources {
		if source.provenanceIncomplete {
			t.Fatal("compiler pending work published as runtime uncertainty", source)
		}
		unknown = unknown || source.Environment == "unknown"
	}
	if unknown != runtimeUnknown {
		t.Fatal("runtime effect classification changed", executableSummary(t, response, "invoke"))
	}
}

func assertQualifiedIncrementalSemantics(t *testing.T, a, b Response) {
	t.Helper()
	signature := func(response Response) []string {
		summary := executableSummary(t, response, "invoke")
		targets := append([]string(nil), summary.ArtifactTargets...)
		sort.Strings(targets)
		rows := []string{summary.Effect, summary.DirectEffect, fmt.Sprint(targets)}
		for _, group := range [][]EnvironmentEffectSource{summary.DirectEffectSources, summary.EffectSources} {
			var effects []string
			for _, source := range group {
				effects = append(effects, fmt.Sprintf("%s|%s|%t|%t|%q", source.Environment, source.Description, source.Opaque, source.provenanceIncomplete, source.Path))
			}
			sort.Strings(effects)
			rows = append(rows, strings.Join(effects, "\n"))
		}
		return rows
	}
	if !slices.Equal(signature(a), signature(b)) {
		t.Fatalf("fresh and reused Session semantics differ:\n%q\n%q", signature(a), signature(b))
	}
}

func qualifiedIncrementalProject(t *testing.T, session *Session) *projectState {
	t.Helper()
	for _, project := range session.projects {
		if project.callableCache != nil {
			return project
		}
	}
	t.Fatal("actual Session callable generation unavailable")
	return nil
}

func assertQualifiedIncrementalSources(t *testing.T, project *projectState, global bool) {
	t.Helper()
	cache := project.callableCache
	if !cache.ownsGeneration(project.program, cache.owner.checker) {
		t.Fatal("callable owner does not belong to the actual current generation")
	}
	// Execute has released its active request. These are descriptions of the
	// accepted program/checker, not live receipts. A same-program cache hit may
	// retain its completed request token; an edited program cannot reuse it.
	belongs := func(generation *projectGeneration) bool {
		return generation != nil && generation.program == project.program && generation.checker == cache.owner.checker
	}
	found := false
	recipes := make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
	for _, fact := range cache.merged.facts {
		for _, recipe := range fact.staged.operationRecipes {
			recipes[recipe.key] = recipe
		}
	}
	for _, fact := range cache.merged.facts {
		for _, recipe := range fact.staged.operationRecipes {
			if global {
				if recipe.memberSource == nil || recipe.memberSource.globalWrite == nil {
					continue
				}
				found = true
				if !validStagedGlobalWriteRecipe(recipe) || !belongs(recipe.memberSource.generation) || !belongs(recipe.memberSource.globalWrite.generation) {
					t.Fatal("current GlobalWrite description retained a retired source owner")
				}
			} else {
				source := recipe.nativeGet
				if source == nil || source.input == nil || source.input.bindingData.producer.operation == nil || recipe.key.selector.field != "algorithm" {
					continue
				}
				found = true
				data := recipes[source.input.bindingData.producer].callResult
				if !validNativeInputBindingPhase(recipe) || !recipe.delta.extracted || data == nil || !belongs(data.generation) || !validNativeInputBindingReading(data, source.input.bindingData, source.input.request.cut) {
					t.Fatal("current binding factory/full phase requirements unavailable")
				}
			}
			if !fact.staged.settled || fact.staged.operationsPending {
				t.Fatal("actual qualified source owner did not publish", fact.summary.Name)
			}
		}
	}
	if !found {
		t.Fatal("qualified original source relationship missing")
	}
}

func runQualifiedIncrementalArtifact(t *testing.T, code, runtime string) {
	t.Helper()
	root := t.TempDir()
	module := filepath.Join(root, "component-abi", "edited.mts")
	version := filepath.Join(root, "component", "contract-versions.js")
	for path, source := range map[string]string{module: code, version: `export const componentContractVersion=6;`} {
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runtime, module).CombinedOutput()
	if err != nil {
		t.Fatal(err, string(output))
	}
}
