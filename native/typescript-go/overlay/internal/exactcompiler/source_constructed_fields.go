package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// getProjectionDemand keeps dependency observations separate from retained
// normal Get output. Missing exact output alone supplies no effect opacity.
func (query *sourceValueQuery) getProjectionDemand() sourceProjectionDemand {
	if query.dependenciesOnly {
		return sourceValueProjection
	}
	return sourceExecutionOutput
}

// visitSourceConstructedField acquires a symbolic field relationship at its New
// boundary, then consumes it at the current member/serialization observation.
// It allocates no instance and publishes no descriptor or normal Get receipt.
func (query *sourceValueQuery) visitSourceConstructedField(field *ast.Node, receiver sourceValue, bindings sourceValueBindings, result *accessorCandidates, consume func([]sourceValue)) {
	// Receiver writes belong to the acquired New occurrence, not the class
	// declaration used for prototype lookup. Reuse the ordered write owner.
	if field.Name() != nil && !ast.IsComputedPropertyName(field.Name()) {
		writes := accessorCandidates{}
		var current []sourceValue
		replaced := query.memberValues(receiver.node, []string{callableNameText(field.Name())}, "", accessorAcquire, bindings, &writes, func(node *ast.Node, path []string, instance bool) {
			part := query.accessors(node, path, "", accessorAcquire, bindings, nil)
			mergeAccessorCandidates(&writes, part)
			current = append(current, part.values...)
		})
		mergeAccessorCandidates(result, candidatePublisherPayload(writes))
		if len(current) > 0 {
			consume(current)
		}
		if replaced && !writes.opaque && !writes.receiverIncomplete {
			return
		}
	}
	if field.Initializer() == nil {
		consume([]sourceValue{{undefined: true}})
		return
	}
	if query.active[field] {
		result.opaque = true
		return
	}
	previousActive, present := query.active[field]
	query.active[field] = true
	defer func() {
		if present {
			query.active[field] = previousActive
		} else {
			delete(query.active, field)
		}
	}()
	scope := query.acquireCallableScope(bindings, result)
	scope.bindings[0] = []sourceValue{receiver}
	previousReading, previousInitializing, previousCreators, previousInputs := query.reading, query.initializing, query.creators, query.inputs
	query.reading, query.initializing, query.creators = receiver.node, receiver.node, scope.creators
	query.inputs = &sourceValueInputs{declaration: field, invocation: receiver.node, bindings: scope.bindings}
	acquired := query.accessors(field.Initializer(), nil, "", accessorAcquire, scope.bindings, nil)
	query.reading, query.initializing, query.creators, query.inputs = previousReading, previousInitializing, previousCreators, previousInputs
	mergeAccessorCandidates(result, candidatePublisherPayload(acquired))
	values := append([]sourceValue(nil), acquired.values...)
	for i := range values {
		if captured, ok := acquired.callableScopes[i]; ok {
			values[i].capture = &captured
		}
	}
	consume(values)
}

// sourceConstructedDataSlot qualifies only the source DefineField relationship
// used by dependency replacement. It supplies no normal descriptor or NoWrites
// proof. Unmodeled constructors, bases and decorators cannot establish it.
func (query *sourceValueQuery) sourceConstructedDataSlot(origin *ast.Node, key string, bindings sourceValueBindings) bool {
	if !query.dependenciesOnly || origin == nil || !ast.IsNewExpression(origin) {
		return false
	}
	part := accessorCandidates{}
	selected := query.selectSourceConstruction(origin, bindings, &part)
	if part.opaque || selected.base.valueIncomplete || len(selected.declarations) == 0 {
		return false
	}
	for _, target := range selected.declarations {
		if !ast.IsClassDeclaration(target) && !ast.IsClassExpression(target) || ast.HasDecorators(target) || ast.GetFirstConstructorWithBody(target) != nil {
			return false
		}
		var class *ast.ClassLikeBase
		if ast.IsClassDeclaration(target) {
			class = &target.AsClassDeclaration().ClassLikeBase
		} else {
			class = &target.AsClassExpression().ClassLikeBase
		}
		if class.HeritageClauses != nil {
			return false
		}
		found := false
		for _, member := range target.Members() {
			if !query.charge(&part, member) {
				return false
			}
			if ast.IsPropertyDeclaration(member) && !ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) && member.Name() != nil && !ast.IsComputedPropertyName(member.Name()) && callableNameText(member.Name()) == key {
				found = true
			}
		}
		if !found {
			return false
		}
	}
	return true
}
