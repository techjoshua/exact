package exactcompiler

import (
	"context"
	"path/filepath"
	"slices"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The maintained original driver supplies all Gets, publisher callbacks, source
// tasks and APPLIED deliveries. Setup observes only the actual registrar; it
// never invokes it, rewrites a query, adopts a manufactured task or pays an ACK.
// Its timing/entry eligibility is deliberately unknown until qualification; an
// earlier strict gap or missing genuine2202 source event is a failing gate.
func TestStagedNativeGetScopeOriginalSource(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	var root, parent sourceStagedOperationRequest
	var publisher *sourcePendingMemberPublisher
	var issued *sourceWriterInputRequest
	reached := false
	withActiveModuleSourceWorkSetup(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, p := range owner.pendingMemberPublishers {
			p := p
			if p.workRegistrar == nil || p.workRegistrar.writerScopeSource == nil {
				t.Fatal("actual source registrar missing")
			}
			original := p.workRegistrar.writerScopeSource
			p.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
				original(q, r)
				file := ast.GetSourceFileOfNode(r.call)
				if r.call.Pos() != 1946 || file == nil || file.FileName() != filepath.Join(fixture.root, "component-abi", "opaque-operation.ts") || !declarationWriterScopeReading(r) {
					return
				}
				context, owned := work.declarationWriterScopeNativeSource(q, r)
				if !owned || context.request.producer.operation.Pos() != 2202 || ast.GetSourceFileOfNode(context.request.producer.operation) != file || context.issuer != nil {
					return
				}
				if !work.declarationWriterScopePublisher(facts, owner, p, q, r) {
					t.Fatal("actual source-only publisher refused")
				}
				root, parent, publisher, issued = r.writerSourceReading, context.request, p, r
				reached = true
			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if !reached {
			t.Fatal("actual source-only2202/1946 ROOT connection UNREACHED")
		}
		source := work.operationRecipes[parent.producer].nativeGet
		if source == nil || !sameOperationRequest(source.request, parent) {
			t.Fatal("actual selected2202 source UNREACHED")
		}
		getRequest := nativeRootDebtRequest(source, "callee-get")
		id := work.operationIDs[getRequest.producer]
		if work.nativeScopeGetSource(id) == nil || !work.nativeScopeRootCurrent(root) {
			t.Fatal("actual SOURCE ROOT CURRENT/APPLIED or owning Get source UNREACHED")
		}
		observation := work.operations[id.index].nativeScopeObserved
		if !work.nativeScopeObservedCurrent(id, observation) || !work.nativeEffectsGetCurrent(source) {
			t.Fatal("actual fresh SOURCE Get observation/CURRENT UNREACHED")
		}
		rootID := work.operationIDs[root.producer]
		if !work.declarationWriterScopeDependency(id, rootID, root) || !operationContainsRequest(observation.required, root) || !operationContainsRequest(work.operationRecipes[getRequest.producer].delta.required, root) {
			t.Fatal("original2202 Get lacks exact1946 ROOT subscriber/required membership")
		}
		closed := work.closedOperationDependencies()
		if !closed[id.index] || !closed[rootID.index] {
			t.Fatal("original SOURCE ROOT/Get closure UNREACHED")
		}
		// A separate graph-slot SOURCE observation must have come from a real
		// Get-only finishing event: the ordinary Effects owner never writes it.
		// Existing full Call/input/descriptor laws remain separate prerequisites.
		if observation.self != observation || observation.id != id || observation.generation != work.operationGeneration || !sameOperationRequest(observation.request, getRequest) {
			t.Fatal("original Get observation header lost")
		}
		savedRequired := append([]sourceStagedOperationRequest(nil), observation.required...)
		savedRevisions := append([]uint64(nil), observation.revisions...)
		if !work.nativeScopeGetCurrent(id) || work.operations[id.index].nativeScopeObserved != observation || !slices.Equal(savedRevisions, observation.revisions) || !operationPrefix(savedRequired, observation.required, sameOperationRequest) || !operationPrefix(observation.required, savedRequired, sameOperationRequest) {
			t.Fatal("current check mutated original observation")
		}
		if work.nativeScopeGetTaskOwned(id) {
			t.Fatal("paid unchanged Get subscribers retained false compiler-pending ownership")
		}
		// Every refusal follows the genuine current/full-closure positive above.
		copied := *observation
		if work.nativeScopeObservedCurrent(id, &copied) {
			t.Fatal("copied original Get observation accepted")
		}
		foreign := id
		foreign.epoch = nil
		if work.nativeScopeGetCurrent(foreign) || work.nativeScopeObservedCurrent(foreign, observation) || work.nativeScopeGetTaskOwned(foreign) {
			t.Fatal("foreign Get epoch accepted")
		}
		if work.nativeScopeGetRequested(rootID) || work.nativeScopeGetSource(rootID) != nil {
			t.Fatal("SOURCE child impersonated its original Get owner")
		}
		fullCall := work.operationIDs[parent.producer]
		if work.nativeScopeGetRequested(fullCall) || work.nativeScopeGetTaskSource(fullCall) != nil {
			t.Fatal("Get continuation became full Call law")
		}
		wrongCut := root
		wrongCut.cut.initializing = parent.use
		if work.nativeScopeRootOwned(wrongCut, parent) {
			t.Fatal("foreign semantic ROOT cut accepted")
		}
		wrongEdge := root
		wrongEdge.edge += ":unissued"
		if work.declarationWriterScopeRequirementAllowed(id, wrongEdge) {
			t.Fatal("sealed Get accepted missing ROOT child")
		}
		if !work.declarationWriterScopeRequirementAllowed(id, root) {
			t.Fatal("sealed Get refused exact existing ROOT")
		}
		cloned := make([]callableFacts, len(facts))
		for i := range facts {
			cloned[i] = cloneProjectCallableFact(facts[i])
		}
		cloneWork := registerCallableEffectWork(cloned)
		if cloneWork.nativeScopeGetCurrent(id) || cloneWork.nativeScopeObservedCurrent(id, observation) {
			t.Fatal("new graph inherited old Get observation")
		}
		// Advance through the real project API; no generation flag or receipt is
		// edited. The old observation cannot certify the newly selected program.
		next, err := owner.project.advance(context.Background(), request.ID, request.Source+"\n")
		if err != nil {
			t.Fatal(err)
		}
		defer next.release()
		if work.nativeScopeGetCurrent(id) || work.nativeScopeObservedCurrent(id, observation) || work.nativeScopeGetTaskOwned(id) {
			t.Fatal("expired generation retained original Get observation or continuation")
		}
		t.Log("actual original2202 source-only Get/root CURRENT+APPLIED+closure and lifetime/fullcut/seal/copy/generation refusers reached")
	}, activeModuleCompleteAnalysis)
	if publisher == nil || publisher.live || publisher.fact != nil || publisher.workRegistrar != nil {
		t.Fatal("released publisher retained source callback")
	}
	if issued == nil || issued.live || issued.issuer != nil {
		t.Fatal("original SOURCE request outlived its publisher interval")
	}
}
