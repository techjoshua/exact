package exactcompiler

// constructedSourcePromotion stages only immutable description replacements.
// Operation deltas, observations, subscriptions and acknowledgments are owned by
// their existing publishers and are never part of this transaction.
type constructedSourcePromotion struct {
	key         sourceStagedOperationKey
	prior, next sourceStagedOperationRecipe
	factIndex   int
}

func sameConstructedSelectionPromotion(prior, next *sourceStagedConstructedMember) bool {
	if prior == nil || next == nil || prior.construction.selectionComplete || !next.construction.selectionComplete {
		return false
	}
	copy := *prior
	copy.construction.selectionComplete = true
	return sameConstructedMemberSource(&copy, next)
}

// promoteConstructedSourceDescription consumes this fresh original member Get,
// not the New publisher's event alone. Conditional payloads retain their exact
// meaning; newly complete callee/result work stays with its original role owner.
// A failed reader transaction changes no reader description. A real nested Set
// producer may independently progress while refreshing a retained writer source.
func (work *callableEffectWork) promoteConstructedSourceDescription(facts []callableFacts, q *sourceValueQuery, source sourceStagedConstructedMember) bool {
	if !source.construction.selectionComplete {
		return true
	}
	// Prefix registration always creates own-writers first and never deletes
	// it. A complete canonical header therefore needs no promotion transaction.
	// This producer-only key avoids allocating request edge strings on repeats.
	writerKey := source.request.producer
	writerKey.selector = sourceStagedOperationSelector{occurrence: source.construction.site, field: "own-writers"}
	if prior := work.operationRecipes[writerKey]; prior.constructed == nil || prior.constructed.construction.selectionComplete {
		return true
	}
	keys := [...]sourceStagedOperationKey{
		source.request.producer,
		constructedMemberRequest(&source, "own-writers").producer,
		constructedMemberRequest(&source, "eager-inputs").producer,
		constructedMemberRequest(&source, "callee").producer,
		constructedMemberRequest(&source, "member-result").producer,
		constructedMemberRequest(&source, "alternative").producer,
		constructedMemberRequest(&source, "stored-payload").producer,
		constructedMemberRequest(&source, "method-lookup").producer,
	}
	needs := false
	for _, key := range keys {
		prior, exists := work.operationRecipes[key]
		if !exists {
			continue
		}
		if prior.constructed != nil && prior.constructed.construction.site == source.construction.site {
			if !sameConstructedMemberSource(prior.constructed, &source) {
				if !sameConstructedSelectionPromotion(prior.constructed, &source) {
					return false
				}
				needs = true
			}
		}
		for i := range prior.constructedGroup {
			member := &prior.constructedGroup[i]
			if member.construction.site == source.construction.site && !sameConstructedMemberSource(member, &source) {
				if !sameConstructedSelectionPromotion(member, &source) {
					return false
				}
				needs = true
			}
		}
	}
	if !needs {
		return true
	}
	if !work.liveConstructedSelectionPromotion(facts, q, &source) {
		return false
	}
	caller := work.memberNodes[source.request.consumer]
	staged := make([]constructedSourcePromotion, 0, len(keys))
	var writers []sourceStagedConstructedMember
	for _, key := range keys {
		prior, exists := work.operationRecipes[key]
		if !exists {
			continue
		}
		if !validOperationEnvelope(prior) {
			return false
		}
		next := prior
		changed := false
		if prior.constructed != nil && prior.constructed.construction.site == source.construction.site && sameConstructedSelectionPromotion(prior.constructed, &source) {
			copy := cloneConstructedMemberSource(source)
			next.constructed = &copy
			changed = true
			if prior.constructedDisposition != nil {
				proof := cloneConstructedDisposition(prior.constructedDisposition)
				for i := range proof.resultSources {
					writer := proof.resultSources[i]
					if writer.construction == source.construction {
						continue
					}
					refreshed, ok := work.promotedConstructedResultWriter(facts, writer, source.construction, q.executable, &writers)
					if !ok {
						return false
					}
					proof.resultSources[i] = refreshed
				}
				next.constructedDisposition = proof
			}
		}
		groupCloned := false
		for i := range prior.constructedGroup {
			member := &prior.constructedGroup[i]
			if member.construction.site == source.construction.site && sameConstructedSelectionPromotion(member, &source) {
				if !groupCloned {
					next.constructedGroup = append([]sourceStagedConstructedMember(nil), prior.constructedGroup...)
					groupCloned = true
				}
				next.constructedGroup[i] = cloneConstructedMemberSource(source)
				changed = true
			}
		}
		if !changed {
			continue
		}
		if !validOperationEnvelope(next) {
			return false
		}
		staged = append(staged, constructedSourcePromotion{key: key, prior: prior, next: next, factIndex: -1})
	}
	// A real writer refresh can publish its own facts. It cannot authorize a
	// stale reader transaction or replace another source's intervening progress.
	if !work.liveConstructedSelectionPromotion(facts, q, &source) {
		return false
	}
	for i := range staged {
		entry := &staged[i]
		current := work.operationRecipes[entry.key]
		if current.constructed != entry.prior.constructed || current.constructedDisposition != entry.prior.constructedDisposition || !operationDeltaPrefix(current.delta, entry.prior.delta) || !operationDeltaPrefix(entry.prior.delta, current.delta) || !operationPrefix(current.constructedGroup, entry.prior.constructedGroup, func(a, b sourceStagedConstructedMember) bool { return sameConstructedMemberSource(&a, &b) }) || !operationPrefix(entry.prior.constructedGroup, current.constructedGroup, func(a, b sourceStagedConstructedMember) bool { return sameConstructedMemberSource(&a, &b) }) {
			return false
		}
		// Preserve metadata progressed by the independent writer producer.
		// Only these three typed description fields belong to this transaction.
		merged := current
		merged.constructed = entry.next.constructed
		merged.constructedGroup = entry.next.constructedGroup
		merged.constructedDisposition = entry.next.constructedDisposition
		if !validOperationEnvelope(merged) {
			return false
		}
		entry.next = merged
	}
	for index, recipe := range facts[caller].staged.operationRecipes {
		for i := range staged {
			entry := &staged[i]
			if recipe.key == entry.key {
				if recipe.constructed != entry.prior.constructed || recipe.constructedDisposition != entry.prior.constructedDisposition || !operationDeltaPrefix(recipe.delta, entry.next.delta) || !operationDeltaPrefix(entry.next.delta, recipe.delta) {
					return false
				}
				merged := recipe
				merged.constructed = entry.next.constructed
				merged.constructedGroup = entry.next.constructedGroup
				merged.constructedDisposition = entry.next.constructedDisposition
				if !validOperationEnvelope(merged) {
					return false
				}
				entry.factIndex = index
			}
		}
	}
	for _, entry := range staged {
		if entry.factIndex < 0 {
			return false
		}
	}
	for _, entry := range staged {
		work.operationRecipes[entry.key] = entry.next
		fact := &facts[caller].staged.operationRecipes[entry.factIndex]
		fact.constructed = entry.next.constructed
		fact.constructedGroup = entry.next.constructedGroup
		fact.constructedDisposition = entry.next.constructedDisposition
	}
	return true
}

func (work *callableEffectWork) liveConstructedSelectionPromotion(facts []callableFacts, q *sourceValueQuery, source *sourceStagedConstructedMember) bool {
	if q == nil || q.owner == nil || q.executable == nil || q.executable.project == nil || work.operationGeneration == nil || !work.operationGeneration.active || q.owner.generation != work.operationGeneration || q.executable.project.activeGeneration != work.operationGeneration || q.owner.program != work.operationGeneration.program || q.owner.checker != work.operationGeneration.checker || !validConstructedMemberSource(source) || q.effectOwner != source.request.consumer {
		return false
	}
	b := q.stagedConstructedMember
	if b == nil || !b.live || b.owner != q || b.generation != work.operationGeneration || b.issued == nil || b.issued.operation != source.request.producer.operation || !sameOperationRequest(b.request, source.request) || b.site != source.construction.site || b.get != source.get || b.cut != source.cut || q.relativeInputCut(source.request.producer.operation) != source.cut || q.executable.standardConstructions[b.site] != source.construction {
		return false
	}
	caller, known := work.memberNodes[source.request.consumer]
	publisher := q.executable.pendingMemberPublishers[source.request.consumer]
	return known && caller >= 0 && caller < len(facts) && publisher != nil && publisher.live && publisher.fact == &facts[caller] && facts[caller].sourceFile != nil && q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) == facts[caller].sourceFile
}

// A reader can retain a Set alternative, but only that Set's original source
// producer may refresh its description. Set has no recursive Get-result proof.
func (work *callableEffectWork) promotedConstructedResultWriter(facts []callableFacts, writer sourceStagedConstructedMember, construction sourceStandardConstructionContribution, owner *executableBodyOwner, refreshed *[]sourceStagedConstructedMember) (sourceStagedConstructedMember, bool) {
	expected := writer
	expected.construction = construction
	if writer.kind != sourceNativeWeakMapSetEffect || !sameConstructedSelectionPromotion(&writer, &expected) {
		return sourceStagedConstructedMember{}, false
	}
	for _, prior := range *refreshed {
		if sameOperationRequest(prior.request, writer.request) && sameConstructedMemberSource(&prior, &expected) {
			return prior, true
		}
	}
	caller, known := work.memberNodes[writer.request.consumer]
	if !known {
		return sourceStagedConstructedMember{}, false
	}
	request, prepared := work.prepareConstructedResultSource(facts, caller, writer.request.producer.operation, owner)
	if !prepared || !sameOperationRequest(request, writer.request) {
		return sourceStagedConstructedMember{}, false
	}
	root := work.operationRecipes[request.producer]
	for i := range root.constructedGroup {
		canonical := &root.constructedGroup[i]
		if sameConstructedMemberSource(canonical, &expected) {
			copy := cloneConstructedMemberSource(*canonical)
			*refreshed = append(*refreshed, copy)
			return copy, true
		}
	}
	return sourceStagedConstructedMember{}, false
}
