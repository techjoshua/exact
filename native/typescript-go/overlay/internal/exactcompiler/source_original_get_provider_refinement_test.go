package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The real collector must promote the original DefineProperty callee SOURCE,
// without requiring unrelated whole-field or project closure. The unchanged
// field-delivery test remains the downstream terminal acceptance check.
func TestOriginalGetMutationProviderRetryProductionEntry(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		reached := false
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource == nil || recipe.memberSource.originalGetMutation == nil {
				continue
			}
			s := recipe.memberSource.originalGetMutation
			if s.nativeCallee == nil || s.nativeCallee.kind != sourceNativeObjectDefineProperty || len(s.population) == 0 {
				continue
			}
			id, adopted := work.operationIDs[recipe.key]
			if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("actual SOURCE adoption UNREACHED")
			}
			state := &work.operations[id.index]
			if state.invalid || !recipe.delta.extracted || !state.delta.extracted || state.revision == 0 || !work.originalGetMutationCurrent(recipe) {
				t.Fatal("actual provider SOURCE local extraction/currentness UNREACHED")
			}
			for _, provider := range s.providers {
				if provider.kind == originalGetMutationProviderUnsupported || provider.reader.producer.operation == nil || !operationContainsRequest(recipe.delta.required, provider.candidate) || !operationContainsRequest(recipe.delta.required, provider.reader) {
					t.Fatal("actual provider description or retained debt UNREACHED")
				}
			}
			applied := false
			for _, sub := range state.subscribers {
				applied = applied || sub != nil && !sub.blocked && sub.applied == state.revision && sameOperationRequest(sub.request, recipe.memberSource.request)
			}
			if !applied {
				t.Fatal("actual SOURCE default APPLIED UNREACHED")
			}
			stamp, revision := work.memberCoverageObserved[recipe.key], state.revision
			if work.refineOriginalGetMutationProviders(work.operationFacts, id) {
				t.Fatal("sealed SOURCE refined again")
			}
			if work.memberCoverageObserved[recipe.key] != stamp || work.operations[id.index].revision != revision {
				t.Fatal("retry recertified original event or republished sealed source")
			}
			fresh := beginProjectCallableCollection(cache, cache.owner)
			if fresh.work.refineOriginalGetMutationProviders(nil, id) || fresh.work.originalGetMutationCurrent(recipe) {
				fresh.close()
				t.Fatal("fresh work inherited SOURCE authority")
			}
			fresh.close()
			reached = true
		}
		if !reached {
			t.Fatal("original DefineProperty provider SOURCE entry UNREACHED")
		}
	})
}
