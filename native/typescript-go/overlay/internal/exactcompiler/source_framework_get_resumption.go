package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceFrameworkGetResumption describes the original Get which yielded for
// conditional framework DATA before its source-set origin was available. It
// retains no query, input frame, creating scope, observed result or current right.
type sourceFrameworkGetResumption struct {
	parent     sourceStagedOperationRequest
	cut        sourceRelativeCut
	generation *projectGeneration
	readings   []sourceStagedOperationRequest
}

func sameFrameworkGetResumption(a, b *sourceFrameworkGetResumption) bool {
	return a == b || a != nil && b != nil && sameOperationRequest(a.parent, b.parent) && a.cut == b.cut && a.generation == b.generation
}
func cloneFrameworkGetResumption(a *sourceFrameworkGetResumption) *sourceFrameworkGetResumption {
	if a == nil {
		return nil
	}
	b := *a
	b.readings = append([]sourceStagedOperationRequest(nil), a.readings...)
	return &b
}

func frameworkGetResumptionRequest(parent sourceStagedOperationRequest) sourceStagedOperationRequest {
	return stagedGetResultRequest(parent.producer.operation, parent.consumer, "framework-effects", nil)
}

func validFrameworkGetResumptionRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	if source == nil || source.getResult == nil || source.getResult.frameworkResume == nil {
		return false
	}
	resume := source.getResult.frameworkResume
	if resume.parent.producer.operation == nil || resume.parent.consumer == nil {
		return false
	}
	request := frameworkGetResumptionRequest(resume.parent)
	if source.getResult.role != "framework-effects" || source.getResult.body != nil || source.getResult.represented || source.declaration != resume.parent.consumer || source.generation == nil || source.generation != resume.generation || recipe.key != request.producer || !sameOperationRequest(source.request, request) || !validStagedMemberParent(resume.parent) || resume.parent.producer.selector != (sourceStagedOperationSelector{}) || resume.cut != resume.parent.cut || !ast.IsPropertyAccessExpression(resume.parent.producer.operation) || !validStagedMemberObservation(resume.parent, resume.cut) || resume.cut.operation != resume.parent.producer.operation || source.frameworkView != nil || source.binding != nil || source.operand != nil || source.nativeCall || source.constructedRoot.producer.operation != nil || source.association.invocation.operation != nil || len(source.readings)+len(source.readCuts)+len(source.inputReadings)+len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	if recipe.memberSource != nil || recipe.nativeGet != nil || recipe.constructed != nil || recipe.writer != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.getter != nil || recipe.returning != nil || recipe.moduleArgument != nil || recipe.declarationCall != nil || recipe.frameworkEffects != nil || recipe.assignment != nil || recipe.constructionEffects != nil || recipe.hasInstance != nil || recipe.entryLaw != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 {
		return false
	}
	if len(resume.readings) == 0 {
		return false
	}
	for _, reading := range resume.readings {
		if !validStagedCallResultReading(reading, resume.parent, resume.cut) {
			return false
		}
		present := false
		for _, required := range recipe.delta.required {
			present = present || sameOperationRequest(reading, required)
		}
		if !present {
			return false
		}
	}
	for _, required := range recipe.delta.required {
		reading := false
		for _, r := range resume.readings {
			reading = reading || sameOperationRequest(r, required)
		}
		if !reading {
			origin := required.producer.selector.association
			if !descriptorStrongReadingShape(required, resume.parent, resume.cut) && !sameOperationRequest(required, descriptorRecordGetEffectsRequest(resume.parent)) && (origin == nil || !sameOperationRequest(required, stagedMemberCoverageRequest(resume.parent, origin, resume.cut))) {
				return false
			}
		}
	}
	for _, effect := range recipe.delta.effects {
		if !validOperationEnvironmentEffect(effect) {
			return false
		}
	}
	return true
}

// deferFrameworkGetResumption is called only in the actual restored return
// projection on an original unsealed Get. A pending reader is issued before the
// source set can seal, never appended to an already completed prefix afterward.
func (work *callableEffectWork) deferFrameworkGetResumption(facts []callableFacts, q *sourceValueQuery, source *sourceStagedCallResultSource) bool {
	b := q.stagedMember
	if b == nil || b.publishing || q.stagedNativeGet != nil || q.inputs != nil || q.operation != nil || !q.liveStagedMemberSource(b, b.get, b.read) || source == nil || (source.frameworkView == nil && source.nativeDescriptor == nil) || source.request.producer.operation != b.projectingReturn || source.frameworkView != nil && source.frameworkView.call != b.projectingReturn || source.nativeDescriptor != nil && source.nativeDescriptor.request.producer.operation != b.projectingReturn || source.generation != work.operationGeneration || b.generation != work.operationGeneration || !ast.IsPropertyAccessExpression(b.request.producer.operation) || b.get.operation != b.request.producer.operation || !validStagedMemberParent(b.request) || b.request.producer.selector != (sourceStagedOperationSelector{}) || b.observation != b.request.cut {
		return false
	}
	caller, owned := work.memberNodes[b.request.consumer]
	if !owned || q.executable == nil || q.executable.project == nil || q.executable.project.activeGeneration != work.operationGeneration || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	publisher := q.executable.pendingMemberPublishers[b.request.consumer]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] {
		return false
	}
	reading := source.request
	reading.consumer, reading.reading = b.request.consumer, b.request.producer
	reading.edge = fmt.Sprintf("%s:call-return:%d:read:%d:%d", b.request.edge, source.request.producer.operation.Pos(), b.observation.operation.Pos(), b.observation.operation.End())
	if !validStagedCallResultReading(reading, b.request, b.observation) {
		return false
	}
	if b.coverage != nil {
		// The live-C caller must retain this exact reader before enrollment.
		// This validation neither expands a sealed prefix nor publishes C.
		coverage, valid := work.memberCallResultCoverage(q)
		if !valid || !validStagedMemberCoverageRecipe(coverage) {
			return false
		}
		present := false
		for _, required := range coverage.delta.required {
			present = present || sameOperationRequest(required, reading)
		}
		if !present {
			return false
		}
	}
	if !work.enrollFrameworkGetResumption(facts, b.request, b.observation, source, reading) {
		return false
	}
	b.required = appendEntryLawRequirement(b.required, reading)
	return true
}

// enrollFrameworkGetResumption shares registration between authenticated actual
// Get and original receiver-DATA preparation owners. It issues no observation.
func (work *callableEffectWork) enrollFrameworkGetResumption(facts []callableFacts, parent sourceStagedOperationRequest, cut sourceRelativeCut, source *sourceStagedCallResultSource, reading sourceStagedOperationRequest) bool {
	caller, owned := work.memberNodes[parent.consumer]
	if !owned || caller < 0 || caller >= len(facts) || len(facts) != len(work.operationFacts) || &facts[caller] != &work.operationFacts[caller] || source == nil || source.generation != work.operationGeneration || !validStagedCallResultReading(reading, parent, cut) || (source.frameworkView == nil && source.nativeDescriptor == nil) {
		return false
	}
	// This scans only the owning fact's retained prefixes to enforce the existing
	// seal. No inventory, observed membership or absence proof is derived here.
	for _, prior := range facts[caller].staged.operationRecipes {
		m := prior.memberSource
		if m == nil || m.coverage == nil || !sameOperationRequest(m.parent, parent) || m.coverage.cut != cut || !prior.delta.extracted {
			continue
		}
		present := false
		for _, child := range prior.delta.required {
			present = present || sameOperationRequest(child, reading)
		}
		if !present {
			return false
		}
	}
	if !work.registerStagedCallResultReading(facts, source, reading, cut, nil) {
		return false
	}
	request := frameworkGetResumptionRequest(parent)
	prior, exists := work.operationRecipes[request.producer]
	var recipe sourceStagedOperationRecipe
	if exists {
		if !validFrameworkGetResumptionRecipe(prior) || prior.callResult.generation != work.operationGeneration || !sameOperationRequest(prior.callResult.getResult.frameworkResume.parent, parent) || prior.callResult.getResult.frameworkResume.cut != cut {
			return false
		}
		recipe = prior
		recipe.callResult = cloneStagedCallResultSource(prior.callResult)
		recipe.delta = cloneOperationDelta(prior.delta)
	} else {
		resume := &sourceFrameworkGetResumption{parent: parent, cut: cut, generation: work.operationGeneration}
		result := &sourceStagedCallResultSource{request: request, declaration: parent.consumer, generation: work.operationGeneration, getResult: &sourceStagedGetResultSource{role: "framework-effects", frameworkResume: resume}}
		recipe = sourceStagedOperationRecipe{key: request.producer, callResult: result}
	}
	resume := recipe.callResult.getResult.frameworkResume
	resume.readings = appendEntryLawRequirement(resume.readings, reading)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, reading)
	if !validFrameworkGetResumptionRecipe(recipe) {
		return false
	}
	accepted := false
	if exists {
		accepted = work.attachOperationSource(facts, recipe)
	} else {
		accepted = work.registerOperationRecipe(facts, recipe)
	}
	if !accepted || !work.registerOperationUse(facts, sourceStagedOperationUse{request: request}) {
		return false
	}
	id, adopted := work.operationIDs[recipe.key]
	if !adopted {
		return false
	}
	work.attachSourceObservationDependencies(facts, id)
	return true // Pending source registration; current DATA is checked separately.
}

func (work *callableEffectWork) frameworkGetResumptionSource(id sourceStagedOperationID) *sourceFrameworkGetResumption {
	if work.operationGeneration == nil || !work.operationGeneration.active || work.operationGeneration.project == nil || work.operationGeneration.project.abandoned || work.operationGeneration.project.activeGeneration != work.operationGeneration {
		return nil
	}
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !validFrameworkGetResumptionRecipe(recipe) || recipe.callResult.generation != work.operationGeneration {
		return nil
	}
	return recipe.callResult.getResult.frameworkResume
}

// Observation snapshots semantic producers, independently of later ACK delivery.
// Only the fresh original Get below issues one; clones receive no such state.
type sourceFrameworkGetDependency struct {
	dependency sourceStagedOperationDependency
	revision   uint64
}
type sourceFrameworkGetObservation struct {
	issuer       *sourceFrameworkGetObservation
	id           sourceStagedOperationID
	required     []sourceStagedOperationRequest
	dependencies []sourceFrameworkGetDependency
}

func (work *callableEffectWork) captureFrameworkGetObservation(id sourceStagedOperationID) *sourceFrameworkGetObservation {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid {
		return nil
	}
	observed := &sourceFrameworkGetObservation{id: id}
	observed.issuer = observed
	recipe := work.operationRecipes[work.operations[id.index].key]
	observed.required = append([]sourceStagedOperationRequest(nil), recipe.delta.required...)
	for _, d := range work.sourceObservationDependencies(id) {
		if d.producer.epoch != work.operationEpoch || d.producer.index == 0 || int(d.producer.index) >= len(work.operations) {
			return nil
		}
		observed.dependencies = append(observed.dependencies, sourceFrameworkGetDependency{dependency: d, revision: work.operations[d.producer.index].revision})
	}
	return observed
}

func (work *callableEffectWork) frameworkGetObservationCurrent(observed *sourceFrameworkGetObservation) bool {
	if observed == nil || observed.issuer != observed || work.frameworkGetResumptionSource(observed.id) == nil {
		return false
	}
	state := &work.operations[observed.id.index]
	recipe := work.operationRecipes[state.key]
	if state.frameworkGetObservation != observed || state.invalid || !state.dependenciesRegistered || !operationPrefix(observed.required, recipe.delta.required, sameOperationRequest) || !operationPrefix(recipe.delta.required, observed.required, sameOperationRequest) {
		return false
	}
	deps := work.sourceObservationDependencies(observed.id)
	if len(deps) != len(observed.dependencies) {
		return false
	}
	for i, d := range deps {
		old := observed.dependencies[i]
		if old.dependency.producer != d.producer || !sameOperationRequest(old.dependency.request, d.request) || d.producer.epoch != work.operationEpoch || d.producer.index == 0 || int(d.producer.index) >= len(work.operations) || old.revision == 0 {
			return false
		}
		child := &work.operations[d.producer.index]
		subscriber := child.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
		if child.revision != old.revision || subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, d.request) || subscriber.applied != old.revision {
			return false
		}
	}
	return true
}

// prepareFrameworkGetResumption reacquires only the same original Get on the
// existing source-observation queue. The old semantic snapshot is never refreshed
// from ACKs, nor can its callback/frame be recovered from a cached description.
func (work *callableEffectWork) prepareFrameworkGetResumption(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	resume := work.frameworkGetResumptionSource(id)
	if resume == nil || owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration {
		return
	}
	caller, owned := work.memberNodes[resume.parent.consumer]
	if !owned || facts[caller].normalInputs != nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	publisher := owner.pendingMemberPublishers[facts[caller].node]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] {
		return
	}
	state := &work.operations[id.index]
	if state.writerSourceRunning {
		return
	}
	if state.delta.extracted && work.frameworkGetObservationCurrent(state.frameworkGetObservation) {
		return
	}
	work.attachSourceObservationDependencies(facts, id)
	// A pending producer cannot manufacture DATA. Ordinary completion requires
	// CLOSED DATA; the separate original-P source-enumeration interval below
	// accepts only a locally delivered conditional descriptor with unpaid debts.
	inputsClosed := true
	for _, reading := range resume.readings {
		child, adopted := work.operationIDs[reading.producer]
		if !adopted || child.epoch != work.operationEpoch || child.index == 0 || int(child.index) >= len(work.operations) {
			return
		}
		if !work.closedOperationDependencies()[child.index] {
			// Only this producer's exact locally delivered conditional descriptor
			// may enumerate SOURCE effects before full closure. Ordinary value
			// transfer and completion retain the CLOSED requirement below.
			if _, represented := work.descriptorEnumerationPayload(work.operationRecipes[reading.producer], reading, resume.parent, resume.cut); !represented {
				return
			}
			inputsClosed = false
		}
		if data, applied := work.stagedCallResultData(reading); !applied || !data.delta.extracted {
			return
		}
	}
	work.withFrameworkGetResumptionSource(facts, id, owner, func(q *sourceValueQuery) {
		node := resume.parent.producer.operation
		revokeEnumeration := func() {}
		if !inputsClosed {
			var enumeration bool
			revokeEnumeration, enumeration = work.beginDescriptorSourceEnumeration(facts, q, id, owner)
			if !enumeration {
				return
			}
		}
		defer revokeEnumeration()
		b := q.stagedMember
		finish := b.finish
		var coverages []sourceStagedOperationRequest
		complete := true
		b.finish = func(disposition sourceStagedMemberDisposition) bool {
			accepted := finish(disposition)
			if b.coverage == nil {
				// A strong provenance visitor may follow the same real record Get.
				// Its independent target source does not replace record-Get Effects;
				// the observed local role already retains that original prototype C.
				if _, actualRecordGet := work.originalDescriptorRecordGetEffects(resume); !actualRecordGet {
					complete = false
				}
				return accepted
			}
			recipe := work.operationRecipes[b.coverage.request.producer]
			if !accepted || !validStagedMemberCoverageRecipe(recipe) || !recipe.delta.extracted || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
				complete = false
				return accepted
			}
			coverages = appendEntryLawRequirement(coverages, b.coverage.request)
			return accepted
		}
		var candidates accessorCandidates
		q.withDescriptorGetEffectsUse(node, func() {
			candidates = q.evaluatedSourceAccessors(node, nil)
		})
		appendOwnedGetFact(&facts[caller], node, candidates, work.memberNodes, facts[caller].sourceFile, owner.checker)
		recipe := work.operationRecipes[work.operations[id.index].key]
		if effects, issued := work.originalDescriptorRecordGetEffects(resume); issued {
			recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, effects)
		}
		for _, c := range coverages {
			recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, c)
		}
		if !work.attachOperationSource(facts, recipe) {
			return
		}
		work.attachSourceObservationDependencies(facts, id)
		// Exact original MAY edges and their real summary deliveries remain required.
		bodies, represented := work.requireFrameworkEffectsBodies(facts, recipe, candidates)
		work.operations[id.index].memberActivations = bodies
		if !inputsClosed {
			// A real original Get may publish conditional source descriptions and
			// retain every DATA/C/BODY child while this resumer stays unextracted.
			// No completion observation is issued here. The existing fixed-point
			// refreshStagedCallResults retries adopted unextracted resumptions on
			// genuine child/summary progress, even when D's revision is unchanged.
			return
		}
		observed := work.captureFrameworkGetObservation(id)
		work.operations[id.index].frameworkGetObservation = observed
		work.operations[id.index].writerSourceRevisions = work.sourceObservationRevisions(id)
		if !complete || len(coverages) == 0 || !represented || frameworkEffectsCompilerPending(candidates) || !work.frameworkGetObservationCurrent(observed) {
			return
		}
		recipe = work.operationRecipes[work.operations[id.index].key]
		recipe.delta.extracted = true
		if !work.attachOperationSource(facts, recipe) {
			return
		}
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[recipe.key] = work.operationGeneration
		work.publishOperation(id, recipe.delta)
	})
}

// withFrameworkGetResumptionSource owns the existing original-P query interval.
// The callback receives no normal frame. Local source publication and final
// completion remain distinct decisions made by the original producer.
func (work *callableEffectWork) withFrameworkGetResumptionSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner, body func(*sourceValueQuery)) bool {
	resume := work.frameworkGetResumptionSource(id)
	if resume == nil || owner == nil || owner.values == nil || owner.project == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || body == nil {
		return false
	}
	caller, owned := work.memberNodes[resume.parent.consumer]
	if !owned || caller < 0 || caller >= len(facts) || len(facts) != len(work.operationFacts) || &facts[caller] != &work.operationFacts[caller] || facts[caller].normalInputs != nil || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	publisher := owner.pendingMemberPublishers[facts[caller].node]
	state := &work.operations[id.index]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || state.invalid || !state.dependenciesRegistered || state.writerSourceRunning || work.operationIDs[state.key] != id {
		return false
	}
	state.writerSourceRunning = true
	defer func() { work.operations[id.index].writerSourceRunning = false }()
	node := resume.parent.producer.operation
	q := newSourceDependencyQuery(node, owner.checker, owner, facts[caller].node)
	defer q.publishDependencyStatistics()
	revoke, installed := work.beginStagedMemberWork(q, facts, resume.parent)
	if !installed {
		return false
	}
	defer revoke()
	body(q)
	return true
}
