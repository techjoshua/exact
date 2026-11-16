package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
)

// sourceStagedGetPreparation is a debt-only role of an original generic Get.
// It reserves no receiver, C, selected method, ordinary value or Get receipt.
// Its exact SOURCE children live in delta.required and survive graph cloning;
// a graph-local observation is issued again by the original preparation owner.
type sourceStagedGetPreparation struct {
	targets  []sourceStagedGetPreparationTarget // Target authority reads; creating Effects stay on each target.
	native   []sourceStagedGetPreparationNative
	plain    bool // Original standalone library Get service, not native selection.
	data     []sourceStagedGetPreparationData
	readings []sourceStagedGetPreparationReading
}

// Native descriptions retain only an existing request factory and its disjoint
// source-scope role. They are not native selection or a Get observation.
type sourceStagedGetPreparationNative struct {
	parent     sourceStagedOperationRequest
	descriptor bool
}

func (s sourceStagedGetPreparationNative) request() sourceStagedOperationRequest {
	candidate := requestedMemberCallCandidate(nativeWriterSourceOccurrence(s.parent))
	if s.descriptor {
		return descriptorCalleeRequestKey(s.parent, candidate)
	}
	return nativeWriterSourceRequestKey(s.parent, candidate)
}

func sameGetPreparation(a, b *sourceStagedGetPreparation) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.plain == b.plain && operationPrefix(a.data, b.data, sameGetPreparationData) && operationPrefix(a.targets, b.targets, func(x, y sourceStagedGetPreparationTarget) bool {
		return sameOperationRequest(x.reading, y.reading) && sameOperationRequest(x.creatingClosureDebt, y.creatingClosureDebt) && x.acquisition == y.acquisition && x.cut == y.cut && slices.Equal(x.projection, y.projection)
	}) && operationPrefix(a.readings, b.readings, func(x, y sourceStagedGetPreparationReading) bool {
		return sameOperationRequest(x.source, y.source) && sameOperationRequest(x.reading, y.reading) && x.context == y.context
	}) && operationPrefix(a.native, b.native, func(a, b sourceStagedGetPreparationNative) bool {
		return a.descriptor == b.descriptor && sameOperationRequest(a.parent, b.parent)
	})
}

func validGetPreparationNative(parent sourceStagedOperationRequest, source sourceStagedGetPreparationNative) bool {
	original := source.parent
	call := original.producer.operation
	return call != nil && ast.IsCallExpression(call) && ast.IsPropertyAccessExpression(call.Expression()) && call != parent.producer.operation && validStagedMemberParent(original) && original.consumer == parent.consumer && original.producer.declaration == parent.consumer && original.reading == (sourceStagedOperationKey{}) && original.inputs == nil && original.use == call && original.cut == (sourceRelativeCut{operation: call, use: call, reading: call})
}

func stagedGetPreparationChild(source *sourceStagedMemberSource, request sourceStagedOperationRequest) bool {
	for _, data := range source.getPreparation.data {
		if validGetPreparationData(source.parent, data) && sameOperationRequest(data.reading, request) {
			return true
		}
	}
	for _, target := range source.getPreparation.targets {
		if validGetPreparationTarget(source.parent, target) && sameOperationRequest(target.reading, request) {
			return true
		}
	}
	for _, entry := range source.getPreparation.readings {
		if validGetPreparationReading(source.parent, entry) && sameOperationRequest(entry.reading, request) {
			return true
		}
	}
	if stagedGetPreparationRoot(source.parent, request) {
		return true
	}
	for _, native := range source.getPreparation.native {
		if validGetPreparationNative(source.parent, native) && sameOperationRequest(native.request(), request) {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) getPreparationChildOwned(parent, request sourceStagedOperationRequest) bool {
	if s := work.operationRecipes[request.producer].callResult; s != nil {
		for _, data := range s.preparationData {
			if sameOperationRequest(data.parent, parent) && sameOperationRequest(data.reading, request) {
				return work.getPreparationDataRegistered(data)
			}
		}
	}
	if work.validGetPreparationReflectiveTargetReading(work.operationRecipes[request.producer], request) {
		return work.getPreparationTargetReadingOwned(request)
	}
	if request.reading == stagedGetPreparationRequest(parent).producer {
		return work.getPreparationSourceReadingOwned(request)
	}
	if stagedGetPreparationRoot(parent, request) {
		return work.nativeScopeRootOwned(request, parent)
	}
	recipe := work.operationRecipes[request.producer]
	if !validStagedMemberCallRecipe(recipe) || !nativeWriterScopeRequested(recipe) || recipe.memberSource.generation != work.operationGeneration || !sameOperationRequest(recipe.memberSource.request, request) || !validGetPreparationNative(parent, sourceStagedGetPreparationNative{parent: recipe.memberSource.parent, descriptor: descriptorCalleeRequested(recipe)}) {
		return false
	}
	id := work.operationIDs[request.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	return !state.invalid && state.dependenciesRegistered && sub != nil && !sub.blocked && sameOperationRequest(sub.request, request)
}

// getPreparationSourceRegistered binds detached native role metadata to the
// exact registered child factory. Matching selector spelling alone is not an
// association with that child's original full request.
func (work *callableEffectWork) getPreparationSourceRegistered(source *sourceStagedMemberSource, request sourceStagedOperationRequest) bool {
	for _, data := range source.getPreparation.data {
		if sameOperationRequest(data.reading, request) {
			return work.getPreparationDataRegistered(data)
		}
	}
	if work.validGetPreparationReflectiveTargetReading(work.operationRecipes[request.producer], request) {
		if !work.getPreparationTargetReadingOwned(request) {
			return false
		}
		target := work.operationRecipes[request.producer].memberSource.targetSource
		for _, entry := range source.getPreparation.targets {
			if validGetPreparationTarget(source.parent, entry) && sameOperationRequest(entry.reading, request) && sameOperationRequest(entry.creatingClosureDebt, target.creating) && target.preparation != nil && entry.acquisition == target.preparation.acquisition && entry.cut == target.preparation.cut && slices.Equal(entry.projection, target.preparation.receiver.projection) {
				return true
			}
		}
		return false
	}
	if request.reading == source.request.producer {
		return work.getPreparationSourceReadingOwned(request)
	}
	if stagedGetPreparationRoot(source.parent, request) {
		return work.getPreparationChildOwned(source.parent, request)
	}
	recipe := work.operationRecipes[request.producer]
	if !work.getPreparationChildOwned(source.parent, request) {
		return false
	}
	for _, native := range source.getPreparation.native {
		if sameOperationRequest(native.request(), request) {
			return sameOperationRequest(native.parent, recipe.memberSource.parent) && native.descriptor == descriptorCalleeRequested(recipe)
		}
	}
	return false
}

func (work *callableEffectWork) getPreparationChildCurrent(request sourceStagedOperationRequest) bool {
	if s := work.operationRecipes[request.producer].callResult; s != nil && len(s.preparationData) != 0 {
		return work.getPreparationDataCurrent(request)
	}
	if work.validGetPreparationReflectiveTargetReading(work.operationRecipes[request.producer], request) {
		return work.getPreparationTargetReadingOwned(request) && work.getPreparationReflectiveTargetReadingCurrent(request)
	}
	if work.acceptedGetPreparationSourceReading(request) {
		return work.getPreparationSourceReadingCurrent(request)
	}
	recipe := work.operationRecipes[request.producer]
	if !nativeWriterScopeRequested(recipe) {
		return work.nativeScopeRootCurrent(request)
	}
	if !validStagedMemberCallRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || !work.writerSourceLocallyReady(recipe) || !sameOperationRequest(recipe.memberSource.request, request) {
		return false
	}
	return work.nativeWriterSourceInvocationApplied(request)
}

// sourceStagedGetPreparationBorrow exists only inside the owning original Get
// query. Nested receiver/constructor acquisition can retain SOURCE debt here
// without borrowing the physical Get/read that has not started yet.
type sourceStagedGetPreparationBorrow struct {
	self        *sourceStagedGetPreparationBorrow
	query       *sourceValueQuery
	work        *callableEffectWork
	owner       *executableBodyOwner
	fact        *callableFacts
	member      *sourceStagedMemberBorrow
	id          sourceStagedOperationID
	request     sourceStagedOperationRequest
	plain       bool
	dataPending bool // Actual deferred SOURCE projection in this original Get interval.
	execution   *sourceStagedGetPreparationExecution
	acquisition *sourceStagedGetPreparationAcquisitionBorrow
}

type sourceStagedGetPreparationObservation struct {
	self       *sourceStagedGetPreparationObservation
	id         sourceStagedOperationID
	revision   uint64
	request    sourceStagedOperationRequest
	generation *projectGeneration
	revisions  []uint64
	required   []sourceStagedOperationRequest
	observed   []sourceStagedOperationRequest
}

func stagedGetPreparationRequest(parent sourceStagedOperationRequest) sourceStagedOperationRequest {
	request := parent
	request.producer.selector = sourceStagedOperationSelector{occurrence: parent.producer.operation, field: "member-get-preparation"}
	request.edge += ":preparation"
	return request
}

func stagedGetPreparationRoot(parent, root sourceStagedOperationRequest) bool {
	call := root.producer.operation
	return call != nil && ast.IsCallExpression(call) && call != parent.producer.operation && root.consumer == parent.consumer && root.producer.declaration == parent.consumer && root.producer.kind == relativeDemandEffects && root.producer.selector == (sourceStagedOperationSelector{occurrence: call.Expression(), field: "callee-alternatives"}) && root.reading == (sourceStagedOperationKey{}) && root.inputs == nil && root.use == call && root.cut == (sourceRelativeCut{operation: call, use: call, reading: call}) && root.edge != ""
}

func validStagedGetPreparationRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.memberSource
	if s == nil || s.getPreparation == nil || s.generation == nil || !validStagedMemberParent(s.parent) || !ast.IsPropertyAccessExpression(s.parent.producer.operation) || !sameOperationRequest(s.request, stagedGetPreparationRequest(s.parent)) || recipe.key != s.request.producer || s.candidate.operation != nil || s.candidate.origin != nil || s.candidate.region != nil || s.candidate.protocol || s.candidate.invoking || s.candidate.reflective || s.candidate.getContribution || s.candidate.runtimeUnknown || s.candidate.prior || s.candidate.cut != (sourceRelativeCut{}) || !sameOperationEndpoint(s.candidate.target, sourceRelativeEndpoint{}) || !sameOperationEndpoint(s.candidate.key, sourceRelativeEndpoint{}) || !sameOperationEndpoint(s.candidate.value, sourceRelativeEndpoint{}) || !sameOperationRequest(s.candidate.request, sourceStagedOperationRequest{}) {
		return false
	}
	if s.nativeWriter != nil || s.globalWrite != nil || s.hasFreshTarget != nil || s.targetSource != nil || s.writeEffects || s.protocolSource != nil || s.coverage != nil || s.call != nil || s.getEffects != nil || s.extraction != nil || s.moduleExcluded != nil || len(s.values)+len(s.moduleImports) != 0 {
		return false
	}
	if recipe.nativeGet != nil || recipe.callResult != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || recipe.assignment != nil || recipe.constructionEffects != nil || recipe.entryLaw != nil || recipe.hasInstance != nil || recipe.moduleArgument != nil || recipe.declarationCallGeneration != nil || recipe.declarationCall != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 {
		return false
	}
	// Validate the finite description envelope once. Revalidating every typed
	// child while searching each requirement repeats its pure AST/request work.
	// These invocation-local bits retain exact request equality and uniqueness
	// within each family; different families may describe the same request.
	metadata := s.getPreparation
	count := len(metadata.data) + len(metadata.targets) + len(metadata.readings) + len(metadata.native)
	if count == 0 {
		for _, required := range recipe.delta.required {
			if !stagedGetPreparationRoot(s.parent, required) {
				return false
			}
		}
	} else {
		const (
			requiredRole uint8 = 1 << iota
			dataRole
			targetRole
			readingRole
			nativeRole
		)
		roles := make(map[sourceStagedOperationRequest]uint8, len(recipe.delta.required))
		for _, required := range recipe.delta.required {
			roles[required] = requiredRole
		}
		retain := func(request sourceStagedOperationRequest, role uint8) bool {
			prior := roles[request]
			if prior&requiredRole == 0 || prior&role != 0 {
				return false
			}
			roles[request] = prior | role
			return true
		}
		for _, data := range metadata.data {
			if !validGetPreparationData(s.parent, data) || !retain(data.reading, dataRole) {
				return false
			}
		}
		for _, entry := range metadata.targets {
			if !validGetPreparationTarget(s.parent, entry) || !retain(entry.reading, targetRole) {
				return false
			}
		}
		for _, entry := range metadata.readings {
			if !validGetPreparationReading(s.parent, entry) || !retain(entry.reading, readingRole) {
				return false
			}
		}
		for _, native := range metadata.native {
			if !validGetPreparationNative(s.parent, native) || !retain(native.request(), nativeRole) {
				return false
			}
		}
		for _, required := range recipe.delta.required {
			if roles[required] == requiredRole && !stagedGetPreparationRoot(s.parent, required) {
				return false
			}
		}
	}
	expected := sourceStagedOperationDelta{required: recipe.delta.required, extracted: recipe.delta.extracted}
	return operationDeltaPrefix(expected, recipe.delta) && operationDeltaPrefix(recipe.delta, expected)
}

func (b *sourceStagedGetPreparationBorrow) live(q *sourceValueQuery) bool {
	if b == nil || b.self != b || b.query != q || q == nil || q.owner == nil || q.executable != b.owner || b.work == nil || b.owner == nil || b.owner.values == nil || b.owner.project == nil || q.stagedMember != b.member || b.member == nil || b.member.issuer != q || b.member.owner != q.owner || b.member.getPreparation != b || !sameOperationRequest(b.member.request, b.request) || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || q.owner.program != b.owner.values.program || q.owner.checker != b.owner.checker || q.owner.checker != b.owner.values.checker || q.owner.generation != b.work.operationGeneration || b.owner.project.activeGeneration != b.work.operationGeneration || q.effectOwner != b.request.consumer {
		return false
	}
	publisher := b.owner.pendingMemberPublishers[q.effectOwner]
	caller, known := b.work.memberNodes[q.effectOwner]
	return known && caller >= 0 && caller < len(b.work.operationFacts) && publisher != nil && publisher.live && publisher.fact == b.fact && b.fact == &b.work.operationFacts[caller] && b.fact.sourceFile != nil && q.owner.program.GetSourceFile(b.fact.sourceFile.FileName()) == b.fact.sourceFile
}

// beginStagedGetPreparation is shared by ordinary source collection and the
// original constructed property-Get owner. Inventory admits only this existing
// conditional receiver domain; it never selects a constructor or a method.
func (work *callableEffectWork) beginStagedGetPreparation(facts []callableFacts, q *sourceValueQuery, parent sourceStagedOperationRequest, execution *sourceStagedGetPreparationExecution) (func(), *sourceStagedGetPreparationBorrow) {
	if work.purpose == callableMayEffects {
		return func() {}, nil
	}
	noop := func() {}
	if q == nil || q.owner == nil || q.executable == nil || q.executable.values == nil || q.executable.project == nil || q.stagedNativeGet != nil || q.inputs != nil || q.operation != nil || !q.dependenciesOnly || q.reading != parent.producer.operation || !validStagedMemberParent(parent) || !ast.IsPropertyAccessExpression(parent.producer.operation) || !ast.IsIdentifier(parent.producer.operation.Expression()) || q.effectOwner != parent.consumer || q.stagedMember == nil || q.stagedMember.issuer != q || !sameOperationRequest(q.stagedMember.request, parent) || q.owner.generation != work.operationGeneration || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker || q.owner.checker != q.executable.values.checker || q.executable.project.activeGeneration != work.operationGeneration {
		return noop, nil
	}
	node := parent.producer.operation
	read, _ := accessorEvaluationMode(node)
	if !read {
		return noop, nil
	}
	_, key := accessorReceiver(node)
	if key != "get" && key != "set" {
		return noop, nil
	}
	index := q.owner.index(ast.GetSourceFileOfNode(node))
	if index.incomplete || index.normalDynamicScope || len(stagedReceiverRelations(node.Expression(), q.owner, index).sites) == 0 {
		return noop, nil
	}
	caller, known := work.memberNodes[parent.consumer]
	publisher := q.executable.pendingMemberPublishers[parent.consumer]
	if !known || caller < 0 || caller >= len(facts) || caller >= len(work.operationFacts) || facts[caller].normalInputs != nil || facts[caller].initializerPlan != nil || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || publisher.fact != &work.operationFacts[caller] {
		return noop, nil
	}
	request := stagedGetPreparationRequest(parent)
	// A completed Get's aggregate cannot acquire a preparation child later.
	if prior, exists := work.operationRecipes[stagedMemberGetEffectsKey(parent)]; exists && prior.delta.extracted && (prior.memberSource == nil || prior.memberSource.getEffects == nil || !sameOperationRequest(prior.memberSource.getEffects.preparation, request)) {
		return noop, nil
	}
	recipe, exists := work.operationRecipes[request.producer]
	if exists {
		if !validStagedGetPreparationRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || !sameOperationRequest(recipe.memberSource.parent, parent) {
			return noop, nil
		}
	} else {
		recipe = sourceStagedOperationRecipe{key: request.producer, memberSource: &sourceStagedMemberSource{request: request, parent: parent, generation: work.operationGeneration, getPreparation: &sourceStagedGetPreparation{}}}
		if !work.registerOperationRecipe(facts, recipe) {
			return noop, nil
		}
	}
	id, adopted := work.requireOperation(facts, request)
	if !adopted {
		return noop, nil
	}
	state := &work.operations[id.index]
	if state.invalid || state.writerSourceRunning && !execution.claim(work, id, q.executable, publisher.fact) {
		return noop, nil
	}
	state.writerSourceRunning = true
	b := &sourceStagedGetPreparationBorrow{query: q, work: work, owner: q.executable, fact: publisher.fact, member: q.stagedMember, id: id, request: parent}
	b.self = b
	b.member.getPreparation = b
	work.attachSourceObservationDependencies(facts, id)
	// The existing original consumer retains the debt-only operation use. It is
	// not an ordinary Call use, input packet or acquired receiver.
	if !work.registerOperationUse(facts, sourceStagedOperationUse{request: request}) {
		state = &work.operations[id.index]
		state.writerSourceRunning = false
		b.member.getPreparation = nil
		b.self = nil
		return noop, nil
	}
	return func() {
		if b.member != nil && b.member.getPreparation == b {
			b.member.getPreparation = nil
		}
		work.operations[id.index].writerSourceRunning = false
		work.attachSourceObservationDependencies(facts, id)
		b.acquisition = nil
		b.self, b.query, b.owner, b.fact, b.member = nil, nil, nil, nil, nil
	}, b
}

func (work *callableEffectWork) retainGetPreparationRoot(facts []callableFacts, q *sourceValueQuery, b *sourceStagedGetPreparationBorrow, root sourceStagedOperationRequest) bool {
	if !b.live(q) || b.work != work || !work.getPreparationChildOwned(b.request, root) {
		return false
	}
	source := work.operationRecipes[root.producer]
	if !validStagedMemberCallRecipe(source) || source.memberSource.generation != work.operationGeneration || !sameOperationRequest(source.memberSource.request, root) {
		return false
	}
	recipe := work.operationRecipes[work.operations[b.id.index].key]
	if !validStagedGetPreparationRecipe(recipe) || recipe.delta.extracted && !operationContainsRequest(recipe.delta.required, root) {
		return false
	}
	if !operationContainsRequest(recipe.delta.required, root) {
		recipe.delta = cloneOperationDelta(recipe.delta)
		if nativeWriterScopeRequested(source) {
			copy := *recipe.memberSource
			preparation := *copy.getPreparation
			preparation.native = append(append([]sourceStagedGetPreparationNative(nil), preparation.native...), sourceStagedGetPreparationNative{parent: source.memberSource.parent, descriptor: descriptorCalleeRequested(source)})
			copy.getPreparation = &preparation
			recipe.memberSource = &copy
		}
		recipe.delta.required = append(recipe.delta.required, root)
		if !work.attachOperationSource(facts, recipe) {
			return false
		}
	}
	work.attachSourceObservationDependencies(facts, b.id)
	child := work.operationIDs[root.producer]
	return work.declarationWriterScopeDependency(b.id, child, root)
}

// finishStagedGetPreparation seals only the debt enumeration from this actual
// original traversal. The role still cannot pay Get/C/receiver completion.
func (work *callableEffectWork) finishStagedGetPreparation(facts []callableFacts, q *sourceValueQuery, b *sourceStagedGetPreparationBorrow, observed bool) bool {
	if !observed || !b.live(q) || b.work != work || b.dataPending {
		return false
	}
	recipe := work.operationRecipes[work.operations[b.id.index].key]
	if !validStagedGetPreparationRecipe(recipe) {
		return false
	}
	for _, root := range recipe.delta.required {
		if !work.getPreparationSourceRegistered(recipe.memberSource, root) || !work.getPreparationChildCurrent(root) {
			return false
		}
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.extracted = true
	if !work.attachOperationSource(facts, recipe) {
		return false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[recipe.key] = work.operationGeneration
	work.publishMemberSourceContributions(b.id)
	revisions := work.sourceObservationRevisions(b.id)
	if revisions == nil {
		return false
	}
	state := &work.operations[b.id.index]
	if work.getPreparationCurrent(stagedGetPreparationRequest(b.request)) {
		return true
	}
	observation := &sourceStagedGetPreparationObservation{id: b.id, revision: state.revision + 1, request: stagedGetPreparationRequest(b.request), generation: work.operationGeneration, revisions: append([]uint64(nil), revisions...), required: cloneOperationDelta(sourceStagedOperationDelta{required: recipe.delta.required}).required, observed: work.getPreparationObservationRequests(b.id)}
	observation.self = observation
	state.getPreparationObserved = observation
	state.revision++
	work.notifyOperationSubscribers(state)
	return true
}
