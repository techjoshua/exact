package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The ordinary collector must transfer its original selected description across
// adoption before the actual field mapper needs it. This is entry evidence;
// the separate delivery control still requires output X, APPLIED and BODY atoms.
func TestNativeInstallationMutationDescriptionEntry(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		var header *sourceNativeInstallationMutationSource
		var algorithm sourceStagedOperationID
		for index := range work.operations {
			e := work.operations[index].installationMutations
			if e == nil {
				continue
			}
			if !work.nativeInstallationMutationCurrent(&e.source) || len(e.components) != 2*len(reflectiveDescriptorKeys) {
				t.Fatal("actual selected description/ordered interests invalid")
			}
			header = cloneNativeInstallationMutationSource(&e.source)
			algorithm = sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}
			for _, component := range e.components {
				if component.interest == nil || !validOriginalFieldMutationInterest(component.interest) {
					t.Fatal("actual passive phase interest UNREACHED")
				}
				registered := work.operationRecipes[originalGetMutationInterestRequest(component.interest).producer]
				if !work.originalGetMutationInterestCurrent(registered) || !sameOriginalGetMutationInterest(registered.memberSource.originalGetMutationInterest, component.interest) {
					t.Fatal("registered phase interest correspondence lost")
				}
			}
			break
		}
		if header == nil {
			t.Fatal("original selected description adoption UNREACHED")
		}
		mapped := false
		for _, recipe := range work.operationRecipes {
			s := recipe.mutationData
			if s == nil || !sameNativeInstallationMutationSource(s.installation, header) {
				continue
			}
			parent, field := fieldSourceParent(s.field)
			if !field || parent.producer.selector.field != "get" {
				continue
			}
			if !operationContainsRequest(work.operationRecipes[s.field.producer].delta.required, s.request) {
				t.Fatal("original live field mapper lost required mutation child")
			}
			id := work.operationIDs[recipe.key]
			if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("real field consumer did not adopt its declared child")
			}
			mapped = true
		}
		if !mapped {
			t.Fatal("original get-field mutation description consumer UNREACHED")
		}

		// Only after the ordinary production entry above has succeeded, exercise
		// another genuine original Get and its detached returned carrier. This
		// cannot repair or manufacture the entry positive already required above.
		caller := work.memberNodes[header.request.consumer]
		request := sourceStagedNativeRequest{request: header.request, call: header.request.producer.operation, get: header.request.producer.operation.Expression(), descriptorGet: header.installation.descriptor.expression, algorithmKind: header.kind}
		occurrence, visited := work.observeSelectedNativeGetSource(collection.facts, caller, request, collection.owner)
		if !visited || occurrence == nil || occurrence.installationDescription == nil {
			t.Fatal("genuine returned description carrier UNREACHED")
		}
		before := work.operations[algorithm.index].installationMutations
		if !work.completeNativeInstallationMutationOccurrence(collection.facts, occurrence) || !work.completeNativeInstallationMutationOccurrence(collection.facts, occurrence) || work.operations[algorithm.index].installationMutations != before {
			t.Fatal("repeated same description reset actual phase observations")
		}
		copy := *occurrence
		if work.completeNativeInstallationMutationOccurrence(collection.facts, &copy) {
			t.Fatal("copied occurrence acquired issuer authority")
		}
		copy.installationDescription = nil
		if work.completeNativeInstallationMutationOccurrence(collection.facts, &copy) {
			t.Fatal("missing description inferred from selected metadata")
		}
		wrong := cloneNativeInstallationMutationSource(header)
		wrong.generation = &projectGeneration{}
		if work.nativeInstallationMutationCurrent(wrong) {
			t.Fatal("foreign description generation accepted")
		}
		wrong = cloneNativeInstallationMutationSource(header)
		wrong.request.cut.returning = header.request.producer.operation
		if work.nativeInstallationMutationCurrent(wrong) {
			t.Fatal("foreign description cut accepted")
		}
		fresh := beginProjectCallableCollection(cache, cache.owner)
		if fresh.work.completeNativeInstallationMutationOccurrence(fresh.facts, occurrence) || fresh.work.nativeInstallationMutationCurrent(cloneNativeInstallationMutationSource(header)) {
			fresh.close()
			t.Fatal("fresh work inherited original event or enum authority")
		}
		fresh.close()
	})
}
