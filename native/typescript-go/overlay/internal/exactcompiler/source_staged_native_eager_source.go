package exactcompiler

import "slices"

// sourceStagedNativeEagerExecution is the actual eager-inputs dispatcher interval.
// It lends only the original ordered property-child Get. It is never serialized,
// copied into a recipe, or interchangeable with an ordinary/root-task issuer.
type sourceStagedNativeEagerExecution struct {
	self       *sourceStagedNativeEagerExecution
	work       *callableEffectWork
	id         sourceStagedOperationID
	owner      *executableBodyOwner
	fact       *callableFacts
	generation *projectGeneration
}

func (work *callableEffectWork) nativeEagerTaskSource(id sourceStagedOperationID) *sourceStagedNativeGetSource {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil
	}
	state := &work.operations[id.index]
	r := work.operationRecipes[state.key]
	s := r.nativeGet
	if state.invalid || !state.dependenciesRegistered || s == nil || s.eager == nil || r.key != nativeRootDebtRequest(s, "eager-inputs").producer || !validNativeGetRecipe(r) || !validStagedNativeEagerInputs(*s.eager, s) || len(s.eager.operations) == 0 && len(s.keySources) == 0 {
		return nil
	}
	root := work.operationIDs[s.request.producer]
	if root.epoch != work.operationEpoch || root.index == 0 || int(root.index) >= len(work.operations) || work.operations[root.index].invalid || !work.operations[root.index].dependenciesRegistered {
		return nil
	}
	return s
}

func (e *sourceStagedNativeEagerExecution) live() bool {
	if e == nil || e.self != e || e.work == nil || e.work.nativeEagerExecution != e || e.owner == nil || e.owner.values == nil || e.owner.project == nil || e.generation != e.work.operationGeneration || e.owner.values.generation != e.generation || e.owner.project.activeGeneration != e.generation {
		return false
	}
	source := e.work.nativeEagerTaskSource(e.id)
	if source == nil || e.fact == nil || e.fact.node != source.request.consumer || e.fact.normalInputs != nil || !e.work.nativeEffectsGetCurrent(source) || !e.work.nativeEagerKeyCurrent(source) {
		return false
	}
	publisher := e.owner.pendingMemberPublishers[e.fact.node]
	return publisher != nil && publisher.live && publisher.fact == e.fact && e.owner.values.program.GetSourceFile(e.fact.sourceFile.FileName()) == e.fact.sourceFile
}

func (e *sourceStagedNativeEagerExecution) liveChild(issuer *sourceStagedNativeEffectsIssuer) bool {
	if !e.live() || issuer == nil || issuer.eager != e || issuer.task != e.id || issuer.work != e.work || issuer.owner != e.owner || issuer.fact != e.fact || issuer.generation != e.generation {
		return false
	}
	source := e.work.nativeEagerTaskSource(e.id)
	for _, child := range source.eager.operations {
		if child.operation == issuer.call && child.actual == 2 && child.property != nil && child.property.AsPropertyAssignment().Initializer == issuer.call && stagedNativeInputSourceOwner(e.fact, issuer.call, e.owner) {
			expected, ok := stagedNativeInputOccurrenceRequest(e.fact, issuer.call)
			if old := e.work.operationRecipes[expected.producer].nativeGet; old != nil {
				expected = old.request
			}
			return ok && sameOperationRequest(expected, issuer.request)
		}
	}
	return false
}

func (work *callableEffectWork) prepareNativeEagerTask(facts []callableFacts, task callableExtractionTask, owner *executableBodyOwner) {
	source := work.nativeEagerTaskSource(task.operation)
	if source == nil {
		work.prepareNativeEagerCalls(facts, task.operation, owner) // Existing authored-call-only path.
		return
	}
	if task.delivery || task.nativeInputRevision != 0 || task.nativeTargetRevision != 0 || task.nativeInputReading != (sourceStagedOperationRequest{}) || owner == nil || owner.values == nil || owner.project == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration {
		return
	}
	consumer, ok := work.memberNodes[source.request.consumer]
	if !ok || consumer < 0 || consumer >= len(facts) || task.callable != consumer || work.nativeEagerExecution != nil && work.nativeEagerExecution.id == task.operation {
		return
	}
	issued := false
	for _, queued := range work.extractionQueue {
		issued = issued || queued.operation == task.operation && queued.callable == consumer && !queued.delivery && queued.nativeInputRevision == 0 && queued.nativeTargetRevision == 0
	}
	if !issued {
		return
	}
	work.attachSourceObservationDependencies(facts, task.operation)
	work.enrollNativeEagerKey(facts, work.operationRecipes[work.operations[task.operation.index].key])
	// An authentic adopted task waits on exact registered prerequisites. It
	// cannot acquire a child from a blueprint or before this key's delivery.
	if !work.nativeEffectsGetCurrent(source) || !work.nativeEagerKeyCurrent(source) {
		return
	}
	e := &sourceStagedNativeEagerExecution{work: work, id: task.operation, owner: owner, fact: &facts[consumer], generation: work.operationGeneration}
	e.self = e
	prior := work.nativeEagerExecution
	work.nativeEagerExecution = e
	defer func() { work.nativeEagerExecution = prior; e.self = nil; e.work = nil; e.fact = nil; e.owner = nil }()
	if !e.live() {
		return
	}
	previous := work.operations[task.operation.index].writerSourceRevisions
	if previous != nil && slices.Equal(previous, work.sourceObservationRevisions(task.operation)) && !work.nativeEagerSourcesCurrent(source) {
		return
	}
	work.prepareNativeEagerCalls(facts, task.operation, owner)
	current := work.operationRecipes[work.operations[task.operation.index].key].nativeGet
	if work.nativeEagerSourcesCurrent(current) && (previous == nil || !slices.Equal(previous, work.sourceObservationRevisions(task.operation))) {
		work.notifyNativeEagerInputWaiters(task.operation)
	}
}

// nativeEagerSourceDependencies watches Get/input revisions while retaining the
// full Effects edge. No full-root closure is needed to perform a local source
// observation, and no descendant Effects are moved onto the parent's Get.
func (work *callableEffectWork) nativeEagerSourceDependencies(id sourceStagedOperationID) []sourceStagedOperationDependency {
	dependencies := append([]sourceStagedOperationDependency(nil), work.operations[id.index].dependencies...)
	source := work.nativeEagerTaskSource(id)
	if source == nil {
		return dependencies
	}
	appendDependency := func(d sourceStagedOperationDependency) {
		for _, old := range dependencies {
			if old.producer == d.producer && sameOperationRequest(old.request, d.request) {
				return
			}
		}
		dependencies = append(dependencies, d)
	}
	root := work.operationIDs[source.request.producer]
	get := work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
	if root.epoch == work.operationEpoch && root.index != 0 && get.epoch == work.operationEpoch && get.index != 0 {
		for _, d := range work.operations[root.index].dependencies {
			if d.producer == get {
				appendDependency(d)
			}
		}
		for _, d := range work.operations[get.index].dependencies {
			appendDependency(d)
		}
	}
	for _, key := range source.keySources {
		id := work.operationIDs[key.producer.producer]
		if id.epoch == work.operationEpoch && id.index != 0 {
			for _, d := range work.operations[id.index].dependencies {
				appendDependency(d)
			}
		}
	}
	for _, child := range source.eagerSources {
		id := work.operationIDs[child.producer]
		if id.epoch != work.operationEpoch || id.index == 0 {
			continue
		}
		for _, d := range work.operations[id.index].dependencies {
			appendDependency(d)
		}
	}
	return dependencies
}

// prepareNativeEagerSources uses only the live eager issuer. Every encountered
// child has registered/adopted full requirements before this phase can yield or
// publish. Reuse consults current receipts; a clone must observe its own Gets.
func (work *callableEffectWork) prepareNativeEagerSources(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) bool {
	source := work.operationRecipes[work.operations[id.index].key].nativeGet
	if source == nil || source.eager == nil {
		return false
	}
	if len(source.eager.operations) == 0 && len(source.keySources) == 0 {
		return true // Preserve existing calls/literal domains.
	}
	e := work.nativeEagerExecution
	if e == nil || e.id != id || e.owner != owner || !e.live() {
		return false
	}
	consumer := work.memberNodes[source.request.consumer]
	for i, child := range source.eager.operations {
		// Current reuse issues neither another query nor an ordinary child use.
		if i < len(source.eagerSources) {
			registered := work.operationRecipes[source.eagerSources[i].producer].nativeGet
			if registered != nil && sameOperationRequest(registered.request, source.eagerSources[i]) && work.nativeEffectsGetCurrent(registered) {
				continue
			}
		}
		request, valid := stagedNativeInputOccurrenceRequest(&facts[consumer], child.operation)
		if !valid || !stagedNativeInputEligible(child.operation, &facts[consumer], owner) {
			return false
		}
		if prior := work.operationRecipes[request.producer].nativeGet; prior != nil {
			request = prior.request
		}
		issuer := &sourceStagedNativeEffectsIssuer{work: work, owner: owner, facts: facts, fact: &facts[consumer], caller: consumer, call: child.operation, request: request, task: id, eager: e, generation: work.operationGeneration, active: true}
		issuer.self = issuer
		if !issuer.live() {
			return false
		}
		occurrence, supported := work.describeNativeInputOccurrenceInEntry(facts, consumer, child.operation, owner, nil, nil, issuer)
		adopted := supported && work.adoptNativeInputSourceRequirements(facts, occurrence)
		if !adopted {
			adopted = work.adoptPendingNativeEffects(facts, occurrence, issuer)
		}
		if adopted && issuer.issued {
			work.admitNativeEffectsSourceGet(facts, occurrence, issuer)
		}
		issuer.active, issuer.self = false, nil
		if !adopted || occurrence == nil || occurrence.source == nil || occurrence.source.request.use != child.operation {
			return false
		}
		recipe := work.operationRecipes[work.operations[id.index].key]
		copy := *recipe.nativeGet
		copy.eagerSources = append([]sourceStagedOperationRequest(nil), copy.eagerSources...)
		if i < len(copy.eagerSources) {
			if !sameOperationRequest(copy.eagerSources[i], occurrence.source.request) {
				return false
			}
		} else if i == len(copy.eagerSources) {
			copy.eagerSources = append(copy.eagerSources, occurrence.source.request)
		} else {
			return false
		}
		if work.operations[id.index].delta.extracted && len(copy.eagerSources) != len(recipe.nativeGet.eagerSources) {
			return false
		}
		recipe.nativeGet = &copy
		recipe.delta = cloneOperationDelta(recipe.delta)
		recipe.delta.required = nativeEagerRequired(&copy)
		if !work.attachOperationSource(facts, recipe) {
			return false // Published/sealed prefixes cannot grow retrospectively.
		}
		source = work.operationRecipes[recipe.key].nativeGet
		work.attachSourceObservationDependencies(facts, id)
		if !work.nativeEffectsGetCurrent(occurrence.source) {
			// The encountered child has its real source task and full debt. A
			// later APPLIED prerequisite resumes this same ordered phase.
			work.operations[id.index].writerSourceRevisions = work.sourceObservationRevisions(id)
			return false
		}
	}
	work.attachSourceObservationDependencies(facts, id)
	revisions := work.sourceObservationRevisions(id)
	if revisions == nil {
		return false
	}
	work.operations[id.index].writerSourceRevisions = revisions
	return work.nativeEagerSourcesCurrent(source)
}

func (work *callableEffectWork) nativeEagerSourcesCurrent(source *sourceStagedNativeGetSource) bool {
	if source == nil || source.eager == nil || !validNativeEagerSources(source) || len(source.eager.operations) != len(source.eagerSources) || !work.nativeEagerKeyCurrent(source) || !work.nativeEffectsGetCurrent(source) {
		return false
	}
	for _, request := range source.eagerSources {
		child := work.operationRecipes[request.producer].nativeGet
		id := work.operationIDs[request.producer]
		if child == nil || !sameOperationRequest(child.request, request) || !work.nativeEffectsGetCurrent(child) || id.epoch != work.operationEpoch || id.index == 0 || work.operations[id.index].invalid || !work.operations[id.index].dependenciesRegistered {
			return false
		}
	}
	return true
}

func (work *callableEffectWork) queueNativeEagerSource(id sourceStagedOperationID) {
	if work.nativeEagerTaskSource(id) == nil {
		return
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery {
			return
		}
	}
	source := work.nativeEagerTaskSource(id)
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[source.request.consumer], operation: id})
}

func (work *callableEffectWork) afterNativeEagerKeyDelivery(reading sourceStagedOperationRequest) {
	for key, recipe := range work.operationRecipes {
		source := recipe.nativeGet
		if source == nil || source.eager == nil || key != nativeRootDebtRequest(source, "eager-inputs").producer {
			continue
		}
		for _, k := range source.keySources {
			if sameOperationRequest(stagedKeySourceRequest(source, k), reading) {
				work.queueNativeEagerSource(work.operationIDs[key])
				work.notifyNativeEagerInputWaiters(work.operationIDs[key])
			}
		}
	}
}
