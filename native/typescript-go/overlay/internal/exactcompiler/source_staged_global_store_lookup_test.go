package exactcompiler

import (
	"testing"
)

// The containing journey supplies the real current field demand and applied
// source reader. This isolates pointer handoff/suspension without publishing
// another Get contribution, executing a body or manufacturing a source receipt.
func assertGlobalStoreFieldLookupIsolation(t *testing.T, work *callableEffectWork, facts []callableFacts, owner *executableBodyOwner) {
	t.Helper()
	for key, recipe := range work.operationRecipes {
		if key.selector.field != "enumerable" || recipe.nativeGet == nil || recipe.nativeGet.descriptorEntry == nil {
			continue
		}
		id, adopted := work.operationIDs[key]
		if !adopted {
			continue
		}
		demand, issued := work.issueFieldEffectsDemand(facts, id, owner)
		order, needed := work.stagedModuleArgumentFieldOrder(recipe.nativeGet, demand.request)
		if !issued || !needed || order == nil {
			continue
		}
		q := newSourceDependencyQuery(key.operation, owner.checker, owner, demand.request.consumer)
		q.traceModeKnown, q.traceMode = true, accessorAcquire
		observation := &sourceStagedFieldObservation{phase: stagedFieldObservationGet}
		b := &sourceStagedFieldGetBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, operation: key.operation, receiver: demand.receiver.expression, field: key.selector.field, request: demand.request, cut: q.relativeInputCut(key.operation), observation: observation, argumentOrder: order, argumentEpoch: work.operationEpoch, argumentGroup: recipe.nativeGet.descriptorEntry.entry.group}
		b.argumentRead = func() *sourceStagedNativeArgumentOrder {
			current, _ := work.stagedModuleArgumentFieldOrder(recipe.nativeGet, demand.request)
			return current
		}
		q.stagedFieldGet = b
		defer func() { q.stagedFieldGet = nil; b.issuer = nil; b.argumentRead = nil; b.argumentLookup = nil }()
		original := &sourceGetInputs{operation: key.operation, receiver: sourceValue{node: b.receiver}, propertyKey: b.field, stagedEffects: b}
		b.argumentGet = original
		parent, valid := stagedFieldMemberRequest(demand.request, stagedFieldObservationGet)
		if !valid {
			t.Fatal("original field member request unavailable")
		}
		revoke, installed := q.beginStagedMemberSource(parent, func(sourceStagedMemberCandidate) bool { return true }, func(sourceStagedMemberDisposition) bool { return true })
		if !installed {
			t.Fatal("original field context unavailable")
		}
		defer revoke()
		selected, loan := q.copyStagedFieldLookupGet(original, b.receiver)
		if loan == nil || selected == original {
			t.Fatal("lookup owner did not issue selected copy")
		}
		extra := *selected
		extra.receiver.acquired = &sourceObservedValue{}
		noExtra := loan.begin(q, &extra, accessorAcquire)
		noExtra()
		if b.argumentLookup != nil {
			t.Fatal("further acquired proofGet inherited lookup")
		}
		release := loan.begin(q, selected, accessorAcquire)
		defer release()
		cut := q.memberWriterReadCut(nil, nil, &accessorCandidates{})
		finish := q.enterStagedMemberSource(selected, cut, nil)
		defer finish()
		if !q.stagedMapInvocationFollows(order.outer) || b.argumentGet != original {
			t.Fatal("selected lookup lost current ordering or replaced canonical Get")
		}
		copied := *selected
		if q.liveStagedFieldArgumentLookup(&copied) {
			t.Fatal("raw caller copy inherited lookup")
		}
		if _, unissued := q.copyStagedFieldLookupGet(&copied, b.receiver); unissued != nil {
			t.Fatal("caller copy minted another lookup")
		}
		for _, change := range []struct {
			name   string
			mutate func() func()
		}{
			{"receiver", func() func() {
				prior := selected.receiver.node
				selected.receiver.node = order.outer
				return func() { selected.receiver.node = prior }
			}},
			{"key", func() func() {
				prior := selected.propertyKey
				selected.propertyKey = "get"
				return func() { selected.propertyKey = prior }
			}},
			{"lookup", func() func() {
				prior := selected.lookupOwner
				selected.lookupOwner = &sourceValue{node: order.outer}
				return func() { selected.lookupOwner = prior }
			}},
			{"cut", func() func() {
				prior := loan.cut
				loan.cut.initializing = order.outer
				return func() { loan.cut = prior }
			}},
			{"owner", func() func() {
				prior := q.owner
				q.owner = newSourceValueOwner(owner.checker)
				return func() { q.owner = prior }
			}},
			{"generation", func() func() {
				prior := q.owner.generation
				q.owner.generation = new(projectGeneration)
				return func() { q.owner.generation = prior }
			}},
			{"finished", func() func() {
				prior := observation.phase
				observation.phase = stagedFieldObservationFinished
				return func() { observation.phase = prior }
			}},
			{"reader", func() func() {
				prior := b.argumentRead
				b.argumentRead = func() *sourceStagedNativeArgumentOrder { return nil }
				return func() { b.argumentRead = prior }
			}},
		} {
			restore := change.mutate()
			accepted := q.liveStagedFieldArgumentLookup(selected)
			restore()
			if accepted {
				t.Fatal(change.name, "inherited lookup")
			}
		}
		copiedQuery := *q
		if copiedQuery.liveStagedFieldArgumentLookup(selected) {
			t.Fatal("another query inherited lookup")
		}
		for _, observed := range []*sourceObservedValue{nil, {}} {
			var output *sourceObservedValue
			q.withAcquiredOutput(&output, observed, func() {
				if q.liveStagedFieldArgumentLookup(selected) {
					t.Fatal("output/body context inherited lookup")
				}
			})
			if !q.liveStagedFieldArgumentLookup(selected) {
				t.Fatal("synchronous lookup did not resume")
			}
		}
		restore := q.suspendStagedFieldArgumentLookup()
		if q.liveStagedFieldArgumentLookup(selected) {
			t.Fatal("suspended callback inherited lookup")
		}
		observation.phase = stagedFieldObservationFinished
		restore()
		if loan.active {
			t.Fatal("finished lookup resumed")
		}
		observation.phase = stagedFieldObservationGet
		release()
		if q.liveStagedFieldArgumentLookup(selected) || b.argumentLookup != nil {
			t.Fatal("revoked lookup remained current")
		}
		var output *sourceObservedValue
		q.withAcquiredOutput(&output, nil, func() {})
		if loan.active {
			t.Fatal("output restoration revived revoked lookup")
		}
		return
	}
	t.Fatal("no actual current descriptor field reader for lookup isolation")
}
