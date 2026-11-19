package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Use the next real ordinary extraction and the unchanged source. This is not
// another resolution of cached merged facts or a fabricated pending recipe.
func TestStagedNativeEffectsOriginalPendingSource(t *testing.T) {
	withOriginalCacheConstructionSources(t, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		caller := -1
		var call *ast.Node
		for i, f := range facts {
			if f.summary.Name == "operationPrototype" {
				caller = i
				walkNode(f.node, func(n *ast.Node) bool {
					if ast.IsCallExpression(n) && n.Pos() == 1407 {
						call = n
					}
					return true
				})
			}
		}
		if caller < 0 || call == nil {
			t.Fatal("original ordinary native source absent")
		}
		task, queued := work.nextExtraction()
		if !queued || task.operation.index != 0 || task.callable != caller || work.extracting != caller {
			t.Fatal("original callable dispatcher context absent")
		}
		beforeCalls := len(facts[caller].summary.Calls)
		if !work.stageNativeInputCall(facts, caller, call, owner) {
			t.Fatal("owned pending original native Effects request refused")
		}

		request, _ := stagedNativeInputOccurrenceRequest(&facts[caller], call)
		root := work.operationRecipes[request.producer]
		if !validNativeEffectsRequest(root) {
			t.Fatal("original selected event did not register its pending description")
		}
		rootID := work.operationIDs[request.producer]
		getID := work.operationIDs[nativeRootDebtRequest(root.nativeGet, "callee-get").producer]
		if !work.nativeEffectsTaskOwned(rootID) || !work.nativeEffectsTaskOwned(getID) {
			t.Fatal("pending Effects had no adopted producer/continuation")
		}
		if work.currentNativeCalleeEffects(root.nativeGet) != nil || work.operations[getID.index].nativeEffectsObserved != nil {
			t.Fatal("pending request minted current Get")
		}
		methodPending := false
		for _, d := range work.operations[getID.index].dependencies {
			if d.request.producer.operation != nil && d.request.producer.operation.Pos() == 1340 && d.request.producer.selector.field == "callee-alternatives" {
				state := &work.operations[d.producer.index]
				sub := state.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
				methodPending = state.revision == 0 && !state.delta.extracted && sub != nil && !sub.blocked && work.writerSourceTaskOwned(d.producer)
			}
		}
		if !methodPending {
			t.Fatal("original pending method request/subscriber/task journey absent")
		}
		// The initial pending source and repeated same-Get reader attachment
		// share one exact C factory. Describing it again cannot duplicate the
		// inventory as a selected premise or grant any current disposition.
		getRecipe := work.operationRecipes[work.operations[getID.index].key]
		checkedCoverage := false
		for _, coverage := range getRecipe.nativeGet.memberSources {
			for _, reading := range getRecipe.nativeGet.selectionRequired {
				if reading.reading != coverage.producer {
					continue
				}
				repeated, ok := work.nativeObserverRequirements(getRecipe, coverage, reading)
				if !ok || !operationDeltaPrefix(getRecipe.delta, repeated.delta) || !operationDeltaPrefix(repeated.delta, getRecipe.delta) || operationContainsRequest(repeated.nativeGet.selectionRequired, coverage) {
					t.Fatal("same original pending C/reader description changed its factory")
				}
				wrong := coverage
				wrong.cut.reading = nil
				if _, accepted := work.nativeObserverRequirements(getRecipe, wrong, reading); accepted {
					t.Fatal("mismatched full C factory accepted")
				}
				checkedCoverage = true
			}
		}
		if !checkedCoverage {
			t.Fatal("original pending C was not retained as native inventory")
		}
		nativePair, methodPair, newReaderPending, newReaderApplied := false, false, false, false
		checkedIdentityRefusal := false
		inspectReaders := func() {
			recipe := work.operationRecipes[work.operations[getID.index].key]
			for _, association := range recipe.nativeGet.observerInputs {
				producerID, known := work.operationIDs[association.source.producer]
				if !known || producerID.index == 0 {
					continue
				}
				producer := &work.operations[producerID.index]
				original := writerSourceReading(work.operationRecipes[association.source.producer], association.coverage)
				old := producer.subscribers[sourceStagedOperationConsumer{original.consumer, original.edge}]
				current := producer.subscribers[sourceStagedOperationConsumer{association.request.consumer, association.request.edge}]
				if old == nil || current == nil {
					continue
				}
				if original.edge == association.request.edge || !sameOperationRequest(old.request, original) || !sameOperationRequest(current.request, association.request) || old.blocked || current.blocked {
					t.Fatal("C and callee-Get readers lost their independent exact factories")
				}
				if association.source.producer.selector.field == "direct-input-invocation" {
					nativePair = true
					if producer.revision == 1 && old.applied != 1 {
						t.Fatal("existing current C reader acknowledgement changed")
					}
					if current.applied == 0 {
						newReaderPending = true
					}
					if newReaderPending && producer.revision != 0 && current.applied == producer.revision {
						newReaderApplied = true
					}
				} else {
					methodPair = true
				}
				if !checkedIdentityRefusal {
					wrong := association.request
					wrong.reading = original.reading
					if _, accepted := work.requireOperation(facts, wrong); accepted {
						t.Fatal("same edge with a different full reader request was accepted")
					}
					if producer.subscribers[sourceStagedOperationConsumer{association.request.consumer, association.request.edge}] != current || !sameOperationRequest(current.request, association.request) {
						t.Fatal("rejected reader replaced the authentic subscriber")
					}
					checkedIdentityRefusal = true
				}
			}
		}
		// Dispatch only actually adopted operation tasks in this required source
		// cone, in queue order. Other ordinary bodies remain indexed and uncollected.
		progressed := false
		methodObserved := false
		for steps := 0; steps < 4096; steps++ {
			current := work.operationRecipes[request.producer].nativeGet
			algorithm := work.operationRecipes[nativeRootDebtRequest(current, "algorithm").producer]
			inspectReaders()
			if work.nativeEffectsGetCurrent(current) && algorithm.nativeGet != nil && validStagedNativeInputSource(algorithm.nativeGet) && algorithm.delta.extracted && newReaderApplied {
				progressed = true
				break
			}
			relevant := map[sourceStagedOperationID]bool{}
			var visit func(sourceStagedOperationID)
			visit = func(id sourceStagedOperationID) {
				if id.epoch != work.operationEpoch || id.index == 0 || relevant[id] {
					return
				}
				relevant[id] = true
				for _, d := range work.operations[id.index].dependencies {
					visit(d.producer)
				}
				if work.nativeEffectsTaskSource(id) != nil {
					for _, d := range work.nativeEffectsTaskDependencies(id) {
						visit(d.producer)
					}
				}
			}
			visit(rootID)
			found := false
			for i := work.extractionHead; i < len(work.extractionQueue); i++ {
				next := work.extractionQueue[i]
				if next.operation.index == 0 || next.operationDone || !relevant[next.operation] {
					continue
				}
				work.extractionQueue[i].operationDone = true

				work.extractOperation(facts, next, owner)
				for _, dependency := range work.operations[getID.index].dependencies {
					method := work.operationRecipes[dependency.request.producer]
					if dependency.request.producer.operation.Pos() != 1340 || !work.nativeObserverProducerCurrent(method) {
						continue
					}
					methodObserved = true
					for _, required := range method.delta.required {
						child, adopted := work.operationIDs[required.producer]
						if !validOperationEnvelope(work.operationRecipes[required.producer]) || !adopted || child.epoch != work.operationEpoch || child.index == 0 || work.operations[child.index].invalid {
							t.Fatalf("observed method omitted authentic adopted full source child: %+v", required)
						}
					}
				}
				found = true
				break
			}
			if !found {
				st := &work.operations[getID.index]
				t.Fatalf("original pending source lost executable continuation: Get rev=%d X=%v invalid=%v observed=%v currentVector=%v tasks=%d/%d", st.revision, st.delta.extracted, st.invalid, st.nativeEffectsObserved, work.sourceObservationRevisions(getID), work.extractionHead, len(work.extractionQueue))
			}
		}
		if !nativePair || !methodPair || !newReaderPending || !newReaderApplied {
			t.Fatalf("original reader lifecycle incomplete: native=%v method=%v initialPending=%v applied=%v", nativePair, methodPair, newReaderPending, newReaderApplied)
		}
		if !methodObserved {
			t.Fatal("original method task never issued its current full source")
		}
		if !progressed {
			t.Fatal("original source task chain did not reach child conditional input")
		}
		if len(facts[caller].summary.Calls) != beforeCalls {
			t.Fatal("source tasks manufactured ordinary Call edges")
		}
		if !work.nativeEffectsGetCurrent(work.operationRecipes[request.producer].nativeGet) {
			t.Fatal("actual Get lost its prerequisite revisions")
		}
		// Current reuse consumes no additional source query/task.
		state := &work.operations[rootID.index]
		count := len(work.extractionQueue)
		work.extractOperation(facts, callableExtractionTask{callable: caller, operation: rootID}, owner)
		if len(work.extractionQueue) != count || state.writerSourceRunning {
			t.Fatal("current reuse repeated source work")
		}
		source := work.operationRecipes[request.producer].nativeGet
		description := *source.effectsSource
		description.generation = &projectGeneration{}
		bad := work.operationRecipes[request.producer]
		copy := *source
		copy.effectsSource = &description
		bad.nativeGet = &copy
		if work.nativeEffectsSourceCurrent(bad) {
			t.Fatal("wrong generation description supplied current Get")
		}
		issuer := work.beginNativeEffectsIssuer(facts, caller, call, owner, sourceStagedOperationID{})
		if issuer == nil {
			t.Fatal("actual ordinary source issuer missing")
		}
		copied := *issuer
		if copied.live() {
			t.Fatal("copied issuer became live")
		}
		issuer.active = false
		if issuer.live() {
			t.Fatal("expired issuer remained live")
		}
	})
}
