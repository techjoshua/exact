package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// declarationWriterScopeReading selects a root-use SOURCE scope channel, never
// a physical Get/C reader. The consumer separately authenticates its publisher,
// selected source, generation and actual delivery before retiring discovery.
func declarationWriterScopeReading(r *sourceWriterInputRequest) bool {
	return r != nil && r.writerSourceWork != nil && r.writerSourceIssuer == r && r.writerSourceReading.reading == (sourceStagedOperationKey{}) && r.writerSourceReading.producer.operation != nil && sameOperationRequest(r.writerSourceReading, r.writerSource)
}

// declarationWriterScopePublisher authenticates the original synchronous source
// request in this work's actual fact registry. Nested acquisition keeps its own
// semantic cuts; this authentication supplies no physical Get observation.
func (work *callableEffectWork) declarationWriterScopePublisher(facts []callableFacts, owner *executableBodyOwner, publisher *sourcePendingMemberPublisher, q *sourceValueQuery, r *sourceWriterInputRequest) bool {
	if work == nil || owner == nil || owner.values == nil || owner.project == nil || publisher == nil || !publisher.live || publisher.fact == nil || publisher.workRegistrar == nil || publisher.workRegistrar.writerScopeSource == nil || q == nil || r == nil || !r.live || r.issuer != q || q.executable != owner || q.owner == nil || q.owner.program != owner.values.program || q.owner.checker != owner.checker || q.owner.checker != owner.values.checker || q.owner.generation == nil || q.owner.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || !work.operationGeneration.active || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || r.consumer != q.effectOwner || r.use != q.effectUse() || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) || r.graph != owner.writerInputFacts[r.consumer] || r.member == nil || r.member.publisher != publisher || r.member.phase == memberRevoked || r.member.demand == nil || owner.pendingMemberPublishers[r.consumer] != publisher || publisher.fact.node != r.consumer || r.call == nil || !ast.IsCallExpression(r.call) || !sourceStagedOccurrenceOwned(r.call, r.consumer) {
		return false
	}
	caller, known := work.memberNodes[r.consumer]
	return known && caller >= 0 && caller < len(facts) && caller < len(work.operationFacts) && publisher.fact == &facts[caller] && publisher.fact == &work.operationFacts[caller] && publisher.fact.sourceFile != nil && owner.values.program.GetSourceFile(publisher.fact.sourceFile.FileName()) == publisher.fact.sourceFile && ast.GetSourceFileOfNode(r.call) == publisher.fact.sourceFile
}

// sourceStagedDeclarationScopeParent is a synchronous dependency-owner view.
// A live original producer or its existing source task owns preselection debt.
// An optional Effects issuer is separate. This view never enters a description.
type sourceStagedDeclarationScopeParent struct {
	request      sourceStagedOperationRequest
	source       *sourceStagedNativeGetSource
	id           sourceStagedOperationID
	issuer       *sourceStagedNativeEffectsIssuer
	preparation  *sourceStagedGetPreparationBorrow
	registration *sourceStagedDeclarationNativeRegistration
}

// declarationWriterScopeNativeSource authenticates registration ownership, not
// a physical Get. It can retain a source-root debt before a native branch exists.
// declarationWriterScopeSource authenticates a SOURCE parent, not a physical
// Get. A genuine generic preparation issuer and a native Get issuer remain
// disjoint; neither can lend the other's observation or algorithm authority.
func (work *callableEffectWork) declarationWriterScopeSource(q *sourceValueQuery, r *sourceWriterInputRequest) (sourceStagedDeclarationScopeParent, bool) {
	if q == nil {
		return sourceStagedDeclarationScopeParent{}, false
	}
	if q != nil && q.stagedNativeGet == nil && q.stagedMember != nil {
		preparation := q.stagedMember.getPreparation
		if preparation.live(q) && preparation.work == work && r != nil && r.issuer == q && r.live && r.consumer == preparation.request.consumer && r.original == ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) {
			return sourceStagedDeclarationScopeParent{request: preparation.request, id: preparation.id, preparation: preparation}, true
		}
	}
	return work.declarationWriterScopeNativeSource(q, r)
}

func (work *callableEffectWork) declarationWriterScopeNativeSource(q *sourceValueQuery, r *sourceWriterInputRequest) (sourceStagedDeclarationScopeParent, bool) {
	var parent sourceStagedDeclarationScopeParent
	if work == nil || q == nil || r == nil || r.member == nil || r.member.publisher == nil || !work.declarationWriterScopePublisher(work.operationFacts, q.executable, r.member.publisher, q, r) {
		return parent, false
	}
	n := q.stagedNativeGet
	if n == nil || n.issuer != q || n.sourceWork != work || n.sourceEpoch != work.operationEpoch || n.owner != q.owner || n.generation != work.operationGeneration || n.call == nil || n.call == r.call || n.getRequest.use != n.call {
		return parent, false
	}
	parent.request = n.getRequest
	issuer := n.effectsIssuer
	if issuer.live() && issuer.work == work && issuer.owner == q.executable && issuer.fact == r.member.publisher.fact && sameOperationRequest(issuer.request, n.getRequest) {
		parent.issuer = issuer
	}
	root, described := work.operationRecipes[n.getRequest.producer]
	if described {
		if !validNativeGetRecipe(root) || !sameOperationRequest(root.nativeGet.request, n.getRequest) || root.nativeGet.get != n.call.Expression() {
			return sourceStagedDeclarationScopeParent{}, false
		}
		parent.source = root.nativeGet
		parent.id = work.operationIDs[nativeRootDebtRequest(root.nativeGet, "callee-get").producer]
		if parent.id.index != 0 && (parent.id.epoch != work.operationEpoch || int(parent.id.index) >= len(work.operations) || work.operations[parent.id.index].invalid) {
			return sourceStagedDeclarationScopeParent{}, false
		}
	}
	// This context remains on the original registrar stack. It lends only
	// description/adoption before a physical Get; no observation is supplied.
	registration := &sourceStagedDeclarationNativeRegistration{query: q, request: r, native: n, work: work, owner: q.executable, publisher: r.member.publisher, consumer: r.consumer, use: r.use, original: r.original, parent: n.getRequest, epoch: work.operationEpoch, generation: work.operationGeneration}
	registration.self = registration
	parent.registration = registration
	return parent, true
}

// registerDeclarationWriterScope uses existing standard-method source owners.
// It does not look up a receiver, install a native method, invoke a body or
// normalize an acquisition cut. Unsupported/mixed sources retain their debt.
func (work *callableEffectWork) registerDeclarationWriterScope(facts []callableFacts, owner *executableBodyOwner, publisher *sourcePendingMemberPublisher, q *sourceValueQuery, r *sourceWriterInputRequest) {
	if !work.declarationWriterScopePublisher(facts, owner, publisher, q, r) || r.writerSourceWork != nil {
		return
	}
	parent, supported := work.declarationWriterScopeSource(q, r)
	if !supported {
		return
	}
	defer parent.revokeRegistration()
	var recipe sourceStagedOperationRecipe
	var described bool
	if parent.preparation != nil {
		recipe, _, described = work.writerSourceRecipe(facts, q, r)
	} else {
		recipe, described = work.declarationNativeWriterScopeRecipe(facts, q, r, parent.registration)
	}
	if !described || !validStagedMemberCallRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || recipe.memberSource.request.consumer != r.consumer || recipe.key.declaration != r.consumer || recipe.key.operation != r.call {
		return
	}
	reading := recipe.memberSource.request
	if reading.reading != (sourceStagedOperationKey{}) || reading.inputs != nil {
		return
	}
	// The actual source-root factory exists before its use can be adopted.
	if !work.registerOperationUse(facts, sourceStagedOperationUse{request: reading}) {
		return
	}
	id := work.operationIDs[reading.producer]
	// Adoption registers the exact child's prerequisites before ownership checks.
	// Queuing its use alone does not establish dependency ownership.
	work.attachWriterSourceDependencies(facts, id)
	if parent.preparation == nil && !work.nativeScopeRootOwned(reading, parent.request) || parent.preparation != nil && !work.getPreparationChildOwned(parent.request, reading) {
		return
	}
	// An absent native factory is not fabricated. The same live issuer retains
	// the debt for its actual selected/finishing Get publisher instead.
	if !work.retainDeclarationScopeParent(facts, q, parent, reading) {
		return
	}
	if !work.nativeScopeParentCanCommit(q, parent, reading) {
		return // Debt stays on this Get; inherited physical recovery is unchanged.
	}
	// This transaction names only a root-use source reader. Inherited physical
	// binders must not substitute a C reading after this adoption succeeds.
	r.bindWriterReading(reading, reading, work)
}

// declarationWriterScopeRequirementAllowed is this scope route's admission
// boundary, not a Get receipt. An observed or sealed parent may reuse an exact
// declared child; a different child belongs to an earlier registration interval.
func (work *callableEffectWork) declarationWriterScopeRequirementAllowed(parent sourceStagedOperationID, reading sourceStagedOperationRequest) bool {
	if parent.epoch != work.operationEpoch || parent.index == 0 || int(parent.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[parent.index]
	recipe := work.operationRecipes[state.key]
	return !state.invalid && (!state.delta.extracted && !recipe.delta.extracted || operationContainsRequest(recipe.delta.required, reading))
}

// declarationWriterScopeDependency requires a real subscriber/backref owned by
// the original Get task. It supplies a pending continuation, not local readiness.
func (work *callableEffectWork) declarationWriterScopeDependency(parent, id sourceStagedOperationID, reading sourceStagedOperationRequest) bool {
	if parent == id || parent.epoch != work.operationEpoch || id.epoch != work.operationEpoch || parent.index == 0 || id.index == 0 || int(parent.index) >= len(work.operations) || int(id.index) >= len(work.operations) {
		return false
	}
	p, c := &work.operations[parent.index], &work.operations[id.index]
	if p.invalid || c.invalid || c.key != reading.producer || !p.dependenciesRegistered || !c.dependenciesRegistered || !operationContainsRequest(work.operationRecipes[p.key].delta.required, reading) {
		return false
	}
	required := false
	for _, d := range p.dependencies {
		required = required || d.producer == id && sameOperationRequest(d.request, reading)
	}
	sub := c.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	if !required || sub == nil || sub.blocked || !sameOperationRequest(sub.request, reading) {
		return false
	}
	for _, backref := range sub.writerSourceParents {
		if backref == parent {
			return true
		}
	}
	return false
}

// consumeDeclarationWriterScope consumes only the existing typed native or
// constructed source-scope disposition at the original semantic request.
// Descriptor delivery covers only its callee component. Normal values,
// returned DATA, native C/selection and original argument Effects stay separate.
func (work *callableEffectWork) consumeDeclarationWriterScope(q *sourceValueQuery, r *sourceWriterInputRequest) sourceStagedWriterCallDisposition {
	if !declarationWriterScopeReading(r) || r.writerSourceWork != work || q == nil || q.executable == nil {
		return sourceStagedWriterCallDisposition{}
	}
	publisher := q.executable.pendingMemberPublishers[r.consumer]
	if !work.declarationWriterScopePublisher(work.operationFacts, q.executable, publisher, q, r) {
		return sourceStagedWriterCallDisposition{}
	}
	parent, supported := work.declarationWriterScopeSource(q, r)
	defer parent.revokeRegistration()
	id := work.operationIDs[r.writerSourceReading.producer]
	if !supported || !work.declarationScopeParentOwned(q, parent, id, r.writerSourceReading) {
		return sourceStagedWriterCallDisposition{}
	}
	if descriptorCalleeRequested(work.operationRecipes[r.writerSource.producer]) {
		recipe := work.operationRecipes[r.writerSource.producer]
		if !work.descriptorCalleeCurrent(recipe) {
			return sourceStagedWriterCallDisposition{compilerPending: work.declarationWriterScopePending(parent, id)}
		}
		return work.consumeDescriptorCallee(q, r, id)
	}
	recipe, current := work.currentEnrolledNativeObserverProducer(work.operationFacts, q, r.call, r.writerSource)
	if !current {
		return sourceStagedWriterCallDisposition{compilerPending: work.declarationWriterScopePending(parent, id)}
	}
	// This is an existing complete standard-only invocation/source contract, not
	// an inference from empty Effects, syntax, a storage count or root extraction.
	if recipe.memberSource == nil || !sameOperationRequest(recipe.memberSource.request, r.writerSource) {
		return sourceStagedWriterCallDisposition{}
	}
	work.publishNativeObserverProducer(work.operationFacts, id, q.executable)
	delivery, delivered := work.consumeOperation(id, r.writerSourceReading)
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{r.writerSourceReading.consumer, r.writerSourceReading.edge}]
	if !delivered || !delivery.delta.extracted || state.revision == 0 || sub == nil || sub.blocked || sub.consumed != state.revision || sub.applied != state.revision {
		return sourceStagedWriterCallDisposition{compilerPending: true}
	}
	return sourceStagedWriterCallDisposition{handled: true, excluded: true}
}
