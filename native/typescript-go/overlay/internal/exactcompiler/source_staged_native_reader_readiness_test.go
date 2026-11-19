package exactcompiler

import (
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The unchanged fixture supplies the actual C-reader and canonical collector.
// This local control qualifies pending ownership and the real ready boundary;
// the unchanged original F1/GenericGet controls own final SOURCE/current/APPLIED.
func TestStagedNativeReaderCanonicalReadinessOriginalSource(t *testing.T) {
	for _, cancel := range []bool{false, true} {
		name := "ready-boundary"
		if cancel {
			name = "panic-restoration"
		}
		t.Run(name, func(t *testing.T) { checkOriginalNativeReaderReadiness(t, cancel) })
	}
}

func checkOriginalNativeReaderReadiness(t *testing.T, cancel bool) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")

	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	var observed bool
	var observedWork *callableEffectWork
	var observedID sourceStagedOperationID
	var observedScope sourceCanonicalReadinessOwner
	marker := new(int)
	if cancel {
		defer func() {
			recovered := recover()
			if recovered != marker {
				if recovered != nil {
					panic(recovered)
				}
				t.Fatal("genuine C-only pending source entry UNREACHED")
			}
			if !observed || observedWork == nil || observedWork.operationPreparing || observedWork.operationCanonical.work != nil || observedWork.extracting != observedScope.caller {
				t.Fatal("bounded operation/canonical owner was not restored on panic")
			}
			if observedScope.live(observedWork, observedID, observedScope.caller) {
				t.Fatal("exited canonical drain retained readiness authority")
			}
			t.Log("genuine suspended C-reader owner restored after actual callback panic; no source receipt granted")
		}()
	}
	withActiveModuleSourceWorkSetup(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, publisher := range owner.pendingMemberPublishers {
			if publisher.workRegistrar == nil || publisher.workRegistrar.writerScopeSource == nil {
				continue
			}
			original := publisher.workRegistrar.writerScopeSource
			publisher.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
				original(q, r)
				if observed || q == nil || r == nil || r.call == nil || r.call.Pos() != 2187 || ast.GetSourceFileOfNode(r.call).FileName() != filepath.Join(fixture.root, "component-abi/opaque-operation.ts") || q.stagedNativeGet != nil || q.stagedMember == nil || q.stagedMember.getPreparation != nil || q.stagedMember.registerWriterSource == nil {
					return
				}
				b := q.stagedMember
				register := b.registerWriterSource
				b.registerWriterSource = func(actual *sourceWriterInputRequest) {
					b.registerWriterSource = register
					register(actual)
					if actual != r || r.writerSourceWork != work || r.writerSourceIssuer != r {
						return
					}
					id, adopted := work.operationIDs[r.writerSourceReading.producer]
					if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
						return
					}
					state := &work.operations[id.index]
					recipe := work.operationRecipes[state.key]
					if !nativeWriterScopeRequested(recipe) || state.delta.extracted || recipe.delta.extracted || work.writerSourceLocallyReady(recipe) {
						return
					}
					canonical := recipe.memberSource.request
					if self := state.subscribers[sourceStagedOperationConsumer{canonical.consumer, canonical.edge}]; self != nil {
						return
					}
					scope := work.operationCanonical
					if work.extracting != -1 || !scope.live(work, id, scope.caller) || !work.nativeWriterReadinessSubscriber(recipe, state, r.writerSourceReading) || !work.nativeWriterSourceCallerPendingOwned(id) || !work.writerSourceTaskOwned(id) {
						t.Fatal("actual suspended C-only native continuation lost pending ownership")
					}
					if sameOperationRequest(canonical, r.writerSourceReading) {
						t.Fatal("C-only source entry used canonical self-request")
					}
					before := cloneOperationDelta(state.delta)
					revision := state.revision
					sub := state.subscribers[sourceStagedOperationConsumer{r.writerSourceReading.consumer, r.writerSourceReading.edge}]
					if sub == nil || sub.blocked {
						t.Fatal("actual original reader subscriber absent")
					}
					consumed, applied := sub.consumed, sub.applied
					// Detached negative arguments never change the live graph or paid stamps.
					foreign := scope
					foreign.generation = nil
					if foreign.live(work, id, scope.caller) {
						t.Fatal("foreign generation supplied suspended ownership")
					}
					foreign = scope
					foreign.publisher = nil
					if foreign.live(work, id, scope.caller) {
						t.Fatal("missing publisher supplied suspended ownership")
					}
					wrongID := id
					wrongID.epoch = nil
					if scope.live(work, wrongID, scope.caller) {
						t.Fatal("foreign epoch supplied suspended ownership")
					}
					other := callableEffectWork{}
					if scope.live(&other, id, scope.caller) {
						t.Fatal("another work inherited suspended ownership")
					}
					wrong := r.writerSourceReading
					wrong.cut.operation = nil
					if work.nativeWriterReadinessSubscriber(recipe, state, wrong) {
						t.Fatal("foreign C-cut supplied pending enrollment")
					}
					wrong = r.writerSourceReading
					wrong.edge += "-unregistered"
					if work.nativeWriterReadinessSubscriber(recipe, state, wrong) {
						t.Fatal("unregistered reader supplied pending enrollment")
					}
					if work.nativeWriterReadinessSubscriber(recipe, state, canonical) {
						t.Fatal("absent canonical subscriber was manufactured")
					}
					if state.revision != revision || sub.consumed != consumed || sub.applied != applied || !operationDeltaPrefix(before, state.delta) || !operationDeltaPrefix(state.delta, before) || work.writerSourceLocallyReady(recipe) {
						t.Fatal("pending checks changed outputs, revision, payment or currentness")
					}
					observed, observedWork, observedID, observedScope = true, work, id, scope
					if cancel {
						panic(marker)
					}
				}
			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if !observed {
			t.Fatal("genuine C-only pending source entry UNREACHED")
		}
		if work != observedWork || work.operationPreparing || work.operationCanonical.work != nil || observedScope.live(work, observedID, observedScope.caller) {
			t.Fatal("canonical drain scope survived its owned interval")
		}
		if !facts[observedScope.caller].staged.ready || work.extractionPhases[observedScope.caller] != callableExtractionReady {
			t.Fatal("original canonical readiness event UNREACHED")
		}
		// This is the real collector progressing beyond its pending native reader.
		// No global pending-zero or final SOURCE/APPLIED is inferred from readiness.
		t.Log("actual C-only reader retained compiler pending debt; original collector reached ready and synchronous scope expired")
		_ = owner
	}, activeModuleBeforeResolution)
}
