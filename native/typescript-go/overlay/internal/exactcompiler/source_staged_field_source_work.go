package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// discoverFieldSources runs under the original field borrow. Selection follows
// actual executable dependency edges without executing modules or borrowing a
// normal property view. Mapping and publication are synchronous source-owner
// work. Neither a query nor the temporary index population enters the graph.
func (work *callableEffectWork) discoverFieldSources(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs) {
	requests, valid := fieldSourceRequests(demand.request)
	if !valid || !query.liveStagedFieldGet(get) {
		return
	}
	sources, complete := query.stagedFieldDiscoverySources(get)
	sequenceCalls, _ := stagedNativeSequence(&facts[work.memberNodes[demand.request.consumer]], query.executable)
	// These two native debts are shared by their original Call and callee Get.
	// Keep first source order without duplicating memberships at both anchors.
	issued := make(map[struct {
		source   sourceStagedOperationKey
		required sourceStagedOperationRequest
	}]bool)
	nativeSources := make(map[*ast.Node]*sourceStagedNativeGetSource)
	for _, recipe := range work.operationRecipes {
		if source := recipe.nativeGet; source != nil && recipe.key == nativeRootDebtRequest(source, "algorithm").producer {
			nativeSources[source.get] = source
			nativeSources[source.request.producer.operation] = source
		}
	}
	bodyIssued := make(map[struct{ source, body sourceStagedOperationKey }]bool)
	nativeDebt := func(request sourceStagedOperationRequest, source *sourceStagedNativeGetSource, role int) []sourceStagedOperationRequest {
		name := []string{"callee-get", "eager-inputs"}[role]
		required := nativeRootDebtRequest(source, name)
		if source.kind == sourceNativeSymbolFor {
			reader := work.operationRecipes[demand.request.producer].nativeGet
			if reader == nil {
				return nil
			}
			found := false
			for _, key := range reader.keySources {
				if key.symbol && key.producer.producer == source.request.producer {
					required = stagedKeySourceRequest(reader, key)
					found = true
					break
				}
			}
			if !found {
				return nil
			}
		}
		identity := struct {
			source   sourceStagedOperationKey
			required sourceStagedOperationRequest
		}{request.producer, required}
		if issued[identity] {
			return nil
		}
		issued[identity] = true
		return []sourceStagedOperationRequest{required}
	}
	firstOwnField := query.stagedFirstOwnDataField(get, get.receiver.node)
	var ownMappings, prototypeMappings []sourceStagedImplicitFieldMapping
	emitStagedFieldSourceDiscovery(query, get, requests, sources, complete,
		func(request sourceStagedOperationRequest, operation, region *ast.Node) (out sourceStagedOperationDelta, mapped bool) {
			kind := implicitFieldMappingUnclassified
			var original sourceStagedOperationRequest
			defer func() {
				mapping := sourceStagedImplicitFieldMapping{operation: operation, region: region, kind: kind, original: original, mapped: mapped, required: cloneOperationDelta(sourceStagedOperationDelta{required: out.required}).required}
				if sameOperationRequest(request, requests.ownWriters) {
					ownMappings = append(ownMappings, mapping)
				} else if sameOperationRequest(request, requests.prototype) {
					prototypeMappings = append(prototypeMappings, mapping)
				}
			}()
			result := accessorCandidates{}
			if !query.liveStagedFieldGet(get) || !query.charge(&result, operation) {
				return sourceStagedOperationDelta{}, false
			}
			if firstOwnField && region != nil && sameOperationRequest(request, requests.prototype) {
				source := nativeSources[operation]
				view := source != nil && source.request.consumer != request.consumer && (operation == source.get || source.kind == sourceNativeObjectCreate && operation == source.request.producer.operation)
				// Keep the original typed views (and failed admission) below. Other
				// prior prototype work cannot enter this first own-data Effects read.
				if !view {
					return sourceStagedOperationDelta{extracted: true}, true
				}
			}
			reader := work.operationRecipes[demand.request.producer].nativeGet
			if reader != nil && stagedSourceRegionOwned(operation, region, reader.request.producer.declaration) {
				for _, key := range reader.keySources {
					if key.expression != nil && key.expression.Parent == operation && ast.IsComputedPropertyName(operation) && operation.AsComputedPropertyName().Expression == key.expression && key.symbol {
						required := stagedKeySourceRequest(reader, key)
						identity := struct {
							source   sourceStagedOperationKey
							required sourceStagedOperationRequest
						}{request.producer, required}
						delta := sourceStagedOperationDelta{extracted: true}
						if !issued[identity] {
							issued[identity] = true
							delta.required = []sourceStagedOperationRequest{required}
						}
						return delta, true
					}
				}
			}
			if delta, represented := work.sequenceSourceContribution(facts, demand, query, sequenceCalls, operation, region, false); represented {
				return delta, true
			}
			// Only the selected original algorithm owns this nominal write. Its
			// fresh literal target cannot be the descriptor or default prototype.
			// Callee Get and eager argument effects remain independent debts.
			recipe := work.operationRecipes[demand.request.producer]
			if recipe.nativeGet != nil {
				eager := work.operationRecipes[nativeRootDebtRequest(recipe.nativeGet, "eager-inputs").producer].nativeGet
				if eager != nil && eager.eager != nil && stagedEagerSourceOperation(eager.eager.calls, operation, region, query.executable) {
					return sourceStagedOperationDelta{required: nativeDebt(request, recipe.nativeGet, 1), extracted: true}, true
				}
			}
			if body, represented := work.stagedFieldBodyRequest(demand, operation, region, query.executable); represented {
				kind = implicitFieldMappingDeclaredBody
				identity := struct{ source, body sourceStagedOperationKey }{request.producer, body.request.producer}
				delta := sourceStagedOperationDelta{extracted: true}
				if !bodyIssued[identity] {
					bodyIssued[identity] = true
					delta.required = []sourceStagedOperationRequest{body.request}
				}
				return delta, true
			}
			if source := nativeSources[operation]; source != nil && stagedSourceRegionOwned(operation, region, source.request.producer.declaration) {
				if source.request.consumer != request.consumer && operation == source.request.producer.operation && source.kind == sourceNativeObjectCreate {
					if reading, enrolled := work.enrollNativeFieldGet(facts, demand, query, get, request, source, true); enrolled {
						kind, original = implicitFieldMappingForeignCreate, source.request
						return sourceStagedOperationDelta{required: []sourceStagedOperationRequest{reading}, extracted: true}, true
					}
				}
				if source.request.consumer != request.consumer && operation == source.get {
					if reading, enrolled := work.enrollNativeFieldGet(facts, demand, query, get, request, source, false); enrolled {
						kind, original = implicitFieldMappingForeignCalleeLookup, source.request
						return sourceStagedOperationDelta{required: []sourceStagedOperationRequest{reading}, extracted: true}, true
					}
				}
				// Raw foreign sources have no typed reading for this field consumer.
				// Leave that candidate unmapped without poisoning its known local prefix.
				if source.request.consumer != request.consumer {
					return sourceStagedOperationDelta{}, false
				}
				if operation == source.get {
					kind, original = implicitFieldMappingCalleeLookup, source.request
					return sourceStagedOperationDelta{required: nativeDebt(request, source, 0), extracted: true}, true
				}
				harmless := false
				switch source.kind {
				case sourceNativeSymbolFor:
					// The conditional Symbol algorithm changes no receiver properties.
					// Its complete original root still owns Get/ToString/input work.
					harmless = false
					reader := recipe.nativeGet
					if reader != nil {
						for _, key := range reader.keySources {
							harmless = harmless || key.symbol && key.producer.producer == source.request.producer
						}
					}
				case sourceNativeObjectCreate, sourceNativeObjectFreeze:
					// These selected algorithms introduce no property values or
					// accessors on other receivers. Original Get and eager
					// input protocols, including child roots, remain required.
					harmless = work.currentNativeOrdinaryInputResult(source) || source.kind == sourceNativeObjectFreeze && work.implicitNativeBindingDescription(source, reader)
				case sourceNativeObjectDefineProperty, sourceNativeReflectDefineProperty, sourceNativeObjectDefineProperties:
					if operation == demand.request.producer.operation {
						arguments := restrictedInvocationArguments(operation.AsCallExpression())
						harmless = len(arguments) > 0 && ast.IsObjectLiteralExpression(arguments[0]) && arguments[0] != get.receiver.node
						if !harmless && reader != nil && sameOperationRequest(source.request, reader.request) && validNativeTargetSource(source) {
							// The actual Create producer is current here, before this mapping is retained.
							// Only its nominal fresh target write is disjoint; input Effects stay required.
							target := work.currentNativeResultRoot(source.targetSource.producer)
							harmless = target != nil && target.kind == sourceNativeObjectCreate && sameOperationRequest(target.request, source.targetSource)
						}
					}
				}
				if harmless {
					original = source.request
					switch source.kind {
					case sourceNativeObjectCreate, sourceNativeObjectFreeze:
						kind = implicitFieldMappingOrdinaryNativeAlgorithm
					case sourceNativeObjectDefineProperty, sourceNativeReflectDefineProperty, sourceNativeObjectDefineProperties:
						if reader != nil && sameOperationRequest(source.request, reader.request) {
							kind = implicitFieldMappingOriginalDefinition
						}
					}
					delta := sourceStagedOperationDelta{extracted: true}
					for role := 0; role < 2; role++ {
						delta.required = append(delta.required, nativeDebt(request, source, role)...)
					}
					return delta, true
				}
			}

			return sourceStagedOperationDelta{}, false
		}, func(request sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool {
			if !query.liveStagedFieldGet(get) {
				return false
			}
			if sameOperationRequest(request, requests.prototype) {
				// The selected owner supplies the conditional intrinsic baseline.
				// Authored/unknown source mappings must independently finish too.
				delta.extracted = delta.extracted && work.stagedFieldStandardPrototype(facts, demand, query, get, query.executable)
			}
			accepted := work.publishFieldSourceDiscovery(facts, demand, query, get, request, delta)
			if accepted {
				mappings := prototypeMappings
				if sameOperationRequest(request, requests.ownWriters) {
					mappings = ownMappings
				}
				work.recordImplicitFieldSources(facts, query, get, request, delta, mappings)
			}
			return accepted
		})
}

// stagedFieldDiscoverySources selects reference populations only. An active
// import backedge is already represented by its source identity, not a reason to
// re-enter selection. Missing executable relationships remain compiler-pending.
func (query *sourceValueQuery) stagedFieldDiscoverySources(get *sourceGetInputs) ([]sourceStagedFieldDiscoverySource, bool) {
	var sources []sourceStagedFieldDiscoverySource
	seen := make(map[*ast.SourceFile]bool)
	complete := true
	var visit func(*ast.SourceFile)
	visit = func(source *ast.SourceFile) {
		if source == nil || seen[source] {
			return
		}
		seen[source] = true
		result := accessorCandidates{}
		if !query.liveStagedFieldGet(get) || !query.charge(&result, source.AsNode()) {
			complete = false
			return
		}
		index := query.owner.index(source)
		sources = append(sources, sourceStagedFieldDiscoverySource{source: source, index: index})
		if index.incomplete || len(index.runtimeImports) != 0 && !index.importsPrepared {
			complete = false
		}
		for _, edge := range index.runtimeImports {
			selected, state := query.operationDependencyState(edge, &result)
			switch state {
			case sourceDependencyAvailable:
				visit(selected)
			case sourceDependencyErased:
			default:
				complete = false
			}
		}
	}
	visit(ast.GetSourceFileOfNode(get.receiver.node))
	return sources, complete
}

// publishFieldSourceDiscovery accepts a source-owner prefix only for an already
// registered exact child of this live field demand. The source envelope and its
// required memberships are installed before notification. Empty local coverage
// describes writer discovery only, never property absence, value or NoWrites.
// Unsupported source mappings stay pending rather than becoming runtime unknown.
func (work *callableEffectWork) publishFieldSourceDiscovery(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs, request sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool {
	id, registered := work.registerFieldSourceDiscovery(facts, demand, query, get, request, delta)
	return registered && work.publishFieldSourcePrefix(id, delta)
}

// Registration installs exactly the existing source-role membership without
// publishing a cached extraction or current field/prototype disposition.
func (work *callableEffectWork) registerFieldSourceDiscovery(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs, request sourceStagedOperationRequest, delta sourceStagedOperationDelta) (sourceStagedOperationID, bool) {
	if !query.liveStagedFieldGet(get) || get.operation != demand.request.producer.operation || get.receiver.node != demand.receiver.expression || get.propertyKey != demand.request.producer.selector.field {
		return sourceStagedOperationID{}, false
	}
	current, issued := work.issueFieldEffectsDemand(facts, demand.producer, query.executable)
	if !issued || !sameOperationRequest(current.request, demand.request) || !sameOperationEndpoint(current.receiver, demand.receiver) {
		return sourceStagedOperationID{}, false
	}
	parent, valid := fieldSourceParent(request)
	if !valid || !sameOperationRequest(parent, demand.request) || demand.producer.epoch != work.operationEpoch || demand.producer.index == 0 || int(demand.producer.index) >= len(work.operations) || work.operations[demand.producer.index].effectsDemand == nil || !sameOperationRequest(work.operations[demand.producer.index].effectsDemand.request, demand.request) {
		return sourceStagedOperationID{}, false
	}
	id, exists := work.operationIDs[request.producer]
	recipe, registered := work.operationRecipes[request.producer]
	if !exists || !registered || !validNativeGetRequest(recipe, request) || len(delta.exposures)+len(delta.relative) != 0 || !operationDeltaPrefix(recipe.delta, delta) || recipe.delta.extracted && !delta.extracted {
		return sourceStagedOperationID{}, false
	}
	recipe.delta = cloneOperationDelta(delta)
	if !validOperationEnvelope(recipe) {
		return sourceStagedOperationID{}, false
	}
	var dependencies []sourceStagedOperationDependency
	for _, required := range delta.required {
		child, admitted := work.requireOperation(facts, required)
		if !admitted {
			return sourceStagedOperationID{}, false
		}
		dependencies = append(dependencies, sourceStagedOperationDependency{child, required})
	}
	work.operationRecipes[request.producer] = recipe
	producer := work.memberNodes[request.producer.declaration]
	for index := range facts[producer].staged.operationRecipes {
		if facts[producer].staged.operationRecipes[index].key == request.producer {
			facts[producer].staged.operationRecipes[index] = recipe
			break
		}
	}
	work.operations[id.index].dependencies = dependencies
	work.operations[id.index].dependenciesRegistered = true
	return id, true
}

// publishFieldSourcePrefix also reconstructs graph-local status from an admitted
// immutable source recipe after cloning. Generic empty-delta publication remains
// refused. This path is restricted to the finite source-coverage role domain.
func (work *callableEffectWork) publishFieldSourcePrefix(id sourceStagedOperationID, delta sourceStagedOperationDelta) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if recipe.nativeGet == nil {
		return false
	}
	request := recipe.nativeGet.request
	request.producer = state.key
	if _, valid := fieldSourceParent(request); !valid || !validNativeGetRecipe(recipe) || !operationDeltaPrefix(state.delta, delta) || !operationDeltaPrefix(delta, recipe.delta) || state.delta.extracted && !delta.extracted || delta.extracted && !operationDeltaPrefix(recipe.delta, delta) {
		return false
	}
	if operationDeltaCursor(state.delta) == operationDeltaCursor(delta) && state.delta.extracted == delta.extracted {
		return true
	}
	state.delta = cloneOperationDelta(delta)
	state.revision++
	work.notifyOperationSubscribers(state)
	return true
}

// fieldSourcesLocallyRepresented lends Effects-only source coverage to the
// original Has/Get owner. Required children need not be settled to yield this
// producer, but must already be registered. Their closure remains independent.
// Static literal construction excludes spread/computed/custom-prototype work
// from this ordinary source path. No presence or Value conclusion follows.
func (work *callableEffectWork) fieldSourcesLocallyRepresented(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs, owner *executableBodyOwner) bool {
	if !query.liveStagedFieldGet(get) || !query.stagedFieldWorkOwner(owner) || get.operation != demand.request.producer.operation || get.receiver.node != demand.receiver.expression || get.propertyKey != demand.request.producer.selector.field {
		return false
	}
	current, issued := work.issueFieldEffectsDemand(facts, demand.producer, owner)
	if !issued || !sameOperationRequest(current.request, demand.request) || !sameOperationEndpoint(current.receiver, demand.receiver) {
		return false
	}
	if !work.stagedFieldStandardPrototype(facts, demand, query, get, owner) {
		return false
	}
	for _, member := range get.receiver.node.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsSpreadAssignment(member) || member.Name() == nil || ast.IsComputedPropertyName(member.Name()) {
			return false
		}
	}
	roles, valid := fieldSourceRequests(demand.request)
	if !valid {
		return false
	}
	for _, request := range []sourceStagedOperationRequest{roles.ownWriters, roles.prototype} {
		id, registered := work.operationIDs[request.producer]
		if !registered || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
		state := &work.operations[id.index]
		if state.invalid || !state.dependenciesRegistered || !state.delta.extracted || !validNativeGetRequest(work.operationRecipes[request.producer], request) {
			return false
		}
	}
	return true
}

// Module source indexes use a nil deferred region. The original initializer
// partition, including a single declarator, still owns only its own operations.
func stagedSourceRegionOwned(operation, region, declaration *ast.Node) bool {
	return region == declaration || region == nil && runtimeModuleEvaluation(declaration) && sourceStagedOccurrenceOwned(operation, declaration)
}

// A stored body belongs to the field Get that can expose or invoke it, including
// sibling entries of the same original map conversion. Requiring that source
// producer does not execute the stored body. Full request identities deduplicate
// these finite relationships without merging equal field names across entries.
func (work *callableEffectWork) stagedFieldBodyRequest(demand sourceStagedFieldEffectsDemand, operation, region *ast.Node, owner *executableBodyOwner) (sourceStagedFieldBodyTransfer, bool) {
	recipe := work.operationRecipes[demand.request.producer]
	if recipe.nativeGet == nil {
		return sourceStagedFieldBodyTransfer{}, false
	}
	if relation, ok := stagedDescriptorBodySource(demand.receiver.expression, operation, region, owner); ok {
		return sourceStagedFieldBodyTransfer{request: nativeDescriptorFieldRequest(recipe.nativeGet, relation.field), relation: relation, operation: operation, region: region}, true
	}
	source := recipe.nativeGet
	if source.descriptorEntry == nil {
		return sourceStagedFieldBodyTransfer{}, false
	}
	for _, candidate := range work.operationRecipes {
		related := candidate.nativeGet
		if related == nil || related.descriptorEntry == nil || !sameNativeGetSource(source, related) {
			continue
		}
		entry := related.descriptorEntry
		if entry.read == nil || entry.read.getter != nil || entry.read.descriptor.expression == nil {
			continue
		}
		if relation, ok := stagedDescriptorBodySource(entry.read.descriptor.expression, operation, region, owner); ok {
			return sourceStagedFieldBodyTransfer{request: stagedMapEntryFieldRequest(entry, relation.field), relation: relation, operation: operation, region: region}, true
		}
	}
	return sourceStagedFieldBodyTransfer{}, false
}
