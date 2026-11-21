package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// reflectiveMutationFieldContribution maps original population occurrences to
// their actual SOURCE owners. Unrepresented branches remain pending beside
// known child descriptions. Effects or host spelling cannot pay a DATA source.
func (work *callableEffectWork) reflectiveMutationFieldContribution(facts []callableFacts, demand sourceStagedFieldEffectsDemand, q *sourceValueQuery, get *sourceGetInputs, field sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool) {
	if operation == nil || q == nil || !q.liveStagedFieldGet(get) {
		return sourceStagedOperationDelta{}, false
	}
	if region == nil {
		region = sourceStagedModuleOwner(operation)
	}
	actor, known := work.memberNodes[region]
	if !known || actor < 0 || actor >= len(facts) {
		return sourceStagedOperationDelta{}, false
	}
	if runtimeModuleEvaluation(demand.request.consumer) {
		source := work.operationRecipes[demand.request.producer].nativeGet
		if source != nil && source.installation != nil && reflectiveNative(source.kind) && get.operation == source.request.use && get.receiver.node == source.descriptorGet {
			create := get.stagedEffects.freshCreateTarget
			if create != nil && (operation == create.get || operation == create.request.use) {
				if delta, represented := work.directCreateMutationContribution(create, operation); represented {
					return delta, true
				}
			}
			selfWrite := operation == source.request.use && (disjointDefinitionLiteralTarget(operation, get.receiver.node) || create != nil)
			if operation == source.get || selfWrite {
				// This exact callee may still be pending delivery. Retain the
				// original all-MAY no-user proof as a required dependency.
				callee, described := stagedEntryLawRequest(nativeRootDebtRequest(source, "callee-get"), stagedEntryLawNativeGet)
				if described && validStagedEntryLawRecipe(work.operationRecipes[callee.producer]) {
					required := []sourceStagedOperationRequest{callee}
					if selfWrite {
						required = append(required, nativeRootDebtRequest(source, "eager-inputs"))
					}
					return sourceStagedOperationDelta{extracted: true, required: required}, true
				}
			}
		}
	}
	if ast.IsCallExpression(operation) {
		original, issued := stagedNativeInputOccurrenceRequest(&facts[actor], operation)
		if !issued {
			return sourceStagedOperationDelta{}, false
		}
		source := work.operationRecipes[original.producer].nativeGet
		if source != nil && validDescriptorRetrieval(source) && sameOperationRequest(source.request, original) {
			return work.declareFieldMutationData(facts, demand, q, get, field, original, source, nil)
		}
		if header, issued := work.nativeInstallationMutationSourceFor(source); issued && sameOperationRequest(header.request, original) {
			return work.declareFieldInstallationMutation(facts, demand, q, get, field, header)
		}
		return sourceStagedOperationDelta{}, false
	}
	if ast.IsPropertyAccessExpression(operation) && ast.IsIdentifier(operation.Expression()) {
		original, issued := stagedMemberGetSourceRequest(&facts[actor], operation)
		if !issued {
			return sourceStagedOperationDelta{}, false
		}
		// Existing Identifier/Get owner issues its own SOURCE event. This is not
		// host evaluation, a callee-name exclusion or an EnvironmentEffect shortcut.
		work.issueStagedLibraryGetSource(facts, sourceStagedMemberCandidate{operation: operation, region: region, protocol: true}, q.executable)
		source := work.operationRecipes[original.producer]
		if validStagedMemberExternalGetRecipe(source) && source.memberSource.protocolSource.get != nil && !source.memberSource.protocolSource.get.standardSymbolData {
			return work.declareFieldMutationData(facts, demand, q, get, field, original, nil, source.memberSource.protocolSource.get)
		}
	}
	// A real issuer may have reserved mutation output before the Get has its
	// receiver. Retain that exact child now; the field prefix cannot grow later.
	if interest, issued := work.originalGetMutationInterestFor(facts, operation, region); issued {
		return work.declareFieldMutationInterest(facts, demand, q, get, field, interest)
	}
	if source, issued := work.originalGetMutationSourceFor(facts, operation, region); issued {
		return work.declareFieldMutationData(facts, demand, q, get, field, originalGetMutationRequest(source), nil, nil, source)
	}
	return sourceStagedOperationDelta{}, false
}

// currentDirectCreateDefinitionTarget reuses the selected original Create
// result relationship. The enclosing definition retains its target dependency
// and the original Create Get and Call retain their own Effects requirements.
func (work *callableEffectWork) currentDirectCreateDefinitionTarget(source *sourceStagedNativeGetSource) *sourceStagedNativeGetSource {
	if !validNativeTargetSource(source) || source.targetBinding != nil {
		return nil
	}
	root := work.currentNativeResultRoot(source.targetSource.producer)
	if root == nil || root.kind != sourceNativeObjectCreate || !sameOperationRequest(root.request, source.targetSource) {
		return nil
	}
	return root
}

// directCreateMutationContribution retains the original Get and creation
// requirements for the fresh target. The callee entry law can still be awaiting
// delivery when the descriptor's Value mapper first sees it.
func (work *callableEffectWork) directCreateMutationContribution(create *sourceStagedNativeGetSource, operation *ast.Node) (sourceStagedOperationDelta, bool) {
	callee := nativeRootDebtRequest(create, "callee-get")
	law, described := stagedEntryLawRequest(callee, stagedEntryLawNativeGet)
	if described && validStagedEntryLawRecipe(work.operationRecipes[law.producer]) {
		required := []sourceStagedOperationRequest{law}
		if operation == create.request.use {
			required = append(required, nativeRootDebtRequest(create, "eager-inputs"), nativeRootDebtRequest(create, "algorithm"))
		}
		return sourceStagedOperationDelta{extracted: true, required: required}, true
	}
	proof := work.currentNativeCalleeEffects(create)
	if proof == nil || !proof.noUserEntry || !work.nativeEffectsGetCurrent(create) {
		return sourceStagedOperationDelta{}, false
	}
	if operation == create.request.use {
		return sourceStagedOperationDelta{extracted: true, required: []sourceStagedOperationRequest{create.request}}, true
	}
	return sourceStagedOperationDelta{extracted: true, required: []sourceStagedOperationRequest{callee}}, true
}

// disjointDefinitionLiteralTarget applies to the original three-argument
// definition during its own descriptor read. Callers authenticate the selected
// operation separately. Each literal evaluation creates its own receiver.
func disjointDefinitionLiteralTarget(operation, descriptor *ast.Node) bool {
	if !ast.IsObjectLiteralExpression(descriptor) {
		return false
	}
	arguments := restrictedInvocationArguments(operation.AsCallExpression())
	return len(arguments) == 3 && arguments[2] == descriptor && ast.IsObjectLiteralExpression(arguments[0]) && arguments[0] != descriptor
}
