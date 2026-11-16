package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func withNativeFieldPopulationCollection(t *testing.T, inspect func(*callableEffectWork), packageTypes ...string) {
	t.Helper()
	// This is the unchanged field-delivery fixture, through the original collector.
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		inspect(&collection.work)
	}, packageTypes...)
}

// The original mixed required vector retains the dormant stored BODY source.
// Five contributors remain for ordinary fields and six for value, which has
// a genuine reflective contributor. The BODY request stays upstream debt.
// This same control compiles on the parent and fails its old population contract.
func TestNativeFieldCoveragePopulationProductionEntry(t *testing.T) {
	withNativeFieldPopulationCollection(t, func(work *callableEffectWork) {
		seen := map[string]map[sourceStagedFieldObservationPhase]bool{}
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource == nil {
				continue
			}
			s := recipe.memberSource.originalGetMutation
			if s == nil || s.nativeField == nil {
				continue
			}
			h := s.nativeField
			raw := h.root
			raw.producer.selector = sourceStagedOperationSelector{occurrence: h.field.producer.selector.occurrence, field: "get"}
			coverage := work.operationRecipes[s.coverage.producer]
			if !validStagedMemberCoverageRecipe(coverage) || !operationContainsRequest(coverage.delta.required, raw) {
				t.Fatal("original factory-issued BODY debt UNREACHED")
			}
			if operationContainsRequest(s.population, raw) {
				t.Fatal("stored BODY provenance was demanded as a mutation provider")
			}
			expected := 5
			if s.property == "value" {
				expected = 6
			}
			if len(s.population) != expected || len(s.providers) != expected || s.pending || !originalGetMutationDescriptionComplete(s) {
				t.Fatalf("original contributor descriptions incomplete: field=%s expected=%d population=%d providers=%d pending=%v", s.property, expected, len(s.population), len(s.providers), s.pending)
			}
			reflective := 0
			for _, provider := range s.providers {
				if provider.kind == originalGetMutationProviderReflective {
					reflective++
				}
			}
			if s.property == "value" && reflective != 1 || s.property != "value" && reflective != 0 {
				t.Fatal("original reflective contributor population changed", s.property, reflective)
			}
			if !operationContainsRequest(recipe.delta.required, raw) || !operationContainsRequest(recipe.delta.required, s.coverage) {
				t.Fatal("SOURCE lost upstream BODY or full coverage debt")
			}
			for _, r := range s.population {
				if !operationContainsRequest(coverage.delta.required, r) || !operationContainsRequest(recipe.delta.required, r) {
					t.Fatal("true contributor was erased")
				}
			}
			if !work.originalGetMutationCurrent(recipe) {
				t.Fatal("original SOURCE currentness UNREACHED")
			}
			data, applied := work.originalGetMutationData(s)
			if !applied || !data.extracted {
				t.Fatal("actual SOURCE local X/APPLIED UNREACHED")
			}
			if seen[s.property] == nil {
				seen[s.property] = map[sourceStagedFieldObservationPhase]bool{}
			}
			seen[s.property][h.phase] = true
		}
		for _, field := range reflectiveDescriptorKeys {
			if !seen[field][stagedFieldObservationHas] || !seen[field][stagedFieldObservationGet] {
				t.Fatal("all twelve original SOURCE consumers UNREACHED", field)
			}
		}
	})
}
