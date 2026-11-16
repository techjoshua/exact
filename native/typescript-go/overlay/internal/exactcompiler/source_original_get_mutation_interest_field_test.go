package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// A description alone is not the positive. The original field mapper must
// retain this actual target interest child and receive its SOURCE DATA through
// the ordinary subscriber. Whole getter/Call closure remains independent.
func TestOriginalGetMutationInterestFieldConsumer(t *testing.T) {
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
			s := recipe.mutationData
			if s == nil || s.getInterest == nil || s.getInterest.nativeRoot.producer.operation == nil {
				continue
			}
			field := work.operationRecipes[s.field.producer]
			if !operationContainsRequest(field.delta.required, s.request) {
				t.Fatal("actual field did not require mutation DATA child")
			}
			interestRequest := originalGetMutationInterestRequest(s.getInterest)
			if !operationContainsRequest(recipe.delta.required, interestRequest) {
				t.Fatal("actual mutation child lost original issued interest")
			}
			id, adopted := work.operationIDs[recipe.key]
			if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("required mutation DATA was not adopted")
			}
			state := &work.operations[id.index]
			subscriber := state.subscribers[sourceStagedOperationConsumer{s.request.consumer, s.request.edge}]
			if !work.fieldMutationDataCurrent(recipe) || !state.delta.extracted || state.revision == 0 || subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, s.request) || subscriber.applied != state.revision {
				t.Fatal("genuine demanded target mutation DATA/current/APPLIED UNREACHED")
			}
			actual, bound := work.resolveOriginalGetMutationInterest(s.getInterest)
			if !bound || actual == nil || actual.nativeTarget == nil || s.getInterest.source != nil {
				t.Fatal("actual SOURCE binding absent or immutable interest header rewritten")
			}
			if _, applied := work.originalGetMutationInterestData(s.getInterest); !applied {
				t.Fatal("issued interest SOURCE delivery UNREACHED")
			}
			var originalFingerprint, clonedFingerprint strings.Builder
			originalGetMutationInterestFingerprint(s.getInterest, &originalFingerprint)
			originalGetMutationInterestFingerprint(cloneOriginalGetMutationInterest(s.getInterest), &clonedFingerprint)
			if originalFingerprint.String() != clonedFingerprint.String() {
				t.Fatal("cloning interest header changed semantic fingerprint")
			}
			originalFingerprint.Reset()
			clonedFingerprint.Reset()
			originalGetMutationSourceFingerprint(actual, &originalFingerprint)
			originalGetMutationSourceFingerprint(cloneOriginalGetMutationSource(actual), &clonedFingerprint)
			if originalFingerprint.String() != clonedFingerprint.String() {
				t.Fatal("cloning actual SOURCE description changed semantic fingerprint")
			}
			reached = true
			wrong := cloneOriginalGetMutationInterest(s.getInterest)
			wrong.generation = &projectGeneration{}
			if _, accepted := work.resolveOriginalGetMutationInterest(wrong); accepted {
				t.Fatal("foreign generation interest accepted")
			}
			fresh := beginProjectCallableCollection(cache, cache.owner)
			if _, accepted := fresh.work.resolveOriginalGetMutationInterest(s.getInterest); accepted {
				fresh.close()
				t.Fatal("fresh work inherited Get interest binding")
			}
			fresh.close()
		}
		if !reached {
			t.Fatal("real field-to-target-interest mutation DATA consumer UNREACHED")
		}
	})
}
