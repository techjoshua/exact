package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceInstalledCallSelectionSource describes an actual source Call's callee
// Get before its body binder exists. It is a distinct member-source factory;
// neither a caller frame nor the later selected body's input edge is invented.
type sourceInstalledCallSelectionSource struct {
	coverage   []sourceStagedOperationRequest
	request    sourceStagedOperationRequest
	call       *ast.Node
	cut        sourceRelativeCut
	generation *projectGeneration
}

// sourceInstalledCallSelection is lent inside receiverCandidates' original
// initializing/active Call interval. The construction selection is the same
// actual SOURCE interest used by the typed callable materializer.
type sourceInstalledCallSelection struct {
	issuer    *sourceValueQuery
	publisher *sourcePendingMemberPublisher
	selection *sourceConstructionCallSelection
	source    sourceInstalledCallSelectionSource
	borrow    *sourceStagedMemberBorrow
	live      bool
	get       *sourceGetInputs // latest actual alternative in this original selector only
	read      *sourceMemberWriterReadCut
}

func validInstalledCallSelectionSource(source *sourceInstalledCallSelectionSource) bool {
	if source == nil || source.generation == nil || source.call == nil || !ast.IsCallExpression(source.call) {
		return false
	}
	get := unwrapSourceCallableReference(source.call.Expression())
	request := source.request
	return (ast.IsPropertyAccessExpression(get) || ast.IsElementAccessExpression(get)) && request.producer.operation == get && request.producer.kind == relativeDemandEffects && request.producer.selector == (sourceStagedOperationSelector{}) && request.producer.declaration == request.consumer && request.inputs == nil && request.use == source.call && request.cut == source.cut && source.cut.operation == get && source.cut.reading == source.call && source.cut.initializing == source.call && source.cut.returning == nil && source.cut.invoking == nil && sourceStagedOccurrenceOwned(get, request.consumer)
}

func sameInstalledCallSelectionSource(a, b *sourceInstalledCallSelectionSource) bool {
	return a == nil && b == nil || a != nil && b != nil && sameOperationRequest(a.request, b.request) && a.call == b.call && a.cut == b.cut && a.generation == b.generation && sameInstalledMemberRequirements(a.coverage, b.coverage)
}
func cloneInstalledCallSelectionSource(source *sourceInstalledCallSelectionSource) *sourceInstalledCallSelectionSource {
	if source == nil {
		return nil
	}
	copy := *source
	copy.coverage = append([]sourceStagedOperationRequest(nil), source.coverage...)
	return &copy
}

// beginInstalledSourceCallSelection begins at the real member-callee lookup.
// The first domain is a canonical top-level SOURCE Call observation; richer
// parent body/return contexts remain unmigrated rather than restoring a cut.
func (work *callableEffectWork) beginInstalledSourceCallSelection(facts []callableFacts, q *sourceValueQuery, call *ast.Node) (func(), bool) {
	if q == nil || q.installedMemberIssuer != q || q.inputs != nil || q.operation != nil || !q.dependenciesOnly || q.executable == nil || !q.installedMemberSourceOwned(call, q.effectOwner) || call == nil || !ast.IsCallExpression(call) || q.initializing != call || q.reading != call || q.returning != nil || q.invoking != nil || !q.active[call] {
		return func() {}, false
	}
	selection := q.constructionSelection
	if selection == nil || selection.issuer != q || selection.call != call || selection.interest == nil || selection.interest.issuer != q || q.constructionCall != selection.interest || selection.cuts != q.calleeAcquisitionCuts() {
		return func() {}, false
	}
	get := unwrapSourceCallableReference(call.Expression())
	if get != q.protectedMember || !ast.IsPropertyAccessExpression(get) && !ast.IsElementAccessExpression(get) {
		return func() {}, false
	}
	work.indexOperationSources(facts)
	consumer, known := work.memberNodes[q.effectOwner]
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if !known || consumer >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[consumer] || &work.operationFacts[consumer] != publisher.fact || work.operationGeneration != nil && work.operationGeneration != q.owner.generation {
		return func() {}, false
	}
	work.operationGeneration = q.owner.generation
	request, described := stagedMemberGetSourceRequest(publisher.fact, get)
	if !described {
		return func() {}, false
	}
	request.use = call
	request.cut = q.relativeInputCut(get)
	source := sourceInstalledCallSelectionSource{request: request, call: call, cut: request.cut, generation: q.owner.generation}
	if !validInstalledCallSelectionSource(&source) {
		return func() {}, false
	}
	previous, previousMember := q.installedCallSelection, q.stagedMember
	event := &sourceInstalledCallSelection{issuer: q, publisher: publisher, selection: selection, source: source, live: true}
	b := &sourceStagedMemberBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, request: request, call: call, installedCallSelection: event}
	b.publish = func(candidate sourceStagedMemberCandidate) bool {
		return work.registerStagedMemberCandidate(facts, q, request, candidate)
	}
	b.finish = func(disposition sourceStagedMemberDisposition) bool {
		event.get, event.read = b.get, b.read
		if !work.registerStagedMemberDisposition(facts, q, disposition) {
			return false
		}
		if b.coverage != nil && b.coverage.generation == event.source.generation && b.coverage.cut == q.relativeInputCut(b.get.operation) && sameOperationRequest(b.coverage.request, stagedMemberCoverageRequest(b.request, b.coverage.origin, b.coverage.cut)) {
			event.source.coverage = appendEntryLawRequirement(event.source.coverage, b.coverage.request)
		}
		return true
	}
	b.registerWriterSource = func(r *sourceWriterInputRequest) { work.registerWriterSource(facts, q, r) }
	b.writerCall = func(node *ast.Node) sourceStagedWriterCallDisposition {
		return work.consumeStagedStandardWriterCall(facts, q, node)
	}
	event.borrow = b
	q.installedCallSelection, q.stagedMember = event, b
	return func() {
		if !event.live {
			return
		}
		event.live = false
		if q.installedCallSelection == event {
			q.installedCallSelection = previous
		}
		if q.stagedMember == b {
			q.stagedMember = previousMember
		}
		b.issuer, b.installedCallSelection = nil, nil
		b.publish, b.finish = nil, nil
		b.registerWriterSource, b.writerCall = nil, nil
		event.issuer, event.publisher, event.selection, event.borrow = nil, nil, nil, nil
		event.get, event.read = nil, nil
	}, true
}

func (q *sourceValueQuery) liveInstalledCallSelection(b *sourceStagedMemberBorrow, get *sourceGetInputs, cut *sourceMemberWriterReadCut) bool {
	if q == nil || b == nil || b.installedCallSelection == nil || q.stagedMember != b || b.issuer != q || b.owner != q.owner || b.get != get || b.read != cut || get == nil || cut == nil || q.inputs != nil || q.operation != nil || !q.dependenciesOnly {
		return false
	}
	e := b.installedCallSelection
	return e.live && e.issuer == q && q.installedCallSelection == e && e.borrow == b && e.publisher != nil && e.publisher.live && q.executable.pendingMemberPublishers[q.effectOwner] == e.publisher && e.selection != nil && e.selection.issuer == q && q.constructionSelection == e.selection && q.active[e.source.call] && q.initializing == e.source.call && q.reading == e.source.cut.reading && q.returning == e.source.cut.returning && q.invoking == e.source.cut.invoking && q.protectedMember == get.operation && get.operation == e.source.request.producer.operation && cut.operation == get.operation && cut.use == q.reading && q.relativeInputCut(get.operation) == e.source.cut && validInstalledCallSelectionSource(&e.source) && q.installedMemberSourceOwned(get.operation, q.effectOwner)
}

// installedSourceMemberReadOwner is DATA's common original-Get accessor. It
// exposes descriptions only while the exact new bound/native/selector event is
// live. An outer descriptor C or a definition member factory cannot answer it.
func (q *sourceValueQuery) installedSourceMemberReadOwner(get *sourceGetInputs) (sourceStagedOperationRequest, sourceRelativeCut, bool) {
	if q == nil || get == nil || q.stagedMember == nil {
		return sourceStagedOperationRequest{}, sourceRelativeCut{}, false
	}
	b := q.stagedMember
	if q.effectOwner != b.request.consumer {
		return sourceStagedOperationRequest{}, sourceRelativeCut{}, false
	}
	if event := b.installedMember; event != nil && event.get == get && q.liveInstalledMemberPhase(event, get, event.read) {
		return b.request, event.application.memberCut, true
	}
	if event := b.installedCallSelection; event != nil && q.installedCallSelectionObservationOwned(b, get.operation) {
		read := b.read
		if b.get != get {
			read = event.read
			if event.get != get {
				return sourceStagedOperationRequest{}, sourceRelativeCut{}, false
			}
		}
		if read != nil && read.operation == get.operation && read.use == q.reading && q.relativeInputCut(get.operation) == event.source.cut {
			return b.request, event.source.cut, true
		}
	}
	return sourceStagedOperationRequest{}, sourceRelativeCut{}, false
}

func (q *sourceValueQuery) installedCallSelectionObservationOwned(b *sourceStagedMemberBorrow, operation *ast.Node) bool {
	if q == nil || b == nil || b.installedCallSelection == nil {
		return false
	}
	e := b.installedCallSelection
	return e.live && e.issuer == q && q.installedCallSelection == e && e.borrow == b && e.publisher != nil && e.publisher.live && q.executable.pendingMemberPublishers[q.effectOwner] == e.publisher && e.selection != nil && e.selection.issuer == q && q.constructionSelection == e.selection && q.protectedMember == operation && operation == e.source.request.producer.operation && q.inputs == nil && q.operation == nil && q.dependenciesOnly && q.reading == e.source.cut.reading && q.initializing == e.source.call && q.returning == e.source.cut.returning && q.invoking == e.source.cut.invoking && q.relativeInputCut(operation) == e.source.cut && q.installedMemberSourceOwned(operation, q.effectOwner)
}

// finishInstalledSourceCallSelection publishes only this actual callee lookup's
// detached source membership. Unknown/mixed callee value flags remain intact.
func (q *sourceValueQuery) finishInstalledSourceCallSelection(result *accessorCandidates) {
	e := q.installedCallSelection
	if e == nil || !e.live || e.issuer != q || result == nil || len(e.source.coverage) == 0 {
		return
	}
	copy := cloneInstalledCallSelectionSource(&e.source)
	result.installedCallSelections = append(result.installedCallSelections, *copy)
}

func sameInstalledCallSelections(a, b []sourceInstalledCallSelectionSource) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if !sameInstalledCallSelectionSource(&a[i], &b[i]) {
			return false
		}
	}
	return true
}
func cloneInstalledCallSelections(source []sourceInstalledCallSelectionSource) []sourceInstalledCallSelectionSource {
	out := make([]sourceInstalledCallSelectionSource, len(source))
	for i := range source {
		out[i] = *cloneInstalledCallSelectionSource(&source[i])
	}
	return out
}

// installedCallSelectionFactoryParent is a distinct ordinary SOURCE callee
// factory. The old definition parent and installed-input factories are unchanged.
func installedCallSelectionFactoryParent(source *sourceStagedMemberSource, cut sourceRelativeCut) bool {
	if source == nil || source.installedMember != nil || source.installedCallSelection == nil {
		return false
	}
	selected := source.installedCallSelection
	return validInstalledCallSelectionSource(selected) && source.generation == selected.generation && sameOperationRequest(source.parent, selected.request) && cut == selected.cut
}
