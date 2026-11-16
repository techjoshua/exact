package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceDescriptorMutationEnumeration records SOURCE operators at the original
// selected native algorithm, independently of its Effects disposition. Targets
// remain symbolic until authenticated input substitution; no formal is a
// runtime terminal. This graph-local description is cleared with work state.
type sourceDescriptorMutationEnumeration struct {
	sealed      bool // original once-only SOURCE traversal has returned; never inferred from Effects closure
	native      sourceStagedDescriptorRetrieval
	method      *ast.Node
	inputs      [2]sourceDescriptorInputData
	targets     []sourceStagedOperationAlternative
	rhs         []sourceStagedOperationRequest
	represented bool
}

func (q *sourceValueQuery) publishDescriptorMutationSource(call *ast.Node) {
	if q == nil || q.installedMemberNativePhase == nil {
		return
	}
	phase := q.installedMemberNativePhase
	if phase.mutationSource != nil {
		phase.mutationSource(q, call)
	}
}

func (work *callableEffectWork) captureDescriptorMutationSource(facts []callableFacts, q *sourceValueQuery, call *ast.Node) bool {
	if q == nil || q.owner == nil || q.executable == nil || q.installedMemberIssuer != q || q.inputs != nil || q.operation != nil || !q.dependenciesOnly || q.normalBindingCall != call || q.reading != call || !q.active[call] {
		return false
	}
	b := q.installedMemberNativePhase
	if b == nil || !b.live || b.issuer != q || b.publisher == nil || !b.publisher.live || b.source == nil || !validDescriptorRetrieval(b.source) || b.source.request.producer.operation != call || b.generation != work.operationGeneration || q.owner.generation != work.operationGeneration || q.relativeInputCut(call) != b.mutationCut {
		return false
	}
	actor, known := work.memberNodes[q.effectOwner]
	id, adopted := work.operationIDs[b.algorithm.producer]
	if !known || actor < 0 || actor >= len(facts) || b.publisher.fact != &facts[actor] || !adopted || id.epoch != work.operationEpoch || id.index == 0 {
		return false
	}
	for position, input := range b.mutationInputs {
		if !work.descriptorInputSnapshotCurrent(b.source.descriptorRead, position, input) {
			return false
		}
	}
	enumeration := &sourceDescriptorMutationEnumeration{native: *cloneDescriptorRetrieval(b.source.descriptorRead), method: b.source.method, represented: true}
	for position, input := range b.mutationInputs {
		enumeration.inputs[position] = cloneDescriptorInputData(input)
	}
	key := enumeration.inputs[1]
	primitive := descriptorPrimitiveKeyAlternatives(key)
	if key.construction && len(key.alternatives) == 1 && key.alternatives[0].creating == nil {
		node := key.alternatives[0].endpoint.expression
		primitive = node != nil && ast.IsStringLiteralLike(node)
	}
	enumeration.represented = primitive
	for _, target := range enumeration.inputs[0].alternatives {
		// This is a declaration-relative native mutation obligation. Concrete
		// source/protocol/creating arms need their own original DATA producer.
		if target.creating == nil && target.endpoint.kind == relativeEndpointRole && validMutationSourceRole(target.endpoint.role, b.algorithm.consumer) {
			enumeration.targets = append(enumeration.targets, cloneOperationDelta(sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{target}}).exposures[0])
		} else {
			enumeration.represented = false
		}
	}
	if len(enumeration.targets) == 0 {
		enumeration.represented = false
	}
	prior := work.operations[id.index].descriptorMutations
	if prior != nil {
		// The once-only original algorithm does not rewrite prior observations.
		return sameDescriptorRetrieval(&prior.native, &enumeration.native) && sameDescriptorInputData(prior.inputs[0], enumeration.inputs[0]) && sameDescriptorInputData(prior.inputs[1], enumeration.inputs[1])
	}
	work.operations[id.index].descriptorMutations = enumeration
	return true
}

// descriptorMutationFieldSource emits only a typed native operator. The ordinary
// field Value baseline, other source candidates and all native debts remain.
func (work *callableEffectWork) descriptorMutationFieldSource(demand sourceStagedFieldEffectsDemand, request sourceStagedOperationRequest, source *sourceStagedNativeGetSource) (sourceStagedOperationDelta, bool) {
	algorithm := nativeRootDebtRequest(source, "algorithm")
	id, adopted := work.operationIDs[algorithm.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || !validDescriptorRetrieval(source) {
		return sourceStagedOperationDelta{}, false
	}
	enumeration := work.operations[id.index].descriptorMutations
	if enumeration == nil || enumeration.native.generation != work.operationGeneration || !sameDescriptorRetrieval(&enumeration.native, source.descriptorRead) {
		return sourceStagedOperationDelta{}, false
	}
	for position, input := range enumeration.inputs {
		if !work.descriptorInputSnapshotCurrent(source.descriptorRead, position, input) {
			return sourceStagedOperationDelta{}, false
		}
	}
	delta := sourceStagedOperationDelta{extracted: enumeration.represented}
	required := []sourceStagedOperationRequest{source.request, algorithm, nativeRootDebtRequest(source, "callee-get")}
	for _, input := range enumeration.inputs {
		if input.request.producer.operation != nil {
			required = appendEntryLawRequirement(required, input.request)
		}
	}
	for _, child := range enumeration.rhs {
		required = appendEntryLawRequirement(required, child)
	}
	delta.required = required
	for _, target := range enumeration.targets {
		m := &sourceRelativeFieldMutation{native: *cloneDescriptorRetrieval(&enumeration.native), method: enumeration.method, field: request, receiver: cloneSourceRelativeEndpoint(demand.receiver), name: demand.request.producer.selector.field, input: cloneDescriptorInputData(enumeration.inputs[0]), key: cloneDescriptorInputData(enumeration.inputs[1]), target: cloneSourceRelativeEndpoint(target.endpoint), required: cloneOperationDelta(sourceStagedOperationDelta{required: required}).required}
		if !validRelativeFieldMutationShape(m) {
			delta.extracted = false
			continue
		}
		delta.residuals = append(delta.residuals, sourceStagedOperationResidual{operation: demand.request.producer.operation, mutation: m})
	}
	return delta, true
}
