package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedConstructedGetLookup admits only the conditional standard DATA branch
// of this original allocation's demanded Get. Own writers and protocol sources
// still traverse their original owners; this grants no selected method/value.
func (q *sourceValueQuery) stagedConstructedGetLookup(get *sourceGetInputs, standard *sourceValue, mode accessorTraversal) bool {
	b := q.stagedMember
	if b == nil || q.executable == nil || b.constructedGetEffects == nil || b.constructedGetEvent != nil || mode != accessorAcquire || get == nil || get.operation != b.request.producer.operation || !ast.IsPropertyAccessExpression(get.operation) || !q.liveStagedMemberSource(b, get, b.read) || standard == nil || standard.native == nil || get.receiver.native == nil || get.receiver.native.kind != sourceNativeWeakMapSourceInstance {
		return false
	}
	site := get.receiver.node
	if site == nil || !ast.IsNewExpression(site) || get.receiver.native.acquired != site || get.receiver.normal != nil || get.receiver.bound != nil || get.receiver.capture != nil || get.receiver.instance != nil || len(get.receiver.path) != 0 || site.AsNewExpression().Arguments != nil && len(site.AsNewExpression().Arguments.Nodes) != 0 {
		return false
	}
	contribution, found := q.executable.standardConstructions[site]
	if !found || contribution.site != site || !contribution.selectionComplete || !standardMemberEffect(standard.native.kind) {
		return false
	}
	_, key := accessorReceiver(get.operation)
	origin, seed, known := q.standardConstructionMemberSeed(get.receiver, key)
	return known && origin == site && seed.node == standard.node && seed.native != nil && seed.native.kind == standard.native.kind && seed.native.acquired == standard.native.acquired && b.coverage != nil && b.coverage.origin == origin
}

// observeStagedConstructedGetEffects lends a full original writer traversal to
// the Get-only consumer. The scoped event cannot survive callback return or be
// replayed with copied Get metadata. Accounting is independent of output and
// all retained C/body dependencies still require their own delivery.
func (q *sourceValueQuery) observeStagedConstructedGetEffects(origin *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, standard *sourceValue, result *accessorCandidates) {
	if result == nil || !q.stagedConstructedGetLookup(get, standard, mode) || !q.liveStagedMemberSource(q.stagedMember, get, cut) {
		return
	}
	b := q.stagedMember
	if !q.publishStagedMemberDisposition(get, cut, true) || !q.liveStagedMemberSource(b, get, cut) || b.coverage == nil || b.coverage.origin != origin {
		return
	}
	observation := q.relativeInputCut(get.operation)
	b.constructedGetEvent, b.constructedGetStandard = get, standard
	defer func() { b.constructedGetEvent, b.constructedGetStandard = nil, nil }()
	accounted := !result.opaque && !result.receiverIncomplete && !result.fieldReceiverIncomplete && nativeMemberGetChannelsRepresented(result)
	accepted := b.constructedGetEffects(origin, get, cut, mode, standard, accounted, result)
	if accepted && b.constructedGetEvent == get && b.constructedGetStandard == standard && q.liveStagedMemberSource(b, get, cut) && q.relativeInputCut(get.operation) == observation {
		b.transferredGet, b.transferredCut = get, observation
		result.valueIncomplete = true // Effects-only source transfer withholds selected output.
	}
}

// sourceStagedNativeMemberEffects is a current-graph Effects observation. It
// represents the finite Get-source set through required children. It does not
// select the native method exclusively. The actual Call has its own alternatives
// requirement, and result-category consumers cannot use this weaker receipt.
type sourceStagedNativeMemberEffects struct {
	request    sourceStagedOperationRequest
	cut        sourceRelativeCut
	generation *projectGeneration
	sources    []sourceStagedOperationRequest
}

// validNativeSourceDataRequirement preserves the original Call, Get-value or
// binding factory behind a native callee reading. Membership describes a DATA
// debt only; its registered reader, current delivery and Effects remain separate.
func validNativeSourceDataRequirement(source *sourceStagedNativeGetSource, request sourceStagedOperationRequest) bool {
	if source == nil || request.producer.declaration == nil || !stagedDataSourceExpression(request.producer.operation) || request.producer.kind != relativeDemandDirectExposure || request.reading != nativeRootDebtRequest(source, "callee-get").producer || request.consumer != source.request.consumer || request.edge == "" {
		return false
	}
	member := false
	for _, required := range source.callResults {
		member = member || sameOperationRequest(required, request)
	}
	if !member {
		return false
	}
	original := stagedResultSourceRequest(request.producer.operation, request.producer.declaration, nil)
	original.consumer, original.reading, original.edge = request.consumer, request.reading, request.edge
	return sameOperationRequest(original, request)
}

func nativeMemberAlternativeRequest(source *sourceStagedNativeGetSource, field string) sourceStagedOperationRequest {
	request := source.request
	request.producer.selector = sourceStagedOperationSelector{occurrence: source.get, field: field}
	request.edge += ":" + field
	return request
}

func nativeMemberCallRequirementCount(source *sourceStagedNativeGetSource) int {
	if source != nil && source.callAlternatives.producer.operation != nil {
		return 1
	}
	return 0
}

func validNativeMemberEffects(proof *sourceStagedNativeMemberEffects, source *sourceStagedNativeGetSource) bool {
	return proof != nil && source != nil && proof.generation != nil && len(proof.sources) != 0 && sameOperationRequest(proof.request, nativeRootDebtRequest(source, "callee-get")) && validStagedNativeCalleeEffects(sourceStagedNativeCalleeEffects{request: proof.request, cut: proof.cut, method: source.method, generation: proof.generation}, source) && operationPrefix(proof.sources, source.memberSources, sameOperationRequest) && operationPrefix(source.memberSources, proof.sources, sameOperationRequest) && nativeMemberCallRequirementCount(source) != 0 && sameOperationRequest(source.callAlternatives, nativeMemberAlternativeRequest(source, "callee-alternatives")) && sameOperationRequest(source.getContributions, nativeMemberAlternativeRequest(source, "member-get-effects"))
}

// admitNativeMemberPopulation publishes the actual original Get population.
// Strong and finite receipts share these roles without sharing selection rights.
// A complete original selected Get may create the same population before any
// finite fallback. Its actual result, not the callee receipt, authenticates it.
func (work *callableEffectWork) admitNativeMemberPopulation(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource, result *accessorCandidates, selectedComplete bool) (sourceStagedOperationRequest, sourceStagedOperationRequest, bool) {
	if q == nil || q.owner == nil || source == nil || q.stagedNativeGet == nil {
		return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
	}
	b := q.stagedNativeGet
	if !b.finishing || b.issuer != q || b.owner != q.owner || !b.canonical || b.generation != work.operationGeneration || q.owner.generation != b.generation || q.protectedMember != source.get || len(b.memberSources) == 0 {
		return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
	}
	// The strong finish may be the first observation in this graph. Require
	// its whole actual result and every weaker Get channel, independently of
	// the separately admitted strong receipt. A selected prefix cannot create
	// a population, and finite pending observations keep their old path.
	if selectedComplete && (result == nil || len(result.values) == 0 || result.values[0].node != source.method || result.values[0].native == nil || result.values[0].native.kind != source.kind || !stagedNativeCalleeEffectsRepresented(result.values[0], result) || !nativeMemberGetChannelsRepresented(result)) {
		return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
	}
	if selectedComplete {
		if q.executable == nil || q.executable.values == nil || q.executable.project == nil {
			return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
		}
		publisher := q.executable.pendingMemberPublishers[source.request.consumer]
		consumer, owned := work.memberNodes[source.request.consumer]
		if !owned || consumer < 0 || consumer >= len(facts) || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker || q.executable.values.generation != b.generation || q.executable.project.activeGeneration != b.generation || publisher == nil || !publisher.live || publisher.fact != &facts[consumer] || publisher.fact.node != source.request.consumer || b.sourceWork != work || !sameOperationRequest(b.getRequest, source.request) || b.call != source.request.use || q.reading != source.request.use || q.initializing != source.request.use {
			return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
		}
	}
	for _, request := range b.memberSources {
		recipe := work.operationRecipes[request.producer]
		child := recipe.memberSource
		if selectedComplete && !validStagedMemberCoverageRecipe(recipe) {
			return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
		}
		if child == nil || child.coverage == nil || child.generation != b.generation || work.memberCoverageObserved[request.producer] != b.generation || !sameOperationRequest(child.parent, source.request) || !sameOperationRequest(child.request, request) {
			return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
		}
	}
	call := source.request.producer.operation
	last := work.operationRecipes[b.memberSources[len(b.memberSources)-1].producer].memberSource.coverage
	candidate := sourceStagedMemberCandidate{request: source.request, operation: call, origin: last.origin, protocol: true, invoking: true, prior: !runtimeModuleEvaluation(source.request.consumer), cut: last.cut}
	candidate.value = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: source.get, producer: call, cut: last.cut}
	request := stagedMemberCandidateRequest(source.request, candidate)
	child := &sourceStagedMemberSource{request: request, parent: source.request, generation: b.generation, candidate: candidate, call: describeStagedMemberCallAlternatives(source, result, q.executable, q.relativeInputCut(call))}
	child.call.complete = child.call.complete && !b.legacyPrepared

	contribution := candidate
	contribution.invoking, contribution.getContribution = false, true
	getRequest := stagedMemberCandidateRequest(source.request, contribution)
	get := &sourceStagedMemberSource{request: getRequest, parent: source.request, generation: b.generation, candidate: contribution, getEffects: &sourceStagedMemberGetEffects{accounted: b.dataBranch && !b.legacyPrepared && nativeMemberGetChannelsRepresented(result)}}
	getDelta := sourceStagedOperationDelta{extracted: get.getEffects.accounted}
	if result != nil {
		for _, effect := range result.environmentEffects {
			if validOperationEnvironmentEffect(effect) && effect.relativeCoercion == nil {
				getDelta.effects = append(getDelta.effects, cloneOperationDelta(sourceStagedOperationDelta{effects: []EnvironmentEffectSource{effect}}).effects[0])
			} else {
				get.getEffects.accounted = false
				getDelta.extracted = false
			}
		}
	}
	if selectedComplete && (!child.call.complete || !get.getEffects.accounted) {
		return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
	}
	planned := []sourceStagedOperationRecipe{
		{key: request.producer, memberSource: child, delta: sourceStagedOperationDelta{extracted: child.call.complete}},
		{key: getRequest.producer, memberSource: get, delta: getDelta},
	}
	// Validate both role refinements before attaching either. A later weaker
	// observation cannot retract a completed description or known alternatives.
	for _, next := range planned {
		prior, exists := work.operationRecipes[next.key]
		if !validOperationEnvelope(next) {
			return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
		}
		if !exists {
			continue
		}
		if !validOperationEnvelope(prior) || !sameStagedMemberSource(prior.memberSource, next.memberSource) || !operationDeltaPrefix(prior.delta, next.delta) || prior.delta.extracted && !next.delta.extracted {
			return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
		}
		if previous := prior.memberSource.call; previous != nil {
			current := next.memberSource.call
			if current == nil || len(previous.standard) != 0 || !operationPrefix(previous.values, current.values, sameOperationAlternative) {
				return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
			}
			for i, mapped := range previous.mapped {
				if mapped && !current.mapped[i] {
					return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
				}
			}
		}
	}
	attachments, linked := work.nativeMemberPopulationAttachments(source, b.memberSources, request, getRequest, selectedComplete)
	if !linked {
		return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
	}
	for _, next := range planned {
		_, exists := work.operationRecipes[next.key]
		accepted := false
		if exists {
			accepted = work.attachOperationSource(facts, next)
		} else {
			accepted = work.registerOperationRecipe(facts, next)
		}
		if !accepted {
			return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
		}
	}
	for _, attachment := range attachments {
		if !work.attachOperationSource(facts, attachment) {
			return sourceStagedOperationRequest{}, sourceStagedOperationRequest{}, false
		}
	}
	for _, key := range []sourceStagedOperationKey{request.producer, getRequest.producer} {
		work.memberCoverageObserved[key] = b.generation
		if id, exists := work.operationIDs[key]; exists && id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
			work.operations[id.index].memberCoverageObserved = true
		}
	}
	return request, getRequest, true
}

// nativeMemberPopulationAttachments plans both actual population roles at their
// existing consumers. Strict immutable prefixes and dependency adoption precede
// current observation stamps; creation grants no selected value or invocation.
func (work *callableEffectWork) nativeMemberPopulationAttachments(source *sourceStagedNativeGetSource, sources []sourceStagedOperationRequest, request, getRequest sourceStagedOperationRequest, selectedComplete bool) ([]sourceStagedOperationRecipe, bool) {
	var attachments []sourceStagedOperationRecipe
	for key, recipe := range work.operationRecipes {
		if !sameNativeGetSource(recipe.nativeGet, source) {
			continue
		}
		// A strong-first handoff adds only the population's real consumers:
		// Call alternatives on the root, Get contributions on the own Get.
		// Other immutable phase snapshots keep their existing optional metadata.
		if selectedComplete && key != source.request.producer && key != nativeRootDebtRequest(source, "callee-get").producer {
			continue
		}
		prior := recipe
		copy := *recipe.nativeGet
		copy.memberSources = append([]sourceStagedOperationRequest(nil), sources...)
		copy.callAlternatives = request
		copy.getContributions = getRequest
		recipe.nativeGet = &copy
		recipe.delta = cloneOperationDelta(recipe.delta)
		if key == source.request.producer {
			if len(recipe.delta.required) == 3 {
				recipe.delta.required = append(recipe.delta.required, request)
			}
		} else if key == nativeRootDebtRequest(source, "callee-get").producer {
			if selectedComplete {
				var ready bool
				recipe, ready = work.nativeMemberPopulationGet(prior, &copy, sources, getRequest)
				if !ready {
					return nil, false
				}
			} else {
				// Debt roles may have arrived in different original phases. Keep
				// the issued prefix and append only missing exact children; validation
				// below still rejects incompatible metadata and sealed-prefix growth.
				for _, role := range [][]sourceStagedOperationRequest{copy.callResults, copy.memberSources, {getRequest}, copy.selectionRequired} {
					for _, required := range role {
						recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, required)
					}
				}
			}
		}
		if sameOperationRequest(prior.nativeGet.callAlternatives, request) && sameOperationRequest(prior.nativeGet.getContributions, getRequest) && operationPrefix(prior.nativeGet.memberSources, sources, sameOperationRequest) && operationPrefix(sources, prior.nativeGet.memberSources, sameOperationRequest) && operationDeltaPrefix(prior.delta, recipe.delta) && operationDeltaPrefix(recipe.delta, prior.delta) {
			continue // The existing exact dependencies are already enrolled.
		}
		if !validOperationEnvelope(prior) || !validOperationEnvelope(recipe) || !operationDeltaPrefix(prior.delta, recipe.delta) || prior.delta.extracted && (!recipe.delta.extracted || !operationDeltaPrefix(recipe.delta, prior.delta)) {
			return nil, false
		}
		attachments = append(attachments, recipe)
	}
	return attachments, true
}

// nativeMemberPopulationGet enrolls only the original finish's observed C
// before the first Get is sealed. Existing DATA/selection premises stay in their
// exact order; late incompatible or already-admitted missing debts are refused.
// This pure plan creates neither a stamp nor a current Get/result receipt.
func (work *callableEffectWork) nativeMemberPopulationGet(prior sourceStagedOperationRecipe, source *sourceStagedNativeGetSource, observed []sourceStagedOperationRequest, contribution sourceStagedOperationRequest) (sourceStagedOperationRecipe, bool) {
	if source == nil || !validNativeGetRecipe(prior) || !sameNativeGetSource(prior.nativeGet, source) || prior.key != nativeRootDebtRequest(source, "callee-get").producer {
		return sourceStagedOperationRecipe{}, false
	}
	next := prior
	next.nativeGet = source
	next.delta = cloneOperationDelta(prior.delta)
	for _, required := range prior.delta.required {
		if !validOperationEnvelope(work.operationRecipes[required.producer]) {
			return sourceStagedOperationRecipe{}, false
		}
	}
	for _, required := range [][]sourceStagedOperationRequest{source.callResults, source.selectionRequired} {
		for _, premise := range required {
			if !operationContainsRequest(prior.delta.required, premise) {
				return sourceStagedOperationRecipe{}, false
			}
		}
	}
	for _, request := range observed {
		recipe := work.operationRecipes[request.producer]
		c := recipe.memberSource
		if !validStagedMemberCoverageRecipe(recipe) || c.generation != work.operationGeneration || !sameOperationRequest(c.parent, source.request) || !sameOperationRequest(c.request, request) || work.memberCoverageObserved[request.producer] != work.operationGeneration {
			return sourceStagedOperationRecipe{}, false
		}
		next.delta.required = appendEntryLawRequirement(next.delta.required, request)
	}
	next.delta.required = appendEntryLawRequirement(next.delta.required, contribution)
	if !operationDeltaPrefix(next.delta, prior.delta) {
		if prior.delta.extracted {
			return sourceStagedOperationRecipe{}, false
		}
		if id, adopted := work.operationIDs[prior.key]; adopted {
			if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				return sourceStagedOperationRecipe{}, false
			}
			state := &work.operations[id.index]
			if state.invalid || state.key != prior.key || state.delta.extracted || state.nativeCallee != nil || state.nativeMemberEffects != nil {
				return sourceStagedOperationRecipe{}, false
			}
		}
	}
	return next, validOperationEnvelope(next) && operationDeltaPrefix(prior.delta, next.delta)
}

// admitNativeMemberSourceEffects retains the finite Get receipt separately from
// the population observations also issued by a selected-only Get.
func (work *callableEffectWork) admitNativeMemberSourceEffects(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource, result *accessorCandidates) bool {
	_, _, accepted := work.admitNativeMemberPopulation(facts, q, source, result, false)
	if !accepted {
		return false
	}
	source = work.operationRecipes[source.request.producer].nativeGet
	b, call := q.stagedNativeGet, source.request.producer.operation
	proof := &sourceStagedNativeMemberEffects{request: nativeRootDebtRequest(source, "callee-get"), cut: q.relativeInputCut(call), generation: b.generation, sources: append([]sourceStagedOperationRequest(nil), b.memberSources...)}

	if work.nativeMemberEffects == nil {
		work.nativeMemberEffects = make(map[sourceStagedOperationKey]*sourceStagedNativeMemberEffects)
	}
	work.nativeMemberEffects[proof.request.producer] = proof
	if id, adopted := work.operationIDs[proof.request.producer]; adopted {
		return work.publishNativeMemberEffects(id)
	}
	return true
}

func (work *callableEffectWork) publishNativeMemberEffects(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	proof := work.nativeMemberEffects[state.key]
	recipe := work.operationRecipes[state.key]
	if proof == nil || proof.generation != work.operationGeneration || !validNativeMemberEffects(proof, recipe.nativeGet) {
		return false
	}
	delta := cloneOperationDelta(recipe.delta)
	delta.extracted = true
	if !operationDeltaPrefix(state.delta, delta) {
		return false
	}
	state.nativeMemberEffects = proof
	if !state.delta.extracted || operationDeltaCursor(state.delta) != operationDeltaCursor(delta) {
		state.delta = delta
		state.revision++
		work.notifyOperationSubscribers(state)
	}
	return true
}
