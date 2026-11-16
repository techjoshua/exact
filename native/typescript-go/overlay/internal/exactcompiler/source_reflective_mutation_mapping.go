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
