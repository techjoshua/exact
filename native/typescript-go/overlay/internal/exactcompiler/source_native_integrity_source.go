package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

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
		if !q.ordinaryLiteralInput(argument) || len(values) == 0 {
			refuse()
		}
		if project != nil || observed != nil {
			for _, value := range values {
				if project != nil && value.capture == nil {
					scope := q.acquireCallableScope(bindings, result)
					value.capture = &scope
				}
				if observed != nil {
					observed(value, bindings, &acquired)
				}
				// Matching this alternative's own input/output cannot enroll the
				// same Call as an independent writer. This borrow issues no proof.
				if project != nil {
					q.withPendingWriterInput(site, result, func() { project(value, bindings) })
				}
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
