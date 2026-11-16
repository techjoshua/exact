package exactcompiler

import "testing"

// The unchanged public fixture is the prerequisite. This control inspects only
// recipes actually produced by that journey; it installs no Get or graph facts.
// Subscriber/current/revocation controls still need the owning live observation.
func TestStagedGetPreparationDataOriginalSource(t *testing.T) {
	f := newStagedOriginalCacheFixture(t)
	request := f.request("compile", "component-abi/opaque-operation.ts")
	request.Target, request.stagedReplacement = TargetClient, true
	response := f.session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, fact := range stagedDeclarationFacts(f.session) {
		for _, recipe := range fact.staged.operationRecipes {
			s := recipe.callResult
			if s == nil || s.freezeReturn == nil || len(s.preparationData) == 0 {
				continue
			}
			found = true
			if !validStagedCallResultRecipe(recipe) || !validFreezeReturnSource(s.freezeReturn, s) {
				t.Fatal("original Freeze SOURCE recipe invalid")
			}
			for _, data := range s.preparationData {
				if !validGetPreparationData(data.parent, data) || !prepDataSourceReading(s, data.reading, data.physical) {
					t.Fatal("original DATA reading missing")
				}
				clone := cloneGetPreparationData(data)
				if !sameGetPreparationData(clone, data) {
					t.Fatal("DATA clone changed acquisition")
				}
				if len(clone.receiver.projection) > 0 {
					clone.receiver.projection[0] += "-foreign"
					if sameGetPreparationData(clone, data) {
						t.Fatal("DATA clone shared receiver projection")
					}
				}
				bad := data
				bad.acquisition = getPreparationSameGet
				if data.acquisition == getPreparationNestedReceiver && validGetPreparationData(data.parent, bad) {
					t.Fatal("nested DATA borrowed same-Get authority")
				}
				bad = data
				bad.semantic.initializing = data.parent.producer.operation
				if bad.semantic != data.semantic && validGetPreparationData(data.parent, bad) {
					t.Fatal("foreign semantic cut accepted")
				}
				bad = data
				bad.receiver.projection = append(append([]string(nil), data.receiver.projection...), "foreign")
				if validGetPreparationData(data.parent, bad) {
					t.Fatal("foreign receiver projection accepted")
				}
				bad.purpose = resultReflectiveTarget
				if validGetPreparationData(data.parent, bad) {
					t.Fatal("target purpose borrowed accessor SOURCE")
				}
				bad = data
				bad.reading.edge += ":foreign"
				if validGetPreparationData(data.parent, bad) {
					t.Fatal("foreign reader edge accepted")
				}
				bad = data
				bad.physical.initializing = nil
				if data.physical.initializing != nil && validGetPreparationData(data.parent, bad) {
					t.Fatal("foreign physical cut accepted")
				}
				bad = data
				bad.reading.cut = data.physical
				if bad.reading.cut != data.reading.cut && validGetPreparationData(data.parent, bad) {
					t.Fatal("physical cut replaced DATA producing cut")
				}
			}
			copy := cloneStagedCallResultSource(s)
			if copy.freezeReturn == s.freezeReturn || !sameFreezeReturnSource(copy.freezeReturn, s.freezeReturn) {
				t.Fatal("detached Freeze SOURCE clone changed ownership")
			}
			copy.freezeReturn.generation = nil
			if validFreezeReturnSource(copy.freezeReturn, copy) {
				t.Fatal("foreign generation accepted")
			}
			copy = cloneStagedCallResultSource(s)
			copy.freezeReturn.roles[0].role.slot = 0
			if s.freezeReturn.roles[0].role.slot == 0 {
				copy.freezeReturn.roles[0].role.slot = 1
			}
			if validFreezeReturnSource(copy.freezeReturn, copy) {
				t.Fatal("foreign formal role accepted")
			}
		}
	}
	if !found {
		t.Fatal("original public producer did not deliver typed preparation DATA SOURCE")
	}
}
