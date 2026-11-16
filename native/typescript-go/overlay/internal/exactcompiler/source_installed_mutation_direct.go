package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// publishInstalledMutationRHS observes only the ORIGINAL source body demand.
// Normal paths, query copies and saved binder descriptions cannot issue here.
func (q *sourceValueQuery) publishInstalledMutationRHS(node *ast.Node, inputs *sourceValueInputs) {
	if q == nil || q.installedMemberNativePhase == nil {
		return
	}
	phase := q.installedMemberNativePhase
	if phase.mutationRHS != nil {
		phase.mutationRHS(q, node, inputs)
	}
}

func (work *callableEffectWork) publishDirectInstalledMutationRHS(facts []callableFacts, q *sourceValueQuery, node *ast.Node, inputs *sourceValueInputs) bool {
	if q == nil || inputs == nil || q.inputs != inputs || q.operation != nil || !q.dependenciesOnly || q.owner == nil || q.owner.generation != work.operationGeneration || q.executable == nil || !q.stagedFieldWorkOwner(q.executable) || !q.active[inputs.declaration] {
		return false
	}
	phase := q.installedMemberNativePhase
	if phase == nil || !phase.live || phase.issuer != q || phase.publisher == nil || !phase.publisher.live || q.executable.pendingMemberPublishers[q.effectOwner] != phase.publisher || phase.generation != work.operationGeneration || phase.source == nil || !validDescriptorRetrieval(phase.source) {
		return false
	}
	caller, known := work.memberNodes[q.effectOwner]
	producer, provided := work.memberNodes[inputs.declaration]
	if !known || !provided || caller < 0 || caller >= len(facts) || producer < 0 || producer >= len(facts) || phase.publisher.fact != &facts[caller] || facts[producer].sourceFile != ast.GetSourceFileOfNode(inputs.declaration) {
		return false
	}
	template, described := describeMutationWriterTemplate(node, inputs.declaration, q.owner)
	if !described {
		return false
	}
	binding, bound, captures, inputRequired, owned := q.directMutationInputDescription(inputs)
	if !owned {
		return false
	}
	projection, represented := projectMutationWriterTemplate(template, bound, captures, q.owner)
	if !represented {
		return false
	}
	var data [2]sourceDescriptorInputData
	for position := range data {
		snapshot, applied := work.descriptorInputData(phase.source.descriptorRead, position)
		if !applied || !work.descriptorInputSnapshotCurrent(phase.source.descriptorRead, position, snapshot) {
			return false
		}
		data[position] = cloneDescriptorInputData(snapshot)
	}
	request := installedMutationRHSRequest(phase.algorithm, template, binding)
	d := &sourceInstalledMutationRHS{request: request, parent: phase.algorithm, template: template, binding: binding, bound: cloneSourceRelativeBoundInputs(bound), projection: projection, generation: work.operationGeneration, direct: true, native: cloneDescriptorRetrieval(phase.source.descriptorRead), nativeInputs: data, inputRequired: append([]sourceStagedOperationRequest(nil), inputRequired...)}
	recipe := sourceStagedOperationRecipe{key: request.producer, installedMutationRHS: d, delta: cloneOperationDelta(projection.delta)}
	recipe.delta.required = []sourceStagedOperationRequest{phase.algorithm, phase.source.request}
	for _, child := range d.inputRequired {
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, child)
	}
	for _, snapshot := range data {
		if snapshot.request.producer.operation != nil {
			recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, snapshot.request)
		}
	}
	if !validInstalledMutationRHSRecipe(recipe) {
		return false
	}
	prior, exists := work.operationRecipes[recipe.key]
	if exists && !sameInstalledMutationRHS(prior.installedMutationRHS, d) {
		return false
	}
	if !exists && !work.registerOperationRecipe(facts, recipe) {
		return false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[recipe.key] = work.operationGeneration
	if exists && !work.attachOperationSource(facts, recipe) {
		return false
	}
	id, adopted := work.requireOperation(facts, request)
	if !adopted {
		return false
	}
	if operationDeltaSize(recipe.delta) != 0 {
		work.publishOperation(id, recipe.delta)
	}
	algorithmID := work.operationIDs[phase.algorithm.producer]
	if algorithmID.epoch == work.operationEpoch && algorithmID.index != 0 && int(algorithmID.index) < len(work.operations) {
		enumeration := work.operations[algorithmID.index].descriptorMutations
		if enumeration != nil && !enumeration.sealed && sameDescriptorRetrieval(&enumeration.native, phase.source.descriptorRead) {
			enumeration.rhs = appendEntryLawRequirement(enumeration.rhs, request)
		}
	}
	return true
}

func (work *callableEffectWork) directInstalledMutationRHSCurrent(recipe sourceStagedOperationRecipe) bool {
	s := recipe.installedMutationRHS
	if s == nil || !s.direct || s.native == nil || s.generation != work.operationGeneration || s.native.generation != work.operationGeneration {
		return false
	}
	algorithm := work.operationRecipes[s.parent.producer]
	if !validDescriptorEffectsPhase(algorithm) || !sameDescriptorRetrieval(algorithm.nativeGet.descriptorRead, s.native) || !work.nativeEffectsGetCurrent(algorithm.nativeGet) {
		return false
	}
	for position, input := range s.nativeInputs {
		if !work.descriptorInputSnapshotCurrent(s.native, position, input) {
			return false
		}
	}
	for _, request := range s.inputRequired {
		id, adopted := work.operationIDs[request.producer]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
		state := &work.operations[id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		if state.invalid || state.revision == 0 || sub == nil || sub.blocked || !sameOperationRequest(sub.request, request) || sub.applied != state.revision {
			return false
		}
	}
	return true
}

// directMutationInputDescription distinguishes actual outer Call binders from
// nested getter binders. The latter retain their own zero-actual description,
// actual phase debt and live body borrow; no outer trap input is substituted.
func (q *sourceValueQuery) directMutationInputDescription(inputs *sourceValueInputs) (*sourceRelativeInputEdge, sourceRelativeBoundInputs, []sourceRelativeBinding, []sourceStagedOperationRequest, bool) {
	if q.installedMemberInputOwned(q.installedMemberInput) {
		input := q.installedMemberInput
		if input.inputs == inputs && input.binding != nil && input.binding.delivered && input.source != nil && input.source.generation == q.owner.generation {
			return input.binding, input.source.bound, input.source.captures, input.source.required, true
		}
	}
	b := q.installedGetBody
	if b == nil || !b.live || b.issuer != q || b.generation != q.owner.generation || b.inputs != inputs || q.inputs != inputs || b.body != inputs.declaration || inputs.get == nil || b.get == nil || inputs.get.operation != b.get.operation || inputs.invocation != nil || b.mutationInputs == nil || !b.mutationInputs.delivered || b.mutationInputs.request.inputKind != relativeInputSourceGetter || b.mutationInputs.request.declaration != inputs.declaration || b.mutationInputs.request.operation != b.get.operation || len(b.mutationRequired) == 0 || !sameSourceRelativeInputEnvelope(b.mutationInputs.request, b.mutationInputs.relative) {
		return nil, sourceRelativeBoundInputs{}, nil, nil, false
	}
	return b.mutationInputs, b.mutationInputs.relative, nil, b.mutationRequired, true
}
