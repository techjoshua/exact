package exactcompiler

import (
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// legacyNativeWriterSourceLookup preserves the previous lookup as a test oracle.
// It reads the genuine collected graph; it never installs a source or receipt.
func legacyNativeWriterSourceLookup(work *callableEffectWork, call *ast.Node) (sourceStagedOperationRecipe, bool) {
	if call == nil || !ast.IsCallExpression(call) || !ast.IsPropertyAccessExpression(call.Expression()) {
		return sourceStagedOperationRecipe{}, false
	}
	owner := stagedNativeInputInvocationOwner(call)
	for _, recipe := range work.operationRecipes {
		if nativeWriterSourceRequested(recipe) && recipe.key.declaration == owner && recipe.key.operation == call && work.writerSourceLocallyReady(recipe) {
			return recipe, true
		}
	}
	return sourceStagedOperationRecipe{}, false
}

// The original collector must supply the canonical wrapper and its actual
// selected-child CURRENT/APPLIED before lookup and lifecycle controls qualify.
// No final resolver, unrelated pending-zero requirement or synthetic source is used.
func TestStagedNativeWriterCanonicalLookupOriginalSource(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	var released *callableEffectWork
	var original *ast.Node
	withActiveModuleSourceWork(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		registered, pending, current := 0, 0, 0
		var selected sourceStagedOperationRecipe
		for key, recipe := range work.operationRecipes {
			if !nativeWriterSourceRequested(recipe) {
				continue
			}
			registered++
			if !validStagedMemberCallRecipe(recipe) {
				t.Fatal("original native wrapper description invalid")
			}
			call := key.operation
			expected := sourceStagedOperationKey{declaration: stagedNativeInputInvocationOwner(call), operation: call, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: call.Expression(), field: "native-input-source-request"}}
			if key != expected || recipe.key != key || work.operationRecipes[expected].memberSource != recipe.memberSource {
				t.Fatal("authentic native wrapper lacks canonical original-call key")
			}
			legacy, oldCurrent := legacyNativeWriterSourceLookup(work, call)
			actual, newCurrent := work.currentNativeWriterSourceRequest(call)
			if oldCurrent != newCurrent || oldCurrent && (legacy.key != actual.key || legacy.memberSource != actual.memberSource) {
				t.Fatal("canonical lookup differs from original graph scan")
			}
			if !oldCurrent {
				pending++
				if actual.key != (sourceStagedOperationKey{}) || actual.memberSource != nil {
					t.Fatal("refused lookup changed its zero-value result")
				}
				continue
			}
			current++
			if selected.memberSource == nil {
				selected = actual
			}
		}
		if registered == 0 || current == 0 {
			t.Fatalf("genuine original native wrapper CURRENT lookup entry UNREACHED registered=%d pending=%d current=%d", registered, pending, current)
		}
		call := selected.key.operation
		refuse := func(label string, node *ast.Node) {
			t.Helper()
			legacy, before := legacyNativeWriterSourceLookup(work, node)
			actual, after := work.currentNativeWriterSourceRequest(node)
			if before || after || legacy.key != (sourceStagedOperationKey{}) || actual.key != (sourceStagedOperationKey{}) {
				t.Fatal(label, "acquired a source or changed the refused result")
			}
		}
		refuse("nil Call", nil)
		refuse("non-Call original Get", call.Expression())
		absent := 0
		file := owner.values.program.GetSourceFile(request.ID)
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if absent != 0 || !ast.IsCallExpression(node) || !ast.IsPropertyAccessExpression(node.Expression()) {
				return true
			}
			key := sourceStagedOperationKey{declaration: stagedNativeInputInvocationOwner(node), operation: node, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: node.Expression(), field: "native-input-source-request"}}
			if _, exists := work.operationRecipes[key]; !exists {
				refuse("different original Call without wrapper", node)
				absent++
			}
			return true
		})
		if absent == 0 {
			t.Fatal("original unregistered Call refusal entry UNREACHED")
		}
		// Detached malformed descriptions cannot supply canonical currentness.
		copy := selected
		copy.memberSource = cloneStagedMemberSource(selected.memberSource)
		if work.nativeWriterSourceRequestCurrent(copy) {
			t.Fatal("detached source copy inherited canonical source currentness")
		}
		copy.key.declaration = call.Expression()
		if validStagedMemberCallRecipe(copy) {
			t.Fatal("foreign owner accepted the original wrapper")
		}
		copy.key = selected.key
		copy.key.selector.field = "descriptor-callee-source-request"
		if validStagedMemberCallRecipe(copy) {
			t.Fatal("different factory key accepted the original wrapper")
		}
		copy.key = selected.key
		copy.memberSource.call.sourceRequest.nativeInput = false
		if validStagedMemberCallRecipe(copy) {
			t.Fatal("native wrapper borrowed the constructed source role")
		}
		// Remove only authentic rights and restore their exact saved values.
		without := func(label string, remove func() func()) {
			t.Helper()
			restore := remove()
			defer restore()
			refuse(label, call)
		}
		without("missing canonical registration", func() func() {
			delete(work.operationRecipes, selected.key)
			return func() { work.operationRecipes[selected.key] = selected }
		})
		without("unobserved source", func() func() {
			observed := work.memberCoverageObserved[selected.key]
			delete(work.memberCoverageObserved, selected.key)
			return func() { work.memberCoverageObserved[selected.key] = observed }
		})
		required := selected.memberSource.call.sourceRequest.required
		if len(required) != 3 {
			t.Fatal("genuine original Call/Get/invocation children UNREACHED")
		}
		child := required[2]
		id := work.operationIDs[child.producer]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			t.Fatal("actual selected invocation child adoption UNREACHED")
		}
		state := &work.operations[id.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{child.consumer, child.edge}]
		if subscriber == nil || subscriber.applied == 0 || subscriber.applied != state.revision {
			t.Fatal("actual selected invocation child APPLIED UNREACHED")
		}
		without("unpaid selected child", func() func() {
			applied := subscriber.applied
			subscriber.applied = 0
			return func() { subscriber.applied = applied }
		})
		without("no current epoch", func() func() {
			epoch := work.operationEpoch
			work.operationEpoch = nil
			return func() { work.operationEpoch = epoch }
		})
		generation := work.operationGeneration
		without("no current generation", func() func() {
			work.operationGeneration = nil
			return func() { work.operationGeneration = generation }
		})
		if _, restored := work.currentNativeWriterSourceRequest(call); !restored {
			t.Fatal("restored original receipts lost canonical currentness")
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		fresh.indexOperationSources(clones)
		fresh.operationGeneration = generation
		if _, inherited := fresh.currentNativeWriterSourceRequest(call); inherited {
			t.Fatal("source clone inherited original source/Get/APPLIED rights")
		}
		released, original = work, call
		t.Logf("original native wrappers=%d pending=%d current=%d; canonical identity, original selected child/APPLIED and lifecycle refusers reached", registered, pending, current)
	}, activeModuleBeforeResolution)
	if released == nil || original == nil {
		t.Fatal("genuine current lookup before generation release UNREACHED")
	}
	if _, current := released.currentNativeWriterSourceRequest(original); current {
		t.Fatal("released generation retained source currentness")
	}
}
