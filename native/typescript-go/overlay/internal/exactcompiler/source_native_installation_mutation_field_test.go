package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Exercise the real field producer and installed DATA consumer independently
// of unrelated project settlement. Whole-collector tests keep their existing
// pending0 gates; this control requires actual output/current/APPLIED delivery.
func TestNativeInstallationMutationFieldDelivery(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		var evidence sourceStagedOperationRecipe
		reached := false
		for _, recipe := range work.operationRecipes {
			s := recipe.mutationData
			if s == nil || s.installation == nil {
				continue
			}
			parent, field := fieldSourceParent(s.field)
			if !field || parent.producer.selector.field != "get" {
				continue
			}
			id := work.operationIDs[recipe.key]
			if !operationContainsRequest(work.operationRecipes[s.field.producer].delta.required, s.request) || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("actual installation field required/adopted DATA UNREACHED")
			}
			state := &work.operations[id.index]
			if state.invalid || !state.delta.extracted || state.revision == 0 {
				t.Fatalf("actual installation output extraction UNREACHED: invalid=%v X=%v rev=%d required=%d", state.invalid, state.delta.extracted, state.revision, len(recipe.delta.required))
			}
			if !work.fieldMutationDataCurrent(recipe) {
				t.Fatal("actual installation output current UNREACHED")
			}
			stored, installed := false, false
			for _, subscriber := range state.subscribers {
				if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || !work.validFieldMutationDataReading(recipe, subscriber.request) {
					continue
				}
				stored = stored || sameOperationRequest(subscriber.request, s.request)
				installed = installed || subscriber.request.inputs != nil
			}
			if !stored || !installed {
				t.Fatal("actual default and installed output APPLIED UNREACHED")
			}
			counts := map[sourceNativeInstallationMutationComponentKind]int{}
			refuse := func(label string, wrong sourceOriginalGetMutationFieldLink) {
				t.Helper()
				if work.validOriginalGetMutationFieldLink(recipe, wrong) {
					t.Fatal(label + " accepted")
				}
			}
			for _, link := range recipe.fieldMutationLinks {
				if !work.validOriginalGetMutationFieldLink(recipe, link) || link.nativeComponent == 0 {
					t.Fatal("actual typed component link invalid")
				}
				counts[link.nativeComponent]++
				childID := work.operationIDs[link.child.producer]
				if childID.epoch != work.operationEpoch || childID.index == 0 || int(childID.index) >= len(work.operations) {
					t.Fatal("actual same-field child UNREACHED")
				}
				child := &work.operations[childID.index]
				childRecipe := work.operationRecipes[child.key]
				if child.invalid || !child.delta.extracted || !work.fieldMutationDataCurrent(childRecipe) {
					t.Fatal("linked child current output DATA UNREACHED")
				}
				applied := false
				for _, subscriber := range child.subscribers {
					applied = applied || subscriber != nil && subscriber.request.inputs != nil && !subscriber.blocked && subscriber.applied == child.revision && work.validFieldMutationDataReading(childRecipe, subscriber.request)
				}
				if !applied {
					t.Fatal("linked child installed APPLIED UNREACHED")
				}
				wrong := link
				wrong.nativeComponent = 0
				refuse("untyped component", wrong)
				wrong = link
				wrong.generation = &projectGeneration{}
				refuse("foreign generation", wrong)
				wrong = link
				wrong.child = s.request
				refuse("self link", wrong)
				wrong = link
				wrong.field = s.request
				refuse("foreign demanded field", wrong)
				wrong = link
				wrong.origin.cut.returning = s.installation.request.producer.operation
				refuse("foreign reader cut", wrong)
				if link.nativeField != nil {
					wrong = link
					wrong.nativeField = cloneOriginalGetNativeField(link.nativeField)
					wrong.nativeField.ordinal = (wrong.nativeField.ordinal + 1) % len(reflectiveDescriptorKeys)
					refuse("foreign phase ordinal", wrong)
				}
			}
			if counts[nativeInstallationMutationCallee] == 0 || counts[nativeInstallationMutationTarget] == 0 || counts[nativeInstallationMutationFieldPhase] == 0 {
				t.Fatal("actual callee/target/field-phase links UNREACHED")
			}
			algorithm := work.operationIDs[s.installation.algorithm.producer]
			if algorithm.epoch != work.operationEpoch || algorithm.index == 0 || int(algorithm.index) >= len(work.operations) {
				t.Fatal("actual algorithm UNREACHED")
			}
			e := work.operations[algorithm.index].installationMutations
			if e == nil || !e.sealed || len(e.components) != 2*len(reflectiveDescriptorKeys) {
				t.Fatal("original ordered component population UNREACHED")
			}
			for _, component := range e.components {
				if component.phase == stagedFieldObservationGet && component.source == nil && nativeInstallationMutationHasAbsent(e, component.ordinal) && operationContainsRequest(recipe.delta.required, originalGetMutationInterestRequest(component.interest)) {
					t.Fatal("bypassed Get interest demanded")
				}
			}
			if !nativeInstallationTestBodyTransfer(work, s.field, e) {
				t.Fatal("actual requested-field canonical BODY mutation transfer UNREACHED")
			}
			cloned := cloneOriginalGetMutationFieldLinks(recipe.fieldMutationLinks)
			if !operationPrefix(recipe.fieldMutationLinks, cloned, sameOriginalGetMutationFieldLink) || !operationPrefix(cloned, recipe.fieldMutationLinks, sameOriginalGetMutationFieldLink) {
				t.Fatal("component clone changed identity")
			}
			evidence, reached = recipe, true
		}
		if !reached {
			t.Fatal("original installation field output consumer UNREACHED")
		}
		fresh := beginProjectCallableCollection(cache, cache.owner)
		if fresh.work.fieldMutationDataCurrent(evidence) {
			fresh.close()
			t.Fatal("fresh work inherited component authority")
		}
		fresh.close()
	})
}

// Observe actual canonical delivery, not descriptive links or a helper replay.
func nativeInstallationTestBodyTransfer(work *callableEffectWork, field sourceStagedOperationRequest, e *sourceNativeInstallationMutationEnumeration) bool {
	for _, component := range e.components {
		if component.phase != stagedFieldObservationGet {
			continue
		}
		reader := work.operationIDs[component.effects.producer]
		if reader.epoch != work.operationEpoch || reader.index == 0 || int(reader.index) >= len(work.operations) {
			continue
		}
		for _, getter := range work.operations[reader.index].getters {
			if getter.installed == nil || getter.inputs == nil || !getter.inputs.delivered || !getter.bodyReady || !getter.bodyTransferred {
				continue
			}
			consumer, caller := work.memberNodes[getter.demand.request.consumer]
			producer, body := work.memberNodes[getter.declaration]
			if !caller || !body || consumer < 0 || consumer >= len(work.operationFacts) || producer < 0 || producer >= len(work.stagedRevisions) {
				continue
			}
			dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, getter.edge}]
			if dependency == nil || dependency.invalid || dependency.projectionPending || dependency.consumed != work.stagedRevisions[producer] {
				continue
			}
			for _, transfer := range work.operationFacts[consumer].staged.mutationTransfers[getter.edge] {
				if !sameOperationRequest(transfer.field, field) || !transfer.represented || transfer.pending != nil {
					continue
				}
				for _, effect := range transfer.sources {
					m := effect.relativeMutation
					if m != nil && m.external != nil && sameOperationRequest(m.field, field) && work.relativeFieldMutationSourceCurrent(m) {
						return true
					}
				}
			}
		}
	}
	return false
}
