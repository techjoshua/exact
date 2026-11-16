package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// prepareInstalledGetterMutationInputs continues SOURCE input preparation for
// an already issued native field Get. Getter DATA may arrive after that Get's
// once-only Effects traversal. This owner performs no Get lookup, observation
// or BODY execution, and never resets getterSourceRequested. Its only result is
// a zero-actual binding description at the original unchanged SOURCE query cut.
func (work *callableEffectWork) prepareInstalledGetterMutationInputs(facts []callableFacts, reader sourceStagedOperationID, slot int, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration || reader.epoch != work.operationEpoch || reader.index == 0 || int(reader.index) >= len(work.operations) || slot < 0 || slot >= len(work.operations[reader.index].getters) {
		return false
	}
	getter := work.operations[reader.index].getters[slot]
	guard := getter.installed
	if getter.inputs != nil || guard == nil || getter.declaration == nil || !ast.IsFunctionExpression(getter.declaration) || len(getter.declaration.Parameters()) != 0 || guard.creating != nil || guard.exposure.epoch != work.operationEpoch || guard.exposure.index == 0 || int(guard.exposure.index) >= len(work.operations) {
		return false
	}
	// A returned-record lexical Get has its own original resumption owner. This
	// continuation is solely for existing native descriptor field-demand work.
	recipe := work.operationRecipes[work.operations[reader.index].key]
	if validDescriptorRecordGetRecipe(recipe) || recipe.nativeGet == nil {
		return false
	}
	demand, issued := work.installedFieldGetReaderDemand(facts, reader, owner)
	if !issued || !sameOperationRequest(getter.demand.request, demand.request) || !sameOperationEndpoint(guard.get.receiver, demand.receiver) || demand.receiverPending || demand.receiver.kind != relativeEndpointExpression || demand.receiver.expression == nil || !ast.IsObjectLiteralExpression(demand.receiver.expression) {
		return false
	}
	exposure, _, request, exposed := work.installedGetterExposure(getter)
	if !exposed {
		return false
	}
	state := &work.operations[guard.exposure.index]
	sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if state.invalid || state.revision == 0 || sub == nil || sub.blocked || !sameOperationRequest(sub.request, request) || sub.applied != state.revision {
		return false
	}
	selected := false
	for _, alternative := range state.delta.exposures {
		selected = selected || alternative.creating == nil && alternative.endpoint.expression == getter.declaration && validInstalledGetterAlternative(exposure, alternative)
	}
	if !selected {
		return false
	}
	// SAME original SOURCE field factory, not a query recovered from a BODY
	// record or a query retargeted to make unlike cuts coincide.
	q := newSourceDependencyQuery(demand.request.producer.operation, owner.checker, owner, demand.request.producer.declaration)
	defer q.publishDependencyStatistics()
	operation := demand.request.producer.operation
	if q.owner == nil || q.owner.generation != work.operationGeneration || q.owner.program == nil || q.owner.program.GetSourceFile(ast.GetSourceFileOfNode(getter.declaration).FileName()) != ast.GetSourceFileOfNode(getter.declaration) || q.relativeInputCut(operation) != guard.get.cut || q.inputs != nil || q.operation != nil || !q.dependenciesOnly {
		return false
	}
	// This get is the binder's descriptive zero-argument input only. It is not
	// installed on any Get/C observation owner and cannot publish Get completion.
	get := &sourceGetInputs{operation: operation, receiver: sourceValue{node: demand.receiver.expression}, propertyKey: demand.request.producer.selector.field}
	inputs := q.bindGetInputs(getter.declaration, operation, get.receiver, nil, &accessorCandidates{})
	if inputs == nil || inputs.invocation != nil || inputs.get == nil || inputs.get.operation != operation || inputs.operationLifetime != nil || inputs.storage != nil || inputs.population != nil {
		return false
	}
	invocation, described := mutationGetterInvocation(q, inputs, get)
	if !described {
		return false
	}
	prior := q.implicitSourceInputs
	borrow := &sourceImplicitInputBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, request: cloneStagedWriterInvocation(invocation), receiver: get.receiver}
	q.implicitSourceInputs = borrow
	defer func() {
		q.implicitSourceInputs = prior
		borrow.issuer, borrow.owner, borrow.generation = nil, nil, nil
		borrow.request = sourceRelativeInvocation{}
		borrow.receiver, borrow.actuals = sourceValue{}, nil
	}()
	edge := publishMutationGetterBindings(q, inputs, get, invocation)
	if edge == nil || edge.bound.unsupported != relativeInputsSupported {
		return false
	}
	// One guarded requirement owns one immutable SOURCE input description. This
	// does not satisfy BODY or any installation/exposure/current/closure debt.
	work.operations[reader.index].getters[slot].inputs = edge
	work.inputDataChanged = true
	return true
}
