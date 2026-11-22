package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// sourceFreezeRelationship describes a selected native alternative's input and
// return relationship. It cannot publish integrity, descriptor or normal-output
// evidence. Callee replacement and interference remain with canonical selection.
func (q *sourceValueQuery) sourceFreezeRelationship(site *ast.Node, callee sourceValue, bindings sourceValueBindings, calleeComplete bool, project func(sourceValue, sourceValueBindings), result *accessorCandidates) {
	q.sourceFreezeRelationshipObserved(site, callee, bindings, calleeComplete, project, result, nil)
}

func (q *sourceValueQuery) sourceFreezeRelationshipObserved(site *ast.Node, callee sourceValue, bindings sourceValueBindings, calleeComplete bool, project func(sourceValue, sourceValueBindings), result *accessorCandidates, observed func(sourceValue, sourceValueBindings, *accessorCandidates)) {
	// A local refusal belongs to this original freeze operation. Keep an
	// earlier producer's cause, and do not publish the same operation again as
	// an unrelated unlocated unknown when selection becomes more precise.
	refuse := func() {
		result.opaque = true
		if result.cause == nil {
			result.cause = site
		}
	}
	if !q.dependenciesOnly || callee.native == nil || callee.native.kind != sourceNativeObjectFreeze {
		refuse()
		return
	}
	if project == nil {
		if producer := q.descriptorProducerAt(site); producer != nil {
			project = func(value sourceValue, bound sourceValueBindings) { q.publishDescriptorValue(producer, value, bound) }
		}
	}
	plan := planOrdinaryInvocation(site.AsCallExpression().Expression, restrictedInvocationArguments(site.AsCallExpression()), q.owner.checker, func(node *ast.Node) bool { return q.charge(result, node) })
	q.materializeInvocationVectors(site, plan, bindings, result)
	actuals := restrictedInvocationArguments(site.AsCallExpression())
	sameVector := len(plan.actuals) == len(actuals)
	for i, argument := range plan.actuals {
		sameVector = sameVector && i < len(actuals) && argument == actuals[i]
	}
	if !calleeComplete || plan.adapted && (!sameVector || plan.receiver != nil || len(plan.vectors) > 0) || len(plan.actuals) != 1 {
		refuse()
	}
	// Missing dependency reference metadata withholds a complete value projection.
	// It cannot make the selected standard freeze execute a getter on a literal.
	result.valueIncomplete = result.valueIncomplete || callee.native.referencesIncomplete
	for i, argument := range plan.actuals {
		if !q.charge(result, argument) {
			return
		}
		if ast.IsSpreadElement(argument) {
			refuse()
			continue
		}
		acquired := accessorCandidates{}
		values := q.originsAt(argument, q.boundInputAcquisition(argument, site), bindings, &acquired)
		if project == nil {
			mergeAccessorCandidates(result, acquired)
		} else {
			result.valueIncomplete = result.valueIncomplete || acquired.opaque || acquired.valueIncomplete || acquired.receiverIncomplete
			result.thenIncomplete = result.thenIncomplete || acquired.thenIncomplete
		}
		if i != 0 {
			continue
		}
		// An ordinary literal has intrinsic own-property integrity operations. This
		// environmental effect contract does not prove its descriptors or identity.
		if len(values) == 0 || !q.ordinaryLiteralInput(argument) &&
			(!calleeComplete || !q.freezeArgumentFromNativeAllocation(site, values, acquired, bindings, result)) {
			refuse()
		}
		if project != nil {
			for _, value := range values {
				if value.capture == nil {
					scope := q.acquireCallableScope(bindings, result)
					value.capture = &scope
				}
				if observed != nil {
					observed(value, bindings, &acquired)
				}
				// Matching this alternative's own input/output cannot enroll the
				// same Call as an independent writer. This borrow issues no proof.
				q.withPendingWriterInput(site, result, func() { project(value, bindings) })
			}
		}
	}
	if len(plan.actuals) == 0 {
		result.valueIncomplete = true
	}
}

// ordinaryLiteralInput identifies the object allocated by a literal, including
// through its direct const binding. Its properties may change or escape, but
// the allocation cannot be a Proxy or a preexisting standard constructor.
func (q *sourceValueQuery) ordinaryLiteralInput(argument *ast.Node) bool {
	value := unwrapSourceCallableReference(argument)
	if value != nil && ast.IsIdentifier(value) {
		symbol := q.owner.checker.GetSymbolAtLocation(value)
		if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			return false
		}
		decl := symbol.ValueDeclaration
		if decl.Parent == nil || decl.Parent.Flags&ast.NodeFlagsConst == 0 {
			return false
		}
		value = unwrapSourceCallableReference(decl.Initializer())
	}
	return value != nil && (ast.IsArrayLiteralExpression(value) || ast.IsObjectLiteralExpression(value))
}

// freezeArgumentFromNativeAllocation uses the conditional result of an original
// selected child. It grants no descriptor or result authority and does not pay
// the child's eager inputs, coercions or any of its performed effects.
func (q *sourceValueQuery) freezeArgumentFromNativeAllocation(
	site *ast.Node,
	values []sourceValue,
	acquired accessorCandidates,
	bindings sourceValueBindings,
	result *accessorCandidates,
) bool {
	if len(values) != 1 || acquired.opaque || acquired.valueIncomplete || acquired.receiverIncomplete || q.reflectiveCopy != nil {
		return false
	}
	value := values[0]
	child := value.node
	if child == nil || len(value.path) != 0 || !ast.IsCallExpression(child) || ast.IsOptionalChain(child) {
		return false
	}
	kind := stagedNativeInputIntent(child.Expression())
	if kind != sourceNativeObjectCreate && kind != sourceNativeObjectDefineProperties {
		return false
	}
	if !standardLibraryCallRoot(child.Expression(), q.owner.checker) {
		return false
	}
	actuals := restrictedInvocationArguments(child.AsCallExpression())
	switch kind {
	case sourceNativeObjectCreate:
		if len(actuals) != 1 || ast.IsSpreadElement(actuals[0]) || sourceCopyMember(child) != "create" {
			return false
		}
		prior := q.reflectiveCopy
		projection := sourceReflectiveCopyProjection{issuer: q, calls: []*ast.Node{child}}
		q.reflectiveCopy = &projection
		defer func() { q.reflectiveCopy = prior }()
	case sourceNativeObjectDefineProperties:
		// Component placement has the ordinary module Effects collector.
		// Source-only queries still need their original staged input proof.
		if len(q.owner.components) != 0 && runtimeModuleEvaluation(site.Parent) &&
			originalFreezeDescriptorParent(child, q.owner.checker) == site && q.freezeChildArgumentsOwned(actuals, result) {
			break
		}
		if len(actuals) != 2 || !ast.IsObjectLiteralExpression(actuals[0]) ||
			!sourceInertObjectFields(actuals[0], func(name *ast.Node) bool {
				return q.freezeChildInertComputedName(name, result)
			}) || !q.freezeChildPlainDescriptorMap(actuals[1]) {
			return false
		}
	}
	priorReading := q.reading
	q.reading = child
	defer func() { q.reading = priorReading }()
	var selected accessorCandidates
	q.withPendingWriterInput(site, result, func() {
		selected = q.receiverCandidates(child, bindings)
	})
	if len(selected.values) != 1 || selected.opaque || selected.valueIncomplete || selected.receiverIncomplete || selected.ownOperation {
		return false
	}
	native := selected.values[0].native
	return native != nil && native.kind == kind && !native.referencesIncomplete
}

// freezeChildInertComputedName admits represented primitive keys. Checked
// assertions alone cannot exclude an authored conversion on the actual value.
func (q *sourceValueQuery) freezeChildInertComputedName(name *ast.Node, result *accessorCandidates) bool {
	key := q.enumerationKeyExpression(name, result)
	if key == nil {
		return false
	}
	if ast.IsStringLiteral(key) || ast.IsNumericLiteral(key) {
		return true
	}
	if !q.standardEnumerationSymbol(key) {
		return false
	}
	if !ast.IsCallExpression(key) {
		return true
	}
	args := restrictedInvocationArguments(key.AsCallExpression())
	return len(args) == 0 || len(args) == 1 && ast.IsStringLiteral(unwrapSourceCallableReference(args[0]))
}

// freezeChildPlainDescriptorMap limits the proof to selected child applications
// whose descriptor options are data. An authored accessor or unknown key must
// first receive coverage in the child's owner.
func (q *sourceValueQuery) freezeChildPlainDescriptorMap(input *ast.Node) bool {
	input = unwrapSourceCallableReference(input)
	if input == nil || !ast.IsObjectLiteralExpression(input) {
		return false
	}
	for _, property := range input.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) || property.Name() == nil ||
			!sourceInertDataLiteral(unwrapSourceCallableReference(property.Initializer()), "") {
			return false
		}
		name := property.Name()
		if !ast.IsComputedPropertyName(name) {
			if callableNameText(name) == "__proto__" {
				return false
			}
			continue
		}
		key := q.owner.checker.GetTypeAtLocation(name.AsComputedPropertyName().Expression)
		if key == nil {
			return false
		}
		for _, alternative := range key.Distributed() {
			if alternative.Flags()&(checker.TypeFlagsStringLike|checker.TypeFlagsNumberLike|checker.TypeFlagsESSymbolLike) == 0 {
				return false
			}
		}
	}
	return true
}

// originalFreezeDescriptorParent recognizes the original direct nesting. Both
// operations still require canonical selection in their respective consumers.
func originalFreezeDescriptorParent(child *ast.Node, c *checker.Checker) *ast.Node {
	if child == nil || !ast.IsCallExpression(child) || ast.IsOptionalChain(child) ||
		stagedNativeInputIntent(child.Expression()) != sourceNativeObjectDefineProperties ||
		!standardLibraryCallRoot(child.Expression(), c) {
		return nil
	}
	parent := child.Parent
	if parent == nil || !ast.IsCallExpression(parent) || ast.IsOptionalChain(parent) ||
		stagedNativeInputIntent(parent.Expression()) != sourceNativeObjectFreeze ||
		!standardLibraryCallRoot(parent.Expression(), c) {
		return nil
	}
	args := restrictedInvocationArguments(parent.AsCallExpression())
	if len(args) == 1 && args[0] == child {
		return parent
	}
	return nil
}

// freezeChildArgumentsOwned bounds the fresh-literal case to descriptor maps
// whose eager phases the original argument walk and DefineProperties cover.
func (q *sourceValueQuery) freezeChildArgumentsOwned(actuals []*ast.Node, result *accessorCandidates) bool {
	keyAccounted := func(name *ast.Node) bool {
		return q.freezeChildInertComputedName(name, result) ||
			nestedDescriptorArgumentKey(name, q.owner.checker) != nil
	}
	if len(actuals) != 2 || !ast.IsObjectLiteralExpression(actuals[0]) || !ast.IsObjectLiteralExpression(actuals[1]) ||
		!sourceInertObjectFields(actuals[0], keyAccounted) {
		return false
	}
	entries := actuals[1].AsObjectLiteralExpression().Properties.Nodes
	for _, entry := range entries {
		if ast.IsGetAccessorDeclaration(entry) {
			return len(entries) == 1 && plainReturnedDescriptorEntry(entry) && sourceInertValueCreation(actuals[0])
		}
		if !ast.IsPropertyAssignment(entry) || callableNameText(entry.Name()) == "__proto__" ||
			ast.IsComputedPropertyName(entry.Name()) && !keyAccounted(entry.Name()) {
			return false
		}
		descriptor := unwrapSourceCallableReference(entry.Initializer())
		if len(entries) == 1 && soleDescriptorFieldGetter(descriptor) != nil {
			continue
		}
		if !ast.IsObjectLiteralExpression(descriptor) {
			return false
		}
		for _, field := range descriptor.AsObjectLiteralExpression().Properties.Nodes {
			if !ast.IsPropertyAssignment(field) || field.Name() == nil || ast.IsComputedPropertyName(field.Name()) || callableNameText(field.Name()) == "__proto__" {
				return false
			}
			initializer := unwrapSourceCallableReference(field.Initializer())
			if !sourceInertValueCreation(initializer) &&
				(callableNameText(field.Name()) != "value" || !ast.IsIdentifier(initializer)) {
				return false
			}
		}
	}
	return true
}
