package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeArgumentDescription survives graph cloning. It describes
// the original source association; only a new source event supplies ordering.
type sourceStagedNativeArgumentDescription struct {
	outerRequest, childRequest  sourceStagedOperationRequest
	module, outer, child, get   *ast.Node
	outerCut, sourceCut, mapCut sourceRelativeCut
}

// sourceStagedModuleArgumentSource is a demanded source observation, not an
// initializer execution or an ordinary Call use. Order is graph-local only.
type sourceStagedModuleArgumentSource struct {
	request, mapping sourceStagedOperationRequest
	description      sourceStagedNativeArgumentDescription
	generation       *projectGeneration
	order            *sourceStagedNativeArgumentOrder
}

func stagedModuleArgumentRequest(source *sourceStagedNativeGetSource) sourceStagedOperationRequest {
	plan := source.descriptorMap
	description := plan.argumentSource
	request := description.outerRequest
	request.producer.selector = sourceStagedOperationSelector{occurrence: description.child, association: plan.descriptors.expression, field: "module-argument-source"}
	request.reading = plan.protocol.producer
	request.edge = plan.protocol.edge + ":module-argument-source"
	return request
}

func sameStagedModuleArgumentSource(a, b *sourceStagedModuleArgumentSource) bool {
	return a == b || a != nil && b != nil && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.mapping, b.mapping) && a.description == b.description && a.generation == b.generation
}

func validStagedModuleArgumentRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.moduleArgument
	if source == nil || source.generation == nil || recipe.key != source.request.producer || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects)+len(recipe.delta.residuals) != 0 || len(recipe.delta.required) != 1 {
		return false
	}
	d := source.description
	if !runtimeVariableInitializer(d.module) || !ast.IsCallExpression(d.outer) || !ast.IsCallExpression(d.child) || d.get != d.child.Expression() || d.outerRequest.consumer != d.module || d.childRequest.consumer != d.module || d.outerRequest.producer.operation != d.outer || d.childRequest.producer.operation != d.child || !validStagedMemberParent(d.outerRequest) || !validStagedMemberParent(d.childRequest) || !sourceStagedOccurrenceOwned(d.outer, d.module) || d.mapCut.operation != d.child || d.mapCut.reading != d.child || d.outerCut.operation != d.outer || d.outerCut.reading != d.outer || d.sourceCut.operation != d.child || d.sourceCut.reading != d.child {
		return false
	}
	declarations := d.module.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes
	actuals := restrictedInvocationArguments(d.outer.AsCallExpression())
	if len(declarations) != 1 || declarations[0].Initializer() != d.outer || len(actuals) != 1 || actuals[0] != d.child || source.mapping.producer.operation != d.child || source.mapping.consumer != d.module || source.mapping.producer.selector.field != "descriptor-map" {
		return false
	}
	request := d.outerRequest
	request.producer.selector = sourceStagedOperationSelector{occurrence: d.child, association: source.mapping.producer.selector.occurrence, field: "module-argument-source"}
	request.reading = source.mapping.producer
	request.edge = source.mapping.edge + ":module-argument-source"
	parent := sourceStagedNativeGetSource{request: d.outerRequest, get: d.outer.Expression()}
	return sameOperationRequest(request, source.request) && sameOperationRequest(recipe.delta.required[0], nativeRootDebtRequest(&parent, "callee-get"))
}

func (work *callableEffectWork) moduleArgumentSourceCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validStagedModuleArgumentRecipe(recipe) || !recipe.delta.extracted || recipe.moduleArgument.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	source := recipe.moduleArgument
	p := source.order
	return p != nil && p.issuer == p && p.epoch == work.operationEpoch && p.generation == work.operationGeneration && p.module == source.description.module && p.outer == source.description.outer && p.child == source.description.child && p.get == source.description.get && p.outerCut == source.description.outerCut && p.sourceCut == source.description.sourceCut && p.mapCut == source.description.mapCut
}

func (work *callableEffectWork) moduleArgumentTaskOwned(recipe sourceStagedOperationRecipe) bool {
	if !validStagedModuleArgumentRecipe(recipe) || recipe.moduleArgument.generation != work.operationGeneration {
		return false
	}
	source := recipe.moduleArgument
	id, adopted := work.operationIDs[recipe.key]
	mapping, registered := work.operationIDs[source.mapping.producer]
	if !adopted || !registered || id.epoch != work.operationEpoch || mapping.epoch != work.operationEpoch || id.index == 0 || mapping.index == 0 || int(id.index) >= len(work.operations) || int(mapping.index) >= len(work.operations) || work.operations[id.index].invalid || work.operations[mapping.index].invalid {
		return false
	}
	subscriber := work.operations[id.index].subscribers[sourceStagedOperationConsumer{source.request.consumer, source.request.edge}]
	return subscriber != nil && !subscriber.blocked && sameOperationRequest(subscriber.request, source.request) && operationContainsRequest(work.operationRecipes[source.mapping.producer].delta.required, source.request)
}

func operationContainsRequest(requests []sourceStagedOperationRequest, request sourceStagedOperationRequest) bool {
	for _, prior := range requests {
		if sameOperationRequest(prior, request) {
			return true
		}
	}
	return false
}

// registerStagedModuleArgumentSource is called before any map Enum/C source
// traversal. It registers the exact subscriber without issuing an observation.
func (work *callableEffectWork) registerStagedModuleArgumentSource(facts []callableFacts, source *sourceStagedNativeGetSource) (sourceStagedOperationRequest, bool) {
	if source == nil || source.descriptorMap == nil || source.descriptorMap.argumentSource == nil {
		return sourceStagedOperationRequest{}, false
	}
	plan := source.descriptorMap
	request := stagedModuleArgumentRequest(source)
	parent := sourceStagedNativeGetSource{request: plan.argumentSource.outerRequest, get: plan.argumentSource.outer.Expression()}
	description := &sourceStagedModuleArgumentSource{request: request, mapping: plan.protocol, description: *plan.argumentSource, generation: work.operationGeneration}
	recipe := sourceStagedOperationRecipe{key: request.producer, moduleArgument: description, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{nativeRootDebtRequest(&parent, "callee-get")}}}
	if !work.registerOperationSourcePrefix(facts, recipe) {
		return sourceStagedOperationRequest{}, false
	}
	return request, true
}

// prepareStagedModuleArgumentSource owns only the demanded original Gets. The
// distinct task lease never changes work.extracting or enters a runtime body.
func (work *callableEffectWork) prepareStagedModuleArgumentSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || owner == nil || owner.values == nil {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !work.moduleArgumentTaskOwned(recipe) || work.operations[id.index].moduleArgumentRunning {
		return
	}
	if work.moduleArgumentSourceCurrent(recipe) {
		work.publishOperation(id, recipe.delta)
		return
	}
	source := recipe.moduleArgument
	caller, known := work.memberNodes[source.description.module]
	if !known || caller >= len(facts) || facts[caller].normalInputs != nil {
		return
	}
	// Fact registration establishes this synchronous publisher lifetime. The
	// adopted exact task/subscriber above supplies the separate entry authority.
	restoreFacts := registerWriterInputFacts(owner, facts, work)
	defer restoreFacts()
	publisher := owner.pendingMemberPublishers[source.description.module]
	file := ast.GetSourceFileOfNode(source.description.module)
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || owner.values.generation != source.generation || file == nil || owner.values.program.GetSourceFile(file.FileName()) != file {
		return
	}
	index := owner.values.index(file)
	occurrence := index.normalOccurrences[source.description.outer]
	population := owner.values.normalPopulation(file.AsNode())
	if index.incomplete || occurrence == nil || !occurrence.once || occurrence.region != nil || occurrence.statement != source.description.module || population == nil || population.moduleEntry(source.description.outer, source.description.module) != occurrence {
		return
	}
	work.operations[id.index].moduleArgumentRunning = true
	defer func() { work.operations[id.index].moduleArgumentRunning = false }()
	entry := &sourceStagedNativeArgumentEntry{work: work, facts: facts, fact: &facts[caller], owner: owner, root: source.description.outer, caller: caller, active: true, task: id}
	entry.issuer = entry
	defer func() { entry.active = false }()
	work.describeNativeInputOccurrenceInEntry(facts, caller, source.description.outer, owner, entry, nil)
	if entry.observed == nil {
		return
	}
	next := *source
	next.order = entry.observed
	recipe.moduleArgument = &next
	recipe.delta.extracted = true
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[recipe.key] = work.operationGeneration
	work.attachOperationSource(facts, recipe)
}

func (work *callableEffectWork) stagedModuleArgumentApplied(source *sourceStagedNativeGetSource) bool {
	request := stagedModuleArgumentRequest(source)
	recipe := work.operationRecipes[request.producer]
	id, registered := work.operationIDs[request.producer]
	if !registered || id.epoch != work.operationEpoch || !work.moduleArgumentSourceCurrent(recipe) {
		return false
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	return subscriber != nil && !subscriber.blocked && subscriber.applied == state.revision && state.revision != 0
}

// afterStagedModuleArgumentDelivery resumes only existing demanded tasks after
// a new revision was applied. Coalescing ignores already consumed queue entries.
func (work *callableEffectWork) afterStagedModuleArgumentDelivery(facts []callableFacts, id sourceStagedOperationID, request sourceStagedOperationRequest) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || state.revision == 0 {
		return
	}
	queue := func(key sourceStagedOperationKey) {
		next, exists := work.operationIDs[key]
		if !exists {
			return
		}
		for _, task := range work.extractionQueue[work.extractionHead:] {
			if !task.operationDone && !task.delivery && task.operation == next {
				return
			}
		}
		work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[key.declaration], operation: next})
	}
	if recipe := work.operationRecipes[state.key]; recipe.moduleArgument != nil && work.validModuleArgumentReading(recipe, request) && work.moduleArgumentSourceCurrent(recipe) {
		queue(request.reading)
		return
	}
	for _, recipe := range work.operationRecipes {
		if recipe.moduleArgument != nil && !work.moduleArgumentSourceCurrent(recipe) && operationContainsRequest(recipe.delta.required, request) && work.moduleArgumentTaskOwned(recipe) {
			queue(recipe.key)
		}
	}
}

// stagedModuleArgumentFieldRequest is a reading of the same source producer,
// lent only to an original descriptor field of this registered map entry.
func stagedModuleArgumentFieldRequest(source *sourceStagedNativeGetSource, parent sourceStagedOperationRequest) (sourceStagedOperationRequest, bool) {
	if source == nil || source.descriptorEntry == nil || source.descriptorEntry.source == nil || source.descriptorEntry.source.descriptorMap == nil || source.descriptorEntry.source.descriptorMap.argumentSource == nil {
		return sourceStagedOperationRequest{}, false
	}
	entry := source.descriptorEntry
	if stagedDescriptorFieldIndex(parent.producer.selector.field) < 0 || !sameOperationRequest(parent, stagedMapEntryFieldRequest(entry, parent.producer.selector.field)) {
		return sourceStagedOperationRequest{}, false
	}
	if _, valid := stagedMapEntryRequest(entry.source, entry.entry); !valid {
		return sourceStagedOperationRequest{}, false
	}
	request := stagedModuleArgumentRequest(entry.source)
	request.reading = parent.producer
	request.edge = parent.edge + ":module-argument-source"
	return request, true
}

func (work *callableEffectWork) validModuleArgumentReading(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	if !validStagedModuleArgumentRecipe(recipe) {
		return false
	}
	if sameOperationRequest(recipe.moduleArgument.request, request) {
		return true
	}
	field, registered := work.operationRecipes[request.reading]
	if !registered || field.nativeGet == nil || !validStagedMapFieldRecipe(field) {
		return false
	}
	entry := field.nativeGet.descriptorEntry
	if entry.generation != recipe.moduleArgument.generation {
		return false
	}
	parent := stagedMapEntryFieldRequest(entry, request.reading.selector.field)
	expected, valid := stagedModuleArgumentFieldRequest(field.nativeGet, parent)
	return valid && sameOperationRequest(expected, request) && sameOperationRequest(entry.source.descriptorMap.protocol, recipe.moduleArgument.mapping) && operationContainsRequest(field.delta.required, request)
}

func (work *callableEffectWork) stagedModuleArgumentFieldOrder(source *sourceStagedNativeGetSource, parent sourceStagedOperationRequest) (*sourceStagedNativeArgumentOrder, bool) {
	request, needed := stagedModuleArgumentFieldRequest(source, parent)
	if !needed {
		return nil, false
	}
	recipe := work.operationRecipes[request.producer]
	id, registered := work.operationIDs[request.producer]
	if !registered || id.epoch != work.operationEpoch || !work.moduleArgumentSourceCurrent(recipe) || !work.validModuleArgumentReading(recipe, request) {
		return nil, true
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || state.revision == 0 {
		return nil, true
	}
	return recipe.moduleArgument.order, true
}
