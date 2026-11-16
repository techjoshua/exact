package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMemberGetEffects is the original Get's direct contribution,
// independent of its produced values. The initial standard data-slot branch
// supplies the baseline. Finite source-set children retain other alternatives.
// Untransferred implicit body, receiver and protocol work remains pending.
type sourceStagedMemberGetEffects struct {
	descriptor  *sourceDescriptorRecordGet
	accounted   bool
	preparation sourceStagedOperationRequest // Exact original generic Get's debt-only source preparation.
}

func stagedMemberGetEffectsKey(parent sourceStagedOperationRequest) sourceStagedOperationKey {
	key := parent.producer
	key.selector = sourceStagedOperationSelector{occurrence: stagedMemberGetExpression(parent.producer.operation), field: "member-get-effects"}
	return key
}

func nativeMemberGetChannelsRepresented(result *accessorCandidates) bool {
	return result != nil && !result.receiverIncomplete && !result.fieldReceiverIncomplete && !result.thenIncomplete &&
		len(result.contextEffects)+len(result.effects)+len(result.fieldFallbacks)+len(result.callFallbacks)+len(result.fieldCalls)+
			len(result.reflective)+len(result.nativeCalls)+len(result.normalCalls)+len(result.inputs)+len(result.writeBodies)+
			len(result.writes)+len(result.accessorMutations)+len(result.ordinaryBodies)+len(result.descriptorFallbacks)+
			len(result.writeOutcomes)+len(result.owned)+len(result.ownedGets)+len(result.ownedClaims)+len(result.thenReferences) == 0
}

func validStagedMemberGetEffectsRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	source := recipe.memberSource
	if source != nil && source.getEffects != nil && source.getEffects.descriptor != nil {
		return validDescriptorRecordGetRecipe(recipe)
	}
	if source == nil || source.getEffects == nil || !source.candidate.getContribution || !source.candidate.protocol || source.generation == nil || !stagedMemberFactoryParent(source) || (!ast.IsCallExpression(source.parent.producer.operation) && !ast.IsPropertyAccessExpression(source.parent.producer.operation)) || !sameOperationRequest(source.request, stagedMemberCandidateRequest(source.parent, source.candidate)) || source.request.producer != recipe.key || source.coverage != nil || source.call != nil || !stagedMemberFactoryObservation(source, source.candidate.cut) || source.candidate.operation != source.parent.producer.operation || source.candidate.value.expression != stagedMemberGetExpression(source.parent.producer.operation) || recipe.delta.extracted != source.getEffects.accounted || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	if ast.IsCallExpression(source.parent.producer.operation) && (len(recipe.delta.required) != 0 || !sameOperationRequest(source.getEffects.preparation, sourceStagedOperationRequest{})) {
		return false
	}
	preparation := source.getEffects.preparation
	if !sameOperationRequest(preparation, sourceStagedOperationRequest{}) && (!ast.IsPropertyAccessExpression(source.parent.producer.operation) || !sameOperationRequest(preparation, stagedGetPreparationRequest(source.parent)) || !operationContainsRequest(recipe.delta.required, preparation)) {
		return false
	}
	for _, required := range recipe.delta.required {
		if !sameOperationRequest(preparation, sourceStagedOperationRequest{}) && sameOperationRequest(required, preparation) {
			continue
		}
		origin := required.producer.selector.association
		if !ast.IsPropertyAccessExpression(source.parent.producer.operation) || origin == nil || !sameOperationRequest(required, stagedMemberCoverageRequest(source.parent, origin, source.candidate.cut)) {
			return false
		}
	}
	for _, effect := range recipe.delta.effects {
		if !validOperationEnvironmentEffect(effect) || effect.relativeCoercion != nil {
			return false
		}
	}
	return recipe.nativeGet == nil && recipe.callResult == nil && recipe.constructed == nil && recipe.mapEntry == nil && recipe.mapProtocol == nil && recipe.writer == nil && recipe.getter == nil && recipe.returning == nil && recipe.constructedDisposition == nil && len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) == 0
}

// publishMemberSourceContributions delivers an observed source disposition even
// when it has no payload atoms. A cached recipe alone cannot issue the receipt.
func (work *callableEffectWork) publishMemberSourceContributions(id sourceStagedOperationID) {
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if work.memberCoverageObserved[state.key] != work.operationGeneration {
		return
	}
	state.memberCoverageObserved = true
	if operationDeltaSize(recipe.delta) == 0 {
		work.publishSourceDisposition(id)
	} else {
		work.publishOperation(id, recipe.delta)
	}
}

func stagedMemberGetExpression(operation *ast.Node) *ast.Node {
	if ast.IsCallExpression(operation) {
		return operation.Expression()
	}
	return operation
}

// prepareStagedConstructedGetEffectsSource owns the actual property Get phase.
// Its source query lends no caller frame or selected output. Original receiver
// coverage and every native Get event remain independent of Call invocation.
func (work *callableEffectWork) prepareStagedConstructedGetEffectsSource(facts []callableFacts, caller int, node *ast.Node, owner *executableBodyOwner, executions ...*sourceStagedGetPreparationExecution) bool {
	if len(executions) > 1 || owner == nil || owner.values == nil || caller < 0 || caller >= len(facts) || facts[caller].normalInputs != nil || facts[caller].initializerPlan != nil || !ast.IsPropertyAccessExpression(node) || !ast.IsIdentifier(node.Expression()) || !sourceStagedOccurrenceOwned(node, facts[caller].node) {
		return false
	}
	read, _ := accessorEvaluationMode(node)
	if !read {
		return false // A plain Set LHS owns receiver evaluation, not a property Get.
	}
	_, key := accessorReceiver(node)
	if key != "get" && key != "set" {
		return false
	}
	file := ast.GetSourceFileOfNode(node)
	if owner.values.program.GetSourceFile(file.FileName()) != file || work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return false
	}
	work.indexOperationSources(facts)
	work.operationGeneration = owner.values.generation
	index := owner.values.index(file)
	if index.incomplete || index.normalDynamicScope {
		return false
	}
	relations := stagedReceiverRelations(node.Expression(), owner.values, index)
	if len(relations.sites) == 0 {
		return false
	}
	for _, site := range relations.sites {
		if _, published := owner.standardConstructions[site]; !published {
			work.prepareStagedConstructionSource(facts, site, owner)
		}
	}
	request, owned := stagedMemberGetSourceRequest(&facts[caller], node)
	if !owned {
		return false
	}
	// A current original Effects receipt is stable source accounting, not a
	// request to reacquire its output. Replaying its pending prefix after local
	// extraction would reject the source transfer and resume stronger recovery.
	if issued, known := work.memberProtocolSources[node]; known && len(executions) == 0 {
		recipe := work.operationRecipes[issued.producer]
		source := recipe.memberSource
		if source != nil && source.getEffects != nil && sameOperationRequest(source.parent, request) && source.generation == work.operationGeneration && recipe.delta.extracted && validStagedMemberGetEffectsRecipe(recipe) && work.memberCoverageObserved[recipe.key] == work.operationGeneration {
			fresh := len(recipe.delta.required) != 0 && sameOperationRequest(source.getEffects.preparation, stagedGetPreparationRequest(request))
			for _, required := range recipe.delta.required {
				if sameOperationRequest(required, source.getEffects.preparation) {
					fresh = fresh && work.getPreparationReadingCurrent(required)
					continue
				}
				child := work.operationRecipes[required.producer].memberSource
				fresh = fresh && child != nil && child.coverage != nil && child.generation == work.operationGeneration && child.coverage.cut == source.candidate.cut && sameOperationRequest(child.parent, request) && work.memberCoverageObserved[required.producer] == work.operationGeneration
			}
			if fresh {
				return true
			}
		}
	}
	q := newSourceDependencyQuery(node, owner.checker, owner, facts[caller].node)
	defer q.publishDependencyStatistics()
	q.protectedMember = node
	revoke, installed := work.beginStagedMemberWork(q, facts, request)
	if !installed {
		return false
	}
	defer revoke()
	b := q.stagedMember
	var execution *sourceStagedGetPreparationExecution
	if len(executions) == 1 {
		execution = executions[0]
	}
	revokePreparation, preparation := work.beginStagedGetPreparation(facts, q, request, execution)
	if preparation == nil {
		return false
	}
	defer revokePreparation()
	preparationRequest := stagedGetPreparationRequest(request)
	required := []sourceStagedOperationRequest{preparationRequest}
	effects := []EnvironmentEffectSource{}
	seen := make(map[*ast.Node]bool)
	accounted := true
	var first *ast.Node
	var cut sourceRelativeCut
	publish := func(complete bool) bool {
		preparationRecipe := work.operationRecipes[preparationRequest.producer]
		if !validStagedGetPreparationRecipe(preparationRecipe) || !sameOperationRequest(preparationRecipe.memberSource.parent, request) {
			return false
		}
		if first == nil {
			return false
		}
		candidate := sourceStagedMemberCandidate{request: request, operation: node, region: facts[caller].node, origin: first, protocol: true, getContribution: true, cut: cut}
		candidate.value = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: node, producer: node, cut: cut}
		getRequest := stagedMemberCandidateRequest(request, candidate)
		source := &sourceStagedMemberSource{parent: request, request: getRequest, candidate: candidate, generation: work.operationGeneration, getEffects: &sourceStagedMemberGetEffects{accounted: complete, preparation: preparationRequest}}
		recipe := sourceStagedOperationRecipe{key: getRequest.producer, memberSource: source, delta: sourceStagedOperationDelta{extracted: complete, required: required, effects: effects}}
		accepted := false
		if prior, present := work.operationRecipes[recipe.key]; present {
			// A fresh original event may renew a completed description. Its
			// query-local prefix cannot retract that immutable description or
			// borrow its old observation. Only the final outcome stamps it.
			if !complete && prior.delta.extracted && validStagedMemberGetEffectsRecipe(prior) && sameStagedMemberSource(prior.memberSource, source) && operationDeltaPrefix(recipe.delta, prior.delta) {
				return true
			}
			accepted = work.attachOperationSource(facts, recipe)
		} else {
			accepted = work.registerOperationRecipe(facts, recipe)
		}
		if accepted {
			// This original Get source event supplies the ordinary Effects use too.
			// Its real C subscribers are then available to the preparation retry;
			// no acquired result or Call packet is installed.
			if !work.registerOperationUse(facts, sourceStagedOperationUse{request: source.request}) {
				return false
			}
			work.attachSourceObservationDependencies(facts, preparation.id)
			if work.memberCoverageObserved == nil {
				work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
			}
			work.memberCoverageObserved[recipe.key] = work.operationGeneration
			work.indexStagedMemberProtocolSource(recipe)
			if id, adopted := work.operationIDs[recipe.key]; adopted {
				work.publishMemberSourceContributions(id)
			}
		}
		return accepted
	}
	b.constructedGetEffects = func(origin *ast.Node, get *sourceGetInputs, read *sourceMemberWriterReadCut, mode accessorTraversal, standard *sourceValue, local bool, result *accessorCandidates) bool {
		if b.constructedGetEvent != get || b.constructedGetStandard != standard || !q.liveStagedMemberSource(b, get, read) || get.operation != node || mode != accessorAcquire || b.coverage == nil || b.coverage.origin != origin || b.coverage.cut != q.relativeInputCut(node) || b.coverage.generation != work.operationGeneration || work.memberCoverageObserved[b.coverage.request.producer] != work.operationGeneration {
			return false
		}
		if _, published := owner.standardConstructions[origin]; !published {
			return false
		}
		if first == nil {
			first = origin
			cut = b.coverage.cut
		} else if cut != b.coverage.cut {
			return false
		}
		seen[origin] = true
		accounted = accounted && local
		required = appendEntryLawRequirement(required, b.coverage.request)
		if result != nil {
			for _, effect := range result.environmentEffects {
				if !validOperationEnvironmentEffect(effect) || effect.relativeCoercion != nil {
					accounted = false
					continue
				}
				effects = append(effects, cloneOperationDelta(sourceStagedOperationDelta{effects: []EnvironmentEffectSource{effect}}).effects...)
			}
		}
		return publish(false)
	}
	receiver, name := accessorReceiver(node)
	result := q.accessorsAtGetOutput(receiver, []string{name}, "", accessorAcquire, nil, nil, nil, nil, sourceGetReferenceFor(node, receiver, []string{name}, "", accessorAcquire))
	if first == nil {
		return false
	}
	// This existing source owner supplies alternative coverage. MAY-site count
	// only prevents an unobserved branch from completing this Get.
	complete := accounted && !result.opaque && nativeMemberGetChannelsRepresented(&result) && work.constructedReceiverCovered(node.Expression(), caller, facts, owner, make(map[*ast.Node]bool))
	for _, site := range relations.sites {
		complete = complete && seen[site]
	}
	preparationComplete := work.finishStagedGetPreparation(facts, q, preparation, !preparation.dataPending)
	return publish(complete && preparationComplete && work.getPreparationCurrent(preparationRequest))
}
