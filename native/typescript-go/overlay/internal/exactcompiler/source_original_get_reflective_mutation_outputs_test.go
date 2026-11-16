package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This control uses the original collector's real reflected installation and
// Get/BODY readers. Candidate output completeness does not require enclosing
// Get/C Effects completion; all those requests remain required consumer debt.
// An absent authentic witness fails rather than creating one.
func TestOriginalReflectiveGetterMutationOutputProvider(t *testing.T) {
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
			if recipe.memberSource == nil || recipe.memberSource.originalGetMutation == nil || recipe.memberSource.originalGetMutation.record == nil {
				continue
			}
			get := recipe.memberSource.originalGetMutation
			for _, candidate := range get.population {
				member := work.operationRecipes[candidate.producer]
				if !validReflectiveContributionRecipe(member) {
					continue
				}
				contribution := member.memberSource.reflectiveContribution
				if len(contribution.data) != 1 {
					continue
				}
				exposure := work.operationRecipes[contribution.data[0].producer]
				for _, field := range exposure.delta.required {
					if _, valid := fieldSourceParent(field); !valid {
						continue
					}
					delta, _, complete := work.originalReflectiveGetterMutationOutputs(collection.facts, get, candidate, field)
					if !complete {
						continue
					}
					if !delta.extracted || !operationContainsRequest(delta.required, candidate) || !operationContainsRequest(delta.required, contribution.reader) || !operationContainsRequest(delta.required, contribution.data[0]) || !operationContainsRequest(delta.required, contribution.root) || !operationContainsRequest(delta.required, contribution.algorithm) || !operationContainsRequest(delta.required, originalGetMutationRequest(get)) || !operationContainsRequest(delta.required, get.coverage) || operationContainsRequest(delta.required, get.request) {
						t.Fatal("actual reflective getter provider lost authentic source debt or required lexical metadata")
					}
					known := false
					for _, residual := range delta.residuals {
						known = known || residual.mutation != nil && residual.mutation.external != nil && work.relativeFieldMutationSourceCurrent(residual.mutation)
					}
					if !known {
						t.Fatal("actual original getter mutation output UNREACHED")
					}
					reached = true
					foreign := candidate
					foreign.edge += ":foreign"
					if _, _, accepted := work.originalReflectiveGetterMutationOutputs(collection.facts, get, foreign, field); accepted {
						t.Fatal("foreign population reader accepted")
					}
					wrongField := field
					wrongField.edge += ":foreign"
					if _, _, accepted := work.originalReflectiveGetterMutationOutputs(collection.facts, get, candidate, wrongField); accepted {
						t.Fatal("foreign requested field accepted")
					}
					wrongCut := *get
					wrongCut.queryCut.use = nil
					if wrongCut.queryCut == get.queryCut {
						wrongCut.queryCut.reading = nil
					}
					if _, _, accepted := work.originalReflectiveGetterMutationOutputs(collection.facts, &wrongCut, candidate, field); accepted {
						t.Fatal("foreign original Get cut accepted")
					}
					wrongGeneration := *get
					wrongGeneration.generation = nil
					if _, _, accepted := work.originalReflectiveGetterMutationOutputs(collection.facts, &wrongGeneration, candidate, field); accepted {
						t.Fatal("foreign SOURCE generation accepted")
					}
					wrongRecord := *get
					wrongRecord.record = cloneDescriptorRecordGet(get.record)
					wrongRecord.record.view.delivery.edge += ":foreign"
					if _, _, accepted := work.originalReflectiveGetterMutationOutputs(collection.facts, &wrongRecord, candidate, field); accepted {
						t.Fatal("foreign descriptor DATA reader accepted")
					}
					if recipe.delta.extracted && !originalGetMutationDescriptionComplete(get) {
						t.Fatal("SOURCE description completed without every provider association")
					}
					if len(recipe.delta.exposures)+len(recipe.delta.residuals)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects) != 0 {
						t.Fatal("SOURCE description exported mutation output authority")
					}
				}
			}
		}
		if !reached {
			t.Fatal("genuine reflective getter output provider UNREACHED")
		}
	})
}
