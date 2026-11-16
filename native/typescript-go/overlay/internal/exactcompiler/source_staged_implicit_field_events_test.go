package exactcompiler

import "testing"

// This control asks whether the existing original descriptor owners supplied
// every required pointwise event. It does not consume those observations as an
// empty implicit-write set, currentness, aggregate accounting or candidate X.
func TestOriginalDescriptorFieldPointwiseEvents(t *testing.T) {
	const source = `export function invoke(){const value=Object.defineProperties({}, {x:{value:1}});return Object.freeze(value)}`
	const id = "/virtual/descriptor-field-events.ts"
	request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic", stagedReplacement: true}
	withActiveModuleSourceWork(t, request, map[string]string{id: source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		entries := 0
		for _, recipe := range work.operationRecipes {
			entry := recipe.mapEntry
			if entry == nil || entry.read == nil || entry.read.getter != nil || runtimeModuleEvaluation(entry.request.consumer) {
				continue
			}
			entries++
			for _, field := range reflectiveDescriptorKeys {
				required := stagedMapEntryFieldRequest(entry, field)
				fieldID := work.operationIDs[required.producer]
				if fieldID.epoch != work.operationEpoch || fieldID.index == 0 || int(fieldID.index) >= len(work.operations) {
					t.Fatalf("UNREACHED original %s field adoption", field)
				}
				state := &work.operations[fieldID.index]
				actual := work.operationRecipes[state.key]
				if !validNativeGetRecipe(actual) || actual.nativeGet == nil || actual.nativeGet.descriptorEntry == nil || !sameOperationRequest(actual.nativeGet.descriptorEntry.request, entry.request) || state.invalid || !state.dependenciesRegistered || state.effectsDemand == nil || !sameOperationRequest(state.effectsDemand.request, required) {
					t.Fatalf("original %s field factory/owner mismatch", field)
				}
				if state.fieldDisposition == nil || state.implicitField == nil {
					t.Fatalf("UNREACHED original %s field disposition/primitive: disposition=%t events=%t", field, state.fieldDisposition != nil, state.implicitField != nil)
				}
				terminal := state.fieldDisposition.terminal
				if !terminal.observed || terminal.generation != work.operationGeneration || terminal.epoch != work.operationEpoch || !sameOperationRequest(terminal.request, required) || !terminal.hasTraversal.observed || !terminal.hasSeen || terminal.getBypassed != (state.fieldDisposition.get == sourceEffectsBypassed) || terminal.getBypassed == terminal.getTraversal.observed {
					t.Fatalf("original %s terminal did not retain actual Has/Get/bypass", field)
				}
				t.Logf("field=%s presence=%d kind=%d has=%d get=%d bypass=%t sourceHas=%t sourceGet=%t invoked=%d hasTraversal=%+v getTraversal=%+v", field, terminal.presence, state.fieldDisposition.kind, state.fieldDisposition.has, state.fieldDisposition.get, terminal.getBypassed, terminal.sourceHas, terminal.sourceGet, len(state.fieldDisposition.invoked), terminal.hasTraversal, terminal.getTraversal)
				for _, phase := range []sourceStagedFieldObservationPhase{stagedFieldObservationHas, stagedFieldObservationGet} {
					p := state.implicitField.has
					if phase == stagedFieldObservationGet {
						if state.fieldDisposition.get == sourceEffectsBypassed {
							if state.fieldDisposition.kind != stagedFieldDispositionAbsent || state.fieldDisposition.has != sourceEffectsAccounted || state.implicitField.get != nil {
								t.Fatalf("%s bypass not owned by actual absent Has", field)
							}
							continue
						}
						p = state.implicitField.get
					}
					if p == nil {
						t.Fatalf("UNREACHED original %s phase=%d primitive/C", field, phase)
					}
					parent, valid := stagedFieldMemberRequest(required, phase)
					expected := stagedMemberCoverageRequest(parent, state.effectsDemand.receiver.expression, p.cut)
					c := work.operationRecipes[expected.producer]
					if !valid || p.self != p || p.epoch != work.operationEpoch || p.generation != work.operationGeneration || !sameOperationRequest(p.request, required) || !sameOperationRequest(p.coverage, expected) || !validStagedMemberCoverageRecipe(c) || !sameOperationRequest(c.memberSource.parent, parent) || c.memberSource.coverage.cut != p.cut || c.memberSource.coverage.origin != p.receiver || work.memberCoverageObserved[c.key] != work.operationGeneration || !operationPrefix(c.delta.required, p.required, sameOperationRequest) || !operationPrefix(p.required, c.delta.required, sameOperationRequest) {
						t.Fatalf("original %s phase=%d exact primitive/C association incomplete", field, phase)
					}
					if phase == stagedFieldObservationHas && p.law != stagedFieldOrdinaryHasNoUserEntry || phase == stagedFieldObservationGet && p.law != stagedFieldOwnDataNoUserEntry && p.law != stagedFieldIntrinsicGetNoUserEntry {
						t.Fatalf("original %s phase=%d primitive unobserved law=%d", field, phase, p.law)
					}
					roles, valid := fieldSourceRequests(required)
					if !valid {
						t.Fatal("original field source roles absent")
					}
					for _, role := range []sourceStagedOperationRequest{roles.ownWriters, roles.prototype} {
						child := work.operationRecipes[role.producer]
						if !operationContainsRequest(child.delta.required, expected) {
							t.Fatalf("original %s phase=%d lost C required membership", field, phase)
						}
					}
				}
			}
		}
		enumerations := 0
		for i := 1; i < len(work.operations); i++ {
			state := &work.operations[i]
			if state.implicitMap == nil || state.implicitMap.enumeration == nil {
				continue
			}
			p := state.implicitMap
			terminal := p.enumeration
			enumerations++
			if terminal.generation != work.operationGeneration || terminal.epoch != work.operationEpoch || !sameOperationRequest(terminal.request, p.request) || terminal.cut != p.cut || !terminal.observed || terminal.refused || !terminal.traversal.observed || !terminal.prefixRepresented || len(terminal.entries) != 1 || len(terminal.unrepresented) != 0 {
				t.Fatal("original post-loop enumeration membership incomplete")
			}
			t.Logf("enum entries=%d unrepresented=%d refused=%t prefixRepresented=%t traversal=%+v", len(terminal.entries), len(terminal.unrepresented), terminal.refused, terminal.prefixRepresented, terminal.traversal)
		}
		if enumerations != 1 {
			t.Fatalf("UNREACHED original enumeration terminal; count=%d", enumerations)
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		for i := range fresh.operations {
			if fresh.operations[i].fieldDisposition != nil || fresh.operations[i].implicitMap != nil || fresh.operations[i].implicitField != nil {
				t.Fatal("clone retained original terminal observation")
			}
		}
		if entries != 1 {
			t.Fatalf("UNREACHED exact original entry; observed=%d", entries)
		}
	}, activeModuleCompleteAnalysis)
}
