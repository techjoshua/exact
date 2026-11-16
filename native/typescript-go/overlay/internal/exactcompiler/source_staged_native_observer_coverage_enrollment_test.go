package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The existing two-Call source supplies both real native factories. This test
// owns a genuine C-reader demand through requireOperation, not a registrar or
// a later Get-reader sibling. No graph IDs, selection or receipts are supplied.
func TestStagedNativeObserverCoverageEnrollmentEntry(t *testing.T) {
	withReflectiveRelevanceSource(t, `export function invoke(){Object.freeze({});return Object.freeze({})}`, func(owner *executableBodyOwner, file *ast.SourceFile) {
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		var calls []*ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) {
				calls = append(calls, node)
			}
			return true
		})
		if len(calls) != 2 {
			t.Fatal("original two-Call source missing")
		}
		caller := work.memberNodes[enclosingCallableNode(calls[0])]
		first, provided := work.describeNativeInputOccurrence(facts, caller, calls[0], owner)
		if !provided || first == nil || first.source == nil {
			t.Fatal("actual first producer UNREACHED")
		}
		second, provided := work.describeNativeInputOccurrence(facts, caller, calls[1], owner)
		if !provided || second == nil || second.source == nil {
			t.Fatal("actual second Get source UNREACHED")
		}
		source := nativeInputInvocationRequest(first.source)
		producer := work.operationRecipes[source.producer]
		parent := work.operationRecipes[nativeInputInvocationRequest(second.source).producer]
		if !work.nativeInputInvocationCurrent(producer) || parent.nativeGet == nil || len(parent.nativeGet.memberSources) == 0 {
			t.Fatal("original native source/C factories UNREACHED")
		}
		coverage := parent.nativeGet.memberSources[0]
		c := work.operationRecipes[coverage.producer]
		if !validStagedMemberCoverageRecipe(c) || !validNativeObserverCoverage(c.memberSource) || c.memberSource.generation != work.operationGeneration {
			t.Fatal("real current-generation native C factory UNREACHED")
		}
		reading := nativeInputInvocationReading(source, coverage)
		association, associated := work.nativeObserverInputAssociation(reading)
		if !associated || reading.reading != coverage.producer || reading.reading.selector.field != "member-source-set" || !sameOperationRequest(association.coverage, coverage) || !sameOperationRequest(association.source, source) || association.observer != c.memberSource.coverage.nativeObserver {
			t.Fatal("same native C-reader association UNREACHED")
		}
		physicalCut := association.observer.cut
		producerCut := producer.nativeGet.inputInvocation.cut
		generation := work.operationGeneration
		if association.observer.get != calls[1].Expression() || physicalCut.initializing != calls[1] || physicalCut == producerCut {
			t.Fatal("original independent C/producer physical cuts unavailable")
		}
		if _, adopted := work.operationIDs[coverage.producer]; adopted {
			t.Fatal("genuine passive C before active enrollment UNREACHED")
		}

		// Active enrollment uses an already-issued native C; source registration
		// above remains passive. Nothing executes the queue inside requireOperation.
		id, adopted := work.requireOperation(facts, reading)
		cid, cadopted := work.operationIDs[coverage.producer]
		if !adopted || !cadopted || id.epoch != work.operationEpoch || cid.epoch != work.operationEpoch || id.index == 0 || cid.index == 0 {
			t.Fatal("active native reader omitted its real C")
		}
		if work.operations[cid.index].delta.extracted || work.operations[cid.index].nativeCallee != nil || work.operations[cid.index].nativeScopeObserved != nil {
			t.Fatal("C enrollment manufactured currentness/Get observation")
		}
		sub := work.operations[id.index].subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
		if sub == nil || sub.request != reading || sub.blocked || sub.applied != 0 {
			t.Fatal("original unacknowledged reader subscriber missing")
		}
		queuedReader := false
		for _, task := range work.extractionQueue {
			queuedReader = queuedReader || task.operation == id && !task.operationDone
		}
		if !queuedReader {
			t.Fatal("actual reader extraction was not queued")
		}
		work.drainOperationExtractions(facts, owner)

		// This exact C subscriber's own APPLIED and original physical refresh are
		// mandatory; no callee-Get or wrapper receipt can pay either requirement.
		if id.epoch != work.operationEpoch || cid.epoch != work.operationEpoch || int(id.index) >= len(work.operations) || int(cid.index) >= len(work.operations) {
			t.Fatal("original C/producer epoch lifetime lost during delivery")
		}
		state := &work.operations[id.index]
		sub = state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
		if state.invalid || !state.delta.extracted || state.revision == 0 || sub == nil || sub.blocked || sub.consumed != state.revision || sub.applied != state.revision {
			t.Fatalf("actual C-reader producer/delivery/APPLIED UNREACHED: X=%t rev=%d subscriber=%t", state.delta.extracted, state.revision, sub != nil)
		}
		if sub.nativeInputObserved != state.revision {
			t.Fatalf("same-C original physical refresh UNREACHED: observed=%d revision=%d", sub.nativeInputObserved, state.revision)
		}
		association, current := work.nativeObserverInputAssociation(reading)
		currentC := work.operationRecipes[coverage.producer]
		cs := &work.operations[cid.index]
		ownC := cs.subscribers[sourceStagedOperationConsumer{coverage.consumer, coverage.edge}]
		if !current || association.observer.cut != physicalCut || association.observer.get != calls[1].Expression() || !sameOperationRequest(association.coverage, coverage) || currentC.memberSource == nil || currentC.memberSource.generation != generation || work.operationGeneration != generation || cid.epoch != work.operationEpoch {
			t.Fatal("same C/cut/epoch/generation current association UNREACHED")
		}
		if !currentC.delta.extracted || !cs.delta.extracted || cs.invalid || cs.revision == 0 || !cs.memberCoverageObserved || work.memberCoverageObserved[coverage.producer] != generation || ownC == nil || ownC.blocked || ownC.consumed != cs.revision || ownC.applied != cs.revision || !sameOperationRequest(ownC.request, coverage) {
			t.Fatalf("same C full original observation/publication/APPLIED UNREACHED: recipeX=%t stateX=%t invalid=%t rev=%d observed=%t stampCurrent=%t ownSubscriber=%t", currentC.delta.extracted, cs.delta.extracted, cs.invalid, cs.revision, cs.memberCoverageObserved, work.memberCoverageObserved[coverage.producer] == generation, ownC != nil)
		}
		if !work.acceptedNativeInputInvocationReading(reading) || work.operationRecipes[source.producer].nativeGet.inputInvocation.cut != producerCut {
			t.Fatal("actual C input-current consumer/producer-cut preservation UNREACHED")
		}
		closed := work.closedOperationDependencies()
		if int(cid.index) >= len(closed) || !closed[cid.index] {
			t.Fatal("same C complete required closure UNREACHED")
		}
		if int(id.index) >= len(closed) || !closed[id.index] {
			t.Fatal("original producer full Call/Get required closure UNREACHED")
		}
		if !operationContainsRequest(work.operationRecipes[source.producer].delta.required, first.source.request) || !operationContainsRequest(work.operationRecipes[source.producer].delta.required, nativeRootDebtRequest(first.source, "callee-get")) {
			t.Fatal("input reader dropped full original Call/Get debt")
		}

		// Refusers run outside original queries, after genuine current delivery.
		for _, change := range []func(*sourceStagedOperationRequest){
			func(r *sourceStagedOperationRequest) { r.edge += ":wrong" },
			func(r *sourceStagedOperationRequest) { r.use = calls[1] },
			func(r *sourceStagedOperationRequest) { r.cut.initializing = calls[0] },
			func(r *sourceStagedOperationRequest) { r.reading.selector.association = calls[0] },
		} {
			wrong := reading
			change(&wrong)
			states, queued, applied := len(work.operations), len(work.extractionQueue), sub.applied
			if _, accepted := work.requireOperation(facts, wrong); accepted || len(work.operations) != states || len(work.extractionQueue) != queued || sub.applied != applied {
				t.Fatal("wrong reader changed C/source enrollment or receipt")
			}
		}
		sealed := cloneOperationDelta(currentC.delta)
		states, queued, applied := len(work.operations), len(work.extractionQueue), sub.applied
		again, accepted := work.requireOperation(facts, reading)
		after := work.operationRecipes[coverage.producer].delta
		if !accepted || again != id || len(work.operations) != states || len(work.extractionQueue) != queued || sub.applied != applied || !operationDeltaPrefix(sealed, after) || !operationDeltaPrefix(after, sealed) {
			t.Fatal("repeat enrollment grew sealed C or recertified ACK")
		}
		func() {
			foreignGeneration := *generation
			work.operationGeneration = &foreignGeneration
			defer func() { work.operationGeneration = generation }()
			states, queued := len(work.operations), len(work.extractionQueue)
			if _, accepted := work.requireOperation(facts, reading); accepted || len(work.operations) != states || len(work.extractionQueue) != queued {
				t.Fatal("old-generation native C reader admitted")
			}
		}()
		foreign := id
		foreign.epoch = nil
		if _, accepted := work.consumeOperation(foreign, reading); accepted {
			t.Fatal("foreign-epoch delivery accepted")
		}
		assertNativeInputCloneNeedsFreshObservation(t, &work, facts, reading, owner)
		t.Log("actual passive native C -> active enrollment -> exact producer/APPLIED/physical refresh/current C closure;4refusers+generation/epoch/clone+sealed/idempotent controls")
	})
}

// assertNativeInputCloneNeedsFreshObservation permits immutable same-generation
// descriptions to enroll, while exercising the actual delivery consumer against
// a genuine old-graph packet before any fresh graph work can earn observations.
func assertNativeInputCloneNeedsFreshObservation(t *testing.T, work *callableEffectWork, facts []callableFacts, reading sourceStagedOperationRequest, owner *executableBodyOwner) {
	t.Helper()
	oldID, provided := work.operationIDs[reading.producer]
	oldPacket, delivered := work.consumeOperation(oldID, reading)
	if !provided || !delivered || !oldPacket.delta.extracted || oldPacket.producer != oldID || oldPacket.revision == 0 {
		t.Fatal("genuine old current reader packet unavailable")
	}
	cloned := make([]callableFacts, len(facts))
	for i := range facts {
		cloned[i] = cloneProjectCallableFact(facts[i])
	}
	fresh := registerCallableEffectWork(cloned)
	fresh.operationGeneration = work.operationGeneration
	freshID, enrolled := fresh.requireOperation(cloned, reading)
	if !enrolled || freshID.epoch == nil || freshID.epoch != fresh.operationEpoch || freshID.epoch == oldID.epoch || freshID.index == 0 {
		t.Fatal("immutable native description did not enroll independently")
	}
	association, associated := fresh.nativeObserverInputAssociation(reading)
	cid, adopted := fresh.operationIDs[association.coverage.producer]
	if !associated || !adopted || cid.epoch != freshID.epoch || cid.index == 0 {
		t.Fatal("fresh pending native reader omitted its original C association")
	}
	assertPending := func() {
		for _, id := range []sourceStagedOperationID{freshID, cid} {
			state := &fresh.operations[id.index]
			if state.revision != 0 || state.delta.extracted || state.memberCoverageObserved || state.nativeCallee != nil || state.nativeScopeObserved != nil || fresh.memberCoverageObserved[state.key] != nil {
				t.Fatal("clone inherited published/current/physical observation state")
			}
			for _, sub := range state.subscribers {
				if sub.consumed != 0 || sub.applied != 0 || sub.nativeInputObserved != 0 || sub.blocked {
					t.Fatal("clone inherited subscriber delivery/APPLIED/physical refresh")
				}
			}
		}
		if fresh.nativeInputInvocationCurrent(fresh.operationRecipes[reading.producer]) || fresh.acceptedNativeObserverReading(reading) {
			t.Fatal("clone inherited current native input reading")
		}
		closed := fresh.closedOperationDependencies()
		if closed[freshID.index] || closed[cid.index] {
			t.Fatal("clone inherited complete native C/producer closure")
		}
	}
	assertPending()
	states, queued := len(fresh.operations), len(fresh.extractionQueue)
	if _, accepted := fresh.consumeOperation(oldPacket.producer, reading); accepted {
		t.Fatal("fresh consumer accepted old epoch packet identity")
	}
	if _, accepted := fresh.consumeOperation(freshID, reading); accepted {
		t.Fatal("fresh pending consumer delivered unpublished data")
	}
	caller := fresh.memberNodes[reading.consumer]
	freshSubscriber := fresh.operations[freshID.index].subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	if freshSubscriber == nil || !sameOperationRequest(freshSubscriber.request, reading) {
		t.Fatal("fresh exact native reader subscriber missing")
	}
	// Resolve the use exactly as deliverOperationSubscribers does: the actual
	// subscriber request is the default; an exact registered use replaces it.
	use := sourceStagedOperationUse{request: freshSubscriber.request}
	for _, sourceUse := range cloned[caller].staged.operationUses {
		if sameOperationRequest(sourceUse.request, freshSubscriber.request) {
			use = sourceUse
			break
		}
	}
	freshRecipe := fresh.operationRecipes[reading.producer]
	if use.call != nil || use.installed != nil || !sameOperationRequest(use.request, reading) || !fresh.requestedWriterSourceSupported(freshRecipe) || !fresh.describedNativeInputInvocationReading(reading) || !validNativeInputInvocationRecipe(freshRecipe) || !freshRecipe.delta.extracted || freshRecipe.nativeGet.inputInvocation.generation != fresh.operationGeneration || len(oldPacket.delta.effects)+len(oldPacket.delta.exposures)+len(oldPacket.delta.invoked)+len(oldPacket.delta.relative)+len(oldPacket.delta.residuals) != 0 {
		t.Fatal("old packet consumer refuser lost a non-observation premise")
	}
	// For this actual Freeze producer all other nativeInputInvocationCurrent
	// premises hold; its absent new-graph observation stamp prevents acceptance.
	if freshRecipe.nativeGet.kind != sourceNativeObjectFreeze || fresh.memberCoverageObserved[freshRecipe.key] != nil {
		t.Fatal("fresh native input observation refuser is ambiguous")
	}
	if fresh.applyOperationDelivery(cloned, caller, use, oldPacket.delta, owner) {
		t.Fatal("fresh native C consumer accepted old current packet")
	}
	if len(fresh.operations) != states || len(fresh.extractionQueue) != queued {
		t.Fatal("refused old packet changed fresh pending work")
	}
	assertPending()
	// No fresh work is executed here. A genuine later source observation and
	// publication may earn its own currentness/APPLIED under this new graph epoch.
}
