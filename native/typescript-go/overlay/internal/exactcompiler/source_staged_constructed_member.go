package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedConstructedMember is a conditional source alternative from the
// original construction and member owners. It is not a selected-call ACK. Own
// writers, captured inputs, method invocation and result projection remain
// separate required producers on the existing work queue.
type sourceStagedConstructedMember struct {
	request      sourceStagedOperationRequest
	construction sourceStandardConstructionContribution
	method       *ast.Node
	kind         sourceNativeKind
	get          *ast.Node
	cut          sourceRelativeCut
	actuals      []sourceRelativeActual
	actualsKnown bool
	writers      []sourceStagedOperationAlternative
}

type sourceStagedConstructedMemberBorrow struct {
	owner                                 *sourceValueQuery
	generation                            *projectGeneration
	request                               sourceStagedOperationRequest
	get, site                             *ast.Node
	cut                                   sourceRelativeCut
	issued                                *sourceGetInputs
	publish                               func(sourceStagedConstructedMember, []*ast.SourceFile, bool) bool
	standard                              func(*sourceValueQuery, sourceStagedConstructedMember) bool
	resultCoverage                        func(*sourceValueQuery, sourceStagedConstructedMember, *accessorCandidates) bool
	coveragePrepared, coverageTransferred bool
	receiverSource                        func(*sourceValueQuery, *accessorCandidates) bool
	receiverVisited                       bool
	source                                *sourceStagedConstructedMember
	finishing, transferred                bool
	live                                  bool
}

// prepareStagedStandardMemberCall demands the original conditional get/set
// method branch through the same passive constructed-member traversal. A fresh
// source event can register Effects without activating the original Call. Its
// required allocation, Get/C, own-writer and eager roles still close separately.
func (work *callableEffectWork) prepareStagedStandardMemberCall(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) (sourceStagedOperationRequest, bool) {
	if caller < 0 || caller >= len(facts) || owner == nil || owner.values == nil || owner.values.generation == nil || work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return sourceStagedOperationRequest{}, false
	}
	occurrence := stagedConstructedOccurrenceAt(&facts[caller], call, owner)
	if occurrence == nil {
		return sourceStagedOperationRequest{}, false
	}
	work.indexOperationSources(facts)
	work.operationGeneration = owner.values.generation
	for _, recipe := range work.operationRecipes {
		source := recipe.memberSource
		if source == nil || source.call == nil || !source.call.complete || !recipe.delta.extracted || work.memberCoverageObserved[recipe.key] != owner.values.generation {
			continue
		}
		for i := range source.call.standard {
			member := &source.call.standard[i]
			if sameOperationRequest(member.request, occurrence.request) && work.constructedStandardMethodCovered(facts, caller, member, owner) {
				return source.request, true
			}
		}
	}
	for _, site := range occurrence.sites {
		if _, published := owner.standardConstructions[site]; !published {
			work.prepareStagedConstructionSource(facts, site, owner)
		}
	}
	var request sourceStagedOperationRequest
	accepted := false
	// Only an already requested pending source may preview its conditional Get.
	// Ordinary/no-upstream callers retain their existing entry path.
	preview := false
	candidate := requestedMemberCallCandidate(*occurrence)
	requested := work.operationRecipes[stagedMemberCandidateRequest(occurrence.request, candidate).producer]
	if work.requestedMemberCallSupported(requested) {
		for _, upstream := range occurrence.upstream {
			pending := work.operationRecipes[stagedCallResultRequest(upstream, facts[caller].node).producer]
			preview = preview || pending.callResult != nil && len(pending.callResult.constructedPreparation) != 0 && pending.callResult.generation == work.operationGeneration && validStagedCallResultRecipe(pending) && validStagedConstructedResultSource(pending.callResult)
		}
	}
	work.prepareConstructedOccurrenceSource(facts, caller, *occurrence, owner, false, preview, preview, func(q *sourceValueQuery, source sourceStagedConstructedMember) bool {
		var registered sourceStagedOperationRequest
		var ok bool
		if !q.stagedConstructedMember.finishing {
			registered, ok = work.registerStagedPendingStandardMemberCall(facts, q, source)
		} else {
			registered, ok = work.registerStagedStandardMemberCall(facts, q, source)
		}
		if ok {
			request, accepted = registered, true
		}
		return ok
	})
	return request, accepted
}

// beginStagedConstructedMemberSource lends the original semantic member owner
// a source-only sink. The receiver origin must already have been supplied by
// the reached construction owner. No query, binding map or borrowed Get survives
// publication. The sink must register own-writer obligations before accepting.
func (q *sourceValueQuery) beginStagedConstructedMemberSource(request sourceStagedOperationRequest, site *ast.Node, publish func(sourceStagedConstructedMember, []*ast.SourceFile, bool) bool, standard ...func(*sourceValueQuery, sourceStagedConstructedMember) bool) (func(), bool) {
	call := request.producer.operation
	if q == nil || q.owner == nil || q.executable == nil || publish == nil || !q.definitionWriteInventoryContext() || len(q.creators) != 0 || call == nil || !ast.IsCallExpression(call) || !ast.IsPropertyAccessExpression(call.Expression()) || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || request.consumer != q.effectOwner || request.producer.declaration != q.effectOwner || request.use != call || request.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || site == nil || !ast.IsNewExpression(site) || !sourceStagedOccurrenceOwned(call, q.effectOwner) {
		return func() {}, false
	}
	contribution, found := q.executable.standardConstructions[site]
	if !found || contribution.site != site || contribution.constructor == nil {
		return func() {}, false
	}
	prior := q.stagedConstructedMember
	borrow := &sourceStagedConstructedMemberBorrow{owner: q, generation: q.owner.generation, request: request, get: call.Expression(), site: site, cut: q.relativeInputCut(call), publish: publish, live: true}
	if len(standard) == 1 {
		borrow.standard = standard[0]
	}
	q.stagedConstructedMember = borrow
	return func() {
		if borrow.live {
			borrow.live = false
			borrow.publish, borrow.issued = nil, nil
			borrow.standard, borrow.source = nil, nil
			borrow.resultCoverage = nil
			borrow.receiverSource, borrow.receiverVisited = nil, false
			borrow.coveragePrepared, borrow.coverageTransferred = false, false
			borrow.finishing, borrow.transferred = false, false
			if q.stagedConstructedMember == borrow {
				q.stagedConstructedMember = prior
			}
		}
	}, true
}

// publishStagedConstructedMemberSource is called by nativeMemberKey only after
// the existing selected-construction owner supplies its conditional standard
// prototype member. Taking ownership defers inventory to registered producers.
// It never appends a selected value or grants normal/output/NoWrites authority.
func (q *sourceValueQuery) publishStagedConstructedMemberSource(get *sourceGetInputs, receiver, selected sourceValue, projection []string, name string, bindings sourceValueBindings, sources []*ast.SourceFile, referencesIncomplete bool) bool {
	borrow := q.stagedConstructedMember
	if borrow == nil || !borrow.live || borrow.owner != q || borrow.generation != q.owner.generation || borrow.publish == nil || q.inputs != nil || q.operation != nil || len(bindings) != 0 || len(q.creators) != 0 || q.protectedMember != borrow.get || q.effectOwner != borrow.request.consumer || q.relativeInputCut(borrow.request.producer.operation) != borrow.cut || receiver.node != borrow.site || receiver.native == nil || receiver.native.kind != sourceNativeWeakMapSourceInstance || receiver.native.acquired != borrow.site || selected.native == nil || !standardMemberEffect(selected.native.kind) || selected.native.acquired != borrow.site || selected.node == nil || !standardLibrarySource(ast.GetSourceFileOfNode(selected.node)) || len(projection) != 1 || name != "" || get == nil || get.operation != q.reading || get.receiver.node != receiver.node || get.receiver.native != receiver.native {
		return false
	}
	_, key := accessorReceiver(borrow.get)
	if projection[0] != key {
		return false
	}
	contribution, found := q.executable.standardConstructions[borrow.site]
	if !found || contribution.site != borrow.site || borrow.issued != nil {
		return false
	}
	borrow.issued = get // Exact original semantic owner occurrence, not a copied query/Get.
	selection := sourceStagedConstructedMember{request: borrow.request, construction: contribution, method: selected.node, kind: selected.native.kind, get: borrow.get, cut: borrow.cut}
	selection.actualsKnown = true
	for ordinal, argument := range restrictedInvocationArguments(borrow.request.producer.operation.AsCallExpression()) {
		if ast.IsSpreadElement(argument) {
			selection.actualsKnown = false
		}
		selection.actuals = append(selection.actuals, sourceRelativeActual{expression: argument, ordinal: ordinal, endpoint: sourceStagedArgumentEndpoint(argument, borrow.request.producer.operation, borrow.request.consumer, q.owner)})
	}
	for _, file := range sources {
		if file == nil || q.owner.program.GetSourceFile(file.FileName()) != file {
			continue
		}
		operations, _ := stagedFieldWriterDiscovery(q.owner.index(file), borrow.site)
		seen := make(map[*ast.Node]bool)
		for _, operation := range operations {
			node := operation.operation
			if node == nil || seen[node] || !ast.IsBinaryExpression(node) || node.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
				continue
			}
			seen[node] = true
			endpoint := sourceStagedArgumentEndpoint(node.AsBinaryExpression().Right, node, enclosingCallableNode(node), q.owner)
			endpoint.get = node.AsBinaryExpression().Left
			selection.writers = append(selection.writers, sourceStagedOperationAlternative{endpoint: endpoint})
		}
	}
	accepted := borrow.publish(selection, sources, !referencesIncomplete)
	if accepted && borrow.resultCoverage != nil {
		sealed := cloneConstructedMemberSource(selection)
		borrow.source = &sealed
		borrow.coveragePrepared = borrow.resultCoverage(q, sealed, nil)
		return false // This result demand owns the same original Get's coverage tail.
	}
	if accepted && borrow.standard != nil {
		sealed := cloneConstructedMemberSource(selection)
		borrow.source = &sealed
		borrow.standard(q, sealed) // A pending description cannot issue a complete branch.
		return false               // The positive method event follows the full original writer traversal.
	}
	if accepted && len(selection.writers) != 0 && q.stagedWriter != nil {
		// Preserve the original own-writer traversal. Its live owner publishes
		// RHS obligations before recovery, independent of this native branch.
		return false
	}
	return accepted && borrow.live && q.stagedConstructedMember == borrow && borrow.owner == q && borrow.generation == q.owner.generation && borrow.issued == get && q.relativeInputCut(borrow.request.producer.operation) == borrow.cut
}

// stagedStandardConstructedCallLookup lends only the genuine conditional DATA
// slot to the existing writer traversal. It supplies neither a selected method
// nor a completed call; the full-tail event and its required graph own those
// separate Effects obligations.
func (q *sourceValueQuery) stagedStandardConstructedCallLookup(get *sourceGetInputs, standard *sourceValue, mode accessorTraversal) bool {
	if q == nil || q.owner == nil || q.executable == nil || mode != accessorAcquire || get == nil || standard == nil || standard.native == nil {
		return false
	}
	b := q.stagedConstructedMember
	if b == nil || !b.live || b.owner != q || b.generation != q.owner.generation || b.standard == nil || b.source == nil || b.issued != get || b.finishing || q.stagedMember == nil || get.operation != b.request.producer.operation || q.protectedMember != b.get || q.relativeInputCut(get.operation) != b.cut || !q.liveStagedMemberSource(q.stagedMember, get, q.stagedMember.read) {
		return false
	}
	source := b.source
	receiver := get.receiver
	if receiver.node != b.site || receiver.native == nil || receiver.native.kind != sourceNativeWeakMapSourceInstance || receiver.native.acquired != b.site || receiver.bound != nil || receiver.capture != nil || receiver.normal != nil || receiver.instance != nil || len(receiver.path) != 0 || !source.construction.selectionComplete || b.site.AsNewExpression().Arguments != nil && len(b.site.AsNewExpression().Arguments.Nodes) != 0 {
		return false
	}
	_, name := accessorReceiver(b.get)
	origin, seed, known := q.standardConstructionMemberSeed(receiver, name)
	return known && origin == b.site && seed.node == source.method && seed.node == standard.node && seed.native != nil && seed.native.kind == source.kind && seed.native.kind == standard.native.kind && seed.native.acquired == standard.native.acquired && q.stagedMember.coverage != nil && q.stagedMember.coverage.origin == origin
}

// observeStagedStandardConstructedCall publishes only during the synchronous
// end of the original Get's writer traversal. The callback checks complete
// private receiver uses; C and every eager/callee/input debt remain required.
func (q *sourceValueQuery) observeStagedStandardConstructedCall(origin *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, standard *sourceValue, result *accessorCandidates) {
	if result == nil || !q.stagedStandardConstructedCallLookup(get, standard, mode) || !q.liveStagedMemberSource(q.stagedMember, get, cut) || result.receiverIncomplete || result.fieldReceiverIncomplete || !nativeMemberGetChannelsRepresented(result) {
		return
	}
	// Aggregate Get opacity may include disjoint reflective candidates. The
	// strict private/all-receiver callback owns this conditional method law;
	// the unchanged opacity and all original Get/C debts remain independent.
	b, member := q.stagedConstructedMember, q.stagedMember
	if !q.publishStagedMemberDisposition(get, cut, true) || !q.liveStagedMemberSource(member, get, cut) || member.coverage == nil || member.coverage.origin != origin {
		return
	}
	b.finishing = true
	defer func() { b.finishing = false }()
	accepted := b.standard(q, *b.source)
	if accepted && b.live && q.stagedConstructedMember == b && b.owner == q && b.issued == get && b.generation == q.owner.generation && q.relativeInputCut(get.operation) == b.cut && q.liveStagedMemberSource(member, get, cut) {
		b.transferred = true
		result.valueIncomplete = true // Effects transfer never supplies the method as a value.
	}
}
