package exactcompiler

// consumeStagedMapConversionTerminal enumerates once under the caller's original
// installed map borrow, then publishes conditional entry Get contributions in
// accepted source order. The discovery callback registers all required entry,
// getter-body and field producers before any entry read. Reads neither replay
// data initializers nor run getter bodies.
//
// True describes represented observed entry contributions only. It grants no
// OwnKeys/enumerability, writer/prototype coverage, descriptor conversion, normal
// completion or target-definition readiness. Empty/unmapped observations and
// capture gaps stay pending. Known contributions survive an unsupported sibling
// or refused publication. The query, callbacks and ordered membership remain
// scoped to the borrow and never become graph state.
// The terminal records the actual post-loop inventory for the work owner.
func consumeStagedMapConversionTerminal(query *sourceValueQuery, source *sourceStagedNativeGetSource, publish func(sourceStagedMapEntryRead) bool) (represented bool, terminal sourceStagedMapEnumerationTerminal) {
	if query == nil || query.stagedMap == nil || source == nil || source.descriptorMap == nil || publish == nil || query.traceModeKnown || !validNativeDescriptorMapRecipe(sourceStagedOperationRecipe{key: source.descriptorMap.protocol.producer, nativeGet: source}) {
		return false, terminal
	}
	borrow := query.stagedMap
	if borrow.observed || borrow.converting || borrow.reading || !sameOperationRequest(borrow.request, source.descriptorMap.protocol) || !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) {
		return false, terminal
	}
	borrow.converting = true
	defer func() { borrow.converting = false }()
	enumeration := query.accessorsAtGet(borrow.receiver.expression, nil, "", accessorEnumerate|accessorNoGet, nil, nil, borrow.get)
	if query.stagedMap != borrow || query.traceModeKnown || !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) {
		return false, terminal
	}
	// Snapshot the original publication order. A consumer callback cannot append
	// later source observations to this traversal's conversion sequence.
	entries := append([]sourceStagedMapEntry(nil), borrow.entries...)
	prefixRepresented := stagedMapEnumerationPrefixRepresented(enumeration)
	// Every original literal loop and unresolved-input callback has returned.
	// Withheld values and unknown alternatives remain explicit in this data.
	terminal = sourceStagedMapEnumerationTerminal{request: borrow.request, cut: borrow.cut, generation: borrow.generation, observed: borrow.observed, refused: borrow.refused, traversal: snapshotStagedTraversalTerminal(enumeration), prefixRepresented: prefixRepresented}
	for _, entry := range entries {
		terminal.entries = append(terminal.entries, cloneStagedMapEntry(entry))
	}
	terminal.unrepresented = append([]sourceStagedMapUnrepresentedInput(nil), borrow.unrepresented...)

	represented = borrow.observed && len(entries) != 0 && !borrow.refused && len(borrow.unrepresented) == 0 && prefixRepresented
	for _, entry := range entries {
		if query.stagedMap != borrow || query.traceModeKnown || !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) {
			return false, terminal
		}
		request, valid := stagedMapEntryRequest(source, entry)
		if !valid {
			represented = false
			continue
		}
		if entry.unmapped {
			represented = false
		}
		consumed := consumeStagedMapEntrySource(query, source, entry, request, func(read sourceStagedMapEntryRead) bool {
			if read.accounting != sourceEffectsAccounted || read.bound.unsupported != relativeInputsSupported {
				represented = false
			}
			return publish(read)
		})
		if !consumed {
			represented = false
		}
	}
	return represented && len(borrow.unrepresented) == 0 && query.stagedMap == borrow && !query.traceModeKnown && query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet), terminal
}

// Enumeration deliberately withholds normal values at the literal-owner hook.
// Its valueIncomplete flag cannot authenticate or refute the observed entry
// prefix. Any other effect/protocol output has no publisher in this entry-only
// transfer and therefore remains unrepresented, independently of known entries.
func stagedMapEnumerationPrefixRepresented(result accessorCandidates) bool {
	return !result.opaque && !result.receiverIncomplete && !result.fieldReceiverIncomplete && !result.thenIncomplete && !result.ownOperation &&
		len(result.values)+len(result.inputs)+len(result.effects)+len(result.environmentEffects)+len(result.contextEffects)+
			len(result.ownedGets)+len(result.ownedClaims)+len(result.ownedLocalCauses)+len(result.accessorMutations)+len(result.nativeDescriptorEffects)+len(result.descriptorFallbacks)+
			len(result.writeBodies)+len(result.writeOutcomes)+len(result.fieldFallbacks)+len(result.callFallbacks)+len(result.fieldOutcomes)+len(result.callOutcomes)+
			len(result.fieldCalls)+len(result.ownSlots)+len(result.fieldAlternatives)+len(result.reflective)+len(result.nativeCalls)+len(result.normalCalls)+len(result.owned)+
			len(result.thenReferences)+len(result.ordinaryBodies)+len(result.writes)+len(result.standardMemberTransfers) == 0
}
