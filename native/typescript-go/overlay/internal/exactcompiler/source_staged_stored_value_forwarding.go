package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedFieldForward retains the original selected installation and exact
// demanded Value exposure. The endpoint and creating association stay at their
// producing cut. The later Get borrows no acquired scope and invokes no body.
// Required source/Value dependencies remain independent of this known prefix.
type sourceStagedFieldForward struct {
	mutationRHS *sourceInstalledMutationRHS // Explicit original RHS DATA source; nil keeps installation forwarding unchanged.
	source      *sourceStagedNativeGetSource
	request     sourceStagedOperationRequest
	alternative sourceStagedOperationAlternative
}

func sameStagedFieldForward(a, b sourceStagedFieldForward) bool {
	return sameInstalledMutationRHS(a.mutationRHS, b.mutationRHS) && sameNativeGetSource(a.source, b.source) && sameOperationRequest(a.request, b.request) && sameOperationAlternative(a.alternative, b.alternative)
}

// validStagedFieldForward checks descriptive transport only. Admission is owned
// by the actual registered original Get consumer, not by equal metadata.
func validStagedFieldForward(recipe sourceStagedOperationRecipe, forward sourceStagedFieldForward) bool {
	if forward.mutationRHS != nil {
		return validMutationRHSForward(recipe, forward)
	}
	if parent, role := fieldSourceParent(sourceStagedOperationRequest{producer: recipe.key}); role {
		recipe.key = parent.producer
	}
	if forward.source == nil || forward.source.installation == nil || recipe.nativeGet == nil || recipe.key.selector.field != "get" && recipe.key.selector.field != "value" {
		return false
	}
	installedKey := forward.source.installation.key.expression
	if installedKey == nil || !ast.IsStringLiteralLike(installedKey) || installedKey.Text() != recipe.key.selector.field {
		return false
	}
	reading := recipe.nativeGet.request
	reading.producer = recipe.key
	reading.producer.kind = relativeDemandEffects
	if !sameOperationRequest(forward.request, nativeFieldExposureRequest(forward.source, "value", reading)) {
		return false
	}
	key := forward.request.producer
	parent := forward.source.request
	parent.producer.selector = key.selector
	projection := parent
	projection.producer.kind = relativeDemandDirectExposure
	roles, valid := fieldSourceRequests(projection)
	return valid && validNativeFieldExposureRecipe(sourceStagedOperationRecipe{key: key, nativeGet: forward.source, delta: sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{forward.alternative}, required: []sourceStagedOperationRequest{parent, roles.ownWriters, roles.prototype}, extracted: true}})
}

// forwardInstalledFieldValue transports a known stored callable into the later
// descriptor field's Value producer. Reading data does not invoke that callable.
// Both the original installation and demanded Value source stay required, with
// their creating association/cuts untouched. Unsupported branches retain debt.
func (work *callableEffectWork) forwardInstalledFieldValue(facts []callableFacts, use sourceStagedOperationUse, delta sourceStagedOperationDelta, demand sourceStagedFieldEffectsDemand) bool {
	field := demand.request.producer.selector.field
	if field != "get" && field != "value" {
		return len(delta.exposures) == 0 // Other descriptor roles need their own Value consumer.
	}
	readerSource := work.operationRecipes[demand.request.producer].nativeGet
	recipe, admitted := work.ensureFieldExposure(facts, readerSource, field)
	if !admitted {
		return false
	}
	writer := work.operationRecipes[use.request.producer].nativeGet
	handled, changed := true, false
	for _, alternative := range delta.exposures {
		forward := sourceStagedFieldForward{source: writer, request: use.request, alternative: alternative}
		if !validStagedFieldForward(recipe, forward) {
			handled = false
			continue
		}
		known := false
		for _, prior := range recipe.fieldForwards {
			known = known || sameStagedFieldForward(prior, forward)
		}
		if known {
			continue
		}
		recipe.fieldForwards = append(append([]sourceStagedFieldForward(nil), recipe.fieldForwards...), forward)
		recipe.delta = cloneOperationDelta(recipe.delta)
		recipe.delta.required = append(recipe.delta.required, writer.request, use.request)
		present := false
		for _, prior := range recipe.delta.exposures {
			present = present || sameOperationAlternative(prior, alternative)
		}
		if !present {
			recipe.delta.exposures = append(recipe.delta.exposures, alternative)
		}
		recipe.delta.extracted = true // Known prefix only. Required Value coverage remains pending.
		changed = true
	}
	legacyResidual := false
	for _, incoming := range delta.residuals {
		if incoming.mutation != nil {
			// A mutation obligation is not an unknown stored Value. Its own original
			// field mapper must authenticate target/key and retain the typed source.
			// Until that relation is present this branch remains compiler-pending.
			handled = false
			continue
		}
		legacyResidual = true
	}
	if legacyResidual {
		residual := sourceStagedOperationResidual{operation: demand.request.producer.operation}
		known := false
		for _, prior := range recipe.delta.residuals {
			known = known || sameOperationResidual(prior, residual)
		}
		if !known {
			recipe.delta = cloneOperationDelta(recipe.delta)
			recipe.delta.residuals = append(recipe.delta.residuals, residual)
			recipe.delta.extracted = true
			changed = true
		}
	}
	if !changed {
		return handled
	}
	if !validOperationEnvelope(recipe) {
		return false
	}
	work.operationRecipes[recipe.key] = recipe
	producer := work.memberNodes[recipe.key.declaration]
	for index := range facts[producer].staged.operationRecipes {
		if facts[producer].staged.operationRecipes[index].key == recipe.key {
			facts[producer].staged.operationRecipes[index] = recipe
			break
		}
	}
	if id, requested := work.operationIDs[recipe.key]; requested {
		if work.operations[id.index].dependenciesRegistered {
			work.attachInstalledFieldDependencies(id, writer, use.request)
		} else {
			work.registerOperationDependencies(facts, id)
		}
		work.publishOperation(id, recipe.delta)
	}
	return handled
}

// mutationWriterMaySupplyField does not establish exact target identity. The
// native SOURCE operator already owns the actual conditional body/writer. A
// represented literal key keeps this possible source in its field population;
// dynamic/unrepresented key or capture work stays pending beside that prefix.
func mutationWriterMaySupplyField(rhs *sourceInstalledMutationRHS, field sourceStagedOperationRequest) (possible, represented bool) {
	parent, valid := fieldSourceParent(field)
	if !valid || rhs == nil || rhs.template.left == nil {
		return false, false
	}
	left := rhs.template.left
	if ast.IsPropertyAccessExpression(left) {
		return callableNameText(left.Name()) == parent.producer.selector.field, true
	}
	if ast.IsElementAccessExpression(left) {
		key := sourceMemberKey(left.AsElementAccessExpression().ArgumentExpression)
		if key.resolved {
			return key.name == parent.producer.selector.field, true
		}
		return true, false
	}
	return false, false
}

func validMutationRHSForward(recipe sourceStagedOperationRecipe, forward sourceStagedFieldForward) bool {
	s := recipe.mutationData
	rhs := forward.mutationRHS
	if s != nil && s.installation != nil {
		return rhs != nil && forward.source == nil && sameOperationRequest(forward.request, rhs.request) && operationContainsRequest(recipe.delta.required, forward.request) && operationContainsRequest(recipe.delta.required, rhs.parent) && validNativeInstallationMutationForward(s.installation, s.field, forward)
	}
	if s != nil && (s.getSource != nil || s.getInterest != nil) {
		return validOriginalGetMutationForward(recipe, forward)
	}
	if s == nil || s.native == nil || rhs == nil || rhs.native == nil || forward.source != nil || !sameOperationRequest(forward.request, rhs.request) || !operationContainsRequest(recipe.delta.required, forward.request) || rhs.generation != s.generation || !sameDescriptorRetrieval(rhs.native, s.native.descriptorRead) {
		return false
	}
	possible, _ := mutationWriterMaySupplyField(rhs, s.field)
	if !possible {
		return false
	}
	for _, alternative := range rhs.projection.delta.exposures {
		if sameOperationAlternative(alternative, forward.alternative) {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) mutationForwardsCurrent(recipe sourceStagedOperationRecipe) bool {
	for _, forward := range recipe.fieldForwards {
		if !validMutationRHSForward(recipe, forward) {
			return false
		}
		if recipe.mutationData.installation != nil && !work.nativeInstallationMutationForwardCurrent(recipe.mutationData.installation, recipe.mutationData.field, forward) {
			return false
		}
		rhs := work.operationRecipes[forward.request.producer]
		if !sameInstalledMutationRHS(rhs.installedMutationRHS, forward.mutationRHS) {
			return false
		}
		data, applied := work.installedMutationRHSData(forward.request)
		found := false
		for _, alternative := range data.exposures {
			found = found || sameOperationAlternative(alternative, forward.alternative)
		}
		if !applied || !found {
			return false
		}
	}
	return true
}
