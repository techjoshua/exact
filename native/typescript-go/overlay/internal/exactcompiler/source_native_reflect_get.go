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
	// Recovering a writer's operands can revisit this original Get. Its live
	// reader retains the owned work, while the nested projection remains open.
	if q.active[node] {
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
	read := func(target sourceValue, key string) {
		if key == "" || key == "*" {
			return
		}
		get := &sourceGetInputs{operation: node, receiver: target, propertyKey: key, originalReflectRead: true}
		part := q.accessorsAtGet(nil, []string{key}, "", mode, bindings, nil, get, target)
		mergeAccessorCandidates(result, part)
		if !acquire {
			return
		}
		for i, value := range part.values {
			if scope, captured := part.callableScopes[i]; captured && value.capture == nil {
				value.capture = &scope
			}
			sources = append(sources, value)
		}
	}
	if q.usesOwnPropertyNamesLoopBinding(actuals) {
		for _, target := range targets {
			q.readOwnPropertyNamesOrigins(target, read)
		}
	}
	for _, source := range keys.values {
		key := sourceLiteralMemberName(unwrapSourceCallableReference(source.node))
		if len(source.path) != 0 || key == "" || key == "*" {
			result.opaque, result.valueIncomplete = true, true
			continue
		}
		for _, target := range targets {
			read(target, key)
		}
	}
	return sources
}

// usesOwnPropertyNamesLoopBinding recognizes the immutable key of the original
// loop over this same captured operand. Enumeration still owns its own effects.
func (q *sourceValueQuery) usesOwnPropertyNamesLoopBinding(actuals []*ast.Node) bool {
	target, key := unwrapSourceCallableReference(actuals[0]), unwrapSourceCallableReference(actuals[1])
	if !ast.IsIdentifier(target) || !ast.IsIdentifier(key) {
		return false
	}
	c := q.owner.checker
	keySymbol, input := c.GetSymbolAtLocation(key), c.GetSymbolAtLocation(target)
	if keySymbol == nil || input == nil || input.ValueDeclaration == nil {
		return false
	}
	call := standardArrayLoopSource(keySymbol.ValueDeclaration, c)
	if !ast.IsCallExpression(call) || ast.IsOptionalChain(call) {
		return false
	}
	callee := call.Expression()
	owner, name := restrictedInvocationMember(callee, c)
	if name != "getOwnPropertyNames" || !ast.IsIdentifier(owner) || owner.Text() != "Object" || !standardLibraryCallRoot(callee, c) || standardLibraryCallOwner(call.AsCallExpression(), c) != "ObjectConstructor" {
		return false
	}
	args := restrictedInvocationArguments(call.AsCallExpression())
	if len(args) != 1 || !ast.IsIdentifier(args[0]) || c.GetSymbolAtLocation(args[0]) != input {
		return false
	}
	index := q.owner.index(ast.GetSourceFileOfNode(call))
	return !index.incomplete && !index.objectOwnNamesWritten && !q.owner.bindingWritten(input)
}

// readOwnPropertyNamesOrigins retains possible getter keys from acquired
// source origins. Only the actual Get and writer owners select property values.
func (q *sourceValueQuery) readOwnPropertyNamesOrigins(target sourceValue, read func(sourceValue, string)) {
	if len(target.path) != 0 || target.node == nil {
		return
	}
	if ast.IsCallExpression(target.node) && stagedNativeInputIntent(target.node.Expression()) == sourceNativeObjectDefineProperty && reflectiveDescriptorCall(target.node.AsCallExpression(), q.owner.checker) {
		actuals := restrictedInvocationArguments(target.node.AsCallExpression())
		if len(actuals) == 3 && ast.IsObjectLiteralExpression(unwrapSourceCallableReference(actuals[0])) {
			read(target, sourceLiteralMemberName(unwrapSourceCallableReference(actuals[1])))
		}
	}
	if ast.IsObjectLiteralExpression(target.node) {
		for _, member := range target.node.AsObjectLiteralExpression().Properties.Nodes {
			if ast.IsGetAccessorDeclaration(member) && !ast.IsComputedPropertyName(member.Name()) {
				read(target, callableNameText(member.Name()))
			}
		}
	}
}
