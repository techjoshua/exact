package exactcompiler

import "testing"

// The original source graph, not a copied recipe or a selected builtin name,
// must supply a CURRENT ordinary Freeze input at an actual descriptor-read C.
// A pending/circular binding relation fails this positive before any refusal
// can count as a semantic boundary witness.
func TestOriginalIntrinsicFreezeReadSource(t *testing.T) {
	const source = `export function invoke(){const value=Object.defineProperties({}, {x:{value:1}});return Object.freeze(value)}`
	const name = "/virtual/implicit-freeze-read.ts"
	request := Request{Kind: "analyze", ID: name, Source: source, Diagnostics: "semantic"}
	withActiveModuleSourceWork(t, request, map[string]string{name: source}, nil, func(facts []callableFacts, work *callableEffectWork, _ *executableBodyOwner) {
		found := 0
		for _, root := range work.operationRecipes {
			raw := root.nativeGet
			if raw == nil || raw.kind != sourceNativeObjectDefineProperties || root.key != raw.request.producer {
				continue
			}
			// The owning consumer validates this root then consumes its algorithm
			// source. A root snapshot need not carry the later descriptor plan.
			original := work.implicitNativeSource(raw.request)
			if original == nil || original.descriptorMap == nil {
				t.Fatal("genuine original algorithm source/descriptor plan UNREACHED")
			}
			id := work.operationIDs[original.descriptorMap.protocol.producer]
			if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("UNREACHED original Enum owner")
			}
			phase := work.operations[id.index].implicitMap
			if phase == nil {
				t.Fatal("UNREACHED original Enum observation")
			}
			coverage := work.operationRecipes[phase.coverage.producer]
			if !validStagedMemberCoverageRecipe(coverage) || !coverage.memberSource.coverage.extracted || work.memberCoverageObserved[coverage.key] != work.operationGeneration || !work.nativeWriterCapabilityApplied(phase.coverage) {
				t.Fatal("genuine observed/APPLIED Enum C UNREACHED")
			}
			for _, child := range coverage.delta.required {
				recipe := work.operationRecipes[child.producer]
				native, required, typed := work.implicitProtocolSource(recipe, coverage, child)
				if !typed || native.kind != sourceNativeObjectFreeze || !sameOperationRequest(required, native.request) {
					continue
				}
				if !work.implicitFreezeSourceCurrent(recipe, coverage, child, original, phase) {
					t.Logf("raw original Freeze=%+v C=%+v phase=%+v GetID=%+v eagerID=%+v", native.request, phase.coverage, phase.request, work.operationIDs[nativeRootDebtRequest(native, "callee-get").producer], work.operationIDs[nativeRootDebtRequest(native, "eager-inputs").producer])
					t.Fatal("genuine Freeze/C CURRENT positive UNREACHED; copied/refusal controls UNREACHED")
				}
				found++
				if !operationContainsRequest(coverage.delta.required, child) || !operationContainsRequest(recipe.delta.required, native.request) {
					t.Fatal("read relevance dropped complete Call debt")
				}
				// The same Call remains ineligible for the separate lookup clause.
				if work.implicitLookupSourceCurrent(recipe, coverage, child) {
					t.Fatal("whole Freeze Call paid lookup-only source")
				}
				for _, adjacent := range []string{"callee-get", "algorithm", "eager-inputs"} {
					wrong := recipe
					member, protocol := *recipe.memberSource, *recipe.memberSource.protocolSource
					protocol.required = nativeRootDebtRequest(native, adjacent)
					member.protocolSource = &protocol
					wrong.memberSource = &member
					wrong.delta = cloneOperationDelta(recipe.delta)
					wrong.delta.required = []sourceStagedOperationRequest{protocol.required}
					if sameOperationRequest(protocol.required, required) {
						t.Fatal("adjacent-phase control unchanged")
					}
					if work.implicitFreezeSourceCurrent(wrong, coverage, child, original, phase) {
						t.Fatal("adjacent phase paid whole Freeze intrinsic clause")
					}
				}
				wrongReader := child
				wrongReader.edge += ":foreign"
				if work.implicitFreezeSourceCurrent(recipe, coverage, wrongReader, original, phase) {
					t.Fatal("foreign reader borrowed intrinsic clause")
				}
				wrongC := coverage
				member, c := *coverage.memberSource, *coverage.memberSource.coverage
				c.cut = sourceRelativeCut{}
				member.coverage = &c
				wrongC.memberSource = &member
				if c.cut == coverage.memberSource.coverage.cut {
					t.Fatal("wrong-cut control unchanged")
				}
				if work.implicitFreezeSourceCurrent(recipe, wrongC, child, original, phase) {
					t.Fatal("foreign physical C cut borrowed intrinsic clause")
				}
				copyPhase := *phase
				if work.implicitFreezeSourceCurrent(recipe, coverage, child, original, &copyPhase) {
					t.Fatal("copied phase acquired original owner rights")
				}
				copyPhase.self = &copyPhase
				if work.implicitFreezeSourceCurrent(recipe, coverage, child, original, &copyPhase) {
					t.Fatal("self-labelled copy acquired registered observation slot")
				}
				copyPhase = *phase
				copyPhase.generation = nil
				if work.implicitFreezeSourceCurrent(recipe, coverage, child, original, &copyPhase) {
					t.Fatal("expired phase borrowed current work")
				}
				clones := make([]callableFacts, len(facts))
				for i := range facts {
					clones[i] = cloneProjectCallableFact(facts[i])
				}
				fresh := registerCallableEffectWork(clones)
				if fresh.implicitFreezeSourceCurrent(recipe, coverage, child, original, phase) {
					t.Fatal("clone inherited actual C/Get/input observations")
				}
			}
		}
		if found == 0 {
			t.Fatal("genuine original full Freeze/C source UNREACHED")
		}
	}, activeModuleCompleteAnalysis)
}
