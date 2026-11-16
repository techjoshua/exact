package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeEntryAcquisition is lent by one actual native entry read.
// It authorizes only source inventory for that read, never a selected value,
// original callee receipt, native algorithm, or execution of another Call.
type sourceStagedNativeEntryAcquisition struct {
	self       *sourceStagedNativeEntryAcquisition
	query      *sourceValueQuery
	native     *sourceStagedNativeGetBorrow
	work       *callableEffectWork
	fact       *callableFacts
	generation *projectGeneration
	acquired   *ast.Node
	get        *sourceGetInputs
}

func (q *sourceValueQuery) beginNativeEntryAcquisition(value sourceValue) func() {
	noop := func() {}
	if q == nil || q.owner == nil || q.executable == nil || q.executable.values == nil || q.executable.values.program != q.owner.program || q.executable.values.checker != q.owner.checker || q.executable.values.generation != q.owner.generation || q.executable.project == nil || q.inputs != nil || q.operation != nil || value.native == nil || value.native.kind != sourceNativeObjectConstructor || value.native.acquired == nil || !ast.IsIdentifier(value.native.acquired) || !q.definitionWriteInventoryContext() {
		return noop
	}
	n := q.stagedNativeGet
	if n == nil || n.issuer != q || n.owner != q.owner || n.call == nil || n.entry != nil || n.sourceWork == nil || n.generation != q.owner.generation || q.initializing != n.call || q.protectedMember != n.call.Expression() || n.generation != q.executable.project.activeGeneration {
		return noop
	}
	w := n.sourceWork
	root := w.operationRecipes[n.getRequest.producer]
	if !validNativeGetRecipe(root) || root.nativeGet.kind != sourceNativeObjectCreate || !sameOperationRequest(root.nativeGet.request, n.getRequest) || root.nativeGet.get != q.protectedMember || n.sourceEpoch != nil && n.sourceEpoch != w.operationEpoch {
		return noop
	}
	receiver, _ := accessorReceiver(n.call.Expression())
	_, kind := q.nativeRootDeclaration(value.node)
	if receiver != value.native.acquired || kind != sourceNativeObjectConstructor {
		return noop
	}
	if n.observation != nil && !w.liveNativeSourceObservation(q, n.getRequest, n.call.Expression(), n.observation) {
		return noop
	}
	caller, known := w.memberNodes[n.getRequest.consumer]
	publisher := q.executable.pendingMemberPublishers[n.getRequest.consumer]
	if !known || caller < 0 || caller >= len(w.operationFacts) || publisher == nil || !publisher.live || publisher.fact != &w.operationFacts[caller] || publisher.fact.sourceFile == nil || q.owner.program.GetSourceFile(publisher.fact.sourceFile.FileName()) != publisher.fact.sourceFile {
		return noop
	}
	entry := &sourceStagedNativeEntryAcquisition{query: q, native: n, work: w, fact: publisher.fact, generation: n.generation, acquired: value.native.acquired}
	entry.self = entry
	n.entry = entry
	return func() {
		if n.entry == entry {
			n.entry = nil
		}
		entry.self, entry.query, entry.get = nil, nil, nil
	}
}

func (entry *sourceStagedNativeEntryAcquisition) live(q *sourceValueQuery) bool {
	if entry == nil || entry.self != entry || entry.query != q || q == nil || q.owner == nil || q.executable == nil || q.executable.project == nil || q.inputs != nil || q.operation != nil || q.owner.generation != entry.generation || q.executable.project.activeGeneration != entry.generation || q.reading != entry.acquired {
		return false
	}
	n := entry.native
	w := entry.work
	if n == nil || q.stagedNativeGet != n || n.entry != entry || n.issuer != q || n.owner != q.owner || n.sourceWork != w || w == nil || w.operationGeneration != entry.generation || n.generation != entry.generation || n.call == nil || q.initializing != n.call || q.protectedMember != n.call.Expression() || q.effectOwner != n.getRequest.consumer {
		return false
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact != entry.fact || entry.fact.sourceFile == nil || q.owner.program.GetSourceFile(entry.fact.sourceFile.FileName()) != entry.fact.sourceFile {
		return false
	}
	// The parent refresh remains independently authenticated while the child
	// has its own physical cut. It is never reinterpreted as the child's Get.
	if lease := n.observation; lease != nil {
		observer, valid := w.nativeObservationContext(lease.task, lease.coverage)
		if lease.issuer != lease || lease.work != w || lease.owner != q.executable || lease.generation != entry.generation || !valid || observer != lease.observer || !sameOperationRequest(observer.request, n.getRequest) {
			return false
		}
	}
	return true
}

func (q *sourceValueQuery) beginNativeEntryMemberGet(get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal) func() {
	noop := func() {}
	if q == nil || q.stagedNativeGet == nil {
		return noop
	}
	entry := q.stagedNativeGet.entry
	if !entry.live(q) || entry.get != nil || get == nil || get.operation != entry.acquired || get.receiver.native == nil || get.receiver.native.kind != sourceNativeGlobalObject || get.receiver.native.acquired != entry.acquired || cut == nil || cut.operation != get.operation || cut.use != q.reading || mode != accessorAcquire {
		return noop
	}
	entry.get = get
	revoke, installed := entry.work.beginStagedMemberWorkAtEntry(q, entry.work.operationFacts, entry.native.getRequest, entry)
	if !installed {
		entry.get = nil
		entry.native.entryRefused = true
		return noop
	}
	return func() { revoke(); entry.get = nil }
}

// enrollNativeEntryCoverage admits a real child source factory before it can
// yield or publish. A sealed local Get cannot silently acquire a new premise.
func (work *callableEffectWork) enrollNativeEntryCoverage(facts []callableFacts, q *sourceValueQuery, coverage sourceStagedOperationRecipe) bool {
	b := q.stagedMember
	if b == nil || !b.nativeEntry.live(q) || b.nativeEntry.get != b.get || !validStagedMemberCoverageRecipe(coverage) || !validNativeObserverCoverage(coverage.memberSource) || coverage.memberSource.generation != work.operationGeneration || coverage.memberSource.coverage.cut != q.relativeInputCut(b.get.operation) || !sameOperationRequest(coverage.memberSource.parent, b.request) || b.coverage == nil || !sameOperationRequest(coverage.memberSource.request, b.coverage.request) || coverage.memberSource.coverage.origin != b.coverage.origin {
		return false
	}
	n := q.stagedNativeGet
	request := nativeRootDebtRequest(&sourceStagedNativeGetSource{request: n.getRequest, get: n.call.Expression()}, "callee-get")
	get := work.operationRecipes[request.producer]
	if !validNativeGetRecipe(get) || !sameOperationRequest(get.nativeGet.request, n.getRequest) || get.nativeGet.get != n.call.Expression() {
		return false
	}
	child := coverage.memberSource.request
	if operationContainsRequest(get.delta.required, child) && operationContainsRequest(get.nativeGet.memberSources, child) {
		n.entryRequired = appendEntryLawRequirement(n.entryRequired, child)
		return true
	}
	id := work.operationIDs[request.producer]
	if get.delta.extracted || id.epoch == work.operationEpoch && id.index != 0 && (int(id.index) >= len(work.operations) || work.operations[id.index].invalid || work.operations[id.index].delta.extracted) {
		return false
	}
	copy := *get.nativeGet
	copy.memberSources = appendEntryLawRequirement(append([]sourceStagedOperationRequest(nil), copy.memberSources...), child)
	get.nativeGet = &copy
	get.delta = cloneOperationDelta(get.delta)
	get.delta.required = appendEntryLawRequirement(get.delta.required, child)
	if !validNativeGetRecipe(get) || !work.attachOperationSource(facts, get) {
		return false
	}
	n.entryRequired = appendEntryLawRequirement(n.entryRequired, child)
	return true
}

func (work *callableEffectWork) nativeEntryCoverageCurrent(q *sourceValueQuery, n *sourceStagedNativeGetBorrow) bool {
	if n.entryRefused {
		return false
	}
	for _, required := range n.entryRequired {
		c := work.operationRecipes[required.producer]
		get := work.operationRecipes[nativeRootDebtRequest(&sourceStagedNativeGetSource{request: n.getRequest, get: n.call.Expression()}, "callee-get").producer]
		if !operationContainsRequest(n.entryObserved, required) || !validStagedMemberCoverageRecipe(c) || !validNativeObserverCoverage(c.memberSource) || !sameOperationRequest(c.memberSource.request, required) || !sameOperationRequest(c.memberSource.parent, n.getRequest) || c.memberSource.coverage.nativeObserver.get != n.call.Expression() || c.memberSource.generation != work.operationGeneration || !c.delta.extracted || work.memberCoverageObserved[c.key] != work.operationGeneration || !operationContainsRequest(get.delta.required, required) {
			return false
		}
	}
	return true
}
