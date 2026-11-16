package exactcompiler

import (
	"context"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const liveCDataContinuationFixture = `export{};const target:object={value:1};export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.value}`

// The original collector must deliver the deferred DATA and then observe the
// same physical member Get after receiver DATA arrives. A registered reader or algorithm X alone fails.
func TestLiveCDataContinuationOriginalGet(t *testing.T) {
	withReflectiveRelevanceSource(t, "/// <reference lib=\"dom\" />\n"+liveCDataContinuationFixture, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		_, before, found := liveCDataContinuationRecipe(collection, file)
		if !found {
			t.Fatal("original pending member continuation UNREACHED")
		}
		pending := false
		for _, reading := range before.callResult.getResult.frameworkResume.readings {
			data, applied := collection.work.stagedCallResultData(reading)
			pending = pending || !applied || !data.delta.extracted
		}
		if !pending {
			t.Fatal("genuine first pending DATA delivery UNREACHED")
		}
		initialID, _, adopted := liveCDataContinuationRecipe(collection, file)
		if !adopted || collection.work.operations[initialID.index].frameworkGetObservation != nil {
			t.Fatal("pending receiver DATA was mistaken for a performed/current P Get")
		}
		result := collection.resolve(file)
		assertLiveCDataContinuationCurrent(t, collection, file, result)

	})
}

// This follows actual AST membership, never positions or an unrelated current
// native operation. There is one physical optional member read in this fixture.
func liveCDataContinuationRecipe(collection *projectCallableCollection, file *ast.SourceFile) (sourceStagedOperationID, sourceStagedOperationRecipe, bool) {
	var original *ast.Node
	walkNode(file.AsNode(), func(n *ast.Node) bool {
		if ast.IsPropertyAccessExpression(n) && n.Name() != nil && n.Name().Text() == "value" && ast.IsCallExpression(n.Expression()) {
			original = n
		}
		return true
	})
	if original == nil {
		return sourceStagedOperationID{}, sourceStagedOperationRecipe{}, false
	}
	for _, recipe := range collection.work.operationRecipes {
		if recipe.callResult == nil || recipe.callResult.getResult == nil || recipe.callResult.getResult.frameworkResume == nil {
			continue
		}
		resume := recipe.callResult.getResult.frameworkResume
		if resume.parent.producer.operation == original {
			id, adopted := collection.work.operationIDs[recipe.key]
			return id, recipe, adopted
		}
	}
	return sourceStagedOperationID{}, sourceStagedOperationRecipe{}, false
}

func assertLiveCDataContinuationCurrent(t *testing.T, collection *projectCallableCollection, file *ast.SourceFile, result callableAnalysis) *sourceFrameworkGetObservation {
	t.Helper()
	work := &collection.work
	id, recipe, found := liveCDataContinuationRecipe(collection, file)
	if !found || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !validFrameworkGetResumptionRecipe(recipe) {
		t.Fatal("genuine original Get continuation UNREACHED")
	}
	resume := recipe.callResult.getResult.frameworkResume
	if resume.generation != work.operationGeneration || len(resume.readings) == 0 {
		t.Fatal("original source lifetime/reader association absent")
	}
	for _, reading := range resume.readings {
		if !validStagedCallResultReading(reading, resume.parent, resume.cut) || !work.stagedMemberResultReading(reading, resume.parent, resume.cut) {
			t.Fatal("original full reader/cut association absent")
		}
		child, adopted := work.operationIDs[reading.producer]
		closed := work.closedOperationDependencies()
		data, applied := work.stagedCallResultData(reading)
		if !adopted || child.epoch != work.operationEpoch || child.index == 0 || int(child.index) >= len(closed) || !closed[child.index] || !applied || !data.delta.extracted {
			t.Fatal("original closed DATA and exact APPLIED reading UNREACHED")
		}
	}
	coverageObserved := false
	for _, required := range recipe.delta.required {
		c := work.operationRecipes[required.producer]
		if c.memberSource == nil || c.memberSource.coverage == nil {
			continue
		}
		coverageObserved = coverageObserved || validStagedMemberCoverageRecipe(c) && sameOperationRequest(c.memberSource.parent, resume.parent) && c.memberSource.coverage.cut == resume.cut && c.delta.extracted && work.memberCoverageObserved[c.key] == work.operationGeneration
	}
	state := &work.operations[id.index]
	if !coverageObserved || !state.delta.extracted || !recipe.delta.extracted || state.frameworkGetObservation == nil || !work.frameworkGetObservationCurrent(state.frameworkGetObservation) {
		t.Fatal("fresh original Get/current C publication UNREACHED")
	}
	if len(result.pending) != 0 {
		t.Fatalf("whole original collector remains pending after fresh Get observation: %#v", result.pending)
	}
	return state.frameworkGetObservation
}

func TestLiveCDataContinuationObservationRefusers(t *testing.T) {
	withModuleCreationDataWork(t, liveCDataContinuationFixture, func(collection *projectCallableCollection, result callableAnalysis, binding *ast.Node) {
		file := ast.GetSourceFileOfNode(binding)
		if file == nil {
			t.Fatal("actual original file absent")
		}
		observed := assertLiveCDataContinuationCurrent(t, collection, file, result)
		copy := *observed
		if collection.work.frameworkGetObservationCurrent(&copy) {
			t.Fatal("copied observation acquired current authority")
		}
		_, recipe, found := liveCDataContinuationRecipe(collection, file)
		if !found {
			t.Fatal("original continuation absent")
		}
		for _, row := range []struct {
			name   string
			change func(*sourceStagedOperationRecipe)
		}{
			{"wrong-cut", func(c *sourceStagedOperationRecipe) { c.callResult.getResult.frameworkResume.cut.reading = nil }},
			{"wrong-generation", func(c *sourceStagedOperationRecipe) { c.callResult.generation = nil }},
			{"wrong-reader", func(c *sourceStagedOperationRecipe) {
				c.callResult.getResult.frameworkResume.readings[0].consumer = nil
			}},
		} {
			t.Run(row.name, func(t *testing.T) {
				bad := recipe
				bad.callResult = cloneStagedCallResultSource(recipe.callResult)
				bad.delta = cloneOperationDelta(recipe.delta)
				row.change(&bad)
				if validFrameworkGetResumptionRecipe(bad) {
					t.Fatal("foreign fullcut/generation/reader accepted")
				}
			})
		}
	})
}

func TestLiveCDataContinuationCanonicalReissue(t *testing.T) {
	const id = "/virtual/live-c-data-continuation.ts"
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: liveCDataContinuationFixture, Diagnostics: "semantic"}, id, map[string]string{id: liveCDataContinuationFixture})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, liveCDataContinuationFixture)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	type sample struct {
		work     *callableEffectWork
		observed *sourceFrameworkGetObservation
		epoch    *sourceStagedOperationEpoch
	}
	collect := func(file *ast.SourceFile, owner *executableBodyOwner, cached bool) sample {
		cache, _ := prepareProjectCallableContexts(project, file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		entry := cache.bySource[file]
		if entry.sourceContext == nil || entry.sourceContext.collect == cached {
			t.Fatal("requested fresh/cached source path UNREACHED")
		}
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		for _, state := range collection.work.operations {
			if state.frameworkGetObservation != nil {
				t.Fatal("clone inherited a Get observation")
			}
		}
		collection.collect()
		result := collection.resolve(file)
		return sample{&collection.work, assertLiveCDataContinuationCurrent(t, collection, file, result), collection.work.operationEpoch}
	}
	first := collect(generation.sourceFile, newExecutableBodyOwner(project, generation.checker), false)
	cache := project.callableCache
	second := collect(generation.sourceFile, cache.owner, true)
	if first.epoch == second.epoch || first.observed == second.observed || second.work.frameworkGetObservationCurrent(first.observed) {
		t.Fatal("cached descriptions borrowed previous graph observation")
	}
	generation.release()
	next, err := project.advance(context.Background(), id, strings.Replace(liveCDataContinuationFixture, "value:1", "value:2", 1))
	if err != nil {
		t.Fatal(err)
	}
	defer next.release()
	if first.work.frameworkGetObservationCurrent(first.observed) || second.work.frameworkGetObservationCurrent(second.observed) {
		t.Fatal("retired generation retained current observation")
	}
	fresh := collect(next.sourceFile, newExecutableBodyOwner(project, next.checker), false)
	if fresh.epoch == second.epoch || fresh.observed == second.observed {
		t.Fatal("edited generation reused old observation")
	}
}
