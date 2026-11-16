package exactcompiler

import (
	"slices"
)

// This is a live extraction interval, never a receipt or cached continuation.
// The original Get owner temporarily captures its selected standard and proof
// here, then the same helper's restored source context issues target C.
type sourceDescriptorTargetExecution struct {
	self        *sourceDescriptorTargetExecution
	work        *callableEffectWork
	id          sourceStagedOperationID
	owner       *executableBodyOwner
	fact        *callableFacts
	generation  *projectGeneration
	source      *sourceStagedNativeGetSource
	query       *sourceValueQuery
	borrow      *sourceStagedNativeGetBorrow
	get         *sourceGetInputs
	selected    sourceValue
	selectedCut sourceRelativeCut
	publishing  bool
}

type sourceDescriptorTargetRevision struct {
	request  sourceStagedOperationRequest
	producer sourceStagedOperationID
	revision uint64
}

func descriptorTargetBaseRequired(source *sourceStagedNativeGetSource) ([]sourceStagedOperationRequest, bool) {
	if !validDescriptorRetrieval(source) {
		return nil, false
	}
	inputs, eligible := descriptorInputRequirements(source.descriptorRead)
	if !eligible {
		return nil, false
	}
	required := []sourceStagedOperationRequest{nativeRootDebtRequest(source, "callee-get")}
	for _, input := range inputs {
		required = appendEntryLawRequirement(required, input)
	}
	return required, true
}

func descriptorTargetFactorySame(a, b *sourceDescriptorTargetSource) bool {
	return a != nil && b != nil && a.generation == b.generation && sameNativeGetSource(a.source, b.source) && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.algorithm, b.algorithm)
}

func descriptorTargetRefinementAllowed(prior, next sourceStagedOperationRecipe) bool {
	a, b := prior.descriptorTarget, next.descriptorTarget
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	if sameDescriptorTargetSource(a, b) {
		return true
	}
	return descriptorTargetFactorySame(a, b) && !prior.delta.extracted && !a.enumerated && b.enumerated && operationPrefix(a.required, b.required, sameOperationRequest)
}

// Target work exists only after a strong SOURCE reader adopts its exact C.
// Nominal native result DATA remains independent of this obligation.
func (work *callableEffectWork) descriptorStrongTargetDemand(source *sourceStagedNativeGetSource) bool {
	if !validDescriptorRetrieval(source) || source.descriptorRead.generation != work.operationGeneration {
		return false
	}
	request := descriptorTargetRequest(source)
	recipe, present := work.operationRecipes[request.producer]
	id, adopted := work.operationIDs[request.producer]
	if !present || !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid || !validDescriptorTargetRecipe(recipe) || !sameNativeGetSource(recipe.descriptorTarget.source, source) {
		return false
	}
	for _, subscriber := range work.operations[id.index].subscribers {
		if subscriber == nil {
			continue
		}
		for _, parent := range subscriber.writerSourceParents {
			if parent.epoch != work.operationEpoch || parent.index == 0 || int(parent.index) >= len(work.operations) {
				continue
			}
			reader := work.operationRecipes[work.operations[parent.index].key]
			if validDescriptorStrongReaderRecipe(reader) && sameOperationRequest(reader.memberSource.descriptorStrong.target, request) {
				return true
			}
		}
	}
	return false
}

// registerDescriptorTargetDemand creates descriptions, not source observation.
// Its actual input factories have already been registered by the result owner.
func (work *callableEffectWork) registerDescriptorTargetDemand(facts []callableFacts, source *sourceStagedNativeGetSource) (sourceStagedOperationRequest, bool) {
	if !validDescriptorRetrieval(source) || source.descriptorRead.generation != work.operationGeneration {
		return sourceStagedOperationRequest{}, false
	}
	required, supported := descriptorTargetBaseRequired(source)
	if !supported {
		return sourceStagedOperationRequest{}, false
	}
	request := descriptorTargetRequest(source)
	if prior, present := work.operationRecipes[request.producer]; present {
		if !validDescriptorTargetRecipe(prior) || !sameNativeGetSource(prior.descriptorTarget.source, source) {
			return sourceStagedOperationRequest{}, false
		}
		return prior.descriptorTarget.request, true
	}
	plan := &sourceDescriptorTargetSource{request: request, algorithm: nativeRootDebtRequest(source, "algorithm"), source: source, generation: work.operationGeneration, required: required}
	recipe := sourceStagedOperationRecipe{key: request.producer, descriptorTarget: plan, delta: sourceStagedOperationDelta{required: required}}
	if !work.registerOperationRecipe(facts, recipe) {
		return sourceStagedOperationRequest{}, false
	}
	return request, true
}

func (e *sourceDescriptorTargetExecution) live(facts []callableFacts) bool {
	if e == nil || e.self != e || e.work == nil || e.work.descriptorTargetExecution != e || e.owner == nil || e.owner.values == nil || e.owner.values.program == nil || e.owner.project == nil || e.generation == nil || !e.generation.active || e.owner.project.activeGeneration != e.generation || e.generation != e.work.operationGeneration || e.owner.values.generation != e.generation || e.owner.values.program != e.generation.program || e.owner.checker != e.generation.checker || e.source == nil || e.id.epoch != e.work.operationEpoch || e.id.index == 0 || int(e.id.index) >= len(e.work.operations) {
		return false
	}
	caller, known := e.work.memberNodes[e.source.request.consumer]
	p := e.owner.pendingMemberPublishers[e.source.request.consumer]
	return known && caller < len(facts) && caller >= 0 && e.fact == &facts[caller] && e.fact.sourceFile != nil && p != nil && p.live && p.fact == e.fact && e.owner.values.program.GetSourceFile(e.fact.sourceFile.FileName()) == e.fact.sourceFile && sameNativeGetSource(e.work.operationRecipes[e.source.request.producer].nativeGet, e.source)
}

func (e *sourceDescriptorTargetExecution) publicationOwned(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource) bool {
	return e.live(facts) && e.publishing && e.query == q && e.borrow != nil && e.borrow.issuer == q && q.stagedNativeGet == e.borrow && e.borrow.sourceObserved && e.get != nil && e.get.operation == source.get && q.executable == e.owner && q.owner.generation == e.generation && sameNativeGetSource(source, e.source) && e.selected.node == source.method && e.selected.native != nil && e.selected.native.kind == source.kind && e.work.descriptorStrongTargetDemand(source)
}

// captureDescriptorTargetGet is called only by the original complete Get's
// finish owner. It copies no authority into a recipe and issues no target C.
func (work *callableEffectWork) captureDescriptorTargetGet(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource, get *sourceGetInputs, selected sourceValue, proof sourceStagedNativeCalleeEffects, e *sourceDescriptorTargetExecution) {
	if e == nil || !e.live(facts) || e != work.descriptorTargetExecution || !sameNativeGetSource(e.source, source) || q == nil || q.owner == nil || q.executable != e.owner || q.owner.generation != e.generation || q.stagedNativeGet == nil || q.stagedNativeGet.issuer != q || !q.stagedNativeGet.finishing || q.stagedNativeGet.sourceWork != work || q.stagedNativeGet.call != source.request.producer.operation || get == nil || get.operation != source.get || selected.node != source.method || selected.native == nil || selected.native.kind != source.kind || selected.native.referencesIncomplete || len(selected.path) != 0 || !validStagedNativeCalleeEffects(proof, source) || proof.cut != q.relativeInputCut(source.request.producer.operation) {
		return
	}
	e.query, e.borrow, e.get, e.selected, e.selectedCut = q, q.stagedNativeGet, get, selected, proof.cut
}

// finishDescriptorTargetGet runs after the same maintained helper has admitted
// its genuine callee proof. The query now has its actual restored Call cuts;
// neither the earlier Get cut nor caller bindings are reinstalled/normalized.
func (work *callableEffectWork) finishDescriptorTargetGet(facts []callableFacts, q *sourceValueQuery, request sourceStagedNativeRequest, occurrence *sourceStagedNativeOccurrence) {
	e := request.descriptorTarget
	if e == nil || !e.live(facts) || e.query != q || e.borrow != q.stagedNativeGet || e.borrow == nil || e.borrow.issuer != q || occurrence == nil || occurrence.work != work || occurrence.generation != e.generation || occurrence.callee == nil || occurrence.callee.cut != e.selectedCut || !validStagedNativeCalleeEffects(*occurrence.callee, occurrence.source) || !sameNativeGetSource(occurrence.source, e.source) || !work.nativeEffectsGetCurrent(occurrence.source) {
		return
	}
	e.publishing = true
	defer func() { e.publishing = false }()
	q.publishOriginalDescriptorTarget(request.call, e.selected, nil)
}

func (work *callableEffectWork) prepareDescriptorTargetSource(facts []callableFacts, task callableExtractionTask, owners []*executableBodyOwner) {
	id := task.operation
	if len(owners) != 1 || owners[0] == nil || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || task.delivery {
		return
	}
	owner := owners[0]
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !validDescriptorTargetRecipe(recipe) || recipe.descriptorTarget.generation != work.operationGeneration || !work.descriptorStrongTargetDemand(recipe.descriptorTarget.source) {
		return
	}
	work.attachDescriptorTargetDependencies(facts, id)
	if work.operations[id.index].invalid {
		return
	}
	if !recipe.descriptorTarget.enumerated || work.operations[id.index].descriptorTargetObservation == nil {
		source := work.operationRecipes[recipe.descriptorTarget.source.request.producer].nativeGet
		if !validDescriptorRetrieval(source) {
			return
		}
		// Existing strong Get renewal retains its own issuer. This role cannot
		// manufacture a nativeEffectsIssuer or rewrite its observation vector.
		if source.effectsSource != nil && !work.nativeEffectsGetCurrent(source) {
			work.queueDescriptorTargetOriginalGet(source)
			return
		}
		for position := range recipe.descriptorTarget.inputs {
			if _, applied := work.descriptorInputData(source.descriptorRead, position); !applied {
				return
			}
		}
		vector, ready := work.descriptorTargetPrerequisiteVector(id)
		if !ready || slices.EqualFunc(vector, work.operations[id.index].descriptorTargetAttempt, func(a, b sourceDescriptorTargetRevision) bool {
			return a.producer == b.producer && a.revision == b.revision && sameOperationRequest(a.request, b.request)
		}) {
			return
		}
		caller, known := work.memberNodes[source.request.consumer]
		publisher := owner.pendingMemberPublishers[source.request.consumer]
		if !known || caller < 0 || caller >= len(facts) || task.callable != caller || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || owner.values == nil || owner.values.generation != work.operationGeneration || owner.project == nil || owner.project.activeGeneration != work.operationGeneration {
			return
		}
		issued := false
		for _, queued := range work.extractionQueue {
			issued = issued || queued.operation == id && queued.callable == caller && !queued.delivery
		}
		if !issued {
			return
		}
		previous := work.descriptorTargetExecution
		e := &sourceDescriptorTargetExecution{work: work, id: id, owner: owner, fact: &facts[caller], generation: work.operationGeneration, source: source}
		e.self = e
		work.descriptorTargetExecution = e
		func() {
			defer func() {
				work.descriptorTargetExecution = previous
				e.self = nil
				e.work = nil
				e.query = nil
				e.borrow = nil
				e.get = nil
				e.owner = nil
				e.fact = nil
				e.selected = sourceValue{}
			}()
			work.operations[id.index].descriptorTargetAttempt = append([]sourceDescriptorTargetRevision(nil), vector...)
			request := sourceStagedNativeRequest{request: source.request, call: source.request.producer.operation, get: source.get, algorithmKind: source.kind, descriptorTarget: e}
			work.observeSelectedNativeGetSource(facts, caller, request, owner)
		}()
	}
	recipe = work.operationRecipes[work.operations[id.index].key]
	observation := work.operations[id.index].descriptorTargetObservation
	if !validDescriptorTargetRecipe(recipe) || !recipe.descriptorTarget.enumerated || !recipe.descriptorTarget.represented || observation == nil || observation.work != work || observation.epoch != work.operationEpoch || !sameDescriptorTargetSource(observation.source, recipe.descriptorTarget) {
		return
	}
	recipe.delta.extracted = true
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, recipe.delta)
	}
}

func appendDescriptorTargetDependency(out []sourceStagedOperationDependency, next sourceStagedOperationDependency) []sourceStagedOperationDependency {
	for _, prior := range out {
		if prior.producer == next.producer && sameOperationRequest(prior.request, next.request) {
			return out
		}
	}
	return append(out, next)
}

// Watch only this source's explicit children and the maintained Get owner's
// already-issued relevant prefix. No full Effects cone or source world scan.
func (work *callableEffectWork) descriptorTargetDependencies(id sourceStagedOperationID) []sourceStagedOperationDependency {
	out := append([]sourceStagedOperationDependency(nil), work.operations[id.index].dependencies...)
	recipe := work.operationRecipes[work.operations[id.index].key]
	if recipe.descriptorTarget == nil {
		return out
	}
	get := work.operationIDs[nativeRootDebtRequest(recipe.descriptorTarget.source, "callee-get").producer]
	if get.epoch == work.operationEpoch && get.index != 0 && int(get.index) < len(work.operations) {
		for _, child := range work.sourceObservationDependencies(get) {
			out = appendDescriptorTargetDependency(out, child)
		}
	}
	return out
}

func (work *callableEffectWork) attachDescriptorTargetDependencies(facts []callableFacts, id sourceStagedOperationID) {
	work.registerOperationDependencies(facts, id)
	for _, dependency := range work.descriptorTargetDependencies(id) {
		if dependency.producer.epoch != work.operationEpoch || dependency.producer.index == 0 || int(dependency.producer.index) >= len(work.operations) {
			continue
		}
		state := &work.operations[dependency.producer.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{dependency.request.consumer, dependency.request.edge}]
		if subscriber == nil || !sameOperationRequest(subscriber.request, dependency.request) {
			continue
		}
		if !slices.Contains(subscriber.writerSourceParents, id) {
			subscriber.writerSourceParents = append(subscriber.writerSourceParents, id)
		}
		if state.revision != 0 && subscriber.applied != state.revision {
			work.queueOperationDelivery(state)
		}
	}
}

func (work *callableEffectWork) descriptorTargetPrerequisiteVector(id sourceStagedOperationID) ([]sourceDescriptorTargetRevision, bool) {
	var vector []sourceDescriptorTargetRevision
	for _, dependency := range work.descriptorTargetDependencies(id) {
		if dependency.producer.epoch != work.operationEpoch || dependency.producer.index == 0 || int(dependency.producer.index) >= len(work.operations) {
			return nil, false
		}
		state := &work.operations[dependency.producer.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{dependency.request.consumer, dependency.request.edge}]
		if state.invalid || subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, dependency.request) {
			return nil, false
		}
		vector = append(vector, sourceDescriptorTargetRevision{dependency.request, dependency.producer, state.revision})
	}
	return vector, true
}

// An existing genuine native Effects issuer renews its own observation. The
// target role schedules that original task but cannot manufacture its issuer.
func (work *callableEffectWork) queueDescriptorTargetOriginalGet(source *sourceStagedNativeGetSource) {
	id := work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
	if work.nativeEffectsTaskSource(id) == nil {
		return
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery {
			return
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[source.request.consumer], operation: id})
}

// This notification follows a genuine fresh native Get admission. It schedules
// the result-owned task; an ACK alone cannot call it or issue a target event.
func (work *callableEffectWork) afterDescriptorTargetNativeGet(source *sourceStagedNativeGetSource) {
	if !validDescriptorRetrieval(source) || !work.nativeEffectsGetCurrent(source) {
		return
	}
	recipe := work.operationRecipes[descriptorTargetRequest(source).producer]
	if !validDescriptorTargetRecipe(recipe) || !work.descriptorStrongTargetDemand(source) {
		return
	}
	work.queueDescriptorTargetTask(recipe.key)
}
