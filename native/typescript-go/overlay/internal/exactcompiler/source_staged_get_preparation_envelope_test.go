package exactcompiler

import (
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original collector produces these preparation descriptions before its
// first global resolver. Detached refusers never enter the graph or borrow a
// Get/current/APPLIED receipt. Full consumer completion remains the F1 gate.
func TestStagedGetPreparationEnvelopeOriginalSource(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")

	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	withActiveModuleSourceWork(t, request, sources, imports, func(_ []callableFacts, work *callableEffectWork, _ *executableBodyOwner) {
		preparations, typed, refusers := 0, 0, 0
		families := [4]int{}
		check := func(recipe sourceStagedOperationRecipe, valid bool) {
			t.Helper()
			if got, old := validStagedGetPreparationRecipe(recipe), legacyGetPreparationEnvelopeRecipe(recipe); got != old || got != valid {
				t.Fatalf("complete preparation description contract changed: new=%t old=%t expected=%t", got, old, valid)
			}
		}
		for _, recipe := range work.operationRecipes {
			s := recipe.memberSource
			if s == nil || s.getPreparation == nil {
				continue
			}
			check(recipe, true)
			preparations++
			m := s.getPreparation
			sizes := [4]int{len(m.data), len(m.targets), len(m.readings), len(m.native)}
			for k, n := range sizes {
				families[k] += n
				typed += n
			}
			wrong := recipe
			wrong.memberSource = cloneStagedMemberSource(s)
			wrong.memberSource.generation = nil
			check(wrong, false)
			refusers++
			// The unchanged generation pointer describes the source; it is not a
			// current/Get receipt. A cloned description must preserve its shape.
			cloned := recipe
			cloned.memberSource = cloneStagedMemberSource(s)
			check(cloned, true)
			for family, n := range sizes {
				if n == 0 {
					continue
				}
				wrong = recipe
				wrong.memberSource = cloneStagedMemberSource(s)
				meta := wrong.memberSource.getPreparation
				var r sourceStagedOperationRequest
				switch family {
				case 0:
					r = meta.data[0].reading
					meta.data = append(meta.data, meta.data[0])
				case 1:
					r = meta.targets[0].reading
					meta.targets = append(meta.targets, meta.targets[0])
				case 2:
					r = meta.readings[0].reading
					meta.readings = append(meta.readings, meta.readings[0])
				case 3:
					r = meta.native[0].request()
					meta.native = append(meta.native, meta.native[0])
				}
				check(wrong, false)
				refusers++
				wrong = recipe
				wrong.delta = cloneOperationDelta(recipe.delta)
				wrong.delta.required = nil
				for _, required := range recipe.delta.required {
					if !sameOperationRequest(required, r) {
						wrong.delta.required = append(wrong.delta.required, required)
					}
				}
				check(wrong, false)
				refusers++
				wrong = recipe
				wrong.memberSource = cloneStagedMemberSource(s)
				meta = wrong.memberSource.getPreparation
				switch family {
				case 0:
					meta.data = nil
				case 1:
					meta.targets = nil
				case 2:
					meta.readings = nil
				case 3:
					meta.native = nil
				}
				// A different genuine family or ordinary root may legitimately support
				// this same request. Compare the exact old contract, not a new no-alias rule.
				check(wrong, legacyGetPreparationEnvelopeRecipe(wrong))
				refusers++
				wrong = recipe
				wrong.memberSource = cloneStagedMemberSource(s)
				meta = wrong.memberSource.getPreparation
				switch family {
				case 0:
					meta.data[0].reading.cut = sourceRelativeCut{}
				case 1:
					meta.targets[0].reading.cut = sourceRelativeCut{}
				case 2:
					meta.readings[0].reading.cut = sourceRelativeCut{}
				case 3:
					meta.native[0].parent.cut = sourceRelativeCut{}
				}
				check(wrong, false)
				refusers++
			}
		}
		if preparations == 0 || typed == 0 {
			t.Fatal("genuine typed preparation envelope entry UNREACHED")
		}
		t.Logf("original preparations=%d typed(data,target,reading,native)=%v refusers=%d; description only, current/APPLIED independent", preparations, families, refusers)
	}, activeModuleBeforeResolution)
}

// This exact former validator protects full description equivalence while the
// implementation changes its traversal complexity. It is never used by a
// production query, registrar, task or currentness consumer.
func legacyGetPreparationEnvelopeRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.memberSource
	if s == nil || s.getPreparation == nil || s.generation == nil || !validStagedMemberParent(s.parent) || !ast.IsPropertyAccessExpression(s.parent.producer.operation) || !sameOperationRequest(s.request, stagedGetPreparationRequest(s.parent)) || recipe.key != s.request.producer || s.candidate.operation != nil || s.candidate.origin != nil || s.candidate.region != nil || s.candidate.protocol || s.candidate.invoking || s.candidate.reflective || s.candidate.getContribution || s.candidate.runtimeUnknown || s.candidate.prior || s.candidate.cut != (sourceRelativeCut{}) || !sameOperationEndpoint(s.candidate.target, sourceRelativeEndpoint{}) || !sameOperationEndpoint(s.candidate.key, sourceRelativeEndpoint{}) || !sameOperationEndpoint(s.candidate.value, sourceRelativeEndpoint{}) || !sameOperationRequest(s.candidate.request, sourceStagedOperationRequest{}) {
		return false
	}
	if s.nativeWriter != nil || s.globalWrite != nil || s.hasFreshTarget != nil || s.targetSource != nil || s.writeEffects || s.protocolSource != nil || s.coverage != nil || s.call != nil || s.getEffects != nil || s.extraction != nil || s.moduleExcluded != nil || len(s.values)+len(s.moduleImports) != 0 {
		return false
	}
	if recipe.nativeGet != nil || recipe.callResult != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || recipe.assignment != nil || recipe.constructionEffects != nil || recipe.entryLaw != nil || recipe.hasInstance != nil || recipe.moduleArgument != nil || recipe.declarationCallGeneration != nil || recipe.declarationCall != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 {
		return false
	}
	for _, required := range recipe.delta.required {
		if !stagedGetPreparationChild(s, required) {
			return false
		}
	}
	for i, data := range s.getPreparation.data {
		if !validGetPreparationData(s.parent, data) || !operationContainsRequest(recipe.delta.required, data.reading) {
			return false
		}
		for _, old := range s.getPreparation.data[:i] {
			if sameOperationRequest(old.reading, data.reading) {
				return false
			}
		}
	}
	for i, entry := range s.getPreparation.targets {
		if !validGetPreparationTarget(s.parent, entry) || !operationContainsRequest(recipe.delta.required, entry.reading) {
			return false
		}
		for _, prior := range s.getPreparation.targets[:i] {
			if sameOperationRequest(prior.reading, entry.reading) {
				return false
			}
		}
	}
	for i, entry := range s.getPreparation.readings {
		if !validGetPreparationReading(s.parent, entry) || !operationContainsRequest(recipe.delta.required, entry.reading) {
			return false
		}
		for _, prior := range s.getPreparation.readings[:i] {
			if sameOperationRequest(prior.reading, entry.reading) {
				return false
			}
		}
	}
	for i, native := range s.getPreparation.native {
		if !validGetPreparationNative(s.parent, native) || !operationContainsRequest(recipe.delta.required, native.request()) {
			return false
		}
		for _, prior := range s.getPreparation.native[:i] {
			if sameOperationRequest(prior.request(), native.request()) {
				return false
			}
		}
	}
	expected := sourceStagedOperationDelta{required: recipe.delta.required, extracted: recipe.delta.extracted}
	return operationDeltaPrefix(expected, recipe.delta) && operationDeltaPrefix(recipe.delta, expected)
}
