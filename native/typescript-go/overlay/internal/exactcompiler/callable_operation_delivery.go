package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedOperationDependency is an exact required subscriber, not a query
// callback. Delivery and extraction are distinct from transitive closure.
type sourceStagedOperationDependency struct {
	producer sourceStagedOperationID
	request  sourceStagedOperationRequest
}

// closedOperationDependencies propagates failed prerequisites backwards. Every
// remaining node is closed, including a locally ready SCC with no failed exit.
// This conjunction needs no path expansion or repeated full-graph fixed point.
func (work *callableEffectWork) closedOperationDependencies() []bool {
	return work.operationDependencyReadiness(false)
}

// Admission may retain a selected external initializer before project merge.
// This runs the same conjunction as publication, with only that explicitly
// unbound module producer deferred. It never marks a graph disposition closed.
func (work *callableEffectWork) operationDependencyReadiness(admission bool) []bool {
	closed := make([]bool, len(work.operations))
	parents := make([][]int, len(work.operations))
	for index := 1; index < len(work.operations); index++ {
		state := &work.operations[index]
		ready := state.revision != 0 && state.delta.extracted && !state.invalid && state.dependenciesRegistered
		if len(state.getters) != 0 {
			ready = ready && work.installedMutationDataCurrent(state)
		}
		recipe := work.operationRecipes[state.key]
		if recipe.mutationData != nil {
			ready = ready && work.fieldMutationDataCurrent(recipe)
		}
		if recipe.installedMutationRHS != nil {
			ready = ready && work.installedMutationRHSCurrent(recipe)
		}
		if recipe.installedCall != nil {
			ready = ready && work.installedCallObservationCurrent(recipe)
		}
		if recipe.installedMember != nil {
			ready = ready && work.installedMemberObservationCurrent(recipe)
		}
		if recipe.memberSource != nil && recipe.memberSource.nativeFieldGet != nil {
			ready = ready && work.nativeFieldSourceCurrent(recipe)
		}
		if recipe.memberSource != nil && recipe.memberSource.originalGetMutationInterest != nil {
			ready = ready && work.originalGetMutationInterestCurrent(recipe)
		}
		if recipe.memberSource != nil && recipe.memberSource.originalGetMutation != nil {
			ready = ready && work.originalGetMutationCurrent(recipe)
		}
		if recipe.memberSource != nil && recipe.memberSource.reflectiveContribution != nil {
			ready = ready && work.reflectiveContributionCurrent(recipe)
		}
		if recipe.memberSource != nil && recipe.memberSource.descriptorStrong != nil {
			d := recipe.memberSource.descriptorStrong
			ready = ready && work.descriptorStrongReadingCurrent(recipe.memberSource.request, d.parent, d.cut) && work.descriptorStrongRequiredCurrent(recipe)
		}
		if recipe.descriptorTarget != nil {
			ready = ready && work.descriptorTargetCurrent(recipe)
		}
		if recipe.nativeGet != nil && recipe.nativeGet.effectsSource != nil {
			ready = ready && work.nativeEffectsSourceCurrent(recipe)
		}
		if work.nativeEagerTaskSource(sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}) != nil {
			ready = ready && work.nativeEagerSourcesCurrent(recipe.nativeGet)
		}
		if recipe.moduleArgument != nil {
			ready = ready && work.moduleArgumentSourceCurrent(recipe)
		}
		if recipe.nativeGet != nil && recipe.nativeGet.inputInvocation != nil {
			ready = ready && work.nativeInputInvocationCurrent(recipe)
		}
		if validNativeInputBindingPhase(recipe) {
			ready = ready && work.nativeInputBindingPhaseCurrent(recipe)
		}
		if recipe.declarationCall != nil {
			ready = ready && work.declarationCallEffectsAccounted(state, recipe)
		}
		if recipe.memberSource != nil && recipe.memberSource.nativeWriter != nil {
			ready = ready && work.nativeWriterCapabilityCurrent(recipe)
		}
		if recipe.memberSource != nil && recipe.memberSource.globalWrite != nil {
			ready = ready && work.currentStagedGlobalWrite(recipe)
		}
		if recipe.memberSource != nil && recipe.memberSource.hasFreshTarget != nil {
			ready = ready && work.hasFreshTargetCurrent(recipe)
		}
		if recipe.entryLaw != nil {
			proof := work.entryLawReceipts[state.key]
			ready = ready && work.entryLawLocallyAccounted(recipe, proof)
		}
		if recipe.constructionEffects != nil {
			ready = ready && work.passiveConstructionEffectsReady(recipe)
		}
		if source := recipe.assignment; source != nil {
			ready = ready && source.generation == work.operationGeneration && state.assignment != nil && state.assignment.generation == work.operationGeneration && state.assignment.observed
			if source.phase == "" && state.assignment != nil {
				consumer := work.memberNodes[source.root.consumer]
				for _, inputs := range state.assignment.bodies {
					if inputs == nil || !inputs.delivered {
						ready = false
						continue
					}
					target, known := work.memberNodes[inputs.request.declaration]
					edge := stagedDeclarationCallEdge(work.operationFacts[consumer].summary.ID, inputs.request)
					dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, edge}]
					ready = ready && known && dependency != nil && !dependency.invalid && !dependency.projectionPending && target < len(work.stagedRevisions) && work.operationFacts[target].staged.ready && dependency.consumed == work.stagedRevisions[target]
				}
			}
		}
		if recipe.hasInstance != nil {
			ready = ready && recipe.hasInstance.generation == work.operationGeneration && state.hasInstance != nil && state.hasInstance.generation == work.operationGeneration && state.hasInstance.observed
			if recipe.hasInstance.role == "prototype" && state.hasInstance != nil && state.hasInstance.defaultRequired {
				ready = ready && validStagedHasInstanceDefault(state.hasInstance.defaultProof, recipe.hasInstance.root, work.operationGeneration)
			}
			if (recipe.hasInstance.role == "" || recipe.hasInstance.role == "lookup-prototype") && state.hasInstance != nil {
				consumer := work.memberNodes[recipe.hasInstance.root.consumer]
				methods := state.hasInstance.methods
				if recipe.hasInstance.role == "lookup-prototype" {
					root, exists := work.operationIDs[recipe.hasInstance.root.producer]
					if !exists || work.operations[root.index].hasInstance == nil {
						ready = false
					} else {
						methods = work.operations[root.index].hasInstance.methods
					}
				}
				for _, inputs := range methods {
					if inputs != nil && recipe.hasInstance.role == "lookup-prototype" && !ast.IsGetAccessorDeclaration(inputs.request.declaration) {
						continue
					}
					if inputs == nil || !inputs.delivered {
						ready = false
						continue
					}
					target, known := work.memberNodes[inputs.request.declaration]
					edge := stagedDeclarationCallEdge(work.operationFacts[consumer].summary.ID, inputs.request)
					dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, edge}]
					ready = ready && known && target < len(work.operationFacts) && target < len(work.stagedRevisions) && dependency != nil && !dependency.invalid && !dependency.projectionPending && work.operationFacts[target].staged.ready && dependency.consumed == work.stagedRevisions[target]
				}
			}
		}
		if recipe.callResult != nil {
			// Scalar source/APPLIED checks only; this conjunction owns full closure.
			ready = ready && work.nativePrimitivePayloadsApplied(recipe)
			ready = ready && recipe.callResult.generation == work.operationGeneration
			if recipe.callResult.constructedRoot.producer.operation != nil {
				_, current := work.currentConstructedCallResultRoles(recipe)
				ready = ready && current
			}
			if recipe.callResult.getResult != nil && recipe.callResult.getResult.role != "body" {
				if recipe.callResult.getResult.frameworkResume != nil {
					ready = ready && work.frameworkEffectBodiesCurrent(work.memberNodes[state.key.declaration], state.memberActivations) && work.frameworkGetObservationCurrent(state.frameworkGetObservation)
				}
				ready = ready && work.memberCoverageObserved[state.key] == work.operationGeneration
				if recipe.callResult.getResult.role == "effects" {
					consumer := work.memberNodes[state.key.declaration]
					for _, call := range work.operationFacts[consumer].staged.calls {
						if call.invocation.operation != state.key.operation || !originalStagedGetterCall(call) {
							continue
						}
						producer, known := work.memberNodes[call.invocation.declaration]
						dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, stagedDeclarationCallEdge(work.operationFacts[consumer].summary.ID, call.invocation)}]
						ready = ready && known && dependency != nil && !dependency.invalid && !dependency.projectionPending && producer < len(work.stagedRevisions) && work.operationFacts[producer].staged.ready && dependency.consumed == work.stagedRevisions[producer]
					}
				}
			} else if recipe.callResult.binding != nil {
				ready = ready && state.resultProjection != nil && state.resultProjection.locallyRepresented
			} else if body := state.resultBody; body != nil {
				consumer := work.memberNodes[state.key.declaration]
				dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, body.edge}]
				ready = ready && dependency != nil && !dependency.invalid && !dependency.projectionPending && body.producer < len(work.operationFacts) && body.producer < len(work.stagedRevisions) && work.operationFacts[body.producer].staged.ready && dependency.consumed == work.stagedRevisions[body.producer]
			} else if recipe.callResult.nativeDescriptor != nil {
				ready = ready && work.nativeDescriptorResultCurrent(recipe)
			} else if recipe.callResult.frameworkView != nil {
				ready = ready && recipe.callResult.generation == work.operationGeneration
			} else if recipe.callResult.operand == nil && !recipe.callResult.nativeCall && recipe.callResult.constructedRoot.producer.operation == nil {
				ready = false
			}
		}
		if recipe.constructed != nil && state.key == constructedMemberRequest(recipe.constructed, "method-lookup").producer {
			ready = ready && work.constructedMethodGetCurrent(recipe)
		}
		if recipe.constructedDisposition != nil && len(recipe.constructedDisposition.resultAssignments) != 0 {
			ready = ready && work.constructedAssignmentResultsCurrent(recipe)
		}
		if recipe.nativeGet != nil && recipe.nativeGet.descriptorRead != nil && recipe.key == nativeRootDebtRequest(recipe.nativeGet, "algorithm").producer {
			ready = ready && work.descriptorEffectsEnumerationCurrent(sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}, recipe) && work.nativeEffectsGetCurrent(recipe.nativeGet) && work.frameworkEffectBodiesCurrent(work.memberNodes[state.key.declaration], state.memberActivations)
		}
		if recipe.frameworkEffects != nil {
			ready = ready && recipe.frameworkEffects.generation == work.operationGeneration && state.resultSourceRequested && work.frameworkEffectBodiesCurrent(work.memberNodes[state.key.declaration], state.memberActivations)
		}
		if state.frameworkInputsRequested {
			ready = ready && state.frameworkInputsComplete && work.frameworkEffectBodiesCurrent(work.memberNodes[state.key.declaration], state.frameworkInputActivations)
		}
		if recipe.memberSource != nil {
			if recipe.memberSource.protocolSource != nil && recipe.memberSource.protocolSource.constructedLookup != nil {
				ready = ready && work.constructedLookupSourceCurrent(recipe)
			}
			if t := recipe.memberSource.targetSource; t != nil && (t.keySource != nil || t.resultSupport != nil) {
				ready = ready && (work.reflectiveKeyCurrent(recipe) || work.reflectiveBirthCurrent(recipe))
			}
			ready = ready && recipe.memberSource.generation == work.operationGeneration
			if recipe.memberSource.call != nil {
				// Every retained callable needs its original canonical body edge.
				// An unavailable body cannot disappear through an empty edge list.
				for _, alternative := range recipe.memberSource.call.values {
					target, known := work.memberNodes[alternative.endpoint.expression]
					required := false
					for _, body := range state.memberActivations {
						required = required || known && body.producer == target
					}
					ready = ready && required
				}
				consumer := work.memberNodes[recipe.memberSource.request.consumer]
				for _, body := range state.memberActivations {
					dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, body.edge}]
					ready = ready && dependency != nil && !dependency.invalid && !dependency.projectionPending && body.producer < len(work.stagedRevisions) && work.operationFacts[body.producer].staged.ready && dependency.consumed == work.stagedRevisions[body.producer]
				}
			}
			if recipe.memberSource.originalGetMutation != nil || recipe.memberSource.reflectiveContribution != nil || recipe.memberSource.descriptorStrong != nil || recipe.memberSource.targetSource != nil || recipe.memberSource.coverage != nil || recipe.memberSource.call != nil || recipe.memberSource.getEffects != nil || recipe.memberSource.protocolSource != nil && (recipe.memberSource.protocolSource.external != nil || recipe.memberSource.protocolSource.get != nil || recipe.memberSource.protocolSource.evaluation != nil) {
				ready = ready && state.memberCoverageObserved
			}
		}
		if recipe.memberSource != nil && recipe.memberSource.getEffects != nil && recipe.memberSource.getEffects.descriptor != nil {
			ready = ready && work.descriptorRecordGetCurrent(recipe)
		}
		if recipe.mapEntry != nil {
			ready = ready && recipe.mapEntry.generation == work.operationGeneration
		}
		if recipe.mapProtocol != nil {
			ready = ready && recipe.mapProtocol.generation == work.operationGeneration
			if recipe.mapProtocol.writerSource != nil {
				ready = ready && state.mapSourceObserved
			}
		}
		if writer := work.operationRecipes[state.key].writer; writer != nil {
			ready = ready && writer.generation == work.operationGeneration
			if writer.callable {
				ready = ready && work.writerProjectionInvocationsCovered(state)
			}
		}
		if proof := work.operationRecipes[state.key].constructedDisposition; proof != nil {
			ready = ready && proof.generation == work.operationGeneration
			if consumer, known := work.memberNodes[proof.request.consumer]; !known || !work.operationFacts[consumer].staged.ready {
				ready = false
			} else if proof.role == "eager-inputs" {
				for key, dependency := range work.stagedRequired {
					if key.consumer == consumer && (dependency.invalid || dependency.projectionPending || !work.operationFacts[dependency.producer].staged.ready || dependency.producer >= len(work.stagedRevisions) || dependency.consumed != work.stagedRevisions[dependency.producer]) {
						ready = false
					}
				}
			}
		}
		if recipe := work.operationRecipes[state.key]; recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
			ready = ready && work.getPreparationCurrent(recipe.memberSource.request)
		}
		if recipe := work.operationRecipes[state.key]; recipe.nativeGet != nil && state.key.selector.field == "callee-get" {
			selected := state.nativeCallee != nil && state.nativeCallee.generation == work.operationGeneration && validStagedNativeCalleeEffects(*state.nativeCallee, recipe.nativeGet)
			sources := state.nativeMemberEffects != nil && state.nativeMemberEffects.generation == work.operationGeneration && validNativeMemberEffects(state.nativeMemberEffects, recipe.nativeGet)
			ready = ready && (selected || sources)
		}
		if recipe := work.operationRecipes[state.key]; recipe.nativeGet != nil && state.key.selector.field == "eager-target" {
			if recipe.nativeGet.targetSource.producer.operation != nil {
				ready = ready && validNativeTargetSource(recipe.nativeGet)
			} else {
				ready = ready && state.nativeTarget != nil && state.nativeTarget.generation == work.operationGeneration && validStagedNativeTargetEffects(*state.nativeTarget, recipe.nativeGet)
			}
		}
		if recipe := work.operationRecipes[state.key]; recipe.nativeGet != nil && state.key.selector.field == "eager-inputs" && recipe.nativeGet.eager != nil && len(recipe.nativeGet.eager.calls) != 0 {
			ready = ready && state.eagerRegistered && len(state.eagerCalls) == len(recipe.nativeGet.eager.calls)
			for _, requirement := range state.eagerCalls {
				ready = ready && requirement.inputs != nil && requirement.inputs.delivered && requirement.ready && requirement.transferred
			}
		}
		for _, input := range state.moduleInputs {
			if input.producer < 0 {
				_, bound := work.memberNodes[input.declaration]
				ready = ready && admission && !bound && input.declaration != nil && runtimeModuleEvaluation(input.declaration) && ast.GetSourceFileOfNode(input.declaration) != ast.GetSourceFileOfNode(state.key.declaration)
				continue
			}
			consumer := work.memberNodes[state.key.declaration]
			dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, input.edge}]
			moduleReady := !work.operationFacts[input.producer].staged.operationsPending || work.stagedBindingModuleInitializerAccounted(state, work.operationRecipes[state.key], input)
			ready = ready && dependency != nil && !dependency.invalid && !dependency.projectionPending && input.producer < len(work.stagedRevisions) && work.operationFacts[input.producer].staged.ready && moduleReady && dependency.consumed == work.stagedRevisions[input.producer]
		}
		for _, getter := range state.getters {
			if !getter.bodyReady || getter.receiverPending || getter.selectionPending || !getter.bodyTransferred {
				ready = false
			}
		}
		for _, dependency := range state.dependencies {
			id := dependency.producer
			if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				ready = false
				continue
			}
			child := &work.operations[id.index]
			subscriber := child.subscribers[sourceStagedOperationConsumer{dependency.request.consumer, dependency.request.edge}]
			if subscriber == nil || subscriber.blocked || subscriber.applied != child.revision {
				ready = false
			}
			parents[id.index] = append(parents[id.index], index)
		}
		closed[index] = ready
	}
	return closeOperationConjunction(closed, parents)
}

// closeOperationConjunction is shared by delivery closure and passive source
// adoption. It preserves locally represented cycles and rejects every failed exit.
func closeOperationConjunction(closed []bool, parents [][]int) []bool {
	var failed []int
	for index, ready := range closed {
		if !ready {
			failed = append(failed, index)
		}
	}
	for head := 0; head < len(failed); head++ {
		for _, parent := range parents[failed[head]] {
			if closed[parent] {
				closed[parent] = false
				failed = append(failed, parent)
			}
		}
	}
	return closed
}

// notifyOperationSubscribers invalidates graph publication before delivering a
// changed prefix. Revisions with no new atoms still dirty the existing fact
// owner. No body, query or saved acquisition is replayed by this notification.
func (work *callableEffectWork) notifyOperationSubscribers(state *sourceStagedOperationState) {
	work.afterNativeWriterCapabilityObservation(state.key)
	work.queueOperationDelivery(state)
	for _, key := range state.subscriberOrder {
		consumer, found := work.memberNodes[key.consumer]
		if !found || consumer >= len(work.operationFacts) {
			continue
		}
		work.operationFacts[consumer].staged.operationsPending = true
		work.operationFacts[consumer].staged.settled = false
		if consumer < len(work.dirty) {
			work.dirty[consumer] = true
			work.stagedContributionChanged(consumer)
		}
	}
}

// queueOperationDelivery coalesces value and contextual source revisions on the
// existing extraction queue. Source subscribers acknowledge Effects dispositions
// even when the revision carries no value or changed environment contribution.
// Work carries only graph identity, never a callback or source query. Identical
// publication and repeated subscription schedule no additional delivery.
func (work *callableEffectWork) queueOperationDelivery(state *sourceStagedOperationState) {
	id, registered := work.operationIDs[state.key]
	if !registered || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || &work.operations[id.index] != state || work.operations[id.index].key != state.key || state.deliveryQueued || state.revision == 0 {
		return
	}
	// Enrollment already validated the full typed request. Contextual readers
	// legitimately differ from a producer's own request, so retain that original
	// subscriber rather than reinterpreting its factory at notification time.
	subscribed := false
	for _, key := range state.subscriberOrder {
		if subscriber := state.subscribers[key]; subscriber != nil && subscriber.request.producer == state.key && subscriber.request.consumer == key.consumer && subscriber.request.edge == key.edge {
			subscribed = true
			break
		}
	}
	if !subscribed {
		return
	}
	state.deliveryQueued = true
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{operation: id, delivery: true})
}

func (work *callableEffectWork) deliverOperationSubscribers(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	for _, key := range state.subscriberOrder {
		subscriber := state.subscribers[key]
		delivery, ok := work.consumeOperation(id, subscriber.request)
		if !ok {
			continue
		}
		consumer := work.memberNodes[key.consumer]
		use := sourceStagedOperationUse{request: subscriber.request}
		for _, sourceUse := range facts[consumer].staged.operationUses {
			if sameOperationRequest(sourceUse.request, subscriber.request) {
				use = sourceUse
				break
			}
		}
		if !work.applyOperationDelivery(facts, consumer, use, delivery.delta, owner) {
			subscriber.blocked = true
		}
		if !subscriber.blocked {
			priorApplied := subscriber.applied
			subscriber.applied = delivery.revision
			work.afterWriterSourcePrerequisite(id, subscriber.request)
			work.afterWriterSourceDelivery(facts, id, subscriber.request)
			if priorApplied != delivery.revision {
				work.notifyMemberInputWaiters(id)
				work.notifyNativeEagerInputWaiters(id)
				work.afterDescriptorTargetPrerequisite(id, subscriber.request)
				work.afterNativeWriterCapabilityDelivery(subscriber.request)
				work.afterReflectiveResultDelivery(subscriber.request)
				work.afterReflectiveKeyDelivery(id, subscriber.request)
				work.afterNativeEagerKeyDelivery(subscriber.request)
				work.afterHasFreshTargetDelivery(id, subscriber.request)
				work.afterStagedModuleArgumentDelivery(facts, id, subscriber.request)
				work.afterNativeInputBindingDelivery(id, subscriber.request)
			}
		}
	}
}

func appendOperationEffect(fact *callableFacts, effect EnvironmentEffectSource) {
	for _, prior := range fact.summary.DirectEffectSources {
		if sameOperationEffect(prior, effect) {
			return
		}
	}
	effect.Path = append([]string(nil), effect.Path...)
	fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, effect)
}

func appendOperationRelative(fact *callableFacts, demand sourceRelativeInvokedInput) {
	for _, prior := range fact.staged.invoked {
		if prior == demand {
			return
		}
	}
	fact.staged.invoked = append(fact.staged.invoked, demand)
	fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, relativeInvokedEffect(demand, fact.summary.Name))
}

// applyOperationRelative uses only the authenticated descriptive binder edge.
// Unknown is an independent contribution, while a pending endpoint or unsupported
// role leaves the subscriber unacknowledged. Creation does not issue this demand.
func (work *callableEffectWork) applyOperationRelative(facts []callableFacts, consumer int, use sourceStagedOperationUse, demand sourceRelativeInvokedInput) bool {
	fact := &facts[consumer]
	if demand.role.declaration == fact.node && validOperationRelativeRole(demand.role, fact.node) {
		appendOperationRelative(fact, demand)
		return true
	}
	edge := use.request.inputs
	if edge == nil || !edge.delivered || edge.relative.declaration != demand.role.declaration {
		return false
	}
	plan := substituteSourceRelativeInvokedInput(edge.relative, demand.role, nil)
	handled := plan.unsupported == relativeInputsSupported
	for _, binding := range plan.bindings {
		handled = handled && len(binding.pending) == 0
		for _, endpoint := range binding.sources {
			if len(endpoint.projection) != 0 {
				handled = false
				continue
			}
			if endpoint.kind == relativeEndpointRole && validOperationRelativeRole(endpoint.role, fact.node) {
				mapped := demand
				mapped.role = endpoint.role
				appendOperationRelative(fact, mapped)
			} else if endpoint.kind == relativeEndpointExpression && endpoint.creation == nil && endpoint.returning == nil && isWriterInputCallable(endpoint.expression) {
				if producer, ok := work.memberNodes[endpoint.expression]; ok {
					work.operationInvocation(facts, consumer, producer, demand.origin, demand.cut)
				} else {
					handled = false
				}
			} else if endpoint.kind != relativeEndpointUndefined {
				handled = false
			}
		}
		if binding.unknown {
			appendOperationEffect(fact, environmentSource("unknown", "unresolved staged invoked input alternative", fact.summary.Name))
		}
	}
	return handled
}

// applyOperationDelivery transfers every known contribution even if an unrelated
// channel remains unsupported. The false result blocks ACK/publication. Effects
// and actual invocations are independent of dormant exposures and residuals.
func (work *callableEffectWork) applyOperationDelivery(facts []callableFacts, consumer int, use sourceStagedOperationUse, delta sourceStagedOperationDelta, owner *executableBodyOwner) bool {
	if recipe := work.operationRecipes[use.request.producer]; recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return work.deliverStagedGetPreparation(use, delta)
	}
	fact := &facts[consumer]
	if recipe := work.operationRecipes[use.request.producer]; work.validNativeFieldGetReading(recipe, use.request) || work.validNativeFieldCreateReading(recipe, use.request) {
		return use.call == nil && use.installed == nil && len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals)+len(delta.effects) == 0
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.mutationData != nil {
		return work.applyFieldMutationDataDelivery(facts, consumer, use, delta, owner)
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.installedMutationRHS != nil {
		return work.installedMutationRHSCurrent(recipe) && validInstalledMutationRHSReading(recipe, use.request) && use.call == nil && use.installed == nil
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.installedMember != nil {
		if !validInstalledMemberReading(recipe, use.request) || use.call != nil || use.installed != nil || len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals) != 0 {
			return false
		}
		for _, effect := range delta.effects {
			appendOperationEffect(fact, effect)
		}
		return true
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.descriptorTarget != nil {
		return validDescriptorTargetRecipe(recipe) && sameOperationRequest(use.request, recipe.descriptorTarget.request) && use.call == nil && use.installed == nil && len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.effects)+len(delta.residuals) == 0
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.entryLaw != nil && !sameOperationRequest(use.request, recipe.entryLaw.request) {
		return work.validHasFreshTargetReading(recipe, use.request) && use.call == nil && use.installed == nil && len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.effects)+len(delta.residuals) == 0
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.nativeGet != nil && recipe.nativeGet.inputInvocation != nil {
		return work.deliverNativeInputObserver(use, delta)
	}
	if source := work.operationRecipes[use.request.producer].moduleArgument; source != nil {
		return work.validModuleArgumentReading(work.operationRecipes[use.request.producer], use.request) && use.call == nil && use.installed == nil && len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.effects)+len(delta.residuals) == 0
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.memberSource != nil && recipe.memberSource.targetSource != nil {
		return work.deliverStagedReflectiveTarget(facts, use, delta)
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.declarationCall != nil {
		if !validStagedDeclarationCallEffectsRecipe(recipe) || recipe.declarationCallGeneration != work.operationGeneration || !ambientArgumentReadsCurrent(recipe.declarationCall.ambientReads, work.operationGeneration) || !sameOperationRequest(use.request, stagedDeclarationCallEffectsRequest(recipe.key.operation, recipe.key.declaration)) || use.call != nil || use.installed != nil || len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals) != 0 {
			return false
		}
		// Delivery can contain only a new subset of the authenticated source
		// donors. Describing those Effects does not pay Call, BODY or DATA debt.
		for _, effect := range delta.effects {
			matched := false
			for _, original := range recipe.delta.effects {
				matched = matched || sameOperationEffect(original, effect)
			}
			if !matched {
				return false
			}
		}
		for _, effect := range delta.effects {
			appendOperationEffect(fact, effect)
		}
		return true
	}
	if source := work.operationRecipes[use.request.producer].constructionEffects; source != nil {
		return sameOperationRequest(use.request, source.request) && use.call == nil && use.installed == nil && len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.effects)+len(delta.residuals) == 0
	}
	if source := work.operationRecipes[use.request.producer].assignment; source != nil {
		if !sameOperationRequest(use.request, source.request) || use.call != nil || use.installed != nil || len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals) != 0 {
			return false
		}
		for _, effect := range delta.effects {
			appendOperationEffect(fact, effect)
		}
		return true
	}
	if source := work.operationRecipes[use.request.producer].hasInstance; source != nil {
		if !sameOperationRequest(use.request, source.request) || use.call != nil || use.installed != nil || len(delta.invoked)+len(delta.relative)+len(delta.residuals) != 0 {
			return false
		}
		for _, effect := range delta.effects {
			appendOperationEffect(fact, effect)
		}
		return source.role == "lhs-value" || len(delta.exposures) == 0
	}
	if result := work.operationRecipes[use.request.producer].callResult; result != nil {
		if result.getResult != nil && result.getResult.role != "body" && use.request.producer.kind == relativeDemandEffects {
			if len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals) != 0 {
				return false
			}
			for _, effect := range delta.effects {
				appendOperationEffect(fact, effect)
			}
			return true
		}
		return work.applyStagedCallResultData(use, delta)
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.memberSource != nil && recipe.memberSource.nativeFieldGet != nil {
		return use.call == nil && use.installed == nil && sameOperationRequest(use.request, recipe.memberSource.request) && work.nativeFieldSourceCurrent(recipe) && len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals)+len(delta.effects) == 0
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.memberSource != nil && recipe.memberSource.originalGetMutationInterest != nil {
		return use.call == nil && use.installed == nil && sameOperationRequest(use.request, recipe.memberSource.request) && work.originalGetMutationInterestCurrent(recipe) && len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals)+len(delta.effects) == 0
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.memberSource != nil && recipe.memberSource.originalGetMutation != nil {
		return use.call == nil && use.installed == nil && sameOperationRequest(use.request, recipe.memberSource.request) && work.originalGetMutationCurrent(recipe) && len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals)+len(delta.effects) == 0
	}
	if source := work.operationRecipes[use.request.producer].memberSource; source != nil && source.call != nil {
		if _, native := work.nativeObserverInputAssociation(use.request); native {
			return work.deliverNativeInputObserver(use, delta)
		}
	}
	if source := work.operationRecipes[use.request.producer].memberSource; source != nil && (source.call != nil || source.getEffects != nil) {
		for _, effect := range delta.effects {
			appendOperationEffect(&facts[consumer], effect)
		}
		return len(delta.exposures)+len(delta.invoked)+len(delta.relative)+len(delta.residuals) == 0
	}
	if source := work.operationRecipes[use.request.producer].memberSource; source != nil && !source.candidate.runtimeUnknown {
		return work.applyStagedMemberDataDelivery(use, delta)
	}
	if work.operationRecipes[use.request.producer].writer != nil {
		return work.applyWriterProjectionDelivery(use, delta)
	}
	if source := work.operationRecipes[use.request.producer].constructed; source != nil && (use.request.reading != (sourceStagedOperationKey{}) || source.kind == sourceNativeWeakMapGetEffect && use.request.producer == constructedMemberRequest(source, "member-result").producer) {
		return work.applyConstructedPayloadDelivery(use, delta)
	}
	if _, role := fieldSourceParent(use.request); role && use.request.producer.kind == relativeDemandDirectExposure {
		return work.applyFieldValueSourceDelivery(facts, consumer, use, delta)
	}
	if recipe := work.operationRecipes[use.request.producer]; recipe.nativeGet != nil && recipe.key.kind == relativeDemandDirectExposure && (use.installed == nil || use.call != nil) {
		return false // Stored field exposure alone cannot authorize a later Call.
	}
	handled := true
	if use.installed != nil {
		handled = work.applyInstalledFieldExposure(facts, use, delta, owner)
	}
	for _, effect := range delta.effects {
		appendOperationEffect(fact, effect)
	}
	for _, demand := range delta.relative {
		handled = work.applyOperationRelative(facts, consumer, use, demand) && handled
	}
	for _, invoked := range delta.invoked {
		producer, found := work.memberNodes[invoked.declaration]
		if !found || invoked.inputs != nil || invoked.alternative.creating != nil || !sameOperationEndpoint(invoked.alternative.endpoint, sourceRelativeEndpoint{}) {
			handled = false
			continue
		}
		work.operationInvocation(facts, consumer, producer, invoked.operation, use.request.cut)
	}
	if use.call != nil {
		for _, alternative := range delta.exposures {
			if alternative.creating != nil {
				fact.staged.operationCreatingDeliveries++
			}
			endpoint := alternative.endpoint
			if len(endpoint.projection) != 0 {
				handled = false
				continue
			}
			if endpoint.kind == relativeEndpointRole {
				demand := sourceRelativeInvokedInput{kind: relativeDemandEffects, role: endpoint.role, origin: use.call, cut: sourceRelativeCut{operation: use.call, use: use.call, reading: use.call}}
				handled = work.applyOperationRelative(facts, consumer, use, demand) && handled
				continue
			}
			producer, found := work.memberNodes[endpoint.expression]
			if endpoint.kind != relativeEndpointExpression || !found {
				handled = false
				continue
			}
			if work.operationRecipes[use.request.producer].returning != nil {
				if owner == nil || !work.registerReturnedInvocation(facts, consumer, alternative, use.call, owner) {
					handled = false
					continue
				}
			} else {
				work.operationInvocation(facts, consumer, producer, use.call, use.request.cut)
			}
		}
	}
	for _, residual := range delta.residuals {
		if residual.mutation != nil {
			handled = work.applyOperationMutation(facts, consumer, use, residual.mutation) && handled
			continue
		}
		if use.call == nil && use.request.producer.kind != relativeDemandEffects {
			continue
		}
		if residual.role.kind != relativeRoleUnknown {
			operation := use.call
			if operation == nil {
				operation = residual.operation
			}
			if !ast.IsCallExpression(operation) {
				handled = false
				continue
			}
			demand := sourceRelativeInvokedInput{kind: relativeDemandEffects, role: residual.role, origin: operation, cut: use.request.cut}
			handled = work.applyOperationRelative(facts, consumer, use, demand) && handled
		} else {
			effect := environmentSource("unknown", "unresolved staged operation alternative", fact.summary.Name)
			effect.Opaque, effect.provenanceIncomplete = true, true
			appendOperationEffect(fact, effect)
		}
	}
	fact.staged.operationDeliveries += uint64(operationDeltaSize(delta))
	return handled
}
