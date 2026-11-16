package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// A lexical read header identifies the original Get. Its registered record Get
// Effects role supplies required debt. This control qualifies only descriptive
// SOURCE admission/current DATA; field outputs and whole closure stay separate.
func TestOriginalRecordGetMutationSourceAdmission(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		var observed *sourceOriginalGetMutationSource
		var observedRecipe sourceStagedOperationRecipe
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource == nil || recipe.memberSource.originalGetMutation == nil || recipe.memberSource.originalGetMutation.record == nil {
				continue
			}
			s := recipe.memberSource.originalGetMutation
			effects := descriptorRecordGetEffectsRequest(s.request)
			owner, registered := work.operationRecipes[effects.producer]
			if !registered || owner.memberSource == nil || owner.memberSource.getEffects == nil || owner.memberSource.getEffects.descriptor == nil || !sameOperationRequest(owner.memberSource.request, effects) {
				t.Fatal("original record Get Effects producer UNREACHED")
			}
			if !sameOperationRequest(originalGetMutationReader(s), effects) || sameOperationRequest(effects, s.request) || !operationContainsRequest(recipe.delta.required, effects) || operationContainsRequest(recipe.delta.required, s.request) {
				t.Fatal("SOURCE confused lexical header with real Effects debt")
			}
			if !operationContainsRequest(recipe.delta.required, s.coverage) || !operationContainsRequest(recipe.delta.required, s.record.view.delivery) {
				t.Fatal("record SOURCE lost coverage or authentic descriptor DATA debt")
			}
			if len(s.population) != 6 || len(s.providers) != 6 {
				t.Fatal("original record population/provider descriptions UNREACHED")
			}
			for _, candidate := range s.population {
				if !operationContainsRequest(recipe.delta.required, candidate) {
					t.Fatal("record SOURCE lost actual candidate debt")
				}
			}
			for _, provider := range s.providers {
				if provider.reader.producer.operation == nil || !operationContainsRequest(recipe.delta.required, provider.reader) {
					t.Fatal("record SOURCE lost provider reader debt")
				}
				if provider.data.producer.operation != nil && !operationContainsRequest(recipe.delta.required, provider.data) {
					t.Fatal("record SOURCE lost provider DATA debt")
				}
			}
			id, adopted := work.operationIDs[recipe.key]
			if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("genuine record SOURCE adoption UNREACHED")
			}
			state := &work.operations[id.index]
			if state.invalid || !state.dependenciesRegistered || !state.delta.extracted || !work.originalGetMutationCurrent(recipe) {
				t.Fatal("genuine record SOURCE noninvalid local admission/current UNREACHED")
			}
			data, applied := work.originalGetMutationData(s)
			if !applied || !data.extracted {
				t.Fatal("original record descriptive SOURCE DATA/APPLIED UNREACHED")
			}
			if len(data.exposures)+len(data.residuals)+len(data.invoked)+len(data.relative)+len(data.effects) != 0 {
				t.Fatal("SOURCE description exported mutation/normal outputs")
			}
			wrong := cloneOriginalGetMutationSource(s)
			wrong.generation = &projectGeneration{}
			if _, accepted := work.originalGetMutationData(wrong); accepted {
				t.Fatal("foreign generation record SOURCE accepted")
			}
			wrong = cloneOriginalGetMutationSource(s)
			wrong.request.cut.use = nil
			if _, accepted := work.originalGetMutationData(wrong); accepted {
				t.Fatal("copied physical Get cut accepted")
			}
			observed = s
			observedRecipe = recipe
		}
		if observed == nil {
			t.Fatal("real original record SOURCE admission UNREACHED")
		}
		fresh := beginProjectCallableCollection(cache, cache.owner)
		if _, accepted := fresh.work.originalGetMutationData(observed); accepted {
			fresh.close()
			t.Fatal("fresh work inherited Source DATA authority")
		}
		fresh.close()

		// Repeating a sealed original SOURCE must not recertify or republish it.
		// This is a sealed no-op/refuser control, not an unsealed retry transition.
		{
			s := observed
			recipe := observedRecipe
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
		}
	})
}
