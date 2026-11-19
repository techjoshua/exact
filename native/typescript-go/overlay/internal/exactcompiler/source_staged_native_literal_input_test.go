package exactcompiler

import (
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Use the unchanged cache fixture and its first canonical collector. Only real
// existing queue dispatch may establish construction/Get/APPLIED authority.
// This local control makes no whole-cache, result-DATA or emitted-code claim.
func TestStagedNativeDescriptorLiteralOriginalInputOwnership(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")

	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	withActiveModuleSourceWork(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		work.prepareOperationUses(facts, owner)
		work.prepareSourceInputConsumers(facts, owner)
		var use *ast.Node
		file := owner.values.program.GetSourceFile(request.ID)
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsIdentifier(node) && node.Pos() == 1637 && node.End() == 1645 {
				use = node
			}
			return true
		})
		parent, input, argument := nativeLiteralInputUse(use)
		if use == nil || parent == nil || argument != 1 {
			t.Fatal("original descriptor-map formal use UNREACHED")
		}
		target := enclosingCallableNode(use)
		index, known := work.memberNodes[target]
		if !known {
			t.Fatal("original formal owner missing")
		}
		var caller, callIndex int
		found := false
		for i := range facts {
			for j, call := range facts[i].staged.calls {
				if call.invocation.operation != nil && call.invocation.operation.Pos() == 2754 && call.invocation.declaration == target {
					if found {
						t.Fatal("ambiguous original input consumer")
					}
					caller, callIndex, found = i, j, true
				}
			}
		}
		if !found {
			t.Fatal("original2754 source-input Call UNREACHED")
		}
		call := facts[caller].staged.calls[callIndex]
		if call.legacyInputs || call.sourceInputs == nil || call.inputs != nil {
			t.Fatal("original descriptor literal input fell back or acquired synthetic binder")
		}
		pending := call.inputConsumerWait != nil
		if !pending {
			t.Fatal("authentic pre-child native input producer wait UNREACHED")
		}
		if pending && work.inputConsumerWaitCurrent(facts, call, owner) {
			t.Fatal("pending wait supplied CURRENT")
		}
		var producer sourceStagedInputConsumerRequirement
		matched := false
		for _, requirement := range call.inputConsumerWait.required {
			if requirement.nativeInputProducer && requirement.owner == target && requirement.use == use && requirement.argument == argument && requirement.formal.kind == relativeRoleFormal && requirement.formal.declaration == target && requirement.formal.slot == 0 && requirement.input.producer.operation == parent {
				producer, matched = requirement, true
			}
		}
		if !matched {
			t.Fatal("wait lacks original formal/use/child-input producer obligation")
		}
		outer := work.operationRecipes[producer.phase.producer].nativeGet
		if outer == nil || outer.kind != sourceNativeObjectFreeze {
			t.Fatal("authentic original outer source owner missing")
		}
		required, current, owned := work.nativeInputConsumer(&facts[index], use, owner)
		if !owned || current || required != producer {
			t.Fatal("pending native input owner lost exact local identity")
		}
		if _, _, owned := work.nativeInputProducerRequirement(&facts[index], use, outer, nil); owned {
			t.Fatal("missing declaration publisher gained pending producer ownership")
		}
		publisher := owner.pendingMemberPublishers[target]
		wasLive := publisher.live
		publisher.live = false
		_, _, closedOwned := work.nativeInputProducerRequirement(&facts[index], use, outer, owner)
		publisher.live = wasLive
		if closedOwned {
			t.Fatal("closed publisher gained pending producer ownership")
		}
		wrongOuter := *outer
		wrongOuter.request.cut.initializing = use
		if _, _, owned := work.nativeInputProducerRequirement(&facts[index], use, &wrongOuter, owner); owned {
			t.Fatal("foreign outer cut gained pending producer ownership")
		}
		beforeClone := make([]callableFacts, len(facts))
		for i := range facts {
			beforeClone[i] = cloneProjectCallableFact(facts[i])
		}
		beforeCloneWork := registerCallableEffectWork(beforeClone)
		if _, _, owned := beforeCloneWork.nativeInputConsumer(&beforeClone[index], use, owner); owned {
			t.Fatal("clone inherited original producer task/pending authority")
		}
		for _, fact := range beforeClone {
			for _, clonedCall := range fact.staged.calls {
				if clonedCall.inputConsumerWait != nil {
					t.Fatal("clone retained original producer wait")
				}
			}
		}
		// The first real propagation initialization and existing dispatcher deliver
		// input construction; no acknowledgement or native observation is invented.
		work.initializePropagation(facts)
		work.prepareOperationUses(facts, owner)
		work.refreshSourceInputConsumerWaits(facts, owner)
		call = facts[caller].staged.calls[callIndex]
		key := sourceStagedOperationKey{declaration: target, operation: parent, kind: relativeDemandEffects}
		source := work.operationRecipes[key].nativeGet
		if source == nil || !work.nativeLiteralInputCurrent(source, input) {
			t.Fatal("original descriptor construction CURRENT/APPLIED UNREACHED")
		}
		if call.legacyInputs || call.inputConsumerWait != nil || !work.sourceInputConsumerCovered(&facts[index], use) {
			t.Fatal("genuine construction did not retire exact original input wait")
		}
		required, current, owned = work.nativeInputConsumer(&facts[index], use, owner)
		if !owned || !current || required != producer {
			t.Fatal("actual child SOURCE/current/APPLIED did not settle original producer requirement")
		}
		work.refreshSourceInputConsumerWaits(facts, owner)
		if facts[caller].staged.calls[callIndex].inputConsumerWait != nil {
			t.Fatal("paid producer demand recreated input wait")
		}
		phase, owned := work.nativeLiteralInputPhase(source, input)
		if !owned || !work.nativeEagerRequiredChild(source.request, phase) {
			t.Fatal("paid original eager phase missing")
		}
		// Negative requests can never supply positive observations. Immutable source
		// and graph clones must reacquire their own exact physical Get authority.
		wrong := *source
		wrong.request.cut.initializing = use
		if work.nativeLiteralInputCurrent(&wrong, input) {
			t.Fatal("foreign cut borrowed construction authority")
		}
		if work.nativeLiteralInputCurrent(source, use) {
			t.Fatal("identifier was treated as original literal input")
		}
		var absent callableEffectWork
		if absent.nativeLiteralInputCurrent(source, input) {
			t.Fatal("absent graph borrowed construction authority")
		}
		cloned := make([]callableFacts, len(facts))
		for i := range facts {
			cloned[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(cloned)
		if fresh.nativeLiteralInputCurrent(source, input) {
			t.Fatal("clone inherited original Get/current authority")
		}
		for _, fact := range cloned {
			for _, clonedCall := range fact.staged.calls {
				if clonedCall.inputConsumerWait != nil {
					t.Fatal("clone retained input wait")
				}
			}
		}
		t.Logf("original2754 authentic pending native input producer -> actual child SOURCE/literal construction current/APPLIED; pending entry=%t", pending)
	}, activeModuleBeforeResolution)
}
