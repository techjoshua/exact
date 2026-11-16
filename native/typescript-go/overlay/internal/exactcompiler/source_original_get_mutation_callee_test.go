package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Original native Get publication must reserve and bind both callee-only
// SOURCE interests. Copied descriptions below are never installed in the graph.
func TestOriginalNativeCalleeGetMutationSource(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		reached := make(map[sourceNativeKind]bool)
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource == nil || recipe.memberSource.originalGetMutation == nil || recipe.memberSource.originalGetMutation.nativeCallee == nil {
				continue
			}
			s := recipe.memberSource.originalGetMutation
			n := s.nativeCallee
			if !work.originalGetMutationCurrent(recipe) || !validOriginalCalleeGetMutationSource(s) || !sameOperationRequest(originalGetMutationReader(s), originalNativeCalleeGetMutationReader(n)) || !operationContainsRequest(recipe.delta.required, originalNativeCalleeGetMutationReader(n)) {
				t.Fatal("actual callee SOURCE lost its original Get authority or debt")
			}
			bound := false
			for _, interestRecipe := range work.operationRecipes {
				if interestRecipe.memberSource == nil || interestRecipe.memberSource.originalGetMutationInterest == nil {
					continue
				}
				i := interestRecipe.memberSource.originalGetMutationInterest
				if !sameOriginalGetNativeCallee(i.nativeCallee, n) {
					continue
				}
				if !work.originalGetMutationInterestCurrent(interestRecipe) || i.source == nil || !originalCalleeGetMutationInterestSourceMatches(i, i.source) || !sameOriginalGetMutationIdentity(i.source, s) || !operationContainsRequest(interestRecipe.delta.required, originalGetMutationRequest(i.source)) {
					t.Fatal("actual callee interest did not bind the original SOURCE")
				}
				bound = true
			}
			if !bound {
				t.Fatal("genuine selected-callee interest binding UNREACHED")
			}
			reached[n.kind] = true

			bad := cloneOriginalGetMutationSource(s)
			bad.request = n.root
			if validOriginalCalleeGetMutationSource(bad) {
				t.Fatal("whole Call reader accepted as a callee Get")
			}
			bad = cloneOriginalGetMutationSource(s)
			bad.queryCut.initializing = nil
			if bad.queryCut == s.queryCut {
				bad.queryCut.reading = nil
			}
			if work.originalCalleeGetMutationCurrent(bad) {
				t.Fatal("foreign original callee cut accepted")
			}
			foreign := cloneOriginalGetNativeCallee(n)
			foreign.generation = &projectGeneration{}
			if work.originalNativeCalleeGetMutationHeaderCurrent(foreign) {
				t.Fatal("foreign callee generation accepted")
			}
			foreign = cloneOriginalGetNativeCallee(n)
			foreign.method = n.get
			if work.originalNativeCalleeGetMutationHeaderCurrent(foreign) {
				t.Fatal("unselected callee method accepted")
			}
			foreign = cloneOriginalGetNativeCallee(n)
			foreign.get = n.root.producer.operation
			if validOriginalGetNativeCalleeHeader(foreign) {
				t.Fatal("Call operation accepted as original callee property")
			}
			foreign = cloneOriginalGetNativeCallee(n)
			foreign.root.edge += ":foreign"
			if work.originalNativeCalleeGetMutationHeaderCurrent(foreign) {
				t.Fatal("foreign original root request accepted")
			}
		}
		if !reached[sourceNativeObjectDefineProperty] || !reached[sourceNativeObjectGetOwnPropertyDescriptor] {
			t.Fatal("both genuine native callee SOURCE scopes UNREACHED")
		}
	})
}
