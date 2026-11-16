package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedMemberCall contains source alternatives handed off by an actual
// callee Get. It is not the selected-only native receipt. Independent source
// requirements retain unrepresented Get/receiver/input producers. Returned and
// stored source values never subscribe to this actual Call role implicitly.
type sourceStagedMemberCall struct {
	sourceRequest *sourceStagedMemberCallRequest // Original source task description; never a callee observation.
	// Conditional method branches supply no selected Call or returned value.
	standard []sourceStagedConstructedMember
	storage  []sourceStagedMethodStorage // Original storage-only receiver dependencies, never a normal result.
	values   []sourceStagedOperationAlternative
	mapped   []bool
	complete bool
}

func describeStagedMemberCallAlternatives(source *sourceStagedNativeGetSource, result *accessorCandidates, owner *executableBodyOwner, cut sourceRelativeCut) *sourceStagedMemberCall {
	call := &sourceStagedMemberCall{complete: result != nil && !result.opaque && !result.valueIncomplete && !result.receiverIncomplete && !result.fieldReceiverIncomplete}
	if result == nil {
		return call
	}
	for _, value := range result.values {
		if value.native != nil && value.node == source.method && value.native.kind == source.kind && !value.native.referencesIncomplete && len(value.path) == 0 {
			continue // This conditional invocation belongs to the algorithm owner.
		}
		if value.node == nil || !ast.IsFunctionLike(value.node) || value.node.Body() == nil || len(value.path) != 0 {
			call.complete = false
			continue
		}
		binding, gap := describeRelativeBoundValues([]sourceValue{value}, sourceRelativeRole{}, cut)
		if gap != relativeInputsSupported || binding.unknown || len(binding.pending) != 0 || len(binding.sources) != 1 {
			call.complete = false
		}
		if len(binding.sources) != 1 {
			continue
		}
		mapped := len(value.node.Parameters()) == 0 && stagedFieldGetterInputsMapped(value.node, nil, owner)
		call.values = append(call.values, sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(binding.sources[0])})
		call.mapped = append(call.mapped, mapped)
		call.complete = call.complete && mapped
	}
	return call
}

func validStagedMemberCallRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	source := recipe.memberSource
	if source == nil || source.call == nil || !source.candidate.invoking || !source.candidate.protocol || source.generation == nil || !stagedMemberFactoryParent(source) || !ast.IsCallExpression(source.parent.producer.operation) || len(source.call.values) != len(source.call.mapped) || !sameOperationRequest(source.request, stagedMemberCallSourceRequest(source)) || source.request.producer != recipe.key || source.coverage != nil || source.getEffects != nil || !stagedMemberFactoryObservation(source, source.candidate.cut) || source.candidate.operation != source.parent.producer.operation || source.candidate.value.expression != source.parent.producer.operation.Expression() || recipe.delta.extracted != source.call.complete {
		return false
	}
	if recipe.nativeGet != nil || recipe.callResult != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 {
		return false
	}
	expected := sourceStagedOperationDelta{extracted: source.call.complete}
	if source.call.sourceRequest != nil {
		if !validStagedMemberCallSourceRequest(source.call.sourceRequest, source) {
			return false
		}
		expected.required = append(expected.required, source.call.sourceRequest.required...)
		if source.call.sourceRequest.nativeInput || source.call.sourceRequest.descriptorCallee {
			return len(source.call.standard)+len(source.call.values)+len(source.call.storage) == 0 && operationDeltaPrefix(expected, recipe.delta) && operationDeltaPrefix(recipe.delta, expected)
		}
		if len(source.call.standard)+len(source.call.values) == 0 {
			return !source.call.complete && !recipe.delta.extracted && len(source.call.storage) == 0 && operationDeltaPrefix(expected, recipe.delta) && operationDeltaPrefix(recipe.delta, expected)
		}
	}
	for _, branch := range source.call.standard {
		if !validConstructedMemberSource(&branch) || !sameOperationRequest(branch.request, source.parent) || !branch.construction.selectionComplete || branch.get != source.candidate.value.expression || branch.cut != source.candidate.cut || branch.construction.site.AsNewExpression().Arguments != nil && len(branch.construction.site.AsNewExpression().Arguments.Nodes) != 0 {
			return false
		}
		for _, required := range standardMemberCallRequirements(&branch) {
			expected.required = appendEntryLawRequirement(expected.required, required)
		}
	}
	for _, storage := range source.call.storage {
		if !validMethodStorage(storage, source.call.standard) {
			return false
		}
		for _, required := range methodStorageRequirements(storage) {
			expected.required = appendEntryLawRequirement(expected.required, required)
		}
	}
	if !operationDeltaPrefix(expected, recipe.delta) || !operationDeltaPrefix(recipe.delta, expected) {
		return false
	}
	for index, alternative := range source.call.values {
		body := alternative.endpoint.expression
		if alternative.endpoint.kind != relativeEndpointExpression || body == nil || !ast.IsFunctionLike(body) || body.Body() == nil || source.call.complete && !source.call.mapped[index] || source.call.mapped[index] && len(body.Parameters()) != 0 {
			return false
		}
	}
	return recipe.nativeGet == nil && recipe.callResult == nil && recipe.constructed == nil && recipe.mapEntry == nil && recipe.mapProtocol == nil && recipe.writer == nil && recipe.getter == nil && recipe.returning == nil && recipe.constructedDisposition == nil && len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) == 0
}

// prepareStagedMemberCall consumes only a fresh original callee observation.
// Canonical body membership precedes summary delivery. Bodies whose receiver,
// captures or input protocol remain unmapped retain their known requirement,
// without a fabricated binder edge or repeated input acquisition.
func (work *callableEffectWork) prepareStagedMemberCall(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	source := recipe.memberSource
	if source == nil || source.call == nil || owner == nil || source.generation != owner.values.generation || work.memberCoverageObserved[recipe.key] != source.generation {
		return
	}
	consumer := work.memberNodes[source.request.consumer]
	for index, alternative := range source.call.values {
		target, known := work.memberNodes[alternative.endpoint.expression]
		if !known {
			continue
		}
		edge := fmt.Sprintf("%s:body:%s", source.request.edge, facts[target].summary.ID)
		work.requireStagedSummary(facts, consumer, target, edge, source.parent.producer.operation, source.parent.cut)
		present := false
		for _, prior := range work.operations[id.index].memberActivations {
			present = present || prior.edge == edge
		}
		if !present {
			work.operations[id.index].memberActivations = append(work.operations[id.index].memberActivations, sourceStagedMemberRequirement{producer: target, edge: edge})
		}
		if source.call.complete && source.call.mapped[index] && facts[target].staged.ready {
			work.operationInvocationOnEdge(facts, consumer, target, source.parent.producer.operation, source.parent.cut, edge)
			work.observeStagedSummary(facts, consumer, target, edge)
		}
	}
	if recipe.delta.extracted {
		if operationDeltaSize(recipe.delta) == 0 {
			work.publishSourceDisposition(id)
		} else {
			work.publishOperation(id, recipe.delta)
		}
	}
}

// standardMemberCallRequirements retains the original method and all source
// owners independently of this branch's lack of key/payload invocation.
func standardMemberCallRequirements(source *sourceStagedConstructedMember) []sourceStagedOperationRequest {
	return []sourceStagedOperationRequest{source.request, constructedMemberRequest(source, "own-writers"), constructedMemberRequest(source, "eager-inputs"), constructedMemberRequest(source, "callee"), stagedMemberCoverageRequest(source.request, source.construction.site, source.cut)}
}

// registerStagedStandardMemberCall accepts only the original producer's scoped
// post-Get event. Local method accounting retains every independent source debt.
// It never enrolls ordinary execution or supplies selected Call/output authority.
func (work *callableEffectWork) registerStagedStandardMemberCall(facts []callableFacts, q *sourceValueQuery, source sourceStagedConstructedMember) (sourceStagedOperationRequest, bool) {
	return work.registerStagedStandardMemberCallSource(facts, q, source, true)
}

// registerStagedPendingStandardMemberCall retains an authentic conditional branch
// before its full Get disposition. Registration supplies no observation receipt.
func (work *callableEffectWork) registerStagedPendingStandardMemberCall(facts []callableFacts, q *sourceValueQuery, source sourceStagedConstructedMember) (sourceStagedOperationRequest, bool) {
	return work.registerStagedStandardMemberCallSource(facts, q, source, false)
}

func (work *callableEffectWork) registerStagedStandardMemberCallSource(facts []callableFacts, q *sourceValueQuery, source sourceStagedConstructedMember, complete bool) (sourceStagedOperationRequest, bool) {
	if q == nil || q.owner == nil || q.executable == nil || !validConstructedMemberSource(&source) {
		return sourceStagedOperationRequest{}, false
	}
	borrow, member := q.stagedConstructedMember, q.stagedMember
	if member == nil || borrow == nil || !borrow.live || borrow.owner != q || borrow.issued == nil || borrow.generation != work.operationGeneration || q.owner.generation != work.operationGeneration || !sameOperationRequest(borrow.request, source.request) || borrow.site != source.construction.site || borrow.cut != source.cut || q.relativeInputCut(source.request.producer.operation) != source.cut {
		return sourceStagedOperationRequest{}, false
	}
	issued := false
	for _, branch := range work.operationRecipes[source.request.producer].constructedGroup {
		issued = issued || sameConstructedMemberSource(&branch, &source)
	}
	if !issued {
		return sourceStagedOperationRequest{}, false
	}
	if complete && (!borrow.finishing || !q.liveStagedMemberSource(member, borrow.issued, member.read) || member.coverage == nil) {
		return sourceStagedOperationRequest{}, false
	}
	construction, published := q.executable.standardConstructions[source.construction.site]
	coverage := stagedMemberCoverageRequest(source.request, source.construction.site, source.cut)
	observed := work.operationRecipes[coverage.producer]
	if !published || construction != source.construction || !construction.selectionComplete || complete && (!sameOperationRequest(member.coverage.request, coverage) || !validStagedMemberCoverageRecipe(observed) || work.memberCoverageObserved[coverage.producer] != work.operationGeneration || observed.memberSource.generation != work.operationGeneration) {
		return sourceStagedOperationRequest{}, false
	}
	// Pending method publication may already have an adopted request-only
	// consumer. Its exact C child must exist before attachment registers edges.
	if !complete && !work.registerConstructedCoveragePrefix(facts, q, source) {
		return sourceStagedOperationRequest{}, false
	}
	candidate := sourceStagedMemberCandidate{request: source.request, operation: source.request.producer.operation, origin: source.construction.site, protocol: true, invoking: true, cut: source.cut}
	candidate.value = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: source.get, producer: candidate.operation, cut: source.cut}
	request := stagedMemberCandidateRequest(source.request, candidate)
	var storage []sourceStagedMethodStorage
	if complete {
		caller, known := work.memberNodes[q.effectOwner]
		if !known {
			return sourceStagedOperationRequest{}, false
		}
		var covered bool
		storage, covered = work.constructedStandardMethodStorage(facts, caller, &source, q.executable)
		if !covered {
			return sourceStagedOperationRequest{}, false
		}
	}
	var description *sourceStagedMemberCallRequest
	if prior := work.operationRecipes[request.producer].memberSource; prior != nil && prior.call != nil {
		description = prior.call.sourceRequest
	}
	call := &sourceStagedMemberCall{standard: []sourceStagedConstructedMember{cloneConstructedMemberSource(source)}, storage: storage, sourceRequest: description, complete: complete}
	recipe := sourceStagedOperationRecipe{key: request.producer, memberSource: &sourceStagedMemberSource{request: request, parent: source.request, candidate: candidate, generation: work.operationGeneration, call: call}, delta: sourceStagedOperationDelta{extracted: complete, required: standardMemberCallRequirements(&source)}}
	if description != nil {
		required := append([]sourceStagedOperationRequest(nil), description.required...)
		for _, child := range recipe.delta.required {
			required = appendEntryLawRequirement(required, child)
		}
		recipe.delta.required = required
	}
	for _, relation := range storage {
		for _, required := range methodStorageRequirements(relation) {
			recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, required)
		}
	}
	if !validStagedMemberCallRecipe(recipe) {
		return sourceStagedOperationRequest{}, false
	}
	if prior, exists := work.operationRecipes[recipe.key]; exists && (prior.memberSource == nil || prior.memberSource.call == nil || len(prior.memberSource.call.values) != 0) {
		return sourceStagedOperationRequest{}, false
	}
	if prior, exists := work.operationRecipes[recipe.key]; exists && !complete && prior.delta.extracted {
		return request, validStagedMemberCallRecipe(prior)
	}
	if _, exists := work.operationRecipes[recipe.key]; !exists {
		if !work.registerOperationRecipe(facts, recipe) {
			return sourceStagedOperationRequest{}, false
		}
	} else if !work.attachOperationSource(facts, recipe) {
		return sourceStagedOperationRequest{}, false
	}
	if complete {
		work.memberCoverageObserved[recipe.key] = work.operationGeneration
	}
	return request, true
}

// sourceStagedWriterCallDisposition distinguishes source ownership from the
// locally delivered method law. Pending ownership never retires discovery.
type sourceStagedWriterCallDisposition struct {
	handled, excluded, compilerPending, calleeCovered bool
	calleeOnly                                        bool // Exact callee discovery only; arguments/captures remain independently owned.
}

func (q *sourceValueQuery) stagedWriterCall(call *ast.Node) sourceStagedWriterCallDisposition {
	b := q.stagedMember
	if b == nil {
		return sourceStagedWriterCallDisposition{}
	}
	return q.borrowStagedWriterCall(call, b.writerCall)
}

func (q *sourceValueQuery) stagedNativeInputCall(call *ast.Node) sourceStagedWriterCallDisposition {
	b := q.stagedMember
	if b == nil {
		return sourceStagedWriterCallDisposition{}
	}
	return q.borrowStagedWriterCall(call, b.nativeInputCall)
}

// borrowStagedWriterCall shares the original Get loan across the two explicit
// invocation-demand owners. A callback never acquires a scope or outlives it.
func (q *sourceValueQuery) borrowStagedWriterCall(call *ast.Node, consume func(*ast.Node) sourceStagedWriterCallDisposition) sourceStagedWriterCallDisposition {
	b := q.stagedMember
	if b == nil || consume == nil || b.checkingCall != nil || !q.liveStagedMemberSource(b, b.get, b.read) {
		return sourceStagedWriterCallDisposition{}
	}
	get, read, cut := b.get, b.read, q.relativeInputCut(b.get.operation)
	b.checkingCall = call
	defer func() { b.checkingCall = nil }()
	result := consume(call)
	if q.stagedMember != b || b.checkingCall != call || !q.liveStagedMemberSource(b, get, read) || q.relativeInputCut(get.operation) != cut {
		return sourceStagedWriterCallDisposition{}
	}
	return result
}

func (work *callableEffectWork) consumeStagedStandardWriterCall(facts []callableFacts, q *sourceValueQuery, call *ast.Node) sourceStagedWriterCallDisposition {
	b := q.stagedMember
	caller := enclosingCallableNode(call)
	if caller == nil {
		caller = sourceStagedModuleOwner(call)
	}
	index, known := work.memberNodes[caller]
	if b == nil || b.checkingCall != call || !known || !q.liveStagedMemberSource(b, b.get, b.read) {
		return sourceStagedWriterCallDisposition{}
	}
	request, registered := work.prepareStagedStandardMemberCall(facts, index, call, q.executable)
	if registered && b.coverage != nil {
		request = stagedStandardMemberCallReading(request, b.coverage.request)
	}
	if !registered || !work.requireStagedMemberChild(facts, q, request) {
		return sourceStagedWriterCallDisposition{}
	}
	id, subscribed := work.requireOperation(facts, request)
	if !subscribed {
		return sourceStagedWriterCallDisposition{}
	}
	result := sourceStagedWriterCallDisposition{handled: true}
	recipe := work.operationRecipes[request.producer]
	if !validStagedMemberCallRecipe(recipe) || len(recipe.memberSource.call.standard) == 0 || len(recipe.memberSource.call.values) != 0 || !recipe.delta.extracted || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return result
	}
	// Publish only this original role's local contribution. Its full required
	// graph still closes through the existing queue, independently of this law.
	work.extractOperation(facts, callableExtractionTask{operation: id}, q.executable)
	delivery, delivered := work.consumeOperation(id, request)
	if !delivered || !delivery.delta.extracted || len(delivery.delta.exposures)+len(delivery.delta.effects)+len(delivery.delta.invoked)+len(delivery.delta.relative)+len(delivery.delta.residuals) != 0 {
		return result
	}
	if !q.liveStagedMemberSource(b, b.get, b.read) {
		return sourceStagedWriterCallDisposition{}
	}
	b.selectionRequired = appendEntryLawRequirement(b.selectionRequired, request)
	result.excluded = true
	return result
}

// stagedStandardMemberCallReading subscribes one original parent source set.
// The method producer and physical Get cut remain on the source description.
func stagedStandardMemberCallReading(source, coverage sourceStagedOperationRequest) sourceStagedOperationRequest {
	r := source
	r.consumer, r.cut, r.reading = coverage.consumer, coverage.cut, coverage.producer
	r.edge = coverage.edge + ":method:" + source.edge
	return r
}

func standardMemberCallReadingShape(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	s := recipe.memberSource
	return s != nil && s.call != nil && (len(s.call.standard) != 0 || s.call.sourceRequest != nil) && len(s.call.values) == 0 && request.producer == recipe.key && request.reading != (sourceStagedOperationKey{}) && request.reading.kind == relativeDemandEffects && request.consumer == request.reading.declaration && request.inputs == nil && request.use == s.request.use && request.cut == (sourceRelativeCut{operation: request.reading.operation, use: request.reading.operation, reading: request.reading.operation})
}

func (work *callableEffectWork) acceptedStandardMemberCallReading(request sourceStagedOperationRequest) bool {
	recipe := work.operationRecipes[request.producer]
	if !standardMemberCallReadingShape(recipe, request) || !validStagedMemberCallRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration {
		return false
	}
	if _, native := work.nativeObserverInputAssociation(request); native {
		return true
	}
	parent := work.operationRecipes[request.reading]
	return validStagedMemberCoverageRecipe(parent) && parent.memberSource.generation == work.operationGeneration && sameOperationRequest(request, stagedStandardMemberCallReading(recipe.memberSource.request, parent.memberSource.request))
}

func (work *callableEffectWork) stagedMemberCallReading(request, parent sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	if association, native := work.nativeObserverInputAssociation(request); native {
		return sameOperationRequest(association.observer.request, parent) && association.observer.cut == cut
	}
	if work.describedNativeInputInvocationReading(request) {
		source := work.operationRecipes[request.reading].memberSource
		return sameOperationRequest(source.parent, parent) && source.coverage.cut == cut
	}
	if !work.acceptedStandardMemberCallReading(request) {
		return false
	}
	source := work.operationRecipes[request.reading].memberSource
	return sameOperationRequest(source.parent, parent) && source.coverage.cut == cut
}
