package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceReflectGetRelationship consumes the selected two-argument native Call.
// Its Get keeps the actual receiver and any known source return alongside
// opaque keys or receivers. It issues no normal output or descriptor authority.
func (q *sourceValueQuery) sourceReflectGetRelationship(node *ast.Node, selected sourceValue, bindings sourceValueBindings, complete bool, project func(sourceValue, sourceValueBindings), result *accessorCandidates) {
	call := node.AsCallExpression()
	plan := planOrdinaryInvocation(call.Expression, restrictedInvocationArguments(call), q.owner.checker, nil)
	if plan.adapted || len(plan.actuals) != 2 || ast.IsSpreadElement(plan.actuals[0]) || ast.IsSpreadElement(plan.actuals[1]) {
		result.opaque, result.valueIncomplete = true, true
		return
	}
	result.opaque = result.opaque || !complete
	result.valueIncomplete = result.valueIncomplete || selected.native.referencesIncomplete
	var values []sourceValue
	q.withActiveInvocation(node, func() {
		values = q.reflectGetSources(node, plan.actuals, bindings, project != nil, result)
	})
	for _, value := range values {
		project(value, bindings)
	}
}

// reflectGetSources consumes the original Get before forwarding any results to
// its reader, so subsequent writes cannot retarget the saved value.
func (q *sourceValueQuery) reflectGetSources(node *ast.Node, actuals []*ast.Node, bindings sourceValueBindings, acquire bool, result *accessorCandidates) []sourceValue {
	reading, initializing, returning, protected := q.reading, q.initializing, q.returning, q.protectedMember
	q.reading, q.initializing, q.returning, q.protectedMember = node, node, nil, nil
	defer func() {
		q.reading, q.initializing, q.returning, q.protectedMember = reading, initializing, returning, protected
	}()
	targets := q.originsAt(actuals[0], node, bindings, result)
	keys := q.accessors(actuals[1], nil, "", accessorAcquire, bindings, nil)
	mergeAccessorCandidates(result, keys)
	if len(targets) == 0 || len(keys.values) == 0 {
		result.opaque, result.valueIncomplete = true, true
	}
	mode := accessorRead
	if acquire {
		mode = accessorAcquire
	}
	var sources []sourceValue
	for _, source := range keys.values {
		key := sourceLiteralMemberName(unwrapSourceCallableReference(source.node))
		if len(source.path) != 0 || key == "" || key == "*" {
			result.opaque, result.valueIncomplete = true, true
			continue
		}
		for _, target := range targets {
			get := &sourceGetInputs{operation: node, receiver: target, propertyKey: key}
			part := q.accessorsAtGet(nil, []string{key}, "", mode, bindings, nil, get, target)
			mergeAccessorCandidates(result, part)
			if !acquire {
				continue
			}
			for i, value := range part.values {
				if scope, captured := part.callableScopes[i]; captured && value.capture == nil {
					value.capture = &scope
				}
				sources = append(sources, value)
			}
		}
	}
	return sources
}
