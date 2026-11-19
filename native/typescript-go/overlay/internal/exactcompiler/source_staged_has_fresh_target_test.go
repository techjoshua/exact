package exactcompiler

import "testing"

// Continue the unchanged original A -> B source journey through its actual
// queued candidate/law delivery. Neither this check nor the transport checks
// create a native source, Get transcript, ordinary use or body invocation.
func assertGlobalStoreHasFreshTargets(t *testing.T, work *callableEffectWork, facts []callableFacts, owner *executableBodyOwner) {
	t.Helper()
	work.prepareOperationUses(facts, owner)
	found := 0
	for key, recipe := range work.operationRecipes {
		s := recipe.memberSource
		if s == nil || s.hasFreshTarget == nil {
			continue
		}
		found++
		id := work.operationIDs[key]
		if id.epoch != work.operationEpoch || id.index == 0 || work.operations[id.index].invalid || !validHasFreshTargetRecipe(recipe) || !recipe.delta.extracted || !work.hasFreshTargetCurrent(recipe) {
			t.Fatal("original Has candidate did not consume its current typed source", key.operation.Pos())
		}
		p := s.hasFreshTarget
		r := hasFreshTargetReading(s)
		lawID := work.operationIDs[r.producer]
		law := &work.operations[lawID.index]
		sub := law.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
		if sub == nil || sub.blocked || sub.applied != law.revision || law.revision == 0 || !sameOperationRequest(sub.request, r) || !operationContainsRequest(recipe.delta.required, p.native) {
			t.Fatal("Has candidate lost its full producer or exact applied reader")
		}
		rootID := work.operationIDs[p.root.producer]
		state := work.operations[rootID.index].hasInstance
		proof := state.nativeDefault
		// ACK is transport only, including when it precedes the complete Has event.
		// Removing authority here can only refuse semantic consumption, never mint it.
		state.nativeDefault = nil
		if work.hasFreshTargetCurrent(recipe) || !work.applyOperationDelivery(facts, work.memberNodes[r.consumer], sourceStagedOperationUse{request: r}, sourceStagedOperationDelta{extracted: true}, owner) {
			t.Fatal("ACK requires semantic transcript or missing transcript granted relevance")
		}
		state.nativeDefault = proof
		for _, change := range []func(*sourceStagedHasFreshTarget){
			func(p *sourceStagedHasFreshTarget) { p.cut.use = p.root.use },
			func(p *sourceStagedHasFreshTarget) { p.generation = new(projectGeneration) },
			func(p *sourceStagedHasFreshTarget) { p.native.use = p.root.use },
			func(p *sourceStagedHasFreshTarget) { p.coverage.edge += "copied" },
		} {
			invalid := recipe
			invalid.memberSource = cloneStagedMemberSource(s)
			change(invalid.memberSource.hasFreshTarget)
			if validHasFreshTargetRecipe(invalid) {
				t.Fatal("wrong Has reader association accepted")
			}
		}
		wrong := r
		wrong.reading.selector.association = nil
		if work.validHasFreshTargetReading(work.operationRecipes[r.producer], wrong) {
			t.Fatal("wrong candidate reading accepted")
		}
		queued := len(work.extractionQueue)
		work.queueHasFreshTargets(p.root)
		work.queueHasFreshTargets(p.root)
		if len(work.extractionQueue) != queued+1 {
			t.Fatal("two original-event notifications did not coalesce same adopted task")
		}
	}
	if found == 0 {
		t.Fatal("original Has Get never issued its fresh-target reader")
	}
	clones := make([]callableFacts, len(facts))
	for i := range facts {
		clones[i] = cloneProjectCallableFact(facts[i])
	}
	fresh := newCallableEffectWork(clones)
	fresh.operationGeneration = owner.values.generation
	fresh.indexOperationSources(clones)
	for _, recipe := range fresh.operationRecipes {
		if recipe.memberSource != nil && recipe.memberSource.hasFreshTarget != nil && fresh.hasFreshTargetCurrent(recipe) {
			t.Fatal("clone inherited Has relevance authority")
		}
	}
}
