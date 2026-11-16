package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceOriginalGetNativeCallee owns the conditional SOURCE output of an
// original native callee Get. The root identifies its genuine selection owner;
// it is not the output reader and grants no invocation or result authority.
type sourceOriginalGetNativeCallee struct {
	root       sourceStagedOperationRequest
	get        *ast.Node
	kind       sourceNativeKind
	method     *ast.Node
	generation *projectGeneration
}

func cloneOriginalGetNativeCallee(s *sourceOriginalGetNativeCallee) *sourceOriginalGetNativeCallee {
	if s == nil {
		return nil
	}
	out := *s
	out.root = cloneOperationDelta(sourceStagedOperationDelta{required: []sourceStagedOperationRequest{s.root}}).required[0]
	return &out
}

func sameOriginalGetNativeCallee(a, b *sourceOriginalGetNativeCallee) bool {
	return a == b || a != nil && b != nil && sameOperationRequest(a.root, b.root) && a.get == b.get && a.kind == b.kind && a.method == b.method && a.generation == b.generation
}

func validOriginalGetNativeCalleeHeader(s *sourceOriginalGetNativeCallee) bool {
	if s == nil || s.generation == nil || s.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(s.method)) || s.kind != sourceNativeObjectDefineProperty && s.kind != sourceNativeObjectGetOwnPropertyDescriptor {
		return false
	}
	r := s.root
	call := r.producer.operation
	return call != nil && ast.IsCallExpression(call) && s.get == call.Expression() && ast.IsPropertyAccessExpression(s.get) && validStagedMemberParent(r) && r.producer.kind == relativeDemandEffects && r.producer.selector == (sourceStagedOperationSelector{}) && r.producer.declaration == r.consumer && r.inputs == nil && r.use == call && r.cut == (sourceRelativeCut{operation: call, use: call, reading: call}) && sourceStagedOccurrenceOwned(call, r.consumer)
}

func originalNativeCalleeGetMutationReader(n *sourceOriginalGetNativeCallee) sourceStagedOperationRequest {
	return nativeRootDebtRequest(&sourceStagedNativeGetSource{request: n.root, get: n.get}, "callee-get")
}

func validOriginalCalleeGetMutationInterest(i *sourceOriginalGetMutationInterest) bool {
	if i == nil || !validOriginalGetNativeCalleeHeader(i.nativeCallee) || i.generation != i.nativeCallee.generation || i.operation != i.nativeCallee.get || i.receiver != nil || i.descriptor != nil || i.method != nil || i.nativeKind != 0 || !sameOperationRequest(i.nativeRoot, sourceStagedOperationRequest{}) || i.queryCut != (sourceRelativeCut{}) || i.physicalCut != (sourceRelativeCut{}) || !sameOperationRequest(i.reading, sourceStagedOperationRequest{}) {
		return false
	}
	reader := originalNativeCalleeGetMutationReader(i.nativeCallee)
	return sameOperationRequest(i.origin, reader) && sameOperationRequest(i.parent, reader)
}

func originalCalleeGetMutationInterestSourceMatches(i *sourceOriginalGetMutationInterest, s *sourceOriginalGetMutationSource) bool {
	return validOriginalCalleeGetMutationInterest(i) && validOriginalCalleeGetMutationSource(s) && sameOriginalGetNativeCallee(i.nativeCallee, s.nativeCallee) && sameOperationRequest(i.parent, s.request) && i.generation == s.generation
}

// The standard data-slot arm is conditional. Its exact indexed population,
// authored getter outputs and unknown alternatives remain independent debt.
func validOriginalCalleeGetMutationSource(s *sourceOriginalGetMutationSource) bool {
	if s == nil || !validOriginalGetNativeCalleeHeader(s.nativeCallee) || s.record != nil || s.nativeTarget != nil || s.ownMember != nil || s.intrinsicPrototype || s.mode != accessorAcquire {
		return false
	}
	n := s.nativeCallee
	_, property := accessorReceiver(n.get)
	slot := sourceStandardLibraryMethodData
	if n.kind == sourceNativeObjectDefineProperty {
		slot = sourceStandardObjectDefineProperty
	}
	return s.generation == n.generation && s.operation == n.root.producer.operation && sameOperationRequest(s.request, originalNativeCalleeGetMutationReader(n)) && s.standard == n.method && s.kind == n.kind && s.property == property && property != "" && s.slot == slot && s.receiverKind == sourceNativeObjectConstructor && s.queryCut.operation == s.operation && sameOperationRequest(s.coverage, stagedMemberCoverageRequest(n.root, s.origin, s.queryCut))
}

// Header currentness checks registered source ownership only. The callee Get's
// genuine finishing observation remains a required child, not an admission
// prerequisite for describing the conditional mutation outputs it may discover.
func (work *callableEffectWork) originalNativeCalleeGetMutationHeaderCurrent(n *sourceOriginalGetNativeCallee) bool {
	if !validOriginalGetNativeCalleeHeader(n) || work.operationGeneration != n.generation || !n.generation.active {
		return false
	}
	root := work.operationRecipes[n.root.producer]
	getRequest := originalNativeCalleeGetMutationReader(n)
	callee := work.operationRecipes[getRequest.producer]
	return validNativeGetRecipe(root) && root.nativeGet != nil && sameOperationRequest(root.nativeGet.request, n.root) && root.nativeGet.get == n.get && root.nativeGet.kind == n.kind && root.nativeGet.method == n.method && validNativeGetRecipe(callee) && sameNativeGetSource(callee.nativeGet, root.nativeGet)
}

func (work *callableEffectWork) originalCalleeGetMutationCurrent(s *sourceOriginalGetMutationSource) bool {
	if !validOriginalCalleeGetMutationSource(s) || !work.originalNativeCalleeGetMutationHeaderCurrent(s.nativeCallee) {
		return false
	}
	coverage := work.operationRecipes[s.coverage.producer]
	return validStagedMemberCoverageRecipe(coverage) && coverage.memberSource.generation == work.operationGeneration && sameOperationRequest(coverage.memberSource.parent, s.nativeCallee.root) && sameOperationRequest(coverage.memberSource.request, s.coverage) && coverage.memberSource.coverage.origin == s.origin && coverage.memberSource.coverage.cut == s.queryCut && work.memberCoverageObserved[coverage.key] == work.operationGeneration && sameOriginalGetMutationCoveragePartition(s, coverage.memberSource.coverage)
}

func (work *callableEffectWork) originalCalleeGetMutationInterestCurrent(recipe sourceStagedOperationRecipe) bool {
	return recipe.memberSource != nil && validOriginalCalleeGetMutationInterest(recipe.memberSource.originalGetMutationInterest) && work.originalNativeCalleeGetMutationHeaderCurrent(recipe.memberSource.originalGetMutationInterest.nativeCallee)
}

// originalNativeCalleeGetMutationPublisher is a stack-only authority check.
// Neither a detached header nor a cloned query can issue a pending interest or
// bind a SOURCE payload without the original selected native Get interval.
func (work *callableEffectWork) originalNativeCalleeGetMutationPublisher(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource) bool {
	if q == nil || q.owner == nil || q.executable == nil || source == nil || !q.dependenciesOnly || q.operation != nil || q.inputs != nil || work.operationGeneration == nil || !work.operationGeneration.active || q.owner.generation != work.operationGeneration || q.owner.program != work.operationGeneration.program || q.owner.checker != work.operationGeneration.checker {
		return false
	}
	b := q.stagedNativeGet
	if b == nil || b.issuer != q || b.owner != q.owner || b.generation != work.operationGeneration || b.sourceWork != work || b.sourceEpoch != work.operationEpoch || b.call != source.request.producer.operation || !sameOperationRequest(b.getRequest, source.request) || !b.canonical || b.contextual || q.protectedMember != source.get || q.effectOwner != source.request.consumer {
		return false
	}
	// The Get's live semantic cut is not its canonical graph request cut. A
	// function SOURCE query keeps use=nil; module evaluation keeps its Call use.
	var use *ast.Node
	if runtimeModuleEvaluation(source.request.consumer) {
		use = b.call
	}
	if q.relativeInputCut(b.call) != (sourceRelativeCut{operation: b.call, use: use, reading: b.call, initializing: b.call}) || q.normalBindingCall != nil {
		return false
	}
	actor, known := work.memberNodes[q.effectOwner]
	if !known || actor < 0 || actor >= len(facts) || len(facts) != len(work.operationFacts) || &facts[actor] != &work.operationFacts[actor] || facts[actor].node != q.effectOwner || facts[actor].sourceFile == nil || work.operationGeneration.program.GetSourceFile(facts[actor].sourceFile.FileName()) != facts[actor].sourceFile {
		return false
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	return publisher != nil && publisher.live && publisher.fact == &facts[actor] && publisher.workRegistrar != nil
}

// registerOriginalNativeCalleeGetMutationInterest reserves a passive header at
// genuine selection, before inventory can yield. It does not execute the Call,
// observe a finished Get, adopt an unused output, or manufacture a DATA reader.
func (work *callableEffectWork) registerOriginalNativeCalleeGetMutationInterest(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource) bool {
	if !work.originalNativeCalleeGetMutationPublisher(facts, q, source) {
		return false
	}
	n := &sourceOriginalGetNativeCallee{root: source.request, get: source.get, kind: source.kind, method: source.method, generation: work.operationGeneration}
	if !work.originalNativeCalleeGetMutationHeaderCurrent(n) {
		return false
	}
	origin := originalNativeCalleeGetMutationReader(n)
	i := &sourceOriginalGetMutationInterest{origin: origin, parent: origin, operation: n.get, nativeCallee: n, generation: work.operationGeneration}
	return work.registerOriginalGetMutationInterest(facts, i)
}

// describeOriginalNativeCalleeGetMutationSource consumes the same original
// standard Get event as the generic full-Call source, but names only its Get
// reader. All coverage/candidate descriptions are copied, never re-enumerated.
func (work *callableEffectWork) describeOriginalNativeCalleeGetMutationSource(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, read *sourceMemberWriterReadCut, base *sourceOriginalGetMutationSource) (*sourceOriginalGetMutationSource, bool) {
	if base == nil || base.record != nil || base.nativeTarget != nil || base.nativeCallee != nil || base.ownMember != nil || !validOriginalGetMutationSource(base) || q == nil || !q.liveStagedMemberSource(q.stagedMember, get, read) {
		return nil, false
	}
	root := work.operationRecipes[base.request.producer].nativeGet
	if !work.originalNativeCalleeGetMutationPublisher(facts, q, root) || !sameOperationRequest(q.stagedMember.request, root.request) || base.operation != get.operation || base.queryCut != q.relativeInputCut(get.operation) || !sameOperationRequest(base.request, root.request) || base.kind != root.kind || base.standard != root.method {
		return nil, false
	}
	n := &sourceOriginalGetNativeCallee{root: root.request, get: root.get, kind: root.kind, method: root.method, generation: work.operationGeneration}
	if !work.originalNativeCalleeGetMutationHeaderCurrent(n) {
		return nil, false
	}
	out := cloneOriginalGetMutationSource(base)
	out.nativeCallee = n
	out.request = originalNativeCalleeGetMutationReader(n)
	if !validOriginalGetMutationSource(out) {
		return nil, false
	}
	return out, true
}

func (work *callableEffectWork) originalNativeCalleeGetMutationPublicationOwned(q *sourceValueQuery, get *sourceGetInputs, read *sourceMemberWriterReadCut, s *sourceOriginalGetMutationSource) bool {
	if !validOriginalCalleeGetMutationSource(s) || q == nil || !q.liveStagedMemberSource(q.stagedMember, get, read) || q.relativeInputCut(get.operation) != s.queryCut || s.operation != get.operation || !sameOperationRequest(q.stagedMember.request, s.nativeCallee.root) {
		return false
	}
	source := work.operationRecipes[s.nativeCallee.root.producer].nativeGet
	return work.originalNativeCalleeGetMutationPublisher(work.operationFacts, q, source) && work.originalNativeCalleeGetMutationHeaderCurrent(s.nativeCallee)
}

// publishOriginalNativeCalleeGetMutationSource uses the native Get's own
// publication domain. The map/field source-request command intentionally has
// no owner here. New coverage receives an actual early observation; an already
// sealed inventory may only be described unchanged under this same live Get.
// Neither branch issues a final Get observation or clears any dependency debt.
func (work *callableEffectWork) publishOriginalNativeCalleeGetMutationSource(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, read *sourceMemberWriterReadCut, s *sourceOriginalGetMutationSource) bool {
	if !work.originalNativeCalleeGetMutationPublicationOwned(q, get, read, s) {
		return false
	}
	b := q.stagedMember
	c := b.coverage
	if c == nil || c.generation != work.operationGeneration || b.mode != accessorAcquire || !sameOperationRequest(c.request, s.coverage) || c.origin != s.origin || c.cut != s.queryCut || c.nativeObserver != (sourceStagedNativeObserver{request: s.nativeCallee.root, get: s.nativeCallee.get, cut: s.queryCut}) {
		return false
	}
	prior, registered := work.operationRecipes[c.request.producer]
	if registered && prior.delta.extracted {
		// This detached view is used only by descriptive equality. It is not a
		// receipt, a publication command or a refresh of the prior observation.
		live := sourceStagedMemberDisposition{request: b.request, cut: q.relativeInputCut(get.operation), generation: b.generation, mode: b.mode, indexed: b.indexed && b.represented, delta: sourceStagedOperationDelta{required: b.required}}
		if !work.stagedMemberCoverageChildren(q, c) || !sameSealedMemberRequest(prior, b.request, c, live) {
			return false
		}
	} else if !q.publishStagedMemberDispositionPhase(get, read, stagedMemberEarlyObservation) {
		return false
	}
	if !work.originalNativeCalleeGetMutationPublicationOwned(q, get, read, s) || b.coverage != c {
		return false
	}
	// Early publication may preserve an older unextracted prefix. Read that
	// canonical cumulative description rather than dropping its pending arms or
	// changing the already captured physical/semantic identity.
	canonical := work.operationRecipes[c.request.producer]
	if !validStagedMemberCoverageRecipe(canonical) || canonical.memberSource.generation != work.operationGeneration || !sameOperationRequest(canonical.memberSource.parent, s.nativeCallee.root) || !sameOperationRequest(canonical.memberSource.request, s.coverage) || canonical.memberSource.coverage.origin != s.origin || canonical.memberSource.coverage.cut != s.queryCut || canonical.memberSource.coverage.nativeObserver != c.nativeObserver {
		return false
	}
	next := cloneOriginalGetMutationSource(s)
	next.population = originalGetMutationCoveragePopulation(canonical.memberSource.coverage)
	next.upstreamBodies = cloneStagedMemberFieldBodies(canonical.memberSource.coverage.fieldBodies)
	next.pending = next.pending || !b.indexed || !b.represented || !originalGetMutationCoveragePartitionComplete(canonical.memberSource.coverage)
	if !validOriginalGetMutationSource(next) || !work.registerOriginalGetMutationSource(facts, next) {
		return false
	}
	work.bindOriginalGetMutationInterests(facts, q, get, read, next)
	return true
}

// The main interest binder additionally validates the registered interest,
// SOURCE recipe and monotone unextracted refinement. This check lends only the
// exact actual callee publication to that existing transaction.
func (work *callableEffectWork) originalCalleeGetMutationInterestMatches(q *sourceValueQuery, get *sourceGetInputs, read *sourceMemberWriterReadCut, i *sourceOriginalGetMutationInterest, s *sourceOriginalGetMutationSource) bool {
	return originalCalleeGetMutationInterestSourceMatches(i, s) && work.originalNativeCalleeGetMutationPublicationOwned(q, get, read, s)
}
