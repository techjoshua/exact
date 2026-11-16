package exactcompiler

import (
	"reflect"
	"slices"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original collector issues the first selected admission while its real
// source producers are still pending. Only normal publication/delivery and the
// existing queued Get may replace it; ACK alone cannot renew that observation.
func TestStagedNativeModuleInputRenewal(t *testing.T) {
	assertNativeInputReceiptRenewal(t, nativeWriterInertModuleSource, nativeWriterInertSelectedSource, func(work *callableEffectWork, source *sourceStagedNativeGetSource) bool {
		return work.nativeEagerWitnessCurrent(source)
	})
}

// Both domains run the original dispatcher and first normal resolution. Only
// the current consumer differs: function construction never borrows a module law.
func assertNativeInputReceiptRenewal(t *testing.T, sourceText string, selectSource func(*testing.T, *callableEffectWork) *sourceStagedNativeGetSource, currentInput func(*callableEffectWork, *sourceStagedNativeGetSource) bool) {
	t.Helper()
	withReflectiveRelevanceSource(t, sourceText, func(owner *executableBodyOwner, file *ast.SourceFile) {
		facts := stagedReturnSourceFacts(file)
		for i := range facts {
			f := &facts[i]
			f.callSymbols = make(map[string]ast.SymbolId)
			f.ownedScalarCalls = make(map[string]bool)
			f.callExpressions = make(map[string]*ast.Node)
			f.contextReferences = make(map[string]*ast.Node)
			if runtimeVariableInitializer(f.node) {
				if declaration, plan, ok := preflightModuleInitializer(owner, f.node); ok {
					f.initializerDeclaration, f.initializerPlan = declaration, plan
				}
			}
		}
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		installBuildingInitializers(owner, file, facts)
		work := registerCallableEffectWork(facts)
		var old *sourceStagedNativeEagerWitness
		var oldObserved []sourceStagedNativeEagerDependency
		var oldRequired []sourceStagedOperationRequest
		var oldVector []uint64
		var original, originalEager *sourceStagedNativeGetSource
		var getID sourceStagedOperationID
		var phases []sourceStagedOperationRecipe
		renewed, coalesced := false, false
		resolved := false
		inspect := func() {
			source := selectSource(t, &work)
			if source != nil {
				eager := work.operationRecipes[nativeRootDebtRequest(source, "eager-inputs").producer].nativeGet
				if eager == nil || !sameNativeGetSource(eager, source) {
					t.Fatal("original eager phase association absent")
				}
				law, described := nativeEagerReceiptRequest(source)
				receipt := work.entryLawReceipts[law.producer]
				if described && receipt != nil && receipt.nativeEager != nil {
					w := receipt.nativeEager
					if resolved {
						t.Logf("first resolve witness old=%p new=%p admitted=%t delivered=%t GetID=%+v observed=%+v vector=%v", old, w, w.admitted, w.delivered, w.get, w.observed, w.vector)
					}
					if old == nil {
						old, original, originalEager = w, source, eager
						oldObserved = append([]sourceStagedNativeEagerDependency(nil), w.observed...)
						oldRequired = append([]sourceStagedOperationRequest(nil), w.required...)
						oldVector = append([]uint64(nil), w.vector...)
						getID = work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
						if !validNativeEffectsRequest(work.operationRecipes[source.request.producer]) || getID.index == 0 || work.nativeEffectsTaskSource(getID) == nil || !work.nativeEffectsTaskOwned(getID) {
							t.Fatal("original collector did not adopt/queue the exact Effects Get continuation")
						}
						pending := false
						for _, d := range w.observed {
							pending = pending || d.revision == 0
						}
						if !pending || len(w.required) == 0 || currentInput(&work, eager) {
							t.Fatal("genuine initial pending semantic observation UNREACHED")
						}
						for _, d := range work.sourceObservationDependencies(getID) {
							state := &work.operations[d.producer.index]
							sub := state.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
							if sub == nil || sub.blocked || !sameOperationRequest(sub.request, d.request) || !slices.Contains(sub.writerSourceParents, getID) {
								t.Fatal("ordinary adoption omitted exact Get reverse-arrival watcher")
							}
						}
						for _, role := range []string{"algorithm", "eager-inputs"} {
							phase := work.operationRecipes[nativeRootDebtRequest(source, role).producer]
							if !validNativeGetRecipe(phase) || phase.nativeGet.effectsSource != nil {
								t.Fatal("root-only Effects continuation leaked into a phase")
							}
							phase.delta = cloneOperationDelta(phase.delta)
							phases = append(phases, phase)
						}
					} else {
						if !reflect.DeepEqual(old.observed, oldObserved) || !reflect.DeepEqual(old.required, oldRequired) || !slices.Equal(old.vector, oldVector) {
							t.Fatal("publication/ACK rewrote the original semantic observation")
						}
						if w != old && currentInput(&work, eager) {
							if work.operations[getID.index].nativeEffectsObserved == nil || work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer] != getID || work.nativeEagerObservedCurrent(old, false) {
								t.Fatal("renewal borrowed old proof or replaced the original Get task")
							}
							if !sameNativeEffectsRequest(original.effectsSource, source.effectsSource) || !validNativeEffectsRequest(work.operationRecipes[source.request.producer]) {
								t.Fatal("fresh phase admission lost the root continuation")
							}
							for _, prior := range phases {
								current := work.operationRecipes[prior.key]
								if !validNativeGetRecipe(current) || current.nativeGet.effectsSource != nil || !operationDeltaPrefix(prior.delta, current.delta) {
									t.Fatal("fresh phase admission lost a valid full required prefix")
								}
							}
							if len(w.observed) == 0 || len(w.required) < len(oldRequired) {
								t.Fatal("fresh Get omitted its original semantic/full-request obligations")
							}
							for _, required := range oldRequired {
								if !operationContainsRequest(w.required, required) {
									t.Fatal("fresh Get lost an original full dependency request")
								}
							}
							for _, before := range oldObserved {
								found := false
								for _, after := range w.observed {
									if before.dependency.producer == after.dependency.producer && sameOperationRequest(before.dependency.request, after.dependency.request) {
										found = after.revision != 0 && after.revision >= before.revision && after.revision == work.operations[after.dependency.producer.index].revision
									}
								}
								if !found {
									t.Fatal("fresh selected Get did not actually observe the published original producer")
								}
							}
							renewed = true
						}
					}
				}
			}
		}
		// This is the maintained source dispatcher, in queue order. It collects
		// declaration-MAY summaries, not runtime invocation of authored bodies.
		for {
			task, available := work.nextExtraction()
			if !available {
				break
			}
			if task.operation.index != 0 {
				work.extractOperation(facts, task, owner)
			} else {
				i := task.callable
				collectDirectCallableEffects(&facts[i], i, facts, nil, nil, work.memberNodes, file, owner.checker, nil, nil, collectExternalImportBindings(file, owner.checker), collectContextBindings(file, owner.checker), assetAnalysis{}, owner, &work)
			}
			inspect()
			if old != nil && task.delivery {
				// These are already genuinely APPLIED subscribers. Repeating their normal
				// wake handler tests queue coalescing without writing ACKs or revisions.
				for _, d := range work.sourceObservationDependencies(getID) {
					state := &work.operations[d.producer.index]
					sub := state.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
					if sub == nil || sub.blocked || sub.applied == 0 || sub.applied != state.revision {
						continue
					}
					count := func() int {
						n := 0
						for _, q := range work.extractionQueue[work.extractionHead:] {
							if q.operation == getID && !q.delivery && !q.operationDone {
								n++
							}
						}
						return n
					}
					work.afterWriterSourcePrerequisite(d.producer, d.request)
					first := count()
					work.afterWriterSourcePrerequisite(d.producer, d.request)
					if count() != first || first > 1 {
						t.Fatal("same-revision wake duplicated the original Get task")
					}
					coalesced = coalesced || first == 1
				}
			}
			if task.operation.index == 0 {
				work.finishExtraction(facts, task.callable)
			}
		}
		// Complete the maintained fresh-collector entry exactly once. Local
		// extraction alone has not initialized revision propagation/publication.
		// This is the first normal resolve of this work, never cached re-resolve.
		sealMapInputs(facts, work.memberNodes)
		for i := range facts {
			facts[i].directOwnedScalarBlocked = facts[i].directOwnedScalarBlocked || !directScalarHelper(&facts[i], owner.checker)
		}
		pending := resolveCallableEffectsWithWork(facts, owner, &work)
		resolved = true
		t.Logf("first normal source resolution pending=%d", len(pending))
		inspect()
		if old == nil || !renewed || !coalesced {
			t.Fatalf("original pending-to-renewed Get journey incomplete: initial=%t renewed=%t coalesced=%t", old != nil, renewed, coalesced)
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		if fresh.nativeEffectsTaskSource(getID) != nil || fresh.nativeEffectsGetCurrent(original) || currentInput(&fresh, originalEager) || len(fresh.operationIDs) != 0 || len(fresh.entryLawReceipts) != 0 {
			t.Fatal("clone/foreign graph borrowed old Get enrollment, observation or currency")
		}
	})
}

// Registering the live collector's continuation is descriptive. Even this
// genuine original event cannot adopt an operation until its ordinary owner does.
func TestStagedNativeModuleInputEnrollmentBeforeAdoption(t *testing.T) {
	withReflectiveRelevanceSource(t, nativeWriterInertModuleSource, func(owner *executableBodyOwner, file *ast.SourceFile) {
		facts := stagedReturnSourceFacts(file)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		task, queued := work.nextExtraction()
		if !queued || task.operation.index != 0 || !runtimeModuleEvaluation(facts[task.callable].node) {
			t.Fatal("original module collector interval UNREACHED")
		}
		var call *ast.Node
		walkNode(facts[task.callable].node, func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) && n.Expression().Name().Text() == "defineProperties" {
				call = n
			}
			return true
		})
		if call == nil {
			t.Fatal("first original module DefineProperties absent")
		}
		issuer := work.beginNativeEffectsIssuer(facts, task.callable, call, owner, sourceStagedOperationID{})
		if issuer == nil {
			t.Fatal("authentic current module issuer refused")
		}
		defer func() { issuer.active = false; issuer.self = nil }()
		count := len(work.extractionQueue)
		occurrence, supported := work.describeOrdinaryNativeInputOccurrence(facts, task.callable, call, owner, issuer)
		if !supported || occurrence == nil || occurrence.source == nil || occurrence.callee == nil || occurrence.eagerWitness == nil {
			t.Fatal("original selected input/complete Get source event UNREACHED")
		}
		root := work.operationRecipes[occurrence.source.request.producer]
		if !issuer.issued || !validNativeEffectsRequest(root) || work.operationEpoch == nil || len(work.operations) != 1 || len(work.operationIDs) != 0 || len(work.extractionQueue) != count || occurrence.eagerWitness.admitted || occurrence.eagerWitness.delivered {
			t.Fatal("continuation enrollment lost original authority or adopted work/current proof early")
		}
		copied := *issuer
		if copied.live() || work.admitNativeEffectsSourceGet(facts, occurrence, &copied) || len(work.operationIDs) != 0 {
			t.Fatal("copied issuer admitted a Get or allocated operation IDs")
		}
		if !work.adoptNativeInputOccurrence(facts, occurrence) {
			t.Fatal("genuine original occurrence adoption refused")
		}
		getID := work.operationIDs[nativeRootDebtRequest(occurrence.source, "callee-get").producer]
		if getID.index == 0 || !work.nativeEffectsTaskOwned(getID) || work.operations[getID.index].nativeEffectsObserved != nil {
			t.Fatal("adoption did not retain pending original Get task separately from observation")
		}
		issuer.active, issuer.self = false, nil
		if work.admitNativeEffectsSourceGet(facts, occurrence, issuer) || work.operations[getID.index].nativeEffectsObserved != nil {
			t.Fatal("revoked original interval certified cached Get proof")
		}
	})
}
