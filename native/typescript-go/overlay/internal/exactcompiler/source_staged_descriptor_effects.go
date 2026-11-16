package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// descriptorInputRequirements keeps source membership separate from both Call
// Effects and native result membership. A formal can denote unknown runtime
// contents while its actual source/binder delivery remains mandatory.
func descriptorInputRequirements(source *sourceStagedDescriptorRetrieval) ([]sourceStagedOperationRequest, bool) {
	if source == nil {
		return nil, false
	}
	result := &sourceStagedCallResultSource{request: stagedCallResultRequest(source.request.producer.operation, source.request.producer.declaration), nativeDescriptor: source}
	required, supported := nativeDescriptorResultRequirements(result)
	if len(required) < 2 {
		return nil, false
	}
	return required[2:], supported
}

// validDescriptorAlgorithmInputRequirement admits only the operand DATA already
// named by the descriptor algorithm's exact phase prefix. It grants no delivery,
// currentness or exception to the envelope's consumer/input-edge checks.
func validDescriptorAlgorithmInputRequirement(recipe sourceStagedOperationRecipe, required sourceStagedOperationRequest) bool {
	source := recipe.nativeGet
	if source == nil || source.descriptorRead == nil || required.producer.kind != relativeDemandDirectExposure || recipe.key != nativeRootDebtRequest(source, "algorithm").producer || !validDescriptorEffectsPhase(recipe) {
		return false
	}
	inputs, supported := descriptorInputRequirements(source.descriptorRead)
	if !supported {
		return false
	}
	for _, input := range inputs {
		if sameOperationRequest(input, required) {
			return true
		}
	}
	return false
}

// validDescriptorEffectsPhase validates the original publisher's role, never an
// empty effect set or a NoUser law. Eager evaluation and native conversion share
// one real per-call publisher; the eager role requires that exact algorithm.
func validDescriptorEffectsPhase(recipe sourceStagedOperationRecipe) bool {
	source := recipe.nativeGet
	if !validDescriptorRetrieval(source) || len(recipe.delta.effects)+len(recipe.delta.residuals)+len(recipe.delta.exposures)+len(recipe.delta.relative)+len(recipe.delta.invoked) != 0 {
		return false
	}
	if operationDeltaSize(recipe.delta) == 0 && !recipe.delta.extracted {
		return true // Pending registration, not original event completion.
	}
	var required []sourceStagedOperationRequest
	switch recipe.key {
	case nativeRootDebtRequest(source, "eager-inputs").producer:
		required = []sourceStagedOperationRequest{nativeRootDebtRequest(source, "algorithm")}
	case nativeRootDebtRequest(source, "algorithm").producer:
		inputs, supported := descriptorInputRequirements(source.descriptorRead)
		if !supported {
			return false
		}
		required = append([]sourceStagedOperationRequest{nativeRootDebtRequest(source, "callee-get")}, inputs...)
	default:
		return false
	}
	if len(recipe.delta.required) < len(required) || !operationPrefix(required, recipe.delta.required, sameOperationRequest) {
		return false
	}
	if recipe.key == nativeRootDebtRequest(source, "eager-inputs").producer {
		return len(recipe.delta.required) == len(required)
	}
	for i, field := range recipe.delta.required[len(required):] {
		if !descriptorInstalledMemberRequest(source, field) {
			return false
		}
		for _, prior := range recipe.delta.required[:len(required)+i] {
			if sameOperationRequest(prior, field) {
				return false
			}
		}
	}
	return true
}

// prepareDescriptorEffects runs the original source publisher once in the live
// graph. It has no source-return consumer, so DATA cannot recursively pay its
// own Effects. Unrepresented compiler work keeps extraction pending; the native
// runtime MAY contribution is merely additive in the original owning fact.
func (work *callableEffectWork) prepareDescriptorEffects(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil || owner.project == nil || owner.project.activeGeneration != work.operationGeneration || owner.values.generation != work.operationGeneration || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if !validDescriptorEffectsPhase(recipe) || recipe.nativeGet.descriptorRead.generation != work.operationGeneration {
		return
	}
	caller, known := work.memberNodes[recipe.key.declaration]
	publisher := owner.pendingMemberPublishers[recipe.key.declaration]
	if !known || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].normalInputs != nil || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	if len(recipe.delta.required) == 0 {
		var required []sourceStagedOperationRequest
		if recipe.key == nativeRootDebtRequest(recipe.nativeGet, "eager-inputs").producer {
			required = []sourceStagedOperationRequest{nativeRootDebtRequest(recipe.nativeGet, "algorithm")}
		} else {
			inputs, supported := descriptorInputRequirements(recipe.nativeGet.descriptorRead)
			if !supported {
				return
			}
			required = append([]sourceStagedOperationRequest{nativeRootDebtRequest(recipe.nativeGet, "callee-get")}, inputs...)
			// Register actual source producers before attaching their required uses.
			for _, request := range inputs {
				child, eligible := work.describeStagedCallResultSource(facts, caller, request.producer.operation, owner)
				if !eligible || !sameOperationRequest(child.request, request) {
					return
				}
				if _, exists := work.operationRecipes[request.producer]; !exists && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, callResult: child}) {
					return
				}
			}
		}
		recipe.delta.required = required
		if !work.attachOperationSource(facts, recipe) {
			return
		}
	}
	work.attachSourceObservationDependencies(facts, id)
	work.operations[id.index].writerSourceRevisions = work.sourceObservationRevisions(id)
	if !work.nativeEffectsGetCurrent(recipe.nativeGet) {
		return
	}
	if recipe.key == nativeRootDebtRequest(recipe.nativeGet, "eager-inputs").producer {
		recipe.delta = sourceStagedOperationDelta{extracted: true, required: []sourceStagedOperationRequest{nativeRootDebtRequest(recipe.nativeGet, "algorithm")}}
		if work.attachOperationSource(facts, recipe) {
			work.publishOperation(id, recipe.delta)
		}
		return
	}
	state = &work.operations[id.index]
	if state.writerSourceRunning {
		return
	}
	if state.resultSourceRequested {
		// Completion consumes the retained original enumeration and real source
		// child deliveries. It never calls an appender or reclassifies old flags.
		work.completeDescriptorEffects(facts, id)
		return
	}
	inputs, supported := descriptorInputRequirements(recipe.nativeGet.descriptorRead)
	if !supported {
		return
	}
	for _, request := range inputs {
		child, eligible := work.describeStagedCallResultSource(facts, caller, request.producer.operation, owner)
		if !eligible || !sameOperationRequest(child.request, request) {
			return
		}
		if _, exists := work.operationRecipes[request.producer]; !exists && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, callResult: child}) {
			return
		}
		if _, adopted := work.requireOperation(facts, request); !adopted {
			return
		}
		if data, applied := work.stagedCallResultData(request); !applied || !data.delta.extracted {
			return
		}
	}
	work.operations[id.index].writerSourceRunning = true
	defer func() { work.operations[id.index].writerSourceRunning = false }()
	var observed []sourceBodyEffectsObservation
	candidates := appendArgumentAccessorEffectsObserved(&facts[caller], recipe.key.operation, work.memberNodes, facts[caller].sourceFile, owner.checker, owner, nil, sourceEffectsObserver{
		body: func(o sourceBodyEffectsObservation) { observed = append(observed, o) },
		callee: func(o *sourceCalleeEffectsObservation) bool {
			return work.descriptorCalleeComponentsOwned(facts, owner, recipe, o)
		},
	})
	// Only this ORIGINAL once-only traversal can finish the separate mutation
	// SOURCE enumeration. Effects/current/closure remain independently owned.
	if mutation := work.operations[id.index].descriptorMutations; mutation != nil {
		mutation.sealed = true
	}
	work.publishDeclaredNativeMutationData(facts, id)
	current := work.operationRecipes[recipe.key]
	bodies, represented := work.requireFrameworkEffectsBodies(facts, current, candidates)
	work.operations[id.index].memberActivations = bodies
	enumeration := &sourceDescriptorEffectsEnumeration{request: nativeRootDebtRequest(current.nativeGet, "algorithm"), generation: work.operationGeneration}
	enumeration.represented = represented && descriptorSourceBodiesRepresented(candidates, &facts[caller], observed, work.operationGeneration) && !frameworkEffectsCompilerPendingWithoutSourceBodies(candidates)
	// Typed installed-source requirements are attached before publication can
	// close. Legacy false outcomes remain false and cannot name a paid child.
	retainField := func(outcome sourceFieldOutcome) {
		if outcome.installedMember == nil {
			return
		}
		requirement := outcome.installedMember
		request := requirement.application.request
		child, registered := work.operationRecipes[request.producer]
		if requirement.demand != outcome.demand || !registered || !validInstalledMemberReading(child, request) || !descriptorInstalledMemberRequest(current.nativeGet, request) {
			enumeration.represented = false
			return
		}
		enumeration.fields = appendEntryLawRequirement(enumeration.fields, request)
	}
	for _, outcome := range candidates.fieldOutcomes {
		retainField(outcome)
	}
	for _, call := range candidates.fieldCalls {
		for _, outcome := range call.outcomes {
			retainField(outcome)
		}
	}
	for _, pending := range candidates.installedMemberPending {
		if !work.descriptorInstalledPendingRegistered(current.nativeGet, pending) {
			enumeration.represented = false
			continue
		}
		// The phase owns only its original inventory arm. Existing aggregate
		// uncertainty above remains a refusal; this is no opacity-bit waiver.
		enumeration.fields = appendEntryLawRequirement(enumeration.fields, pending.request)
	}
	work.operations[id.index].descriptorEnumeration = enumeration
	work.operations[id.index].resultSourceRequested = true
	for _, request := range enumeration.fields {
		current.delta.required = appendEntryLawRequirement(current.delta.required, request)
	}
	if !work.attachOperationSource(facts, current) {
		return
	}
	work.attachSourceObservationDependencies(facts, id)
	work.completeDescriptorEffects(facts, id)
}

// descriptorSourceBodiesRepresented requires every returned structured source
// record to belong to its actual synchronous binder and retained fact. The
// canonical summary deliveries remain independently required by the reader.
// This never completes an individual field/Call outcome or a normal frame.
func descriptorSourceBodiesRepresented(c accessorCandidates, fact *callableFacts, observed []sourceBodyEffectsObservation, generation *projectGeneration) bool {
	for _, input := range c.inputs {
		matched := false
		for _, o := range observed {
			ordinaryCall := input != nil && input.invocation == o.call.operation
			getter := descriptorGetterBodyPhase(c, o) && input != nil && input.get != nil && input.invocation == nil && o.sourceGet.operation == o.call.operation && input.get.operation == o.call.operation && ast.IsGetAccessorDeclaration(input.declaration) && len(input.declaration.Parameters()) == 0
			matched = matched || input == o.inputs && o.generation == generation && o.consumer == fact.node && o.inputs != nil && o.inputs.deferredBody == false && o.inputs.storage == nil && o.inputs.operationLifetime == nil && o.call.dependencies && o.call.complete && o.call.target == input.declaration && (ordinaryCall || getter)
		}
		if !matched {
			return false
		}
	}
	for _, call := range c.fieldCalls {
		matched, retained := false, false
		for _, o := range observed {
			matched = matched || o.generation == generation && o.consumer == fact.node && containsFrameworkSourceInput(c.inputs, o.inputs) && sameFrameworkSourceBodyRecord(call, o.call)
		}
		for _, published := range fact.fieldCalls {
			retained = retained || sameFrameworkSourceBodyRecord(call, published)
		}
		if !matched || !retained {
			return false
		}
		for _, outcome := range call.calls {
			published := false
			for _, actual := range fact.callOutcomes {
				published = published || actual == outcome
			}
			if !published {
				return false
			}
		}
	}
	return true
}

// sourceDescriptorEffectsEnumeration retains only the outcome of the original
// source publisher on this existing algorithm operation. Typed field references
// are dependencies, not cached observations. Unsupported source remains unpaid;
// semantic children publish their own later donors through their real owners.
type sourceDescriptorEffectsEnumeration struct {
	request     sourceStagedOperationRequest
	generation  *projectGeneration
	fields      []sourceStagedOperationRequest
	represented bool
}

// descriptorInstalledMemberRequest validates only the detached phase shape.
// Genuine factory enrollment/current observation is checked against that exact
// registered installed-member recipe by the consumer below. This lends no event.
func descriptorInstalledMemberRequest(source *sourceStagedNativeGetSource, request sourceStagedOperationRequest) bool {
	return validDescriptorRetrieval(source) && request.producer.kind == relativeDemandEffects && request.consumer == source.request.consumer && request.inputs != nil && request.inputs.request.operation != nil && request.producer.selector.association == request.inputs.request.operation && request.producer.selector.occurrence != nil && strings.HasPrefix(request.producer.selector.field, "installed-member:") && request.cut.operation == request.producer.operation && request.cut.use == request.use
}

// completeDescriptorEffects finishes local enumeration with its real children
// retained. Closure separately consumes current field observations and summary
// deliveries. A wake never reruns the original Call or edits an observation.
func (work *callableEffectWork) completeDescriptorEffects(facts []callableFacts, id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	enumeration := state.descriptorEnumeration
	recipe := work.operationRecipes[state.key]
	if enumeration == nil || !enumeration.represented || enumeration.generation != work.operationGeneration || !state.resultSourceRequested || !validDescriptorEffectsPhase(recipe) || !sameOperationRequest(enumeration.request, nativeRootDebtRequest(recipe.nativeGet, "algorithm")) {
		return
	}
	for _, request := range enumeration.fields {
		child, present := work.operationRecipes[request.producer]
		if !present || !validInstalledMemberReading(child, request) {
			return
		}
	}
	recipe.delta.extracted = true
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, recipe.delta)
	}
}

// descriptorEffectsEnumerationCurrent requires original enumeration and exact
// semantic field deliveries, not enrollment or an ACK-only vector refresh.
func (work *callableEffectWork) descriptorEffectsEnumerationCurrent(id sourceStagedOperationID, recipe sourceStagedOperationRecipe) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	enumeration := state.descriptorEnumeration
	if enumeration == nil || !enumeration.represented || !state.resultSourceRequested || !recipe.delta.extracted || !operationDeltaPrefix(state.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, state.delta) || enumeration.generation != work.operationGeneration || !validDescriptorEffectsPhase(recipe) || !sameOperationRequest(enumeration.request, nativeRootDebtRequest(recipe.nativeGet, "algorithm")) {
		return false
	}
	head, supported := descriptorInputRequirements(recipe.nativeGet.descriptorRead)
	if !supported || len(recipe.delta.required) != 1+len(head)+len(enumeration.fields) {
		return false
	}
	for position, request := range enumeration.fields {
		if !sameOperationRequest(recipe.delta.required[1+len(head)+position], request) {
			return false
		}
		// This runs inside closedOperationDependencies. The outer solver owns
		// transitive closure; this exact child read checks only fresh original
		// observation and semantic/APPLIED delivery without re-entering it.
		delivered := work.installedMemberOutcomeApplied(request)
		if !delivered.enrolled || !delivered.current {
			return false
		}
	}
	return true
}

// descriptorInstalledPendingRegistered accepts a description only when this
// graph has the exact original installed phase and its represented C child.
// Registration is not delivery: the enclosing required tail still needs fresh
// phase observation, summary consumption and the exact reader's APPLIED revision.
func (work *callableEffectWork) descriptorInstalledPendingRegistered(source *sourceStagedNativeGetSource, pending sourceInstalledMemberPending) bool {
	if !descriptorInstalledMemberRequest(source, pending.request) {
		return false
	}
	phase, present := work.operationRecipes[pending.request.producer]
	if !present || !validInstalledMemberReading(phase, pending.request) || !sameInstalledMemberApplication(pending.application, phase.installedMember) || phase.installedMember.phase != pending.phase || phase.installedMember.generation != work.operationGeneration {
		return false
	}
	coverage, present := work.operationRecipes[pending.coverage.producer]
	if !present || !validStagedMemberCoverageRecipe(coverage) || coverage.memberSource == nil || coverage.memberSource.coverage == nil || !coverage.delta.extracted || !sameOperationRequest(coverage.memberSource.request, pending.coverage) || !sameOperationRequest(coverage.memberSource.parent, pending.request) || !sameInstalledMemberApplication(coverage.memberSource.installedMember, phase.installedMember) {
		return false
	}
	for _, required := range phase.delta.required {
		if sameOperationRequest(required, pending.coverage) {
			return true
		}
	}
	return false
}

// descriptorGetterBodyPhase consumes the original emitter's authenticated Get
// association while this appender's temporary observations remain on the stack.
// Only a matching installed field owns this contribution; its separately
// required phase still pays actual getter summary/semantic/APPLIED closure.
func descriptorGetterBodyPhase(c accessorCandidates, observation sourceBodyEffectsObservation) bool {
	get := observation.sourceGet
	if get == nil || get.operation == nil || get.hasOnly || observation.inputs == nil || observation.inputs.get == nil || observation.inputs.get.operation != get.operation || observation.inputs.invocation != nil {
		return false
	}
	matches := func(application *sourceInstalledMemberApplication) bool {
		if application == nil || application.generation != observation.generation || application.request.consumer != observation.consumer || application.memberCut != observation.cut || application.request.producer.operation != get.operation || application.key != get.propertyKey || application.phase != installedMemberRead && application.phase != installedMemberAcquire {
			return false
		}
		receiver, gap := describeRelativeBoundValues([]sourceValue{get.receiver}, sourceRelativeRole{}, application.memberCut)
		return gap == relativeInputsSupported && !receiver.unknown && len(receiver.pending) == 0 && len(receiver.sources) == 1 && sameOperationEndpoint(receiver.sources[0], application.receiver)
	}
	for _, pending := range c.installedMemberPending {
		if matches(pending.application) {
			return true
		}
	}
	for _, outcome := range c.fieldOutcomes {
		if outcome.installedMember != nil && outcome.demand == outcome.installedMember.demand && matches(&outcome.installedMember.application) {
			return true
		}
	}
	return false
}
