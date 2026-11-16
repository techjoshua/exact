package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// memberInputConsumer recognizes an original protocol Call's input ownership.
// Pending describes its authentic source continuation, not an observed method.
// The same local-current test is used during discovery and wait retirement, so
// a completed owner cannot recreate its pending wait on every relative pass.
func (work *callableEffectWork) memberInputConsumer(fact *callableFacts, use *ast.Node, owner *executableBodyOwner) (sourceStagedInputConsumerRequirement, bool, bool) {
	var none sourceStagedInputConsumerRequirement
	if owner == nil || owner.values == nil || owner.checker == nil || owner.project == nil || work.operationGeneration == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || fact == nil || fact.normalInputs != nil || use == nil || !ast.IsIdentifier(use) || enclosingCallableNode(use) != fact.node {
		return none, false, false
	}
	caller, known := work.memberNodes[fact.node]
	if !known || caller < 0 || caller >= len(work.operationFacts) || &work.operationFacts[caller] != fact || fact.sourceFile == nil || owner.values.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile {
		return none, false, false
	}
	publisher := owner.pendingMemberPublishers[fact.node]
	if publisher == nil || !publisher.live || publisher.fact != fact {
		return none, false, false
	}
	index := owner.values.index(fact.sourceFile)
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete {
		return none, false, false
	}
	outer := use
	for outer.Parent != nil && unwrapSourceCallableReference(outer.Parent) == use {
		outer = outer.Parent
	}
	call := outer.Parent
	if call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || !ast.IsPropertyAccessExpression(call.Expression()) || !sourceStagedOccurrenceOwned(call, fact.node) {
		return none, false, false
	}
	ordinal := -1
	for i, argument := range restrictedInvocationArguments(call.AsCallExpression()) {
		if ast.IsSpreadElement(argument) {
			return none, false, false
		}
		if argument == outer {
			ordinal = i
		}
	}
	if ordinal < 0 {
		return none, false, false
	}
	endpoint := sourceStagedArgumentEndpoint(outer, call, fact.node, owner.values)
	if endpoint.kind != relativeEndpointRole || endpoint.role.kind != relativeRoleFormal || endpoint.role.declaration != fact.node {
		return none, false, false
	}
	for _, ordinary := range fact.staged.operationUses {
		request := ordinary.request
		recipe := work.operationRecipes[request.producer]
		s := recipe.memberSource
		if request.producer.operation != call || request.consumer != fact.node || request.producer.declaration != fact.node || request.reading != (sourceStagedOperationKey{}) || ordinary.call != nil || ordinary.installed != nil || !work.requestedMemberCallSupported(recipe) || s == nil || s.call.sourceRequest.nativeInput || s.call.sourceRequest.descriptorCallee || !sameOperationRequest(request, s.request) || s.parent.producer.operation != call || s.parent.consumer != fact.node || s.parent.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || s.candidate.value.expression != call.Expression() {
			continue
		}
		id := work.operationIDs[request.producer]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			continue
		}
		state := &work.operations[id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		if state.invalid || !state.dependenciesRegistered || state.key != request.producer || sub == nil || sub.blocked || !sameOperationRequest(sub.request, request) {
			continue
		}
		// Source prerequisites are real registered children. They do not yet claim
		// an actual argument, selected method, or completed eager acquisition.
		retained := len(recipe.delta.required) != 0
		for _, child := range recipe.delta.required {
			retained = retained && work.memberInputChildRetained(id, child)
		}
		if !retained {
			continue
		}
		requirement := sourceStagedInputConsumerRequirement{owner: fact.node, use: use, phase: request, memberCall: true, argument: ordinal, formal: endpoint.role, generation: work.operationGeneration, epoch: work.operationEpoch}
		current := work.memberInputLocalCurrent(recipe, id, requirement, outer)
		if current {
			return requirement, true, true
		}
		if work.writerSourceTaskOwned(id) {
			return requirement, false, true
		}
	}
	return none, false, false
}

// memberInputLocalCurrent is only the original input-invocation/source law.
// Full required Effects closure, BODY, result DATA and subscriber delivery of
// every independent child remain ordinary graph obligations.
func (work *callableEffectWork) memberInputLocalCurrent(recipe sourceStagedOperationRecipe, id sourceStagedOperationID, r sourceStagedInputConsumerRequirement, argument *ast.Node) bool {
	if !work.nativeObserverProducerCurrent(recipe) {
		return false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{r.phase.consumer, r.phase.edge}]
	if state.revision == 0 || !state.delta.extracted || sub == nil || sub.blocked || sub.consumed != state.revision || sub.applied != state.revision {
		return false
	}
	for _, branch := range recipe.memberSource.call.standard {
		if !branch.actualsKnown || !sameOperationRequest(branch.request, recipe.memberSource.parent) || branch.cut != recipe.memberSource.candidate.cut || !work.freshConstructedProtocolMember(branch) || r.argument < 0 || r.argument >= len(branch.actuals) {
			return false
		}
		actual := branch.actuals[r.argument]
		if actual.ordinal != r.argument || actual.expression != argument || actual.endpoint.kind != relativeEndpointRole || actual.endpoint.role != r.formal || actual.endpoint.producer != branch.request.producer.operation || actual.endpoint.cut != (sourceRelativeCut{operation: branch.request.producer.operation, use: branch.request.producer.operation, reading: argument}) || len(actual.endpoint.projection) != 0 {
			return false
		}
		for _, child := range standardMemberCallRequirements(&branch) {
			if !work.memberInputChildRetained(id, child) {
				return false
			}
		}
	}
	return true
}

func (work *callableEffectWork) memberInputChildRetained(parent sourceStagedOperationID, request sourceStagedOperationRequest) bool {
	if !operationContainsRequest(work.operationRecipes[work.operations[parent.index].key].delta.required, request) {
		return false
	}
	child := work.operationIDs[request.producer]
	if child.epoch != work.operationEpoch || child.index == 0 || int(child.index) >= len(work.operations) {
		return false
	}
	for _, dependency := range work.operations[parent.index].dependencies {
		if dependency.producer != child || !sameOperationRequest(dependency.request, request) {
			continue
		}
		state := &work.operations[child.index]
		sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		return !state.invalid && state.dependenciesRegistered && sub != nil && !sub.blocked && sameOperationRequest(sub.request, request)
	}
	return false
}

func (work *callableEffectWork) memberInputRequirementCurrent(r sourceStagedInputConsumerRequirement, owner *executableBodyOwner) bool {
	index, known := work.memberNodes[r.owner]
	if !r.memberCall || r.generation != work.operationGeneration || r.epoch != work.operationEpoch || !known || index < 0 || index >= len(work.operationFacts) {
		return false
	}
	actual, current, owned := work.memberInputConsumer(&work.operationFacts[index], r.use, owner)
	return owned && current && actual == r
}

// memberInputWaitAssociation follows only currently installed canonical source
// substitutions. A forwarded wait cannot borrow an unrelated caller's input map.
func (work *callableEffectWork) memberInputWaitAssociation(call sourceStagedDeclarationCall, target *ast.Node) bool {
	if call.sourceInputs == nil || call.inputs != nil || !sameSourceRelativeInvocation(call.sourceInputs.invocation, call.invocation) || !sameSourceRelativeInputEnvelope(call.invocation, call.sourceInputs.bindings) {
		return false
	}
	seen := make(map[*ast.Node]bool)
	var visit func(*ast.Node) bool
	visit = func(declaration *ast.Node) bool {
		if declaration == target {
			return true
		}
		if seen[declaration] {
			return false
		}
		seen[declaration] = true
		index, known := work.memberNodes[declaration]
		if !known || index < 0 || index >= len(work.operationFacts) {
			return false
		}
		for _, child := range work.operationFacts[index].staged.calls {
			if child.legacyInputs || child.sourceInputs == nil || child.inputs != nil || !sameSourceRelativeInvocation(child.sourceInputs.invocation, child.invocation) || !sameSourceRelativeInputEnvelope(child.invocation, child.sourceInputs.bindings) {
				continue
			}
			forwarded := false
			for _, actual := range child.invocation.actuals {
				forwarded = forwarded || actual.endpoint.kind == relativeEndpointRole || actual.endpoint.expression != nil && ast.IsIdentifier(actual.endpoint.expression)
			}
			if forwarded && visit(child.invocation.declaration) {
				return true
			}
		}
		return false
	}
	return visit(call.invocation.declaration)
}

// notifyMemberInputWaiters only schedules existing relative revalidation after
// a real publication or newly APPLIED delivery. It issues no new observation.
func (work *callableEffectWork) notifyMemberInputWaiters(id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !work.requestedMemberCallSupported(recipe) || recipe.memberSource.call.sourceRequest.nativeInput || recipe.memberSource.call.sourceRequest.descriptorCallee {
		return
	}
	for _, fact := range work.operationFacts {
		for _, call := range fact.staged.calls {
			if call.inputConsumerWait == nil {
				continue
			}
			for _, r := range call.inputConsumerWait.required {
				if r.memberCall && r.phase.producer == recipe.key {
					work.inputDataChanged = true
					return
				}
			}
		}
	}
}
