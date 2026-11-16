package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// registerNativeScopeGetUse can adopt only an actually selected Get factory.
// Before selection the live traversal may retain descriptive debt, but there is
// no manufactured native producer or promise of a durable retry owner.
func (work *callableEffectWork) registerNativeScopeGetUse(facts []callableFacts, source *sourceStagedNativeGetSource) (sourceStagedOperationID, bool) {
	if source == nil {
		return sourceStagedOperationID{}, false
	}
	request := nativeRootDebtRequest(source, "callee-get")
	recipe := work.operationRecipes[request.producer]
	if !validNativeGetRequest(recipe, request) || !sameNativeGetSource(recipe.nativeGet, source) {
		return sourceStagedOperationID{}, false
	}
	id, adopted := work.requireOperation(facts, request)
	if !adopted {
		return sourceStagedOperationID{}, false
	}
	if work.operations[id.index].nativeScopeEnrolling {
		return id, false
	}
	work.operations[id.index].nativeScopeEnrolling = true
	defer func() {
		if id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
			work.operations[id.index].nativeScopeEnrolling = false
		}
	}()
	work.registerOperationDependencies(facts, id)
	if work.nativeScopeGetSource(id) == nil {
		return sourceStagedOperationID{}, false
	}
	work.attachSourceObservationDependencies(facts, id)
	work.queueNativeScopeGetAttempt(id)
	return id, !work.operations[id.index].invalid
}
func (work *callableEffectWork) nativeScopeGetTaskOwned(id sourceStagedOperationID) bool {
	if work.nativeScopeGetTaskSource(id) == nil {
		return false
	}
	state := &work.operations[id.index]
	if state.writerSourceRunning {
		return true
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery && task.nativeInputRevision == 0 && task.nativeTargetRevision == 0 {
			return true
		}
	}
	revisions := work.sourceObservationRevisions(id)
	changed := revisions != nil && !work.nativeScopeAttemptCurrent(id, revisions, work.nativeProjectionGetDemands(work.nativeScopeGetTaskSource(id)))
	for _, dependency := range work.sourceObservationDependencies(id) {
		if work.writerSourcePendingDependencyOwned(id, dependency) {
			return true
		}
		if !changed {
			continue // Paid unchanged subscribers alone do not own pending work.
		}
		if dependency.producer.epoch != work.operationEpoch || dependency.producer.index == 0 || int(dependency.producer.index) >= len(work.operations) {
			continue
		}
		child := &work.operations[dependency.producer.index]
		sub := child.subscribers[sourceStagedOperationConsumer{dependency.request.consumer, dependency.request.edge}]
		if sub == nil || sub.blocked || !sameOperationRequest(sub.request, dependency.request) {
			continue
		}
		for _, parent := range sub.writerSourceParents {
			if parent == id {
				return true
			}
		}
	}
	return false
}

// prepareNativeScopeGetSource resumes the existing callee operation. The task
// owns a SOURCE Get only: it never adopts an ordinary Call, lends an Effects
// issuer, invokes an initializer or uses an acknowledgement as an observation.
func (work *callableEffectWork) prepareNativeScopeGetSource(facts []callableFacts, task callableExtractionTask, owner *executableBodyOwner) {
	id := task.operation
	source := work.nativeScopeGetTaskSource(id)
	if source == nil || task.delivery || task.nativeInputRevision != 0 || task.nativeTargetRevision != 0 || task.nativeInputReading != (sourceStagedOperationRequest{}) || owner == nil || owner.values == nil || owner.project == nil || owner.checker != owner.values.checker || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration {
		return
	}
	caller, known := work.memberNodes[source.request.consumer]
	publisher := owner.pendingMemberPublishers[source.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || caller >= len(work.operationFacts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || publisher.fact != &work.operationFacts[caller] || facts[caller].normalInputs != nil || facts[caller].sourceFile == nil || ast.GetSourceFileOfNode(source.get) != facts[caller].sourceFile || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	issued := false
	for _, queued := range work.extractionQueue {
		issued = issued || queued.operation == id && !queued.delivery && queued.nativeInputRevision == 0 && queued.nativeTargetRevision == 0 && queued.nativeInputReading == (sourceStagedOperationRequest{})
	}
	if !issued {
		return
	}
	state := &work.operations[id.index]
	if state.writerSourceRunning {
		return
	}
	work.attachSourceObservationDependencies(facts, id)
	state = &work.operations[id.index]
	if state.invalid || state.writerSourceRunning {
		return
	}
	revisions := work.sourceObservationRevisions(id)
	demands := work.nativeProjectionGetDemands(source)
	if revisions == nil || work.nativeScopeAttemptCurrent(id, revisions, demands) {
		return
	}
	state.writerSourceRunning = true
	// Scheduling remembers the actual attempted readset, not successful Get
	// evidence. A changed semantic/APPLIED prerequisite wakes a fresh traversal;
	// unchanged unpaid/unsupported work does not spin on duplicate delivery.
	defer func() {
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return
		}
		// Keep enrollment coalesced while dependency attachment can adopt more
		// subscribers. Even a failed attachment must release this running loan.
		defer func() {
			if id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
				work.operations[id.index].writerSourceRunning = false
			}
		}()
		work.attachSourceObservationDependencies(facts, id)
		work.operations[id.index].writerSourceRevisions = append([]uint64(nil), revisions...)
		work.operations[id.index].nativeScopeAttemptDemands = append([]sourceStagedNativeProjectionDemand(nil), demands...)
		work.operations[id.index].writerSourceRunning = false
		work.queueNativeScopeGetAttempt(id)
	}()
	// This callee operation already names the original declaration Get cut.
	// A physical C refresh keeps its separately issued observer/cut and task;
	// the SOURCE task neither consumes that C nor retargets its borrowed query.
	work.observeNativeCalleeSource(facts, source, owner, nil)
}

// recordNativeScopeGetRequirements is a common selected-publisher transfer.
// All selection premises still flow through the existing finishing publisher;
// this early subset makes the actual SOURCE Get dispatchable before C seals.
func (work *callableEffectWork) recordNativeScopeGetRequirements(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource) bool {
	n := q.stagedNativeGet
	if n == nil || n.issuer != q || n.sourceWork != work || n.sourceEpoch != work.operationEpoch || n.owner != q.owner || n.generation != work.operationGeneration || source == nil || !sameOperationRequest(source.request, n.getRequest) {
		return false
	}
	// Preserve the original ordinary Effects admission/continuation unchanged.
	if n.effectsIssuer != nil {
		return true
	}
	var roots []sourceStagedOperationRequest
	for _, root := range n.selectionRequired {
		if !nativeScopeRootRequest(source.request, root) {
			continue
		}
		if !work.nativeScopeRootDeclared(root, source.request) {
			return false
		}
		roots = appendEntryLawRequirement(roots, root)
	}
	if len(roots) == 0 {
		if len(work.nativeProjectionGetDemands(source)) != 0 {
			_, registered := work.registerNativeScopeGetUse(facts, source)
			return registered
		}
		return true
	}
	request := nativeRootDebtRequest(source, "callee-get")
	id := work.operationIDs[request.producer]
	if id.index != 0 {
		for _, root := range roots {
			if !work.declarationWriterScopeRequirementAllowed(id, root) {
				return false
			}
		}
	}
	if !work.recordNativeSelectionRequirements(facts, source, roots) {
		return false
	}
	_, registered := work.registerNativeScopeGetUse(facts, source)
	return registered
}

// nativeScopeParentCanCommit keeps event-local debt separate from durable work.
// A pending source-only root needs an actual selected Get task/backref owner;
// before that factory exists only a genuinely current ROOT reader may retire
// SOURCE discovery. Declining here leaves inherited physical recovery intact.
func (work *callableEffectWork) nativeScopeParentCanCommit(q *sourceValueQuery, parent sourceStagedDeclarationScopeParent, root sourceStagedOperationRequest) bool {
	if parent.preparation != nil {
		return parent.preparation.live(q) && parent.preparation.work == work && work.declarationWriterScopeDependency(parent.id, work.operationIDs[root.producer], root) && (work.getPreparationTaskOwned(parent.id) || work.getPreparationChildCurrent(root))
	}

	if parent.issuer != nil || work.nativeEffectsTaskSource(parent.id) != nil {
		return true
	}
	n := q.stagedNativeGet
	if n == nil || n.issuer != q || n.sourceWork != work || n.sourceEpoch != work.operationEpoch || n.owner != q.owner || n.generation != work.operationGeneration || !sameOperationRequest(n.getRequest, parent.request) || !operationContainsRequest(n.selectionRequired, root) {
		return false
	}
	if parent.source != nil {
		id := work.operationIDs[nativeRootDebtRequest(parent.source, "callee-get").producer]
		if work.nativeScopeGetTaskOwned(id) {
			return true
		}
	}
	return work.nativeScopeRootCurrent(root)
}
