package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// recordStagedFieldCallable observes a selected own data slot at its original
// semantic Get. It does not read descriptor syntax in an adapter or execute the
// stored value. Only capture-free callable literals are detached in this slice.
// Other values retain their original value owner and cannot close exposure.
func (query *sourceValueQuery) recordStagedFieldCallable(get *sourceGetInputs, value *ast.Node) {
	if !query.liveStagedFieldGet(get) || get.stagedEffects.expose == nil || get.stagedEffects.observation == nil || get.stagedEffects.observation.phase != stagedFieldObservationGet || value == nil {
		return
	}
	get.stagedEffects.expose(value, query.relativeInputCut(get.operation))
}

func nativeFieldExposureRequest(source *sourceStagedNativeGetSource, field string, reading sourceStagedOperationRequest) sourceStagedOperationRequest {
	request := source.request
	request.producer.selector = sourceStagedOperationSelector{occurrence: source.descriptorGet, field: field}
	request.producer.kind = relativeDemandDirectExposure
	request.reading = reading.producer
	request.use = reading.producer.operation
	request.edge = fmt.Sprintf("%s:installation:%d:%s", reading.edge, source.request.producer.operation.Pos(), field)
	return request
}

// validNativeFieldExposureRecipe bounds the source value capability independently
// from Effects. Local own-data extraction keeps typed writer/prototype value
// projections pending, separately from eager Effects. No value selection, normal
// output or completed alternative set follows from one known stored callable.
func validNativeFieldExposureRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.nativeGet
	if source == nil || source.installation == nil || source.descriptorGet == nil || recipe.key.selector.occurrence != source.descriptorGet {
		return false
	}
	request := source.request
	request.producer = recipe.key
	if parent, role := fieldSourceParent(request); role {
		return validNativeFieldValueSourceRecipe(recipe, parent)
	}
	if recipe.key.selector.field != "get" && recipe.key.selector.field != "value" || len(recipe.delta.required) != 3+2*len(recipe.fieldForwards) || len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative) != 0 || recipe.delta.extracted && len(recipe.delta.exposures)+len(recipe.delta.residuals) == 0 {
		return false
	}
	parent := request
	parent.producer.kind = relativeDemandEffects
	roles, valid := fieldSourceRequests(request)
	if !valid || !sameOperationRequest(recipe.delta.required[0], parent) || !sameOperationRequest(recipe.delta.required[1], roles.ownWriters) || !sameOperationRequest(recipe.delta.required[2], roles.prototype) {
		return false
	}
	for index, forward := range recipe.fieldForwards {
		if !validStagedFieldForward(recipe, forward) || !sameOperationRequest(recipe.delta.required[3+2*index], forward.source.request) || !sameOperationRequest(recipe.delta.required[4+2*index], forward.request) {
			return false
		}
	}
	for _, residual := range recipe.delta.residuals {
		if m := residual.mutation; m != nil {
			if !validRelativeFieldMutationShape(m) || !operationContainsRequest(recipe.delta.required, m.field) {
				return false
			}
		}
	}
	for _, alternative := range recipe.delta.exposures {
		covered := validNativeOwnFieldAlternative(recipe, alternative)
		for _, forward := range recipe.fieldForwards {
			covered = covered || sameOperationAlternative(alternative, forward.alternative)
		}
		if !covered {
			return false
		}
	}
	return true
}

// A known own-data source keeps its original occurrence, not the later reader.
func validNativeOwnFieldAlternative(recipe sourceStagedOperationRecipe, alternative sourceStagedOperationAlternative) bool {
	if alternative.creating != nil {
		return validNativeReturnedFieldAlternative(recipe, alternative)
	}
	value := alternative.endpoint
	source := recipe.nativeGet
	return source != nil && alternative.creating == nil && value.kind == relativeEndpointExpression && value.expression != nil && value.expression.Parent != nil && ast.IsPropertyAssignment(value.expression.Parent) && value.expression.Parent.Parent == source.descriptorGet && callableNameText(value.expression.Parent.Name()) == recipe.key.selector.field && (ast.IsArrowFunction(value.expression) || ast.IsFunctionExpression(value.expression)) && value.producer == recipe.key.operation && value.get == source.descriptorGet && value.cut.operation == recipe.key.operation && value.cut.reading == recipe.key.operation && len(value.projection) == 0 && value.creation == nil && value.returning == nil
}

// validFieldExposureReading authenticates the detached issuing relationship in
// this graph. The source query separately lends its live original Get to create
// it. Reading/cuts survive cloning as descriptions, never as query authority.
func (work *callableEffectWork) validFieldExposureReading(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	if recipe.nativeGet == nil || recipe.nativeGet.installation == nil || recipe.nativeGet.installation.key.expression == nil || !ast.IsStringLiteralLike(recipe.nativeGet.installation.key.expression) {
		return false
	}
	reader, registered := work.operationRecipes[request.reading]
	if registered && reader.memberSource != nil && reader.memberSource.getEffects != nil && reader.memberSource.getEffects.descriptor != nil {
		return work.validDescriptorRecordInstallationReading(recipe, request, reader)
	}
	if recipe.nativeGet.installation.key.expression.Text() != request.reading.selector.field || !registered || reader.nativeGet == nil || request.reading.kind != relativeDemandEffects || request.reading.declaration != recipe.key.declaration || reader.nativeGet.descriptorGet != request.reading.selector.occurrence || stagedDescriptorFieldIndex(request.reading.selector.field) < 0 || !validNativeGetRecipe(reader) {
		return false
	}
	reading := reader.nativeGet.request
	reading.producer = reader.key
	return sameOperationRequest(request, nativeFieldExposureRequest(recipe.nativeGet, recipe.key.selector.field, reading))
}

// ensureFieldExposure registers only the demanded field projection. A pending
// recipe is not an empty callable alternative, and registration invokes nothing.
func (work *callableEffectWork) ensureFieldExposure(facts []callableFacts, source *sourceStagedNativeGetSource, field string) (sourceStagedOperationRecipe, bool) {
	key := source.request.producer
	key.kind = relativeDemandDirectExposure
	key.selector = sourceStagedOperationSelector{occurrence: source.descriptorGet, field: field}
	if recipe, registered := work.operationRecipes[key]; registered {
		return recipe, validNativeFieldExposureRecipe(recipe)
	}
	parent := source.request
	parent.producer.selector = key.selector
	projection := parent
	projection.producer.kind = relativeDemandDirectExposure
	roles, valid := fieldSourceRequests(projection)
	if !valid {
		return sourceStagedOperationRecipe{}, false
	}
	for _, required := range []sourceStagedOperationRequest{roles.ownWriters, roles.prototype} {
		if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: required.producer, nativeGet: source}) {
			return sourceStagedOperationRecipe{}, false
		}
	}
	recipe := sourceStagedOperationRecipe{key: key, nativeGet: source, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{parent, roles.ownWriters, roles.prototype}}}
	return recipe, work.registerOperationRecipe(facts, recipe)
}

// recordFieldCallableExposure publishes a known source prefix while the original
// field Get is live. It neither demands invocation nor claims all alternatives
// selected. Required projection consumers request this recipe separately.
func (work *callableEffectWork) recordFieldCallableExposure(facts []callableFacts, id sourceStagedOperationID, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs, value *ast.Node, cut sourceRelativeCut, owner *executableBodyOwner) bool {
	if !query.stagedFieldWorkOwner(owner) || !query.liveStagedFieldGet(get) || query.effectOwner != demand.request.producer.declaration || get.operation != demand.request.producer.operation || get.propertyKey != demand.request.producer.selector.field || get.receiver.node != demand.receiver.expression || get.stagedEffects.observation == nil || get.stagedEffects.observation.phase != stagedFieldObservationGet || cut != query.relativeInputCut(get.operation) {
		return false
	}
	current, issued := work.issueFieldEffectsDemand(facts, id, owner)
	if !issued || !sameOperationRequest(current.request, demand.request) || value == nil || value.Parent == nil || !ast.IsPropertyAssignment(value.Parent) || value.Parent.AsPropertyAssignment().Initializer != value || value.Parent.Parent != demand.receiver.expression || cut.operation != demand.request.producer.operation || cut.reading != demand.request.producer.operation {
		return false
	}
	field := demand.request.producer.selector.field
	if field != "get" && field != "value" || value.Parent.Name() == nil || ast.IsComputedPropertyName(value.Parent.Name()) || callableNameText(value.Parent.Name()) != field {
		return false
	}
	index := owner.values.index(ast.GetSourceFileOfNode(value))
	if index.incomplete || index.normalDynamicScope {
		return false // eval may observe receiver/captures without an identifier edge.
	}
	if ast.IsCallExpression(value) {
		work.operations[id.index].fieldOwnData = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: value, producer: get.operation, get: demand.receiver.expression, cut: cut}
		return work.publishEagerReturnValue(facts, demand.request.producer, owner)
	}
	values, supported := stagedMemberSourceValues(value, nil, owner)
	if !supported || len(values) != 1 || values[0].kind != relativeEndpointExpression {
		return false // Unmapped captures/value producers retain their original path.
	}
	source := work.operationRecipes[demand.request.producer].nativeGet
	recipe, valid := work.ensureFieldExposure(facts, source, field)
	if !valid {
		return false
	}
	alternative := sourceStagedOperationAlternative{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: value, producer: demand.request.producer.operation, get: demand.receiver.expression, cut: cut}}
	return work.recordOwnFieldValueBaseline(facts, demand, query, get, recipe, alternative)
}
