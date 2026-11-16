package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// registerStagedDeclarationCallEffects describes an original lexical Call's
// Effects without reaching that Call, binding inputs or invoking its definition.
// The collector-owned association and body revision independently gate closure.
func (work *callableEffectWork) registerStagedDeclarationCallEffects(facts []callableFacts, consumer int, call *ast.Node, owner *executableBodyOwner) (sourceStagedOperationRequest, bool) {
	if owner == nil || owner.values == nil || consumer < 0 || consumer >= len(facts) {
		return sourceStagedOperationRequest{}, false
	}
	work.indexOperationSources(facts)
	if work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return sourceStagedOperationRequest{}, false
	}
	work.operationGeneration = owner.values.generation
	request := stagedDeclarationCallEffectsRequest(call, facts[consumer].node)
	description, supported := describeStagedInputSubstitution(call, facts[consumer].node, owner)
	var declaration *sourceStagedDeclarationCall
	if supported {
		declaration = &sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: description.invocation, sourceInputs: description}
	} else if bound, admitted := work.stagedBoundLexicalDefaultCall(facts, consumer, call, owner); admitted {
		declaration = &bound
	} else {
		return sourceStagedOperationRequest{}, false
	}
	prior, exists := work.operationRecipes[request.producer]
	if exists {
		if prior.declarationCall == nil || prior.declarationCallGeneration != work.operationGeneration || !sameSourceRelativeInvocation(prior.declarationCall.invocation, declaration.invocation) {
			return sourceStagedOperationRequest{}, false
		}
		declaration = prior.declarationCall
	}
	delta := sourceStagedOperationDelta{extracted: true}
	var ambientReads []sourceAmbientArgumentRead
	// The direct immutable lexical callee read has no property protocol. Actual
	// argument evaluation retains its own original occurrence and source owner.
	for _, actual := range declaration.invocation.actuals {
		expression := unwrapSourceCallableReference(actual.expression)
		if ast.IsIdentifier(expression) && expression == actual.expression {
			effects, _, read := sourceCallArgumentReferenceEffects(&facts[consumer], expression, facts[consumer].sourceFile, owner.checker, owner, &declaration.invocation, actual.ordinal)
			if read.reference != nil {
				ambientReads = append(ambientReads, read)
				for _, effect := range effects {
					found := false
					for _, prior := range delta.effects {
						found = found || sameOperationEffect(prior, effect)
					}
					if !found {
						delta.effects = append(delta.effects, effect)
					}
				}
				continue
			}
		}
		// Empty array construction has no element/key/iterator evaluation.
		// This source Call's original argument owner may describe that local
		// Effects fact. The native/inertness predicate remains unchanged, and
		// currentness still requires the actual Call edge and body deliveries.
		if stagedLiteralInputEffects(expression, owner) || stagedEmptyArrayDataConstruction(expression) || declaration.inputs != nil && actual.endpoint.kind == relativeEndpointUndefined && ast.IsIdentifier(expression) && owner.checker.IsUndefinedSymbol(owner.checker.GetSymbolAtLocation(expression)) {
			continue
		}
		var child sourceStagedOperationRequest
		registered := false
		switch {
		case ast.IsCallExpression(expression):
			child, registered = work.registerStagedDeclarationCallEffects(facts, consumer, expression, owner)
		case ast.IsNewExpression(expression):
			child, registered = work.registerStagedConstructionEffects(facts, consumer, expression, owner)
		case ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression):
			if _, registered = work.registerStagedGetResult(facts, consumer, expression, owner); registered {
				child = stagedGetResultRequest(expression, facts[consumer].node, "effects", nil)
			}
		}
		if !registered {
			child, registered = work.memberProtocolSources[expression]
		}
		if registered && child.producer.kind == relativeDemandEffects && child.producer.operation == expression {
			delta.required = appendEntryLawRequirement(delta.required, child)
		} else {
			delta.extracted = false
		}
	}
	if len(ambientReads) != 0 || len(declaration.ambientReads) != 0 {
		copy := *declaration
		copy.ambientReads = ambientReads // Fresh actual-use descriptions, never cached graph authority.
		declaration = &copy
	}
	recipe := sourceStagedOperationRecipe{key: request.producer, declarationCall: declaration, declarationCallGeneration: work.operationGeneration, delta: delta}
	if !validStagedDeclarationCallEffectsRecipe(recipe) {
		return sourceStagedOperationRequest{}, false
	}
	if exists {
		if !work.attachOperationSource(facts, recipe) {
			return sourceStagedOperationRequest{}, false
		}
	} else if !work.registerOperationRecipe(facts, recipe) {
		return sourceStagedOperationRequest{}, false
	}
	if work.declarationCallObserved == nil {
		work.declarationCallObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.declarationCallObserved[request.producer] = work.operationGeneration
	work.indexStagedMemberProtocolSource(recipe)
	return request, true
}

// renewStagedDeclarationCallSource revalidates an adopted producer's original
// lexical source in this graph. A cloned description is not a source event.
// Renewal creates no canonical invocation or binder; those remain independent
// publication requirements. Only the producer extraction entry calls this owner.
func (work *callableEffectWork) renewStagedDeclarationCallSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || owner.values.program == nil || owner.values.checker != owner.checker || owner.values.generation == nil || owner.values.generation != work.operationGeneration || owner.project == nil || owner.project.activeGeneration != work.operationGeneration || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !state.dependenciesRegistered || work.operationIDs[state.key] != id || recipe.key != state.key || !validStagedDeclarationCallEffectsRecipe(recipe) || recipe.declarationCallGeneration != work.operationGeneration {
		return false
	}
	call, region := recipe.key.operation, recipe.key.declaration
	originalRegion := sourceStagedEvaluationOwner(call)
	if originalRegion == nil {
		originalRegion = sourceStagedModuleOwner(call)
	}
	caller, known := work.memberNodes[region]
	if originalRegion != region || !known || caller < 0 || caller >= len(facts) || facts[caller].node != region || facts[caller].normalInputs != nil {
		return false
	}
	file := ast.GetSourceFileOfNode(call)
	publisher := owner.pendingMemberPublishers[region]
	if file == nil || file.IsDeclarationFile || facts[caller].sourceFile != file || owner.values.program.GetSourceFile(file.FileName()) != file || publisher == nil || !publisher.live || publisher.fact != &facts[caller] {
		return false
	}
	index := owner.values.index(file)
	occurrence := index.normalOccurrences[call]
	if index.incomplete || index.normalDynamicScope || occurrence == nil || occurrence.node != call || occurrence.region != sourceStagedEvaluationOwner(call) {
		return false
	}
	if work.declarationCallObserved[recipe.key] == work.operationGeneration {
		return true
	}
	// The existing registrar authenticates the immutable callee and full ordered
	// actual vector, retains eager requirements, then issues this graph's tag.
	request, registered := work.registerStagedDeclarationCallEffects(facts, caller, call, owner)
	return registered && sameOperationRequest(request, stagedDeclarationCallEffectsRequest(call, region))
}
