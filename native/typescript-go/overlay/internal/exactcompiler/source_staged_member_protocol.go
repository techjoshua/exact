package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMemberProtocol retains the exact original semantic source request
// for an indexed protocol. Requiring source extraction does not invoke its body
// in the reader or retarget its creating inputs, consumer, or observation cut.
type sourceStagedMemberProtocol struct {
	constructedLookup *sourceStagedConstructedLookupSource
	nativeArgument    *sourceStagedNativeArgumentProtocol // Detached original native input Effects association.
	selfRead          bool                                // contextual source relevance, never whole Call Effects
	setEffects        bool                                // original Set Effects, never stored-value or callee selection
	required          sourceStagedOperationRequest
	get               *sourceStagedMemberExternalGet
	evaluation        *sourceStagedEvaluation
	external          *ast.Node // original declaration-only terminal, not a failed producer
}

func validStagedMemberProtocolRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	if s != nil && s.protocolSource != nil && s.protocolSource.constructedLookup != nil {
		return validConstructedLookupProtocolRecipe(recipe)
	}
	if s != nil && s.protocolSource != nil && s.protocolSource.nativeArgument != nil && (s.protocolSource.selfRead || s.protocolSource.setEffects || s.protocolSource.get != nil || s.protocolSource.evaluation != nil || s.protocolSource.external != nil) {
		return false
	}
	if s != nil && s.protocolSource != nil && s.protocolSource.setEffects {
		return validStagedSetWriterRecipe(recipe)
	}
	if s != nil && s.protocolSource != nil && s.protocolSource.evaluation != nil {
		return validStagedEvaluationRecipe(recipe)
	}
	if !validStagedMemberProtocolEnvelope(recipe) {
		return false
	}
	if s != nil && s.protocolSource != nil && (s.protocolSource.selfRead || s.protocolSource.get != nil && !sameOperationRequest(s.parent, s.request)) {
		return validStagedMemberSelfReadRecipe(recipe)
	}
	if s != nil && s.protocolSource != nil && s.protocolSource.get != nil {
		return validStagedMemberExternalGetRecipe(recipe)
	}
	if s != nil && s.protocolSource != nil && s.protocolSource.external != nil {
		return validStagedMemberExternalRecipe(recipe)
	}
	if s == nil || s.protocolSource == nil || s.generation == nil || !s.candidate.protocol || s.candidate.reflective || s.candidate.runtimeUnknown || s.coverage != nil || s.call != nil || s.getEffects != nil || !stagedMemberFactoryParent(s) || !stagedMemberFactoryObservation(s, s.candidate.cut) || !sameOperationRequest(s.request, stagedMemberCandidateRequest(s.parent, s.candidate)) || recipe.key != s.request.producer || !recipe.delta.extracted || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], s.protocolSource.required) || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects)+len(recipe.delta.residuals)+len(recipe.writerRequired) != 0 {
		return false
	}
	r := s.protocolSource.required
	operation := s.candidate.operation
	if operation == nil || (r.producer.declaration != s.candidate.region && !(s.candidate.region == nil && runtimeModuleEvaluation(r.producer.declaration) && sourceStagedOccurrenceOwned(operation, r.producer.declaration))) || r.consumer != r.producer.declaration || r.inputs != nil || r.producer.kind != relativeDemandEffects || r.use != r.producer.operation || r.cut != (sourceRelativeCut{operation: r.use, use: r.use, reading: r.use}) {
		return false
	}
	if s.protocolSource.nativeArgument != nil {
		return validStagedNativeArgumentProtocol(s)
	}
	if r.producer.operation == operation && r.producer.selector == (sourceStagedOperationSelector{}) {
		return true
	}
	if r.producer.operation == operation && stagedResultExpression(operation) && !ast.IsCallExpression(operation) && sameOperationRequest(r, stagedGetResultRequest(operation, r.consumer, "effects", nil)) {
		return true
	}

	if r.producer.operation == operation && r.producer.selector == (sourceStagedOperationSelector{occurrence: operation, field: "member-get-effects"}) {
		return ast.IsPropertyAccessExpression(operation)
	}
	// A callee Get demands only its original Get contribution, never the later
	// argument evaluation or invocation represented by its enclosing Call root.
	if r.producer.operation == operation && r.producer.selector == (sourceStagedOperationSelector{}) {
		return ast.IsPropertyAccessExpression(operation) || ast.IsElementAccessExpression(operation)
	}
	if !ast.IsPropertyAccessExpression(operation) && !ast.IsElementAccessExpression(operation) || !ast.IsCallExpression(r.use) {
		return false
	}
	if r.producer.selector.field == "callee-get" && r.producer.selector.occurrence == r.use.Expression() && r.producer.selector.association == nil {
		for node := r.use.Expression(); ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node); node = node.Expression() {
			if node == operation {
				return true
			}
		}
	}
	actuals := restrictedInvocationArguments(r.use.AsCallExpression())
	return len(actuals) > 0 && actuals[0] == operation && r.producer.selector == (sourceStagedOperationSelector{occurrence: operation, field: "eager-target"})
}

// prepareStagedMemberProtocol connects already issued semantic source roles.
// It does not derive completion from a canonical body, syntax inventory, a known
// value prefix or another operation's Effects. The child's own producer and
// current-graph receipts continue to gate transitive closure.
func (work *callableEffectWork) prepareStagedMemberProtocol(facts []callableFacts, id sourceStagedOperationID, owners ...*executableBodyOwner) bool {
	return work.attachStagedMemberProtocol(facts, work.operations[id.index].key, owners...)
}

// Source description may be attached before adoption. This registers no IDs or
// subscribers and performs no producer work or original input binding.
func (work *callableEffectWork) attachStagedMemberProtocol(facts []callableFacts, key sourceStagedOperationKey, owners ...*executableBodyOwner) bool {
	recipe := work.operationRecipes[key]
	s := recipe.memberSource
	if s != nil && s.protocolSource != nil && s.protocolSource.constructedLookup != nil && !recipe.delta.extracted {
		if request, issued := work.memberProtocolSources[s.candidate.operation]; issued && len(owners) == 1 {
			return work.attachConstructedLookupProtocol(facts, key, work.operationRecipes[request.producer], owners[0])
		}
		return false
	}
	if s == nil || s.protocolSource != nil || s.coverage != nil || s.call != nil || s.getEffects != nil || s.moduleExcluded != nil || s.candidate.operation == nil || s.generation != work.operationGeneration || s.extraction == nil || !s.candidate.protocol && !s.writeEffects {
		return false
	}
	if work.attachStagedExternalGetContext(facts, key, nil) {
		return true
	}
	request, issued := work.memberProtocolSources[s.candidate.operation]
	if !issued || request.producer == key || !validOperationEnvelope(work.operationRecipes[request.producer]) {
		return false
	}
	if producer := work.operationRecipes[request.producer]; producer.constructed != nil {
		if len(owners) == 1 && work.attachConstructedLookupProtocol(facts, key, producer, owners[0]) {
			return true
		}
		// Only the private Set's contextual source uses this existing Call
		// contribution. Library Get relevance keeps its separate owner above.
		if !work.constructedSetProtocolParent(s, producer) {
			return false
		}
	}
	copy := *s
	copy.protocolSource = &sourceStagedMemberProtocol{required: request}
	if argument, native := work.attachStagedNativeArgumentProtocol(s, request); native {
		copy.protocolSource.nativeArgument = argument
	}
	if source := stagedSetWriterOperation(s.candidate); source != nil && (s.candidate.protocol || s.writeEffects) && source == request.producer.operation {
		copy.protocolSource.setEffects = true
	}
	recipe.memberSource = &copy
	recipe.delta.required = []sourceStagedOperationRequest{request}
	recipe.delta.extracted = true
	if !validStagedMemberProtocolRecipe(recipe) {
		return false
	}
	return work.attachOperationSource(facts, recipe)
}

// indexStagedMemberProtocolSource indexes only roles already admitted by the
// original semantic owner. The association supplies neither source disposition
// nor selection. The original producer still owns both after adoption.
func (work *callableEffectWork) indexStagedMemberProtocolSource(recipe sourceStagedOperationRecipe, owners ...*executableBodyOwner) {
	record := func(operation *ast.Node, request sourceStagedOperationRequest) {
		work.recordStagedMemberProtocolSource(operation, request, owners...)
	}
	if source := recipe.memberSource; source != nil && source.getEffects != nil && ast.IsPropertyAccessExpression(source.parent.producer.operation) {
		record(source.parent.producer.operation, source.request)
	} else if work.issuedConstructedProtocolSource(recipe) {
		record(recipe.constructed.request.producer.operation, recipe.constructed.request)
		// The original Call owns this method Get, before actual evaluation.
		// This is an association only; the typed consumer demands its Get role.
		record(recipe.constructed.get, recipe.constructed.request)
	} else if recipe.declarationCall != nil {
		record(recipe.key.operation, stagedDeclarationCallEffectsRequest(recipe.key.operation, recipe.key.declaration))
	} else if result := recipe.callResult; result != nil && result.getResult != nil && result.getResult.role == "effects" && recipe.delta.extracted {
		record(recipe.key.operation, result.request)
	} else if source := recipe.constructionEffects; source != nil && source.phase == "" {
		record(source.root.producer.operation, source.root)
	} else if source := recipe.assignment; source != nil && source.phase == "" {
		record(source.root.producer.operation, source.root)
		record(source.root.producer.operation.AsBinaryExpression().Left, source.root)
	} else if source := recipe.nativeGet; source != nil {
		work.indexStagedNativeArgumentProtocol(recipe)
		if recipe.key == source.request.producer {
			record(source.request.producer.operation, source.request)
		}
		if recipe.key == nativeRootDebtRequest(source, "callee-get").producer {
			request := nativeRootDebtRequest(source, "callee-get")
			// The original callee loan owns these selector Gets before actuals. Nested
			// bodies are not visited by this receiver chain.
			for node := source.get; ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node); node = node.Expression() {
				record(node, request)
			}
		}
		if recipe.key == nativeEagerTargetRequest(source).producer {
			actuals := restrictedInvocationArguments(source.request.producer.operation.AsCallExpression())
			if len(actuals) > 0 && (ast.IsPropertyAccessExpression(actuals[0]) || ast.IsElementAccessExpression(actuals[0])) {
				record(actuals[0], nativeEagerTargetRequest(source))
			}
		}
	} else if member := recipe.memberSource; member != nil && member.protocolSource != nil && (member.protocolSource.external != nil || member.protocolSource.get != nil && sameOperationRequest(member.parent, member.request) || member.protocolSource.evaluation != nil && member.protocolSource.evaluation.phase == "") {
		record(member.candidate.operation, member.request)
	}
}

// recordStagedMemberProtocolSource shares original source publication and
// reached-use indexing. Both can satisfy an already-described source consumer.
func (work *callableEffectWork) recordStagedMemberProtocolSource(operation *ast.Node, request sourceStagedOperationRequest, owners ...*executableBodyOwner) {
	if operation == nil {
		return
	}
	if work.memberProtocolSources == nil {
		work.memberProtocolSources = make(map[*ast.Node]sourceStagedOperationRequest)
	}
	work.memberProtocolSources[operation] = request
	// The original source may arrive after another Get described this
	// candidate. Attach that same typed source now, before its consumer
	// makes an admission decision. This creates no ordinary use or body.
	var waiting []sourceStagedOperationKey
	for key, candidate := range work.operationRecipes {
		source := candidate.memberSource
		if source != nil && source.candidate.operation == operation && source.generation == work.operationGeneration && source.protocolSource == nil && source.extraction != nil && (source.candidate.protocol || source.writeEffects) {
			waiting = append(waiting, key)
		}
	}
	for _, key := range waiting {
		work.attachStagedMemberProtocol(work.operationFacts, key, owners...)
	}
}

// indexStagedMemberProtocolUse shares original per-occurrence Effects issuance
// across semantic owners. It indexes a source relationship, not runtime entry.
// Subordinate source-set roles and dormant value/invocation uses cannot replace
// the original operation's complete Effects role.
func (work *callableEffectWork) indexStagedMemberProtocolUse(use sourceStagedOperationUse) {
	request := use.request
	if use.call != nil || use.installed != nil || request.inputs != nil || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || request.consumer != request.producer.declaration || request.use != request.producer.operation {
		return
	}
	if !validOperationEnvelope(work.operationRecipes[request.producer]) {
		return
	}
	work.recordStagedMemberProtocolSource(request.producer.operation, request)
}

// registerStagedMemberExternal is called at the original collector's reached
// opaque-declaration terminal. Its existing summary keeps the actual unknown
// Effects. This receipt supplies only finite protocol source extraction to
// other source consumers, without executing that declaration in those readers.
func (work *callableEffectWork) registerStagedMemberExternal(facts []callableFacts, consumer int, call *ast.Node, owner *executableBodyOwner) bool {
	if !sourceOpaqueDeclarationCall(call, owner) {
		return false
	}
	request, issued := sourceStagedOccurrenceRequest(&facts[consumer], call, relativeDemandEffects, stagedDeclarationCallEdge(facts[consumer].summary.ID, sourceRelativeInvocation{operation: call}))
	if !issued {
		return false
	}
	declaration := owner.checker.GetSymbolAtLocation(call.Expression()).ValueDeclaration
	candidate := sourceStagedMemberCandidate{request: request, operation: call, origin: declaration, region: facts[consumer].node, protocol: true, cut: request.cut}
	source := &sourceStagedMemberSource{parent: request, candidate: candidate, generation: owner.values.generation, protocolSource: &sourceStagedMemberProtocol{external: declaration}}
	source.request = request
	recipe := sourceStagedOperationRecipe{key: source.request.producer, memberSource: source, delta: sourceStagedOperationDelta{extracted: true}}
	work.operationGeneration = owner.values.generation
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
	return true
}

func validStagedMemberExternalRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	if !validStagedMemberProtocolEnvelope(recipe) || s == nil || s.protocolSource == nil || s.protocolSource.external == nil || !sameOperationRequest(s.protocolSource.required, sourceStagedOperationRequest{}) || s.generation == nil || !s.candidate.protocol || s.candidate.region != s.parent.consumer || s.candidate.operation != s.parent.producer.operation || s.candidate.origin != s.protocolSource.external || s.candidate.cut != s.parent.cut || !stagedMemberFactoryParent(s) || !sameOperationRequest(s.request, s.parent) || recipe.key != s.request.producer || !recipe.delta.extracted || operationDeltaSize(recipe.delta) != 0 || s.coverage != nil || s.call != nil || s.getEffects != nil || len(recipe.writerRequired) != 0 {
		return false
	}
	declaration := s.protocolSource.external
	return ast.IsFunctionDeclaration(declaration) && declaration.Body() == nil && ast.IsCallExpression(s.candidate.operation) && declaration.Parent != nil && ast.IsSourceFile(declaration.Parent) && ast.GetSourceFileOfNode(declaration) == ast.GetSourceFileOfNode(s.candidate.operation) && !standardLibrarySource(ast.GetSourceFileOfNode(declaration))
}

func validStagedMemberProtocolEnvelope(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	return s != nil && recipe.nativeGet == nil && recipe.callResult == nil && recipe.mapEntry == nil && recipe.mapProtocol == nil && recipe.constructed == nil && recipe.constructedDisposition == nil && recipe.writer == nil && recipe.getter == nil && recipe.returning == nil && len(recipe.writerRequired)+len(recipe.fieldForwards)+len(recipe.constructedInputs)+len(recipe.constructedGroup) == 0 && !s.candidate.reflective && !s.candidate.runtimeUnknown && !s.candidate.getContribution && !s.candidate.invoking && sameOperationRequest(s.candidate.request, s.parent) && s.moduleExcluded == nil && len(s.moduleImports) == 0 && len(s.values) == 0 && sameOperationEndpoint(s.candidate.target, sourceRelativeEndpoint{}) && sameOperationEndpoint(s.candidate.key, sourceRelativeEndpoint{}) && sameOperationEndpoint(s.candidate.value, sourceRelativeEndpoint{})
}

func (work *callableEffectWork) constructedSetProtocolParent(source *sourceStagedMemberSource, producer sourceStagedOperationRecipe) bool {
	if source == nil || source.extraction == nil || source.extraction.mode != accessorSet|accessorNoGet || source.generation != work.operationGeneration || !ast.IsNewExpression(source.candidate.origin) || !ast.IsPropertyAccessExpression(source.parent.producer.operation) || !work.issuedConstructedProtocolSource(producer) {
		return false
	}
	target := source.parent.producer.operation
	if target.Parent == nil || !plainStagedAssignment(target.Parent) || target.Parent.AsBinaryExpression().Left != target {
		return false
	}
	// This is the candidate Call's full original Effects contribution. Its own
	// source group must be authentic, but no receiver overlap with this Set is
	// needed to conservatively retain those Effects. No identity or selection
	// conclusion follows for either allocation.
	return producer.constructed.request.producer.operation == source.candidate.operation && producer.constructed.request.consumer == source.candidate.region
}
