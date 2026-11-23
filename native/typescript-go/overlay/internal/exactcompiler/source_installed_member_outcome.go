package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
)

// sourceInstalledMemberRequirement belongs to the actual field consumer. It
// replaces no legacy false outcome: a new typed outcome names this requirement
// at first publication. Its description survives cloning; currentness does not.
type sourceInstalledMemberRequirement struct {
	request     sourceStagedOperationRequest // exact original subscriber, separate from cloned description
	application sourceInstalledMemberApplication
	demand      sourceFieldDemand
	// Conditional selected-body observation, separate from whole Call selection.
	call sourceStagedOperationRequest
}

// sourceInstalledMemberPending identifies the compiler-owned inventory arm
// yielded by an actual member phase. It owns neither an unrelated opacity bit
// nor a runtime alternative. coverage is the original phase's issued C child.
// A non-enrolled or incompletely represented domain never emits this marker.
type sourceInstalledMemberPending struct {
	application *sourceInstalledMemberApplication // detached emitting owner, not a lease
	request     sourceStagedOperationRequest
	coverage    sourceStagedOperationRequest
	phase       sourceInstalledMemberPhase
}

// installedMemberInventory is the per-use counterpart to the definition-only
// inventory entry. It is called at that entry, before generic interference can
// replace this *same* owned source-domain debt with unclassified opacity. The
// ordinary own/prototype assignment and getter population continues unchanged.
func (q *sourceValueQuery) installedMemberInventory(origin *ast.Node, projection []string, name string, mode accessorTraversal, result *accessorCandidates, cut *sourceMemberWriterReadCut) bool {
	e := q.installedMemberPhase
	if e == nil || result == nil || result.opaque || !q.liveInstalledMemberPhase(e, e.get, cut) || mode != e.getMode() || origin != e.application.origin || e.inventory == nil {
		return false
	}
	key := name
	if len(projection) == 1 && name == "" {
		key = projection[0]
	} else if len(projection) != 0 {
		return false
	}
	if key != e.application.key {
		return false
	}
	b := q.stagedMember
	if b == nil || b.installedMember != e || !q.liveStagedMemberSource(b, e.get, cut) || !b.indexed || !b.represented || b.coverage == nil || !b.coverage.extracted || b.coverage.origin != origin || b.coverage.cut != e.application.memberCut || !sameInstalledMemberApplication(b.coverage.installedMember, &e.application) || !e.inventory() || !q.liveInstalledMemberPhase(e, e.get, cut) {
		return false
	}
	pending := sourceInstalledMemberPending{application: cloneInstalledMemberApplication(&e.application), request: e.application.request, coverage: b.coverage.request, phase: e.application.phase}
	for _, prior := range result.memberHandoffs().installedMemberPending {
		if sameOperationRequest(prior.request, pending.request) && sameOperationRequest(prior.coverage, pending.coverage) && prior.phase == pending.phase {
			return true
		}
	}
	handoffs := result.editMemberHandoffs()
	handoffs.installedMemberPending = append(handoffs.installedMemberPending, pending)
	return true
}

// sourceInstalledMemberObservation is graph-local evidence from a real phase
// traversal. Semantic revisions are immutable for that traversal. APPLIED wakes
// the original owner but cannot update these revisions or local accounting.
type sourceInstalledMemberObservation struct {
	self        *sourceInstalledMemberObservation
	application sourceInstalledMemberApplication
	epoch       *sourceStagedOperationEpoch
	required    []sourceStagedOperationDependency
	revisions   []uint64
	accounted   bool
	bodies      []sourceInstalledMemberBody
}

func validInstalledMemberRecipe(recipe sourceStagedOperationRecipe) bool {
	a := recipe.installedMember
	if !validInstalledMemberApplication(a) || recipe.key != a.request.producer || recipe.descriptorTarget != nil || recipe.installedCall != nil || recipe.frameworkEffects != nil || recipe.descriptorSource != nil || recipe.moduleArgument != nil || recipe.declarationCall != nil || recipe.declarationCallGeneration != nil || recipe.entryLaw != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.hasInstance != nil || recipe.callResult != nil || recipe.memberSource != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || recipe.constructed != nil || recipe.nativeGet != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	for _, effect := range recipe.delta.effects {
		if !validOperationEnvironmentEffect(effect) {
			return false
		}
	}
	for i, required := range recipe.delta.required {
		if required.producer == recipe.key || !operationContainsRequest(a.inputRequired, required) && (required.consumer != a.request.consumer || required.cut != a.memberCut && !sameOperationRequest(required, a.nativeGet) && !installedMemberNestedRequestShape(required)) {
			return false
		}
		for _, previous := range recipe.delta.required[:i] {
			if sameOperationRequest(previous, required) {
				return false
			}
		}
	}
	return true
}

// enrollInstalledMemberPhase happens before ordinary member enumeration, so a
// parent cannot seal before learning that this phase has source work. A missing
// phase publisher is represented as pending, never as an empty inventory.
func (work *callableEffectWork) enrollInstalledMemberPhase(facts []callableFacts, q *sourceValueQuery, event *sourceInstalledMemberEvent) bool {
	if event == nil || !q.liveInstalledMemberPhase(event, event.get, event.read) || event.application.generation != work.operationGeneration {
		return false
	}
	recipe := sourceStagedOperationRecipe{key: event.application.request.producer, installedMember: cloneInstalledMemberApplication(&event.application)}
	if prior, exists := work.operationRecipes[recipe.key]; exists {
		if !validInstalledMemberRecipe(prior) || !sameInstalledMemberApplication(prior.installedMember, recipe.installedMember) {
			return false
		}
	} else if !work.registerOperationRecipe(facts, recipe) {
		return false
	}
	return work.registerOperationUse(facts, sourceStagedOperationUse{request: event.application.request})
}

// enrollInstalledMemberCoverage admits the mandatory C edge of an already
// enrolled original Get before its live source publisher emits that prefix.
// The caller has registered C and validated its complete current child list.
// Passive source descriptions never enter this path. No observation, local
// extraction or child revision is manufactured by admitting the dependency.
func (work *callableEffectWork) enrollInstalledMemberCoverage(facts []callableFacts, q *sourceValueQuery, event *sourceInstalledMemberEvent, coverage *sourceStagedMemberCoverage) bool {
	if event == nil || coverage == nil || !q.liveInstalledMemberPhase(event, event.get, event.read) || event.work != work || event.epoch != work.operationEpoch {
		return false
	}
	b := q.stagedMember
	if b == nil || b.installedMember != event || b.coverage != coverage || !q.liveStagedMemberSource(b, event.get, event.read) || !sameOperationRequest(b.request, event.application.request) || coverage.generation != event.application.generation || coverage.origin != event.application.origin || coverage.cut != event.application.memberCut || !sameInstalledMemberApplication(coverage.installedMember, &event.application) {
		return false
	}
	recipe, known := work.operationRecipes[event.application.request.producer]
	id := work.operationIDs[event.application.request.producer]
	if !known || !validInstalledMemberRecipe(recipe) || !sameInstalledMemberApplication(recipe.installedMember, &event.application) || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	if operationContainsRequest(recipe.delta.required, coverage.request) {
		return true // Repeated original publications keep the same admitted edge.
	}
	// A prior traversal's sealed envelope or semantic observation cannot grow.
	if recipe.delta.extracted || work.operations[id.index].installedMemberObserved != nil {
		return false
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, coverage.request)
	// This existing parent publisher registers all dependency memberships before
	// output. The parent stays unextracted until its original record/finalizer.
	return work.publishInstalledMemberPrefix(facts, recipe)
}

// recordInstalledMemberPhase must run after the original ordinary population
// finishes and while its exact source-set owner is live. It publishes only
// local source membership and the unchanged read-accounting verdict. It neither
// interprets candidate bodies nor replaces a runtime unknown with completion.
func (work *callableEffectWork) recordInstalledMemberPhase(facts []callableFacts, q *sourceValueQuery, event *sourceInstalledMemberEvent, result *accessorCandidates) bool {
	if event == nil || result == nil || !q.liveInstalledMemberPhase(event, event.get, event.read) {
		return false
	}
	prior, exists := work.operationRecipes[event.application.request.producer]
	if !exists || !validInstalledMemberRecipe(prior) || !sameInstalledMemberApplication(prior.installedMember, &event.application) {
		return false
	}
	recipe := prior
	recipe.delta = cloneOperationDelta(prior.delta)
	bodies, donorsRepresented := work.publishInstalledMemberDonors(facts, q, event, &recipe, result)
	if !work.publishInstalledMemberPrefix(facts, recipe) {
		return false
	}
	b := q.stagedMember
	if b == nil || b.installedMember != event || !q.liveStagedMemberSource(b, event.get, event.read) || b.coverage == nil || b.coverage.generation != event.application.generation || b.coverage.cut != event.application.memberCut || b.coverage.origin != event.application.origin || !sameOperationRequest(b.request, event.application.request) {
		return false
	}
	// C was issued by this actual member population. Its existing source
	// owner retains every candidate/default/body/key requirement. The phase
	// reads that exact C; it neither recreates nor flattens its children.
	coverage, represented := work.operationRecipes[b.coverage.request.producer]
	if !represented || coverage.memberSource == nil || coverage.memberSource.coverage == nil || !sameInstalledMemberApplication(coverage.memberSource.installedMember, &event.application) || !sameOperationRequest(coverage.memberSource.parent, b.request) || !sameOperationRequest(coverage.memberSource.request, b.coverage.request) || !validOperationEnvelope(coverage) {
		return false
	}
	for _, required := range event.application.inputRequired {
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, required)
	}
	if event.application.nativeGet.producer.operation != nil {
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, event.application.nativeGet)
	}
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, b.coverage.request)
	for _, pending := range result.memberHandoffs().installedMemberPending[event.pendingStart:] {
		if sameOperationRequest(pending.request, event.application.request) {
			continue
		}
		child, known := work.operationRecipes[pending.request.producer]
		if !known || !validInstalledMemberReading(child, pending.request) || !sameInstalledMemberApplication(child.installedMember, pending.application) || child.installedMember.generation != work.operationGeneration || pending.phase != child.installedMember.phase || !sameOperationRequest(pending.coverage, stagedMemberCoverageRequest(pending.request, pending.application.origin, pending.application.memberCut)) {
			return false
		}
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, pending.request)
	}
	localAccounted := false // original accessor has not returned its final disposition
	recipe.delta.extracted = prior.delta.extracted
	if !donorsRepresented {
		return false
	}
	if !validInstalledMemberRecipe(recipe) || !work.publishInstalledMemberPrefix(facts, recipe) {
		return false
	}
	id, adopted := work.operationIDs[b.request.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	if state.invalid || !state.dependenciesRegistered || len(state.dependencies) != len(recipe.delta.required) {
		return false
	}
	observed := &sourceInstalledMemberObservation{application: *cloneInstalledMemberApplication(&event.application), epoch: work.operationEpoch, bodies: bodies, accounted: localAccounted}
	observed.self = observed
	for i, required := range recipe.delta.required {
		dependency := state.dependencies[i]
		if !sameOperationRequest(dependency.request, required) || dependency.producer.epoch != work.operationEpoch || dependency.producer.index == 0 || int(dependency.producer.index) >= len(work.operations) {
			return false
		}
		child := &work.operations[dependency.producer.index]
		if child.key != required.producer {
			return false
		}
		observed.required = append(observed.required, dependency)
		observed.revisions = append(observed.revisions, child.revision)
	}
	event.observation = observed
	if !sameInstalledMemberObservation(state.installedMemberObserved, observed) {
		state.installedMemberObserved = observed
		// Only this live semantic event changes the observation disposition.
		// Child delivery may queue a fresh event, but cannot enter this path.
		state.revision++
		work.notifyOperationSubscribers(state)
	} else {
		event.observation = state.installedMemberObserved
	}
	work.attachInstalledCallPhaseDependencies(facts, event.application.request)
	q.markInstalledCallMemberObservation(event)
	return true
}

func sameInstalledMemberObservation(a, b *sourceInstalledMemberObservation) bool {
	if a == nil || b == nil || a.self != a || b.self != b || a.epoch != b.epoch || a.accounted != b.accounted || !slices.Equal(a.bodies, b.bodies) || !sameInstalledMemberApplication(&a.application, &b.application) || len(a.required) != len(b.required) || len(a.revisions) != len(b.revisions) {
		return false
	}
	for i, required := range a.required {
		if required.producer != b.required[i].producer || !sameOperationRequest(required.request, b.required[i].request) || a.revisions[i] != b.revisions[i] {
			return false
		}
	}
	return true
}

// installedMemberObservationCurrent does not run a query or replay a phase.
// Every observed semantic revision must still be the same and each exact child
// reader must have applied it. Revision zero cannot be recertified by an ACK.
func (work *callableEffectWork) installedMemberObservationCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validInstalledMemberRecipe(recipe) || recipe.installedMember.generation != work.operationGeneration || !installedMemberGenerationActive(work.operationGeneration) {
		return false
	}
	id, exists := work.operationIDs[recipe.key]
	if !exists || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	if native := recipe.installedMember.nativeGet; native.producer.operation != nil {
		child := work.operationRecipes[native.producer]
		if child.nativeGet == nil || !work.nativeEffectsGetCurrent(child.nativeGet) {
			return false
		}
	}
	state := &work.operations[id.index]
	o := state.installedMemberObserved
	if state.key != recipe.key || state.invalid || !state.delta.extracted || !state.dependenciesRegistered || !operationDeltaPrefix(state.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, state.delta) || len(recipe.delta.required) != len(state.dependencies) || o == nil || o.self != o || o.epoch != work.operationEpoch || !o.accounted || !work.installedMemberBodiesCurrent(&o.application, o.bodies) || !sameInstalledMemberApplication(&o.application, recipe.installedMember) || len(o.required) != len(state.dependencies) || len(o.revisions) != len(o.required) {
		return false
	}
	for i, observed := range o.required {
		dependency := state.dependencies[i]
		if observed.producer != dependency.producer || !sameOperationRequest(observed.request, dependency.request) || observed.producer.epoch != work.operationEpoch || observed.producer.index == 0 || int(observed.producer.index) >= len(work.operations) || o.revisions[i] == 0 {
			return false
		}
		child := &work.operations[observed.producer.index]
		subscriber := child.subscribers[sourceStagedOperationConsumer{consumer: observed.request.consumer, edge: observed.request.edge}]
		if child.key != observed.request.producer || child.invalid || !child.delta.extracted || !child.dependenciesRegistered || child.revision != o.revisions[i] || subscriber == nil || !sameOperationRequest(subscriber.request, observed.request) || subscriber.blocked || subscriber.consumed != child.revision || subscriber.applied != child.revision {
			return false
		}
	}
	return true
}

// installedMemberOutcomeCurrent consumes only this original field's typed
// dependency. Call selection/body completeness remains with sourceFieldCall.
// It supplies no value, member absence, NoWrites, identity or normal receipt.
func (work *callableEffectWork) installedMemberFieldOutcomeCurrent(outcome *sourceInstalledMemberRequirement) bool {
	if outcome == nil || !validInstalledMemberApplication(&outcome.application) || outcome.demand.operation != outcome.application.memberCut.operation || outcome.demand.key != outcome.application.key || outcome.demand.consumer != outcome.application.request.consumer || outcome.demand.use != outcome.application.request.use {
		return false
	}
	recipe, exists := work.operationRecipes[outcome.application.request.producer]
	if !exists || !sameInstalledMemberApplication(recipe.installedMember, &outcome.application) || !work.installedMemberObservationCurrent(recipe) {
		return false
	}
	if outcome.call.producer.operation != nil && !work.installedCallFieldObservationCurrent(outcome) {
		return false
	}
	return sameInstalledMemberRequest(outcome.request, outcome.application.request) && work.installedMemberOutcomeCurrent(outcome.request).current
}

// installedMemberRequirement is issued inside the original phase before its
// field outcome is appended. An absent requirement keeps the legacy outcome;
// an enrolled pending requirement is not falsely published as fulfilled=false.
func (q *sourceValueQuery) installedMemberRequirement(demand sourceFieldDemand, candidates ...*accessorCandidates) *sourceInstalledMemberRequirement {
	event := q.installedMemberPhase
	if event != nil && q.liveInstalledMemberPhase(event, event.get, event.read) && demand.operation == event.get.operation && demand.consumer == event.application.request.consumer && demand.use == event.application.request.use && demand.key == event.application.key {
		return q.installedMemberReading(event, demand)
	}
	// The original accessor can finish before its outer field consumer publishes
	// the outcome. Its detached reading is descriptive; the same genuine input
	// lease/cut must still own this consumer, and graph delivery is checked later.
	if len(candidates) != 1 || candidates[0] == nil || !q.installedMemberInputOwned(q.installedMemberInput) {
		return nil
	}
	for _, reading := range candidates[0].memberHandoffs().installedMemberReadings {
		application := &reading.application
		if reading.demand == demand && application.generation == q.owner.generation && application.request.consumer == q.effectOwner && application.memberCut == q.relativeInputCut(demand.operation) && sameInstalledMemberInputEdge(application.binding, q.installedMemberInput.binding) && validInstalledMemberApplication(application) {
			copy := reading
			copy.application = *cloneInstalledMemberApplication(application)
			return &copy
		}
	}
	return nil
}

func (q *sourceValueQuery) installedMemberReading(event *sourceInstalledMemberEvent, demand sourceFieldDemand) *sourceInstalledMemberRequirement {
	out := &sourceInstalledMemberRequirement{request: event.application.request, application: *cloneInstalledMemberApplication(&event.application), demand: demand}
	if body := q.installedCallBody; body != nil && body.live && body.issuer == q && body.inputs == q.inputs && body.body == demand.declaration && body.call == event.application.binding.request.operation {
		out.call = installedCallPhaseRequest(event.application, body.body, body.call)
	}
	return out
}

// publishInstalledMemberReading runs while the actual phase and its original
// result are live. It transports no outcome/current bit, only the exact original
// field requirement which the outer consumer must retain before parent sealing.
func (q *sourceValueQuery) publishInstalledMemberReading(event *sourceInstalledMemberEvent) {
	if event == nil || event.result == nil || !q.liveInstalledMemberPhase(event, event.get, event.read) {
		return
	}
	demand := q.operationFieldDemand(event.get.operation, event.application.key)
	if demand.declaration == nil || demand.operation != event.get.operation || demand.consumer != event.application.request.consumer || demand.use != event.application.request.use {
		return
	}
	reading := q.installedMemberReading(event, demand)
	for _, prior := range event.result.memberHandoffs().installedMemberReadings {
		if sameInstalledMemberReading(&prior, reading) {
			return
		}
	}
	handoffs := event.result.editMemberHandoffs()
	handoffs.installedMemberReadings = append(handoffs.installedMemberReadings, *reading)
}

func sameInstalledMemberReading(a, b *sourceInstalledMemberRequirement) bool {
	return a == nil && b == nil || a != nil && b != nil && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.call, b.call) && a.demand == b.demand && sameInstalledMemberApplication(&a.application, &b.application)
}
func cloneInstalledMemberReadings(readings []sourceInstalledMemberRequirement) []sourceInstalledMemberRequirement {
	out := append([]sourceInstalledMemberRequirement(nil), readings...)
	for index := range out {
		out[index].application = *cloneInstalledMemberApplication(&out[index].application)
	}
	return out
}

// sourceInstalledMemberDelivery distinguishes absent enrollment from compiler
// work still pending and from actual delivered current source accounting.
// It contains no output, scope, input frame or right to invoke a source.
type sourceInstalledMemberDelivery struct {
	request  sourceStagedOperationRequest
	producer sourceStagedOperationID
	revision uint64
	enrolled bool
	current  bool
}

func validInstalledMemberReading(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	return validInstalledMemberRecipe(recipe) && sameInstalledMemberRequest(recipe.installedMember.request, request)
}

// validInstalledMemberSourceReading admits only the full request sealed by
// this installed factory. It does not relax the original-cut admission of an
// unrelated definition, native, external or normal consumer.
func (work *callableEffectWork) validInstalledMemberSourceReading(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	if recipe.installedMember != nil {
		return recipe.installedMember.generation == work.operationGeneration && validInstalledMemberReading(recipe, request)
	}
	s := recipe.memberSource
	return s != nil && s.installedMember != nil && s.installedMember.generation == work.operationGeneration && validStagedMemberRecipe(recipe) && sameOperationRequest(s.request, request) && stagedMemberFactoryParent(s)
}

// installedMemberOutcomeApplied is the nonrecursive source disposition used
// INSIDE operationDependencyReadiness. Outer conjunction supplies transitive
// closure through the recipe's exact required memberships. This function and
// its observation/body helpers must never call an operation-closure solver.
func (work *callableEffectWork) installedMemberOutcomeApplied(request sourceStagedOperationRequest) sourceInstalledMemberDelivery {
	out := sourceInstalledMemberDelivery{request: request}
	recipe, present := work.operationRecipes[request.producer]
	if !present || !validInstalledMemberReading(recipe, request) || recipe.installedMember.generation != work.operationGeneration || !installedMemberGenerationActive(work.operationGeneration) {
		return out
	}
	id, adopted := work.operationIDs[request.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return out
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{consumer: request.consumer, edge: request.edge}]
	if subscriber == nil || !sameOperationRequest(subscriber.request, request) {
		return out
	}
	out.enrolled = true
	out.producer = id
	out.revision = state.revision
	out.current = !state.invalid && state.delta.extracted && state.dependenciesRegistered && work.installedMemberObservationCurrent(recipe) && state.revision != 0 && subscriber != nil && !subscriber.blocked && sameOperationRequest(subscriber.request, request) && subscriber.consumed == state.revision && subscriber.applied == state.revision
	return out
}

// installedMemberOutcomeCurrent is the transitive readback for final source
// residual resolution OUTSIDE operationDependencyReadiness. Algorithm/current
// predicates within that conjunction must use installedMemberOutcomeApplied.
func (work *callableEffectWork) installedMemberOutcomeCurrent(request sourceStagedOperationRequest) sourceInstalledMemberDelivery {
	out := work.installedMemberOutcomeApplied(request)
	if !out.current {
		return out
	}
	closed := work.closedOperationDependencies()
	out.current = int(out.producer.index) < len(closed) && closed[out.producer.index]
	return out
}

// installedMemberResultAccounted retains every unrepresented effects carrier.
// Source value uncertainty alone is independent of field effects. Normal/owned
// execution evidence is not transported by this SOURCE-only phase factory.
func (work *callableEffectWork) installedMemberResultAccounted(event *sourceInstalledMemberEvent, result *accessorCandidates) bool {
	if result == nil || (!result.sourceOwned && !event.constructionAccounted) || result.opaque || result.receiverIncomplete || result.fieldReceiverIncomplete || result.thenIncomplete || len(result.owned)+len(result.ownedGets)+len(result.ownedClaims)+len(result.normalCalls)+len(result.nativeCalls)+len(result.nativeDescriptorEffects)+len(result.accessorMutations)+len(result.writeBodies)+len(result.writeOutcomes)+len(result.thenReferences)+len(result.reflective)+len(result.ordinaryBodies)+len(result.descriptorFallbacks) != 0 {
		return false
	}
	for _, field := range result.fieldFallbacks {
		if !localFieldCovered(field, result.fieldCalls, work.installedMemberFieldOutcomeCurrent) {
			return false
		}
	}
	for _, call := range result.callFallbacks {
		if !localCallCovered(call, result.callOutcomes) {
			return false
		}
	}
	// Every additional binder is associated by the actual source-body
	// callback, not by flags or a matching count. Borrowed inputs never leave
	// this original phase event.
	return installedMemberBodyInputsRepresented(event, result)
}

// finishInstalledMemberOutcome runs before the original phase interval is
// revoked. The ordinary accessor can set its final SOURCE verdict after its
// population returns. Keep the semantic snapshot from the actual population;
// this finalization changes only that original phase's own disposition.
func (work *callableEffectWork) finishInstalledMemberOutcome(q *sourceValueQuery, event *sourceInstalledMemberEvent) bool {
	if event == nil || event.result == nil || event.observation == nil || !q.liveInstalledMemberPhase(event, event.get, event.read) || !work.finishInstalledMemberDonors(q, event) || !work.installedMemberResultAccounted(event, event.result) {
		return false
	}
	recipe, present := work.operationRecipes[event.application.request.producer]
	if !present || !validInstalledMemberRecipe(recipe) || !sameInstalledMemberApplication(recipe.installedMember, &event.application) {
		return false
	}
	id, adopted := work.operationIDs[recipe.key]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	original := event.observation
	if state.installedMemberObserved != original || original.self != original || original.epoch != work.operationEpoch || original.accounted {
		return original.accounted
	}
	// A source set must really have been published by this original event.
	if len(recipe.delta.required) == 0 || len(recipe.delta.required) != len(original.required) {
		return false
	}
	for i, required := range original.required {
		if !sameOperationRequest(required.request, recipe.delta.required[i]) {
			return false
		}
	}

	copy := *original
	copy.self = &copy
	copy.accounted = true
	recipe.delta = cloneOperationDelta(recipe.delta)
	bodies, represented := work.publishInstalledMemberDonors(work.operationFacts, q, event, &recipe, event.result)
	if !represented {
		return false
	}
	for i, body := range bodies {
		for _, old := range original.bodies {
			if old.producer == body.producer && old.operation == body.operation && old.edge == body.edge {
				bodies[i] = old
				break
			}
		}
	}
	copy.bodies = bodies
	recipe.delta.extracted = true
	if !work.attachOperationSource(work.operationFacts, recipe) {
		return false
	}
	state = &work.operations[id.index]
	state.installedMemberObserved = &copy
	event.observation = &copy
	state.revision++
	work.notifyOperationSubscribers(state)
	return true
}

// Nested phase membership is data, never an admitted phase observation. The
// live publisher additionally validates its actual registered typed factory;
// clones retain this description but have no current observation to consume.
func installedMemberNestedRequestShape(request sourceStagedOperationRequest) bool {
	return request.producer.kind == relativeDemandEffects && request.producer.declaration != nil && request.producer.operation != nil && request.consumer != nil && request.use != nil && request.edge != "" && request.cut.operation == request.producer.operation && request.inputs != nil && request.inputs.delivered && request.inputs.bound.unsupported == relativeInputsSupported && sameSourceRelativeInputEnvelope(request.inputs.request, request.inputs.bound)
}

// publishInstalledMemberPrefix permits known effects to flow while source work
// is pending. attachOperationSource normally waits for local extraction on a
// revision-zero producer; this original event explicitly owns its partial delta.
func (work *callableEffectWork) publishInstalledMemberPrefix(facts []callableFacts, recipe sourceStagedOperationRecipe) bool {
	if !work.attachOperationSource(facts, recipe) {
		return false
	}
	id, adopted := work.operationIDs[recipe.key]
	if !adopted {
		return false
	}
	if operationDeltaSize(recipe.delta) != 0 {
		return work.publishOperation(id, recipe.delta)
	}
	return !recipe.delta.extracted || work.publishSourceDisposition(id)
}
