package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeEffectsRequest describes an original ordinary Effects demand.
// It carries no Get observation, selected result, invocation or current law.
// Clones retain this description and rebuild their own tasks and observations.
type sourceStagedNativeEffectsRequest struct {
	request    sourceStagedOperationRequest
	generation *projectGeneration
}

type sourceStagedNativeEffectsPending struct {
	source, reading, coverage sourceStagedOperationRequest
	cut                       sourceRelativeCut
}

// The self-issued interval belongs to the actual collector or an adopted source
// task. Only detached factories survive it; no query, callback or frame is kept.
type sourceStagedNativeEffectsIssuer struct {
	self         *sourceStagedNativeEffectsIssuer
	work         *callableEffectWork
	owner        *executableBodyOwner
	fact         *callableFacts
	facts        []callableFacts
	caller       int
	call         *ast.Node
	request      sourceStagedOperationRequest
	task         sourceStagedOperationID
	eager        *sourceStagedNativeEagerExecution
	generation   *projectGeneration
	pending      []sourceStagedNativeEffectsPending
	scopePending []sourceStagedOperationRequest // Ephemeral original SOURCE roots, never physical C readings.
	issued       bool
	active       bool
}

func sameNativeEffectsRequest(a, b *sourceStagedNativeEffectsRequest) bool {
	return a == b || a != nil && b != nil && a.generation == b.generation && sameOperationRequest(a.request, b.request)
}
func cloneNativeEffectsRequest(p *sourceStagedNativeEffectsRequest) *sourceStagedNativeEffectsRequest {
	if p == nil {
		return nil
	}
	copy := *p
	return &copy
}
func validNativeEffectsRequest(recipe sourceStagedOperationRecipe) bool {
	s := recipe.nativeGet
	return s != nil && s.effectsSource != nil && s.effectsSource.generation != nil && recipe.key == s.request.producer && sameOperationRequest(s.effectsSource.request, s.request) && validStagedMemberParent(s.request) && s.get == s.request.use.Expression() && stagedNativeAlgorithmKind(s.kind) && s.method != nil && standardLibrarySource(ast.GetSourceFileOfNode(s.method))
}
func (work *callableEffectWork) nativeEffectsTaskSource(id sourceStagedOperationID) *sourceStagedNativeGetSource {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	s := recipe.nativeGet
	if s == nil {
		return nil
	}
	root := work.operationRecipes[s.request.producer]
	if !validNativeGetRecipe(recipe) || !validNativeGetRecipe(root) || !validNativeEffectsRequest(root) || root.nativeGet.effectsSource.generation != work.operationGeneration || !sameNativeGetSource(s, root.nativeGet) || recipe.key != s.request.producer && recipe.key != nativeRootDebtRequest(s, "callee-get").producer {
		return nil
	}
	return root.nativeGet
}
func (issuer *sourceStagedNativeEffectsIssuer) live() bool {
	if issuer == nil || issuer.self != issuer || !issuer.active || issuer.work == nil || issuer.owner == nil || issuer.owner.values == nil || issuer.owner.project == nil || issuer.generation == nil || issuer.generation != issuer.work.operationGeneration || issuer.generation != issuer.owner.project.activeGeneration || issuer.caller < 0 || issuer.caller >= len(issuer.facts) || &issuer.facts[issuer.caller] != issuer.fact || issuer.fact.node != issuer.request.consumer || issuer.fact.normalInputs != nil {
		return false
	}
	p := issuer.owner.pendingMemberPublishers[issuer.fact.node]
	if p == nil || !p.live || p.fact != issuer.fact || issuer.owner.values.program.GetSourceFile(issuer.fact.sourceFile.FileName()) != issuer.fact.sourceFile || !stagedNativeInputSourceOwner(issuer.fact, issuer.call, issuer.owner) {
		return false
	}
	if issuer.eager != nil {
		return issuer.eager.liveChild(issuer)
	}
	if issuer.task.index == 0 {
		return issuer.work.extracting == issuer.caller
	}
	if target := issuer.work.nativeCreateTargetTaskSource(issuer.task); target != nil {
		call, _ := nativeReflectiveTargetCall(target, issuer.owner)
		if call == nil {
			return false
		}
		expected, valid := stagedNativeInputOccurrenceRequest(issuer.fact, call)
		if prior := issuer.work.operationRecipes[expected.producer].nativeGet; prior != nil {
			expected = prior.request
		}
		return valid && call == issuer.call && sameOperationRequest(expected, issuer.request) && issuer.work.operations[issuer.task.index].writerSourceRunning && issuer.work.liveNativeEffectsExecution(issuer.task, issuer.owner, issuer.fact)
	}
	parent := issuer.work.nativeEffectsTaskSource(issuer.task)
	if parent == nil || !issuer.work.operations[issuer.task.index].writerSourceRunning || !issuer.work.liveNativeEffectsExecution(issuer.task, issuer.owner, issuer.fact) {
		return false
	}
	if issuer.call == parent.request.use {
		return true
	}
	algorithm := issuer.work.operationRecipes[nativeRootDebtRequest(parent, "algorithm").producer].nativeGet
	return issuer.work.nativeEffectsGetCurrent(parent) && algorithm != nil && algorithm.input != nil && validStagedNativeInputPlan(*algorithm.input, algorithm) && algorithm.input.input.expression == issuer.call && ast.IsCallExpression(issuer.call)
}
func (work *callableEffectWork) beginNativeEffectsIssuer(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner, task sourceStagedOperationID) *sourceStagedNativeEffectsIssuer {
	if owner == nil || owner.values == nil || caller < 0 || caller >= len(facts) {
		return nil
	}
	request, ok := stagedNativeInputOccurrenceRequest(&facts[caller], call)
	if !ok {
		return nil
	}
	if prior := work.operationRecipes[request.producer].nativeGet; prior != nil {
		request = prior.request
	}
	issuer := &sourceStagedNativeEffectsIssuer{work: work, owner: owner, facts: facts, fact: &facts[caller], caller: caller, call: call, request: request, task: task, generation: owner.values.generation, active: true}
	issuer.self = issuer
	// The first original source query may precede every operation registration.
	if work.operationGeneration == nil {
		work.operationGeneration = issuer.generation
	}
	if !issuer.live() {
		return nil
	}
	return issuer
}

// observeNativeEffectsPending records the actual handled-pending decision. An
// incomplete bit, a cached C or an unowned writer cannot create this demand.
func (work *callableEffectWork) observeNativeEffectsPending(q *sourceValueQuery, r *sourceWriterInputRequest) {
	if q == nil || q.stagedNativeGet == nil || r == nil {
		return
	}
	n := q.stagedNativeGet
	issuer := n.effectsIssuer
	if !issuer.live() || issuer.work != work || issuer.call != n.call || q.executable != issuer.owner || n.issuer != q || n.owner != q.owner || n.generation != issuer.generation || !r.live || r.issuer != q || r.writerSourceIssuer != r || r.writerSourceWork != work || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) || !work.writerSourceParentOwned(q, r) {
		return
	}
	b := q.stagedMember
	if b == nil || b.coverage == nil || !q.liveStagedMemberSource(b, b.get, b.read) {
		return
	}
	pending := sourceStagedNativeEffectsPending{source: r.writerSource, reading: r.writerSourceReading, coverage: b.coverage.request, cut: b.coverage.cut}
	if pending.reading.reading == pending.coverage.producer {
		if !operationContainsRequest(b.coverage.required, pending.reading) {
			return
		}
	} else {
		association, known := work.nativeObserverInputAssociation(pending.reading)
		if !known || !sameOperationRequest(association.coverage, pending.coverage) || !sameOperationRequest(association.observer.request, issuer.request) || q.relativeInputCut(association.observer.cut.operation) != association.observer.cut {
			return
		}
	}
	if !work.nativeEffectsPendingOwned(pending, issuer.request) {
		return
	}
	for _, prior := range issuer.pending {
		if sameOperationRequest(prior.reading, pending.reading) && sameOperationRequest(prior.coverage, pending.coverage) {
			return
		}
	}
	issuer.pending = append(issuer.pending, pending)
}
func (work *callableEffectWork) nativeEffectsPendingOwned(p sourceStagedNativeEffectsPending, parent sourceStagedOperationRequest) bool {
	c := work.operationRecipes[p.coverage.producer]
	source := work.operationRecipes[p.source.producer]
	id := work.operationIDs[p.reading.producer]
	if !validStagedMemberCoverageRecipe(c) || c.memberSource.generation != work.operationGeneration || !sameOperationRequest(c.memberSource.parent, parent) || !sameOperationRequest(c.memberSource.request, p.coverage) || c.memberSource.coverage.cut != p.cut || !work.requestedWriterSourceSupported(source) || !work.describedWriterSourceReading(p.reading) || p.source.producer != p.reading.producer || !work.writerSourceTaskOwned(id) {
		return false
	}
	if p.reading.reading != p.coverage.producer {
		association, known := work.nativeObserverInputAssociation(p.reading)
		if !known || !sameOperationRequest(association.coverage, p.coverage) || !sameOperationRequest(association.observer.request, parent) || association.observer.cut != p.cut {
			return false
		}
	}
	st := &work.operations[id.index]
	sub := st.subscribers[sourceStagedOperationConsumer{p.reading.consumer, p.reading.edge}]
	return sub != nil && !sub.blocked && sameOperationRequest(sub.request, p.reading)
}

// nativeEffectsModuleInputAdmission retains renewal for this authentic standalone
// selected interval. The successful input callback licenses only an Effects
// continuation; complete Get admission and its exact dependencies remain separate.
func (work *callableEffectWork) nativeEffectsModuleInputAdmission(q *sourceValueQuery, source *sourceStagedNativeGetSource, issuer *sourceStagedNativeEffectsIssuer) bool {
	if source == nil || q == nil || q.owner == nil || !issuer.live() || issuer.task.index != 0 || issuer.eager != nil || issuer.work != work || q.executable != issuer.owner || q.owner.program != issuer.owner.values.program || q.owner.checker != issuer.owner.checker || q.owner.generation != issuer.generation || source.kind != sourceNativeObjectDefineProperties || !runtimeModuleEvaluation(source.request.consumer) || source.request.consumer != source.request.producer.declaration || enclosingCallableNode(source.request.use) != nil || !sourceStagedOccurrenceOwned(source.request.use, source.request.consumer) || !sameOperationRequest(source.request, issuer.request) {
		return false
	}
	b := q.stagedNativeGet
	if b == nil || b.issuer != q || b.effectsIssuer != issuer || b.owner != q.owner || b.sourceWork != work || b.sourceEpoch != work.operationEpoch || work.operationEpoch == nil || b.generation != issuer.generation || b.observation != nil || !b.canonical || !b.dataBranch || b.contextual || b.writerDependent || b.legacyPrepared || b.call != issuer.call || !sameOperationRequest(b.getRequest, source.request) || q.protectedMember != source.get || q.relativeInputCut(b.call) != (sourceRelativeCut{operation: b.call, use: b.call, reading: b.call, initializing: b.call}) {
		return false
	}
	return work.nativeEffectsFreshInertInputAdmission(q, source)
}

// nativeEffectsFreshInertInputAdmission consumes the successful callback in
// this SAME selected input interval, not a cached receipt/recipe or empty plan.
// It authorizes continuation enrollment only; complete Get/observations and
// every ordinary dependency still belong to their existing admission owners.
func (work *callableEffectWork) nativeEffectsFreshInertInputAdmission(q *sourceValueQuery, source *sourceStagedNativeGetSource) bool {
	if q == nil || q.stagedNativeGet == nil || source == nil {
		return false
	}
	b := q.stagedNativeGet
	a := b.eagerAdmission
	if a == nil || a.issuer != a || a.query != q || a.borrow != b || a.cut != q.relativeInputCut(b.call) || a.method != source.method {
		return false
	}
	eager := work.operationRecipes[nativeRootDebtRequest(source, "eager-inputs").producer]
	s := eager.nativeGet
	return s != nil && validNativeGetRecipe(eager) && validNativeDescriptorMapRecipe(eager) && sameNativeGetSource(s, source) && sameNativeEagerEvidence(a.evidence, nativeEagerEvidence(s)) && len(s.keySources) == 0 && len(s.moduleSources) == 0 && s.inputEffects && stagedMapInputsInert(s) && s.descriptorMap.target.expression != nil && ast.IsObjectLiteralExpression(s.descriptorMap.target.expression) && len(s.descriptorMap.target.expression.AsObjectLiteralExpression().Properties.Nodes) == 0
}

// nativeEffectsFunctionInputAdmission retains the original ordinary function
// collector's existing root/Get continuation for the audited inert input slice.
// This is not a function-prefix law, a source-only loan or execution permission.
// Its exact physical useNIL cut stays separate from the unchanged MODULE path.
func (work *callableEffectWork) nativeEffectsFunctionInputAdmission(q *sourceValueQuery, source *sourceStagedNativeGetSource, issuer *sourceStagedNativeEffectsIssuer) bool {
	if source == nil || q == nil || q.owner == nil || !issuer.live() || issuer.task.index != 0 || issuer.eager != nil || issuer.work != work || q.executable != issuer.owner || q.owner.program != issuer.owner.values.program || q.owner.checker != issuer.owner.checker || q.owner.generation != issuer.generation || source.kind != sourceNativeObjectDefineProperties || source.request.consumer == nil || !ast.IsFunctionLike(source.request.consumer) || source.request.consumer != source.request.producer.declaration || enclosingCallableNode(source.request.use) != source.request.consumer || !sourceStagedOccurrenceOwned(source.request.use, source.request.consumer) || !sameOperationRequest(source.request, issuer.request) {
		return false
	}
	b := q.stagedNativeGet
	if b == nil || b.issuer != q || b.effectsIssuer != issuer || b.owner != q.owner || b.sourceWork != work || b.sourceEpoch != work.operationEpoch || work.operationEpoch == nil || b.generation != issuer.generation || b.observation != nil || !b.canonical || !b.dataBranch || b.contextual || b.writerDependent || b.legacyPrepared || b.call != issuer.call || !sameOperationRequest(b.getRequest, source.request) || q.protectedMember != source.get || !work.nativeEagerPrimitiveDomain(q, source) || q.relativeInputCut(b.call) != (sourceRelativeCut{operation: b.call, reading: b.call, initializing: b.call}) {
		return false
	}
	return work.nativeEffectsFreshInertInputAdmission(q, source)
}

// registerNativeEffectsSource is called only inside the original selected
// branch publisher or the same actual finishing Get. This registers pending
// Effects, never a complete Get.
func (work *callableEffectWork) registerNativeEffectsSource(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, source *sourceStagedNativeGetSource, issuer *sourceStagedNativeEffectsIssuer) bool {
	if issuer == nil || len(issuer.pending) == 0 && len(issuer.scopePending) == 0 && !work.nativeEffectsInputUnprovided(source) && !issuer.nativeEffectsTaskChildAcquisition(source) && !work.nativeEffectsModuleInputAdmission(q, source, issuer) && !work.nativeEffectsFunctionInputAdmission(q, source, issuer) {
		return true
	}
	if !issuer.live() || issuer.work != work || q == nil || q.owner == nil || q.executable != issuer.owner || q.owner.generation != issuer.generation || q.stagedNativeGet == nil || q.stagedNativeGet.effectsIssuer != issuer || q.stagedNativeGet.effectsGet != get || q.stagedNativeGet.issuer != q || !sameOperationRequest(source.request, issuer.request) || source.get != issuer.call.Expression() {
		return false
	}
	// All scope requirements must be authentic before any selected source
	// metadata commits; they never enter the physical-C pending list.
	for _, reading := range issuer.scopePending {
		if !work.nativeScopeRootOwned(reading, source.request) || !operationContainsRequest(q.stagedNativeGet.selectionRequired, reading) {
			return false
		}
	}
	recipe := work.operationRecipes[nativeRootDebtRequest(source, "callee-get").producer]
	if len(issuer.scopePending) != 0 && !validNativeGetRecipe(recipe) {
		return false
	}
	for _, reading := range issuer.scopePending {
		if id := work.operationIDs[recipe.key]; (recipe.delta.extracted || id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) && work.operations[id.index].delta.extracted) && !operationContainsRequest(recipe.delta.required, reading) {
			return false
		}
		next := *recipe.nativeGet
		next.selectionRequired = appendEntryLawRequirement(append([]sourceStagedOperationRequest(nil), next.selectionRequired...), reading)
		recipe.nativeGet = &next
		recipe.delta = cloneOperationDelta(recipe.delta)
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, reading)
	}
	for _, p := range issuer.pending {
		if !work.nativeEffectsPendingOwned(p, source.request) {
			return false
		}
		var described bool
		recipe, described = work.nativeObserverRequirements(recipe, p.coverage, p.reading)
		if !described {
			return false
		}
	}
	if !work.attachOperationSource(facts, recipe) {
		return false
	}
	root := work.operationRecipes[source.request.producer]
	copy := *root.nativeGet
	copy.effectsSource = &sourceStagedNativeEffectsRequest{request: source.request, generation: issuer.generation}
	root.nativeGet = &copy
	if !validNativeEffectsRequest(root) || !work.attachOperationSource(facts, root) {
		return false
	}
	issuer.issued = true
	return true
}
func (work *callableEffectWork) adoptPendingNativeEffects(facts []callableFacts, occurrence *sourceStagedNativeOccurrence, issuer *sourceStagedNativeEffectsIssuer) bool {
	if !issuer.live() || !issuer.issued || len(issuer.pending) == 0 && len(issuer.scopePending) == 0 || occurrence == nil || occurrence.work != work || occurrence.generation != issuer.generation || occurrence.source == nil || !sameOperationRequest(occurrence.source.request, issuer.request) {
		return false
	}
	root := work.operationRecipes[issuer.request.producer]
	if !validNativeEffectsRequest(root) {
		return false
	}
	// Validate both disjoint lists before adopting any new SOURCE root. The
	// original physical pending guards remain independently enforced below.
	for _, p := range issuer.pending {
		if !work.nativeEffectsPendingOwned(p, issuer.request) {
			return false
		}
	}
	for _, reading := range issuer.scopePending {
		if !work.nativeScopeRootOwned(reading, issuer.request) {
			return false
		}
	}
	for _, reading := range issuer.scopePending {
		if _, ok := work.requireOperation(facts, reading); !ok {
			return false
		}
	}
	for _, p := range issuer.pending {
		if !work.nativeEffectsPendingOwned(p, issuer.request) {
			return false
		}
		if _, ok := work.requireOperation(facts, p.coverage); !ok {
			return false
		}
	}
	if issuer.task.index == 0 {
		if !work.registerOperationUse(facts, sourceStagedOperationUse{request: issuer.request}) {
			return false
		}
	} else if _, ok := work.requireOperation(facts, issuer.request); !ok {
		return false
	}
	id := work.operationIDs[issuer.request.producer]
	work.attachNativeEffectsDependencies(facts, id)
	get := work.operationIDs[nativeRootDebtRequest(root.nativeGet, "callee-get").producer]
	if get.index == 0 {
		return false
	}
	work.attachNativeEffectsDependencies(facts, get)
	owned := work.nativeEffectsTaskOwned(get) && work.nativeEffectsTaskOwned(id)
	if owned {
		// The genuine pending-Get adopter owns this same returned occurrence,
		// even though no successful Get currency is available yet.
		work.completeNativeInstallationMutationOccurrence(facts, occurrence)
	}
	return owned
}
