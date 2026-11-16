package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedMapEntryFieldRequest names one descriptor role at its original entry
// Get. Association separates entries even when their descriptor source aliases.
func stagedMapEntryFieldRequest(entry *sourceStagedMapEntryContribution, field string) sourceStagedOperationRequest {
	request := entry.request
	anchor := entry.entry.descriptor.expression
	if anchor == nil {
		anchor = entry.entry.member
	}
	request.producer.selector = sourceStagedOperationSelector{occurrence: anchor, association: entry.entry.member, field: field}
	request.edge += ":field:" + field
	return request
}

// The body relationship requires the original Get binder's receiver mapping.
// This pending ticket is registered before the source getter is read.
func stagedMapEntryGetterRequest(entry *sourceStagedMapEntryContribution) sourceStagedOperationRequest {
	request := entry.request
	request.producer.selector.field = "descriptor-entry-getter"
	request.edge += ":getter"
	return request
}

func validStagedMapEntryRecipe(recipe sourceStagedOperationRecipe) bool {
	contribution := recipe.mapEntry
	if contribution == nil || contribution.generation == nil || contribution.source == nil || recipe.nativeGet != nil || contribution.source.kind != sourceNativeObjectDefineProperties {
		return false
	}
	request, valid := stagedMapEntryRequest(contribution.source, contribution.entry)
	if !valid || !sameOperationRequest(request, contribution.request) {
		return false
	}
	if contribution.read != nil {
		read := contribution.read
		if !sameOperationRequest(read.request, request) || !sameStagedMapEntry(read.entry, contribution.entry) {
			return false
		}
		if read.getter != nil && (read.getter != contribution.entry.getter || read.bound.declaration != read.getter || read.bound.operation != request.producer.operation || read.bound.cut != contribution.entry.cut) {
			return false
		}
	}
	if contribution.entry.getter != nil && recipe.key == stagedMapEntryGetterRequest(contribution).producer {
		return !recipe.delta.extracted && operationDeltaSize(recipe.delta) == 0
	}
	count := len(reflectiveDescriptorKeys)
	if contribution.entry.getter != nil {
		count++
	}
	if recipe.key != request.producer || len(recipe.delta.required) < count || len(recipe.delta.required) > count+1 || len(recipe.delta.effects)+len(recipe.delta.residuals)+len(recipe.delta.relative)+len(recipe.delta.invoked) != 0 {
		return false
	}
	for index, field := range reflectiveDescriptorKeys {
		if !sameOperationRequest(recipe.delta.required[index], stagedMapEntryFieldRequest(contribution, field)) {
			return false
		}
	}
	if contribution.entry.getter != nil && !sameOperationRequest(recipe.delta.required[6], stagedMapEntryGetterRequest(contribution)) {
		return false
	}
	if len(recipe.delta.required) != count && !sameOperationRequest(recipe.delta.required[count], stagedMemberCoverageRequest(request, contribution.entry.group, contribution.entry.cut)) {
		return false
	}
	if contribution.read == nil {
		return !recipe.delta.extracted && len(recipe.delta.exposures) == 0
	}
	// Generic dispatch and attachment must retain the same DATA C debt as
	// the owning publisher, including when the C child is still pending.
	if contribution.read.getter == nil && len(recipe.delta.required) != count+1 {
		return false
	}
	read := contribution.read
	if !sameOperationRequest(read.request, request) || !sameStagedMapEntry(read.entry, contribution.entry) {
		return false
	}
	if read.getter != nil {
		return read.getter == contribution.entry.getter && !recipe.delta.extracted && len(recipe.delta.exposures) == 0
	}
	return read.accounting == sourceEffectsAccounted && sameOperationEndpoint(read.descriptor, contribution.entry.descriptor) && len(recipe.delta.exposures) == 1 && sameOperationEndpoint(recipe.delta.exposures[0].endpoint, read.descriptor) && recipe.delta.extracted == !contribution.entry.unmapped
}

// registerStagedMapEntry registers all fields and their source roles before the
// original entry read. Getter-return descriptor acquisition remains required,
// with its original member as anchor until an actual source result is delivered.
func (work *callableEffectWork) registerStagedMapEntry(facts []callableFacts, source *sourceStagedNativeGetSource, entry sourceStagedMapEntry) bool {
	request, valid := stagedMapEntryRequest(source, entry)
	if !valid {
		return false
	}
	contribution := &sourceStagedMapEntryContribution{request: request, source: source, entry: cloneStagedMapEntry(entry), generation: work.operationGeneration}
	if runtimeModuleEvaluation(source.request.consumer) {
		work.registerMapEntryLawSources(facts, contribution)
	}
	attached := *source
	attached.descriptorEntry = contribution
	attached.descriptorGet = entry.descriptor.expression
	if attached.descriptorGet == nil {
		attached.descriptorGet = entry.member
	}
	recipe := sourceStagedOperationRecipe{key: request.producer, mapEntry: contribution}
	for _, field := range reflectiveDescriptorKeys {
		required := stagedMapEntryFieldRequest(contribution, field)
		roles, valid := fieldSourceRequests(required)
		if !valid {
			return false
		}
		for _, child := range []sourceStagedOperationRequest{roles.ownWriters, roles.prototype} {
			if !work.registerOperationSourcePrefix(facts, sourceStagedOperationRecipe{key: child.producer, nativeGet: &attached}) {
				return false
			}
		}
		dependencies := []sourceStagedOperationRequest{roles.ownWriters, roles.prototype}
		if argument, needed := stagedModuleArgumentFieldRequest(&attached, required); needed {
			dependencies = append(dependencies, argument)
		}
		if !work.registerOperationSourcePrefix(facts, sourceStagedOperationRecipe{key: required.producer, nativeGet: &attached, delta: sourceStagedOperationDelta{required: dependencies}}) {
			return false
		}
		recipe.delta.required = append(recipe.delta.required, required)
	}
	if entry.getter != nil {
		body := stagedMapEntryGetterRequest(contribution)
		if !work.registerOperationSourcePrefix(facts, sourceStagedOperationRecipe{key: body.producer, mapEntry: contribution}) {
			return false
		}
		recipe.delta.required = append(recipe.delta.required, body)
	}
	return work.registerOperationSourcePrefix(facts, recipe)
}

// acceptStagedMapEntryRead is reached only synchronously from the original
// ordered map owner. Known data is a dormant source endpoint. A getter's actual
// B remains attached and pending for the independent mapped-summary consumer.
func (work *callableEffectWork) acceptStagedMapEntryRead(facts []callableFacts, source *sourceStagedNativeGetSource, query *sourceValueQuery) bool {
	if source == nil || source.descriptorMap == nil || query == nil || query.stagedMap == nil {
		return false
	}
	borrow := query.stagedMap
	if !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) || query.traceModeKnown || !borrow.reading || borrow.currentRead == nil || borrow.generation != work.operationGeneration || !sameOperationRequest(borrow.request, source.descriptorMap.protocol) {
		return false
	}
	read := *borrow.currentRead
	prior, exists := work.operationRecipes[read.request.producer]
	if !exists || !validStagedMapEntryRecipe(prior) || prior.mapEntry.generation != work.operationGeneration || !sameStagedMapEntry(prior.mapEntry.entry, read.entry) {
		return false
	}
	// Source endpoint transport is broader than graph acceptance. DATA work
	// may extract only with the owning service and its exact retained C debt.
	// Neither a transport-only callback nor an unsupported alias can mint X.
	if read.getter == nil && !work.stagedMapEntryCoverageInstalled(query, read, prior) {
		return false
	}
	contribution := *prior.mapEntry
	detached := read
	detached.entry = cloneStagedMapEntry(read.entry)
	detached.descriptor = cloneSourceRelativeEndpoint(read.descriptor)
	detached.bound = cloneSourceRelativeBoundInputs(read.bound)
	contribution.read = &detached
	recipe := prior
	recipe.mapEntry = &contribution
	if read.getter == nil && read.accounting == sourceEffectsAccounted && read.descriptor.expression != nil {
		recipe.delta.exposures = []sourceStagedOperationAlternative{{endpoint: cloneSourceRelativeEndpoint(read.descriptor)}}
		recipe.delta.extracted = !read.entry.unmapped
	}
	if !work.attachOperationSource(facts, recipe) {
		return false
	}
	// Field consumers need the same authenticated implicit entry-Get metadata,
	// not an earlier discovery-only copy of the descriptor association.
	for _, field := range reflectiveDescriptorKeys {
		request := stagedMapEntryFieldRequest(&contribution, field)
		roles, _ := fieldSourceRequests(request)
		for _, required := range []sourceStagedOperationRequest{request, roles.ownWriters, roles.prototype} {
			child, found := work.operationRecipes[required.producer]
			if !found || child.nativeGet == nil {
				return false
			}
			attached := *child.nativeGet
			attached.descriptorEntry = &contribution
			child.nativeGet = &attached
			if !work.attachOperationSource(facts, child) {
				return false
			}
		}
	}
	if read.getter != nil {
		body := stagedMapEntryGetterRequest(&contribution)
		priorBody, found := work.operationRecipes[body.producer]
		if !found {
			return false
		}
		priorBody.mapEntry = &contribution
		return work.attachOperationSource(facts, priorBody)
	}
	return true
}

// The nominal successful result relationship is separate from Effects and the
// target-definition disposition. It conveys neither normal success nor identity.
func stagedMapConditionalTarget(source *sourceStagedNativeGetSource) (sourceStagedOperationAlternative, bool) {
	if source == nil || source.descriptorMap == nil || !validNativeDescriptorMapRecipe(sourceStagedOperationRecipe{key: source.descriptorMap.protocol.producer, nativeGet: source}) {
		return sourceStagedOperationAlternative{}, false
	}
	return sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(source.descriptorMap.target)}, true
}

// Both argument constructions belong to the original eager input owner. This
// bounded proof does not enumerate a map, read a descriptor or define a target.
func stagedMapInputsInert(source *sourceStagedNativeGetSource) bool {
	if source == nil || source.descriptorMap == nil {
		return false
	}
	call := source.request.producer.operation
	if call == nil || !ast.IsCallExpression(call) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	return len(actuals) == 2 && actuals[0] == source.descriptorMap.target.expression && actuals[1] == source.descriptorMap.descriptors.expression && sourceInertValueCreation(actuals[0]) && sourceInertValueCreation(actuals[1])
}
