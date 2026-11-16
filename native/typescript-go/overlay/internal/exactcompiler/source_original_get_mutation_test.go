package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This is the unchanged original authored-prototype fixture. The control owns
// only its actual target Get's conditional mutation SOURCE output, not whole
// Get/Call closure or the remaining prototype/BODY population.
func TestOriginalGetMutationTargetProductionEntry(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		var original sourceStagedOperationRecipe
		found := false
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource == nil || recipe.memberSource.originalGetMutation == nil || recipe.memberSource.originalGetMutation.nativeTarget == nil {
				continue
			}
			s := recipe.memberSource.originalGetMutation
			if !work.originalGetMutationCurrent(recipe) {
				t.Fatal("actual target Get mutation SOURCE currentness UNREACHED")
			}
			data, applied := work.originalGetMutationData(s)
			if !applied || !data.extracted {
				t.Fatal("actual target Get mutation SOURCE local DATA/APPLIED UNREACHED")
			}
			if len(data.exposures)+len(data.residuals)+len(data.effects)+len(data.relative)+len(data.invoked) != 0 {
				t.Fatal("data-slot arm exported value/effect/invocation authority")
			}
			if !operationContainsRequest(data.required, s.request) || s.request.producer.selector.field != "eager-target" || s.operation != s.request.producer.selector.occurrence || s.queryCut.operation != s.operation || s.request.cut.operation == s.operation {
				t.Fatal("original target query and native parent domains were conflated")
			}
			root := work.operationRecipes[s.nativeTarget.root.producer].nativeGet
			if root == nil || !operationContainsRequest(data.required, nativeRootDebtRequest(root, "callee-get")) {
				t.Fatal("mutation SOURCE output lost original callee Get debt")
			}
			original = recipe
			found = true
		}
		if !found {
			t.Fatal("original target Get mutation publisher UNREACHED")
		}
		copy := original
		copy.memberSource = cloneStagedMemberSource(original.memberSource)
		copy.memberSource.originalGetMutation.queryCut.reading = nil
		if validOriginalGetMutationRecipe(copy) || work.originalGetMutationCurrent(copy) {
			t.Fatal("foreign Get query cut admitted")
		}
		copy.memberSource = cloneStagedMemberSource(original.memberSource)
		copy.memberSource.originalGetMutation.generation = &projectGeneration{}
		if work.originalGetMutationCurrent(copy) {
			t.Fatal("foreign generation admitted")
		}
		copy.memberSource = cloneStagedMemberSource(original.memberSource)
		copy.memberSource.originalGetMutation.nativeTarget.method = copy.memberSource.originalGetMutation.nativeTarget.standard.prototype
		if work.originalGetMutationCurrent(copy) {
			t.Fatal("detached different native owner admitted")
		}
		if !work.originalGetMutationCurrent(original) {
			t.Fatal("copy mutation changed original output source")
		}
		fresh := beginProjectCallableCollection(cache, cache.owner)
		defer fresh.close()
		if fresh.work.originalGetMutationCurrent(original) {
			t.Fatal("fresh work inherited original Get publication")
		}
	})
}
