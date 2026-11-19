package exactcompiler

import (
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The unchanged original driver supplies the nested semantic acquisition. Setup
// wraps only the real publisher callback; it never invokes that callback, edits
// a work state, fabricates a request or acknowledges an operation.
func TestStagedDeclarationWriterScopeOriginalSource(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")

	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	var sourceRequest, parentRequest sourceStagedOperationRequest
	var timingSource, timingParent sourceStagedOperationRequest
	var timingGeneration *projectGeneration
	var publisher *sourcePendingMemberPublisher
	var issuers []*sourceStagedNativeEffectsIssuer
	adopted, cutRefused, copyRefused, noWorkRefused, foreignPublisherRefused := false, false, false, false, false
	preselection, lateUnsealed := false, false
	withActiveModuleSourceWorkSetup(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, originalPublisher := range owner.pendingMemberPublishers {
			p := originalPublisher
			if p.workRegistrar == nil || p.workRegistrar.writerScopeSource == nil {
				t.Fatal("real scope registrar missing")
			}
			original := p.workRegistrar.writerScopeSource
			p.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
				// Observe only this actual request's incoming producer interval. These
				// raw snapshots neither dispatch a publisher nor manufacture a phase.
				var before sourceStagedDeclarationScopeParent
				beforeOK := false
				if r.member != nil && r.member.publisher != nil {
					before, beforeOK = work.declarationWriterScopeNativeSource(q, r)
				}
				beforeIssued := beforeOK && before.issuer != nil && before.issuer.issued
				var beforeRequired []sourceStagedOperationRequest
				beforeUnsealed := false
				if beforeOK && before.source != nil {
					getRecipe := work.operationRecipes[nativeRootDebtRequest(before.source, "callee-get").producer]
					beforeRequired = append(beforeRequired, getRecipe.delta.required...)
					beforeUnsealed = !getRecipe.delta.extracted
					if before.id.index != 0 {
						beforeUnsealed = beforeUnsealed && !work.operations[before.id.index].delta.extracted
					}
				}
				original(q, r)
				if declarationWriterScopeReading(r) {
					after, afterOK := work.declarationWriterScopeNativeSource(q, r)
					if !afterOK || !work.declarationScopeParentOwned(q, after, work.operationIDs[r.writerSourceReading.producer], r.writerSourceReading) {
						t.Fatal("actual scope producer interval did not retain its original root")
					}
					if after.issuer != nil {
						issuers = append(issuers, after.issuer)
					}
					// Both timing witnesses belong to the same original source and
					// physical parent, rather than unrelated scope requests.
					parentCall := after.request.producer.operation
					if r.call != nil && ast.IsCallExpression(r.call) && r.call.Pos() == 1946 && parentCall != nil && ast.IsCallExpression(parentCall) && parentCall.Pos() == 2283 && ast.GetSourceFileOfNode(r.call) != nil && ast.GetSourceFileOfNode(r.call) == ast.GetSourceFileOfNode(parentCall) && ast.GetSourceFileOfNode(r.call).FileName() == filepath.Join(fixture.root, "component-abi", "opaque-operation.ts") && beforeOK && sameOperationRequest(before.request, after.request) {
						if timingParent.producer.operation == nil {
							timingSource, timingParent, timingGeneration = r.writerSourceReading, after.request, work.operationGeneration
						}
						if sameOperationRequest(timingSource, r.writerSourceReading) && sameOperationRequest(timingParent, after.request) && timingGeneration == work.operationGeneration {
							if before.source == nil && after.issuer != nil && operationContainsRequest(after.issuer.scopePending, r.writerSourceReading) {
								preselection = true
							}
							if beforeIssued && beforeUnsealed && !operationContainsRequest(beforeRequired, r.writerSourceReading) && after.source != nil {
								getRecipe := work.operationRecipes[nativeRootDebtRequest(after.source, "callee-get").producer]
								lateUnsealed = lateUnsealed || operationContainsRequest(getRecipe.delta.required, r.writerSourceReading)
							}
						}
					}
				}
				if r.call.Pos() != 1946 || !declarationWriterScopeReading(r) {
					return
				}
				if !work.declarationWriterScopePublisher(facts, owner, p, q, r) {
					t.Fatal("original live publisher scope authentication refused")
				}
				parent, ok := work.declarationWriterScopeNativeSource(q, r)
				id := work.operationIDs[r.writerSourceReading.producer]
				if !ok || !work.declarationScopeParentOwned(q, parent, id, r.writerSourceReading) {
					t.Fatal("original Get/source requirement continuation missing")
				}
				if q.initializing == parent.request.use || r.original[1] != q.initializing {
					t.Fatal("genuine nested semantic cut UNREACHED")
				}
				sourceRequest, parentRequest, publisher = r.writerSource, parent.request, p
				adopted = true
				recipe := work.operationRecipes[r.writerSource.producer]
				state := &work.operations[id.index]
				sub := state.subscribers[sourceStagedOperationConsumer{r.writerSourceReading.consumer, r.writerSourceReading.edge}]
				if !work.nativeObserverProducerCurrent(recipe) || state.revision == 0 || sub == nil || sub.blocked || sub.consumed != state.revision || sub.applied != state.revision {
					return
				}
				// Every refusal below follows real current source/root delivery in this
				// original publisher callback, rather than an upstream pending refusal.
				// No physical reader was substituted after this actual adoption.
				if r.writerSourceReading.reading != (sourceStagedOperationKey{}) || !sameOperationRequest(r.writerSourceReading, r.writerSource) {
					t.Fatal("scope reader became physical C")
				}
				copied := *r
				if declarationWriterScopeReading(&copied) || work.consumeDeclarationWriterScope(q, &copied) != (sourceStagedWriterCallDisposition{}) {
					t.Fatal("copied synchronous request accepted")
				}
				copyRefused = true
				wrong := r.writerSource
				wrong.cut.initializing = r.original[1]
				if _, current := work.currentEnrolledNativeObserverProducer(facts, q, r.call, wrong); current {
					t.Fatal("foreign source-root cut accepted")
				}
				cutRefused = true
				if owner.pendingMemberPublishers[r.consumer].workRegistrar == nil {
					t.Fatal("current registrar missing")
				}

				for _, other := range owner.pendingMemberPublishers {
					if other != p {
						foreignPublisherRefused = foreignPublisherRefused || !work.declarationWriterScopePublisher(facts, owner, other, q, r)
					}
				}

			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if !preselection || !lateUnsealed {
			t.Fatalf("actual preselection/unsealed finishing-tail scope transfer UNREACHED: preselection=%t lateUnsealed=%t", preselection, lateUnsealed)
		}
		if !adopted {
			t.Fatal("original nested1946 SOURCE scope adoption UNREACHED")
		}
		if !copyRefused || !cutRefused || !foreignPublisherRefused {
			t.Fatal("original scope refusal controls UNREACHED")
		}
		recipe := work.operationRecipes[sourceRequest.producer]
		if !work.nativeObserverProducerCurrent(recipe) {
			t.Fatal("original complete standard-only scope source CURRENT UNREACHED")
		}
		id := work.operationIDs[sourceRequest.producer]
		state := &work.operations[id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{sourceRequest.consumer, sourceRequest.edge}]
		if state.invalid || !state.delta.extracted || state.revision == 0 || sub == nil || sub.blocked || !sameOperationRequest(sub.request, sourceRequest) || sub.consumed != state.revision || sub.applied != state.revision {
			t.Fatal("original root-use scope delivery/APPLIED UNREACHED")
		}
		parent := work.operationRecipes[parentRequest.producer]
		getRequest := nativeRootDebtRequest(parent.nativeGet, "callee-get")
		getID := work.operationIDs[getRequest.producer]
		if !work.declarationWriterScopeDependency(getID, id, sourceRequest) || !work.nativeEffectsGetCurrent(parent.nativeGet) {
			t.Fatal("original native Get requirement/fresh CURRENT UNREACHED")
		}
		if !work.closedOperationDependencies()[getID.index] {
			t.Fatal("original native Get/source dependency closure UNREACHED")
		}
		foreign := recipe
		foreign.memberSource = cloneStagedMemberSource(recipe.memberSource)
		foreign.memberSource.generation = nil
		if work.nativeObserverProducerCurrent(foreign) {
			t.Fatal("foreign source generation accepted")
		}
		// A detached mixed or pending description cannot inherit the observed
		// native-only source disposition, even with the same key and generation.
		var authored *ast.Node
		for _, fact := range facts {
			walkNode(fact.node, func(n *ast.Node) bool {
				if ast.IsArrowFunction(n) && len(n.Parameters()) == 0 {
					authored = n
				}
				return true
			})
		}
		if authored == nil {
			t.Fatal("original authored alternate UNREACHED")
		}
		mixed := recipe
		mixed.memberSource = cloneStagedMemberSource(recipe.memberSource)
		mixed.memberSource.call.values = []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: authored, producer: recipe.key.operation, cut: recipe.memberSource.candidate.cut}}}
		mixed.memberSource.call.mapped = []bool{true}
		if !validStagedMemberCallRecipe(mixed) {
			t.Fatal("genuine-source mixed description boundary UNREACHED")
		}
		if work.nativeObserverProducerCurrent(mixed) {
			t.Fatal("mixed authored source supplied native-only scope")
		}
		pending := mixed
		pending.memberSource = cloneStagedMemberSource(mixed.memberSource)
		pending.memberSource.call.complete = false
		pending.delta = cloneOperationDelta(mixed.delta)
		pending.delta.extracted = false
		if !validStagedMemberCallRecipe(pending) || work.nativeObserverProducerCurrent(pending) {
			t.Fatal("pending source description supplied current scope")
		}
		// New work owns fresh observations and readers, even from genuine clones.
		cloned := make([]callableFacts, len(facts))
		for i := range facts {
			cloned[i] = cloneProjectCallableFact(facts[i])
		}
		cloneWork := registerCallableEffectWork(cloned)
		if cloneWork.nativeObserverProducerCurrent(cloneWork.operationRecipes[sourceRequest.producer]) {
			t.Fatal("clone supplied current original source")
		}
		// An unissued child cannot grow this genuine completed Get's prefix.
		unissued := sourceRequest
		unissued.edge += ":unissued-declaration-scope"
		if !work.declarationWriterScopeRequirementAllowed(getID, sourceRequest) || work.declarationWriterScopeRequirementAllowed(getID, unissued) {
			t.Fatal("observed Get scope allowed missing child or refused exact declared child")
		}
		foreignParent := getID
		foreignParent.epoch = nil
		if work.declarationWriterScopeRequirementAllowed(foreignParent, sourceRequest) {
			t.Fatal("foreign Get epoch accepted scope requirement")
		}
		// The original physical Get factory remains exact; no scope clause broadens it.
		found := false
		for _, required := range work.operationRecipes[getRequest.producer].delta.required {
			c := work.operationRecipes[required.producer]
			if c.memberSource == nil || c.memberSource.coverage == nil {
				continue
			}
			observer := c.memberSource.coverage.nativeObserver
			if !sameOperationRequest(observer.request, parentRequest) {
				continue
			}
			if !validNativeObserverCoverage(c.memberSource) || observer.cut.initializing != parentRequest.use {
				t.Fatal("original physical cut factory changed")
			}
			found = true
		}
		if !found {
			t.Fatal("original physical C preservation UNREACHED")
		}
		// The genuine nested registry API carries no work capability unless its
		// caller supplies the current work. Check this after positive resolution,
		// outside the source callback, then restore the original publisher.
		restore := registerWriterInputFacts(owner, facts)
		nested := owner.pendingMemberPublishers[sourceRequest.consumer]
		noWorkRefused = nested != nil && nested.workRegistrar == nil
		restore()
		if !noWorkRefused {
			t.Fatal("no-work registry installed a scope capability")
		}

		t.Log("genuine nested SOURCE root-use/current/APPLIED and original native Get CURRENT/closure reached")
	}, activeModuleCompleteAnalysis)
	if publisher == nil {
		t.Fatal("original scope publisher UNREACHED")
	}
	for _, issuer := range issuers {
		if issuer.live() || len(issuer.scopePending) != 0 {
			t.Fatal("released native issuer retained SOURCE pending authority")
		}
	}
	if publisher.live || publisher.fact != nil || publisher.workRegistrar != nil {
		t.Fatal("released publisher retained scope registration authority")
	}
}
