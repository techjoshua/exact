package exactcompiler

import "testing"

// The original selected literal owner publishes after writer traversal. A copied
// source proof survives cloning descriptively but cannot settle a fresh graph
// until that graph receives the original live observation again.
func TestStagedMapWriterDispositionOriginalOwner(t *testing.T) {
	withStagedMapProtocolWorkSource(t, `export function invoke(){return Object.defineProperties({},{run:{value:1}})}`, func(query *sourceValueQuery, source *sourceStagedNativeGetSource, work *callableEffectWork, facts []callableFacts) {
		main := source.descriptorMap.protocol
		id, ok := work.requireOperation(facts, main)
		if !ok {
			t.Fatal("original membership")
		}
		work.prepareStagedDescriptorMapSource(facts, id, query.executable)
		request := stagedMapProtocolPhaseRequest(source, "own-writers")
		recipe := work.operationRecipes[request.producer]
		if recipe.mapProtocol == nil || recipe.mapProtocol.writerSource == nil || !recipe.delta.extracted || !validStagedMapProtocolRecipe(recipe) {
			t.Fatal("original post-writer source disposition missing")
		}
		work.prepareOperationUses(facts, query.executable)
		own := work.operationIDs[request.producer]
		closed := work.closedOperationDependencies()
		if !closed[own.index] {
			t.Fatal("original own-writers source children did not close through their required producers")
		}
		callee := nativeRootDebtRequest(source, "callee-get")
		calleeID, calleeIssued := work.operationIDs[callee.producer]
		if !calleeIssued || !closed[calleeID.index] || work.operations[calleeID.index].nativeCallee == nil || !validStagedNativeCalleeEffects(*work.operations[calleeID.index].nativeCallee, source) {
			t.Fatal("enum source closure omitted its original selected callee Get")
		}
		firstCallee := work.operations[calleeID.index].nativeCallee
		// The quiet map may now close completely. A remaining target/field
		// prerequisite still cannot be paid by the writer disposition alone.
		target := stagedMapProtocolPhaseRequest(source, "target")
		targetID, targetIssued := work.operationIDs[target.producer]
		pending := !targetIssued || !closed[targetID.index]
		for _, entry := range work.operationRecipes[main.producer].mapProtocol.entries {
			entryRequest, valid := stagedMapEntryRequest(source, entry)
			if !valid {
				t.Fatal("original entry request missing")
			}
			for _, child := range work.operationRecipes[entryRequest.producer].delta.required {
				childID, issued := work.operationIDs[child.producer]
				pending = pending || !issued || !closed[childID.index]
			}
		}
		if closed[id.index] == pending {
			t.Fatal("map completion did not preserve its actual remaining target/field prerequisites")
		}
		if work.publishStagedMapWriterDisposition(facts, query, source) {
			t.Fatal("revoked original observation published")
		}
		cloned := make([]callableFacts, len(facts))
		for i, fact := range facts {
			cloned[i] = cloneProjectCallableFact(fact)
		}
		fresh := registerCallableEffectWork(cloned)
		fresh.operationGeneration = work.operationGeneration
		freshID, ok := fresh.requireOperation(cloned, request)
		if !ok {
			t.Fatal("cloned source role")
		}
		fresh.publishOperation(freshID, recipe.delta)
		if fresh.closedOperationDependencies()[freshID.index] {
			t.Fatal("cached proof supplied graph-local observation")
		}
		mainID, ok := fresh.requireOperation(cloned, main)
		if !ok {
			t.Fatal("fresh original map")
		}
		fresh.prepareStagedDescriptorMapSource(cloned, mainID, query.executable)
		fresh.prepareOperationUses(cloned, query.executable)
		freshCallee, reissued := fresh.operationIDs[callee.producer]
		if !reissued || fresh.operations[freshCallee.index].nativeCallee == nil || fresh.operations[freshCallee.index].nativeCallee == firstCallee || !fresh.operations[freshCallee.index].calleeSourceRequested || !validStagedNativeCalleeEffects(*fresh.operations[freshCallee.index].nativeCallee, source) || !fresh.closedOperationDependencies()[freshCallee.index] {
			t.Fatal("clone did not reissue and consume its original callee Get producer")
		}
		if !fresh.closedOperationDependencies()[freshID.index] {
			t.Fatal("fresh original observation not consumed")
		}
		fresh.operationGeneration = &projectGeneration{}
		if fresh.closedOperationDependencies()[freshID.index] {
			t.Fatal("expired source observation")
		}
	})
}
