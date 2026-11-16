package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// acquireStagedMapEntryCoverage owns the existing source-only C acquisition for
// one accepted DATA entry. The original entry borrower supplies this interval
// before primitive observation/publication. It never reacquires an initializer
// or getter body. A true return transfers source acquisition, not C completion,
// a no-user-entry law, empty implicit membership or normal DATA authority.
func (work *callableEffectWork) acquireStagedMapEntryCoverage(facts []callableFacts, query *sourceValueQuery, get *sourceGetInputs, group *ast.Node) bool {
	if query == nil || query.owner == nil || query.stagedMap == nil || !query.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) || query.owner.generation != work.operationGeneration {
		return false
	}
	borrow := query.stagedMap
	read := borrow.currentRead
	if read == nil || !query.originalMapEntryCoverageOwned(read.request) {
		return false
	}
	if !borrow.reading || query.traceModeKnown || read == nil || read.getter != nil || read.entry.getter != nil || read.accounting != sourceEffectsAccounted || group != borrow.receiver.expression || read.entry.group != group || read.descriptor.expression == nil || borrow.generation != work.operationGeneration {
		return false
	}
	acceptedEntry, accepted := borrow.accepted[read.entry.member]
	base, valid := stagedMapEntryRequest(borrow.source, acceptedEntry)
	if !accepted || !valid || !sameOperationRequest(base, read.request) || !sameStagedMapEntry(acceptedEntry, read.entry) || !sameOperationEndpoint(read.descriptor, acceptedEntry.descriptor) || acceptedEntry.cut != borrow.cut {
		return false
	}
	// Publish a required pending C before attempting the source handoff.
	// Unsupported source work cannot fall through as an empty DATA Get.
	coverage := stagedMemberCoverageRequest(base, group, borrow.cut)
	if _, present := work.operationRecipes[coverage.producer]; !present {
		c := &sourceStagedMemberCoverage{request: coverage, origin: group, cut: borrow.cut, generation: work.operationGeneration}
		if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: coverage.producer, memberSource: &sourceStagedMemberSource{request: coverage, parent: base, generation: work.operationGeneration, coverage: c}}) {
			return false
		}
	}
	entry := work.operationRecipes[base.producer]
	if !validStagedMapEntryRecipe(entry) {
		return false
	}
	entry.delta = cloneOperationDelta(entry.delta)
	entry.delta.required = appendEntryLawRequirement(entry.delta.required, coverage)
	if !work.attachOperationSource(facts, entry) {
		return false
	}
	revoke, installed := work.beginStagedMemberWork(query, facts, base)
	if !installed {
		return false // Pending C remains required; no source event was acquired.
	}
	defer revoke()
	mode, known := query.traceMode, query.traceModeKnown
	query.traceMode, query.traceModeKnown = accessorAcquire, true
	defer func() { query.traceMode, query.traceModeKnown = mode, known }()
	result := accessorCandidates{}
	cut := query.memberWriterReadCut(nil, nil, &result, get)
	query.memberValuesAtGet(group, nil, "", accessorAcquire, nil, &result, func(sourceValue) {}, sourceMemberOperationProof{}, get, cut)
	// This accepts source acquisition, not current C/empty membership. The
	// existing C child, actual source state and delivery still gate consumption.
	return query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) && query.stagedMap == borrow && borrow.currentRead == read && borrow.reading
}

// acquireOriginalMapEntryCoverage lends only the already accepted DATA read to
// the graph owner's C service. This interval precedes the primitive-law event and
// carries no law, currentness, value or empty-membership authority.
func (query *sourceValueQuery) acquireOriginalMapEntryCoverage(borrow *sourceStagedMapBorrow, read *sourceStagedMapEntryRead) bool {
	if query == nil || borrow == nil || query.stagedMap != borrow || borrow.entryCoverage == nil || borrow.entryCoverageRead != nil || borrow.currentRead != read || read == nil || read.getter != nil || read.entry.getter != nil || !borrow.reading || query.traceModeKnown || !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) {
		return false
	}
	borrow.entryCoverageRead = read
	defer func() {
		if borrow.entryCoverageRead == read {
			borrow.entryCoverageRead = nil
		}
	}()
	return borrow.entryCoverage(borrow.get, read.entry.group)
}

// originalMapEntryCoverageOwned validates the original callback interval, not
// a copied recipe or a primitive law. The common member API retains its own
// physical-parent and fact/program/generation checks before using this clause.
// The same interval remains live during its own accessorAcquire traversal; it
// cannot authorize enumeration or another traversal mode.
func (query *sourceValueQuery) originalMapEntryCoverageOwned(request sourceStagedOperationRequest) bool {
	if query == nil || query.stagedMap == nil || query.traceModeKnown && query.traceMode != accessorAcquire {
		return false
	}
	borrow := query.stagedMap
	read := borrow.currentRead
	if read == nil || borrow.entryCoverageRead != read || !borrow.reading || read.getter != nil || read.entry.getter != nil || read.accounting != sourceEffectsAccounted || !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) || !sameOperationRequest(read.request, request) || !stagedMapEntryMemberParent(request) || read.entry.group != borrow.receiver.expression || read.entry.cut != borrow.cut {
		return false
	}
	accepted, present := borrow.accepted[read.entry.member]
	expected, valid := stagedMapEntryRequest(borrow.source, accepted)
	return present && valid && sameOperationRequest(expected, request) && sameStagedMapEntry(accepted, read.entry) && sameOperationEndpoint(read.descriptor, accepted.descriptor)
}

// stagedMapEntryCoverageInstalled enforces the graph-work boundary separately
// from generic source transport. The installed service ran synchronously before
// this publisher; its pending C must remain in the exact entry prefix. This is
// factory/membership validation, not current C, law or dependency closure.
func (work *callableEffectWork) stagedMapEntryCoverageInstalled(query *sourceValueQuery, read sourceStagedMapEntryRead, entry sourceStagedOperationRecipe) bool {
	if query == nil || query.stagedMap == nil || query.owner == nil || query.owner.generation != work.operationGeneration {
		return false
	}
	borrow := query.stagedMap
	if entry.mapEntry == nil || borrow.entryCoverage == nil || borrow.currentRead == nil || !sameOperationRequest(borrow.currentRead.request, read.request) || read.entry.group != borrow.receiver.expression || read.entry.cut != borrow.cut || !stagedMapEntryMemberParent(read.request) || !sameOperationRequest(entry.mapEntry.request, read.request) {
		return false
	}
	coverage := stagedMemberCoverageRequest(read.request, read.entry.group, borrow.cut)
	if !operationContainsRequest(entry.delta.required, coverage) {
		return false
	}
	child, present := work.operationRecipes[coverage.producer]
	if !present || !validOperationEnvelope(child) || !validStagedMemberCoverageRecipe(child) {
		return false
	}
	source := child.memberSource
	return source.generation == work.operationGeneration && source.coverage.generation == work.operationGeneration && sameOperationRequest(source.parent, read.request) && sameOperationRequest(source.request, coverage) && source.coverage.origin == read.entry.group && source.coverage.cut == borrow.cut
}
