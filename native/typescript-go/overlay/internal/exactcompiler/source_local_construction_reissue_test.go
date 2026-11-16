package exactcompiler

import (
	"context"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Retained source descriptions are reused without running the definition's
// extraction task again. Each new work graph must issue its own original
// creation observation and consume actual field/capture DATA deliveries.
func TestLocalConstructionCanonicalEventReissue(t *testing.T) {
	const id = "/virtual/local-construction-reissue.ts"
	const original = `export{};function descriptorOf(input:{value:()=>string}){return Object.getOwnPropertyDescriptor(input,'value')}export function probe(){const capture={read(){return document.title}};const target={value:()=>capture.read()};const descriptor=descriptorOf(target);return descriptor?.value()}`
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: original, Diagnostics: "semantic"}, id, map[string]string{id: original})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, original)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	first := localConstructionReissueObservation(t, project, generation.sourceFile, newExecutableBodyOwner(project, generation.checker), false)
	cache := project.callableCache
	second := localConstructionReissueObservation(t, project, generation.sourceFile, cache.owner, true)
	if !sameOperationEndpoint(first, second) {
		t.Fatal("unchanged canonical construction SOURCE relation changed across work graphs")
	}
	generation.release()
	if _, known, pending := moduleConstructionFieldSources(first, "value"); known || !pending {
		t.Fatal("retired generation creation proof remained usable")
	}
	edited := strings.Replace(original, "document.title", "document.body.tagName", 1)
	next, err := project.advance(context.Background(), id, edited)
	if err != nil {
		t.Fatal(err)
	}
	defer next.release()
	fresh := localConstructionReissueObservation(t, project, next.sourceFile, newExecutableBodyOwner(project, next.checker), false)
	if project.callableCache == cache || fresh.moduleConstruction == nil || fresh.moduleConstruction.source.generation != next || sameOperationEndpoint(first, fresh) {
		t.Fatal("fresh generation reused retired construction description/currentness")
	}
	if _, known, pending := moduleConstructionFieldSources(first, "value"); known || !pending {
		t.Fatal("fresh generation renewed a detached old creation proof")
	}
}

func localConstructionReissueObservation(t *testing.T, project *projectState, file *ast.SourceFile, initial *executableBodyOwner, cached bool) sourceRelativeEndpoint {
	t.Helper()
	cache, _ := prepareProjectCallableContexts(project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
	entry := cache.bySource[file]
	if entry.sourceContext == nil || entry.sourceContext.collect == cached {
		t.Fatalf("original cached/first source setup UNREACHED: cached=%v", cached)
	}
	collection := beginProjectCallableCollection(cache, cache.owner)
	defer collection.close()
	for _, recipe := range collection.work.operationRecipes {
		if recipe.callResult != nil && recipe.callResult.moduleConstruction != nil && recipe.callResult.moduleConstruction.localOwner != nil && collection.work.memberCoverageObserved[recipe.callResult.moduleConstruction.creationEffects.producer] == collection.work.operationGeneration {
			t.Fatal("fresh work inherited a construction event observation")
		}
	}
	collection.collect()
	analysis := collection.resolve(file)
	if len(analysis.pending) != 0 {
		t.Fatalf("original creation/field/capture source collection pending: %#v", analysis.pending)
	}
	for _, recipe := range collection.work.operationRecipes {
		if recipe.callResult == nil || recipe.callResult.moduleConstruction == nil || recipe.callResult.moduleConstruction.localOwner == nil || !validLocalConstructionDataRecipe(recipe) {
			continue
		}
		plan := recipe.callResult.moduleConstruction
		if plan.binding.Name().Text() != "target" {
			continue
		}
		if collection.work.memberCoverageObserved[plan.creationEffects.producer] != collection.work.operationGeneration {
			t.Fatal("current original SOURCE creation event UNREACHED")
		}
		data, applied := collection.work.stagedCallResultData(recipe.callResult.request)
		if !applied || !data.delta.extracted || len(data.delta.exposures) != 1 {
			t.Fatal("actual current construction DATA delivery UNREACHED")
		}
		endpoint := data.delta.exposures[0].endpoint
		fields, known, pending := moduleConstructionFieldSources(endpoint, "value")
		if !known || pending || len(fields) != 1 || fields[0].endpoint.constructionCallable == nil {
			t.Fatal("original current captured field SOURCE relation UNREACHED")
		}
		value := fields[0].endpoint.constructionCallable
		if value.pending || len(value.captures) != 1 {
			t.Fatal("original capture DATA membership UNREACHED")
		}
		child, delivered := collection.work.stagedCallResultData(value.captures[0].required)
		if !delivered || !child.delta.extracted {
			t.Fatal("original capture child DATA APPLIED UNREACHED")
		}
		descriptorContractBrowser(t, analysis, true)
		return cloneSourceRelativeEndpoint(endpoint)
	}
	t.Fatal("original local construction producer UNREACHED")
	return sourceRelativeEndpoint{}
}
