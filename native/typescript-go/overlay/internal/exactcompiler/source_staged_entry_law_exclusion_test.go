package exactcompiler

import "testing"

// Continue the unchanged original source journey through its actual queued
// implicit Gets. Name each indexed source whose full Effects coexist with its
// original module prior-activation disposition; never install a proof here.
func assertGlobalStoreEntryLawExclusions(t *testing.T, work *callableEffectWork, facts []callableFacts, owner *executableBodyOwner) {
	t.Helper()
	work.prepareOperationUses(facts, owner)
	entries, fields, protocols := 0, 0, 0
	for key, recipe := range work.operationRecipes {
		plan := recipe.entryLaw
		if plan == nil || plan.base.producer.operation.Pos() != 745 || (plan.kind != stagedEntryLawMapGet && plan.kind != stagedEntryLawFieldGet) {
			continue
		}
		proof := work.entryLawReceipts[key]
		id := work.operationIDs[key]
		if id.index == 0 || proof == nil {
			t.Fatalf("original implicit source authority missing: adopted=%v receipt=%v", id.index != 0, proof != nil)
		}
		if id.index == 0 || id.epoch != work.operationEpoch || work.operations[id.index].invalid || proof == nil || !work.entryLawLocallyAccounted(recipe, proof) || !work.operations[id.index].delta.extracted || work.operations[id.index].revision == 0 {
			for _, required := range recipe.delta.required {
				c := work.operationRecipes[required.producer].memberSource
				if c == nil || c.coverage == nil {
					continue
				}
				for _, r := range c.coverage.required {
					child := work.operationRecipes[r.producer].memberSource
					if child == nil || child.protocolSource == nil {
						continue
					}
					actual := child.protocolSource.required
					t.Logf("retained typed candidate=%v@%d regionPresent=%v parent=%s source=%v@%d role=%q lawEventCount=%d contextual=%v", child.candidate.operation.Kind, child.candidate.operation.Pos(), child.candidate.region != nil, child.parent.producer.selector.field, actual.producer.operation.Kind, actual.producer.operation.Pos(), actual.producer.selector.field, len(proof.exclusions), work.entryLawCandidateExcluded(recipe, work.operationRecipes[r.producer], proof))
				}
			}
			t.Fatalf("original implicit law not delivered: kind=%d occurrence=%d adopted=%v receipt=%v current=%v X=%v revision=%d exclusions=%d", plan.kind, key.selector.occurrence.Pos(), id.index != 0, proof != nil, work.entryLawLocallyAccounted(recipe, proof), work.operations[id.index].delta.extracted, work.operations[id.index].revision, len(proof.exclusions))
		}
		if plan.kind == stagedEntryLawMapGet {
			entries++
		} else {
			fields++
		}
		for i, event := range proof.exclusions {
			child := work.operationRecipes[event.request.producer]
			if child.memberSource == nil || child.memberSource.protocolSource == nil {
				continue
			}
			required := child.memberSource.protocolSource.required
			if !work.entryLawCandidateExcluded(recipe, child, proof) || !operationContainsRequest(child.delta.required, required) || !validOperationEnvelope(work.operationRecipes[required.producer]) {
				t.Fatal("original contextual disposition lost its actual typed source", event.candidate.operation.Pos(), required.producer.selector.field)
			}
			protocols++
			t.Logf("original exclusion law=%s candidate=%v@%d source=%v@%d role=%q fullRequired=%d", key.selector.field, event.candidate.operation.Kind, event.candidate.operation.Pos(), required.producer.operation.Kind, required.producer.operation.Pos(), required.producer.selector.field, len(child.delta.required))
			// Mutate one detached operand while retaining the actual issuer, so these
			// checks exercise the association rather than merely rejecting a copy.
			for _, change := range []func(*sourceStagedEntryLawCandidateExclusion){
				func(p *sourceStagedEntryLawCandidateExclusion) { p.candidate.cut.reading = nil },
				func(p *sourceStagedEntryLawCandidateExclusion) { p.coverage.edge += "copy" },
				func(p *sourceStagedEntryLawCandidateExclusion) { p.prefix.source.generation = new(projectGeneration) },
				func(p *sourceStagedEntryLawCandidateExclusion) { p.prefix.accounted = false },
				func(p *sourceStagedEntryLawCandidateExclusion) { p.request.edge += "wrong-source" },
			} {
				changed := event
				change(&changed)
				proof.exclusions[i] = changed
				accepted := work.entryLawCandidateExcluded(recipe, child, proof)
				proof.exclusions[i] = event
				if accepted {
					t.Fatal("wrong source/cut/generation/prior-activation disposition accepted")
				}
			}
			copy := *proof
			if work.entryLawCandidateExcluded(recipe, child, &copy) {
				t.Fatal("copied receipt acquired original event authority")
			}
			// Transfer removal leaves every genuine protocol producer/requirement and
			// the original local Get receipt in place, but cannot account this route.
			saved := proof.exclusions
			proof.exclusions = nil
			accepted := work.entryLawCandidateExcluded(recipe, child, proof)
			proof.exclusions = saved
			if accepted || !operationContainsRequest(child.delta.required, required) {
				t.Fatal("missing disposition granted exclusion or removed protocol Effects")
			}
		}
	}
	if entries != 2 || fields != 12 || protocols == 0 {
		t.Fatalf("original entry/field source domain missing: entries=%d fields=%d typedProtocols=%d", entries, fields, protocols)
	}
	for index := 1; index < len(work.operations); index++ {
		s := &work.operations[index]
		for _, d := range s.dependencies {
			if work.operationRecipes[d.request.producer].entryLaw == nil {
				continue
			}
			child := &work.operations[d.producer.index]
			sub := child.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
			if sub == nil || sub.blocked || sub.applied != child.revision {
				t.Fatal("current original law revision not applied to its exact reader")
			}
		}
	}
	clones := make([]callableFacts, len(facts))
	for i := range facts {
		clones[i] = cloneProjectCallableFact(facts[i])
	}
	fresh := registerCallableEffectWork(clones)
	fresh.operationGeneration = owner.values.generation
	for _, r := range fresh.operationRecipes {
		if p := fresh.entryLawReceipts[r.key]; r.entryLaw != nil && p != nil && len(p.exclusions) != 0 {
			t.Fatal("clone inherited contextual module authority")
		}
	}
}
