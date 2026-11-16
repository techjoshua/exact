package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedReflectiveTargetSource describes an immutable target read at an
// original member C. Construction and callee keys identify its continuation;
// neither is a required child of this role. Only actual source publication adds
// the creating Call's full Effects root and conditional Create association.
type sourceStagedReflectiveTargetSource struct {
	preparation                             *sourceStagedReflectiveTargetPreparation // Detached original Get registration context, never C authority.
	keySource                               *sourceStagedReflectiveKey               // Candidate key disposition; never target identity.
	resultSupport                           *sourceStagedReflectiveResult            // Original result-owner factories, never current proof.
	native                                  sourceStagedNativeObserver
	request, parent, construction, creating sourceStagedOperationRequest
	operation, binding, origin              *ast.Node
	target                                  sourceRelativeEndpoint
	cut                                     sourceRelativeCut
	generation                              *projectGeneration
	method                                  *ast.Node
	prototype                               sourceRelativeEndpoint
	sourceCut                               sourceRelativeCut
}

// A live source reader separates descriptive registration from delivery. The
// creating root is retained only when the current relation pays target relevance.
type sourceStagedReflectiveTargetTransfer struct {
	request, creating            sourceStagedOperationRequest
	registered, current, pending bool
	keyExcluded                  bool
}

func stagedReflectiveTargetOwner(source *sourceStagedReflectiveTargetSource) sourceStagedOperationRequest {
	if source.preparation != nil {
		return source.preparation.parent
	}
	if source.native.get != nil {
		return source.native.request
	}
	return source.construction
}

func stagedReflectiveTargetPhase(source *sourceStagedReflectiveTargetSource) sourceStagedOperationRequest {
	if source.preparation != nil {
		return source.preparation.request
	}
	if source.native.get != nil {
		return nativeRootDebtRequest(&sourceStagedNativeGetSource{request: source.native.request, get: source.native.get}, "callee-get")
	}
	return stagedConstructionRequest(source.construction, "callee")
}

func stagedReflectiveTargetRequest(source *sourceStagedReflectiveTargetSource) sourceStagedOperationRequest {
	if p := source.preparation; p != nil {
		return stagedGetPreparationTargetRequest(p.parent, source.operation, source.origin, p.acquisition, p.cut, p.receiver.projection)
	}
	return stagedMemberCandidateRequest(stagedReflectiveTargetOwner(source), sourceStagedMemberCandidate{operation: source.operation, origin: source.origin, cut: source.cut})
}

func stagedReflectiveTargetReading(source *sourceStagedReflectiveTargetSource) sourceStagedOperationRequest {
	request := source.request
	request.reading = stagedReflectiveTargetPhase(source).producer
	request.edge += ":construction-callee"
	return request
}

func (work *callableEffectWork) acceptedStagedReflectiveTargetReading(request sourceStagedOperationRequest) bool {
	recipe := work.operationRecipes[request.producer]
	return validStagedReflectiveTargetRecipe(recipe) && recipe.memberSource.generation == work.operationGeneration && sameOperationRequest(request, stagedReflectiveTargetReading(recipe.memberSource.targetSource))
}

func sameStagedReflectiveTarget(a, b *sourceStagedReflectiveTargetSource) bool {
	return a == b || a != nil && b != nil && sameReflectiveTargetPreparation(a.preparation, b.preparation) && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.parent, b.parent) && sameOperationRequest(a.construction, b.construction) && sameOperationRequest(a.creating, b.creating) && a.operation == b.operation && a.binding == b.binding && a.origin == b.origin && a.native.get == b.native.get && a.native.cut == b.native.cut && sameOperationRequest(a.native.request, b.native.request) && a.method == b.method && sameOperationEndpoint(a.prototype, b.prototype) && sameOperationEndpoint(a.target, b.target) && a.cut == b.cut && a.generation == b.generation && (a.keySource == nil || sameReflectiveKey(a.keySource, b.keySource)) && (a.resultSupport == nil || sameReflectiveResult(a.resultSupport, b.resultSupport))
}

func validStagedReflectiveTargetRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	member := recipe.memberSource
	if member == nil || member.targetSource == nil {
		return false
	}
	source := member.targetSource
	if source.preparation != nil {
		return validPreparedReflectiveTargetRecipe(recipe)
	}
	if source.keySource != nil || source.resultSupport != nil {
		if source.operation == nil || !ast.IsCallExpression(source.operation) || source.creating.use == nil || !ast.IsCallExpression(source.creating.use) {
			return false
		}
		if source.keySource != nil && !validReflectiveKey(source) || source.resultSupport != nil && !validReflectiveResult(source) {
			return false
		}
		base := recipe
		m := *member
		t := *source
		t.keySource = nil
		t.resultSupport = nil
		m.targetSource = &t
		base.memberSource = &m
		base.delta = cloneOperationDelta(recipe.delta)
		base.delta.required = nil
		base.delta.extracted = false
		keySeen := false
		supportSeen := make([]bool, len(reflectiveResultRequirements(source)))
		creatingSeen := false
		for _, child := range recipe.delta.required {
			if source.keySource != nil && sameOperationRequest(child, reflectiveKeyReading(source)) {
				if keySeen {
					return false
				}
				keySeen = true
				continue
			}
			filtered := false
			for i, support := range reflectiveResultRequirements(source) {
				if sameOperationRequest(child, support) {
					if supportSeen[i] {
						return false
					}
					supportSeen[i] = true
					filtered = i < 2
					break
				}
			}
			if filtered {
				continue
			}
			creatingSeen = creatingSeen || sameOperationRequest(child, source.creating)
			base.delta.required = append(base.delta.required, child)
		}
		if source.keySource != nil && !keySeen || !creatingSeen {
			return false
		}
		for _, seen := range supportSeen {
			if !seen {
				return false
			}
		}
		if source.sourceCut == (sourceRelativeCut{}) {
			if len(base.delta.required) > 2 || len(base.delta.required) == 0 || !sameOperationRequest(base.delta.required[0], source.creating) {
				return false
			}
			if len(base.delta.required) == 2 {
				alt := nativeMemberAlternativeRequest(&sourceStagedNativeGetSource{request: source.creating, get: source.creating.use.Expression()}, "callee-alternatives")
				if !sameOperationRequest(base.delta.required[1], alt) {
					return false
				}
			}
			base.delta.required = nil
		}
		return validStagedReflectiveTargetRecipe(base)
	}
	root, child := stagedReflectiveTargetOwner(source), source.creating
	if source.generation == nil || member.generation != source.generation || !validStagedMemberParent(root) || (!ast.IsNewExpression(root.use) && source.native.get == nil) || source.origin == nil || source.operation == nil || !ast.IsCallExpression(source.operation) || source.binding == nil || !ast.IsVariableDeclaration(source.binding) || source.binding.Parent == nil || !ast.IsVariableDeclarationList(source.binding.Parent) || source.binding.Parent.Flags&ast.NodeFlagsConst == 0 || child.use == nil || !ast.IsCallExpression(child.use) || source.binding.Initializer() != child.use || enclosingCallableNode(source.binding) != root.consumer || !sourceStagedOccurrenceOwned(source.operation, root.consumer) || child.producer != (sourceStagedOperationKey{declaration: root.consumer, operation: child.use, kind: relativeDemandEffects}) || child.consumer != root.consumer || child.inputs != nil || child.reading != (sourceStagedOperationKey{}) || child.edge == "" || child.cut != (sourceRelativeCut{operation: child.use, use: child.use, reading: child.use}) || source.target.kind != relativeEndpointExpression || source.target.expression == nil || !ast.IsIdentifier(source.target.expression) || source.target.producer != source.operation || source.target.cut != source.cut || source.binding.Pos() >= source.target.expression.Pos() {
		return false
	}
	actuals := restrictedInvocationArguments(source.operation.AsCallExpression())
	if len(actuals) < 1 || actuals[0] != source.target.expression || source.parent.producer.operation != root.use || source.parent.producer.declaration != root.consumer || source.parent.producer.kind != relativeDemandEffects || source.parent.cut != root.cut || source.parent.producer.selector.field != stagedMemberContextField(root, "member-source-set") || source.parent.producer.selector.occurrence != source.cut.operation || !sameOperationRequest(member.request, source.request) || !sameOperationRequest(member.parent, root) || member.candidate.operation != source.operation || member.candidate.origin != source.origin || member.candidate.cut != source.cut || !sameOperationRequest(member.candidate.request, root) || !sameOperationEndpoint(member.candidate.target, source.target) || !member.candidate.reflective || member.candidate.protocol || !sameOperationRequest(source.request, stagedReflectiveTargetRequest(source)) || recipe.key != source.request.producer || member.writeEffects || member.moduleExcluded != nil || len(member.moduleImports) != 0 || member.call != nil || member.coverage != nil || member.getEffects != nil || member.protocolSource != nil || recipe.nativeGet != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.callResult != nil || recipe.constructed != nil || recipe.constructedDisposition != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || len(recipe.writerRequired)+len(recipe.constructedGroup)+len(recipe.constructedInputs)+len(recipe.fieldForwards)+len(member.values)+len(recipe.delta.effects)+len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	if source.native.get == nil && source.native != (sourceStagedNativeObserver{}) {
		return false
	}
	waitingCut := sourceRelativeCut{operation: root.use.Expression(), reading: root.use.Expression(), initializing: root.use}
	if runtimeModuleEvaluation(root.consumer) {
		waitingCut.use = root.use
	}
	if source.native.get != nil {
		if source.construction != (sourceStagedOperationRequest{}) || !ast.IsCallExpression(root.use) || source.native.get != root.use.Expression() || root.inputs != nil || root.cut != (sourceRelativeCut{operation: root.use, use: root.use, reading: root.use}) || source.native.cut.operation == nil || source.native.cut.operation != source.native.cut.reading || source.native.cut.initializing != root.use || source.native.cut.returning != nil || source.native.cut.invoking != nil || !sourceStagedOccurrenceOwned(source.native.cut.reading, root.consumer) {
			return false
		}
		waitingCut = source.native.cut
	}
	if source.cut != waitingCut {
		return false
	}
	args := restrictedInvocationArguments(child.use.AsCallExpression())
	if source.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(source.method)) || len(args) != 1 || !sameOperationEndpoint(source.prototype, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: args[0], producer: child.use, cut: child.cut}) {
		return false
	}
	if source.sourceCut == (sourceRelativeCut{}) {
		return !recipe.delta.extracted && len(recipe.delta.required) == 0
	}
	expected := sourceRelativeCut{operation: child.use, reading: child.use, initializing: child.use}
	if runtimeModuleEvaluation(root.consumer) {
		expected.use = child.use
	}
	if source.sourceCut != expected || len(recipe.delta.required) < 1 || len(recipe.delta.required) > 2 || !sameOperationRequest(recipe.delta.required[0], child) {
		return false
	}
	if len(recipe.delta.required) == 2 {
		alternative := nativeMemberAlternativeRequest(&sourceStagedNativeGetSource{request: child, get: child.use.Expression()}, "callee-alternatives")
		if !sameOperationRequest(recipe.delta.required[1], alternative) || recipe.delta.extracted {
			return false
		}
	}
	return true
}

// registerStagedReflectiveTargetSource adopts only this live source relation and
// its exact constructor continuation. The creating operation is still pending;
// no ordinary Call/New use or acquired input context is manufactured here.
func (work *callableEffectWork) registerStagedReflectiveTargetSource(facts []callableFacts, query *sourceValueQuery, description sourceStagedReflectiveTargetSource) (sourceStagedOperationRequest, bool) {
	if query == nil {
		return sourceStagedOperationRequest{}, false
	}
	b := query.stagedMember
	if b == nil || description.operation == nil || description.creating.use == nil || !b.seen[description.operation] || !sameOperationRequest(stagedReflectiveTargetOwner(&description), b.request) || !query.liveStagedMemberSource(b, b.get, b.read) || b.coverage == nil || b.coverage.origin == nil || !sameOperationRequest(description.parent, b.coverage.request) || description.cut != query.relativeInputCut(b.get.operation) || description.generation != work.operationGeneration || description.generation != query.owner.generation || description.sourceCut != (sourceRelativeCut{}) {
		return sourceStagedOperationRequest{}, false
	}
	caller, owned := work.memberNodes[stagedReflectiveTargetOwner(&description).consumer]
	if !owned || caller < 0 || caller >= len(facts) {
		return sourceStagedOperationRequest{}, false
	}
	if !stagedNativeInputSourceOwner(&facts[caller], description.creating.use, query.executable) || !stagedNativeInputEligible(description.creating.use, &facts[caller], query.executable) {
		return sourceStagedOperationRequest{}, false
	}
	expected, described := stagedNativeInputOccurrenceRequest(&facts[caller], description.creating.use)
	if existing := work.operationRecipes[expected.producer].nativeGet; existing != nil {
		expected = existing.request
	}
	if !described || !sameOperationRequest(expected, description.creating) {
		return sourceStagedOperationRequest{}, false
	}
	if description.native.get != nil {
		native := query.stagedNativeGet
		if native == nil || native.issuer != query || native.owner != query.owner || native.generation != work.operationGeneration || native.call != description.native.request.use || native.getRequest != description.native.request || description.native.get != native.call.Expression() || description.native.cut != query.relativeInputCut(b.get.operation) {
			return sourceStagedOperationRequest{}, false
		}
	} else if !b.constructionCallee {
		return sourceStagedOperationRequest{}, false
	}
	description.origin = b.coverage.origin
	description.request = stagedReflectiveTargetRequest(&description)
	prior, known := work.operationRecipes[description.request.producer]
	if !known || prior.memberSource == nil || !sameOperationRequest(prior.memberSource.parent, stagedReflectiveTargetOwner(&description)) || prior.memberSource.candidate.operation != description.operation || prior.memberSource.candidate.origin != description.origin || prior.memberSource.candidate.cut != description.cut {
		return sourceStagedOperationRequest{}, false
	}
	member := *prior.memberSource
	addedKey := false
	if member.targetSource != nil {
		description.keySource = cloneReflectiveKey(member.targetSource.keySource)
		description.resultSupport = cloneReflectiveResult(member.targetSource.resultSupport)
	}
	if description.keySource == nil && !prior.delta.extracted {
		description.keySource = work.describeReflectiveKey(query, &description)
		addedKey = description.keySource != nil
	}
	if member.targetSource != nil {
		if !validStagedReflectiveTargetRecipe(prior) || !sameStagedReflectiveTarget(member.targetSource, &description) {
			return sourceStagedOperationRequest{}, false
		}
		copy := *member.targetSource
		copy.keySource = cloneReflectiveKey(description.keySource)
		copy.resultSupport = cloneReflectiveResult(description.resultSupport)
		member.targetSource = &copy
	} else {
		member.targetSource = &description
	}
	recipe := prior
	recipe.memberSource = &member
	if member.targetSource.keySource != nil {
		recipe.delta = cloneOperationDelta(prior.delta)
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, description.creating)
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, reflectiveKeyReading(member.targetSource))
	}
	beforeSupport := recipe.memberSource.targetSource.resultSupport
	if recipe.memberSource.targetSource.keySource != nil || recipe.memberSource.targetSource.sourceCut != (sourceRelativeCut{}) {
		recipe = work.extendReflectiveResult(recipe)
	}
	addedSupport := beforeSupport != recipe.memberSource.targetSource.resultSupport
	member = *recipe.memberSource
	description.resultSupport = cloneReflectiveResult(member.targetSource.resultSupport)
	if !validStagedReflectiveTargetRecipe(recipe) {
		return sourceStagedOperationRequest{}, false
	}
	symbol := query.owner.checker.GetSymbolAtLocation(description.target.expression)
	if symbol == nil || symbol.ValueDeclaration != description.binding || query.owner.bindingWritten(symbol) {
		return sourceStagedOperationRequest{}, false
	}
	if prior.memberSource.targetSource != nil {
		if !sameStagedReflectiveTarget(prior.memberSource.targetSource, &description) {
			return sourceStagedOperationRequest{}, false
		}
	}
	if prior.memberSource.targetSource == nil || addedKey || addedSupport {
		if !work.attachOperationSource(facts, recipe) {
			return sourceStagedOperationRequest{}, false
		}
	}
	if member.targetSource.keySource != nil {
		work.enrollReflectiveKey(facts, recipe)
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[recipe.key] = work.operationGeneration
		if id := work.operationIDs[recipe.key]; id.epoch == work.operationEpoch && id.index != 0 {
			work.operations[id.index].memberCoverageObserved = true
		}
	}
	if description.native.get == nil {
		// Retain C before finishing the initial constructor observation.
		phase := stagedConstructionRequest(description.construction, "callee")
		callee := work.operationRecipes[phase.producer]
		if !validStagedConstructionEffectsRecipe(callee) {
			return sourceStagedOperationRequest{}, false
		}
		callee.delta = cloneOperationDelta(callee.delta)
		callee.delta.required = appendEntryLawRequirement(callee.delta.required, description.parent)
		if !validStagedConstructionEffectsRecipe(callee) || !work.attachOperationSource(facts, callee) {
			return sourceStagedOperationRequest{}, false
		}
		if _, ok := work.requireOperation(facts, description.construction); !ok {
			return sourceStagedOperationRequest{}, false
		}
		if _, ok := work.requireOperation(facts, phase); !ok {
			return sourceStagedOperationRequest{}, false
		}
	}
	if _, ok := work.requireOperation(facts, description.parent); !ok {
		return sourceStagedOperationRequest{}, false
	}
	if _, ok := work.requireOperation(facts, description.request); !ok {
		return sourceStagedOperationRequest{}, false
	}
	if _, ok := work.requireOperation(facts, stagedReflectiveTargetReading(&description)); !ok {
		return sourceStagedOperationRequest{}, false
	}
	b.required = appendEntryLawRequirement(b.required, description.request)
	return description.request, true
}

// publishStagedReflectiveTargetSource is called inside the actual selected
// Create interval. A cached recipe or a copied selection cannot renew it.
func (work *callableEffectWork) publishStagedReflectiveTargetSource(facts []callableFacts, query *sourceValueQuery, request sourceStagedOperationRequest, source *sourceStagedNativeGetSource, selection *sourceStagedNativeSelection) bool {
	b := query.stagedNativeGet
	prior := work.operationRecipes[request.producer]
	if b == nil || b.issuer != query || b.owner != query.owner || b.generation != work.operationGeneration || b.inputSelection == nil || b.inputSelection != selection || b.inputSelection.call != b.call || source == nil || source.kind != sourceNativeObjectCreate || query.protectedMember != source.get || query.effectOwner != source.request.consumer || source.get != b.call.Expression() || source.request.producer.operation != b.call || !sameOperationRequest(b.inputSelection.request, source.request) || b.inputSelection.selected.native == nil || b.inputSelection.selected.native.kind != sourceNativeObjectCreate || b.inputSelection.selected.node != source.method || !validStagedReflectiveTargetRecipe(prior) {
		return false
	}
	original := prior.memberSource.targetSource
	algorithm := work.operationRecipes[nativeRootDebtRequest(source, "algorithm").producer]
	if original.method != source.method || !sameOperationRequest(original.creating, source.request) || original.generation != work.operationGeneration || !validNativeGetRecipe(algorithm) || algorithm.nativeGet.prototype == nil || !sameNativeGetSource(algorithm.nativeGet, source) || !sameOperationEndpoint(original.prototype, algorithm.nativeGet.prototype.input) {
		return false
	}
	copy := *original
	copy.method, copy.prototype, copy.sourceCut = source.method, cloneSourceRelativeEndpoint(algorithm.nativeGet.prototype.input), query.relativeInputCut(b.call)
	member := *prior.memberSource
	member.targetSource = &copy
	next := prior
	next.memberSource = &member
	next.delta = cloneOperationDelta(prior.delta)
	next.delta.required = appendEntryLawRequirement(next.delta.required, source.request)
	if source.callAlternatives.producer.operation != nil {
		next.delta.required = appendEntryLawRequirement(next.delta.required, source.callAlternatives)
	}
	if source.callAlternatives.producer.operation != nil || copy.keySource != nil {
		next = work.extendReflectiveResult(next)
		copy = *next.memberSource.targetSource
	}
	next.delta.extracted = nativeMemberCallRequirementCount(source) == 0 && len(source.callResults) == 0
	if copy.keySource != nil || copy.resultSupport != nil {
		next.delta.extracted = prior.delta.extracted
	} // Key relevance owns its separate current reducer.
	if !validStagedReflectiveTargetRecipe(next) {
		return false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[next.key] = work.operationGeneration
	if id, adopted := work.operationIDs[next.key]; adopted {
		work.operations[id.index].memberCoverageObserved = true
	}
	return work.attachOperationSource(facts, next)
}

func (work *callableEffectWork) deliverStagedReflectiveTarget(facts []callableFacts, use sourceStagedOperationUse, delta sourceStagedOperationDelta) bool {
	recipe := work.operationRecipes[use.request.producer]
	if !validStagedReflectiveTargetRecipe(recipe) || !sameOperationRequest(use.request, stagedReflectiveTargetReading(recipe.memberSource.targetSource)) && !sameOperationRequest(use.request, recipe.memberSource.request) || use.call != nil || use.installed != nil {
		return false
	}
	if recipe.memberSource.targetSource.preparation != nil {
		return sameOperationRequest(use.request, recipe.memberSource.request) || work.validGetPreparationReflectiveTargetReading(recipe, use.request)
	}
	if !delta.extracted {
		return true
	}
	if work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	if use.request.reading == (sourceStagedOperationKey{}) {
		return true
	}
	if target, known := work.operationIDs[recipe.key]; known && target.epoch == work.operationEpoch {
		state := &work.operations[target.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{use.request.consumer, use.request.edge}]
		if subscriber != nil && !subscriber.blocked && subscriber.applied == state.revision {
			return true
		}
	}
	source := recipe.memberSource.targetSource
	if source.native.get != nil {
		return work.scheduleReflectiveNativeRefresh(use.request, source)
	}
	request := stagedConstructionRequest(source.construction, "callee")
	id, adopted := work.operationIDs[request.producer]
	phase := work.operationRecipes[request.producer].constructionEffects
	if !adopted || id.epoch != work.operationEpoch || phase == nil || phase.generation != work.operationGeneration || !sameOperationRequest(phase.request, request) || !sameOperationRequest(phase.root, source.construction) {
		return false
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.delivery && !task.operationDone {
			return true
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[request.consumer], operation: id})
	return true
}

// stagedReflectiveTargetCurrent distinguishes an applied local source revision
// from its immutable description and from transitive dependency closure.
func (work *callableEffectWork) stagedReflectiveTargetCurrent(request sourceStagedOperationRequest) bool {
	recipe := work.operationRecipes[request.producer]
	if recipe.memberSource != nil && recipe.memberSource.targetSource != nil {
		s := recipe.memberSource.targetSource
		if (s.keySource != nil || s.resultSupport != nil) && !work.reflectiveBirthCurrent(recipe) {
			return false
		}
	} // Key-local extraction is never a birth witness.
	id, adopted := work.operationIDs[request.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !validStagedReflectiveTargetRecipe(recipe) || !sameOperationRequest(request, recipe.memberSource.request) || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	return !state.invalid && state.revision != 0 && state.delta.extracted && subscriber != nil && !subscriber.blocked && sameOperationRequest(subscriber.request, request) && subscriber.applied == state.revision
}

// stagedReflectiveTargetPending authenticates ownership of an unresolved target
// decision, not target irrelevance. The exact adopted subscriber and an existing
// producer/delivery/constructor task must still provide its continuation.
func (work *callableEffectWork) stagedReflectiveTargetPending(query *sourceValueQuery, request sourceStagedOperationRequest) bool {
	if r := work.operationRecipes[request.producer]; r.memberSource != nil && r.memberSource.targetSource != nil && r.memberSource.targetSource.preparation != nil {
		return work.preparedReflectiveTargetPending(query, request)
	}
	if query == nil || query.owner == nil || query.owner.generation != work.operationGeneration {
		return false
	}
	b := query.stagedMember
	recipe := work.operationRecipes[request.producer]
	if b == nil || !query.liveStagedMemberSource(b, b.get, b.read) || !validStagedReflectiveTargetRecipe(recipe) || !sameOperationRequest(recipe.memberSource.request, request) {
		return false
	}
	source := recipe.memberSource.targetSource
	if source.generation != work.operationGeneration || source.cut != query.relativeInputCut(b.get.operation) || !sameOperationRequest(stagedReflectiveTargetOwner(source), b.request) || b.coverage == nil || !sameOperationRequest(source.parent, b.coverage.request) || !b.seen[source.operation] {
		return false
	}
	if source.keySource != nil {
		return work.reflectiveKeyPending(source)
	}
	if source.native.get != nil {
		return work.pendingReflectiveNativeTarget(query, request, source)
	}
	if !b.constructionCallee {
		return false
	}
	phase := stagedConstructionRequest(source.construction, "callee")
	coverage, callee := work.operationRecipes[source.parent.producer], work.operationRecipes[phase.producer]
	if !validStagedMemberCoverageRecipe(coverage) || !validStagedConstructionEffectsRecipe(callee) {
		return false
	}
	retainedC, retainedTarget := false, false
	for _, child := range callee.delta.required {
		retainedC = retainedC || sameOperationRequest(child, source.parent)
	}
	for _, child := range coverage.delta.required {
		retainedTarget = retainedTarget || sameOperationRequest(child, request)
	}
	if !retainedC || !retainedTarget {
		return false
	}
	var targetID, phaseID sourceStagedOperationID
	for _, required := range []sourceStagedOperationRequest{source.construction, phase, source.parent, request} {
		id, adopted := work.operationIDs[required.producer]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid {
			return false
		}
		if sameOperationRequest(required, request) {
			targetID = id
		}
		if sameOperationRequest(required, phase) {
			phaseID = id
		}
	}
	state := &work.operations[targetID.index]
	reading := stagedReflectiveTargetReading(source)
	subscriber := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	if subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, reading) {
		return false
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operationDone {
			continue
		}
		producer := task.operation == targetID && !task.delivery && !state.targetSourceRequested
		observed := state.delta.extracted && work.memberCoverageObserved[recipe.key] == work.operationGeneration
		delivery := task.operation == targetID && task.delivery && state.deliveryQueued
		refresh := task.operation == phaseID && !task.delivery
		if producer || observed && (delivery || refresh) {
			return true
		}
	}
	return false
}

// prepareStagedReflectiveTargetProducer enters only the original selected-source
// owner, on this role's existing extraction task. Description/admission remains
// passive; an unsupported whole Call is not adopted or recovered here.
func (work *callableEffectWork) prepareStagedReflectiveTargetProducer(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner, execution *sourceStagedReflectiveGetExecution) {
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if !validStagedReflectiveTargetRecipe(recipe) || owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration {
		return
	}
	if recipe.memberSource.targetSource.resultSupport != nil {
		next := work.extendReflectiveResult(recipe)
		if !work.attachOperationSource(facts, next) {
			return
		}
		recipe = next
		if work.prepareReflectiveBirth(facts, id) {
			return
		}
	}
	if recipe.memberSource.targetSource.keySource != nil {
		work.enrollReflectiveKey(facts, recipe)
		work.prepareReflectiveKey(facts, id)
	}
	if recipe.memberSource.targetSource.resultSupport != nil {
		if recipe.memberSource.targetSource.preparation != nil {
			// The exact APPLIED target subscriber wakes its existing Get preparation.
			// This producer may not issue a native/constructor Get for that reader.
			work.prepareReflectiveBirth(facts, id)
			return
		}
		work.observeReflectiveOriginalGet(facts, execution)
		work.prepareReflectiveBirth(facts, id)
		return
	}
	if work.memberCoverageObserved[recipe.key] == work.operationGeneration {
		work.publishOperation(id, recipe.delta)
		return
	}
	if state.targetSourceRequested {
		return
	}
	source := recipe.memberSource.targetSource
	caller, known := work.memberNodes[source.creating.consumer]
	if !known || !stagedNativeInputSourceOwner(&facts[caller], source.creating.use, owner) || !stagedNativeInputEligible(source.creating.use, &facts[caller], owner) {
		return
	}
	state.targetSourceRequested = true
	work.describeNativeInputOccurrence(facts, caller, source.creating.use, owner)
}
