package exactcompiler

import "testing"

// A real original field consumer keeps the physical resumer producer and the
// semantic record Effects reader distinct. This checks description admission;
// installing-Call outputs and enclosing field/whole-Get closure remain separate.
func TestOriginalGetMutationRecordReaderOrigin(t *testing.T) {
	const source = "export{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	descriptorContractCollection(t, source, func(collection *projectCallableCollection, result callableAnalysis) {
		work := &collection.work
		reached := false
		for _, child := range work.operationRecipes {
			if child.mutationData == nil || child.mutationData.getInterest == nil {
				continue
			}
			i := child.mutationData.getInterest
			if i.nativeCallee != nil || i.nativeRoot.producer.operation != nil {
				continue
			}
			field := work.operationRecipes[child.mutationData.field.producer]
			if !operationContainsRequest(field.delta.required, child.mutationData.request) {
				t.Fatal("original field required membership UNREACHED")
			}
			origin := work.operationRecipes[i.origin.producer]
			if !validFrameworkGetResumptionRecipe(origin) {
				t.Fatal("actual framework producer UNREACHED")
			}
			reader, issued := work.originalDescriptorRecordGetEffects(origin.callResult.getResult.frameworkResume)
			if !issued || sameOperationRequest(reader, i.origin) || !work.originalGetMutationInterestReaderCorresponds(i, reader) || !work.originalGetMutationFieldReaderCorresponds(child.mutationData, reader, i.origin) {
				t.Fatal("distinct registered semantic reader/physical origin correspondence UNREACHED")
			}
			providerReached := false
			for _, recipe := range work.operationRecipes {
				if recipe.memberSource == nil || recipe.memberSource.originalGetMutation == nil {
					continue
				}
				for _, provider := range recipe.memberSource.originalGetMutation.providers {
					if provider.kind != originalGetMutationProviderGet || !sameOperationRequest(provider.reader, reader) {
						continue
					}
					candidate := work.operationRecipes[provider.candidate.producer]
					if !validStagedMemberProtocolRecipe(candidate) || !sameOperationRequest(candidate.memberSource.protocolSource.required, reader) {
						t.Fatal("real protocol reader debt changed")
					}
					providerReached = true
				}
			}
			if !providerReached {
				t.Fatal("original protocol population record-reader provider UNREACHED")
			}
			refuse := func(label string, wrong *sourceOriginalGetMutationInterest) {
				t.Helper()
				if work.originalGetMutationInterestReaderCorresponds(wrong, reader) {
					t.Fatal(label + " accepted")
				}
			}
			wrong := cloneOriginalGetMutationInterest(i)
			wrong.parent = i.origin
			refuse("foreign parent", wrong)
			wrong = cloneOriginalGetMutationInterest(i)
			wrong.physicalCut.use = nil
			refuse("foreign physical cut", wrong)
			wrong = cloneOriginalGetMutationInterest(i)
			wrong.queryCut.operation = nil
			refuse("foreign semantic cut", wrong)
			wrong = cloneOriginalGetMutationInterest(i)
			wrong.descriptor.request = i.origin
			refuse("foreign descriptor D", wrong)
			wrong = cloneOriginalGetMutationInterest(i)
			wrong.reading = i.origin
			refuse("foreign descriptor RD", wrong)
			wrong = cloneOriginalGetMutationInterest(i)
			wrong.generation = &projectGeneration{}
			refuse("foreign generation", wrong)
			wrongReader := reader
			wrongReader.cut.operation = nil
			if work.originalGetMutationFieldReaderCorresponds(child.mutationData, wrongReader, i.origin) {
				t.Fatal("foreign reader cut accepted")
			}
			reached = true
		}
		if !reached {
			t.Fatal("original field consumer record-reader relation UNREACHED")
		}
	})
}
