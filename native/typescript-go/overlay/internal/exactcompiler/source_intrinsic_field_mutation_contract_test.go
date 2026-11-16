package exactcompiler

import (
	"fmt"
	"sort"
	"strings"
	"testing"
)

// The unchanged qualified collector fixture must enroll the primitive through
// its original Get and real installation output fold. No event/graph is forced.
// Aggregate extraction separately requires every typed mutation contribution.
func TestIntrinsicFieldMutationPrimitiveProductionEntry(t *testing.T) {
	withNativeFieldPopulationCollection(t, func(work *callableEffectWork) {
		intrinsicFieldMutationEvidence(t, work)
	})
}

func intrinsicFieldMutationEvidence(t *testing.T, work *callableEffectWork) []string {
	t.Helper()
	var evidence []string
	checked := make(map[sourceStagedOperationKey]bool)
	for index := 1; index < len(work.operations); index++ {
		enumeration := work.operations[index].installationMutations
		if enumeration == nil {
			continue
		}
		seen := map[string]bool{}
		for _, component := range enumeration.components {
			if component.phase == stagedFieldObservationHas {
				if component.intrinsicSource != nil {
					t.Fatal("Has acquired a primitive Get output")
				}
				continue
			}
			field := reflectiveDescriptorKeys[component.ordinal]
			expected := field == "enumerable" || field == "value" || field == "writable" || field == "set"
			s := component.intrinsicSource
			if (s != nil) != expected {
				t.Fatalf("actual conditional Get primitive entry UNREACHED/wrong sibling: %s present=%v", field, s != nil)
			}
			if !expected {
				continue
			}
			request := originalGetMutationRequest(s)
			recipe := work.operationRecipes[request.producer]
			data, applied := work.originalGetMutationData(s)
			if !validOriginalGetMutationSource(s) || !work.originalGetMutationCurrent(recipe) || !work.originalIntrinsicFieldMutationCurrent(s) || !applied || !data.extracted {
				t.Fatal("actual primitive SOURCE current/localX/exactAPPLIED UNREACHED", field)
			}
			if operationDeltaSize(data) != len(data.required) || len(data.exposures)+len(data.residuals)+len(data.invoked)+len(data.effects)+len(data.relative) != 0 {
				t.Fatal("primitive output invented a value/BODY/mutation alternative", field)
			}
			if !operationContainsRequest(data.required, s.intrinsicField.phaseSource) || !operationContainsRequest(data.required, s.coverage) || !operationContainsRequest(data.required, component.effects) || !operationContainsRequest(data.required, enumeration.source.request) || !operationContainsRequest(data.required, enumeration.source.algorithm) {
				t.Fatal("primitive lost phase/native/full-source debts", field)
			}
			retained := false
			for _, owner := range work.operationRecipes {
				if owner.mutationData == nil || owner.mutationData.installation == nil || !sameNativeInstallationMutationSource(owner.mutationData.installation, &enumeration.source) || !operationContainsRequest(owner.delta.required, request) {
					continue
				}
				id := work.operationIDs[owner.key]
				if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
					t.Fatal("real component output consumer adoption UNREACHED")
				}
				if !checked[owner.key] {
					checked[owner.key] = true
					intrinsicFieldAggregateDebtRefusers(t, work, owner)
				}
				retained = true
			}
			if !retained {
				t.Fatal("real installation output fold never retained primitive contribution", field)
			}
			seen[field] = true
			evidence = append(evidence, fmt.Sprintf("%s:%t:%t:%d", field, data.extracted, applied, len(data.required)))
		}
		for _, field := range []string{"enumerable", "value", "writable", "set"} {
			if !seen[field] {
				t.Fatal("all default Get sibling consumers UNREACHED", field)
			}
		}
	}
	if len(evidence) != 4 {
		t.Fatal("single actual selected installation primitive inventory UNREACHED", len(evidence))
	}
	return evidence
}

// A primitive is not an aggregate receipt. Use the actual declared aggregate
// and remove only its original source debt in a detached validation probe. The
// graph, source observations, inputs and subscriber receipts remain untouched.
func intrinsicFieldAggregateDebtRefusers(t *testing.T, work *callableEffectWork, owner sourceStagedOperationRecipe) {
	t.Helper()
	if !validFieldMutationDataRecipe(owner) {
		t.Fatal("actual aggregate mutation DATA description UNREACHED")
	}
	for _, required := range nativeInstallationMutationRequirements(owner.mutationData.installation) {
		if !operationContainsRequest(owner.delta.required, required) {
			t.Fatal("aggregate lost an original native or field Effects debt")
		}
	}
	id := work.operationIDs[owner.key]
	wrong := owner
	wrong.delta = cloneOperationDelta(owner.delta)
	wrong.delta.required = nil
	for _, required := range owner.delta.required {
		if !sameOperationRequest(required, owner.mutationData.installation.request) {
			wrong.delta.required = append(wrong.delta.required, required)
		}
	}
	if validFieldMutationDataRecipe(wrong) || work.fieldMutationDataCurrent(wrong) {
		t.Fatal("local primitive paid a missing actual aggregate source debt")
	}
	for _, subscriber := range work.operations[id.index].subscribers {
		if subscriber != nil && work.validFieldMutationDataReading(wrong, subscriber.request) {
			t.Fatal("missing aggregate source debt retained a DATA delivery reading")
		}
	}
}

// These checks use detached descriptions from real original events. No graph
// state or current/APPLIED observation is created to make a negative pass.
func TestIntrinsicFieldMutationPrimitiveLifetime(t *testing.T) {
	withNativeFieldPopulationCollection(t, func(work *callableEffectWork) {
		intrinsicFieldMutationEvidence(t, work)
		reached := false
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource == nil {
				continue
			}
			s := recipe.memberSource.originalGetMutation
			if s == nil || s.intrinsicField == nil {
				continue
			}
			cloned := cloneOriginalGetMutationSource(s)
			var before, after strings.Builder
			originalGetMutationSourceFingerprint(s, &before)
			originalGetMutationSourceFingerprint(cloned, &after)
			if !sameOriginalGetMutationSource(s, cloned) || before.String() != after.String() {
				t.Fatal("clone changed primitive description/fingerprint")
			}
			refuse := func(label string, wrong *sourceOriginalGetMutationSource) {
				t.Helper()
				if validOriginalGetMutationSource(wrong) {
					t.Fatal(label, "accepted")
				}
			}
			wrong := cloneOriginalGetMutationSource(s)
			wrong.generation = &projectGeneration{}
			refuse("foreign generation", wrong)
			wrong = cloneOriginalGetMutationSource(s)
			wrong.intrinsicField.header.phase = stagedFieldObservationHas
			refuse("Has phase", wrong)
			wrong = cloneOriginalGetMutationSource(s)
			wrong.intrinsicField.header.queryCut.use = s.origin
			refuse("semantic cut", wrong)
			wrong = cloneOriginalGetMutationSource(s)
			wrong.intrinsicField.header.physicalCut.operation = s.origin
			refuse("physical Get cut", wrong)
			wrong = cloneOriginalGetMutationSource(s)
			wrong.intrinsicField.header.field.producer.selector.occurrence = s.operation
			refuse("descriptor entry", wrong)
			wrong = cloneOriginalGetMutationSource(s)
			wrong.intrinsicField.standard.ordinaryLink = false
			refuse("unsupported/prototype premise", wrong)
			wrong = cloneOriginalGetMutationSource(s)
			wrong.intrinsicField.installation.request.edge += "foreign"
			refuse("selected native root", wrong)
			if s.intrinsicField.standard.ordinaryLink == false {
				t.Fatal("detached clone mutated live primitive source")
			}
			fresh := callableEffectWork{}
			if fresh.originalGetMutationCurrent(recipe) || fresh.originalIntrinsicFieldMutationCurrent(s) {
				t.Fatal("fresh work inherited original primitive authority")
			}
			if _, applied := fresh.originalGetMutationData(s); applied {
				t.Fatal("fresh work inherited primitive APPLIED")
			}
			// The aggregate phase interest and AST-only lookup cannot borrow this arm.
			if source, found := work.originalGetMutationSourceFor(work.operationFacts, s.operation, s.request.consumer); found && source.intrinsicField != nil {
				t.Fatal("phase-only arm escaped into AST-only lookup")
			}
			reached = true
		}
		if !reached {
			t.Fatal("real primitive lifetime control entry UNREACHED")
		}
	})
}

// This qualifies portable local SOURCE semantics of the same plain-function
// fixture only. It does not claim emitted component implementation parity.
func TestIntrinsicFieldMutationPortableSourceContract(t *testing.T) {
	var application []string
	for _, mode := range []string{"application", "library"} {
		withNativeFieldPopulationCollection(t, func(work *callableEffectWork) {
			shape := intrinsicFieldMutationEvidence(t, work)
			sort.Strings(shape)
			if application == nil {
				application = shape
				return
			}
			if strings.Join(application, "\n") != strings.Join(shape, "\n") {
				t.Fatal("application context changed portable primitive SOURCE/output/debt contract")
			}
		}, mode)
	}
}
