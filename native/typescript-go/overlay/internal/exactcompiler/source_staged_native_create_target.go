package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
)

// describeNativeCreateTargetTicket enrolls an empty original target ticket while
// its reflective Effects demand is actually being described. The ticket cannot
// execute a query or provide a child factory; only its owned dispatcher can.
func (work *callableEffectWork) describeNativeCreateTargetTicket(facts []callableFacts, source *sourceStagedNativeGetSource, call *ast.Node, owner *executableBodyOwner) bool {
	if source == nil || source.installation == nil || call == nil || stagedNativeInputIntent(call.Expression()) != sourceNativeObjectCreate {
		return false
	}
	caller, known := work.memberNodes[source.request.consumer]
	if !known || !stagedNativeInputEligible(call, &facts[caller], owner) {
		return false
	}
	request := nativeEagerTargetRequest(source)
	eager := work.operationRecipes[nativeRootDebtRequest(source, "eager-inputs").producer]
	if !sameNativeGetSource(eager.nativeGet, source) || eager.nativeGet.eager == nil || !eager.nativeGet.eager.targetPending || eager.delta.extracted {
		return false
	}
	// The algorithm owns installation anchors; the eager phase owns its complete
	// known prefix, including key, descriptor DATA and encountered child sources.
	target := *source
	target.eager = eager.nativeGet.eager
	target.keySources = eager.nativeGet.keySources
	target.eagerSources = eager.nativeGet.eagerSources
	target.createTarget = true
	ticket := sourceStagedOperationRecipe{key: request.producer, nativeGet: &target}
	if prior, exists := work.operationRecipes[ticket.key]; exists {
		if !sameNativeGetSource(prior.nativeGet, source) || operationDeltaSize(prior.delta) != 0 || prior.delta.extracted {
			return false
		}
		ticket.delta = prior.delta
	}
	if !validOperationEnvelope(ticket) {
		return false
	}
	next := eager
	next.nativeGet = &target
	next.delta = cloneOperationDelta(eager.delta)
	next.delta.required = nativeEagerRequired(&target)
	if !validOperationEnvelope(next) || !operationDeltaPrefix(eager.delta, next.delta) {
		return false
	}
	if _, exists := work.operationRecipes[ticket.key]; exists {
		if !work.attachOperationSource(facts, ticket) {
			return false
		}
	} else if !work.registerOperationRecipe(facts, ticket) {
		return false
	}
	return work.attachOperationSource(facts, next)
}

// nativeCreateTargetTaskSource identifies descriptive applicability, never a
// live issuer. Epoch, membership and the actual execution frame are separate.
func (work *callableEffectWork) nativeCreateTargetTaskSource(id sourceStagedOperationID) *sourceStagedNativeGetSource {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil
	}
	st := &work.operations[id.index]
	recipe := work.operationRecipes[st.key]
	s := recipe.nativeGet
	if st.invalid || !st.dependenciesRegistered || s == nil || !s.createTarget || s.installation == nil || !reflectiveNative(s.kind) || recipe.key != nativeEagerTargetRequest(s).producer || !validNativeGetRecipe(recipe) {
		return nil
	}
	return s
}

// nativeCreateTargetDependencies also watches the child's exact Get fan-in;
// full Effects remain required and are not moved onto either callee Get.
func (work *callableEffectWork) nativeCreateTargetDependencies(id sourceStagedOperationID) []sourceStagedOperationDependency {
	ds := append([]sourceStagedOperationDependency(nil), work.operations[id.index].dependencies...)
	s := work.nativeCreateTargetTaskSource(id)
	if s == nil || s.targetSource.producer.operation == nil {
		return ds
	}
	child := work.operationRecipes[s.targetSource.producer].nativeGet
	if child == nil || !sameOperationRequest(child.request, s.targetSource) {
		return ds
	}
	root, get := work.operationIDs[child.request.producer], work.operationIDs[nativeRootDebtRequest(child, "callee-get").producer]
	if root.epoch != work.operationEpoch || get.epoch != work.operationEpoch || root.index == 0 || get.index == 0 {
		return ds
	}
	for _, id := range []sourceStagedOperationID{root, get} {
		for _, d := range work.operations[id.index].dependencies {
			exists := false
			for _, p := range ds {
				exists = exists || p.producer == d.producer && sameOperationRequest(p.request, d.request)
			}
			if !exists {
				ds = append(ds, d)
			}
		}
	}
	return ds
}

// bootstrapNativeCreateTarget claims only the existing canonical target task
// for an adopted DefineProperty child of the running Freeze source task. Its
// ordinary-result consumer needs the target's conditional association before
// it can retain parent input progress. The target dispatcher keeps its own
// execution/issuer, full child debt, current-result and observation guards.
// No task is created or retried here, and unrelated queued work stays queued.
func (work *callableEffectWork) bootstrapNativeCreateTarget(facts []callableFacts, parent sourceStagedOperationID, child *sourceStagedNativeGetSource, owner *executableBodyOwner) {
	source := work.nativeEffectsTaskSource(parent)
	if source == nil || source.kind != sourceNativeObjectFreeze || child == nil || child.kind != sourceNativeObjectDefineProperty || work.operations[parent.index].key != source.request.producer || !work.operations[parent.index].writerSourceRunning {
		return
	}
	caller, known := work.memberNodes[source.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || child.request.consumer != source.request.consumer || !work.liveNativeEffectsExecution(parent, owner, &facts[caller]) {
		return
	}
	input := work.nativeEffectsInputSource(source)
	if input == nil || input.input.input.expression != child.request.use {
		return
	}
	request := nativeEagerTargetRequest(child)
	target := work.operationIDs[request.producer]
	selected := work.nativeCreateTargetTaskSource(target)
	if selected == nil || !sameNativeGetSource(selected, child) || selected.targetSource.producer.operation != nil || work.operations[target.index].writerSourceRunning {
		return
	}
	for i := work.extractionHead; i < len(work.extractionQueue); i++ {
		task := work.extractionQueue[i]
		if task.operation != target || task.operationDone || task.delivery || task.nativeInputRevision != 0 || task.nativeTargetRevision != 0 || task.nativeInputReading != (sourceStagedOperationRequest{}) {
			continue
		}
		if task.callable != caller {
			return
		}
		work.extractionQueue[i].operationDone = true
		work.extractOperation(facts, task, owner)
		return
	}
}

// consumeNativeCreateTarget runs only under the existing dispatcher's execution
// frame. A saved target acquires its original initializer's callee SOURCE, never
// invokes/evaluates that initializer or substitutes its operand reading cut.
func (work *callableEffectWork) consumeNativeCreateTarget(facts []callableFacts, task callableExtractionTask, owner *executableBodyOwner) {
	id := task.operation
	source := work.nativeCreateTargetTaskSource(id)
	if source == nil || owner == nil || owner.values == nil || owner.project == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration {
		return
	}
	caller, known := work.memberNodes[source.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || task.callable != caller || !work.liveNativeEffectsExecution(id, owner, &facts[caller]) {
		return
	}
	publisher := owner.pendingMemberPublishers[source.request.consumer]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	call, binding := nativeReflectiveTargetCall(source, owner)
	if call == nil || stagedNativeInputIntent(call.Expression()) != sourceNativeObjectCreate || !stagedNativeInputEligible(call, &facts[caller], owner) {
		return
	}
	work.attachSourceObservationDependencies(facts, id)
	st := &work.operations[id.index]
	revisions := work.sourceObservationRevisions(id)
	if st.writerSourceRunning || revisions == nil || st.writerSourceRevisions != nil && slices.Equal(st.writerSourceRevisions, revisions) {
		return
	}
	st.writerSourceRunning = true
	retained := false
	defer func() {
		work.operations[id.index].writerSourceRunning = false
		work.attachSourceObservationDependencies(facts, id)
		if retained {
			work.operations[id.index].writerSourceRevisions = work.sourceObservationRevisions(id)
		}
	}()
	if source.targetSource.producer.operation == nil {
		// An already observed saved producer has its own genuine graph receipt.
		// Reuse that receipt before opening any new callee acquisition.
		request, valid := stagedNativeInputOccurrenceRequest(&facts[caller], call)
		if !valid {
			return
		}
		child := work.operationRecipes[request.producer].nativeGet
		if child != nil && child.kind == sourceNativeObjectCreate && work.nativeEffectsGetCurrent(child) {
			if !work.describeNativeTargetSource(facts, source, child.request, binding) {
				return
			}
			if _, required := work.requireOperation(facts, child.request); !required {
				return
			}
			retained = true
		} else {
			issuer := work.beginNativeEffectsIssuer(facts, caller, call, owner, id)
			if issuer == nil {
				return
			}
			defer func() { issuer.active = false; issuer.self = nil; issuer.pending = nil; issuer.scopePending = nil }()
			child, supported := work.describeNativeInputOccurrenceInEntry(facts, caller, call, owner, nil, nil, issuer)
			adopted := supported && work.adoptNativeInputSourceRequirements(facts, child)
			if !adopted {
				adopted = work.adoptPendingNativeEffects(facts, child, issuer)
			}
			if !adopted || child == nil || child.source == nil || child.source.kind != sourceNativeObjectCreate {
				work.requireStagedNativeEffectsConsumer(child, owner)
				return
			}
			if issuer.issued {
				work.admitNativeEffectsSourceGet(facts, child, issuer)
			}
			if !work.describeNativeTargetSource(facts, source, child.source.request, binding) {
				return
			}
			retained = true
		}
	}
	// targetSource is a conditional association with full child debt. Its own
	// Get task resumes on exact delivery; this target never replays that Get.
	source = work.operationRecipes[work.operations[id.index].key].nativeGet
	if source.targetSource.producer.operation != call {
		return
	}
	retained = true
	if work.connectNativeTargetSource(facts, source, call) {
		work.publishOperation(id, work.operationRecipes[work.operations[id.index].key].delta)
	}
}
