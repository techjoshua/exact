package exactcompiler

import "testing"

// The original direct-getter row must complete through the real field family.
// Provider descriptions alone do not qualify this test: every linked sibling
// must reach its actual installed reader, current DATA and outer closure.
func TestOriginalGetMutationProtocolFieldConsumer(t *testing.T) {
	const source = "export{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	descriptorContractCollection(t, source, func(collection *projectCallableCollection, result callableAnalysis) {
		descriptorContractBrowser(t, result, true)
		assertOriginalDescriptorGetUseCurrent(t, collection, descriptorStrictComparisonEffects)
		work := &collection.work
		reached := false
		for _, recipe := range work.operationRecipes {
			if recipe.mutationData == nil || len(recipe.fieldMutationLinks) == 0 {
				continue
			}
			source := recipe.mutationData
			parent, originalField := fieldSourceParent(source.field)
			if !originalField || parent.producer.selector.field != "get" {
				continue
			}
			var original *sourceOriginalGetMutationSource
			if source.getInterest != nil {
				original, _ = work.resolveOriginalGetMutationInterest(source.getInterest)
			} else {
				original = source.getSource
			}
			if original == nil || original.record == nil {
				continue
			}
			id, adopted := work.operationIDs[recipe.key]
			if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("real linked field DATA adoption UNREACHED")
			}
			state := &work.operations[id.index]
			if !work.fieldMutationDataCurrent(recipe) || !state.delta.extracted || state.invalid {
				t.Fatal("real linked field DATA current/extraction UNREACHED")
			}
			if len(recipe.fieldMutationLinks) != 5 {
				t.Fatalf("original five protocol field providers UNREACHED: %d", len(recipe.fieldMutationLinks))
			}
			counts := map[sourceOriginalGetMutationProviderKind]int{}
			for _, link := range recipe.fieldMutationLinks {
				if !work.validOriginalGetMutationFieldLink(recipe, link) {
					t.Fatal("linked original field membership invalid")
				}
				counts[link.kind]++
				childID, adopted := work.operationIDs[link.child.producer]
				if !adopted || childID.epoch != work.operationEpoch || childID.index == 0 || int(childID.index) >= len(work.operations) {
					t.Fatal("linked original child adoption UNREACHED")
				}
				child := &work.operations[childID.index]
				if child.invalid || !child.delta.extracted || !work.fieldMutationDataCurrent(work.operationRecipes[link.child.producer]) {
					t.Fatal("linked sibling current DATA UNREACHED")
				}
				installed := false
				for _, subscriber := range child.subscribers {
					if subscriber == nil || subscriber.request.inputs == nil || subscriber.blocked || subscriber.applied != child.revision || !work.validFieldMutationDataReading(work.operationRecipes[link.child.producer], subscriber.request) {
						continue
					}
					installed = true
				}
				if !installed {
					t.Fatal("linked sibling genuine installed input/APPLIED UNREACHED")
				}
				wrong := link
				wrong.generation = &projectGeneration{}
				if work.validOriginalGetMutationFieldLink(recipe, wrong) {
					t.Fatal("foreign generation link accepted")
				}
				wrong = link
				wrong.child = source.request
				if work.validOriginalGetMutationFieldLink(recipe, wrong) {
					t.Fatal("self link accepted")
				}
				wrong = link
				wrong.origin.cut.use = nil
				if work.validOriginalGetMutationFieldLink(recipe, wrong) {
					t.Fatal("copied origin cut accepted")
				}
				wrong = link
				wrong.field = source.request
				if work.validOriginalGetMutationFieldLink(recipe, wrong) {
					t.Fatal("foreign field link accepted")
				}
			}
			if counts[originalGetMutationProviderGet] != 3 || counts[originalGetMutationProviderExternal] != 1 || counts[originalGetMutationProviderNative] != 1 {
				t.Fatalf("original typed provider families UNREACHED: %#v", counts)
			}
			wrongReading := source.request
			wrongReading.edge += ":unissued-generic-consumer"
			if work.validFieldMutationDataReading(recipe, wrongReading) {
				t.Fatal("unissued generic link reader accepted")
			}
			clone := cloneOriginalGetMutationFieldLinks(recipe.fieldMutationLinks)
			if !operationPrefix(recipe.fieldMutationLinks, clone, sameOriginalGetMutationFieldLink) || !operationPrefix(clone, recipe.fieldMutationLinks, sameOriginalGetMutationFieldLink) {
				t.Fatal("link clone changed identity")
			}
			fresh := beginProjectCallableCollection(collection.cache, collection.owner)
			if fresh.work.originalGetMutationFieldLinksCurrent(recipe) {
				fresh.close()
				t.Fatal("fresh work inherited installed link authority")
			}
			fresh.close()
			reached = true
		}
		if !reached {
			t.Fatal("original record Get genuine field-family protocol consumer UNREACHED")
		}
	})
}
