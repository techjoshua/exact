package exactcompiler

// sourceStagedTraversalTerminal preserves the actual source traversal's status.
// Withheld values are explicit. None of these fields proves no writes, no user
// entry, normal completion, C currency or an empty implicit-source set.
type sourceStagedTraversalTerminal struct {
	observed, unresolved, valueIncomplete, sourceOwned, contributions bool
}

func snapshotStagedTraversalTerminal(result accessorCandidates) sourceStagedTraversalTerminal {
	return sourceStagedTraversalTerminal{observed: true,
		unresolved:      result.opaque || result.receiverIncomplete || result.fieldReceiverIncomplete || result.thenIncomplete || result.ownOperation,
		valueIncomplete: result.valueIncomplete, sourceOwned: result.sourceOwned,
		contributions: !stagedMapEnumerationPrefixRepresented(result),
	}
}

// sourceStagedFieldTerminal belongs to the existing field disposition, which
// also retains exact Has/Get accounting and all known invoked binder edges.
// Unknown presence/source-only accounting stays distinguishable from actual
// absence and the original bypass branch. No query or Get borrow is retained.
type sourceStagedFieldTerminal struct {
	observed                                            bool
	request                                             sourceStagedOperationRequest
	generation                                          *projectGeneration
	epoch                                               *sourceStagedOperationEpoch
	presence                                            sourcePropertyPresence
	hasSeen, getSeen, sourceHas, sourceGet, getBypassed bool
	hasTraversal, getTraversal                          sourceStagedTraversalTerminal
}

func sameStagedFieldTerminal(a, b sourceStagedFieldTerminal) bool {
	return a.observed == b.observed && sameOperationRequest(a.request, b.request) && a.generation == b.generation && a.epoch == b.epoch && a.presence == b.presence && a.hasSeen == b.hasSeen && a.getSeen == b.getSeen && a.sourceHas == b.sourceHas && a.sourceGet == b.sourceGet && a.getBypassed == b.getBypassed && a.hasTraversal == b.hasTraversal && a.getTraversal == b.getTraversal
}

// sourceStagedMapEnumerationTerminal is the original post-loop source inventory,
// independent of accepted entry DATA and the later six field conversions. It
// retains unresolved alternatives rather than turning an empty list into proof.
type sourceStagedMapEnumerationTerminal struct {
	request                              sourceStagedOperationRequest
	cut                                  sourceRelativeCut
	generation                           *projectGeneration
	epoch                                *sourceStagedOperationEpoch
	entries                              []sourceStagedMapEntry
	unrepresented                        []sourceStagedMapUnrepresentedInput
	observed, refused, prefixRepresented bool
	traversal                            sourceStagedTraversalTerminal
}

func sameImplicitMapEnumeration(a, b *sourceStagedMapEnumerationTerminal) bool {
	if a == nil || b == nil {
		return a == b
	}
	if !sameOperationRequest(a.request, b.request) || a.cut != b.cut || a.generation != b.generation || a.epoch != b.epoch || a.observed != b.observed || a.refused != b.refused || a.prefixRepresented != b.prefixRepresented || a.traversal != b.traversal || len(a.entries) != len(b.entries) || len(a.unrepresented) != len(b.unrepresented) {
		return false
	}
	for i := range a.entries {
		if !sameStagedMapEntry(a.entries[i], b.entries[i]) {
			return false
		}
	}
	for i := range a.unrepresented {
		if a.unrepresented[i] != b.unrepresented[i] {
			return false
		}
	}
	return true
}

// recordImplicitMapEnumeration receives only the original live function map
// owner's post-traversal return. It updates the existing observation slot and
// normal source revision/fan-in; the index, description and callback are no proof.
func (work *callableEffectWork) recordImplicitMapEnumeration(facts []callableFacts, q *sourceValueQuery, terminal sourceStagedMapEnumerationTerminal) {
	if q == nil || q.stagedMap == nil || q.traceModeKnown {
		return
	}
	// An attempted query with no original literal or unresolved-input event
	// cannot manufacture a semantic source revision.
	if !terminal.observed && len(terminal.unrepresented) == 0 {
		return
	}
	b := q.stagedMap
	if b.converting || b.reading || b.currentRead != nil || !sameOperationRequest(terminal.request, b.request) || terminal.cut != b.cut || terminal.generation != work.operationGeneration || terminal.observed != b.observed || terminal.refused != b.refused || len(terminal.entries) != len(b.entries) || len(terminal.unrepresented) != len(b.unrepresented) {
		return
	}
	for i := range terminal.entries {
		if !sameStagedMapEntry(terminal.entries[i], b.entries[i]) {
			return
		}
	}
	for i := range terminal.unrepresented {
		if terminal.unrepresented[i] != b.unrepresented[i] {
			return
		}
	}
	p, owned := work.implicitMapOwner(facts, q, b.get)
	if !owned {
		return
	}
	terminal.epoch = work.operationEpoch
	if sameImplicitMapEnumeration(p.enumeration, &terminal) {
		return
	}
	p.enumeration = &terminal
	id := work.operationIDs[p.request.producer]
	state := &work.operations[id.index]
	state.revision++
	work.notifyOperationSubscribers(state)
}
