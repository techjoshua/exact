package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This protects native/external origins of the original finished-field mapper
// → conditional DATA child. Get-origin interests have their own real-consumer
// control and may remain pending during this incremental migration. This test
// writes no recipe, observation, subscriber revision or execution flag. Local
// SOURCE delivery here is not whole collector/Get/native acceptance.
func TestFieldMutationDataOriginalSourceEntry(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		native, external := false, false
		var original sourceStagedOperationRecipe
		for _, recipe := range work.operationRecipes {
			s := recipe.mutationData
			if s == nil || s.native == nil && s.external == nil {
				continue
			}
			id, adopted := work.operationIDs[recipe.key]
			if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !work.fieldMutationDataCurrent(recipe) {
				t.Fatal("original mutation SOURCE child currentness UNREACHED")
			}
			state := &work.operations[id.index]
			sub := state.subscribers[sourceStagedOperationConsumer{s.request.consumer, s.request.edge}]
			if !state.delta.extracted || state.revision == 0 || sub == nil || sub.blocked || !sameOperationRequest(sub.request, s.request) || sub.applied != state.revision {
				t.Fatal("original mutation DATA local extraction/APPLIED UNREACHED")
			}
			if !operationContainsRequest(work.operationRecipes[s.field.producer].delta.required, s.request) {
				t.Fatal("field did not retain exact declared DATA child")
			}
			if s.native != nil {
				native = true
				for _, required := range []sourceStagedOperationRequest{s.native.request, nativeRootDebtRequest(s.native, "algorithm"), nativeRootDebtRequest(s.native, "callee-get")} {
					if !operationContainsRequest(recipe.delta.required, required) {
						t.Fatal("native mutation lost original Call/algorithm/Get debt")
					}
				}
			} else {
				external = true
				for _, residual := range state.delta.residuals {
					if residual.mutation == nil || residual.mutation.external == nil || residual.mutation.externalActive || len(residual.mutation.applications) != 0 {
						t.Fatal("passive external DATA was promoted to an activated terminal")
					}
				}
			}
			original = recipe
		}
		if !native || !external {
			t.Fatalf("genuine native/external SOURCE entries UNREACHED: native=%t external=%t", native, external)
		}
		copy := original
		copy.mutationData = cloneFieldMutationData(original.mutationData)
		copy.mutationData.request.cut.use = nil
		if validFieldMutationDataRecipe(copy) || work.fieldMutationDataCurrent(copy) {
			t.Fatal("foreign source cut admitted")
		}
		copy.mutationData = cloneFieldMutationData(original.mutationData)
		copy.mutationData.generation = &projectGeneration{}
		if validFieldMutationDataRecipe(copy) || work.fieldMutationDataCurrent(copy) {
			t.Fatal("foreign generation admitted")
		}
		copy.mutationData = cloneFieldMutationData(original.mutationData)
		copy.mutationData.field.producer.selector.occurrence = file.AsNode()
		if validFieldMutationDataRecipe(copy) || work.fieldMutationDataCurrent(copy) {
			t.Fatal("foreign field receiver association admitted")
		}
		if !validFieldMutationDataRecipe(original) || !work.fieldMutationDataCurrent(original) {
			t.Fatal("detached copy mutation changed original source")
		}
		// A new real work lifetime has no original mapper/Get receipt. Merely
		// carrying the sealed description cannot populate its graph or grant DATA.
		fresh := beginProjectCallableCollection(cache, cache.owner)
		defer fresh.close()
		if fresh.work.fieldMutationDataCurrent(original) {
			t.Fatal("new work inherited old mapper/source authority")
		}
	})
}
