package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
)

// sourceStagedNativeEffectsExecution is a synchronous dispatcher interval, not
// a task description or receipt. A copied entry cannot authorize a source query.
type sourceStagedNativeEffectsExecution struct {
	self       *sourceStagedNativeEffectsExecution
	work       *callableEffectWork
	id         sourceStagedOperationID
	owner      *executableBodyOwner
	fact       *callableFacts
	generation *projectGeneration
}

func (work *callableEffectWork) liveNativeEffectsExecution(id sourceStagedOperationID, owner *executableBodyOwner, fact *callableFacts) bool {
	e := work.nativeEffectsExecution
	return e != nil && e.self == e && e.work == work && e.id == id && e.owner == owner && e.fact == fact && e.generation == work.operationGeneration && owner != nil && owner.project != nil && owner.project.activeGeneration == e.generation
}
func (work *callableEffectWork) beginNativeEffectsExecution(facts []callableFacts, task callableExtractionTask, owner *executableBodyOwner) (func(), bool) {
	source := work.nativeEffectsTaskSource(task.operation)
	if source == nil || task.delivery || task.nativeInputRevision != 0 || task.nativeTargetRevision != 0 || task.nativeInputReading != (sourceStagedOperationRequest{}) || owner == nil || owner.values == nil || owner.project == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration {
		return func() {}, false
	}
	caller, known := work.memberNodes[source.request.consumer]
	publisher := owner.pendingMemberPublishers[source.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || task.callable != caller || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || work.operations[task.operation.index].writerSourceRunning {
		return func() {}, false
	}
	issued := false
	for _, p := range work.extractionQueue {
		issued = issued || p.operation == task.operation && p.callable == task.callable && !p.delivery && p.nativeInputRevision == 0 && p.nativeTargetRevision == 0
	}
	if !issued {
		return func() {}, false
	}
	prior := work.nativeEffectsExecution
	e := &sourceStagedNativeEffectsExecution{work: work, id: task.operation, owner: owner, fact: &facts[caller], generation: work.operationGeneration}
	e.self = e
	work.nativeEffectsExecution = e
	return func() {
		if work.nativeEffectsExecution == e {
			work.nativeEffectsExecution = prior
		}
		e.self = nil
		e.work = nil
		e.owner = nil
		e.fact = nil
	}, true
}

// nativeEffectsTaskDependencies watches existing exact subscribers. Descendant
// Get prerequisites already belong to the required child; the extra parent link
// schedules observation without changing either producer's semantic cut.
func (work *callableEffectWork) nativeEffectsTaskDependencies(id sourceStagedOperationID) []sourceStagedOperationDependency {
	source := work.nativeEffectsTaskSource(id)
	if source == nil {
		return nil
	}
	state := &work.operations[id.index]
	dependencies := append([]sourceStagedOperationDependency(nil), state.dependencies...)
	appendDependency := func(d sourceStagedOperationDependency) {
		for _, p := range dependencies {
			if p.producer == d.producer && sameOperationRequest(p.request, d.request) {
				return
			}
		}
		dependencies = append(dependencies, d)
	}
	if state.key != source.request.producer {
		return dependencies
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer].nativeGet
	if algorithm == nil || !validStagedNativeInputSource(algorithm) {
		return dependencies
	}
	child := work.operationRecipes[algorithm.inputSource.producer].nativeGet
	if child == nil || !sameOperationRequest(child.request, algorithm.inputSource) {
		return dependencies
	}
	childID := work.operationIDs[child.request.producer]
	getID := work.operationIDs[nativeRootDebtRequest(child, "callee-get").producer]
	if childID.epoch != work.operationEpoch || getID.epoch != work.operationEpoch || childID.index == 0 || getID.index == 0 {
		return dependencies
	}
	for _, d := range work.operations[childID.index].dependencies {
		if d.producer == getID {
			appendDependency(d)
		}
	}
	for _, d := range work.operations[getID.index].dependencies {
		appendDependency(d)
	}
	return dependencies
}
func (work *callableEffectWork) sourceObservationDependencies(id sourceStagedOperationID) []sourceStagedOperationDependency {
	if work.getPreparationTaskSource(id) != nil {
		return work.getPreparationTaskDependencies(id)
	}
	if work.installedCallTaskSource(id) != nil {
		return work.installedCallDependencies(id)
	}
	if work.nativeEffectsTaskSource(id) != nil {
		return work.nativeEffectsTaskDependencies(id)
	}
	if work.reflectiveGetTaskSource(id) != nil {
		return work.reflectiveGetDependencies(id)
	}
	if work.nativeEagerTaskSource(id) != nil {
		return work.nativeEagerSourceDependencies(id)
	}
	return work.operations[id.index].dependencies
}
func (work *callableEffectWork) sourceObservationRevisions(id sourceStagedOperationID) []uint64 {
	if work.installedCallTaskSource(id) != nil {
		return work.installedCallNotificationRevisions(id)
	}
	revisions := []uint64{uint64(id.index)}
	for _, d := range work.sourceObservationDependencies(id) {
		if d.producer.epoch != work.operationEpoch || d.producer.index == 0 || int(d.producer.index) >= len(work.operations) {
			return nil
		}
		child := &work.operations[d.producer.index]
		subscriber := child.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
		if subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, d.request) {
			return nil
		}
		revisions = append(revisions, uint64(d.producer.index), child.revision, subscriber.applied)
	}
	return revisions
}
func (work *callableEffectWork) sourceObservationTaskSupported(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	return work.constructedResultProducerTask(id) != nil || work.getPreparationTaskSource(id) != nil || work.constructedCoverageTaskSource(id) != nil || work.nativeScopeGetTaskSource(id) != nil || recipe.memberSource != nil && (recipe.memberSource.originalGetMutation != nil || recipe.memberSource.originalGetMutationInterest != nil) || recipe.mutationData != nil || work.installedCallTaskSource(id) != nil || recipe.nativeGet != nil && recipe.nativeGet.descriptorRead != nil && (recipe.key == nativeRootDebtRequest(recipe.nativeGet, "algorithm").producer || recipe.key == nativeRootDebtRequest(recipe.nativeGet, "eager-inputs").producer) || work.operationRecipes[work.operations[id.index].key].descriptorSource != nil || work.requestedWriterSourceSupported(work.operationRecipes[work.operations[id.index].key]) || work.nativeEffectsTaskSource(id) != nil || work.reflectiveGetTaskSource(id) != nil || work.nativeEagerTaskSource(id) != nil || work.frameworkGetResumptionSource(id) != nil
}
func (work *callableEffectWork) attachSourceObservationDependencies(facts []callableFacts, id sourceStagedOperationID) {
	work.registerOperationDependencies(facts, id)
	for _, d := range work.sourceObservationDependencies(id) {
		child := &work.operations[d.producer.index]
		sub := child.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
		if sub != nil && !slices.Contains(sub.writerSourceParents, id) {
			sub.writerSourceParents = append(sub.writerSourceParents, id)
			if child.revision != 0 {
				work.queueOperationDelivery(child)
			}
		}
	}
}
func (work *callableEffectWork) attachNativeEffectsDependencies(facts []callableFacts, id sourceStagedOperationID) {
	if work.nativeEffectsTaskSource(id) != nil {
		work.attachSourceObservationDependencies(facts, id)
	}
}
func (work *callableEffectWork) nativeEffectsTaskOwned(id sourceStagedOperationID) bool {
	if work.nativeEffectsTaskSource(id) == nil {
		return false
	}
	st := &work.operations[id.index]
	if st.invalid || !st.dependenciesRegistered {
		return false
	}
	if st.writerSourceRunning {
		return true
	}
	for _, t := range work.extractionQueue[work.extractionHead:] {
		if t.operation == id && !t.operationDone && !t.delivery {
			return true
		}
	}
	if st.writerSourceRevisions == nil {
		return false
	}
	for _, d := range work.sourceObservationDependencies(id) {
		sub := work.operations[d.producer.index].subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
		if sub != nil && slices.Contains(sub.writerSourceParents, id) {
			return true
		}
	}
	return false
}

// nativeEffectsObserverOwner identifies the existing full-Get continuation for
// this exact reader and C. Registration alone cannot replace an unrelated
// native parent's physical observation task or grant a current Get.
func (work *callableEffectWork) nativeEffectsObserverOwner(reading sourceStagedOperationRequest, association sourceStagedNativeObserverInput) (sourceStagedOperationID, bool) {
	var none sourceStagedOperationID
	root := work.operationRecipes[association.observer.request.producer]
	if !validNativeEffectsRequest(root) || !validNativeGetRecipe(root) || root.nativeGet.effectsSource.generation != work.operationGeneration || !sameOperationRequest(root.nativeGet.request, association.observer.request) || root.nativeGet.get != association.observer.get || !sameOperationRequest(reading, association.request) {
		return none, false
	}
	id := work.operationIDs[nativeRootDebtRequest(root.nativeGet, "callee-get").producer]
	source := work.nativeEffectsTaskSource(id)
	if source == nil || !work.nativeEffectsTaskOwned(id) {
		return none, false
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	c := work.operationRecipes[association.coverage.producer]
	cID := work.operationIDs[association.coverage.producer]
	producerID := work.operationIDs[reading.producer]
	if !validStagedMemberCoverageRecipe(c) || !validNativeObserverCoverage(c.memberSource) || c.memberSource.generation != work.operationGeneration || c.memberSource.coverage.nativeObserver != association.observer || !sameOperationRequest(c.memberSource.request, association.coverage) || !operationContainsRequest(recipe.delta.required, reading) || !operationContainsRequest(recipe.delta.required, association.coverage) || cID.epoch != work.operationEpoch || cID.index == 0 || int(cID.index) >= len(work.operations) || producerID.epoch != work.operationEpoch || producerID.index == 0 || int(producerID.index) >= len(work.operations) || work.operations[cID.index].invalid || work.operations[producerID.index].invalid {
		return none, false
	}
	coverage, reader := false, false
	for _, dependency := range work.operations[id.index].dependencies {
		coverage = coverage || dependency.producer == cID && sameOperationRequest(dependency.request, association.coverage)
		reader = reader || dependency.producer == producerID && sameOperationRequest(dependency.request, reading)
	}
	sub := work.operations[producerID.index].subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	if !coverage || !reader || sub == nil || sub.blocked || !sameOperationRequest(sub.request, reading) || !slices.Contains(sub.writerSourceParents, id) {
		return none, false
	}
	return id, true
}

// nativeEffectsCoverageCurrent uses only C observations from this returned
// original Get. Optional source snapshots do not stand in for required factory
// identity, and local renewal does not discharge any child's full Effects.
func (work *callableEffectWork) nativeEffectsCoverageCurrent(id sourceStagedOperationID, occurrence *sourceStagedNativeOccurrence) bool {
	source := work.nativeEffectsTaskSource(id)
	return source != nil && work.nativeOccurrenceCoverageCurrent(id, source, occurrence)
}

// nativeOccurrenceCoverageCurrent shares original Get/C/reader correspondence,
// not task authority. Each caller retains its own real admission guards. No
// recursive closure/normal value is required or granted by this handoff.
func (work *callableEffectWork) nativeOccurrenceCoverageCurrent(id sourceStagedOperationID, source *sourceStagedNativeGetSource, occurrence *sourceStagedNativeOccurrence) bool {
	if source == nil || occurrence == nil || occurrence.work != work || occurrence.generation != work.operationGeneration || occurrence.source == nil || occurrence.callee == nil || !sameNativeGetSource(occurrence.source, source) || !validStagedNativeCalleeEffects(*occurrence.callee, source) || occurrence.callee.generation != work.operationGeneration || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	request := nativeRootDebtRequest(source, "callee-get")
	recipe := work.operationRecipes[request.producer]
	state := &work.operations[id.index]
	if state.key != request.producer || state.invalid || state.revision == 0 || !state.delta.extracted || !state.dependenciesRegistered || !operationDeltaPrefix(state.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, state.delta) || !validNativeGetRequest(recipe, request) || !sameNativeGetSource(recipe.nativeGet, source) || work.currentNativeCalleeEffects(source) == nil {
		return false
	}
	for _, r := range recipe.delta.required {
		found := false
		for _, dependency := range state.dependencies {
			if !sameOperationRequest(dependency.request, r) {
				continue
			}
			child := dependency.producer
			if child.epoch != work.operationEpoch || child.index == 0 || int(child.index) >= len(work.operations) {
				return false
			}
			producer := &work.operations[child.index]
			sub := producer.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
			if producer.invalid || !producer.dependenciesRegistered || sub == nil || sub.blocked || !sameOperationRequest(sub.request, r) {
				return false
			}
			found = true
			break
		}
		if !found {
			return false
		}
	}
	return work.nativeGetCoverageCurrent(id, source, occurrence.observedCoverage)
}

// nativeGetCoverageCurrent revalidates the SAME original Get/C association for
// its owning admission and later ACK-only eager completion. No task grant.
func (work *callableEffectWork) nativeGetCoverageCurrent(id sourceStagedOperationID, source *sourceStagedNativeGetSource, observed []sourceStagedOperationRequest) bool {
	for _, required := range work.operationRecipes[work.operations[id.index].key].delta.required {
		recipe := work.operationRecipes[required.producer]
		c := recipe.memberSource
		if c == nil || c.coverage == nil || !sameOperationRequest(c.parent, source.request) {
			continue
		}
		child := work.operationIDs[required.producer]
		if !validStagedMemberCoverageRecipe(recipe) || !validNativeObserverCoverage(c) || c.generation != work.operationGeneration || !sameOperationRequest(c.request, required) || c.coverage.nativeObserver.get != source.get || !operationContainsRequest(observed, required) || work.memberCoverageObserved[required.producer] != work.operationGeneration || child.epoch != work.operationEpoch || child.index == 0 || int(child.index) >= len(work.operations) || work.operations[child.index].invalid || !work.operations[child.index].memberCoverageObserved {
			return false
		}
	}
	return true
}

func (work *callableEffectWork) observeNativeEffectsReaders(id sourceStagedOperationID) {
	for _, dependency := range work.operations[id.index].dependencies {
		association, provided := work.nativeObserverInputAssociation(dependency.request)
		if !provided {
			continue
		}
		owner, owned := work.nativeEffectsObserverOwner(dependency.request, association)
		if !owned || owner != id {
			continue
		}
		child := &work.operations[dependency.producer.index]
		sub := child.subscribers[sourceStagedOperationConsumer{dependency.request.consumer, dependency.request.edge}]
		if sub.applied == child.revision {
			sub.nativeInputObserved = child.revision
		}
	}
}

// nativeEffectsGetCurrent binds the existing actual Get receipt to the exact
// prerequisite revisions observed by this graph's successful source task.
// Local currentness never waits for full source Effects closure.
func (work *callableEffectWork) nativeEffectsGetCurrent(source *sourceStagedNativeGetSource) bool {
	if source == nil || work.currentNativeCalleeEffects(source) == nil {
		return false
	}
	id := work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	st := &work.operations[id.index]
	recipe := work.operationRecipes[st.key]
	root := work.operationRecipes[source.request.producer]
	if !sameNativeGetSource(recipe.nativeGet, source) || root.nativeGet == nil || !sameNativeGetSource(root.nativeGet, source) || source.effectsSource != nil && !sameNativeEffectsRequest(source.effectsSource, root.nativeGet.effectsSource) {
		return false
	}
	if st.invalid || !st.dependenciesRegistered || st.revision == 0 || !st.delta.extracted || !operationDeltaPrefix(st.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, st.delta) {
		return false
	}
	if root := work.operationRecipes[source.request.producer]; root.nativeGet != nil && root.nativeGet.effectsSource != nil {
		return st.nativeEffectsObserved != nil && slices.Equal(st.nativeEffectsObserved, work.sourceObservationRevisions(id))
	}
	if work.nativeScopeGetRequested(id) {
		return work.nativeScopeGetCurrent(id)
	}
	return true
}
func (work *callableEffectWork) nativeEffectsSourceCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validNativeEffectsRequest(recipe) || recipe.nativeGet.effectsSource.generation != work.operationGeneration {
		return false
	}
	registered := work.operationRecipes[recipe.key]
	if !validNativeEffectsRequest(registered) || !sameNativeGetSource(registered.nativeGet, recipe.nativeGet) || !sameNativeEffectsRequest(registered.nativeGet.effectsSource, recipe.nativeGet.effectsSource) || !operationDeltaPrefix(registered.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, registered.delta) {
		return false
	}
	return recipe.nativeGet.kind != sourceNativeArrayPush && work.nativeEffectsGetCurrent(recipe.nativeGet)
}

func (work *callableEffectWork) prepareNativeEffectsSource(facts []callableFacts, task callableExtractionTask, owner *executableBodyOwner) {
	id := task.operation
	source := work.nativeEffectsTaskSource(id)
	if source == nil || owner == nil || owner.values == nil || owner.project == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration {
		return
	}
	caller, known := work.memberNodes[source.request.consumer]
	publisher := owner.pendingMemberPublishers[source.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || task.callable != caller || !work.liveNativeEffectsExecution(id, owner, &facts[caller]) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	work.attachNativeEffectsDependencies(facts, id)
	st := &work.operations[id.index]
	if st.invalid || st.writerSourceRunning {
		return
	}
	if source.kind == sourceNativeArrayPush {
		if work.arrayPushPrefixCurrent(source) {
			work.publishOperation(id, work.operationRecipes[st.key].delta)
		}
		return // Original issued dependency prefix, not a child/current/algorithm ACK.
	}
	revisions := work.sourceObservationRevisions(id)
	if revisions == nil || st.writerSourceRevisions != nil && slices.Equal(st.writerSourceRevisions, revisions) {
		return
	}
	st.writerSourceRunning = true
	observed := false
	defer func() {
		work.operations[id.index].writerSourceRunning = false
		work.attachNativeEffectsDependencies(facts, id)
		if observed {
			work.operations[id.index].writerSourceRevisions = work.sourceObservationRevisions(id)
		}
	}()
	issuer := work.beginNativeEffectsIssuer(facts, caller, source.request.use, owner, id)
	if issuer == nil {
		return
	}
	defer func() { issuer.active = false; issuer.self = nil; issuer.scopePending = nil }()
	if st.key == nativeRootDebtRequest(source, "callee-get").producer {
		request := sourceStagedNativeRequest{request: source.request, call: source.request.use, get: source.get, algorithmKind: source.kind, effectsIssuer: issuer}
		occurrence, visited := work.observeSelectedNativeGetSource(facts, caller, request, owner)
		if visited {
			admitted := work.admitNativeEffectsSourceGet(facts, occurrence, issuer)
			observed = admitted || work.nativeEffectsPendingObservation(occurrence, issuer)
			if admitted && occurrence != nil {
				work.afterDescriptorTargetNativeGet(occurrence.source)
			}
		}
		return
	}
	// The already reached root owns one Effects use. Its task only discovers and
	// adopts conditional input requirements; it never replays the collector/body.
	delta := cloneOperationDelta(work.operationRecipes[st.key].delta)
	delta.extracted = true
	work.publishOperation(id, delta)
	if !work.nativeEffectsGetCurrent(source) {
		observed = work.nativeEffectsTaskOwned(work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer])
		return
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer].nativeGet
	if algorithm == nil || algorithm.input == nil || !validStagedNativeInputPlan(*algorithm.input, algorithm) {
		return
	}
	childCall := algorithm.input.input.expression
	if !ast.IsCallExpression(childCall) {
		return
	}
	if validStagedNativeInputSource(algorithm) {
		child := work.operationRecipes[algorithm.inputSource.producer].nativeGet
		if child != nil && work.nativeEffectsGetCurrent(child) && work.connectNativeInputSource(facts, algorithm, childCall) {
			observed = true
			return // Current original child support requires no new Get observation.
		}
	}
	childIssuer := work.beginNativeEffectsIssuer(facts, caller, childCall, owner, id)
	if childIssuer == nil {
		return
	}
	defer func() { childIssuer.active = false; childIssuer.self = nil; childIssuer.scopePending = nil }()
	entry := work.beginNativeEffectsArgumentEntry(facts, id, owner)
	if entry != nil {
		defer func() { entry.active = false; entry.issuer = nil }()
	}
	var argumentIssuer *sourceStagedNativeArgumentIssuer
	if entry != nil {
		parent := &sourceStagedNativeOccurrence{work: work, generation: work.operationGeneration, source: source, callee: work.currentNativeCalleeEffects(source)}
		argumentIssuer = entry.childIssuer(parent, childCall)
	}
	child, supported := work.describeNativeInputOccurrenceInEntry(facts, caller, childCall, owner, entry, argumentIssuer, childIssuer)
	if !supported {
		if !work.adoptNativeEffectsInputContinuation(facts, child, childIssuer) && !work.adoptPendingNativeEffects(facts, child, childIssuer) {
			work.requireStagedNativeEffectsConsumer(child, owner)
			return
		}
	} else if !work.adoptNativeInputSourceRequirements(facts, child) {
		return
	}
	if child == nil || child.source == nil {
		return
	}
	if childIssuer.issued {
		// The same returned original event establishes the child's own source
		// observation after adoption. This installs its exact C/reader fan-in
		// before an older generic physical refresh can be dispatched.
		work.admitNativeEffectsSourceGet(facts, child, childIssuer)
	}
	childAlgorithm := work.operationRecipes[nativeRootDebtRequest(child.source, "algorithm").producer].nativeGet
	if !work.describeNativeOrdinaryInputResult(childAlgorithm) || !work.describeNativeInputSource(facts, algorithm, child.source) {
		return
	}
	work.attachNativeEffectsDependencies(facts, id)
	observed = true
	if work.nativeEffectsGetCurrent(child.source) && work.currentNativeResultRoot(child.source.request.producer) != nil {
		work.connectNativeInputSource(facts, algorithm, childCall)
	}
}

// beginNativeEffectsArgumentEntry owns only this adopted root source task's
// module observation. It never borrows the stronger module-argument task lease.
func (work *callableEffectWork) beginNativeEffectsArgumentEntry(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) *sourceStagedNativeArgumentEntry {
	source := work.nativeEffectsTaskSource(id)
	if source == nil || work.operations[id.index].key != source.request.producer {
		return nil
	}
	caller, known := work.memberNodes[source.request.consumer]
	if !known || caller < 0 || caller >= len(facts) {
		return nil
	}
	entry := &sourceStagedNativeArgumentEntry{task: id, work: work, facts: facts, fact: &facts[caller], owner: owner, root: source.request.use, caller: caller, active: true}
	entry.issuer = entry
	if !entry.nativeEffectsEntryLive() {
		return nil
	}
	return entry
}
func (entry *sourceStagedNativeArgumentEntry) nativeEffectsEntryLive() bool {
	if entry == nil || entry.issuer != entry || !entry.active || entry.work == nil || entry.owner == nil || entry.owner.values == nil || entry.owner.checker == nil || entry.caller < 0 || entry.caller >= len(entry.facts) || &entry.facts[entry.caller] != entry.fact || !runtimeVariableInitializer(entry.fact.node) || !entry.work.liveNativeEffectsExecution(entry.task, entry.owner, entry.fact) {
		return false
	}
	work := entry.work
	source := work.nativeEffectsTaskSource(entry.task)
	if source == nil || work.operations[entry.task.index].key != source.request.producer || !work.operations[entry.task.index].writerSourceRunning || !sameOperationRequest(source.effectsSource.request, source.request) || source.request.use != entry.root || source.request.consumer != entry.fact.node || source.get != entry.root.Expression() || !work.nativeEffectsGetCurrent(source) {
		return false
	}
	publisher := entry.owner.pendingMemberPublishers[entry.fact.node]
	file := ast.GetSourceFileOfNode(entry.root)
	if publisher == nil || !publisher.live || publisher.fact != entry.fact || file == nil || file != entry.fact.sourceFile || entry.owner.values.program.GetSourceFile(file.FileName()) != file {
		return false
	}
	declarations := entry.fact.node.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes
	if len(declarations) != 1 || declarations[0].Initializer() != entry.root {
		return false
	}
	index := entry.owner.values.index(file)
	occurrence := index.normalOccurrences[entry.root]
	return !index.incomplete && occurrence != nil && occurrence.once && occurrence.region == nil && occurrence.statement == entry.fact.node
}
