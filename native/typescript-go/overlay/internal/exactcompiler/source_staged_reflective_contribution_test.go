package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This protects the original installation-to-SOURCE handoff independently from
// the unchanged full mutation journey. It creates no recipe, ACK, observation,
// query lease or execution flag. Complete field DATA and terminal closure are
// deliberately still checked by PrototypeMutationDonors, not inferred here.
func TestReflectiveContributionOriginalReader(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		reached := map[sourceReflectiveContributionPurpose]bool{}
		var original sourceStagedOperationRecipe
		for _, recipe := range work.operationRecipes {
			s := recipe.memberSource
			if s == nil || s.reflectiveContribution == nil {
				continue
			}
			d := s.reflectiveContribution
			id, adopted := work.operationIDs[recipe.key]
			if !adopted || id.epoch != work.operationEpoch || id.index == 0 || !work.operations[id.index].delta.extracted || work.operations[id.index].revision == 0 || !work.reflectiveContributionCurrent(recipe) {
				t.Fatal("original reflective SOURCE local delivery UNREACHED")
			}
			if !operationContainsRequest(recipe.delta.required, d.root) {
				t.Fatal("SOURCE contribution lost original full Call debt")
			}
			for _, data := range d.data {
				if !operationContainsRequest(recipe.delta.required, data) {
					t.Fatal("SOURCE contribution lost installed getter DATA debt")
				}
			}
			reached[d.purpose] = true
			original = recipe
		}
		for _, purpose := range []sourceReflectiveContributionPurpose{reflectiveContributionHas, reflectiveContributionFieldGet, reflectiveContributionRecordGet} {
			if !reached[purpose] {
				t.Fatalf("original reflective reader purpose %d UNREACHED", purpose)
			}
		}
		// Detached descriptions preserve their own immutable association. Copying a
		// description cannot change reader, cut or generation and retain admission.
		changed := original
		changed.memberSource = cloneStagedMemberSource(original.memberSource)
		changed.memberSource.reflectiveContribution.reader.edge += "foreign"
		if validReflectiveContributionRecipe(changed) {
			t.Fatal("foreign reader admitted")
		}
		changed.memberSource = cloneStagedMemberSource(original.memberSource)
		changed.memberSource.reflectiveContribution.parent.cut.use = nil
		if validReflectiveContributionRecipe(changed) {
			t.Fatal("foreign physical parent cut admitted")
		}
		changed.memberSource = cloneStagedMemberSource(original.memberSource)
		changed.memberSource.reflectiveContribution.generation = &projectGeneration{}
		if validReflectiveContributionRecipe(changed) || work.reflectiveContributionCurrent(changed) {
			t.Fatal("foreign generation admitted")
		}
		if !validReflectiveContributionRecipe(original) || !work.reflectiveContributionCurrent(original) {
			t.Fatal("mutating detached description changed original reader")
		}
	})
}
