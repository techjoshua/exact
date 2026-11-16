package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedNativeEntry is one completed original standard DATA Get. It is
// query-local and expires before another graph can request module activation.
// Descriptor verdicts and acquired normal values are not transferred.
type sourceStagedNativeEntry struct {
	syntax     *ast.Node
	cut        sourceRelativeCut
	generation *projectGeneration
}

// stagedNativeGetNoUserEntry requires the original source Get's complete
// standard alternative and no invoked body/protocol. Pure/empty summaries and
// NoWrites metadata cannot supply this independent capability.
func stagedNativeGetNoUserEntry(selected sourceValue, result *accessorCandidates) bool {
	return stagedNativeCalleeEffectsRepresented(selected, result) && !result.sourceCallable && !result.invocationOwned && !result.replacedInvocation && len(result.standardMemberTransfers)+len(result.ownSlots)+len(result.fieldAlternatives)+len(result.ownedLocalCauses) == 0 && len(result.declarations)+len(result.producers)+len(result.owned)+len(result.ownedGets)+len(result.ownedClaims)+len(result.thenReferences)+len(result.fieldOutcomes)+len(result.callOutcomes)+len(result.writeOutcomes) == 0 && !result.thenIncomplete
}

func (q *sourceValueQuery) recordStagedNativeEntry(get *sourceGetInputs, selected sourceValue, result *accessorCandidates) {
	b := q.stagedNativeGet
	if b == nil || b.issuer != q || b.owner != q.owner || q.owner == nil || b.generation != q.owner.generation || b.writerDependent || b.legacyPrepared || b.contextual || get == nil || get.operation != q.reading || selected.native == nil || !standardLibrarySource(ast.GetSourceFileOfNode(selected.node)) || !stagedNativeGetNoUserEntry(selected, result) {
		return
	}
	syntax := get.operation
	if syntax == b.call {
		syntax = b.call.Expression()
	}
	if syntax == nil || !nodeInside(syntax, b.call.Expression()) {
		return
	}
	// These are the actual standard-container DATA slots selected by this owner.
	// Arbitrary prototype/member lookups receive no descriptor law from a value.
	if !standardNativeLookup(get) {
		return
	}
	for _, entry := range b.entries {
		if entry.syntax == syntax {
			return
		}
	}
	b.entries = append(b.entries, sourceStagedNativeEntry{syntax: syntax, cut: q.relativeInputCut(get.operation), generation: b.generation})
}

func (work *callableEffectWork) recordStagedCalleeEntry(facts []callableFacts, source *sourceStagedNativeGetSource, proof sourceStagedNativeCalleeEffects) {
	if !proof.noUserEntry || !validStagedNativeCalleeEffects(proof, source) || proof.generation != work.operationGeneration {
		return
	}
	for key, recipe := range work.operationRecipes {
		if !sameNativeGetSource(recipe.nativeGet, source) {
			continue
		}
		updated := *recipe.nativeGet
		updated.calleeEntry = &proof
		recipe.nativeGet = &updated
		work.operationRecipes[key] = recipe
		// Readers require the current canonical algorithm source, including after
		// this immutable copy; an older indexed pointer carries no current rights.
		work.indexNativeInstallation(recipe)
	}
}

// consumeStagedModuleActivation is lent by the original member owner before
// recovery. It consumes the cached original evaluation event order, never a
// value/frame or an invocation reconstructed from a source position.
func (work *callableEffectWork) consumeStagedModuleActivation(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, cut *sourceMemberWriterReadCut) bool {
	b := q.stagedMember
	if !q.liveStagedMemberSource(b, get, cut) || !runtimeModuleEvaluation(q.effectOwner) || q.executable == nil {
		return false
	}
	suffix, suffixOwned := work.implicitEntryLawRequirements(q, get)
	if !suffixOwned {
		return false
	}
	afterArguments := q.stagedFieldGet != nil
	if current := q.stagedMap; current != nil {
		// Initial OwnKeys starts after actual evaluation and before any entry
		// getter. A later entry/field Get cannot reuse that module prefix.
		initial := q.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) && q.traceModeKnown && q.traceMode == accessorEnumerate|accessorNoGet && !current.reading && current.currentRead == nil
		if !initial && !q.liveStagedMapEntryMemberSource(get) {
			return false
		}
		afterArguments = true
	}
	if b.moduleReceipt != nil && b.moduleReceipt.source.cut == q.relativeInputCut(get.operation) {
		return b.moduleReceipt.supported && b.moduleReceipt.accounted && b.moduleReceipt.source.generation == q.owner.generation && b.moduleReceipt.source.cut == q.relativeInputCut(get.operation)
	}
	read := get.operation
	if !afterArguments && (ast.IsCallExpression(read) || ast.IsNewExpression(read)) && read == q.originalSourceCalleeOperation() {
		read = read.Expression()
	}
	file := ast.GetSourceFileOfNode(read)
	if file == nil || file.IsDeclarationFile || !ast.IsExternalModule(file) || q.owner.program.GetSourceFile(file.FileName()) != file {
		return false
	}
	index := q.owner.index(file)
	occurrence := index.normalOccurrences[read]
	population := q.owner.normalPopulation(file.AsNode())
	if index.incomplete || occurrence == nil || !occurrence.once || occurrence.region != nil || population == nil || population.moduleEntry(read, occurrence.statement) != occurrence || !sourceStagedOccurrenceOwned(read, q.effectOwner) {
		return false
	}
	source := sourceStagedModuleActivationRequest{request: b.request, root: file.AsNode(), read: read, cut: q.relativeInputCut(get.operation), generation: q.owner.generation}
	events := q.owner.summary(file.AsNode()).normal
	imports, modules, ok := work.stagedModuleEntryImports(facts, q, file, make(map[*ast.SourceFile]bool))
	if !ok {
		return false
	}
	completed := make(map[*ast.Node]bool)
	for _, event := range events {
		if event.node == read && event.fold == nil && event.phase == nil && event.operand == nil {
			break
		}
		if event.node != nil && ast.IsCallExpression(event.node) && event.fold == nil && event.phase == nil && event.operand == nil {
			completed[event.node] = true
		}
	}
	receipt, associated := reduceStagedModuleActivation(source, events, imports, func(event sourceNormalDemand) (sourceStagedModuleEntryContribution, bool) {
		return work.stagedModuleEntryEvent(facts, q, index, event, completed)
	})
	if !associated || !q.liveStagedMemberSource(b, get, cut) || q.relativeInputCut(get.operation) != source.cut {
		return false
	}
	for _, required := range suffix {
		receipt.required = appendEntryLawRequirement(receipt.required, required)
	}
	if !receipt.supported || !receipt.accounted {
		b.moduleReceipt = &receipt
		return false
	}
	consumer, known := work.memberNodes[q.effectOwner]
	if !known {
		return false
	}
	b.moduleImports = append([]sourceStagedActivationImport(nil), modules...)
	if native := q.stagedNativeGet; native != nil && native.issuer == q {
		native.activationImports = append([]sourceStagedActivationImport(nil), modules...)
	}
	for _, module := range modules {
		producer, known := work.memberNodes[module.declaration]
		if !known {
			return false
		}
		edge := fmt.Sprintf("%s:module-activation:%s:%d", b.request.edge, ast.GetSourceFileOfNode(module.declaration).FileName(), module.declaration.Pos())
		work.requireSourceModuleAvailability(facts, consumer, producer, edge, b.request.producer.operation, b.request.cut)
	}
	b.moduleReceipt = &receipt
	return true
}

type sourceStagedActivationImport struct{ edge, declaration *ast.Node }

// Selected imports are independent source initialization requirements. Literal
// creation can account for no user entry without claiming initialization output
// or replacing the original availability/effect producer.
func (work *callableEffectWork) stagedModuleEntryImports(facts []callableFacts, q *sourceValueQuery, file *ast.SourceFile, active map[*ast.SourceFile]bool) ([]sourceStagedModuleEntryContribution, []sourceStagedActivationImport, bool) {
	if file == nil || active[file] {
		return nil, nil, false
	}
	active[file] = true
	defer delete(active, file)
	index := q.owner.index(file)
	if index.incomplete || !index.importsPrepared {
		return nil, nil, false
	}
	var contributions []sourceStagedModuleEntryContribution
	var modules []sourceStagedActivationImport
	for _, edge := range index.runtimeImports {
		result := accessorCandidates{}
		dependency, state := q.operationDependencyState(edge, &result)
		if state == sourceDependencyErased {
			continue
		}
		if state != sourceDependencyAvailable || dependency == nil || result.opaque || dependency.IsDeclarationFile {
			return nil, nil, false
		}
		children, childModules, ok := work.stagedModuleEntryImports(facts, q, dependency, active)
		if !ok {
			return nil, nil, false
		}
		events := q.owner.summary(dependency.AsNode()).normal
		completed := make(map[*ast.Node]bool)
		for _, event := range events {
			if event.node != nil && ast.IsCallExpression(event.node) && event.fold == nil && event.phase == nil && event.operand == nil {
				completed[event.node] = true
			}
		}
		accounted := true
		var required []sourceStagedOperationRequest
		for _, event := range events {
			contribution, admitted := work.stagedModuleEntryEvent(facts, q, q.owner.index(dependency), event, completed)
			accounted = accounted && admitted && contribution.accounted
			if admitted {
				for _, request := range contribution.required {
					required = appendEntryLawRequirement(required, request)
				}
			}
		}
		for _, child := range children {
			accounted = accounted && child.accounted
			for _, request := range child.required {
				required = appendEntryLawRequirement(required, request)
			}
		}
		if !accounted {
			return nil, nil, false
		}
		contributions = append(contributions, sourceStagedModuleEntryContribution{required: required, accounted: true})
		modules = append(modules, childModules...)
		// Initialization memberships come from the selected module's existing fact
		// boundaries. Structural event nodes (including EOF) are not producers.
		for i := range facts {
			fact := &facts[i]
			if fact.sourceFile != dependency || !runtimeModuleEvaluation(fact.node) {
				continue
			}
			if _, known := work.memberNodes[fact.node]; !known {
				return nil, nil, false
			}
			modules = append(modules, sourceStagedActivationImport{edge: edge, declaration: fact.node})
		}
	}
	return contributions, modules, true
}

func (work *callableEffectWork) stagedModuleEntryEvent(facts []callableFacts, q *sourceValueQuery, index sourceValueIndex, event sourceNormalDemand, completed map[*ast.Node]bool) (sourceStagedModuleEntryContribution, bool) {
	positive := sourceStagedModuleEntryContribution{accounted: true}
	if accounted, admitted := stagedModuleIntrinsicEntry(event); admitted {
		return sourceStagedModuleEntryContribution{accounted: accounted}, true
	}
	if event.node == nil {
		return sourceStagedModuleEntryContribution{}, false
	}
	if ast.IsPropertyAssignment(event.node) && event.node.Parent != nil && ast.IsObjectLiteralExpression(event.node.Parent) && event.node.Name() != nil && ast.IsComputedPropertyName(event.node.Name()) {
		// Defining an ordinary literal DATA property does not call user code.
		// Its key conversion and initializer are separate original child events.
		return positive, true
	}
	if ast.IsComputedPropertyName(event.node) && event.phase == nil && event.operand == nil {
		// ToPropertyKey on an original primitive source cannot enter user code.
		// The existing source owner retains the full producer, including its
		// input/coercion obligations. A type or an Effects prefix is insufficient.
		key, represented := work.stagedPrimitiveKeySource(facts, event.node.AsComputedPropertyName().Expression, sourceStagedModuleOwner(event.node), q.executable)
		if represented {
			if key.producer.producer.operation != nil {
				positive.required = []sourceStagedOperationRequest{key.producer}
			}
			return positive, true
		}
	}
	if member := q.stagedMember; member != nil && member.constructionCallee && q.liveStagedMemberSource(member, member.get, member.read) {
		operation := q.originalSourceCalleeOperation()
		if operation != nil && ast.IsNewExpression(operation) && ast.IsIdentifier(operation.Expression()) && member.get.operation == operation.Expression() && event.node == operation && event.fold == nil && event.phase == nil && event.operand == nil {
			// The source walker admits New before descending into its callee.
			// This original selector is still acquiring that bare Identifier.
			// The admission event is not a completed constructor invocation.
			return positive, true
		}
	}
	// These source walker phases are control markers. Callee Gets and argument
	// evaluation are separately visited events, never paid by this bookkeeping.
	if event.phase != nil && (ast.IsCallExpression(event.node) || ast.IsNewExpression(event.node)) && event.phase.role != sourceNormalArgumentAbort {
		return positive, true
	}
	if b := q.stagedNativeGet; b != nil && b.issuer == q && b.generation == q.owner.generation {
		for _, entry := range b.entries {
			if entry.generation == q.owner.generation && nodeInside(event.node, entry.syntax) {
				return positive, true
			}
		}
	}
	if ast.IsNewExpression(event.node) && (stagedModuleEntryTerminal(event) || event.phase == nil && event.operand == nil && event.fold != nil && event.fold.node == event.node && event.fold.kind == sourceNormalResidual) {
		// The normal fold has no generic New footprint. This independent
		// source constructor law stays pending until its actual Get/algorithm
		// owners account the operation. It supplies no normal fold verdict.
		key := sourceStagedOperationKey{declaration: sourceStagedModuleOwner(event.node), operation: event.node, kind: relativeDemandEffects}
		if source := work.operationRecipes[key].constructionEffects; source != nil {
			if required, registered := work.nativeConstructionEntryLaw(facts, source.root); registered {
				positive.required = []sourceStagedOperationRequest{required}
				return positive, true
			}
		}
	}
	occurrence := index.normalOccurrences[event.node]
	var call *ast.Node
	if ast.IsCallExpression(event.node) {
		call = event.node
	} else if occurrence != nil && occurrence.callOwner != nil {
		call = occurrence.callOwner.node
	}
	if call != nil {
		declaration := sourceStagedModuleOwner(call)
		source := work.operationRecipes[sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}].nativeGet
		if source != nil {
			if nodeInside(event.node, call.Expression()) {
				if required, supplied := work.nativeGetEntryLaw(facts, source); supplied {
					positive.required = []sourceStagedOperationRequest{required}
					return positive, true
				}
			}
			if completed[call] && event.node == call && stagedModuleEntryTerminal(event) {
				// Keep the existing intrinsic scalar/inert-input owner. Its
				// algorithm cannot enter user code, while the actual callee Get
				// and earlier argument events remain independent requirements.
				if stagedNativeCallNoUserEntry(source, call) {
					if required, supplied := work.nativeGetEntryLaw(facts, source); supplied {
						positive.required = []sourceStagedOperationRequest{required}
						return positive, true
					}
				} else if required, supplied := work.nativeAlgorithmEntryLaw(facts, source); supplied {
					work.refineNativeAlgorithmEntryLaw(facts, required.producer)
					positive.required = []sourceStagedOperationRequest{required}
					// A described composite plan is not an original local
					// no-entry disposition. Keep its prefix pending until the
					// semantic owner supplies that law, without demanding child
					// closure or suppressing the stronger original consumer.
					positive.accounted = work.passiveEntryLawReady(work.operationRecipes[required.producer])
					return positive, true
				}
			}
		}
	}
	// Reading an actual ESM declarative binding cannot call user code. Its
	// initializer/import entry obligations remain independently in this prefix.
	if ast.IsIdentifier(event.node) && event.phase == nil && event.operand == nil {
		symbol := q.owner.checker.GetSymbolAtLocation(event.node)
		if symbol != nil && q.owner.checker.IsUndefinedSymbol(symbol) {
			return positive, true
		}
		if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
			symbol = q.owner.checker.GetAliasedSymbol(symbol)
		}
		if symbol != nil && symbol.ValueDeclaration != nil {
			declaration := symbol.ValueDeclaration
			file := ast.GetSourceFileOfNode(declaration)
			if file != nil && !file.IsDeclarationFile && ast.IsExternalModule(file) && q.owner.program.GetSourceFile(file.FileName()) == file && ast.GetCombinedModifierFlags(declaration)&ast.ModifierFlagsAmbient == 0 && (ast.IsVariableDeclaration(declaration) || ast.IsBindingElement(declaration) || ast.IsFunctionDeclaration(declaration) || ast.IsClassDeclaration(declaration)) {
				return positive, true
			}
		}
	}
	return sourceStagedModuleEntryContribution{}, false
}

// The original walker emits Finish after the operation and its children. That
// terminal composes the same semantic contribution as the plain operation,
// never its arguments, a residual fold or another source node.
func stagedModuleEntryTerminal(event sourceNormalDemand) bool {
	return event.phase == nil && event.operand == nil && (event.fold == nil || event.fold.node == event.node && event.fold.kind == sourceNormalFinish)
}

// Original module contributions retain their own declaration and graph cut
// when a later Get requires them. Selection seals the exact request list. This
// structural check grants no activation or no-user-entry disposition itself.
func validStagedModuleEntryRequirement(request sourceStagedOperationRequest) bool {
	operation := request.producer.operation
	return operation != nil && request.producer.kind == relativeDemandEffects && request.consumer == request.producer.declaration && runtimeModuleEvaluation(request.consumer) && request.inputs == nil && request.use == operation && request.cut == (sourceRelativeCut{operation: operation, use: operation, reading: operation}) && sourceStagedOccurrenceOwned(operation, request.consumer)
}

// This is an explicit intrinsic no-user-entry law, not a return-category,
// Effects, identity or NoWrites proof. The actual callee Get is separately owned.
func stagedNativeCallNoUserEntry(source *sourceStagedNativeGetSource, call *ast.Node) bool {
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 1 || !sourceInertValueCreation(actuals[0]) {
		return false
	}
	switch source.kind {
	case sourceNativeSymbolFor:
		return sourcePrimitiveValue(actuals[0])
	case sourceNativeObjectFreeze:
		return ast.IsObjectLiteralExpression(unwrapSourceCallableReference(actuals[0]))
	case sourceNativeObjectCreate:
		return true
	}
	return false
}

// recordNativeActivationImports updates source relationships only. It neither
// publishes a disposition nor reuses a Get receipt. Each graph's original Get
// rebuilds the availability memberships independently of this description.
func (work *callableEffectWork) recordNativeActivationImports(facts []callableFacts, source *sourceStagedNativeGetSource, imports []sourceStagedActivationImport) {
	for key, recipe := range work.operationRecipes {
		if !sameNativeGetSource(recipe.nativeGet, source) {
			continue
		}
		updated := *recipe.nativeGet
		updated.activationImports = append([]sourceStagedActivationImport(nil), imports...)
		recipe.nativeGet = &updated
		work.operationRecipes[key] = recipe
		// Readers require the current canonical algorithm source, including after
		// this immutable copy; an older indexed pointer carries no current rights.
		work.indexNativeInstallation(recipe)
		producer := work.memberNodes[key.declaration]
		for i := range facts[producer].staged.operationRecipes {
			if facts[producer].staged.operationRecipes[i].key == key {
				facts[producer].staged.operationRecipes[i] = recipe
				break
			}
		}
	}
}

// admitStagedModuleWriterExclusion consumes the current original module receipt
// for one already-registered deferred candidate. It grants neither an inactive
// function in later invocations nor whole member-source completion.
// authorizeStagedModuleCandidateExclusion is the original live module-event
// authorization. Representation (empty candidate or retained protocol Effects)
// is checked separately by each consuming path.
func (work *callableEffectWork) authorizeStagedModuleCandidateExclusion(q *sourceValueQuery, source *sourceStagedMemberSource, operation *ast.Node) (bool, bool) {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || !b.seen[operation] || b.moduleReceipt == nil || !b.moduleReceipt.supported || !b.moduleReceipt.accounted || b.moduleReceipt.source.cut != q.relativeInputCut(b.get.operation) || b.moduleReceipt.source.generation != work.operationGeneration || source == nil || source.candidate.operation != operation || source.candidate.cut != b.moduleReceipt.source.cut || !sameOperationRequest(source.parent, b.request) || source.generation != work.operationGeneration || len(source.values) != 0 {
		return false, false
	}
	future := false
	if source.candidate.region == nil {
		future = q.moduleOperationNotEntered(operation, b.moduleReceipt)
		if !future {
			return false, false
		}
	}
	if source.candidate.protocol {
		// These are prior-activation exclusions, not execution of the indexed
		// protocol in this reader. Each original callee/enum/field phase owns
		// a different prefix. Current Get/body Effects remain independent.
		current, get := q.stagedMap, b.get
		initial := current != nil && q.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) && b.mode == accessorEnumerate|accessorNoGet && !current.reading && current.currentRead == nil
		callee := q.originalSourceCalleeOperation()
		beforeArguments := callee != nil && (get.operation == callee && b.moduleReceipt.source.read == callee.Expression() || nodeInside(get.operation, callee.Expression()) && b.moduleReceipt.source.read == get.operation)
		afterArguments := (initial || q.liveStagedMapEntryMemberSource(get) || q.liveStagedFieldMemberSource(get)) && b.moduleReceipt.source.read == get.operation && ast.IsCallExpression(get.operation)
		reference := get.operation == b.request.producer.operation && b.moduleReceipt.source.read == get.operation && stagedModuleReferenceKeyNoUserEntry(get.operation) && (b.mode == accessorRead || b.mode == accessorAcquire || b.mode == accessorSet || b.mode == accessorSet|accessorNoGet)
		if !beforeArguments && !afterArguments && !reference {
			return false, false
		}
	}
	return future, true
}

func (work *callableEffectWork) admitStagedModuleWriterExclusion(facts []callableFacts, q *sourceValueQuery, operation *ast.Node) bool {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || !b.seen[operation] || b.moduleReceipt == nil || !b.moduleReceipt.supported || !b.moduleReceipt.accounted || b.moduleReceipt.source.cut != q.relativeInputCut(b.get.operation) || b.moduleReceipt.source.generation != work.operationGeneration {
		return false
	}
	found := false
	for _, request := range b.required {
		recipe := work.operationRecipes[request.producer]
		source := recipe.memberSource
		future, authorized := work.authorizeStagedModuleCandidateExclusion(q, source, operation)
		if !authorized {
			continue
		}
		if work.recordEntryLawCandidateExclusion(facts, q, recipe, future) {
			found = true
		}
		if operationDeltaSize(recipe.delta) != 0 {
			continue
		}
		copy := *source
		proof := *b.moduleReceipt
		if future {
			proof.notEntered = operation
		}
		proof.required = cloneOperationDelta(sourceStagedOperationDelta{required: proof.required}).required
		copy.moduleExcluded = &proof
		copy.moduleImports = append([]sourceStagedActivationImport(nil), b.moduleImports...)
		recipe.memberSource = &copy
		if !work.attachOperationSource(facts, recipe) {
			return false
		}
		found = true
	}
	return found
}

// stagedModuleProtocolReadOwned describes the original phase carried by a
// source exclusion. Live issuance and current source-set observation remain
// mandatory. No protocol invocation or value selection follows from this shape.
func stagedModuleProtocolReadOwned(parent sourceStagedOperationRequest, proof *sourceStagedModuleActivation) bool {
	if proof == nil || proof.source.read == nil || parent.use == nil {
		return false
	}
	read := proof.source.read
	if ast.IsCallExpression(parent.use) || ast.IsNewExpression(parent.use) {
		return read == parent.use || read == parent.use.Expression() || proof.source.cut.operation == read && nodeInside(read, parent.use.Expression())
	}
	operation := parent.producer.operation
	if operation != nil && read == operation && stagedModuleReferenceKeyNoUserEntry(operation) {
		return true
	}
	return false
}

// Static names and source primitive keys add no implicit user entry between
// their child evaluation and the original reference operation. Object-valued
// keys need a separate positive coercion contribution and stay unsupported here.
func stagedModuleReferenceKeyNoUserEntry(operation *ast.Node) bool {
	return operation != nil && (ast.IsPropertyAccessExpression(operation) || ast.IsElementAccessExpression(operation) && sourcePrimitiveValue(operation.AsElementAccessExpression().ArgumentExpression))
}

// publishStagedModuleWriterExclusion publishes the current graph's source
// receipt. The cached relationship stays unextracted, as for a native callee
// receipt. Clone and generation changes require a fresh original owner event.
func (work *callableEffectWork) publishStagedModuleWriterExclusion(facts []callableFacts, id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if recipe.memberSource == nil || recipe.memberSource.moduleExcluded == nil || recipe.memberSource.generation != work.operationGeneration || !validStagedMemberRecipe(recipe) {
		return false
	}
	work.registerNativeModuleInputs(facts, id)
	state := &work.operations[id.index]
	if state.delta.extracted {
		return true
	}
	state.delta = cloneOperationDelta(recipe.delta)
	state.delta.extracted = true
	state.revision++
	work.notifyOperationSubscribers(state)
	return true
}

// passiveModuleWriterExclusionReady consumes the same original module-only
// disposition before ordinary adoption. Its sealed recipe remains unextracted.
// Fresh source-set observation and actual imported initialization delivery stay
// mandatory. This grants no function-prior-state or runtime value authority.
func (work *callableEffectWork) passiveModuleWriterExclusionReady(recipe sourceStagedOperationRecipe) bool {
	source := recipe.memberSource
	if source == nil || source.moduleExcluded == nil || source.generation != work.operationGeneration || !validStagedMemberRecipe(recipe) {
		return false
	}
	parent := stagedMemberCoverageRequest(source.parent, source.candidate.origin, source.candidate.cut)
	if work.memberCoverageObserved[parent.producer] != work.operationGeneration {
		return false
	}
	consumer, known := work.memberNodes[source.parent.consumer]
	if !known {
		return false
	}
	for _, input := range source.moduleImports {
		if input.declaration == nil || input.edge == nil || !runtimeModuleEvaluation(input.declaration) {
			return false
		}
		producer, known := work.memberNodes[input.declaration]
		edge := fmt.Sprintf("%s:module-activation:%s:%d", source.parent.edge, ast.GetSourceFileOfNode(input.declaration).FileName(), input.declaration.Pos())
		dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, edge}]
		if !known || dependency == nil || dependency.invalid || dependency.projectionPending || producer >= len(work.stagedRevisions) || producer >= len(work.operationFacts) || !work.operationFacts[producer].staged.ready || work.operationFacts[producer].staged.operationsPending || dependency.consumed != work.stagedRevisions[producer] {
			return false
		}
	}
	return true
}
