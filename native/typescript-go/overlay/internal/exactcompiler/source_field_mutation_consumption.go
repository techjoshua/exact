package exactcompiler

import "fmt"

func installedMutationDataReading(source *sourceFieldMutationData, getter sourceStagedGetterRequirement) sourceStagedOperationRequest {
	request := source.request
	request.consumer = getter.demand.request.consumer
	request.edge = fmt.Sprintf("%s:installed-mutation:%s", source.request.edge, getter.edge)
	request.use = getter.demand.request.use
	request.cut = getter.installed.get.cut
	request.inputs = getter.inputs
	request.reading = getter.demand.request.producer
	return request
}

// installedMutationDataMembership follows declared relationships only: the
// installed Value exposure → original own/prototype role → declared DATA child.
// It never discovers another population, invents a request or reads Effects as
// stored-value provenance.
func (work *callableEffectWork) installedMutationDataMembership(source *sourceFieldMutationData, getter sourceStagedGetterRequirement) bool {
	if source == nil || getter.installed == nil || getter.installed.exposure.epoch != work.operationEpoch || getter.installed.exposure.index == 0 || int(getter.installed.exposure.index) >= len(work.operations) {
		return false
	}
	parent, field := fieldSourceParent(source.field)
	if !field || parent.producer != work.operations[getter.installed.exposure.index].key || !operationContainsRequest(work.operationRecipes[source.field.producer].delta.required, source.request) {
		return false
	}
	exposure := work.operationRecipes[parent.producer]
	return operationContainsRequest(exposure.delta.required, source.field)
}

func (work *callableEffectWork) validFieldMutationDataReading(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	if !validFieldMutationDataRecipe(recipe) {
		return false
	}
	source := recipe.mutationData
	if sameOperationRequest(source.request, request) {
		return request.inputs == nil
	}
	id, adopted := work.operationIDs[request.reading]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || request.inputs == nil || !request.inputs.delivered {
		return false
	}
	for _, getter := range work.operations[id.index].getters {
		if getter.inputs == request.inputs && getter.bodyTransferred && getter.bodyReady && getter.installed != nil && work.installedMutationDataMembership(source, getter) && work.originalGetMutationFieldLinksInstalled(recipe, getter) && sameSourceRelativeInputEnvelope(getter.inputs.request, getter.inputs.relative) && sameOperationRequest(request, installedMutationDataReading(source, getter)) {
			return true
		}
	}
	return false
}

// installedMutationChildren visits only actual required edges retained by the
// original Value owner. SOURCE membership/currentness and per-use delivery are
// distinct; no extra field population or side ledger is built here.
func (work *callableEffectWork) installedMutationChildren(getter sourceStagedGetterRequirement, visit func(sourceStagedOperationRecipe)) {
	guard := getter.installed
	if guard == nil || guard.exposure.epoch != work.operationEpoch || guard.exposure.index == 0 || int(guard.exposure.index) >= len(work.operations) {
		return
	}
	exposure := work.operationRecipes[work.operations[guard.exposure.index].key]
	for _, role := range exposure.delta.required {
		if _, field := fieldSourceParent(role); !field || role.producer.kind != relativeDemandDirectExposure {
			continue
		}
		for _, request := range work.operationRecipes[role.producer].delta.required {
			child := work.operationRecipes[request.producer]
			if child.mutationData != nil && sameOperationRequest(child.mutationData.request, request) && work.installedMutationDataMembership(child.mutationData, getter) {
				visit(child)
			}
		}
	}
}

// forwardInstalledMutationData runs after the existing original Get/BODY/input
// owner is ready. It forwards that actual interest rather than appending child
// atoms to a sealed parent DATA prefix. Missing inputs/BODY remain unpaid and
// do not create a permanently blocked subscriber as a substitute for waiting.
func (work *callableEffectWork) forwardInstalledMutationData(facts []callableFacts, getter sourceStagedGetterRequirement) bool {
	if getter.installed == nil || getter.inputs == nil || !getter.inputs.delivered || !getter.bodyTransferred || !getter.bodyReady || !sameSourceRelativeInputEnvelope(getter.inputs.request, getter.inputs.relative) {
		return false
	}
	consumer, known := work.memberNodes[getter.demand.request.consumer]
	producer, body := work.memberNodes[getter.declaration]
	if !known || !body || producer < 0 || producer >= len(facts) || producer >= len(work.stagedRevisions) {
		return false
	}
	required := work.stagedRequired[sourceStagedDependencyKey{consumer, getter.edge}]
	if required == nil || required.invalid || required.projectionPending || !facts[producer].staged.ready || required.consumed != work.stagedRevisions[producer] {
		return false
	}
	changed := false
	work.installedMutationChildren(getter, func(recipe sourceStagedOperationRecipe) {
		request := installedMutationDataReading(recipe.mutationData, getter)
		if recipe.mutationData.external != nil && !work.externalMutationReadingReady(facts, consumer, getter, recipe.mutationData) {
			return
		}
		id, adopted := work.operationIDs[request.producer]
		if adopted && id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
			// This existing fixed-point consumer has genuine delivered inputs,
			// BODY transfer and the current consumed canonical summary. Those
			// can advance without changing its field Effects producer revision.
			if !work.operations[id.index].invalid && !work.operations[id.index].delta.extracted {
				retry := recipe.mutationData.installation != nil
				if recipe.mutationData.getSource != nil || recipe.mutationData.getInterest != nil {
					retry = work.fieldMutationBodyRetryChanged(facts, id, recipe.mutationData)
				}
				if retry {
					before := work.operations[id.index].revision
					work.prepareFieldMutationData(facts, id)
					// Preparation can append states; retain only the immutable ID.
					changed = changed || work.operations[id.index].revision != before
				}
			}
			if sub := work.operations[id.index].subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]; sub != nil && sameOperationRequest(sub.request, request) {
				return
			}
		}
		installed := getter.installed.get
		if work.registerOperationUse(facts, sourceStagedOperationUse{request: request, installed: &installed}) {
			changed = true
		}
	})
	return changed
}

// installedMutationDataCurrent is part of final reader readiness. It asks only
// local registered CURRENT/APPLIED facts; transitive closure remains with the
// one outer solver. A parent's descriptive local X never pays these readers.
func (work *callableEffectWork) installedMutationDataCurrent(state *sourceStagedOperationState) bool {
	ready := true
	for _, getter := range state.getters {
		if getter.installed == nil {
			continue
		}
		work.installedMutationChildren(getter, func(recipe sourceStagedOperationRecipe) {
			if getter.inputs == nil || !getter.inputs.delivered || !getter.bodyTransferred || !getter.bodyReady {
				ready = false
				return
			}
			request := installedMutationDataReading(recipe.mutationData, getter)
			id, adopted := work.operationIDs[request.producer]
			if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !work.validFieldMutationDataReading(recipe, request) || !work.fieldMutationDataCurrent(recipe) {
				ready = false
				return
			}
			child := &work.operations[id.index]
			sub := child.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
			if child.invalid || !child.delta.extracted || child.revision == 0 || sub == nil || sub.blocked || !sameOperationRequest(sub.request, request) || sub.applied != child.revision {
				ready = false
			}
		})
	}
	return ready
}

func (work *callableEffectWork) applyFieldMutationDataDelivery(facts []callableFacts, consumer int, use sourceStagedOperationUse, delta sourceStagedOperationDelta, owner *executableBodyOwner) bool {
	recipe := work.operationRecipes[use.request.producer]
	if !work.validFieldMutationDataReading(recipe, use.request) || !work.fieldMutationDataCurrent(recipe) || use.call != nil || len(delta.invoked)+len(delta.relative)+len(delta.effects) != 0 {
		return false
	}
	if sameOperationRequest(use.request, recipe.mutationData.request) {
		return use.installed == nil
	}
	if use.installed == nil {
		return false
	}
	handled := true
	if len(delta.exposures) != 0 {
		parent, _ := fieldSourceParent(recipe.mutationData.field)
		// Stored value DATA remains dormant. Only a get-slot value is a getter
		// candidate at this actual installed Get, and uses its original BODY owner.
		if parent.producer.selector.field == "get" {
			readerID := work.operationIDs[use.request.reading]
			demand, issued := work.installedFieldGetReaderDemand(facts, readerID, owner)
			if !issued {
				return false
			}
			installedSource := work.operationRecipes[parent.producer].nativeGet
			if installedSource == nil {
				return false
			}
			rootID, rooted := work.operationIDs[installedSource.request.producer]
			exposureID := work.operationIDs[recipe.key]
			if !rooted {
				return false
			}
			for _, alternative := range delta.exposures {
				handled = work.applyInstalledGetterAlternative(facts, use, demand, readerID, rootID, exposureID, alternative, owner) && handled
			}
		}
	}
	for _, residual := range delta.residuals {
		if residual.mutation == nil {
			handled = false
			continue
		}
		handled = work.applyOperationMutation(facts, consumer, use, residual.mutation) && handled
	}
	return handled
}

// sourceFieldMutationBodyRetry coalesces only canonical BODY preparation attempts.
// Its clock and snapshots never stand for DATA, currentness or subscriber APPLIED.
// Operation prerequisite notifications prepare independently of this cache.
type sourceFieldMutationBodyRetry struct {
	reader           sourceStagedOperationID
	request          sourceStagedOperationRequest
	generation       *projectGeneration
	sourceGeneration *projectGeneration
	transfers        uint64
	bodies           []sourceFieldMutationBodySnapshot
}

type sourceFieldMutationBodySnapshot struct {
	inputs                                      *sourceRelativeInputEdge
	installed                                   *sourceStagedInstalledGetter
	edge                                        string
	producer                                    int
	delivered, ready, transferred, summaryReady bool
	dependency                                  *sourceStagedDependency
	consumed, revision                          uint64
	invalid, projectionPending                  bool
}

// fieldMutationBodyRetryChanged reads only the actual SOURCE reader's retained
// getter/input/summary metadata. The enclosing installed getter may be different.
// Stable checks reuse the slice and never walk a BODY, table, AST or query.
func (work *callableEffectWork) fieldMutationBodyRetryChanged(facts []callableFacts, id sourceStagedOperationID, data *sourceFieldMutationData) bool {
	// Factories retain the exact origin first; monotone refinements only append.
	// Reuse those authenticated request keys rather than format them each drain.
	declared := work.operationRecipes[work.operations[id.index].key]
	if len(declared.delta.required) == 0 {
		return false
	}
	sourceRequest := declared.delta.required[0]
	source := data.getSource
	if data.getInterest != nil {
		interestRecipe := work.operationRecipes[sourceRequest.producer]
		interest := interestRecipe.memberSource
		if interest == nil || interest.originalGetMutationInterest == nil || !sameOriginalGetMutationInterest(interest.originalGetMutationInterest, data.getInterest) || len(interestRecipe.delta.required) != 2 {
			return false
		}
		source = interest.originalGetMutationInterest.source
		// Bound interest requirements are exactly original origin then SOURCE.
		sourceRequest = interestRecipe.delta.required[1]
	}
	if source == nil {
		return false // Only a genuine SOURCE publisher can bind a passive interest.
	}
	sourceRecipe := work.operationRecipes[sourceRequest.producer]
	canonical := sourceRecipe.memberSource
	if canonical == nil || canonical.originalGetMutation == nil || !sameOriginalGetMutationIdentity(canonical.originalGetMutation, source) || len(sourceRecipe.delta.required) == 0 {
		return false
	}
	// Original SOURCE requirements retain their real Effects reader first;
	// the record's lexical parent remains metadata, never executable debt.
	readerRequest := sourceRecipe.delta.required[0]
	reader := work.operationIDs[readerRequest.producer]
	if reader.epoch != work.operationEpoch || reader.index == 0 || int(reader.index) >= len(work.operations) {
		return false
	}
	attempt := work.operations[id.index].mutationBodyRetry
	changed := attempt == nil || attempt.reader != reader || attempt.request != readerRequest || attempt.generation != work.operationGeneration || attempt.sourceGeneration != canonical.originalGetMutation.generation || attempt.transfers != work.mutationTransferGeneration
	count := 0
	for _, getter := range work.operations[reader.index].getters {
		if getter.installed == nil {
			continue // This output fold consumes installed BODY owners only.
		}
		if attempt == nil {
			attempt = &sourceFieldMutationBodyRetry{}
			work.operations[id.index].mutationBodyRetry = attempt
		}
		producer, found := work.memberNodes[getter.declaration]
		snapshot := sourceFieldMutationBodySnapshot{inputs: getter.inputs, installed: getter.installed, edge: getter.edge, producer: producer, ready: getter.bodyReady, transferred: getter.bodyTransferred}
		if !found {
			snapshot.producer = -1
		}
		if getter.inputs != nil {
			snapshot.delivered = getter.inputs.delivered
		}
		if found && producer >= 0 && producer < len(facts) && producer < len(work.stagedRevisions) {
			snapshot.summaryReady, snapshot.revision = facts[producer].staged.ready, work.stagedRevisions[producer]
		}
		if consumer, known := work.memberNodes[getter.demand.request.consumer]; known {
			snapshot.dependency = work.stagedRequired[sourceStagedDependencyKey{consumer, getter.edge}]
			if dependency := snapshot.dependency; dependency != nil {
				snapshot.consumed, snapshot.invalid, snapshot.projectionPending = dependency.consumed, dependency.invalid, dependency.projectionPending
			}
		}
		if count == len(attempt.bodies) {
			attempt.bodies = append(attempt.bodies, snapshot)
			changed = true
		} else if attempt.bodies[count] != snapshot {
			attempt.bodies[count] = snapshot
			changed = true
		}
		count++
	}
	if count == 0 {
		return false // There is no actual canonical BODY consumer to retry.
	}
	changed = changed || count != len(attempt.bodies)
	attempt.reader, attempt.request, attempt.generation, attempt.sourceGeneration, attempt.transfers = reader, readerRequest, work.operationGeneration, canonical.originalGetMutation.generation, work.mutationTransferGeneration
	attempt.bodies = attempt.bodies[:count]
	return changed
}
