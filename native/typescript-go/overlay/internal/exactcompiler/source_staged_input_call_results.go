package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedInputCallResultReading retains an original argument association,
// not a Get borrow or a binder event. Source inputs and delivered B remain
// distinct pointers and must still match this graph's owning Call fact.
type sourceStagedInputCallResultReading struct {
	request  sourceStagedOperationRequest
	call     sourceStagedDeclarationCall
	endpoint sourceRelativeEndpoint
}

// describeStagedCallResultSource shares producer admission across member and
// input readers. Eligibility installs no creating input packet or selected value.
func (work *callableEffectWork) describeStagedCallResultSource(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) (*sourceStagedCallResultSource, bool) {
	if caller < 0 || caller >= len(facts) || owner == nil || owner.values == nil || call == nil || !stagedDataSourceExpression(call) || !sourceStagedOccurrenceOwned(call, facts[caller].node) || work.operationGeneration != owner.values.generation {
		return nil, false
	}
	if ast.IsIdentifier(call) {
		binding := stagedBindingDataDeclaration(call, facts[caller].node, owner)
		if binding == nil {
			return describeStagedCapturedBinding(call, facts[caller].node, owner)
		}
		source := &sourceStagedCallResultSource{request: stagedBindingResultRequest(call, facts[caller].node), declaration: facts[caller].node, binding: binding, generation: work.operationGeneration}
		if construction := describeModuleConstruction(binding, call, facts[caller].node, owner); construction != nil {
			module, enrolled := work.memberNodes[construction.module]
			publisher := owner.pendingMemberPublishers[construction.module]
			if !enrolled || publisher == nil || !publisher.live || publisher.fact != &facts[module] {
				return nil, false
			}
			source.moduleConstruction = construction
		}
		return source, true
	}
	if !ast.IsCallExpression(call) {
		return work.describeStagedGetResultSource(facts, caller, call, owner), true
	}
	if descriptorRetrievalIntent(call) && stagedNativeInputEligible(call, &facts[caller], owner) {
		return work.describeNativeDescriptorResult(facts, caller, call, owner)
	}
	if prior := work.operationRecipes[stagedCallResultRequest(call, facts[caller].node).producer]; prior.callResult != nil && len(prior.callResult.constructedPreparation) != 0 && prior.callResult.generation == work.operationGeneration && validStagedCallResultRecipe(prior) && validStagedConstructedResultSource(prior.callResult) {
		// Reuse the pending description only. This real caller must still issue
		// its own original reader; prior Get/current/APPLIED is never borrowed.
		return cloneStagedCallResultSource(prior.callResult), true
	}
	declaration := facts[caller].node
	input, direct := describeStagedInputSubstitution(call, declaration, owner)
	var bound sourceStagedDeclarationCall
	boundDirect := false
	if !direct {
		bound, boundDirect = work.stagedBoundLexicalDefaultCall(facts, caller, call, owner)
	}
	native := !direct && !boundDirect && stagedNativeInputEligible(call, &facts[caller], owner)
	var constructed sourceStagedOperationRequest
	known := false
	if !direct && !boundDirect && !native {
		constructed, known = work.prepareConstructedResultSource(facts, caller, call, owner)
	}
	if !direct && !boundDirect && !native && !known {
		source, supported := work.describeStagedFrameworkResult(facts, caller, call, owner)
		if !supported {
			return nil, false
		}
		if _, registered := work.registerStagedFrameworkEffects(facts, caller, call, owner); !registered {
			return nil, false
		}
		return source, true
	}
	if direct {
		declaration = input.invocation.declaration
	} else if boundDirect {
		declaration = bound.invocation.declaration
	}
	return &sourceStagedCallResultSource{request: stagedCallResultRequest(call, facts[caller].node), declaration: declaration, generation: work.operationGeneration, nativeCall: native, constructedRoot: constructed}, true
}

// registerStagedCallResultReading retains immutable observations on the existing
// DATA producer. It registers no ordinary parent use or supplied binder output.
func (work *callableEffectWork) registerStagedCallResultReading(facts []callableFacts, source *sourceStagedCallResultSource, reading sourceStagedOperationRequest, cut sourceRelativeCut, input *sourceStagedInputCallResultReading) bool {
	prior, known := work.operationRecipes[source.request.producer]
	if known {
		if !sameStagedCallResultSource(prior.callResult, source) {
			return false
		}
		source = cloneStagedCallResultSource(prior.callResult)
	}
	present := false
	for index, old := range source.readings {
		if sameOperationRequest(old, reading) {
			if source.readCuts[index] != cut {
				return false
			}
			present = true
		}
	}
	if !present {
		source.readings = append(source.readings, reading)
		source.readCuts = append(source.readCuts, cut)
	}
	if input != nil {
		copy := *input
		copy.call.invocation = cloneStagedWriterInvocation(copy.call.invocation)
		copy.endpoint = cloneSourceRelativeEndpoint(copy.endpoint)
		updated := false
		for index, old := range source.inputReadings {
			if sameOperationRequest(old.request, reading) {
				source.inputReadings[index], updated = copy, true
			}
		}
		if !updated {
			source.inputReadings = append(source.inputReadings, copy)
		}
	}
	accepted := false
	if !known {
		accepted = work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source})
	} else {
		prior.callResult = source
		accepted = work.attachOperationSource(facts, prior)
	}
	if accepted {
		work.retainStagedDeclarationResultEffects(facts, source.request.producer)
	}
	return accepted
}

func stagedInputCallResultReading(request sourceStagedOperationRequest, caller *ast.Node, call sourceStagedDeclarationCall, endpoint sourceRelativeEndpoint) sourceStagedOperationRequest {
	request.consumer = caller
	request.reading = sourceStagedOperationKey{declaration: caller, operation: call.invocation.operation, kind: relativeDemandDirectExposure, selector: sourceStagedOperationSelector{occurrence: endpoint.expression, field: "input-result-source"}}
	cut := call.invocation.cut
	request.edge = fmt.Sprintf("input-result:%d:%d:%t:%p:%p:%p:%p:%p", call.invocation.operation.Pos(), endpoint.expression.Pos(), call.inputs != nil, cut.use, cut.reading, cut.initializing, cut.returning, cut.invoking)
	return request
}

func validStagedInputCallResultReading(source *sourceStagedCallResultSource, input sourceStagedInputCallResultReading) bool {
	outer, inner := input.call.invocation.operation, input.endpoint.expression
	if source == nil || outer == nil || !ast.IsCallExpression(outer) || inner == nil || len(input.endpoint.projection) != 0 || !validStagedDataResultCall(input.call) || source.request.producer.declaration != input.request.consumer {
		return false
	}
	if !stagedDataSourceExpression(inner) || inner != source.request.producer.operation {
		return false
	}
	if source.request.producer.operation == nil {
		return false
	}
	if !sameOperationRequest(input.request, stagedInputCallResultReading(source.request, input.request.consumer, input.call, input.endpoint)) {
		return false
	}
	for index, reading := range source.readings {
		if sameOperationRequest(reading, input.request) {
			return index < len(source.readCuts) && source.readCuts[index] == input.call.invocation.cut
		}
	}
	return false
}

func currentStagedInputAssociation(facts []callableFacts, caller int, call sourceStagedDeclarationCall, endpoint sourceRelativeEndpoint) bool {
	if call.invocation.inputKind != relativeInputInvocation || caller < 0 || caller >= len(facts) || endpoint.expression == nil || !stagedResultExpression(endpoint.expression) && !ast.IsIdentifier(endpoint.expression) || len(endpoint.projection) != 0 || call.invocation.operation == nil || !ast.IsCallExpression(call.invocation.operation) || !validStagedDataResultCall(call) {
		return false
	}
	return currentStagedInputBinding(facts, caller, call, endpoint)
}

// currentStagedInputBinding authenticates original canonical input association.
// It supplies no expression producer, value or completion; callers retain their
// own payload-specific DATA/reader validation.
func currentStagedInputBinding(facts []callableFacts, caller int, call sourceStagedDeclarationCall, endpoint sourceRelativeEndpoint) bool {
	if caller < 0 || caller >= len(facts) || len(endpoint.projection) != 0 || call.invocation.operation == nil || !ast.IsCallExpression(call.invocation.operation) || !validStagedDataResultCall(call) {
		return false
	}
	installed := false
	for _, original := range facts[caller].staged.calls {
		if original.inputConsumerWait == nil && original.sourceInputs == call.sourceInputs && original.inputs == call.inputs && sameSourceRelativeInvocation(original.invocation, call.invocation) {
			installed = true
			break
		}
	}
	if !installed {
		return false
	}
	var bound sourceRelativeBoundInputs
	if call.sourceInputs != nil && call.inputs == nil && sameSourceRelativeInvocation(call.sourceInputs.invocation, call.invocation) && sameSourceRelativeInputEnvelope(call.invocation, call.sourceInputs.bindings) {
		bound = call.sourceInputs.bindings
	} else if call.inputs != nil && call.inputs.delivered && sameSourceRelativeInvocation(call.inputs.request, call.invocation) && sameSourceRelativeInputEnvelope(call.invocation, call.inputs.relative) {
		bound = call.inputs.relative
	} else {
		return false
	}
	for _, binding := range bound.bindings {
		for _, sources := range [][]sourceRelativeEndpoint{binding.sources, binding.pending} {
			for _, candidate := range sources {
				if sameOperationEndpoint(candidate, endpoint) {
					return true
				}
			}
		}
	}
	return false
}

func (work *callableEffectWork) currentStagedInputCallResultReading(source *sourceStagedCallResultSource, input sourceStagedInputCallResultReading) bool {
	caller, known := work.memberNodes[input.request.consumer]
	if !known || source.generation != work.operationGeneration || !validStagedInputCallResultReading(source, input) || !currentStagedInputAssociation(work.operationFacts, caller, input.call, input.endpoint) {
		return false
	}
	return true
}

// prepareStagedInputCallResult authenticates and queues an argument DATA reader.
// True means registration, not local extraction or transitive readiness. No
// Get loan, ordinary parent use, B or normal result is manufactured.
func (work *callableEffectWork) prepareStagedInputCallResult(facts []callableFacts, caller int, call sourceStagedDeclarationCall, endpoint sourceRelativeEndpoint, owner *executableBodyOwner) (sourceStagedOperationRequest, bool) {
	if owner == nil || owner.values == nil || !currentStagedInputAssociation(facts, caller, call, endpoint) {
		return sourceStagedOperationRequest{}, false
	}
	work.indexOperationSources(facts)
	if work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return sourceStagedOperationRequest{}, false
	}
	work.operationGeneration = owner.values.generation
	producing := endpoint.expression
	source, supported := work.describeStagedCallResultSource(facts, caller, producing, owner)
	// A callback that captures an unbound formal still has a known body. Its
	// ordinary invocation summary carries that body's effects and relative input
	// demand. Registering DATA for a construction that cannot supply its captures
	// would keep this caller pending permanently.
	if supported && source.binding != nil && localConstructionBindingSyntax(source.binding, facts[caller].node) {
		initializer := source.binding.Initializer()
		if isWriterInputCallable(initializer) {
			closure := describeLocalConstructionCallable(initializer, initializer, facts[caller].node, owner.values)
			if closure == nil || closure.unsupported {
				return sourceStagedOperationRequest{}, false
			}
		}
	}
	if supported && source.getResult != nil {
		if _, registered := work.registerStagedGetResult(facts, caller, producing, owner); !registered {
			return sourceStagedOperationRequest{}, false
		}
		work.observeStagedGetResult(facts, caller, producing, owner)
		if !work.stagedGetResultAdmitted(producing, facts[caller].node) {
			return sourceStagedOperationRequest{}, false
		}
	}
	if !supported {
		return sourceStagedOperationRequest{}, false
	}
	reading := stagedInputCallResultReading(source.request, facts[caller].node, call, endpoint)
	input := sourceStagedInputCallResultReading{request: reading, call: call, endpoint: endpoint}
	if !work.registerStagedCallResultReading(facts, source, reading, call.invocation.cut, &input) {
		return sourceStagedOperationRequest{}, false
	}
	_, registered := work.requireOperation(facts, reading)
	return reading, registered
}

// stagedInputCallResultData reads the cumulative typed subscriber prefix. The
// queue owns its incremental cursor, so a second consumeOperation would lose
// already-delivered alternatives. extracted is local, required stays independent.
func (work *callableEffectWork) stagedInputCallResultData(facts []callableFacts, reading sourceStagedOperationRequest) (sourceStagedOperationDelivery, bool) {
	recipe := work.operationRecipes[reading.producer]
	source := recipe.callResult
	if source == nil || !validStagedCallResultRecipe(recipe) {
		return sourceStagedOperationDelivery{}, false
	}
	current := false
	for _, input := range source.inputReadings {
		if sameOperationRequest(input.request, reading) && work.currentStagedInputCallResultReading(source, input) {
			current = true
		}
	}
	if !current {
		return sourceStagedOperationDelivery{}, false
	}
	return work.stagedCallResultData(reading)
}

// stagedCallResultData reads the existing cumulative subscriber after the
// owning reader has authenticated its current source relation.
func (work *callableEffectWork) stagedCallResultData(reading sourceStagedOperationRequest) (sourceStagedOperationDelivery, bool) {
	id, adopted := work.operationIDs[reading.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return sourceStagedOperationDelivery{}, false
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	if subscriber == nil || !sameOperationRequest(subscriber.request, reading) || subscriber.blocked || subscriber.applied != state.revision || state.revision == 0 {
		return sourceStagedOperationDelivery{}, false
	}
	delta := cloneOperationDelta(sourceStagedOperationDelta{exposures: subscriber.returned, required: state.delta.required, extracted: state.delta.extracted})
	return sourceStagedOperationDelivery{producer: id, revision: state.revision, delta: delta}, true
}

// This dependency is supplied by the existing lexical Call Effects owner. It
// does not authenticate a creating B or deliver the Call's returned DATA.
func stagedDeclarationResultEffectsRequest(source *sourceStagedCallResultSource) (sourceStagedOperationRequest, bool) {
	if source == nil || source.nativeCall || source.constructedRoot.producer.operation != nil || source.binding != nil || source.operand != nil || source.getResult != nil || !ast.IsCallExpression(source.request.producer.operation) || source.declaration == nil || !ast.IsFunctionDeclaration(source.declaration) || source.declaration.Body() == nil {
		return sourceStagedOperationRequest{}, false
	}
	return stagedDeclarationCallEffectsRequest(source.request.producer.operation, source.request.consumer), true
}

// Retain an already-issued original Effects producer before pending DATA enters
// the source conjunction. The later actual association remains the DATA owner.
func (work *callableEffectWork) retainStagedDeclarationResultEffects(facts []callableFacts, key sourceStagedOperationKey) bool {
	recipe := work.operationRecipes[key]
	source := recipe.callResult
	request, supported := stagedDeclarationResultEffectsRequest(source)
	if !supported || source.generation != work.operationGeneration || recipe.delta.extracted {
		return false
	}
	producer := work.operationRecipes[request.producer]
	if !work.passiveDeclarationCallEffectsReady(producer) || producer.declarationCall.invocation.declaration != source.declaration {
		return false
	}
	for _, required := range recipe.delta.required {
		if sameOperationRequest(required, request) {
			return false
		}
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, request)
	return work.attachOperationSource(facts, recipe)
}

// Pending admission requires a current original reader and the independently
// issued lexical Effects contract, including eager and canonical obligations.
// No returned prefix or invocation can be obtained from this predicate.
func (work *callableEffectWork) passiveStagedDeclarationResultSupported(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	request, supported := stagedDeclarationResultEffectsRequest(source)
	if !supported || !validStagedCallResultRecipe(recipe) || source.generation != work.operationGeneration || !work.freshStagedCallResultReading(recipe) {
		return false
	}
	producer := work.operationRecipes[request.producer]
	if !work.passiveDeclarationCallEffectsReady(producer) || producer.declarationCall.invocation.declaration != source.declaration {
		return false
	}
	count := 0
	for _, required := range recipe.delta.required {
		if sameOperationRequest(required, request) {
			count++
		}
	}
	return count == 1
}
