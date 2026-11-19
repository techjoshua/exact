package exactcompiler

import (
	"path/filepath"
	"testing"
)

// Keep the original C's pending reading across selected-description arrival.
// The real canonical collector owns every source event; this callback owns only
// its FIRST normal resolve, after witnessing the original incomplete order.
func TestStagedNativeWriterRetainedReaderOriginalSource(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")

	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	var released *callableEffectWork
	var releasedRecipe sourceStagedOperationRecipe
	withActiveModuleSourceWork(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		var initial sourceStagedOperationRecipe
		for key, recipe := range work.operationRecipes {
			if nativeWriterSourceRequested(recipe) && key.operation.Pos() == 2187 {
				initial = recipe
				break
			}
		}
		if initial.memberSource == nil || !validStagedMemberCallRecipe(initial) || initial.delta.extracted || work.nativeWriterSourceRequestCurrent(initial) {
			t.Fatal("original pending source before first resolve UNREACHED")
		}
		required := initial.memberSource.call.sourceRequest.required
		if len(required) != 3 {
			t.Fatal("original selected child description UNREACHED")
		}
		direct := work.operationRecipes[required[2].producer]
		if !validNativeInputInvocationRecipe(direct) || direct.delta.extracted || work.nativeInputInvocationCurrent(direct) {
			t.Fatal("genuine incomplete direct description UNREACHED")
		}
		id, adopted := work.operationIDs[initial.key]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			t.Fatal("original source adoption UNREACHED")
		}
		state := &work.operations[id.index]
		if state.invalid || !state.dependenciesRegistered || state.delta.extracted {
			t.Fatal("real adopted pending source state UNREACHED")
		}
		var reading sourceStagedOperationRequest
		for _, sub := range state.subscribers {
			if sub.request.reading.operation != nil && sub.request.reading.operation.Pos() == 2320 {
				reading = sub.request
				break
			}
		}
		c := work.operationRecipes[reading.reading]
		if reading.producer != initial.key || !work.describedWriterSourceReading(reading) || !validStagedMemberCoverageRecipe(c) || !operationContainsRequest(c.delta.required, reading) {
			t.Fatal("original C-owned pending reader before selected completion UNREACHED")
		}
		before := append([]sourceStagedOperationRequest(nil), c.delta.required...)
		observed := state.revision
		// This is the maintained ordinary first-resolve path. No source query,
		// Get, callback, ACK, proof, input frame or initializer is reconstructed.
		if pending := resolveCallableEffectsWithWork(facts, owner, work); len(pending) != 0 {
			t.Fatal("original source dependency closure remains pending", pending)
		}
		settled := false
		for _, fact := range facts {
			if fact.node == initial.key.declaration {
				settled = fact.staged.settled && !fact.staged.operationsPending
			}
		}
		if !settled {
			t.Fatal("original owning fact dependency closure UNREACHED")
		}
		current := work.operationRecipes[initial.key]
		if !work.nativeWriterSourceRequestCurrent(current) || !current.delta.extracted {
			t.Fatal("original selected/finished source CURRENT positive UNREACHED")
		}
		state = &work.operations[id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
		if state.revision <= observed || !state.delta.extracted || sub == nil || sub.blocked || !sameOperationRequest(sub.request, reading) || sub.consumed != state.revision || sub.applied != state.revision {
			t.Fatal("same original pending reader delivery/APPLIED positive UNREACHED")
		}
		c = work.operationRecipes[reading.reading]
		if !operationPrefix(before, c.delta.required, sameOperationRequest) || !operationContainsRequest(c.delta.required, reading) {
			t.Fatal("original C reader/prefix replaced after selected arrival")
		}
		for _, child := range c.delta.required {
			if child.producer == direct.key && child.reading == reading.reading {
				t.Fatal("selected description substituted a second reader into original C")
			}
		}
		// Every refusal is downstream of genuine original current+delivery.
		copied := current
		copied.memberSource = cloneStagedMemberSource(current.memberSource)
		if work.nativeWriterSourceRequestCurrent(copied) {
			t.Fatal("copied description supplied original source observation")
		}
		copied.memberSource.call.sourceRequest.required[1].cut.reading = nil
		if validStagedMemberCallRecipe(copied) || current.memberSource.call.sourceRequest.required[1].cut.reading == nil {
			t.Fatal("foreign Get cut accepted or clone aliases original")
		}
		foreign := reading
		foreign.cut.reading = nil
		if work.describedWriterSourceReading(foreign) {
			t.Fatal("foreign parent reader cut accepted")
		}
		copied = current
		copied.memberSource = cloneStagedMemberSource(current.memberSource)
		copied.memberSource.call.sourceRequest.generation = nil
		if validStagedMemberCallRecipe(copied) || work.nativeWriterSourceRequestCurrent(copied) {
			t.Fatal("foreign source generation accepted")
		}
		released, releasedRecipe = work, current
	}, activeModuleBeforeResolution)
	if released == nil {
		t.Fatal("original pending-to-delivered reading positive UNREACHED")
	}
	if released.nativeWriterSourceRequestCurrent(releasedRecipe) {
		t.Fatal("released source generation remained current")
	}
}
