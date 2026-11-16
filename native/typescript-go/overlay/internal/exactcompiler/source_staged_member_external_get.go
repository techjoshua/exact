package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMemberExternalGet is a detached original library Get terminal.
// Library execution placement supplies its Effects domain, not a property value,
// receiver identity, mutation exclusion or permission to omit source writers.
type sourceStagedMemberExternalGet struct {
	operation, expression, declaration, member *ast.Node
	cut                                        sourceRelativeCut
	generation                                 *projectGeneration
	standardSymbolData                         bool
	standardRead                               sourceStandardPropertyReadKind // Original supported operation contract, not a type-based purity claim.
	preparation                                sourceStagedOperationRequest   // Same original Get's SOURCE preparation, independent of C.
}

func (q *sourceValueQuery) stagedMemberExternalGet(expression *ast.Node, symbol *ast.Symbol, mode accessorTraversal) *sourceStagedMemberExternalGet {
	if q == nil || q.stagedMember == nil || q.owner == nil || symbol == nil || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) || mode != accessorRead || !ast.IsPropertyAccessExpression(q.protectedMember) || q.protectedMember.Expression() != expression {
		return nil
	}
	if len(q.owner.index(ast.GetSourceFileOfNode(q.protectedMember)).bindings[ast.GetSymbolId(symbol)]) != 0 {
		return nil
	} // Written receiver entry requires its source-input owner.
	member := q.owner.checker.GetSymbolAtLocation(q.protectedMember)
	if member == nil || member.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(member.ValueDeclaration)) {
		return nil
	}
	// Reuse the original reference owner's execution environment contract. It
	// does not classify arbitrary ambient/application objects as library values.
	effects, _ := sourceReferenceEffects(expression, q.effectOwner, ast.GetSourceFileOfNode(expression), q.owner.checker, "")
	standardSymbolData := q.standardSymbolDataGet(q.protectedMember, expression, symbol, member)
	if len(effects) == 0 && !standardSymbolData {
		return nil
	}
	return &sourceStagedMemberExternalGet{operation: q.protectedMember, expression: expression, declaration: symbol.ValueDeclaration, member: member.ValueDeclaration, standardSymbolData: standardSymbolData, standardRead: q.standardPropertyReadContract(q.protectedMember, expression, symbol, member), generation: q.owner.generation}
}

func validStagedMemberExternalGetRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	if !validStagedMemberProtocolEnvelope(recipe) || s.protocolSource == nil || s.protocolSource.get == nil || s.protocolSource.external != nil || s.generation == nil || !sameOperationRequest(s.parent, s.request) || recipe.key != s.request.producer || !validStagedMemberParent(s.parent) || !recipe.delta.extracted || (len(recipe.delta.required) != 1 && len(recipe.delta.required) != 2) || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects)+len(recipe.delta.residuals) != 0 {
		return false
	}
	g := s.protocolSource.get
	if g.standardRead != standardPropertyReadUnmodeled && !validStandardPropertyReadDescription(g) {
		return false
	}
	required := s.protocolSource.required
	if sameOperationRequest(g.preparation, sourceStagedOperationRequest{}) {
		if len(recipe.delta.required) != 1 {
			return false
		}
	} else if len(recipe.delta.required) != 2 || !sameOperationRequest(g.preparation, stagedGetPreparationRequest(s.parent)) || !sameOperationRequest(recipe.delta.required[1], g.preparation) {
		return false
	}
	return g.generation == s.generation && g.operation == s.parent.producer.operation && s.candidate.operation == g.operation && s.candidate.origin == g.expression && s.candidate.region == s.parent.consumer && s.candidate.cut == g.cut && validStagedMemberObservation(s.parent, g.cut) && g.cut.reading == g.operation && g.declaration != nil && g.member != nil && ast.IsPropertyAccessExpression(g.operation) && g.operation.Expression() == g.expression && standardLibrarySource(ast.GetSourceFileOfNode(g.declaration)) && standardLibrarySource(ast.GetSourceFileOfNode(g.member)) && sameOperationRequest(recipe.delta.required[0], required) && sameOperationRequest(required, stagedMemberCoverageRequest(s.parent, g.expression, g.cut))
}

// publishStagedMemberExternalGet requires the original Identifier/member owner
// and the completed source-discovery interval. All potential writer/protocol
// children remain on that separately observed source-set requirement.
func (work *callableEffectWork) publishStagedMemberExternalGet(facts []callableFacts, q *sourceValueQuery) bool {
	b := q.stagedMember
	if b == nil || b.externalGet == nil || b.coverage == nil || !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage.generation != work.operationGeneration || b.externalGet.operation != b.request.producer.operation || b.externalGet.cut != q.relativeInputCut(b.get.operation) || b.externalGet.generation != work.operationGeneration {
		return false
	}
	g := *b.externalGet
	if preparation := b.getPreparation; preparation != nil && preparation.plain && preparation.live(q) && preparation.id.index != 0 {
		g.preparation = stagedGetPreparationRequest(b.request)
		if prepared := work.getPreparationTaskSource(preparation.id); prepared == nil || !sameOperationRequest(prepared.parent, b.request) || !sameOperationRequest(prepared.request, g.preparation) {
			return false
		}
	}
	source := &sourceStagedMemberSource{parent: b.request, request: b.request, generation: b.generation, candidate: sourceStagedMemberCandidate{request: b.request, operation: g.operation, origin: g.expression, region: b.request.consumer, protocol: true, cut: g.cut}, protocolSource: &sourceStagedMemberProtocol{get: &g, required: b.coverage.request}}
	recipe := sourceStagedOperationRecipe{key: source.request.producer, memberSource: source, delta: sourceStagedOperationDelta{extracted: true, required: []sourceStagedOperationRequest{b.coverage.request}}}
	if !sameOperationRequest(g.preparation, sourceStagedOperationRequest{}) {
		recipe.delta.required = append(recipe.delta.required, g.preparation)
	}
	if _, exists := work.operationRecipes[recipe.key]; exists {
		if !work.attachOperationSource(facts, recipe) {
			return false
		}
	} else if !work.registerOperationRecipe(facts, recipe) {
		return false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[recipe.key] = work.operationGeneration
	if !sameOperationRequest(g.preparation, sourceStagedOperationRequest{}) {
		if !work.registerOperationUse(facts, sourceStagedOperationUse{request: source.request}) {
			return false
		}
		work.attachSourceObservationDependencies(facts, work.operationIDs[source.request.producer])
		work.attachSourceObservationDependencies(facts, work.operationIDs[g.preparation.producer])
	}
	return true
}

// prepareStagedMemberExternalGetSource re-enters this one original Effects-only
// Get producer in a fresh graph. Its direct library receiver has no initializer
// or caller inputs to replay. The Identifier owner must issue a new receipt and
// all source relationships again. Cached metadata itself supplies no readiness.
func (work *callableEffectWork) prepareStagedMemberExternalGetSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	work.refreshStagedMemberExternalGet(facts, work.operations[id.index].key, owner)
}

func (work *callableEffectWork) refreshStagedMemberExternalGet(facts []callableFacts, key sourceStagedOperationKey, owner *executableBodyOwner) {
	recipe := work.operationRecipes[key]
	s := recipe.memberSource
	if s == nil || s.protocolSource == nil || s.protocolSource.get == nil || owner == nil || owner.values == nil || s.generation != owner.values.generation || work.memberCoverageObserved[recipe.key] == work.operationGeneration && (sameOperationRequest(s.protocolSource.get.preparation, sourceStagedOperationRequest{}) || work.getPreparationReadingCurrent(s.protocolSource.get.preparation)) {
		return
	}
	node := s.candidate.operation
	if !sameOperationRequest(s.parent, s.request) {
		node = s.protocolSource.get.operation
	}
	q := newSourceDependencyQuery(node, owner.checker, owner, s.parent.consumer)
	defer q.publishDependencyStatistics()
	revoke, installed := work.beginStagedMemberWork(q, facts, s.parent)
	if !installed {
		return
	}
	defer revoke()
	q.evaluatedSourceAccessors(node, nil)
}

// refreshStagedMemberSourceReceipts obtains current original receipts for
// direct-library Gets and passive no-binder Set dependencies. It does not adopt
// either operation or lend caller bindings. Other semantic roots stay queued.
// This finite description walk creates no operation IDs or body subscriptions.
func (work *callableEffectWork) refreshStagedMemberSourceReceipts(facts []callableFacts, required []sourceStagedOperationRequest, owner *executableBodyOwner) {
	seen := make(map[sourceStagedOperationKey]bool)
	pending := append([]sourceStagedOperationRequest(nil), required...)
	for len(pending) != 0 {
		request := pending[len(pending)-1]
		pending = pending[:len(pending)-1]
		if seen[request.producer] {
			continue
		}
		seen[request.producer] = true
		recipe, present := work.operationRecipes[request.producer]
		if !present || !validOperationEnvelope(recipe) || !work.sameAdoptionSourceRequest(recipe, request) {
			continue
		}
		work.retainStagedDeclarationResultEffects(facts, request.producer)
		work.issueStagedAssignmentSource(facts, recipe, owner)
		work.refreshStagedAssignmentSource(facts, recipe, owner)
		if source := recipe.memberSource; source != nil && source.candidate.protocol && source.protocolSource == nil {
			parent := work.operationRecipes[source.parent.producer]
			if host := parent.memberSource; host != nil && host.protocolSource != nil && host.protocolSource.get != nil && !host.protocolSource.selfRead && work.stagedSelfReadMethod(source.candidate.operation, source.parent.consumer) {
				q := newSourceDependencyQuery(host.protocolSource.get.operation, owner.checker, owner, source.parent.consumer)
				if revoke, installed := work.beginStagedMemberWork(q, facts, source.parent); installed {
					q.evaluatedSourceAccessors(host.protocolSource.get.operation, nil)
					revoke()
				}
				q.publishDependencyStatistics()
			}
			work.issueStagedLibraryGetSource(facts, source.candidate, owner)
		}
		work.attachStagedMemberProtocol(facts, request.producer)
		work.refreshStagedMemberExternalGet(facts, request.producer, owner)
		recipe = work.operationRecipes[request.producer]
		pending = append(pending, recipe.delta.required...)
	}
}

// issueStagedLibraryGetSource connects an original direct-library Get occurrence
// before a dormant body needs invocation. The existing Identifier owner selects
// the library entry and publishes the current source receipt. User initializers,
// captured/formal receivers and input binding are never recovered by this path.
func (work *callableEffectWork) issueStagedLibraryGetSource(facts []callableFacts, candidate sourceStagedMemberCandidate, owner *executableBodyOwner) {
	node := candidate.operation
	if owner == nil || owner.values == nil || !candidate.protocol || node == nil || !ast.IsPropertyAccessExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	region := candidate.region
	if region == nil {
		region = sourceStagedModuleOwner(node)
	}
	consumer, known := work.memberNodes[region]
	if !known || consumer >= len(facts) {
		return
	}
	request, valid := stagedMemberGetSourceRequest(&facts[consumer], node)
	if !valid {
		return
	}
	if work.memberCoverageObserved[request.producer] == work.operationGeneration {
		return
	}
	q := newSourceDependencyQuery(node, owner.checker, owner, region)
	defer q.publishDependencyStatistics()
	revoke, installed := work.beginStagedMemberWork(q, facts, request)
	if !installed {
		return
	}
	defer revoke()
	q.protectedMember = node
	symbol := owner.checker.GetSymbolAtLocation(node.Expression())
	if q.stagedMemberExternalGet(node.Expression(), symbol, accessorRead) == nil {
		return
	}
	q.protectedMember = nil
	q.evaluatedSourceAccessors(node, nil)
}

// standardSymbolDataGet is the original Identifier/member owner's conditional
// standard DATA-slot contribution. Checker selection of the genuine global
// entry, not its declared type or the spelling of a local holder, supplies the
// entry. Source writer/protocol coverage remains independently required.
func (q *sourceValueQuery) standardSymbolDataGet(get, expression *ast.Node, root, member *ast.Symbol) bool {
	global := q.owner.checker.GetGlobalSymbol("Symbol", ast.SymbolFlagsValue, nil)
	if global == nil || global.ValueDeclaration == nil || root.ValueDeclaration != global.ValueDeclaration || !standardLibrarySource(ast.GetSourceFileOfNode(global.ValueDeclaration)) || !ast.IsIdentifier(expression) || member == nil || member.ValueDeclaration == nil {
		return false
	}
	if get == nil || !ast.IsPropertyAccessExpression(get) || get.Expression() != expression {
		return false
	}
	// ECMAScript's well-known-symbol properties are own nonaccessor data slots.
	// This supplies only their primitive category on successful standard access.
	switch get.Name().Text() {
	case "asyncIterator", "hasInstance", "isConcatSpreadable", "iterator", "match", "matchAll", "replace", "search", "species", "split", "toPrimitive", "toStringTag", "unscopables":
		return true
	}
	return false
}

// refineStagedExternalGetSelfCalls accounts only an actual represented method
// whose complete source population contributes this same terminal read. The
// read's own writer/protocol requirements remain. This is demand relevance,
// not NoWrites, execution history or a disposition for other library Gets.
func (work *callableEffectWork) refineStagedExternalGetSelfCalls(q *sourceValueQuery) {
	b := q.stagedMember
	if b == nil || b.externalGet == nil || b.coverage == nil || !q.liveStagedMemberSource(b, b.get, b.read) || b.generation != work.operationGeneration {
		return
	}
	g, c := b.externalGet, b.coverage
	index := q.owner.index(ast.GetSourceFileOfNode(g.operation))
	region := index.operationRegions[q.effectOwner]
	if index.incomplete || index.normalDynamicScope || region == nil || region.declaration != q.effectOwner || len(region.writes)+len(region.hazards)+len(region.calls)+len(region.openCalls)+len(region.thenOperations) != 0 {
		return
	}
	for _, member := range region.members {
		if member != g.operation {
			return
		}
	}
	for _, reference := range region.references {
		if reference != g.expression && !q.owner.checker.IsUndefinedSymbol(q.owner.checker.GetSymbolAtLocation(reference)) {
			return
		}
	}
	for _, request := range c.required {
		source := work.operationRecipes[request.producer].memberSource
		excluded := false
		if source != nil && source.candidate.protocol && source.generation == b.generation && source.candidate.origin == c.origin && source.candidate.cut == c.cut {
			excluded = work.stagedSelfReadMethod(source.candidate.operation, q.effectOwner)
		}
		if excluded && (source.protocolSource == nil || source.protocolSource.get != nil && !sameOperationRequest(source.parent, source.request)) {
			copy := *source
			get := *g
			copy.protocolSource = &sourceStagedMemberProtocol{selfRead: true, get: &get, required: c.request}
			recipe := work.operationRecipes[request.producer]
			recipe.memberSource = &copy
			recipe.delta = cloneOperationDelta(recipe.delta)
			recipe.delta.extracted = true
			recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, c.request)
			if work.attachOperationSource(work.operationFacts, recipe) {
				if work.memberCoverageObserved == nil {
					work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
				}
				work.memberCoverageObserved[recipe.key] = b.generation
				if id, adopted := work.operationIDs[recipe.key]; adopted {
					work.operations[id.index].memberCoverageObserved = true
				}
			}
		}
	}
}

func validStagedMemberSelfReadRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	if !validStagedMemberProtocolEnvelope(recipe) || s.protocolSource == nil || s.protocolSource.get == nil || s.protocolSource.external != nil || s.protocolSource.setEffects || s.protocolSource.evaluation != nil || !s.candidate.protocol || s.generation == nil || recipe.delta.extracted != s.protocolSource.selfRead || len(recipe.delta.required) == 0 || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects)+len(recipe.delta.residuals) != 0 {
		return false
	}
	g := s.protocolSource.get
	return g.generation == s.generation && s.candidate.origin == g.expression && s.candidate.cut == g.cut && g.operation == s.parent.producer.operation && s.parent.consumer == enclosingCallableNode(g.operation) && validStagedMemberParent(s.parent) && validStagedMemberObservation(s.parent, g.cut) && sameOperationRequest(s.request, stagedMemberCandidateRequest(s.parent, s.candidate)) && recipe.key == s.request.producer && sameOperationRequest(s.protocolSource.required, stagedMemberCoverageRequest(s.parent, g.expression, g.cut)) && stagedMemberSelfReadRequirements(recipe) && g.declaration != nil && g.member != nil && standardLibrarySource(ast.GetSourceFileOfNode(g.declaration)) && standardLibrarySource(ast.GetSourceFileOfNode(g.member))
}

// The original writer/result owner has already installed this exact method and
// canonical membership. Syntax indexing alone cannot issue this association.
func (work *callableEffectWork) stagedSelfReadMethod(operation, declaration *ast.Node) bool {
	call := work.operationRecipes[sourceStagedOperationKey{declaration: enclosingCallableNode(operation), operation: operation, kind: relativeDemandEffects}]
	found := false
	for _, member := range call.constructedGroup {
		own := work.operationRecipes[constructedMemberRequest(&member, "own-writers").producer]
		for _, required := range own.writerRequired {
			writer := work.operationRecipes[required.producer].writer
			if writer == nil {
				return false
			}
			if !writer.callable {
				continue
			}
			packet := work.writerSourceInputs[required.producer]
			if packet == nil || packet.generation != work.operationGeneration || len(writer.projections) == 0 {
				return false
			}
			for _, projection := range writer.projections {
				if projection == nil || !projection.delta.extracted || len(projection.pending) != 0 || len(projection.delta.exposures) == 0 {
					return false
				}
				for _, alternative := range projection.delta.exposures {
					if alternative.endpoint.expression != declaration || len(alternative.endpoint.projection) != 0 {
						return false
					}
				}
			}
			represented := false
			for _, method := range packet.methods {
				if method.declaration != declaration || !method.inputsMapped {
					return false
				}
				target, known := work.memberNodes[declaration]
				consumer, callerKnown := work.memberNodes[writer.request.consumer]
				dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, method.edge}]
				represented = known && callerKnown && dependency != nil && !dependency.invalid && !dependency.projectionPending && dependency.producer == target
			}
			if !represented {
				return false
			}
			found = true
		}
	}
	return found
}

// attachStagedExternalGetContext keeps a dynamic constructed member's source
// alternatives separate from full invocation Effects. No method is selected.
func (work *callableEffectWork) attachStagedExternalGetContext(facts []callableFacts, key sourceStagedOperationKey, get *sourceStagedMemberExternalGet) bool {
	recipe := work.operationRecipes[key]
	s := recipe.memberSource
	if s == nil || !s.candidate.protocol || s.coverage != nil || s.call != nil || s.getEffects != nil || s.moduleExcluded != nil || s.generation != work.operationGeneration || s.protocolSource != nil || !ast.IsCallExpression(s.candidate.operation) {
		return false
	}
	if get == nil {
		parent := work.operationRecipes[s.parent.producer].memberSource
		if parent == nil || parent.protocolSource == nil || parent.protocolSource.get == nil || parent.protocolSource.selfRead || work.memberCoverageObserved[s.parent.producer] != work.operationGeneration {
			return false
		}
		get = parent.protocolSource.get
	}
	if get.operation != s.parent.producer.operation || get.expression != s.candidate.origin || get.cut != s.candidate.cut || get.generation != s.generation {
		return false
	}
	call := work.operationRecipes[sourceStagedOperationKey{declaration: s.candidate.region, operation: s.candidate.operation, kind: relativeDemandEffects}]
	if len(call.constructedGroup) == 0 {
		return false
	}
	required := []sourceStagedOperationRequest{}
	for _, member := range call.constructedGroup {
		if member.kind != sourceNativeWeakMapGetEffect {
			return false
		}
		child := constructedMemberRequest(&member, "own-writers")
		if !validOperationEnvelope(work.operationRecipes[child.producer]) {
			return false
		}
		required = appendEntryLawRequirement(required, child)
		required = appendEntryLawRequirement(required, constructedMemberRequest(&member, "eager-inputs"))
	}
	coverage := stagedMemberCoverageRequest(s.parent, get.expression, get.cut)
	required = appendEntryLawRequirement(required, coverage)
	copy := *s
	g := *get
	copy.protocolSource = &sourceStagedMemberProtocol{get: &g, required: coverage}
	recipe.memberSource = &copy
	recipe.delta = sourceStagedOperationDelta{required: required}
	return work.attachOperationSource(facts, recipe)
}

func stagedMemberSelfReadRequirements(recipe sourceStagedOperationRecipe) bool {
	s := recipe.memberSource
	covered := false
	for _, request := range recipe.delta.required {
		if sameOperationRequest(request, s.protocolSource.required) {
			covered = true
			continue
		}
		// Original constructed own-writer roles retain all stored source children.
		if request.producer.operation != s.candidate.operation || request.producer.kind != relativeDemandEffects || (request.producer.selector.field != "own-writers" && request.producer.selector.field != "eager-inputs") || request.producer.selector.occurrence == nil || !ast.IsNewExpression(request.producer.selector.occurrence) {
			return false
		}
	}
	return covered
}

// Admission of this original typed producer is not extraction or completion.
// Its real source path can deliver the method after ordinary eager collection.
// Every original source child is already registered and remains required.
func (work *callableEffectWork) passiveStagedMemberContextSupported(recipe sourceStagedOperationRecipe) bool {
	if !validStagedMemberSelfReadRecipe(recipe) {
		return false
	}
	s := recipe.memberSource
	if s.generation != work.operationGeneration || work.memberCoverageObserved[s.parent.producer] != work.operationGeneration || work.memberCoverageObserved[s.protocolSource.required.producer] != work.operationGeneration {
		return false
	}
	parent := work.operationRecipes[s.parent.producer].memberSource
	if parent == nil || parent.protocolSource == nil || parent.protocolSource.get == nil || !sameOperationRequest(parent.request, parent.parent) || *parent.protocolSource.get != *s.protocolSource.get {
		return false
	}
	caller, known := work.memberNodes[s.candidate.region]
	if !known || caller >= len(work.operationFacts) || work.operationFacts[caller].node != s.candidate.region {
		return false
	}
	call := work.operationRecipes[sourceStagedOperationKey{declaration: s.candidate.region, operation: s.candidate.operation, kind: relativeDemandEffects}]
	if len(call.constructedGroup) == 0 {
		return false
	}
	expected := []sourceStagedOperationRequest{}
	for _, member := range call.constructedGroup {
		if member.kind != sourceNativeWeakMapGetEffect || !work.constructedIssued[[2]*ast.Node{s.candidate.operation, member.construction.site}] {
			return false
		}
		expected = appendEntryLawRequirement(expected, constructedMemberRequest(&member, "own-writers"))
		expected = appendEntryLawRequirement(expected, constructedMemberRequest(&member, "eager-inputs"))
	}
	expected = appendEntryLawRequirement(expected, s.protocolSource.required)
	if len(expected) != len(recipe.delta.required) {
		return false
	}
	for i, request := range expected {
		if !sameOperationRequest(request, recipe.delta.required[i]) || !validOperationEnvelope(work.operationRecipes[request.producer]) {
			return false
		}
	}
	return true
}

// issueStagedAssignmentSource demands only this observed candidate's original
// Set owner. Its own declaration and source fact supply inputs, never the Get
// reader's context. Passive registration retains every phase and child debt.
func (work *callableEffectWork) issueStagedAssignmentSource(facts []callableFacts, recipe sourceStagedOperationRecipe, owner *executableBodyOwner) {
	s := recipe.memberSource
	if s == nil || !s.writeEffects && !s.candidate.protocol || s.generation != work.operationGeneration || s.extraction == nil || s.extraction.generation != s.generation || s.extraction.cut != s.candidate.cut || !sameOperationRequest(s.extraction.request, s.parent) || !validStagedMemberRecipe(recipe) {
		return
	}
	coverageRequest := stagedMemberCoverageRequest(s.parent, s.candidate.origin, s.candidate.cut)
	coverage := work.operationRecipes[coverageRequest.producer].memberSource
	if coverage == nil || coverage.coverage == nil || coverage.generation != s.generation || coverage.coverage.cut != s.candidate.cut || work.memberCoverageObserved[coverageRequest.producer] != work.operationGeneration {
		return
	}
	included := false
	for _, required := range coverage.coverage.required {
		included = included || sameOperationRequest(required, s.request)
	}
	if !included {
		return
	}
	operation := stagedSetWriterOperation(s.candidate)
	if operation == nil || s.candidate.region == nil {
		return
	}
	consumer, known := work.memberNodes[s.candidate.region]
	if !known || consumer >= len(facts) || facts[consumer].node != s.candidate.region || !sourceStagedOccurrenceOwned(operation, facts[consumer].node) {
		return
	}
	work.registerStagedAssignmentEffects(facts, consumer, operation, owner)
}
