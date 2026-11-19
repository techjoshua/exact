package exactcompiler

import (
	"context"
	"path/filepath"
	"slices"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original fixture must reach the genuine2085 preparation/1946 source demand
// without a physical Get/read loan. No request/query/ACK or selection is forged.
// The protected public Session/Node test remains separate terminal acceptance.
func TestStagedGenericGetPreparationOriginalSource(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")

	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	var root, preparation sourceStagedOperationRequest
	var issued *sourceWriterInputRequest
	var borrow *sourceStagedGetPreparationBorrow
	var query *sourceValueQuery
	var publisher *sourcePendingMemberPublisher
	sawBeforeGet, sawPending := false, false
	withActiveModuleSourceWorkSetup(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, p := range owner.pendingMemberPublishers {
			p := p
			if p.workRegistrar == nil || p.workRegistrar.writerScopeSource == nil {
				t.Fatal("original source registrar absent")
			}
			original := p.workRegistrar.writerScopeSource
			p.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
				original(q, r)
				if q == nil || r == nil || r.call == nil || r.call.Pos() != 1946 || (ast.GetSourceFileOfNode(r.call) == nil || ast.GetSourceFileOfNode(r.call).FileName() != filepath.Join(fixture.root, "component-abi", "opaque-operation.ts")) || q.stagedNativeGet != nil || q.stagedMember == nil || !declarationWriterScopeReading(r) {
					return
				}
				b := q.stagedMember.getPreparation
				if b == nil || b.request.producer.operation.Pos() != 2085 || !ast.IsPropertyAccessExpression(b.request.producer.operation) || q.stagedMember.get != nil || q.stagedMember.read != nil {
					return
				}
				if !b.live(q) || b.work != work || !work.declarationWriterScopePublisher(facts, owner, p, q, r) {
					t.Fatal("authentic pre-Get source issuer refused")
				}
				if !work.declarationWriterScopeDependency(b.id, work.operationIDs[r.writerSourceReading.producer], r.writerSourceReading) {
					t.Fatal("actual queued preparation lacks real ROOT dependency/backref")
				}
				root, preparation, issued, borrow, query, publisher = r.writerSourceReading, stagedGetPreparationRequest(b.request), r, b, q, p
				sawBeforeGet = true
				sawPending = sawPending || !work.getPreparationCurrent(preparation) && work.getPreparationTaskOwned(b.id)
			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if !sawBeforeGet {
			t.Fatal("genuine original2085 pre-Get preparation/1946 ROOT handoff UNREACHED")
		}
		if !sawPending {
			t.Fatal("genuine pending pre-Get preparation continuation UNREACHED")
		}
		id := work.operationIDs[preparation.producer]
		source := work.getPreparationTaskSource(id)
		if source == nil || !validStagedGetPreparationRecipe(work.operationRecipes[preparation.producer]) || !work.getPreparationReadingCurrent(preparation) || !work.nativeScopeRootCurrent(root) {
			t.Fatal("actual preparation/ROOT current+APPLIED UNREACHED")
		}
		observation := work.operations[id.index].getPreparationObserved
		if observation == nil || !operationContainsRequest(observation.required, root) || !work.getPreparationObservedCurrent(id, observation) {
			t.Fatal("genuine source-preparation semantic observation UNREACHED")
		}
		caller := work.memberNodes[root.consumer]
		rootRecipe := work.operationRecipes[root.producer]
		if !work.nativeObserverProducerCurrent(rootRecipe) || !work.nativeObserverConstructedSourcesCurrent(facts, caller, rootRecipe, owner) {
			t.Fatal("actual standard-only SOURCE population/current law UNREACHED")
		}
		getKey := stagedMemberGetEffectsKey(source.parent)
		getRecipe := work.operationRecipes[getKey]
		if !validStagedMemberGetEffectsRecipe(getRecipe) || !getRecipe.delta.extracted || !sameOperationRequest(getRecipe.memberSource.getEffects.preparation, preparation) || !operationContainsRequest(getRecipe.delta.required, preparation) {
			t.Fatal("real original Get did not retain exact preparation child")
		}
		getID := work.operationIDs[getKey]
		closed := work.closedOperationDependencies()
		if !closed[id.index] || !closed[work.operationIDs[root.producer].index] || getID.index == 0 || !closed[getID.index] {
			t.Fatal("actual preparation/ROOT/Get closure UNREACHED")
		}
		saved := append([]uint64(nil), observation.revisions...)
		required := cloneOperationDelta(sourceStagedOperationDelta{required: observation.required}).required
		if !work.getPreparationCurrent(preparation) || work.operations[id.index].getPreparationObserved != observation || !slices.Equal(saved, observation.revisions) || !operationPrefix(required, observation.required, sameOperationRequest) || !operationPrefix(observation.required, required, sameOperationRequest) {
			t.Fatal("current check rewrote successful source observation")
		}
		if work.getPreparationTaskOwned(id) {
			t.Fatal("paid unchanged subscribers retained false pending ownership")
		}
		// Refusals follow real CURRENT/APPLIED/Get closure, not a passive factory.
		copied := *observation
		if work.getPreparationObservedCurrent(id, &copied) {
			t.Fatal("copied source observation accepted")
		}
		foreign := id
		foreign.epoch = nil
		if work.getPreparationTaskSource(foreign) != nil || work.getPreparationObservedCurrent(foreign, observation) || work.getPreparationTaskOwned(foreign) {
			t.Fatal("foreign graph identity accepted")
		}
		wrong := preparation
		wrong.cut.initializing = source.parent.use
		if work.getPreparationCurrent(wrong) {
			t.Fatal("foreign preparation cut accepted")
		}
		if work.getPreparationTaskSource(work.operationIDs[root.producer]) != nil || work.nativeScopeGetSource(id) != nil {
			t.Fatal("SOURCE ROOT/preparation/native Get roles conflated")
		}
		if borrow.live(query) {
			t.Fatal("completed original query retained preparation issuer")
		}
		sealed := work.operationRecipes[preparation.producer]
		late := sealed
		late.delta = cloneOperationDelta(late.delta)
		missing := root
		missing.edge += ":unissued"
		late.delta.required = append(late.delta.required, missing)
		revision := work.operations[id.index].revision
		if work.attachOperationSource(facts, late) || work.operations[id.index].revision != revision || !sameOperationRequest(work.operationRecipes[preparation.producer].delta.required[0], sealed.delta.required[0]) {
			t.Fatal("completed preparation accepted late ROOT growth")
		}
		foreignAggregate := getRecipe
		foreignSource := *getRecipe.memberSource
		foreignGet := *foreignSource.getEffects
		foreignGet.preparation.cut.initializing = source.parent.use
		foreignSource.getEffects = &foreignGet
		foreignAggregate.memberSource = &foreignSource
		if validStagedMemberGetEffectsRecipe(foreignAggregate) {
			t.Fatal("Get aggregate accepted foreign preparation association")
		}
		cloned := make([]callableFacts, len(facts))
		for i := range facts {
			cloned[i] = cloneProjectCallableFact(facts[i])
		}
		cloneWork := registerCallableEffectWork(cloned)
		if cloneWork.getPreparationCurrent(preparation) || cloneWork.getPreparationObservedCurrent(id, observation) {
			t.Fatal("new graph inherited old preparation observation")
		}
		next, err := owner.project.advance(context.Background(), request.ID, request.Source+"\n")
		if err != nil {
			t.Fatal(err)
		}
		defer next.release()
		if work.getPreparationCurrent(preparation) || work.getPreparationTaskOwned(id) {
			t.Fatal("expired generation retained source preparation")
		}
		t.Log("actual original2085 preparation before Get/read, pending source preparation, current/APPLIED/Get closure and clone/cut/seal/generation refusers reached")
	}, activeModuleCompleteAnalysis)
	if issued == nil || issued.live || issued.issuer != nil || publisher == nil || publisher.live || publisher.fact != nil || publisher.workRegistrar != nil {
		t.Fatal("released original source request/publisher retained authority")
	}
}
