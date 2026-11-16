package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceProxyInputs projects the original constructor/argument relationships.
// Acquiring source relationships here does not republish their evaluation effects
// at a later Get. No constructor result, instance or normal slot is established.
func (q *sourceValueQuery) sourceProxyInputs(site *ast.Node, bindings sourceValueBindings) ([2][]sourceValue, bool) {
	var arguments [2][]sourceValue
	if site == nil || !ast.IsNewExpression(site) {
		return arguments, false
	}
	previousReading, previousInitializing, previousInvoking := q.reading, q.initializing, q.invoking
	q.reading, q.initializing = site, site
	if creation := q.creators[enclosingCallableNode(site)]; creation.invocation != nil {
		q.invoking = creation.invocation
	}
	defer func() {
		q.reading, q.initializing, q.invoking = previousReading, previousInitializing, previousInvoking
	}()
	selected := q.accessors(site.Expression(), nil, "", accessorAcquire, bindings, nil)
	possible := false
	for _, value := range selected.values {
		possible = possible || value.native != nil && value.native.kind == sourceNativePossibleProxyConstructor
	}
	if !possible {
		return arguments, false
	}
	actuals := site.AsNewExpression().Arguments
	if actuals == nil {
		return arguments, true
	}
	for i := 0; i < len(actuals.Nodes) && i < 2; i++ {
		if ast.IsSpreadElement(actuals.Nodes[i]) {
			continue
		}
		acquired := q.accessors(actuals.Nodes[i], nil, "", accessorAcquire, bindings, nil)
		arguments[i] = append(arguments[i], acquired.values...)
		for j := range arguments[i] {
			if scope, ok := acquired.callableScopes[j]; ok {
				arguments[i][j].capture = &scope
			}
		}
	}
	return arguments, true
}

// publishProxyMayEffects retains effect facts only. Neither target/handler
// lookup nor a possible trap body can supply DATA, normal outputs or NoWrites.
func (q *sourceValueQuery) publishProxyMayEffects(operation *ast.Node, part accessorCandidates, result *accessorCandidates) {
	q.adoptConstructionMayEffects(operation, part, result)
	result.environmentEffects = append(result.environmentEffects, part.environmentEffects...)
	result.contextEffects = append(result.contextEffects, part.contextEffects...)
}

func (q *sourceValueQuery) withProxySourceScope(value sourceValue, bindings sourceValueBindings, consume func(sourceValueBindings)) {
	previous := q.creators
	if value.capture != nil {
		bindings = value.capture.bindings
		q.creators = value.capture.creators
	}
	defer func() { q.creators = previous }()
	consume(bindings)
}

// sourceProxyGetDependencies observes current handler/target Gets against the
// acquired argument objects. Unknown constructor/trap behavior stays additive.
func (q *sourceValueQuery) sourceProxyGetDependencies(site *ast.Node, path []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, reference *sourceGetReference) {
	// Updates and compound assignments include a Get before the unresolved Put.
	// Only a traversal that explicitly suppresses Get can omit trap effects.
	if mode&accessorNoGet != 0 {
		return
	}
	arguments, possible := q.sourceProxyInputs(site, bindings)
	if !possible {
		return
	}
	result.opaque, result.valueIncomplete = true, true
	if q.active[site] {
		return
	}
	traceRelease := progressActiveCall(q, site, q.active[site])
	defer traceRelease()
	q.active[site] = true
	defer delete(q.active, site)
	operation := q.protectedMember
	if operation == nil {
		operation = q.reading
	}
	for _, target := range arguments[0] {
		q.withProxySourceScope(target, bindings, func(scope sourceValueBindings) {
			selectedPath := append(append([]string(nil), target.path...), path...)
			part := q.accessors(target.node, selectedPath, name, accessorRead, scope, nil)
			q.publishProxyMayEffects(operation, part, result)
		})
	}
	for _, handler := range arguments[1] {
		q.withProxySourceScope(handler, bindings, func(scope sourceValueBindings) {
			part := q.accessors(handler.node, append(append([]string(nil), handler.path...), "get"), "", accessorAcquire, scope, nil)
			q.publishProxyMayEffects(operation, part, result)
			consume := func(value sourceValue) {
				body := value.node
				if body == nil || !ast.IsFunctionLike(body) || body.Body() == nil {
					return
				}
				q.withProxySourceScope(value, scope, func(captures sourceValueBindings) {
					effects := accessorCandidates{}
					inputs := q.bindProxyTrapInputs(body, handler, arguments[0], captures, &effects, reference != nil && reference.matches(path, name))
					q.executeInputs(body, inputs.bindings, &effects, nil, inputs)
					q.publishProxyMayEffects(operation, effects, result)
				})
			}
			for _, value := range part.values {
				consume(value)
			}
		})
	}
}
