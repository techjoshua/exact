package exactcompiler

import (
	"fmt"
	"sort"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedMemberCoverage is the finite source-set disposition of one
// original member observation. Extraction means that every source operation has
// an issued child, not that any writer ran or that a value was selected. Open
// operation, receiver, capture and imported-source children retain their own
// semantic producers. No acquired scope or invocation history is retained.
type sourceStagedMemberCoverage struct {
	installedCallSelection *sourceInstalledCallSelectionSource
	installedMember        *sourceInstalledMemberApplication // same live per-use factory as parent
	nativeObserver         sourceStagedNativeObserver
	request                sourceStagedOperationRequest
	origin                 *ast.Node
	cut                    sourceRelativeCut
	generation             *projectGeneration
	fieldBodies            []sourceStagedMemberFieldBody // Exact upstream purpose; never an invocation/output receipt.
	required               []sourceStagedOperationRequest
	extracted              bool
}

func validStagedMemberParent(parent sourceStagedOperationRequest) bool {
	operation := parent.producer.operation
	_, _, field := stagedFieldMemberParent(parent)
	return operation != nil && parent.inputs == nil && parent.consumer == parent.producer.declaration && parent.producer.kind == relativeDemandEffects && (parent.producer.selector == (sourceStagedOperationSelector{}) || field || stagedMapEntryMemberParent(parent)) && parent.use == operation && parent.cut == (sourceRelativeCut{operation: operation, use: operation, reading: operation}) && sourceStagedOccurrenceOwned(operation, parent.producer.declaration)
}

func stagedMemberCoverageRequest(parent sourceStagedOperationRequest, origin *ast.Node, cut sourceRelativeCut) sourceStagedOperationRequest {
	request := parent
	request.producer.selector = sourceStagedOperationSelector{occurrence: cut.operation, association: origin, field: stagedMemberContextField(parent, "member-source-set")}
	request.edge += fmt.Sprintf(":member-source-set:%p:%p", origin, cut.operation)
	return request
}

// describeStagedMemberCoverage names one original source set without observing
// its members. Early descriptions and the later semantic publisher share this
// identity; neither emptiness nor construction syntax supplies extraction.
func describeStagedMemberCoverage(parent sourceStagedOperationRequest, origin *ast.Node, cut sourceRelativeCut, generation *projectGeneration) *sourceStagedMemberCoverage {
	return &sourceStagedMemberCoverage{request: stagedMemberCoverageRequest(parent, origin, cut), origin: origin, cut: cut, generation: generation}
}

// registerConstructedCoveragePrefix precedes an adopted method's pending
// callback. Only the live original constructed Get may describe this child;
// the later member traversal owns its requirements and observation stamp.
func (work *callableEffectWork) registerConstructedCoveragePrefix(facts []callableFacts, q *sourceValueQuery, source sourceStagedConstructedMember) bool {
	if q == nil || q.owner == nil || q.executable == nil || q.executable.project == nil || q.owner.generation == nil || q.owner.generation != work.operationGeneration || q.owner.generation != q.executable.project.activeGeneration || !validConstructedMemberSource(&source) {
		return false
	}
	b := q.stagedConstructedMember
	if b == nil || !b.live || b.owner != q || b.generation != work.operationGeneration || b.finishing || b.issued == nil || b.issued.operation != q.reading || b.issued.receiver.node != b.site || b.site != source.construction.site || b.get != source.get || q.protectedMember != b.get || !sameOperationRequest(b.request, source.request) || b.cut != source.cut || q.relativeInputCut(source.request.producer.operation) != source.cut || b.source == nil || !sameConstructedMemberSource(b.source, &source) {
		return false
	}
	caller, known := work.memberNodes[source.request.consumer]
	publisher := q.executable.pendingMemberPublishers[source.request.consumer]
	if !known || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	c := describeStagedMemberCoverage(source.request, source.construction.site, source.cut, work.operationGeneration)
	if prior, exists := work.operationRecipes[c.request.producer]; exists {
		m := prior.memberSource
		return validStagedMemberCoverageRecipe(prior) && m.generation == c.generation && sameOperationRequest(m.parent, source.request) && sameOperationRequest(m.request, c.request) && m.coverage.origin == c.origin && m.coverage.cut == c.cut
	}
	recipe := sourceStagedOperationRecipe{key: c.request.producer, memberSource: &sourceStagedMemberSource{request: c.request, parent: source.request, generation: c.generation, coverage: c}}
	return work.registerOperationRecipe(facts, recipe)
}

// cumulativeStagedMemberCoverage preserves the exact sealed requirement order
// before adding this live owner's discoveries. Distinct contextual readings of
// one producer remain distinct children. A completed prefix cannot grow.
func cumulativeStagedMemberCoverage(parent sourceStagedOperationRequest, live *sourceStagedMemberCoverage, prior *sourceStagedOperationRecipe, extracted bool) (sourceStagedOperationRecipe, bool) {
	if live == nil {
		return sourceStagedOperationRecipe{}, false
	}
	copy := *live
	copy.required = nil
	copy.fieldBodies = nil
	copy.extracted = extracted
	if prior != nil {
		m := prior.memberSource
		if !validStagedMemberCoverageRecipe(*prior) || !sameOperationRequest(m.parent, parent) || !sameOperationRequest(m.request, live.request) || m.generation != live.generation || m.coverage.origin != live.origin || m.coverage.cut != live.cut || m.coverage.nativeObserver != live.nativeObserver {
			return sourceStagedOperationRecipe{}, false
		}
		copy.required = append(copy.required, prior.delta.required...)
		copy.fieldBodies = cloneStagedMemberFieldBodies(prior.memberSource.coverage.fieldBodies)
	}
	for _, required := range live.required {
		copy.required = appendEntryLawRequirement(copy.required, required)
	}
	for _, upstream := range live.fieldBodies {
		copy.fieldBodies = appendStagedMemberFieldBody(copy.fieldBodies, upstream)
	}
	if prior != nil && prior.delta.extracted && !sameStagedMemberFieldBodies(copy.fieldBodies, prior.memberSource.coverage.fieldBodies) {
		return sourceStagedOperationRecipe{}, false
	}
	if prior != nil && prior.delta.extracted && (!extracted || !operationPrefix(copy.required, prior.delta.required, sameOperationRequest)) {
		return sourceStagedOperationRecipe{}, false
	}
	recipe := sourceStagedOperationRecipe{key: copy.request.producer, memberSource: &sourceStagedMemberSource{request: copy.request, parent: parent, generation: copy.generation, installedCallSelection: cloneInstalledCallSelectionSource(copy.installedCallSelection), installedMember: cloneInstalledMemberApplication(copy.installedMember), coverage: &copy}, delta: sourceStagedOperationDelta{required: copy.required, extracted: copy.extracted}}
	return recipe, validStagedMemberCoverageRecipe(recipe)
}

// Every publication and typed reader attachment validates the combined source
// children through the same existing semantic factories before sealing them.
func (work *callableEffectWork) stagedMemberCoverageChildren(q *sourceValueQuery, c *sourceStagedMemberCoverage) bool {
	b := q.stagedMember
	for _, required := range c.required {
		if required.producer.kind == relativeDemandDirectExposure {
			if !work.stagedMemberResultReading(required, b.request, c.cut) {
				return false
			}
			continue
		}
		if work.stagedMemberCallReading(required, b.request, c.cut) {
			if stagedMemberFieldBodyRequired(c.fieldBodies, required) {
				return false
			} // Conflicting contributor purpose stays pending.
			continue
		}
		if stagedMemberFieldBodyRequired(c.fieldBodies, required) {
			if !work.stagedMemberFieldBodySourceOwned(c, required) {
				return false
			}
			continue
		}
		if q.stagedFieldBodySource(required) {
			return false
		} // Atomic purpose handoff was omitted.
		child := work.operationRecipes[required.producer].memberSource
		if child == nil || child.coverage != nil || child.generation != c.generation || !sameOperationRequest(child.parent, b.request) || !sameOperationRequest(child.request, required) || child.candidate.cut != c.cut {
			return false
		}
	}
	return true
}

// prepareStagedMemberCoverage completes source discovery, including the open
// operation channels omitted by assignment/reflective discovery. It uses the
// original canonical regions, preserving deferred and previous-activation
// relationships without asking whether those activations happened. Publication
// remains passive until an actual Effects consumer adopts this source set.
func (q *sourceValueQuery) prepareStagedMemberCoverage(get *sourceGetInputs, cut *sourceMemberWriterReadCut, origin *ast.Node, projection []string, name string, mode accessorTraversal, indexes []sourceValueIndex, result *accessorCandidates, standard *sourceValue) {
	b := q.stagedMember
	if !q.liveStagedMemberSource(b, get, cut) || !b.enumerating || origin == nil {
		return
	}
	complete := b.indexed && b.represented
	// Prior generic operations cannot corrupt an established standard container.
	// Indexed assignments and reflective replacements already remain in b.required.
	// The earlier global binding Get borrows this same original standard seed;
	// its receiver is still the global object, not the acquired container.
	standardEntry := !runtimeModuleEvaluation(q.effectOwner) && mode == accessorAcquire && standardNativeLookup(get) &&
		(get.receiver.native.kind == sourceNativeObjectConstructor || get.receiver.native.kind == sourceNativeReflectObject ||
			get.receiver.native.kind == sourceNativeGlobalObject && standard != nil && standard.native != nil &&
				(standard.native.kind == sourceNativeObjectConstructor || standard.native.kind == sourceNativeReflectObject))
	// Prior activations cannot reach this fresh first own-data slot.
	firstOwnField := q.stagedFirstOwnDataFieldRead(get, cut, origin, mode)
	for _, index := range indexes {
		operations, populated := stagedFieldPrototypeDiscovery(index)
		complete = complete && populated && index.normalOccurrences != nil && !index.normalDynamicScope
		if standardEntry {
			continue
		}
		sort.SliceStable(operations, func(i, j int) bool { return operations[i].operation.Pos() < operations[j].operation.Pos() })
		for _, operation := range operations {
			node := operation.operation
			if firstOwnField && operation.region != nil {
				continue
			}
			if !q.liveStagedMemberSource(b, get, cut) {
				return
			}
			// The current Get is not its own predecessor. Function bodies still
			// retain later operations as possible prior-activation source work.
			if node == get.operation || node == b.call || node == q.protectedMember || b.seen[node] || runtimeModuleEvaluation(q.effectOwner) && q.afterRead(node) {
				continue
			}
			if q.privateDeferredDefinitionExcluded(node, result) {
				b.seen[node] = true
				continue
			}
			if q.jsxConstructionDisjointFromRecord(node, origin, get, cut, result) {
				b.seen[node] = true
				continue // Only this own construction hazard, never its source children.
			}
			candidate := sourceStagedMemberCandidate{request: b.request, operation: node, origin: origin, region: operation.region, protocol: true, prior: !runtimeModuleEvaluation(q.effectOwner), cut: q.memberSourceObservationCut(get, cut)}
			if !q.publishStagedMemberCandidate(get, cut, candidate) {
				complete = false
			}
			b.seen[node] = true
		}
	}
	if !q.liveStagedMemberSource(b, get, cut) {
		return
	}
	coverage := describeStagedMemberCoverage(b.request, origin, q.memberSourceObservationCut(get, cut), b.generation)
	if b.installedCallSelection != nil {
		coverage.installedCallSelection = cloneInstalledCallSelectionSource(&b.installedCallSelection.source)
	}
	if b.installedMember != nil {
		coverage.installedMember = cloneInstalledMemberApplication(&b.installedMember.application)
	}
	coverage.required = append([]sourceStagedOperationRequest(nil), b.required...)
	coverage.fieldBodies = cloneStagedMemberFieldBodies(b.fieldBodies)
	coverage.extracted = complete && b.represented
	if native := q.stagedNativeGet; native != nil && native.issuer == q && native.owner == q.owner && native.generation == b.generation && sameOperationRequest(native.getRequest, b.request) {
		coverage.nativeObserver = sourceStagedNativeObserver{request: b.request, get: native.call.Expression(), cut: coverage.cut}
	}
	b.coverage = coverage
	if b.prepareNativeInputs != nil {
		b.prepareNativeInputs()
	}
}

func validStagedMemberCoverageRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	source := recipe.memberSource
	if source == nil || source.coverage == nil || source.generation == nil {
		return false
	}
	c := source.coverage
	if !sameInstalledCallSelectionSource(c.installedCallSelection, source.installedCallSelection) || !sameInstalledMemberApplication(c.installedMember, source.installedMember) {
		return false
	}
	if !stagedMemberFactoryParent(source) || c.generation != source.generation || c.origin == nil || !stagedMemberFactoryObservation(source, c.cut) || !sameOperationRequest(c.request, stagedMemberCoverageRequest(source.parent, c.origin, c.cut)) || recipe.key != c.request.producer || !sameOperationRequest(source.request, c.request) || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects)+len(recipe.delta.residuals) != 0 || recipe.delta.extracted != c.extracted || len(recipe.delta.required) != len(c.required) {
		return false
	}
	if c.nativeObserver != (sourceStagedNativeObserver{}) && !validNativeObserverCoverage(source) {
		return false
	}
	if !validStagedMemberFieldBodies(c.fieldBodies, source.parent, c.cut, c.generation, c.required) {
		return false
	}
	for i, required := range c.required {
		data := validStagedCallResultReading(required, source.parent, c.cut)
		if required.producer == recipe.key || !sameOperationRequest(recipe.delta.required[i], required) || !data && (required.producer.kind != relativeDemandEffects || required.consumer != c.request.consumer || required.inputs != nil && (source.installedMember == nil || !sameInstalledMemberInputEdge(required.inputs, source.installedMember.binding)) || required.cut != c.request.cut) {
			return false
		}
	}
	return recipe.nativeGet == nil && recipe.callResult == nil && recipe.constructed == nil && recipe.mapEntry == nil && recipe.mapProtocol == nil && recipe.writer == nil && recipe.getter == nil && recipe.returning == nil && recipe.constructedDisposition == nil && len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) == 0
}

// publishStagedMemberCoverage accepts only the live original owner's exact
// disposition. Required child registration precedes any adopted publication.
// Complete local extraction never closes an unpublished semantic child.
func (work *callableEffectWork) publishStagedMemberCoverage(facts []callableFacts, q *sourceValueQuery) bool {
	if q == nil || q.stagedMember == nil {
		return false
	}
	b := q.stagedMember
	c := b.coverage
	if c == nil {
		return true
	}
	if !q.liveStagedMemberSource(b, b.get, b.read) || c.generation != work.operationGeneration || c.cut != q.memberSourceObservationCut(b.get, b.read) {
		return false
	}
	prior, registered := work.operationRecipes[c.request.producer]
	var prefix *sourceStagedOperationRecipe
	if registered {
		prefix = &prior
	}
	recipe, valid := cumulativeStagedMemberCoverage(b.request, c, prefix, c.extracted)
	if !valid || !work.stagedMemberCoverageChildren(q, recipe.memberSource.coverage) {
		return false
	}
	if b.nativeEntry != nil && !work.enrollNativeEntryCoverage(facts, q, recipe) {
		q.stagedNativeGet.entryRefused = true
		return false
	}
	accepted := true
	if !registered {
		accepted = work.registerOperationRecipe(facts, recipe)
	}
	if accepted && b.installedMember != nil {
		// This Get already enrolled its real consumer before population. Move
		// its unconditional C requirement ahead of this original publication,
		// so record observes the published revision rather than adoption's zero.
		accepted = work.enrollInstalledMemberCoverage(facts, q, b.installedMember, c)
	}
	if accepted && (registered || b.installedMember != nil) {
		// Normal attachment installs every C child before publishing this exact
		// already-computed prefix. Other passive source owners remain unchanged.
		accepted = work.attachOperationSource(facts, recipe)
	}
	if !accepted || !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage != c || q.memberSourceObservationCut(b.get, b.read) != c.cut {
		return false
	}
	c.required = append([]sourceStagedOperationRequest(nil), recipe.delta.required...)
	c.fieldBodies = cloneStagedMemberFieldBodies(recipe.memberSource.coverage.fieldBodies)
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[c.request.producer] = c.generation
	if id, adopted := work.operationIDs[c.request.producer]; adopted && id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
		state := &work.operations[id.index]
		if !state.memberCoverageObserved {
			state.memberCoverageObserved = true
			if state.revision != 0 {
				state.revision++
				work.notifyOperationSubscribers(state)
			}
		}
	}
	if native := q.stagedNativeGet; native != nil && native.issuer == q && native.generation == c.generation && native.call == b.request.producer.operation {
		if b.nativeEntry != nil {
			native.entryObserved = appendEntryLawRequirement(native.entryObserved, c.request)
		}
		found := false
		for _, request := range native.memberSources {
			found = found || sameOperationRequest(request, c.request)
		}
		if !found {
			native.memberSources = append(native.memberSources, c.request)
		}
	}
	return true
}
