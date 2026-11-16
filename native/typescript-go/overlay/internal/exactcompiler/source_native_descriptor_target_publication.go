package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// The observation is graph-local. Cached descriptions do not inherit the
// selected original event, its live publisher, or permission to publish C.
type sourceDescriptorTargetObservation struct {
	work       *callableEffectWork
	epoch      *sourceStagedOperationEpoch
	generation *projectGeneration
	request    sourceStagedOperationRequest
	cut        sourceRelativeCut
	source     *sourceDescriptorTargetSource
}

// This borrow exists only inside the same selected native callback and is
// revoked before it returns. It never enters a sourceValue, recipe, or cache.
type sourceDescriptorTargetEvent struct {
	issuer     *sourceValueQuery
	work       *callableEffectWork
	publisher  *sourcePendingMemberPublisher
	generation *projectGeneration
	source     *sourceStagedNativeGetSource
	algorithm  sourceStagedOperationRequest
	cut        sourceRelativeCut
	inputs     [2]sourceDescriptorInputData
	live       bool
}

func (work *callableEffectWork) beginDescriptorTargetSource(facts []callableFacts, q *sourceValueQuery, algorithm sourceStagedOperationRequest, source *sourceStagedNativeGetSource, selected sourceValue) (*sourceDescriptorTargetEvent, func(), bool) {
	refuse := func() (*sourceDescriptorTargetEvent, func(), bool) { return nil, func() {}, false }
	if q == nil || q.owner == nil || q.owner.program == nil || q.owner.checker == nil || q.executable == nil || q.executable.values == nil || q.executable.project == nil || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || q.owner.generation == nil || q.owner.generation.program != q.owner.program || q.owner.generation.checker != q.owner.checker || q.owner.generation != work.operationGeneration || q.executable.project.activeGeneration != work.operationGeneration || q.executable.checker != q.owner.checker || q.executable.values.program != q.owner.program || q.executable.values.generation != q.owner.generation || !validDescriptorRetrieval(source) || !sourceStagedOccurrenceOwned(source.request.producer.operation, q.effectOwner) || !sameOperationRequest(algorithm, nativeRootDebtRequest(source, "algorithm")) || selected.native == nil || selected.native.kind != sourceNativeObjectGetOwnPropertyDescriptor || selected.native.referencesIncomplete || selected.node != source.method || len(selected.path) != 0 || selected.normal != nil {
		return refuse()
	}
	caller, known := work.memberNodes[q.effectOwner]
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if !known || caller < 0 || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || publisher.workRegistrar == nil || source.request.consumer != q.effectOwner || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return refuse()
	}
	registered := work.operationRecipes[source.request.producer].nativeGet
	phase := work.operationRecipes[algorithm.producer]
	if registered != source || !validDescriptorEffectsPhase(phase) || !sameNativeGetSource(phase.nativeGet, source) || !work.nativeEffectsGetCurrent(source) {
		return refuse()
	}
	inputs := [2]sourceDescriptorInputData{}
	for i := range inputs {
		input, applied := work.descriptorInputData(source.descriptorRead, i)
		if !applied || !work.descriptorInputSnapshotCurrent(source.descriptorRead, i, input) {
			return refuse()
		}
		inputs[i] = cloneDescriptorInputData(input)
	}
	execution := work.descriptorTargetExecution
	if execution == nil || !execution.publicationOwned(facts, q, source) {
		return refuse()
	}
	cut := q.relativeInputCut(source.request.producer.operation)
	if cut.operation != source.request.producer.operation || cut.use == nil {
		return refuse()
	}
	event := &sourceDescriptorTargetEvent{issuer: q, work: work, publisher: publisher, generation: work.operationGeneration, source: source, algorithm: algorithm, cut: cut, inputs: inputs, live: true}
	return event, func() { event.live = false; event.issuer = nil; event.publisher = nil; event.work = nil }, true
}

func (event *sourceDescriptorTargetEvent) owned(q *sourceValueQuery) bool {
	if event == nil || !event.live || event.issuer != q || event.work == nil || q == nil || q.owner == nil || q.executable == nil || q.owner.generation != event.generation || !event.generation.active || q.operation != nil || q.returnObservation != nil || !q.dependenciesOnly || q.relativeInputCut(event.source.request.producer.operation) != event.cut || q.executable.pendingMemberPublishers[q.effectOwner] != event.publisher || event.publisher == nil || !event.publisher.live || event.publisher.workRegistrar == nil || event.publisher.fact == nil || event.publisher.fact.node != q.effectOwner {
		return false
	}
	return event.work.descriptorTargetExecution != nil && event.work.descriptorTargetExecution.publicationOwned(event.work.operationFacts, q, event.source) && event.work.operationRecipes[event.source.request.producer].nativeGet == event.source
}

// publishDescriptorTargetSource is called by the original selected algorithm,
// once its own candidate enumeration has returned. It may finish locally while
// named RHS/Set children remain unpaid. Unrepresented candidates do not extract.
func (work *callableEffectWork) publishDescriptorTargetSource(facts []callableFacts, q *sourceValueQuery, event *sourceDescriptorTargetEvent, plan sourceDescriptorTargetSource) bool {
	if !event.owned(q) || event.work != work || plan.generation != event.generation || plan.cut != event.cut || !sameOperationRequest(plan.algorithm, event.algorithm) || !sameNativeGetSource(plan.source, event.source) {
		return false
	}
	for i := range plan.inputs {
		if !sameDescriptorInputData(plan.inputs[i], event.inputs[i]) {
			return false
		}
	}
	source := cloneDescriptorTargetSource(&plan)
	source.request = descriptorTargetRequest(event.source)
	recipe := sourceStagedOperationRecipe{key: source.request.producer, descriptorTarget: source, delta: sourceStagedOperationDelta{required: append([]sourceStagedOperationRequest(nil), source.required...)}}
	if prior, exists := work.operationRecipes[recipe.key]; exists {
		if !descriptorTargetRefinementAllowed(prior, recipe) {
			return false
		}
		if !sameDescriptorTargetSource(prior.descriptorTarget, source) && !work.attachOperationSource(facts, recipe) {
			return false
		}
	} else if !work.registerOperationRecipe(facts, recipe) {
		return false
	}
	id, adopted := work.requireOperation(facts, source.request)
	if !adopted {
		return false
	}
	work.operations[id.index].descriptorTargetObservation = &sourceDescriptorTargetObservation{work: work, epoch: work.operationEpoch, generation: event.generation, request: source.request, cut: event.cut, source: cloneDescriptorTargetSource(source)}
	if work.descriptorTargetExecution == nil || work.descriptorTargetExecution.id != id {
		work.queueDescriptorTargetTask(source.request.producer)
	}
	// The original strong Get resumes when this live owner discovers its tail.
	// This event does not refresh the reader's semantic observation.
	work.wakeDescriptorStrongReaders(id)
	return event.owned(q)
}

// descriptorTargetFieldRequest uses an actual stored operand's existing DATA
// owner. A lexical/static field is not reconstructed in a future reader scope.
func (work *callableEffectWork) descriptorTargetFieldRequest(facts []callableFacts, q *sourceValueQuery, operation, operand *ast.Node) (sourceStagedOperationRequest, bool) {
	region := enclosingCallableNode(operation)
	if region == nil {
		region = sourceStagedModuleOwner(operation)
	}
	caller, known := work.memberNodes[region]
	if !known || caller < 0 || caller >= len(facts) || operand == nil || !sourceStagedOccurrenceOwned(operand, region) {
		return sourceStagedOperationRequest{}, false
	}
	source, supported := work.describeStagedCallResultSource(facts, caller, operand, q.executable)
	if !supported || source == nil {
		return sourceStagedOperationRequest{}, false
	}
	if prior, exists := work.operationRecipes[source.request.producer]; exists {
		if prior.callResult == nil || !sameOperationRequest(prior.callResult.request, source.request) {
			return sourceStagedOperationRequest{}, false
		}
	} else if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
		return sourceStagedOperationRequest{}, false
	}
	_, adopted := work.requireOperation(facts, source.request)
	return source.request, adopted
}
