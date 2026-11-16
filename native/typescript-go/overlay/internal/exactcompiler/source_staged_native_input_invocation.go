package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeInputInvocation describes the selected algorithm's lack of
// a direct Call of its argument. Freeze's Proxy protocols remain separate. The Get
// cut is separate from the input endpoint's declaration-relative source cut.
// Cached descriptions carry no current-graph observation authority.
type sourceStagedNativeInputInvocation struct {
	request    sourceStagedOperationRequest
	input      sourceRelativeEndpoint
	cut        sourceRelativeCut
	generation *projectGeneration
}

func nativeInputInvocationRequest(source *sourceStagedNativeGetSource) sourceStagedOperationRequest {
	return nativeRootDebtRequest(source, "direct-input-invocation")
}

func nativeInputInvocationGetRequirements(source *sourceStagedNativeGetSource) []sourceStagedOperationRequest {
	required := append([]sourceStagedOperationRequest(nil), source.callResults...)
	required = append(required, source.memberSources...)
	if source.getContributions.producer.operation != nil {
		required = append(required, source.getContributions)
	}
	return append(required, source.selectionRequired...)
}

// nativeInputInvocationRequirements keeps the whole Call, its Get and every
// original observation premise. Equal operations with different full requests
// remain distinct; the algorithm child never substitutes for the whole Call.
func nativeInputInvocationRequirements(source *sourceStagedNativeGetSource) []sourceStagedOperationRequest {
	required := []sourceStagedOperationRequest{source.request, nativeRootDebtRequest(source, "callee-get")}
	for _, request := range nativeInputInvocationGetRequirements(source) {
		required = appendEntryLawRequirement(required, request)
	}
	if source.callAlternatives.producer.operation != nil {
		required = appendEntryLawRequirement(required, source.callAlternatives)
	}
	return required
}

// validNativeInputInvocationRecipe validates transport, not native selection.
// Only the original algorithm and complete Get publishers can supply the live
// observation required by a consumer in this graph.
func validNativeInputInvocationRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.nativeGet
	if source == nil || source.inputInvocation == nil || (source.kind != sourceNativeObjectFreeze && source.kind != sourceNativeObjectCreate) || !validStagedMemberParent(source.request) || source.request.edge == "" {
		return false
	}
	proof := source.inputInvocation
	call := source.request.producer.operation
	if call == nil || !ast.IsCallExpression(call) || !sameOperationRequest(proof.request, nativeInputInvocationRequest(source)) || recipe.key != proof.request.producer || !validStagedNativeCalleeEffects(sourceStagedNativeCalleeEffects{request: nativeRootDebtRequest(source, "callee-get"), cut: proof.cut, method: source.method, generation: proof.generation}, source) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 1 || ast.IsSpreadElement(actuals[0]) || !sameOperationEndpoint(proof.input, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals[0], producer: call, cut: source.request.cut}) {
		return false
	}
	if source.kind == sourceNativeObjectCreate && !validNativeInputCreatePrototype(source.prototype, proof.input, source.request.consumer) {
		return false
	}
	base := *source
	base.inputInvocation = nil
	get := sourceStagedOperationRecipe{key: nativeRootDebtRequest(source, "callee-get").producer, nativeGet: &base, delta: sourceStagedOperationDelta{required: nativeInputInvocationGetRequirements(source)}}
	if !validNativeGetRecipe(get) {
		return false
	}
	for _, required := range get.delta.required {
		allowed := required.producer.kind == relativeDemandEffects
		owned := required.consumer == source.request.consumer || validStagedModuleEntryRequirement(required)
		if required.producer.kind == relativeDemandDirectExposure {
			allowed = allowed || validNativeSourceDataRequirement(source, required)
		}
		if !allowed || !owned || required.inputs != nil {
			return false
		}
	}
	expected := sourceStagedOperationDelta{required: nativeInputInvocationRequirements(source), extracted: recipe.delta.extracted}
	return recipe.entryLaw == nil && recipe.constructionEffects == nil && recipe.hasInstance == nil && recipe.mapEntry == nil && recipe.mapProtocol == nil && recipe.writer == nil && recipe.constructedDisposition == nil && recipe.declarationCallGeneration == nil && recipe.callResult == nil && recipe.memberSource == nil && recipe.constructed == nil && recipe.assignment == nil && recipe.declarationCall == nil && recipe.getter == nil && recipe.returning == nil && len(recipe.writerRequired)+len(recipe.constructedGroup)+len(recipe.constructedInputs)+len(recipe.fieldForwards) == 0 && operationDeltaPrefix(expected, recipe.delta) && operationDeltaPrefix(recipe.delta, expected)
}

// admitStagedNativeInputInvocation retains the original selected algorithm's
// one input before Get completion. It creates no IDs, ordinary use or current
// disposition. The synchronous selection pointer is lent by the producer only.
func (work *callableEffectWork) admitStagedNativeInputInvocation(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource, selection *sourceStagedNativeSelection) (sourceStagedOperationRequest, bool) {
	if q == nil || q.owner == nil || source == nil || selection == nil || source.kind != sourceNativeObjectFreeze && source.kind != sourceNativeObjectCreate {
		return sourceStagedOperationRequest{}, false
	}
	b := q.stagedNativeGet
	if b == nil || b.issuer != q || b.owner != q.owner || b.generation != work.operationGeneration || b.generation != q.owner.generation || b.inputSelection != selection || b.call != selection.call || selection.call != source.request.producer.operation || selection.get != source.get || q.protectedMember != source.get || q.effectOwner != source.request.consumer || !q.dependenciesOnly || q.operation != nil || q.inputs != nil || !sameOperationRequest(selection.request, source.request) || selection.selected.node != source.method || selection.selected.native == nil || selection.selected.native.kind != source.kind || len(selection.actuals) != 1 {
		return sourceStagedOperationRequest{}, false
	}
	root := work.operationRecipes[source.request.producer]
	if !validNativeGetRecipe(root) || !sameNativeGetSource(root.nativeGet, source) {
		return sourceStagedOperationRequest{}, false
	}
	// Create's input owner must have admitted this same selected formal/null/
	// inert prototype association first. It grants only the original input read,
	// never properties, type purity, successful completion or a returned object.
	var prototype *sourceStagedCreatePrototype
	if source.kind == sourceNativeObjectCreate {
		algorithm := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer]
		if !validNativeGetRecipe(algorithm) || !sameNativeGetSource(algorithm.nativeGet, source) || algorithm.nativeGet.prototype == nil {
			return sourceStagedOperationRequest{}, false
		}
		actual, represented := describeStagedCreatePrototypeInput(selection.actuals[0], source.request.consumer, q.owner)
		prior := algorithm.nativeGet.prototype
		if !represented || !sameOperationEndpoint(actual.input, prior.input) || actual.formal != prior.formal {
			return sourceStagedOperationRequest{}, false
		}
		prototype = &actual
	}
	proof := &sourceStagedNativeInputInvocation{request: nativeInputInvocationRequest(source), input: cloneSourceRelativeEndpoint(selection.actuals[0]), cut: q.relativeInputCut(selection.call), generation: b.generation}
	copy := *source
	copy.inputInvocation = proof
	if prototype != nil {
		copy.prototype = prototype
	}
	recipe := sourceStagedOperationRecipe{key: proof.request.producer, nativeGet: &copy, delta: sourceStagedOperationDelta{required: nativeInputInvocationRequirements(&copy)}}
	prior, known := work.operationRecipes[recipe.key]
	if known {
		if !validNativeInputInvocationRecipe(prior) || !sameNativeGetSource(prior.nativeGet, source) || prior.nativeGet.inputInvocation.cut != proof.cut || !sameOperationEndpoint(prior.nativeGet.inputInvocation.input, proof.input) {
			return sourceStagedOperationRequest{}, false
		}
		if prototype != nil && (prior.nativeGet.prototype == nil || !sameOperationEndpoint(prior.nativeGet.prototype.input, prototype.input) || prior.nativeGet.prototype.formal != prototype.formal) {
			return sourceStagedOperationRequest{}, false
		}
		// Reissuing a completed immutable description never retracts it. The
		// new graph still needs a fresh complete Get observation below.
		copy = *prior.nativeGet
		copy.inputInvocation = proof
		recipe.nativeGet, recipe.delta = &copy, cloneOperationDelta(prior.delta)
	}
	if !validNativeInputInvocationRecipe(recipe) {
		return sourceStagedOperationRequest{}, false
	}
	accepted := false
	if known {
		accepted = work.attachOperationSource(facts, recipe)
	} else {
		accepted = work.registerOperationRecipe(facts, recipe)
	}
	if !accepted || q.stagedNativeGet != b || b.inputSelection != selection {
		return sourceStagedOperationRequest{}, false
	}
	b.inputInvocation = work.operationRecipes[recipe.key].nativeGet.inputInvocation
	work.notifyNativeWriterSourceRequests(facts, source)
	return proof.request, true
}

// observeStagedNativeInputInvocation joins the real algorithm admission to the
// complete original Get event. Neither cached calleeEntry nor a conditional
// standard prefix can issue this disposition. No Get/Call output is published.
func (work *callableEffectWork) observeStagedNativeInputInvocation(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource, get *sourceGetInputs, observed *sourceStagedNativeCalleeEffects) bool {
	if q == nil || q.owner == nil || source == nil || source.kind != sourceNativeObjectFreeze && source.kind != sourceNativeObjectCreate || observed == nil || get == nil {
		return false
	}
	if source.kind == sourceNativeObjectCreate && !observed.noUserEntry {
		return false // This is the original Get's law, never whole-Call NoUser.
	}
	b := q.stagedNativeGet
	if b == nil || b.issuer != q || b.owner != q.owner || b.generation != work.operationGeneration || b.generation != q.owner.generation || !b.finishing || !b.canonical || b.legacyPrepared || b.writerDependent || b.contextual || b.observedGet != get || b.observedCallee != observed || observed.generation != b.generation || b.inputInvocation == nil || !q.dependenciesOnly || q.operation != nil || q.inputs != nil || q.effectOwner != source.request.consumer || q.protectedMember != source.get || b.call != source.request.producer.operation || get.operation != b.call || !standardNativeLookup(get) || q.relativeInputCut(b.call) != observed.cut || !validStagedNativeCalleeEffects(*observed, source) {
		return false
	}
	request := nativeInputInvocationRequest(source)
	prior := work.operationRecipes[request.producer]
	if !validNativeInputInvocationRecipe(prior) || prior.nativeGet.inputInvocation != b.inputInvocation || b.inputInvocation.generation != b.generation || b.inputInvocation.cut != observed.cut {
		return false
	}
	callee := work.operationRecipes[nativeRootDebtRequest(source, "callee-get").producer]
	if !validNativeGetRecipe(callee) || !sameNativeGetSource(callee.nativeGet, source) {
		return false
	}
	copy := *callee.nativeGet
	copy.inputInvocation = b.inputInvocation
	if source.kind == sourceNativeObjectCreate {
		copy.prototype = prior.nativeGet.prototype
	}
	copy.memberSources = append([]sourceStagedOperationRequest(nil), b.memberSources...)
	for _, required := range copy.memberSources {
		childRecipe := work.operationRecipes[required.producer]
		child := childRecipe.memberSource
		if !validStagedMemberCoverageRecipe(childRecipe) || child == nil || child.coverage == nil || child.generation != b.generation || work.memberCoverageObserved[required.producer] != b.generation || !sameOperationRequest(child.parent, source.request) || !sameOperationRequest(child.request, required) {
			return false
		}
	}
	if copy.callAlternatives.producer.operation != nil {
		alternative := work.operationRecipes[copy.callAlternatives.producer]
		if !validStagedMemberCallRecipe(alternative) || alternative.memberSource.generation != b.generation || !alternative.delta.extracted || !alternative.memberSource.call.complete || len(alternative.memberSource.call.values) != 0 || work.memberCoverageObserved[alternative.key] != b.generation {
			return false
		}
	}
	recipe := sourceStagedOperationRecipe{key: request.producer, nativeGet: &copy, delta: sourceStagedOperationDelta{required: nativeInputInvocationRequirements(&copy), extracted: true}}
	if !validNativeInputInvocationRecipe(recipe) || !work.attachOperationSource(facts, recipe) || q.stagedNativeGet != b || b.observedGet != get || b.observedCallee != observed {
		return false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[recipe.key] = b.generation
	work.notifyNativeWriterSourceRequests(facts, source)
	return true
}

// nativeInputInvocationCurrent excludes cached descriptions and admission-only
// prefixes. Dependency closure is separate from this original local observation.
func (work *callableEffectWork) nativeInputInvocationCurrent(recipe sourceStagedOperationRecipe) bool {
	if work.operationGeneration == nil || !validNativeInputInvocationRecipe(recipe) || !recipe.delta.extracted || recipe.nativeGet.inputInvocation.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	if recipe.nativeGet.kind == sourceNativeObjectCreate {
		proof := work.currentNativeCalleeEffects(recipe.nativeGet)
		return proof != nil && proof.noUserEntry && work.nativeEffectsGetCurrent(recipe.nativeGet)
	}
	return true // Preserve the existing Freeze source-observation domain.
}

func (work *callableEffectWork) publishNativeInputInvocation(id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if work.nativeInputInvocationCurrent(recipe) {
		work.publishOperation(id, recipe.delta)
	}
}

// nativeInputInvocationReading keeps the original algorithm/Get observation
// unchanged while subscribing the actual reader's C at its own graph cut.
func nativeInputInvocationReading(source, coverage sourceStagedOperationRequest) sourceStagedOperationRequest {
	request := source
	request.consumer, request.cut, request.reading = coverage.consumer, coverage.cut, coverage.producer
	request.edge = coverage.edge + ":direct-input:" + source.edge
	return request
}

func nativeInputInvocationReadingShape(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	return validNativeInputInvocationRecipe(recipe) && request.producer == recipe.key && request.reading != (sourceStagedOperationKey{}) && request.reading.kind == relativeDemandEffects && request.consumer == request.reading.declaration && request.inputs == nil && request.use == recipe.nativeGet.request.use && request.cut == (sourceRelativeCut{operation: request.reading.operation, use: request.reading.operation, reading: request.reading.operation})
}

func (work *callableEffectWork) describedNativeInputInvocationReading(request sourceStagedOperationRequest) bool {
	recipe := work.operationRecipes[request.producer]
	if !nativeInputInvocationReadingShape(recipe, request) || !work.requestedWriterSourceSupported(recipe) {
		return false
	}
	if _, provided := work.nativeObserverInputAssociation(request); provided {
		return true
	}
	parent := work.operationRecipes[request.reading]
	return validStagedMemberCoverageRecipe(parent) && parent.memberSource.generation == work.operationGeneration && sameOperationRequest(request, nativeInputInvocationReading(recipe.nativeGet.inputInvocation.request, parent.memberSource.request))
}

func (work *callableEffectWork) acceptedNativeInputInvocationReading(request sourceStagedOperationRequest) bool {
	return work.describedNativeInputInvocationReading(request) && work.nativeInputInvocationCurrent(work.operationRecipes[request.producer])
}

// stagedNativeInputInvocationOwner identifies the original operation namespace.
// A later reader never becomes the producer by referring to this Call.
func stagedNativeInputInvocationOwner(call *ast.Node) *ast.Node {
	if owner := sourceStagedEvaluationOwner(call); owner != nil {
		return owner
	}
	return sourceStagedModuleOwner(call)
}

func (work *callableEffectWork) currentNativeInputInvocationSource(call *ast.Node) (sourceStagedOperationRecipe, bool) {
	if call == nil || !ast.IsCallExpression(call) {
		return sourceStagedOperationRecipe{}, false
	}
	producer := stagedNativeInputInvocationOwner(call)
	key := sourceStagedOperationKey{declaration: producer, operation: call, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: call.Expression(), field: "direct-input-invocation"}}
	recipe := work.operationRecipes[key]
	return recipe, producer != nil && work.nativeInputInvocationCurrent(recipe) && recipe.nativeGet.request.consumer == producer
}

// consumeStagedNativeInputInvocation requires the current local law before any
// input/result acquisition. All source memberships precede the used-premise
// commit, which retains both the disposition and the entire original Call.
func (work *callableEffectWork) consumeStagedNativeInputInvocation(facts []callableFacts, q *sourceValueQuery, call *ast.Node) sourceStagedWriterCallDisposition {
	b := q.stagedMember
	if b == nil || b.checkingCall != call || call == nil || !ast.IsCallExpression(call) || !q.liveStagedMemberSource(b, b.get, b.read) {
		return sourceStagedWriterCallDisposition{}
	}
	recipe, current := work.currentNativeInputInvocationSource(call)
	key := recipe.key
	if !current || recipe.nativeGet.request.consumer != q.effectOwner {
		return sourceStagedWriterCallDisposition{}
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 1 || actuals[0] != recipe.nativeGet.inputInvocation.input.expression || recipe.nativeGet.get != call.Expression() || b.coverage == nil {
		return sourceStagedWriterCallDisposition{}
	}
	observation := q.relativeInputCut(b.get.operation)
	reading := nativeInputInvocationReading(recipe.nativeGet.inputInvocation.request, b.coverage.request)
	if !work.requireStagedMemberChild(facts, q, reading) {
		return sourceStagedWriterCallDisposition{}
	}
	id, adopted := work.requireOperation(facts, reading)
	if !adopted {
		return sourceStagedWriterCallDisposition{}
	}
	result := sourceStagedWriterCallDisposition{handled: true}
	work.extractOperation(facts, callableExtractionTask{operation: id}, q.executable)
	delivery, delivered := work.consumeOperation(id, reading)
	if !delivered || !delivery.delta.extracted || !operationDeltaPrefix(recipe.delta, delivery.delta) || !operationDeltaPrefix(delivery.delta, recipe.delta) {
		return result
	}
	if !q.liveStagedMemberSource(b, b.get, b.read) || q.relativeInputCut(b.get.operation) != observation || !work.nativeInputInvocationCurrent(work.operationRecipes[key]) {
		return sourceStagedWriterCallDisposition{}
	}
	b.selectionRequired = appendEntryLawRequirement(b.selectionRequired, recipe.nativeGet.request)
	b.selectionRequired = appendEntryLawRequirement(b.selectionRequired, reading)
	result.excluded = true
	return result
}
