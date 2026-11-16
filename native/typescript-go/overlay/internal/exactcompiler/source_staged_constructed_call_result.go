package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// validStagedConstructedResultSource correlates the generic demanded result
// reading with its existing semantic member producer. This description grants
// neither native selection nor a completed member result.
func validStagedConstructedResultSource(source *sourceStagedCallResultSource) bool {
	if source == nil || source.nativeCall || source.operand != nil || source.declaration != source.request.producer.declaration {
		return false
	}
	root := source.constructedRoot
	if root.producer != (sourceStagedOperationKey{declaration: source.declaration, operation: source.request.producer.operation, kind: relativeDemandEffects}) || root.consumer != source.declaration || root.inputs != nil || root.reading != (sourceStagedOperationKey{}) || root.edge == "" || root.use == nil || !ast.IsCallExpression(root.use) || root.use != source.request.use || root.cut != source.request.cut {
		return false
	}
	for i, preparation := range source.constructedPreparation {
		if !validStagedMemberParent(preparation) || preparation.producer.kind != relativeDemandEffects || preparation.producer.selector != (sourceStagedOperationSelector{}) || preparation.use == nil || !ast.IsNewExpression(preparation.use) || ast.GetSourceFileOfNode(preparation.use) != ast.GetSourceFileOfNode(root.use) {
			return false
		}
		region := sourceStagedEvaluationOwner(preparation.use)
		if region == nil {
			region = sourceStagedModuleOwner(preparation.use)
		}
		if preparation.producer.declaration != region || preparation.consumer != region {
			return false
		}
		for _, prior := range source.constructedPreparation[:i] {
			if prior.use == preparation.use {
				return false
			}
		}
	}
	return true
}

func validStagedConstructedResultRequirement(source *sourceStagedCallResultSource, required sourceStagedOperationRequest) bool {
	if !validStagedConstructedResultSource(source) {
		return false
	}
	for _, root := range source.constructedPreparation {
		if sameOperationRequest(required, root) {
			return true
		}
		for _, phase := range stagedConstructionPhases {
			if sameOperationRequest(required, stagedConstructionRequest(root, phase)) {
				return true
			}
		}
	}
	if sameOperationRequest(required, source.constructedRoot) {
		return true
	}
	site := required.producer.selector.occurrence
	if site == nil || !ast.IsNewExpression(site) {
		return false
	}
	expected := source.constructedRoot
	expected.producer.kind = relativeDemandDirectExposure
	expected.producer.selector = sourceStagedOperationSelector{occurrence: site, field: "member-result"}
	expected.edge += ":member-result"
	return sameOperationRequest(required, expected)
}

// currentConstructedCallResultRoles borrows only this graph's original member
// publications. A cloned recipe or source inventory cannot supply that event.
func (work *callableEffectWork) currentConstructedCallResultRoles(recipe sourceStagedOperationRecipe) ([]sourceStagedOperationRecipe, bool) {
	source := recipe.callResult
	if !validStagedCallResultRecipe(recipe) || !validStagedConstructedResultSource(source) || source.generation != work.operationGeneration {
		return nil, false
	}
	root := work.operationRecipes[source.constructedRoot.producer]
	if !validConstructedMemberRecipe(root) || root.constructed == nil || !sameOperationRequest(root.constructed.request, source.constructedRoot) || len(root.constructedGroup) == 0 {
		return nil, false
	}
	var roles []sourceStagedOperationRecipe
	for _, member := range root.constructedGroup {
		if !work.constructedIssued[[2]*ast.Node{source.request.producer.operation, member.construction.site}] {
			return nil, false
		}
		role := work.operationRecipes[constructedMemberRequest(&member, "member-result").producer]
		if !validConstructedMemberRecipe(role) || !sameConstructedMemberSource(role.constructed, &member) {
			return nil, false
		}
		roles = append(roles, role)
	}
	return roles, true
}

// refineStagedConstructedCallResult forwards DATA from existing semantic roles.
// It does no writer discovery, substitution, binding or value acquisition. The
// aggregate Effects producer and every result role stay required independently.
func (work *callableEffectWork) refineStagedConstructedCallResult(facts []callableFacts, recipe sourceStagedOperationRecipe) bool {
	roles, current := work.currentConstructedCallResultRoles(recipe)
	if !current {
		return false
	}
	delta := sourceStagedOperationDelta{required: constructedResultPreparationRequirements(recipe.callResult), extracted: work.freshStagedCallResultReading(recipe)}
	delta.required = append(delta.required, recipe.callResult.constructedRoot)
	for _, role := range roles {
		delta.required = append(delta.required, constructedMemberRequest(role.constructed, "member-result"))
		delta.extracted = delta.extracted && role.delta.extracted
		for _, alternative := range role.delta.exposures {
			delta.exposures = append(delta.exposures, cloneOperationDelta(sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{alternative}}).exposures[0])
		}
	}
	if operationDeltaPrefix(recipe.delta, delta) && operationDeltaPrefix(delta, recipe.delta) && recipe.delta.extracted == delta.extracted {
		return false
	}
	recipe.delta = delta
	return work.attachOperationSource(facts, recipe)
}

func (work *callableEffectWork) prepareStagedConstructedCallResult(facts []callableFacts, id sourceStagedOperationID) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	work.refineStagedConstructedCallResult(facts, recipe)
	if len(recipe.callResult.constructedPreparation) != 0 {
		work.attachSourceObservationDependencies(facts, id)
	}
	current := work.operationRecipes[recipe.key]
	if operationDeltaSize(current.delta) != 0 {
		work.publishOperation(id, current.delta)
	} else if current.delta.extracted {
		work.publishSourceDisposition(id)
	}
}

func (work *callableEffectWork) passiveStagedConstructedCallResultReady(recipe sourceStagedOperationRecipe) bool {
	roles, current := work.currentConstructedCallResultRoles(recipe)
	if !current {
		return false
	}
	preparation := constructedResultPreparationRequirements(recipe.callResult)
	offset := len(preparation)
	if !recipe.delta.extracted || !work.freshStagedCallResultReading(recipe) || len(recipe.delta.required) != offset+len(roles)+1 || !sameOperationRequest(recipe.delta.required[offset], recipe.callResult.constructedRoot) {
		return false
	}
	for i, required := range preparation {
		if !sameOperationRequest(recipe.delta.required[i], required) {
			return false
		}
	}
	for i, role := range roles {
		if !role.delta.extracted || !sameOperationRequest(recipe.delta.required[offset+i+1], constructedMemberRequest(role.constructed, "member-result")) {
			return false
		}
	}
	return true
}

// validConstructedResultPreparationPrefix keeps immutable preparation roots
// equal to the existing required prefix, including each original phase/cut.
// It observes no source query, selection, delivery or currentness receipt.
func validConstructedResultPreparationPrefix(recipe sourceStagedOperationRecipe) bool {
	index := 0
	for _, root := range recipe.callResult.constructedPreparation {
		if index >= len(recipe.delta.required) || !sameOperationRequest(recipe.delta.required[index], root) {
			return false
		}
		index++
		for _, phase := range stagedConstructionPhases {
			if index >= len(recipe.delta.required) || !sameOperationRequest(recipe.delta.required[index], stagedConstructionRequest(root, phase)) {
				return false
			}
			index++
		}
	}
	return true
}

// Constructor roots are authentic operation owners, never selected receiver
// alternatives. They remain required alongside every subsequently issued result.
func constructedResultPreparationRequirements(source *sourceStagedCallResultSource) []sourceStagedOperationRequest {
	var required []sourceStagedOperationRequest
	for _, root := range source.constructedPreparation {
		required = appendEntryLawRequirement(required, root)
		for _, phase := range stagedConstructionPhases {
			required = appendEntryLawRequirement(required, stagedConstructionRequest(root, phase))
		}
	}
	return required
}

// describeConstructedResultProducer registers only an original producer demand.
// No physical reader, ordinary occurrence, selected group or output is supplied.
// Nested unknown source chains keep their current owner rather than recurse here.
func (work *callableEffectWork) describeConstructedResultProducer(facts []callableFacts, caller int, occurrence sourceStagedConstructedOccurrence, q *sourceValueQuery, r *sourceWriterInputRequest) (sourceStagedOperationRequest, bool) {
	if q == nil || r == nil || !r.live || r.issuer != q || r.consumer != q.effectOwner || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) || q.executable == nil {
		return sourceStagedOperationRequest{}, false
	}
	owner := q.executable
	if caller < 0 || caller >= len(facts) || r.consumer != facts[caller].node || r.graph != owner.writerInputFacts[r.consumer] || owner.values == nil || owner.values.generation != work.operationGeneration || owner.project == nil || owner.project.activeGeneration != work.operationGeneration || !work.operationGeneration.active || occurrence.request.consumer != facts[caller].node || len(occurrence.sites) == 0 || len(occurrence.upstream) != 0 {
		return sourceStagedOperationRequest{}, false
	}
	if n := q.stagedNativeGet; n != nil {
		if n.issuer != q || n.sourceWork != work || n.sourceEpoch != work.operationEpoch || n.owner != q.owner || n.generation != work.operationGeneration {
			return sourceStagedOperationRequest{}, false
		}
	} else if b := q.stagedMember; b == nil || !q.liveStagedMemberSource(b, b.get, b.read) {
		return sourceStagedOperationRequest{}, false
	}
	requested := stagedConstructedOccurrenceAt(&facts[caller], r.call, owner)
	associated := false
	if requested != nil {
		for _, upstream := range requested.upstream {
			associated = associated || upstream == occurrence.request.use
		}
	}
	if !associated {
		return sourceStagedOperationRequest{}, false
	}
	publisher := owner.pendingMemberPublishers[facts[caller].node]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return sourceStagedOperationRequest{}, false
	}
	_, method := accessorReceiver(occurrence.request.use.Expression())
	if method != "get" && method != "set" {
		return sourceStagedOperationRequest{}, false
	}
	source := &sourceStagedCallResultSource{request: stagedCallResultRequest(occurrence.request.use, facts[caller].node), declaration: facts[caller].node, generation: work.operationGeneration, constructedRoot: occurrence.request}
	if prior, known := work.operationRecipes[source.request.producer]; known {
		if !validStagedCallResultRecipe(prior) || !validStagedConstructedResultSource(prior.callResult) || len(prior.callResult.constructedPreparation) == 0 || prior.callResult.generation != work.operationGeneration || !sameOperationRequest(prior.callResult.constructedRoot, occurrence.request) {
			return sourceStagedOperationRequest{}, false
		}
		return prior.callResult.request, true
	}
	for _, site := range occurrence.sites {
		if !stagedWeakMapConstructionCandidate(site, owner, owner.values.index(ast.GetSourceFileOfNode(site))) {
			return sourceStagedOperationRequest{}, false
		}
		region := sourceStagedEvaluationOwner(site)
		if region == nil {
			region = sourceStagedModuleOwner(site)
		}
		if region != facts[caller].node && !runtimeModuleEvaluation(region) {
			return sourceStagedOperationRequest{}, false
		}
		producer, known := work.memberNodes[region]
		publisher := owner.pendingMemberPublishers[region]
		if !known || publisher == nil || !publisher.live || publisher.fact != &facts[producer] {
			return sourceStagedOperationRequest{}, false
		}
		root, described := work.describeStagedConstructionEffects(facts, producer, site, owner)
		if !described {
			return sourceStagedOperationRequest{}, false
		}
		source.constructedPreparation = appendEntryLawRequirement(source.constructedPreparation, root)
	}
	recipe := sourceStagedOperationRecipe{key: source.request.producer, callResult: source, delta: sourceStagedOperationDelta{required: constructedResultPreparationRequirements(source)}}
	if !work.registerOperationRecipe(facts, recipe) {
		return sourceStagedOperationRequest{}, false
	}
	return source.request, true
}

// The adopted DATA producer owns its first source Get, with original constructor
// prerequisites and START revisions. A real reader is still independently needed
// before refinement can publish DATA/currentness; clones inherit descriptions only.
func (work *callableEffectWork) constructedResultProducerTask(id sourceStagedOperationID) *sourceStagedCallResultSource {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !state.dependenciesRegistered || !validStagedCallResultRecipe(recipe) || !validStagedConstructedResultSource(recipe.callResult) || len(recipe.callResult.constructedPreparation) == 0 || recipe.callResult.generation != work.operationGeneration {
		return nil
	}
	source := recipe.callResult
	caller, known := work.memberNodes[source.declaration]
	if !known || caller < 0 || caller >= len(work.operationFacts) {
		return nil
	}
	inventory := work.operationFacts[caller].staged.constructedInventory
	if inventory == nil {
		return nil
	}
	matched := false
	for _, occurrence := range inventory.candidates {
		if !sameOperationRequest(occurrence.request, source.constructedRoot) {
			continue
		}
		if len(occurrence.upstream) != 0 || len(occurrence.sites) != len(source.constructedPreparation) {
			return nil
		}
		for i, root := range source.constructedPreparation {
			if root.use != occurrence.sites[i] {
				return nil
			}
		}
		matched = true
		break
	}
	if !matched {
		return nil
	}
	return source
}
func (work *callableEffectWork) prepareConstructedResultProducer(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	source := work.constructedResultProducerTask(id)
	if source == nil || owner == nil || owner.values == nil || owner.project == nil || owner.project.activeGeneration != work.operationGeneration || !work.operationGeneration.active || owner.values.generation != work.operationGeneration || work.operations[id.index].writerSourceRunning {
		return
	}
	work.attachSourceObservationDependencies(facts, id)
	revisions := work.sourceObservationRevisions(id)
	if revisions == nil || work.sourceObservationAttemptCurrent(id, revisions) {
		return
	}
	caller, known := work.memberNodes[source.declaration]
	if !known || caller < 0 || caller >= len(facts) {
		return
	}
	publisher := owner.pendingMemberPublishers[source.declaration]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	work.operations[id.index].writerSourceRunning = true
	defer func() {
		if id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
			work.operations[id.index].writerSourceRunning = false
			work.attachSourceObservationDependencies(facts, id)
			work.operations[id.index].writerSourceRevisions = append([]uint64(nil), revisions...)
		}
	}()
	work.prepareConstructedResultSource(facts, caller, source.request.producer.operation, owner)
}
