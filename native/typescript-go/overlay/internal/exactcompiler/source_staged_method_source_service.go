package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
	"strings"
)

// sourceStagedMemberCallRequest describes the original executor's source demand.
// It carries no selected callee, construction result, Get receipt or invocation.
// The graph must issue the original Get again, including after a facts clone.
type sourceStagedMemberCallRequest struct {
	// nativeInput is a disjoint PRE-selection request, never a selected method.
	nativeInput bool
	// descriptorCallee covers component -1 only; arguments keep their original recovery.
	descriptorCallee bool
	occurrence       sourceStagedConstructedOccurrence
	generation       *projectGeneration
	required         []sourceStagedOperationRequest
}

func cloneStagedMemberCallRequest(source *sourceStagedMemberCallRequest) *sourceStagedMemberCallRequest {
	if source == nil {
		return nil
	}
	copy := *source
	copy.occurrence.sites = append([]*ast.Node(nil), source.occurrence.sites...)
	copy.occurrence.upstream = append([]*ast.Node(nil), source.occurrence.upstream...)
	copy.required = append([]sourceStagedOperationRequest(nil), source.required...)
	return &copy
}

func sameStagedMemberCallRequest(a, b *sourceStagedMemberCallRequest) bool {
	return a == b || a != nil && b != nil && a.nativeInput == b.nativeInput && a.descriptorCallee == b.descriptorCallee && a.generation == b.generation && sameOperationRequest(a.occurrence.request, b.occurrence.request) && a.occurrence.receiver == b.occurrence.receiver && slices.Equal(a.occurrence.sites, b.occurrence.sites) && slices.Equal(a.occurrence.upstream, b.occurrence.upstream) && operationPrefix(a.required, b.required, sameOperationRequest) && operationPrefix(b.required, a.required, sameOperationRequest)
}

func requestedMemberCallCandidate(occurrence sourceStagedConstructedOccurrence) sourceStagedMemberCandidate {
	call := occurrence.request.use
	cut := sourceRelativeCut{operation: call, reading: call, initializing: call}
	if runtimeModuleEvaluation(occurrence.request.consumer) {
		cut.use = call
	}
	return sourceStagedMemberCandidate{request: occurrence.request, operation: call, protocol: true, invoking: true, cut: cut, value: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: call.Expression(), producer: call, cut: cut}}
}

func validStagedMemberCallSourceRequest(description *sourceStagedMemberCallRequest, source *sourceStagedMemberSource) bool {
	if description != nil && description.descriptorCallee {
		return validDescriptorCalleeRequest(description, source)
	}
	if description != nil && description.nativeInput {
		return validNativeWriterSourceRequest(description, source)
	}
	if description == nil || source == nil || source.call == nil || description.generation == nil || description.generation != source.generation || !sameOperationRequest(description.occurrence.request, source.parent) || description.occurrence.receiver != source.parent.use.Expression().Expression() || len(description.occurrence.sites) == 0 {
		return false
	}
	expected := requestedMemberCallCandidate(description.occurrence)
	if !sameOperationRequest(source.request, stagedMemberCandidateRequest(source.parent, expected)) || source.candidate.cut != expected.cut || source.candidate.value.expression != expected.value.expression {
		return false
	}
	for _, site := range description.occurrence.sites {
		if site == nil || !ast.IsNewExpression(site) || ast.GetSourceFileOfNode(site) != ast.GetSourceFileOfNode(source.parent.use) || site.AsNewExpression().Arguments != nil && len(site.AsNewExpression().Arguments.Nodes) != 0 {
			return false
		}
	}
	for _, required := range description.required {
		supported := false
		for _, site := range description.occurrence.sites {
			supported = supported || required.producer.operation == site && required.producer.kind == relativeDemandEffects && (required.producer.selector == (sourceStagedOperationSelector{}) || required.producer.selector.occurrence == site.Expression() && strings.HasPrefix(required.producer.selector.field, "construction:") && slices.Contains(stagedConstructionPhases[:], strings.TrimPrefix(required.producer.selector.field, "construction:"))) && required.reading == (sourceStagedOperationKey{})
		}
		for _, upstream := range description.occurrence.upstream {
			supported = supported || required.producer.operation == upstream && (required.producer.kind == relativeDemandEffects || required.producer.kind == relativeDemandDirectExposure)
		}
		for _, branch := range source.call.standard {
			for _, child := range standardMemberCallRequirements(&branch) {
				supported = supported || sameOperationRequest(required, child)
			}
		}
		if !supported || required.inputs != nil || !sourceStagedOccurrenceOwned(required.use, required.producer.declaration) {
			return false
		}
	}
	return true
}

// Only the source request variant may gain the actual original origin at its
// callback. Stable request identity, physical cut and all required prefixes stay.
func sameRequestedMemberCallSource(a, b *sourceStagedMemberSource) bool {
	if a == nil || b == nil || a.call == nil || b.call == nil || !sameStagedMemberCallRequest(a.call.sourceRequest, b.call.sourceRequest) || a.call.sourceRequest == nil {
		return false
	}
	x, y := a.candidate, b.candidate
	x.origin, y.origin = nil, nil
	return sameStagedMemberCandidate(x, y)
}

func (work *callableEffectWork) requestedMemberCallSupported(recipe sourceStagedOperationRecipe) bool {
	return validStagedMemberCallRecipe(recipe) && recipe.memberSource.generation == work.operationGeneration && recipe.memberSource.call.sourceRequest != nil
}

// requestedWriterSourceSupported validates a source description, not a current
// local law. The shared task still has to execute its original source owner.
func (work *callableEffectWork) requestedWriterSourceSupported(recipe sourceStagedOperationRecipe) bool {
	return work.requestedMemberCallSupported(recipe) || validNativeInputInvocationRecipe(recipe) && recipe.nativeGet.inputInvocation.generation == work.operationGeneration
}

func writerSourceReading(recipe sourceStagedOperationRecipe, coverage sourceStagedOperationRequest) sourceStagedOperationRequest {
	if recipe.nativeGet != nil {
		return nativeInputInvocationReading(recipe.nativeGet.inputInvocation.request, coverage)
	}
	return stagedStandardMemberCallReading(recipe.memberSource.request, coverage)
}

func (work *callableEffectWork) describedWriterSourceReading(request sourceStagedOperationRequest) bool {
	return work.describedNativeInputInvocationReading(request) || work.acceptedStandardMemberCallReading(request)
}

func (work *callableEffectWork) writerSourceRecipe(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest) (sourceStagedOperationRecipe, bool, bool) {
	recipe, current := work.currentNativeInputInvocationSource(r.call)
	if recipe.nativeGet != nil {
		caller, known := work.memberNodes[recipe.key.declaration]
		publisher := q.executable.pendingMemberPublishers[recipe.key.declaration]
		if !known || caller < 0 || caller >= len(facts) || !work.requestedWriterSourceSupported(recipe) || recipe.nativeGet.request.consumer != recipe.key.declaration || !stagedNativeInputSourceOwner(&facts[caller], r.call, q.executable) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] {
			return sourceStagedOperationRecipe{}, false, false
		}
		if b := q.stagedMember; q.stagedNativeGet == nil && b != nil && b.getPreparation.live(q) && b.getPreparation.work == work {
			// Use the existing wrapper for both early and already-published sources;
			// its exact original direct-input child remains a required obligation.
			wrapper, described := work.describeNativeWriterSourceRequest(facts, q, r)
			return wrapper, described && work.nativeObserverProducerCurrent(wrapper), described
		}
		return recipe, current, true
	}
	if recipe, described := work.describeNativeWriterSourceRequest(facts, q, r); described {
		return recipe, work.nativeObserverProducerCurrent(recipe), true
	}
	if recipe, described := work.describeNativeWriterScopeRequest(facts, q, r, true); described {
		return recipe, work.descriptorCalleeCurrent(recipe), true
	}
	return work.writerMethodSourceRecipe(facts, q, r)
}

func (work *callableEffectWork) writerMethodSourceRecipe(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest) (sourceStagedOperationRecipe, bool, bool) {
	caller, known := work.memberNodes[stagedNativeInputInvocationOwner(r.call)]
	if !known {
		return sourceStagedOperationRecipe{}, false, false
	}
	occurrence := stagedConstructedOccurrenceAt(&facts[caller], r.call, q.executable)
	if occurrence == nil {
		return sourceStagedOperationRecipe{}, false, false
	}
	candidate := requestedMemberCallCandidate(*occurrence)
	request := stagedMemberCandidateRequest(occurrence.request, candidate)
	recipe, current := work.currentNativeObserverProducer(facts, q, r.call)
	if !current {
		if prior, exists := work.operationRecipes[request.producer]; exists {
			if !validStagedMemberCallRecipe(prior) || len(prior.memberSource.call.values) != 0 {
				return sourceStagedOperationRecipe{}, false, false
			}
			recipe = prior
		} else {
			recipe = sourceStagedOperationRecipe{key: request.producer, memberSource: &sourceStagedMemberSource{request: request, parent: occurrence.request, candidate: candidate, generation: work.operationGeneration, call: &sourceStagedMemberCall{}}}
		}
		if recipe.memberSource.call.sourceRequest == nil {
			if len(occurrence.sites) == 0 {
				return sourceStagedOperationRecipe{}, false, false
			}
			description := &sourceStagedMemberCallRequest{occurrence: *occurrence, generation: work.operationGeneration}
			for _, site := range occurrence.sites {
				index := q.owner.index(ast.GetSourceFileOfNode(site))
				if !stagedWeakMapConstructionCandidate(site, q.executable, index) {
					return sourceStagedOperationRecipe{}, false, false
				}
				owner := sourceStagedEvaluationOwner(site)
				if owner == nil {
					owner = sourceStagedModuleOwner(site)
				}
				producer, provided := work.memberNodes[owner]
				if !provided || q.executable.pendingMemberPublishers[owner] == nil {
					return sourceStagedOperationRecipe{}, false, false
				}
				root, described := work.describeStagedConstructionEffects(facts, producer, site, q.executable)
				if !described {
					return sourceStagedOperationRecipe{}, false, false
				}
				description.required = appendEntryLawRequirement(description.required, root)
				for _, phase := range stagedConstructionPhases {
					description.required = appendEntryLawRequirement(description.required, stagedConstructionRequest(root, phase))
				}
			}
			for _, upstream := range occurrence.upstream {
				original := stagedConstructedOccurrenceAt(&facts[caller], upstream, q.executable)
				if original == nil {
					return sourceStagedOperationRecipe{}, false, false
				}
				upstreamRecipe := work.operationRecipes[original.request.producer]
				if len(upstreamRecipe.constructedGroup) == 0 {
					// A producer-only DATA demand precedes its real selected group.
					// The existing result owner must later retain every member-result
					// child; no source observation/currentness is supplied here.
					pending, described := work.describeConstructedResultProducer(facts, caller, *original, q, r)
					if !described {
						return sourceStagedOperationRecipe{}, false, false
					}
					description.required = appendEntryLawRequirement(description.required, pending)
					continue
				} // Per-group DATA children still require authentic group publication.
				description.required = appendEntryLawRequirement(description.required, original.request)
				for _, source := range upstreamRecipe.constructedGroup {
					description.required = appendEntryLawRequirement(description.required, constructedMemberRequest(&source, "member-result"))
				}
			}
			if recipe.delta.extracted {
				description.required = append([]sourceStagedOperationRequest(nil), recipe.delta.required...)
			}
			source := *recipe.memberSource
			call := *source.call
			call.sourceRequest = description
			source.call = &call
			recipe.memberSource = &source
			recipe.delta = cloneOperationDelta(recipe.delta)
			for _, child := range description.required {
				recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, child)
			}
			if !validStagedMemberCallRecipe(recipe) {
				return sourceStagedOperationRecipe{}, false, false
			}
			if _, exists := work.operationRecipes[recipe.key]; exists {
				if !work.attachOperationSource(facts, recipe) {
					return sourceStagedOperationRecipe{}, false, false
				}
			} else if !work.registerOperationRecipe(facts, recipe) {
				return sourceStagedOperationRecipe{}, false, false
			}
		}
	}
	return recipe, current, true
}

// registerWriterSource is the single actual-ticket setup for member,
// construction and native observer parents. It never evaluates a callee here.
func (work *callableEffectWork) registerWriterSource(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest) {
	if getPreparationWriterScopeReading(r) || work.registerGetPreparationWriterSource(facts, q, r) {
		return
	}
	if declarationWriterScopeReading(r) {
		return
	}
	if q == nil || r == nil || !r.live || r.issuer != q || r.consumer != q.effectOwner || q.inputs != nil || q.operation != nil || q.owner == nil || q.owner.generation == nil || q.owner.generation != work.operationGeneration || q.executable == nil || q.executable.project == nil || q.owner.generation != q.executable.project.activeGeneration || r.graph != q.executable.writerInputFacts[q.effectOwner] || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) {
		return
	}
	consumer, known := work.memberNodes[q.effectOwner]
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if !known || publisher == nil || !publisher.live || publisher.fact != &facts[consumer] {
		return
	}
	native := q.stagedNativeGet
	if native != nil {
		if native.issuer != q || native.sourceWork != work || native.owner != q.owner || native.generation != work.operationGeneration || native.sourceEpoch != nil && native.sourceEpoch != work.operationEpoch || len(native.observations) == 0 {
			return
		}
	} else if b := q.stagedMember; b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage == nil {
		return
	}
	// Preserve the exact reading already issued by this original parent. A
	// later selected description cannot substitute a new reader into sealed C.
	if retained, reading, ok := work.retainedWriterSourceReading(q, r); ok {
		work.registerRetainedWriterSource(facts, q, r, retained, reading)
		return
	}
	recipe, current, described := work.writerSourceRecipe(facts, q, r)
	if !described {
		return
	}
	request := nativeObserverProducerRequest(recipe)
	if !work.writerSourceRegistrationCompatible(r, request) {
		return
	}
	caller := work.memberNodes[request.producer.declaration]
	if recipe.memberSource != nil {
		if description := recipe.memberSource.call.sourceRequest; description != nil {
			for _, child := range description.required {
				producer, provided := work.memberNodes[child.producer.declaration]
				if !provided || producer == caller {
					continue
				}
				edge := request.edge + ":source-availability:" + child.edge
				if runtimeModuleEvaluation(facts[producer].node) {
					work.requireSourceModuleAvailability(facts, caller, producer, edge, request.use, request.cut)
				} else {
					work.requireStagedSummary(facts, caller, producer, edge, request.use, request.cut)
				}
			}
		}
	}

	if native != nil {
		key := nativeRootDebtRequest(&sourceStagedNativeGetSource{request: native.getRequest, get: native.call.Expression()}, "callee-get").producer
		if callee, exists := work.operationRecipes[key]; exists {
			if !validNativeGetRecipe(callee) {
				return
			}
			work.bindNativeObserverInput(facts, q, r, recipe, current)
			return
		} // The same candidate's native attachment owns this parent.
		b := q.stagedMember
		if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage == nil || !sameOperationRequest(b.request, native.getRequest) {
			return
		}
	}
	b := q.stagedMember
	reading := writerSourceReading(recipe, b.coverage.request)
	work.requireWriterSourceAvailability(facts, consumer, recipe, b.request)
	if !work.requireStagedMemberChild(facts, q, reading) {
		return
	}
	id, adopted := work.requireOperation(facts, reading)
	if !adopted {
		return
	}
	work.attachWriterSourceDependencies(facts, id)
	r.writerSource, r.writerSourceWork, r.writerSourceIssuer, r.writerSourceReading = request, work, r, reading
	if native != nil {
		native.sourceEpoch = work.operationEpoch
		work.bindNativeObserverInput(facts, q, r, recipe, current)
	}
	if current {
		work.publishNativeObserverProducer(facts, id, q.executable)
	}
}

func (work *callableEffectWork) requireWriterSourceAvailability(facts []callableFacts, consumer int, recipe sourceStagedOperationRecipe, parent sourceStagedOperationRequest) {
	root := nativeObserverProducerRoot(recipe)
	producer, known := work.memberNodes[root.consumer]
	if !known || producer == consumer {
		return
	}
	edge := root.edge + ":source-availability:" + parent.edge
	if runtimeModuleEvaluation(facts[producer].node) {
		work.requireSourceModuleAvailability(facts, consumer, producer, edge, parent.use, parent.cut)
	} else {
		work.requireStagedSummary(facts, consumer, producer, edge, parent.use, parent.cut)
	}
}

func (work *callableEffectWork) attachWriterSourceDependencies(facts []callableFacts, id sourceStagedOperationID) {
	work.attachSourceObservationDependencies(facts, id)
}

// writerSourceParentOwned revalidates the original parent at consumption,
// including handled-pending. A live request cannot lend a revoked Get owner.
func (work *callableEffectWork) writerSourceParentOwned(q *sourceValueQuery, r *sourceWriterInputRequest) bool {
	if !work.describedWriterSourceReading(r.writerSourceReading) {
		return false
	}
	if n := q.stagedNativeGet; n != nil {
		association, known := work.nativeObserverInputAssociation(r.writerSourceReading)
		return known && n.issuer == q && n.sourceWork == work && n.sourceEpoch == work.operationEpoch && n.owner == q.owner && n.generation == work.operationGeneration && sameOperationRequest(association.observer.request, n.getRequest) && q.relativeInputCut(association.observer.cut.operation) == association.observer.cut
	}
	b := q.stagedMember
	return b != nil && b.coverage != nil && q.liveStagedMemberSource(b, b.get, b.read) && r.writerSourceReading.reading == b.coverage.request.producer && sameOperationRequest(r.writerSourceReading, writerSourceReading(work.operationRecipes[r.writerSource.producer], b.coverage.request))
}

func (work *callableEffectWork) consumeWriterSource(q *sourceValueQuery, r *sourceWriterInputRequest) sourceStagedWriterCallDisposition {
	if getPreparationWriterScopeReading(r) {
		return work.consumeGetPreparationWriterSource(q, r)
	}
	if declarationWriterScopeReading(r) {
		return work.consumeDeclarationWriterScope(q, r)
	}
	if r == nil || r.writerSourceIssuer != r || r.writerSourceWork != work || !r.live || r.issuer != q || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) || r.consumer != q.effectOwner || !work.writerSourceParentOwned(q, r) {
		return sourceStagedWriterCallDisposition{}
	}
	id, adopted := work.operationIDs[r.writerSourceReading.producer]
	if !adopted {
		return sourceStagedWriterCallDisposition{}
	}
	if !work.writerSourceLocallyReady(work.operationRecipes[r.writerSource.producer]) {
		handled := work.writerSourceTaskOwned(id)
		if handled {
			work.observeNativeEffectsPending(q, r)
		}
		if nativeWriterScopeRequested(work.operationRecipes[r.writerSource.producer]) {
			return sourceStagedWriterCallDisposition{compilerPending: handled}
		}
		return sourceStagedWriterCallDisposition{handled: handled}
	}
	if descriptorCalleeRequested(work.operationRecipes[r.writerSource.producer]) {
		return work.consumeDescriptorCallee(q, r, id)
	}
	if q.stagedNativeGet != nil && r.writerSourceReading.reading.selector.field == "callee-get" {
		disposition := work.consumeNativeObserverInput(work.operationFacts, q, r)
		return sourceStagedWriterCallDisposition{handled: disposition.handled, excluded: disposition.excluded}
	}
	b := q.stagedMember
	if !work.describedWriterSourceReading(r.writerSourceReading) {
		return sourceStagedWriterCallDisposition{}
	}
	if n := q.stagedNativeGet; n != nil {
		coverage := work.operationRecipes[r.writerSourceReading.reading].memberSource
		if n.issuer != q || n.sourceWork != work || n.sourceEpoch != work.operationEpoch || coverage == nil || !validNativeObserverCoverage(coverage) || !sameOperationRequest(coverage.coverage.nativeObserver.request, n.getRequest) || q.relativeInputCut(coverage.coverage.cut.operation) != coverage.coverage.cut {
			return sourceStagedWriterCallDisposition{}
		}
	} else if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) {
		return sourceStagedWriterCallDisposition{}
	}
	work.publishNativeObserverProducer(work.operationFacts, id, q.executable)
	delivery, delivered := work.consumeOperation(id, r.writerSourceReading)
	if !delivered || !delivery.delta.extracted {
		return sourceStagedWriterCallDisposition{handled: true}
	}
	if n := q.stagedNativeGet; n != nil {
		n.selectionRequired = appendEntryLawRequirement(n.selectionRequired, r.writerSourceReading)
		n.selectionRequired = appendEntryLawRequirement(n.selectionRequired, nativeObserverProducerRoot(work.operationRecipes[r.writerSource.producer]))
	} else {
		producer := work.operationRecipes[r.writerSource.producer]
		if producer.nativeGet != nil {
			b.selectionRequired = appendEntryLawRequirement(b.selectionRequired, nativeObserverProducerRoot(producer))
		}
		b.selectionRequired = appendEntryLawRequirement(b.selectionRequired, r.writerSourceReading)
	}
	return sourceStagedWriterCallDisposition{handled: true, excluded: true}
}

// prepareRequestedWriterSource is an original source observation, not publication
// of cached branches. Only the original pending/final callbacks refine the role.
func (work *callableEffectWork) prepareRequestedWriterSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration || !work.requestedWriterSourceSupported(recipe) || state.writerSourceRunning {
		return
	}
	caller, known := work.memberNodes[recipe.key.declaration]
	publisher := owner.pendingMemberPublishers[recipe.key.declaration]
	if !known || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	if nativeWriterScopeRequested(recipe) && !facts[caller].staged.ready {
		return
	}
	work.attachWriterSourceDependencies(facts, id)
	state = &work.operations[id.index]
	revisions := work.sourceObservationRevisions(id)
	if revisions == nil {
		return
	}
	if state.writerSourceRevisions != nil && slices.Equal(state.writerSourceRevisions, revisions) {
		return
	}
	if !nativeWriterScopeRequested(recipe) || len(recipe.delta.required) != 0 {
		state.writerSourceRevisions = revisions
	}
	state.writerSourceRunning = true
	defer func() { work.operations[id.index].writerSourceRunning = false }()
	if !work.writerSourceTaskRunning(facts, id, owner) {
		return
	}
	if nativeWriterScopeRequested(recipe) {
		work.prepareNativeWriterSourceRequest(facts, id, owner)
	} else if recipe.nativeGet != nil {
		work.observeRequestedNativeInputInvocation(facts, id, owner)
	} else {
		// The member executor's supported conditional receiver requires the
		// original constructor alternatives, not closure of its Effects graph.
		// Callee/prototype phase subscriptions above requeue this same task.
		for _, site := range recipe.memberSource.call.sourceRequest.occurrence.sites {
			if construction, known := owner.standardConstructions[site]; !known || !construction.selectionComplete {
				return
			}
		}
		work.prepareStagedStandardMemberCall(facts, caller, recipe.key.operation, owner)
	}
	current := work.operationRecipes[recipe.key]
	if work.writerSourceLocallyReady(current) {
		work.prepareStagedMemberCall(facts, id, owner)
	} else if current.memberSource != nil && operationDeltaSize(current.delta) != 0 {
		work.publishOperation(id, current.delta)
	}
	work.attachWriterSourceDependencies(facts, id)
}

// afterWriterSourcePrerequisite uses the existing applied subscriber and queue.
// Repeated ACKs at one revision never poll or rerun an unchanged pending Get.
func (work *callableEffectWork) afterWriterSourcePrerequisite(id sourceStagedOperationID, request sourceStagedOperationRequest) {
	child := &work.operations[id.index]
	subscriber := child.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if subscriber == nil || subscriber.blocked || subscriber.applied != child.revision {
		return
	}
	for _, parent := range subscriber.writerSourceParents {
		if parent.epoch != work.operationEpoch || parent.index == 0 || int(parent.index) >= len(work.operations) {
			continue
		}
		state := &work.operations[parent.index]
		if !work.sourceObservationTaskSupported(parent) || work.requestedWriterSourceSupported(work.operationRecipes[state.key]) && work.writerSourceLocallyReady(work.operationRecipes[state.key]) {
			continue
		}
		revisions := work.sourceObservationRevisions(parent)
		changed := revisions != nil && !work.sourceObservationAttemptCurrent(parent, revisions)
		if !changed {
			continue
		}
		queued := false
		for _, task := range work.extractionQueue[work.extractionHead:] {
			queued = queued || task.operation == parent && !task.operationDone && !task.delivery
		}
		if !queued {
			continuation := callableExtractionTask{operation: parent}
			if source := work.installedCallTaskSource(parent); source != nil {
				continuation.callable = work.memberNodes[source.request.consumer]
			} else if source := work.getPreparationTaskSource(parent); source != nil {
				continuation.callable = work.memberNodes[source.parent.consumer]
			} else if source := work.nativeCreateTargetTaskSource(parent); source != nil {
				continuation.callable = work.memberNodes[source.request.consumer]
			} else if source := work.nativeEffectsTaskSource(parent); source != nil {
				continuation.callable = work.memberNodes[source.request.consumer]
			} else if source := work.nativeScopeGetTaskSource(parent); source != nil {
				continuation.callable = work.memberNodes[source.request.consumer]
			} else if source := work.reflectiveGetTaskSource(parent); source != nil {
				continuation.callable = work.memberNodes[source.request.consumer]
			} else if source := work.nativeEagerTaskSource(parent); source != nil {
				continuation.callable = work.memberNodes[source.request.consumer]
			} else if source := work.constructedResultProducerTask(parent); source != nil {
				continuation.callable = work.memberNodes[source.declaration]
			} else if source := work.constructedCoverageTaskSource(parent); source != nil {
				continuation.callable = work.memberNodes[source.request.consumer]
			}
			work.extractionQueue = append(work.extractionQueue, continuation)
		}
	}
}

func operationHasWriterSourceParents(state *sourceStagedOperationState) bool {
	for _, subscriber := range state.subscribers {
		if len(subscriber.writerSourceParents) != 0 {
			return true
		}
	}
	return false
}

// An ordinary source set resumes only after its exact method reading is ACKed.
// Native and construction parents use the existing fresh observation tasks.
func (work *callableEffectWork) afterWriterSourceDelivery(facts []callableFacts, id sourceStagedOperationID, request sourceStagedOperationRequest) {
	recipe := work.operationRecipes[request.producer]
	if !work.writerSourceLocallyReady(recipe) || request.reading == (sourceStagedOperationKey{}) {
		return
	}
	if _, native := work.nativeObserverInputAssociation(request); native {
		return
	} // Existing native reader owns this case.
	parent := work.operationRecipes[request.reading].memberSource
	if parent == nil || parent.coverage == nil || !work.describedWriterSourceReading(request) {
		return
	}
	var task callableExtractionTask
	if validNativeObserverCoverage(parent) {
		task = callableExtractionTask{operation: work.operationIDs[parent.request.producer], nativeInputReading: request, nativeInputRevision: work.operations[id.index].revision}
	} else if ast.IsNewExpression(parent.parent.use) {
		task = callableExtractionTask{operation: work.operationIDs[stagedConstructionRequest(parent.parent, "callee").producer]}
	} else {
		call := parent.parent.use
		if !ast.IsCallExpression(call) || !ast.IsPropertyAccessExpression(call.Expression()) {
			return
		}
		occurrence := sourceStagedConstructedOccurrence{request: parent.parent, receiver: call.Expression().Expression()}
		request := stagedMemberCandidateRequest(parent.parent, requestedMemberCallCandidate(occurrence))
		if !work.requestedWriterSourceSupported(work.operationRecipes[request.producer]) {
			return
		}
		task = callableExtractionTask{operation: work.operationIDs[request.producer]}
	}
	if task.operation.epoch != work.operationEpoch || task.operation.index == 0 {
		return
	}
	for _, queued := range work.extractionQueue[work.extractionHead:] {
		if !queued.operationDone && queued.operation == task.operation && queued.nativeInputRevision == task.nativeInputRevision && sameOperationRequest(queued.nativeInputReading, task.nativeInputReading) {
			return
		}
	}
	work.extractionQueue = append(work.extractionQueue, task)
}

func (work *callableEffectWork) resumableMethodParent(facts []callableFacts, b *sourceStagedMemberBorrow, owner *executableBodyOwner) bool {
	if b == nil || b.coverage == nil {
		return false
	}
	if ast.IsNewExpression(b.request.use) || validNativeObserverCoverage(&sourceStagedMemberSource{parent: b.request, coverage: b.coverage}) {
		return true
	}
	caller, known := work.memberNodes[b.request.consumer]
	if !known {
		return false
	}
	occurrence := stagedConstructedOccurrenceAt(&facts[caller], b.request.use, owner)
	if occurrence == nil {
		return false
	}
	request := stagedMemberCandidateRequest(occurrence.request, requestedMemberCallCandidate(*occurrence))
	recipe := work.operationRecipes[request.producer]
	return work.requestedMemberCallSupported(recipe)
}
