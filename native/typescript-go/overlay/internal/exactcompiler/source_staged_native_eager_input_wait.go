package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedInputConsumerWait is graph-local compatibility-decision state on
// one actual Call. It is not coverage, a result, B, or a cached factory. Clone
// reconstruction clears it and authenticates new subscriptions/observations.
type sourceStagedInputConsumerWait struct {
	operation, declaration *ast.Node
	cut                    sourceRelativeCut
	generation             *projectGeneration
	epoch                  *sourceStagedOperationEpoch
	required               []sourceStagedInputConsumerRequirement
	sourceInputs           *sourceStagedInputSubstitution
}

type sourceStagedInputConsumerRequirement struct {
	owner, use          *ast.Node
	phase               sourceStagedOperationRequest
	nativeInputProducer bool                         // Existing input source task before child SOURCE publication.
	input               sourceStagedOperationRequest // Descriptive exact child request, never an issued Get.
	nativeLiteral       bool                         // Exact selected literal construction phase; not a result.
	memberCall          bool                         // Disjoint original protocol input owner, never native eager.
	argument            int
	formal              sourceRelativeRole
	generation          *projectGeneration
	epoch               *sourceStagedOperationEpoch
}

// nativeEagerInputConsumerPending preserves the existing pending-only API for
// callers without the original declaration publisher. It supplies no CURRENT.
func (work *callableEffectWork) nativeEagerInputConsumerPending(fact *callableFacts, use *ast.Node) (sourceStagedInputConsumerRequirement, bool) {
	required, current, owned := work.nativeInputConsumer(fact, use, nil)
	return required, owned && !current
}

// nativeInputConsumer distinguishes an authentic pending source demand from
// current literal construction. Discovery and retirement use this same owner;
// paying the original demand cannot recreate it on the next input phase.
func (work *callableEffectWork) nativeInputConsumer(fact *callableFacts, use *ast.Node, owner *executableBodyOwner) (sourceStagedInputConsumerRequirement, bool, bool) {
	var none sourceStagedInputConsumerRequirement
	if fact == nil || fact.normalInputs != nil || use == nil || enclosingCallableNode(use) != fact.node {
		return none, false, false
	}
	parent, outer, argument := nativeLiteralInputUse(use)
	if parent == nil {
		return none, false, false
	}
	seen := make(map[sourceStagedOperationKey]bool)
	var visit func(sourceStagedOperationRequest) (sourceStagedInputConsumerRequirement, bool, bool)
	visit = func(request sourceStagedOperationRequest) (sourceStagedInputConsumerRequirement, bool, bool) {
		if seen[request.producer] {
			return none, false, false
		}
		seen[request.producer] = true
		r := work.operationRecipes[request.producer]
		s := r.nativeGet
		id := work.operationIDs[request.producer]
		if !validNativeGetRecipe(r) || s == nil || request.consumer != fact.node || !sameOperationRequest(s.request, request) || id.epoch != work.operationEpoch || id.index == 0 || work.operations[id.index].invalid || !work.operations[id.index].dependenciesRegistered {
			return none, false, false
		}
		if required, current, owned := work.nativeInputProducerRequirement(fact, use, s, owner); owned {
			return required, current, true
		}
		current := work.nativeEffectsGetCurrent(s)
		progress := work.nativeEffectsTaskOwned(id) || work.nativeEffectsTaskOwned(work.operationIDs[nativeRootDebtRequest(s, "callee-get").producer])
		if phase, owned := work.nativeLiteralInputPhase(s, outer); owned && s.request.use == parent && !work.nativeLiteralInputCurrent(s, outer) && progress {
			return sourceStagedInputConsumerRequirement{owner: fact.node, use: use, phase: phase, nativeLiteral: true, argument: argument, generation: work.operationGeneration, epoch: work.operationEpoch}, false, true
		}
		if !current && !progress {
			return none, false, false
		}
		algorithm := work.operationRecipes[nativeRootDebtRequest(s, "algorithm").producer].nativeGet
		if algorithm != nil && validStagedNativeInputSource(algorithm) && work.nativeEagerAdoptedChild(nativeRootDebtRequest(s, "algorithm"), algorithm.inputSource) {
			if found, current, owned := visit(algorithm.inputSource); owned {
				return found, current, true
			}
		}
		if !current {
			return none, false, false
		}
		phase := nativeRootDebtRequest(s, "eager-inputs")
		eager := work.operationRecipes[phase.producer].nativeGet
		phaseID := work.operationIDs[phase.producer]
		if eager == nil || eager.eager == nil || work.nativeEagerTaskSource(phaseID) == nil || !work.nativeEffectsGetCurrent(eager) || !work.nativeEagerAdoptedChild(s.request, phase) {
			return none, false, false
		}
		for i, child := range eager.eager.operations {
			if child.operation != parent || child.property == nil || child.actual != 2 || child.property.AsPropertyAssignment().Initializer != parent {
				continue
			}
			// The selected parent already issued this exact ordered acquisition
			// plan. It is only a real future owner, never the child's selection.
			if work.nativeEagerKeyModulePending(eager) {
				return sourceStagedInputConsumerRequirement{owner: fact.node, use: use, phase: phase}, false, true
			}
			if i < len(eager.eagerSources) && work.nativeEagerAdoptedChild(phase, eager.eagerSources[i]) {
				root := work.operationRecipes[eager.eagerSources[i].producer].nativeGet
				if root != nil && !work.nativeEffectsGetCurrent(root) && work.nativeEffectsTaskOwned(work.operationIDs[nativeRootDebtRequest(root, "callee-get").producer]) {
					return sourceStagedInputConsumerRequirement{owner: fact.node, use: use, phase: phase}, false, true
				}
			}
		}
		return none, false, false
	}
	for _, ordinary := range fact.staged.operationUses {
		if found, current, owned := visit(ordinary.request); owned {
			return found, current, true
		}
	}
	return none, false, false
}

func (work *callableEffectWork) nativeEagerKeyModulePending(source *sourceStagedNativeGetSource) bool {
	if source == nil || source.eager == nil || len(source.eager.actuals) != 3 || work.nativeEagerKeyCurrent(source) {
		return false
	}
	key := nativeEagerKeyDescription(source, source.eager.actuals[1].expression)
	if key == nil || !work.nativeSymbolKeyReadingCurrent(stagedKeySourceRequest(source, *key)) {
		return false
	}
	r := stagedKeySourceRequest(source, *key)
	facts, g := work.operationFacts, work.operationGeneration
	consumer, cok := work.memberNodes[r.consumer]
	producer, pok := work.memberNodes[r.producer.declaration]
	if g == nil || g.program == nil || g.checker == nil || !cok || !pok || consumer < 0 || consumer >= len(facts) || producer < 0 || producer >= len(facts) {
		return false
	}
	for _, index := range []int{consumer, producer} {
		fact := &facts[index]
		if fact.sourceFile == nil || ast.GetSourceFileOfNode(fact.node) != fact.sourceFile || g.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile {
			return false
		}
	}
	edge := r.edge + ":module"
	membership := sourceStagedDependencyKey{consumer, edge}
	d := work.stagedRequired[membership]
	_, registered := work.memberModuleMemberships[membership]
	if !registered || d == nil || d.invalid || d.projectionPending || d.producer != producer || d.operation != source.request.use || d.cut != source.request.cut {
		return false
	}
	listed := false
	for _, requirement := range work.memberModuleRequirements[consumer] {
		listed = listed || requirement.producer == producer && requirement.edge == edge
	}
	if !listed {
		return false
	}
	if len(work.stagedRevisions) == 0 {
		// This is the existing same-graph pre-propagation owner, not an absent
		// revision interpreted as readiness or a fabricated operation task.
		if len(work.extractionPhases) != len(facts) || len(work.extractionQueue) < len(facts) || work.extractionCalls == nil || len(work.callers) != 0 {
			return false
		}
		for _, index := range []int{consumer, producer} {
			task, phase := work.extractionQueue[index], work.extractionPhases[index]
			if task.operation != (sourceStagedOperationID{}) || task.callable != index || phase < callableExtractionQueued || phase > callableExtractionReady {
				return false
			}
		}
		return true
	}
	if len(work.stagedRevisions) != len(facts) || len(work.callers) != len(facts) || len(work.dirty) != len(facts) || facts[producer].staged.ready && work.stagedRevisions[producer] != 0 && d.consumed == work.stagedRevisions[producer] {
		return false
	}
	if _, linked := work.memberModuleCallers[[2]int{producer, consumer}]; !linked {
		return false
	}
	for _, caller := range work.callers[producer] {
		if caller == consumer {
			return work.dirty[producer] || work.dirty[consumer] || facts[producer].staged.operationsPending
		}
	}
	return false
}

func (work *callableEffectWork) inputConsumerWaitCurrent(facts []callableFacts, call sourceStagedDeclarationCall, owners ...*executableBodyOwner) bool {
	var sourceOwner *executableBodyOwner
	if len(owners) == 1 {
		sourceOwner = owners[0]
	}
	wait := call.inputConsumerWait
	if wait == nil || wait.generation != work.operationGeneration || wait.epoch != work.operationEpoch || wait.sourceInputs != call.sourceInputs || wait.operation != call.invocation.operation || wait.declaration != call.invocation.declaration || wait.cut != call.invocation.cut || len(wait.required) == 0 {
		return false
	}
	installed := false
	for _, fact := range facts {
		for _, actual := range fact.staged.calls {
			installed = installed || actual.inputConsumerWait == wait && actual.sourceInputs == call.sourceInputs && actual.inputs == call.inputs && sameSourceRelativeInvocation(actual.invocation, call.invocation)
		}
	}
	if !installed {
		return false
	}
	for _, r := range wait.required {
		if r.memberCall {
			if !work.memberInputWaitAssociation(call, r.owner) {
				return false
			}
			owner, ok := work.memberNodes[r.owner]
			if !ok || owner < 0 || owner >= len(facts) {
				return false
			}
			actual, current, owned := work.memberInputConsumer(&facts[owner], r.use, sourceOwner)
			if !owned || !current || actual != r {
				return false
			}
			continue
		}
		owner, ok := work.memberNodes[r.owner]
		if r.nativeInputProducer {
			if !ok || owner < 0 || owner >= len(facts) || r.generation != work.operationGeneration || r.epoch != work.operationEpoch {
				return false
			}
			actual, current, owned := work.nativeInputConsumer(&facts[owner], r.use, sourceOwner)
			if !owned || !current || actual != r {
				return false
			}
			continue
		}
		if r.nativeLiteral {
			source := work.operationRecipes[r.phase.producer].nativeGet
			parent, input, argument := nativeLiteralInputUse(r.use)
			if !ok || owner < 0 || owner >= len(facts) || r.generation != work.operationGeneration || r.epoch != work.operationEpoch || source == nil || source.request.consumer != r.owner || facts[owner].normalInputs != nil || enclosingCallableNode(r.use) != r.owner || source.request.use != parent || argument != r.argument || !sameOperationRequest(nativeRootDebtRequest(source, "eager-inputs"), r.phase) || !work.nativeLiteralInputCurrent(source, input) {
				return false
			}
			continue
		}
		id := work.operationIDs[r.phase.producer]
		if !ok || owner < 0 || owner >= len(facts) || work.nativeEagerTaskSource(id) == nil || !sameOperationRequest(nativeRootDebtRequest(work.operationRecipes[r.phase.producer].nativeGet, "eager-inputs"), r.phase) || !work.sourceInputConsumerCovered(&facts[owner], r.use) {
			return false
		}
	}
	return true
}

// Real revision arrivals coalesce into the existing relative/input phase. This
// does not resolve a wait or query a producer; CURRENT revalidation owns that.
func (work *callableEffectWork) notifyNativeEagerInputWaiters(id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid {
		return
	}
	key := work.operations[id.index].key
	arrived := work.operationRecipes[key].nativeGet
	if arrived == nil || key != nativeRootDebtRequest(arrived, "eager-inputs").producer && key != nativeRootDebtRequest(arrived, "callee-get").producer {
		return
	}
	for _, fact := range work.operationFacts {
		for _, call := range fact.staged.calls {
			if call.inputConsumerWait == nil {
				continue
			}
			for _, required := range call.inputConsumerWait.required {
				source := work.operationRecipes[required.phase.producer].nativeGet
				// A real child publication/currency/delivery may settle local
				// construction before the outer full input result closes.
				childChanged := false
				if required.nativeInputProducer && source != nil {
					algorithm := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer].nativeGet
					childChanged = algorithm != nil && sameOperationRequest(algorithm.inputSource, required.input) && required.input.producer == arrived.request.producer
				}
				if required.phase.producer == key || (required.nativeLiteral || required.nativeInputProducer) && source != nil && nativeRootDebtRequest(source, "callee-get").producer == key || childChanged {
					work.inputDataChanged = true
					return
				}
			}
		}
	}
}

// Pending ownership needs a real typed subscriber, not a current disposition.
// The stricter nativeEagerRequiredChild remains the CURRENT coverage predicate.
func (work *callableEffectWork) nativeEagerAdoptedChild(parent, child sourceStagedOperationRequest) bool {
	id, producer := work.operationIDs[parent.producer], work.operationIDs[child.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || producer.epoch != work.operationEpoch || producer.index == 0 || !operationContainsRequest(work.operationRecipes[parent.producer].delta.required, child) {
		return false
	}
	for _, d := range work.operations[id.index].dependencies {
		if d.producer == producer && sameOperationRequest(d.request, child) {
			s := &work.operations[producer.index]
			sub := s.subscribers[sourceStagedOperationConsumer{child.consumer, child.edge}]
			return !s.invalid && s.dependenciesRegistered && sub != nil && !sub.blocked && sameOperationRequest(sub.request, child)
		}
	}
	return false
}

// nativeInputProducerRequirement retains an already adopted native producer's
// exact child-input work before that child's selected SOURCE association exists.
// Eligibility names only the existing bounded native source family. Neither a
// builtin spelling nor this request supplies selection, a Get, DATA or CURRENT.
func (work *callableEffectWork) nativeInputProducerRequirement(fact *callableFacts, use *ast.Node, source *sourceStagedNativeGetSource, owner *executableBodyOwner) (sourceStagedInputConsumerRequirement, bool, bool) {
	var none sourceStagedInputConsumerRequirement
	if source == nil || source.kind != sourceNativeObjectFreeze || work.operationGeneration == nil || work.operationEpoch == nil || owner == nil || owner.values == nil || owner.checker == nil || owner.project == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || fact == nil || source.request.consumer != fact.node || source.request.producer.declaration != fact.node || fact.normalInputs != nil || use == nil || !ast.IsIdentifier(use) || enclosingCallableNode(use) != fact.node {
		return none, false, false
	}
	index, known := work.memberNodes[fact.node]
	if !known || index < 0 || index >= len(work.operationFacts) || &work.operationFacts[index] != fact || fact.sourceFile == nil || owner.values.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile {
		return none, false, false
	}
	publisher := owner.pendingMemberPublishers[fact.node]
	if publisher == nil || !publisher.live || publisher.fact != fact {
		return none, false, false
	}
	call, input, argument := nativeLiteralInputUse(use)
	if call == nil || !stagedNativeInputSourceOwner(fact, call, owner) || !stagedNativeInputEligible(call, fact, owner) {
		return none, false, false
	}
	algorithmRequest := nativeRootDebtRequest(source, "algorithm")
	algorithm := work.operationRecipes[algorithmRequest.producer]
	plan := algorithm.nativeGet
	phase := nativeRootDebtRequest(source, "eager-inputs")
	if !validNativeGetRecipe(algorithm) || !sameNativeGetSource(plan, source) || plan.input == nil || !validStagedNativeInputPlan(*plan.input, plan) || plan.input.input.expression != call || !work.nativeEagerAdoptedChild(source.request, algorithmRequest) || !work.nativeEagerAdoptedChild(source.request, phase) {
		return none, false, false
	}
	root := work.operationIDs[source.request.producer]
	rootSource := work.nativeEffectsTaskSource(root)
	if rootSource == nil || !sameOperationRequest(rootSource.request, source.request) {
		return none, false, false
	}
	state := &work.operations[root.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{source.request.consumer, source.request.edge}]
	if state.invalid || !state.dependenciesRegistered || subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, source.request) {
		return none, false, false
	}
	endpoint := sourceStagedArgumentEndpoint(use, call, fact.node, owner.values)
	if endpoint.kind != relativeEndpointRole || endpoint.role.kind != relativeRoleFormal || endpoint.role.declaration != fact.node {
		return none, false, false
	}
	key := sourceStagedOperationKey{declaration: fact.node, operation: call, kind: relativeDemandEffects}
	var request sourceStagedOperationRequest
	if prior := work.operationRecipes[key].nativeGet; prior != nil {
		request = prior.request
	} else {
		var described bool
		request, described = stagedNativeInputOccurrenceRequest(fact, call)
		if !described {
			return none, false, false
		}
	}
	required := sourceStagedInputConsumerRequirement{owner: fact.node, use: use, phase: phase, nativeInputProducer: true, input: request, argument: argument, formal: endpoint.role, generation: work.operationGeneration, epoch: work.operationEpoch}
	// The old native root/eager/child graph retains every debt. Local CURRENT is
	// only this original literal's actual input construction; it cannot certify
	// the outer input result, normal completion or any descriptor field/write.
	if validStagedNativeInputSource(plan) && sameOperationRequest(plan.inputSource, request) && work.nativeEffectsGetCurrent(source) && work.nativeEagerRequiredChild(algorithmRequest, request) && work.nativeEagerRequiredChild(phase, request) {
		child := work.operationRecipes[request.producer].nativeGet
		if child != nil && sameOperationRequest(child.request, request) && work.nativeLiteralInputCurrent(child, input) {
			return required, true, true
		}
	}
	if work.nativeEffectsTaskOwned(root) || work.nativeEffectsTaskOwned(work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]) {
		return required, false, true
	}
	return none, false, false
}
