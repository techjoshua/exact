package exactcompiler

import (
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This connection control uses the original receiver/source acquisition. It
// cannot substitute for the unchanged public Session/Node terminal. A missing
// genuine preparation event is UNREACHED, never a registration-only success.
func TestStagedGenericGetPreparationNativeScopeOriginalSource(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")

	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	type connection struct {
		source, preparation sourceStagedOperationRequest
		pending             bool
	}
	connections := make(map[int]connection)
	expected := map[int]bool{2151: false, 2202: true, 2283: false, 2187: false}
	withActiveModuleSourceWorkSetup(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, publisher := range owner.pendingMemberPublishers {
			p := publisher
			if p.workRegistrar == nil || p.workRegistrar.writerScopeSource == nil {
				t.Fatal("original scope registrar absent")
			}
			original := p.workRegistrar.writerScopeSource
			p.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
				original(q, r)
				if q == nil || r == nil || r.call == nil || ast.GetSourceFileOfNode(r.call) == nil || ast.GetSourceFileOfNode(r.call).FileName() != filepath.Join(fixture.root, "component-abi", "opaque-operation.ts") {
					return
				}
				descriptor, relevant := expected[r.call.Pos()]
				if !relevant || q.stagedNativeGet != nil || q.stagedMember == nil || q.stagedMember.get != nil || q.stagedMember.read != nil || !q.stagedMember.getPreparation.live(q) || !declarationWriterScopeReading(r) {
					return
				}
				b := q.stagedMember.getPreparation
				recipe := work.operationRecipes[r.writerSource.producer]
				if q.stagedMember.get != nil || q.stagedMember.read != nil || !nativeWriterScopeRequested(recipe) || descriptorCalleeRequested(recipe) != descriptor || !work.declarationWriterScopePublisher(facts, owner, p, q, r) {
					t.Fatal("native scope request borrowed a physical Get or wrong role")
				}
				prep := stagedGetPreparationRequest(b.request)
				declared := work.operationRecipes[prep.producer]
				if !validStagedGetPreparationRecipe(declared) || !work.getPreparationSourceRegistered(declared.memberSource, r.writerSource) || !work.declarationWriterScopeDependency(b.id, work.operationIDs[r.writerSource.producer], r.writerSource) {
					t.Fatal("native scope debt lacks exact real factory/member/subscriber")
				}
				pending := !work.getPreparationChildCurrent(r.writerSource)
				if pending && (!work.writerSourceTaskOwned(work.operationIDs[r.writerSource.producer]) || !work.getPreparationTaskOwned(b.id)) {
					t.Fatal("pending native preparation has no real source/parent continuation")
				}
				previous := connections[r.call.Pos()]
				connections[r.call.Pos()] = connection{r.writerSource, prep, previous.pending || pending}
			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, pos := range []int{2151, 2202, 2283, 2187} {
			descriptor := expected[pos]
			c, reached := connections[pos]
			if !reached {
				t.Fatalf("original native%d preparation scope handoff UNREACHED", pos)
			}
			t.Logf("original native%d pending continuation observed=%t", pos, c.pending)
			recipe := work.operationRecipes[c.source.producer]
			preparation := work.operationRecipes[c.preparation.producer]
			if !work.getPreparationReadingCurrent(c.preparation) || !work.getPreparationSourceRegistered(preparation.memberSource, c.source) || !work.getPreparationChildCurrent(c.source) || !work.nativeWriterSourceInvocationApplied(c.source) {
				t.Fatalf("original native%d actual source/preparation CURRENT+APPLIED UNREACHED", pos)
			}
			if descriptor {
				if !work.descriptorCalleeCurrent(recipe) || work.nativeObserverProducerCurrent(recipe) {
					t.Fatal("descriptor callee component became a whole-Call scope law")
				}
			} else if !work.nativeWriterSourceRequestCurrent(recipe) {
				t.Fatal("native input request lost genuine selected invocation child")
			}
			id := work.operationIDs[c.preparation.producer]
			observation := work.operations[id.index].getPreparationObserved
			if observation == nil || !operationContainsRequest(observation.required, c.source) {
				t.Fatal("successful preparation omitted source semantic readset")
			}
			// Refusals follow actual current/delivery, with detached copied recipes only.
			copied := cloneStagedMemberSource(preparation.memberSource)
			if copied == preparation.memberSource || copied.getPreparation == preparation.memberSource.getPreparation {
				t.Fatal("clone retained mutable preparation description")
			}
			if len(copied.getPreparation.native) == 0 {
				t.Fatal("native source metadata absent")
			}
			removed := preparation
			removed.memberSource = cloneStagedMemberSource(preparation.memberSource)
			removed.memberSource.getPreparation.native = nil
			if validStagedGetPreparationRecipe(removed) {
				t.Fatal("native child accepted without role/factory metadata")
			}
			wrong := preparation
			wrong.memberSource = cloneStagedMemberSource(preparation.memberSource)
			for i := range wrong.memberSource.getPreparation.native {
				if sameOperationRequest(wrong.memberSource.getPreparation.native[i].request(), c.source) {
					wrong.memberSource.getPreparation.native[i].descriptor = !descriptor
				}
			}
			if validStagedGetPreparationRecipe(wrong) {
				t.Fatal("foreign native scope role accepted")
			}
			wrong = preparation
			wrong.memberSource = cloneStagedMemberSource(preparation.memberSource)
			for i := range wrong.memberSource.getPreparation.native {
				if sameOperationRequest(wrong.memberSource.getPreparation.native[i].request(), c.source) {
					wrong.memberSource.getPreparation.native[i].parent.cut.initializing = c.source.producer.operation
				}
			}
			if validStagedGetPreparationRecipe(wrong) {
				t.Fatal("foreign native source cut accepted")
			}
			duplicate := *observation
			if work.getPreparationObservedCurrent(id, &duplicate) {
				t.Fatal("copied native preparation observation accepted")
			}
		}
	})
}
