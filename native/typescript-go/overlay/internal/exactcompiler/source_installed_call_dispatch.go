package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
)

// sourceInstalledCallDemand is lent by the actual Call operation task while
// consumeInvocation selects and binds its current source alternatives. It is
// neither a saved body query nor a scope reconstructed from endpoint syntax.
type sourceInstalledCallDemand struct {
	issuer   *sourceValueQuery
	source   *sourceInstalledCallPhase
	inputs   *sourceValueInputs
	observed bool
}

type sourceInstalledCallObservation struct {
	self      *sourceInstalledCallObservation
	source    *sourceInstalledCallPhase
	epoch     *sourceStagedOperationEpoch
	required  []sourceStagedOperationDependency
	revisions []uint64
}

// consumeInstalledCallMemberDemand runs at executeInputs' SOURCE entry, after
// its existing real input/default installation and activation. Only the enrolled
// original member expression is observed; unrelated/default Effects stay with
// their original Call publisher. Getter bodies reached by this Get keep their
// original source Get owner and canonical summary contributions.
func (q *sourceValueQuery) consumeInstalledCallMemberDemand(body *ast.Node, inputs *sourceValueInputs, result *accessorCandidates) (bool, bool) {
	demand := q.installedCallDemand
	if demand == nil || demand.issuer != q || demand.source == nil || body != demand.source.body {
		return false, false
	}
	if q.inputs != inputs || demand.inputs != inputs || inputs == nil || inputs.declaration != body || inputs.invocation != demand.source.call || !q.installedMemberInputOwned(q.installedMemberInput) || !sameInstalledMemberInputDescription(q.installedMemberInput.source, demand.source.input) {
		return false, true
	}
	node := demand.source.application.request.producer.operation
	if enclosingCallableNode(node) != body || !sourceStagedOccurrenceOwned(node, body) {
		return false, true
	}
	bindings := inputs.bindings
	if defaults, isDefault := q.defaultInput(inputs, node, result); isDefault {
		// The original default gate is part of the actual SOURCE body owner. A
		// now-bypassed/unavailable default never executes a stale enrolled Get.
		if defaults.bindings == nil {
			return false, true
		}
		bindings = defaults.bindings
	}
	q.executeDemand(node, body, bindings, result, nil, inputs)
	return demand.observed, true
}

// markInstalledCallMemberObservation is called only by the actual registered
// member phase publisher. Callback completion is not member/currentness proof;
// its exact C/source/semantic/APPLIED requirements remain independently checked.
func (q *sourceValueQuery) markInstalledCallMemberObservation(event *sourceInstalledMemberEvent) {
	demand := q.installedCallDemand
	if demand == nil || demand.issuer != q || demand.source == nil || demand.inputs != q.inputs || event == nil || !q.liveInstalledMemberPhase(event, event.get, event.read) || !sameInstalledMemberApplication(&event.application, &demand.source.application) {
		return
	}
	demand.observed = true
}

func (work *callableEffectWork) installedCallTaskSource(id sourceStagedOperationID) *sourceInstalledCallPhase {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !validInstalledCallPhase(recipe) || recipe.installedCall.generation != work.operationGeneration || !installedMemberGenerationActive(work.operationGeneration) {
		return nil
	}
	return recipe.installedCall
}

// prepareInstalledCallPhase is the original registered Call SOURCE dispatcher.
// It performs current callee acquisition and invokes the existing real binder.
// It never calls an Effects appender, executes unrelated body demands, replays
// a stored binder callback, or installs inputs from a detached description.
func (work *callableEffectWork) prepareInstalledCallPhase(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	source := work.installedCallTaskSource(id)
	if source == nil || owner == nil || owner.values == nil || owner.project == nil || owner.project.activeGeneration != work.operationGeneration || owner.values.generation != work.operationGeneration {
		return
	}
	consumer, known := work.memberNodes[source.request.consumer]
	publisher := owner.pendingMemberPublishers[source.request.consumer]
	if !known || consumer >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[consumer] || facts[consumer].normalInputs != nil {
		return
	}
	state := &work.operations[id.index]
	if state.writerSourceRunning {
		return
	}
	work.attachSourceObservationDependencies(facts, id)
	state = &work.operations[id.index]
	state.writerSourceRevisions = work.installedCallNotificationRevisions(id)
	if !work.operationSourceRequirementsReady(work.operationRecipes[state.key].delta.required, func(sourceStagedOperationKey) (bool, bool) { return false, false }) {
		return
	}
	state.writerSourceRunning = true
	defer func() { work.operations[id.index].writerSourceRunning = false }()
	q := newSourceDependencyQuery(source.call, owner.checker, owner, source.request.consumer)
	defer q.publishDependencyStatistics()
	demand := &sourceInstalledCallDemand{issuer: q, source: source}
	q.installedCallDemand = demand
	defer func() { demand.issuer, demand.inputs = nil, nil; q.installedCallDemand = nil }()
	matched := 0
	_ = q.consumeInvocation(source.call, nil, sourceInvocationConsumer{
		// Other source/native/runtime alternatives are retained by the original Call
		// owner. They cannot impersonate this registered body's conditional Get.
		body: func(body *ast.Node, _ sourceValueBindings, inputs *sourceValueInputs, _ *ast.Node, result *accessorCandidates) {
			if body != source.body || inputs == nil {
				return
			}
			demand.inputs = inputs
			first := len(result.fieldOutcomes)
			if q.executeInputs(body, inputs.bindings, result, nil, inputs) && demand.observed && work.publishInstalledCallFieldOutcomes(facts, source, result.fieldOutcomes[first:]) {
				matched++
			}
			demand.inputs = nil
		},
		resolver: func(*ast.Node, []*ast.Node, bool, sourceValueBindings, *accessorCandidates) {},
	})
	state = &work.operations[id.index]
	prior := state.installedCallObserved
	if matched == 0 {
		if prior != nil {
			state.installedCallObserved = nil
			state.revision++
			work.notifyOperationSubscribers(state)
		}
		return
	}
	observed := &sourceInstalledCallObservation{source: cloneInstalledCallPhase(source), epoch: work.operationEpoch}
	observed.self = observed
	for _, dependency := range state.dependencies {
		if dependency.producer.epoch != work.operationEpoch || dependency.producer.index == 0 || int(dependency.producer.index) >= len(work.operations) {
			return
		}
		observed.required = append(observed.required, dependency)
		observed.revisions = append(observed.revisions, work.operations[dependency.producer.index].revision)
	}
	if !sameInstalledCallObservation(prior, observed) {
		state.installedCallObserved = observed
		state.revision++
		work.notifyOperationSubscribers(state)
	}
	recipe := work.operationRecipes[state.key]
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.extracted = true
	work.attachOperationSource(facts, recipe)
	work.attachSourceObservationDependencies(facts, id)
	work.operations[id.index].writerSourceRevisions = work.installedCallNotificationRevisions(id)
}

// installedCallObservationCurrent is local and nonrecursive. The outer existing
// conjunction owns callee/input dependency closure. It certifies a SOURCE phase
// observation, never whole-Call completion or disappearance of unknown callees.
func (work *callableEffectWork) installedCallObservationCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validInstalledCallPhase(recipe) || recipe.installedCall.generation != work.operationGeneration || !installedMemberGenerationActive(work.operationGeneration) {
		return false
	}
	id := work.operationIDs[recipe.key]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	observed := state.installedCallObserved
	if state.invalid || !state.dependenciesRegistered || state.revision == 0 || !state.delta.extracted || observed == nil || observed.self != observed || observed.epoch != work.operationEpoch || !sameInstalledCallPhase(observed.source, recipe.installedCall) || len(observed.required) != len(state.dependencies) || len(observed.revisions) != len(observed.required) {
		return false
	}
	for index, dependency := range observed.required {
		if dependency.producer != state.dependencies[index].producer || !sameOperationRequest(dependency.request, state.dependencies[index].request) || dependency.producer.epoch != work.operationEpoch || dependency.producer.index == 0 || int(dependency.producer.index) >= len(work.operations) {
			return false
		}
		child := &work.operations[dependency.producer.index]
		subscriber := child.subscribers[sourceStagedOperationConsumer{consumer: dependency.request.consumer, edge: dependency.request.edge}]
		if child.invalid || child.revision == 0 || observed.revisions[index] != child.revision || subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, dependency.request) || subscriber.consumed != child.revision || subscriber.applied != child.revision {
			return false
		}
	}
	return true
}

// installedCallDependencies borrows the actual member producer's registered
// prerequisite readset, not its completion revision. Watching that source's
// children avoids waiting for a stale observer to acknowledge itself.
func (work *callableEffectWork) installedCallDependencies(id sourceStagedOperationID) []sourceStagedOperationDependency {
	source := work.installedCallTaskSource(id)
	if source == nil {
		return nil
	}
	out := append([]sourceStagedOperationDependency(nil), work.operations[id.index].dependencies...)
	memberID := work.operationIDs[source.member.producer]
	if memberID.epoch == work.operationEpoch && memberID.index != 0 && int(memberID.index) < len(work.operations) {
		for _, dependency := range work.operations[memberID.index].dependencies {
			duplicate := false
			for _, prior := range out {
				duplicate = duplicate || prior.producer == dependency.producer && sameOperationRequest(prior.request, dependency.request)
			}
			if !duplicate {
				out = append(out, dependency)
			}
		}
	}
	return out
}

// This vector is notification-only. Source semantic observations are created
// solely by the fresh dispatcher/event; ACK delivery cannot recertify them.
func (work *callableEffectWork) installedCallNotificationRevisions(id sourceStagedOperationID) []uint64 {
	source := work.installedCallTaskSource(id)
	if source == nil {
		return nil
	}
	out := []uint64{uint64(id.index)}
	for _, dependency := range work.installedCallDependencies(id) {
		if dependency.producer.epoch != work.operationEpoch || dependency.producer.index == 0 || int(dependency.producer.index) >= len(work.operations) {
			return nil
		}
		child := &work.operations[dependency.producer.index]
		subscriber := child.subscribers[sourceStagedOperationConsumer{consumer: dependency.request.consumer, edge: dependency.request.edge}]
		if subscriber == nil || !sameOperationRequest(subscriber.request, dependency.request) {
			return nil
		}
		out = append(out, uint64(dependency.producer.index), child.revision, subscriber.applied)
	}
	memberID := work.operationIDs[source.member.producer]
	if memberID.epoch == work.operationEpoch && memberID.index != 0 && int(memberID.index) < len(work.operations) {
		if observation := work.operations[memberID.index].installedMemberObserved; observation != nil {
			for _, body := range observation.bodies {
				if body.producer < 0 || body.producer >= len(work.stagedRevisions) {
					return nil
				}
				dependency := work.stagedRequired[sourceStagedDependencyKey{consumer: work.memberNodes[source.member.consumer], edge: body.edge}]
				if dependency == nil {
					return nil
				}
				out = append(out, uint64(body.producer), work.stagedRevisions[body.producer], dependency.consumed)
			}
		}
	}
	return out
}

// attachInstalledCallPhaseDependencies addresses the already registered Call
// observer through this member's authenticated input edge. It does not scan
// unrelated operation recipes or manufacture an observer from a syntax name.
func (work *callableEffectWork) attachInstalledCallPhaseDependencies(facts []callableFacts, member sourceStagedOperationRequest) {
	recipe := work.operationRecipes[member.producer]
	application := recipe.installedMember
	if application == nil || !sameInstalledMemberRequest(application.request, member) || application.binding == nil {
		return
	}
	request := installedCallPhaseRequest(*application, application.binding.request.declaration, application.binding.request.operation)
	id := work.operationIDs[request.producer]
	if source := work.installedCallTaskSource(id); source != nil && sameOperationRequest(source.member, member) && sameOperationRequest(source.request, request) {
		work.attachSourceObservationDependencies(facts, id)
	}
}

// queueInstalledCallRefresh participates in the existing operation refresh loop.
// It adds no scheduler/cache and coalesces semantic/source-child wakeups.
func (work *callableEffectWork) queueInstalledCallRefresh(id sourceStagedOperationID) bool {
	if work.installedCallTaskSource(id) == nil {
		return false
	}
	state := &work.operations[id.index]
	revisions := work.installedCallNotificationRevisions(id)
	if state.writerSourceRunning || revisions == nil || slices.Equal(state.writerSourceRevisions, revisions) {
		return false
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery {
			return false
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{operation: id, callable: work.memberNodes[work.operationRecipes[state.key].installedCall.request.consumer]})
	return true
}

// installedCallFieldObservationCurrent is used only by final field-effect
// residual resolution, outside the operation closure solver. The original
// conditional body and member requirements both remain mandatory; no Call
// return/default/selection obligation is discharged by this observation.
func (work *callableEffectWork) installedCallFieldObservationCurrent(outcome *sourceInstalledMemberRequirement) bool {
	if outcome == nil || outcome.call.producer.operation == nil {
		return false
	}
	recipe := work.operationRecipes[outcome.call.producer]
	source := recipe.installedCall
	if source == nil || !validInstalledCallPhase(recipe) || !sameOperationRequest(source.request, outcome.call) || !sameInstalledMemberRequest(source.member, outcome.request) || !sameInstalledMemberApplication(&source.application, &outcome.application) || source.body != outcome.demand.declaration || source.call != outcome.application.binding.request.operation || !work.installedCallObservationCurrent(recipe) {
		return false
	}
	id := work.operationIDs[outcome.call.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{consumer: outcome.call.consumer, edge: outcome.call.edge}]
	if subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, outcome.call) || subscriber.consumed != state.revision || subscriber.applied != state.revision {
		return false
	}
	closed := work.closedOperationDependencies()
	return int(id.index) < len(closed) && closed[id.index]
}

// installedCallFieldBody associates a conditional field outcome with this
// actual body edge. It does not convert the legacy Call-complete bit.
func installedCallFieldBody(call sourceFieldCall, outcome sourceFieldOutcome) bool {
	requirement := outcome.installedMember
	return call.dependencies && requirement != nil && requirement.call.producer.operation != nil && requirement.application.binding != nil && requirement.call.producer.operation == call.operation && requirement.application.binding.request.operation == call.operation && requirement.application.binding.request.declaration == call.target && requirement.demand.declaration == call.target && requirement.demand == outcome.demand
}

// publishInstalledCallFieldOutcomes publishes only the enrolled phase's exact
// typed field outcome. It records no whole-body enumeration, Call completion,
// output or ordinary side-effect closure. Known child donors are published by
// the actual member phase on their own canonical summary edges.
func (work *callableEffectWork) publishInstalledCallFieldOutcomes(facts []callableFacts, source *sourceInstalledCallPhase, outcomes []sourceFieldOutcome) bool {
	consumer, known := work.memberNodes[source.request.consumer]
	if !known || consumer >= len(facts) {
		return false
	}
	var selected []sourceFieldOutcome
	for _, outcome := range outcomes {
		requirement := outcome.installedMember
		if requirement != nil && sameOperationRequest(requirement.call, source.request) && sameInstalledMemberRequest(requirement.request, source.member) && sameInstalledMemberApplication(&requirement.application, &source.application) && outcome.demand.declaration == source.body && outcome.demand.operation == source.application.request.producer.operation {
			selected = append(selected, outcome)
		}
	}
	if len(selected) == 0 {
		return false
	}
	call := sourceFieldCall{operation: source.call, target: source.body, dependencies: true, outcomes: selected}
	for _, prior := range facts[consumer].fieldCalls {
		if sameInstalledMemberFieldCall(prior, call) {
			return true
		}
	}
	facts[consumer].fieldCalls = append(facts[consumer].fieldCalls, cloneSourceFieldCall(call))
	if consumer < len(work.dirty) {
		work.dirty[consumer] = true
		work.stagedContributionChanged(consumer)
	}
	return true
}

// installedCallFieldCoveredOnEdge is a field-only conditional body path. Every
// matching actual body alternative must carry this exact installed field
// requirement. Legacy incomplete or unmatched alternatives continue to refuse.
func installedCallFieldCoveredOnEdge(caller, target *callableFacts, root *ast.Node, origin sourceFieldDemand, current func(*sourceInstalledMemberRequirement) bool) bool {
	if current == nil {
		return false
	}
	contextual := origin
	contextual.use, contextual.consumer = root, caller.node
	matched := false
	for _, call := range caller.fieldCalls {
		if !call.dependencies || call.operation != root || call.target != target.node {
			continue
		}
		bodyMatched := false
		for _, outcome := range call.outcomes {
			if !sameFieldObligation(contextual, outcome.demand) || contextual.use != outcome.demand.use || contextual.consumer != outcome.demand.consumer {
				continue
			}
			if !installedCallFieldBody(call, outcome) || !current(outcome.installedMember) {
				return false
			}
			bodyMatched = true
		}
		if !bodyMatched {
			return false
		}
		matched = true
	}
	return matched
}

func sameInstalledCallObservation(a, b *sourceInstalledCallObservation) bool {
	if a == nil || b == nil || a.self != a || b.self != b || a.epoch != b.epoch || !sameInstalledCallPhase(a.source, b.source) || !slices.Equal(a.revisions, b.revisions) || len(a.required) != len(b.required) {
		return false
	}
	for index, dependency := range a.required {
		if dependency.producer != b.required[index].producer || !sameOperationRequest(dependency.request, b.required[index].request) {
			return false
		}
	}
	return true
}
