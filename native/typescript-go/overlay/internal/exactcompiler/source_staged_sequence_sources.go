package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sequenceSourceContribution maps original source relationships to already
// registered semantic owners. A passive returned body is not executed here.
// Runtime-opaque calls supply explicit residuals only in the Value channel.
func (work *callableEffectWork) sequenceSourceContribution(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, calls []*ast.Node, operation, region *ast.Node, value bool) (sourceStagedOperationDelta, bool) {
	if len(calls) != 2 {
		return sourceStagedOperationDelta{}, false
	}
	for _, call := range calls {
		root := sourceStagedOperationKey{declaration: demand.request.consumer, operation: call, kind: relativeDemandEffects}
		algorithm := root
		algorithm.selector = sourceStagedOperationSelector{occurrence: call.Expression(), field: "algorithm"}
		source := work.operationRecipes[algorithm].nativeGet
		if source == nil || source.installation == nil || !sameNativeGetSource(source, work.operationRecipes[root].nativeGet) {
			return sourceStagedOperationDelta{}, false
		}
		if delta, mapped := work.sequenceInstalledSourceContribution(facts, demand, query, source, call, operation, region, value); mapped {
			return delta, true
		}
	}
	return sourceStagedOperationDelta{}, false
}

// completeSequenceValueSources publishes direct-callable source coverage, not
// selected field values. Nominal literal construction and intrinsic baseline
// contribute no other callable source. Every indexed writer/prototype candidate
// must independently map, including runtime-unknown mutations. The actual Get
// loan and creating B own known alternatives. No property absence is published.
func (work *callableEffectWork) completeSequenceValueSources(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs) {
	if !query.liveStagedFieldGet(get) || get.stagedEffects.observation == nil || get.stagedEffects.observation.phase != stagedFieldObservationFinished {
		return
	}
	current, issued := work.issueFieldEffectsDemand(facts, demand.producer, query.executable)
	if !issued || !sameOperationRequest(current.request, demand.request) || !sameOperationEndpoint(current.receiver, demand.receiver) || get.operation != demand.request.producer.operation || get.receiver.node != demand.receiver.expression || get.propertyKey != demand.request.producer.selector.field {
		return
	}
	calls, eligible := stagedNativeSequence(&facts[work.memberNodes[demand.request.consumer]], query.executable)
	if !eligible {
		return
	}
	if demand.request.producer.selector.field != "get" && demand.request.producer.selector.field != "value" {
		return
	}
	if !work.completeOriginalFieldValueSources(facts, demand, query, get, func(request sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool) {
		return work.sequenceSourceContribution(facts, demand, query, calls, operation, region, true)
	}) {
		return
	}
	for _, getter := range work.operations[demand.producer.index].getters {
		work.deliverSequenceGetterValue(facts, demand.producer, getter.declaration, query.executable)
	}
}

// completeOriginalFieldValueSources shares only the original finished-Get
// baseline and publication owner. The caller still authenticates its mapping
// domain; the mapper's missing source arms stay pending independently of the
// retained known own callable prefix. This helper issues no runtime residual.
func (work *callableEffectWork) completeOriginalFieldValueSources(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs, mapper sourceStagedFieldSourceMapper) bool {
	if mapper == nil {
		return false
	}
	source := work.operationRecipes[demand.request.producer].nativeGet
	parent, valid := work.ensureFieldExposure(facts, source, demand.request.producer.selector.field)
	if !valid {
		return false
	}
	work.recordEagerReturnValue(facts, demand.request.producer, query.executable, true)
	parent = work.operationRecipes[parent.key]
	projection := source.request
	projection.producer = parent.key
	roles, valid := fieldSourceRequests(projection)
	if !valid {
		return false
	}
	// This source-produced nominal construction is exact static data syntax.
	// Nonliteral, getter-valued and unrepresented creating outputs stay pending.
	baselineReady := true
	for _, property := range get.receiver.node.AsObjectLiteralExpression().Properties.Nodes {
		if property.Name() == nil || ast.IsComputedPropertyName(property.Name()) || !ast.IsPropertyAssignment(property) {
			baselineReady = false
			break
		}
		if callableNameText(property.Name()) != get.propertyKey {
			continue
		}
		initializer := property.AsPropertyAssignment().Initializer
		if ast.IsCallExpression(initializer) {
			requirement, _ := work.eagerReturnRequirement(source, initializer)
			if requirement == nil {
				baselineReady = false
				break
			}
			alternatives, ok := describeStagedEagerReturnCarriers(requirement.call, requirement.inputs, query.executable.values)
			templates := describeStagedReturnTemplates(requirement.call.invocation.declaration, query.executable.values)
			baselineReady = ok && len(alternatives) == len(templates) && len(templates) > 0
			for _, template := range templates {
				baselineReady = baselineReady && !template.unknown && len(template.captures) == 0
			}
			if !baselineReady {
				break
			}
		} else if !sourceInertValueCreation(initializer) {
			baselineReady = false
			break
		}
	}
	sources, complete := query.stagedFieldDiscoverySources(get)
	emitStagedFieldValueProjection(query, get, roles, sources, complete,
		func(request sourceStagedOperationRequest) (sourceStagedOperationDelta, bool) {
			known := work.operationRecipes[request.producer].delta
			return sourceStagedOperationDelta{exposures: known.exposures, extracted: baselineReady && stagedLiteralStandardPrototype(source, get.receiver.node)}, true
		}, func(request sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool) {
			return mapper(request, operation, region)
		},
		func(request sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool {
			if !query.liveStagedFieldGet(get) {
				return false
			}
			recipe := work.operationRecipes[request.producer]
			// Previously delivered prefixes remain first. Discovery is finite and stable.
			merged := cloneOperationDelta(recipe.delta)
			for _, required := range delta.required {
				known := false
				for _, prior := range merged.required {
					known = known || sameOperationRequest(prior, required)
				}
				if !known {
					merged.required = append(merged.required, required)
				}
			}
			for _, residual := range delta.residuals {
				known := false
				for _, prior := range merged.residuals {
					known = known || sameOperationResidual(prior, residual)
				}
				if !known {
					merged.residuals = append(merged.residuals, residual)
				}
			}
			recipe.delta = merged
			if !work.updateFieldValueRecipe(facts, recipe) {
				return false
			}
			role := 0
			if sameOperationRequest(request, roles.prototype) {
				role = 1
			}
			work.operations[demand.producer.index].fieldValueReady[role] = delta.extracted
			id, requested := work.operationIDs[request.producer]
			if !requested {
				return true
			}
			ready := merged
			ready.extracted = delta.extracted
			return work.publishFieldSourcePrefix(id, ready)
		})
	return true
}

// Source-template readiness is rebuilt only from this graph's original Get.
// Cloned recipes may retain atoms, but never the prior graph's disposition.
func (work *callableEffectWork) publishSequenceValueCoverage(id sourceStagedOperationID) bool {
	if !work.sequenceValueSourceReady(id) {
		return false
	}
	delta := work.operationRecipes[work.operations[id.index].key].delta
	delta.extracted = true
	return work.publishFieldSourcePrefix(id, delta)
}

// deliverSequenceGetterValue retains an external host Get's runtime result as
// an unknown callable alternative. This is a reached source leaf, not missing
// local output, failed collection or an empty-delta completion shortcut.
func (work *callableEffectWork) deliverSequenceGetterValue(facts []callableFacts, field sourceStagedOperationID, body *ast.Node, owner *executableBodyOwner) {
	if field.epoch != work.operationEpoch || field.index == 0 || int(field.index) >= len(work.operations) || owner == nil {
		return
	}
	state := &work.operations[field.index]
	if _, eligible := stagedNativeSequence(&facts[work.memberNodes[state.key.declaration]], owner); !eligible {
		return
	}
	parent := sourceStagedOperationRequest{producer: state.key}
	parent.producer.kind = relativeDemandDirectExposure
	roles, valid := fieldSourceRequests(parent)
	if !valid {
		return
	}
	for _, site := range owner.values.summary(body).returnSites {
		expression := site
		if ast.IsReturnStatement(site) {
			expression = site.Expression()
		}
		if expression == nil || !ast.IsPropertyAccessExpression(expression) {
			continue
		}
		root, _ := accessorReceiver(expression)
		if !ast.IsIdentifier(root) {
			continue
		}
		symbol := owner.checker.GetSymbolAtLocation(root)
		if symbol == nil || !stagedSequenceExternalRead(expression, owner) {
			continue
		}
		for _, request := range []sourceStagedOperationRequest{roles.ownWriters, roles.prototype} {
			recipe, exists := work.operationRecipes[request.producer]
			if !exists {
				continue
			}
			residual := sourceStagedOperationResidual{operation: state.key.operation}
			known := false
			for _, prior := range recipe.delta.residuals {
				known = known || sameOperationResidual(prior, residual)
			}
			if !known {
				recipe.delta = cloneOperationDelta(recipe.delta)
				recipe.delta.residuals = append(recipe.delta.residuals, residual)
				work.updateFieldValueRecipe(facts, recipe)
			}
		}
	}
}

func (work *callableEffectWork) sequenceValueSourceReady(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	if state.key.kind != relativeDemandDirectExposure {
		return false
	}
	parent, sourceRole := fieldSourceParent(sourceStagedOperationRequest{producer: state.key})
	if !sourceRole {
		return false
	}
	roles, valid := fieldSourceRequests(parent)
	if !valid {
		return false
	}
	slot := 0
	if state.key == roles.prototype.producer {
		slot = 1
	}
	parent.producer.kind = relativeDemandEffects
	field, exists := work.operationIDs[parent.producer]
	return exists && field.epoch == work.operationEpoch && work.operations[field.index].fieldValueReady[slot]
}

// sequenceInstalledSourceContribution factors the already-authorized sequence
// owner's per-source mapping. Its caller still validates the complete original
// two-operation sequence. This helper alone grants neither general field DATA
// mapping nor a native/NoUser/value law to another operation family.
func (work *callableEffectWork) sequenceInstalledSourceContribution(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, source *sourceStagedNativeGetSource, call, operation, region *ast.Node, value bool) (sourceStagedOperationDelta, bool) {
	if region == demand.request.consumer && operation == call {
		return sourceStagedOperationDelta{required: []sourceStagedOperationRequest{source.request}, extracted: true}, true
	}
	if region == demand.request.consumer && operation == call.Expression() {
		return sourceStagedOperationDelta{required: []sourceStagedOperationRequest{nativeRootDebtRequest(source, "callee-get")}, extracted: true}, true
	}
	eager := work.operationRecipes[nativeRootDebtRequest(source, "eager-inputs").producer].nativeGet
	if region == demand.request.consumer && operation == source.installation.target.expression {
		if eager != nil && eager.eager != nil && eager.eager.targetPending {
			return sourceStagedOperationDelta{required: []sourceStagedOperationRequest{nativeEagerTargetRequest(source)}, extracted: true}, true
		}
	}
	if eager != nil && eager.eager != nil && stagedEagerSourceOperation(eager.eager.calls, operation, region, query.executable) {
		delta := sourceStagedOperationDelta{required: []sourceStagedOperationRequest{nativeRootDebtRequest(source, "eager-inputs")}, extracted: true}
		if value && sourceOpaqueDeclarationCall(operation, query.executable) {
			delta.residuals = []sourceStagedOperationResidual{{operation: demand.request.producer.operation}}
		}
		return delta, true
	}

	return sourceStagedOperationDelta{}, false
}
