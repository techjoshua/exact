package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceFreezeRelationship describes a selected native alternative's input and
// return relationship. It cannot publish integrity, descriptor or normal-output
// evidence. Callee replacement and interference remain with canonical selection.
func (q *sourceValueQuery) sourceFreezeRelationship(site *ast.Node, callee sourceValue, bindings sourceValueBindings, calleeComplete bool, project func(sourceValue, sourceValueBindings), result *accessorCandidates) {
	if !q.dependenciesOnly || callee.native == nil || callee.native.kind != sourceNativeObjectFreeze {
		result.opaque = true
		return
	}
	plan := planOrdinaryInvocation(site.AsCallExpression().Expression, restrictedInvocationArguments(site.AsCallExpression()), q.owner.checker, func(node *ast.Node) bool { return q.charge(result, node) })
	q.materializeInvocationVectors(site, plan, bindings, result)
	actuals := restrictedInvocationArguments(site.AsCallExpression())
	sameVector := len(plan.actuals) == len(actuals)
	for i, argument := range plan.actuals {
		sameVector = sameVector && i < len(actuals) && argument == actuals[i]
	}
	if !calleeComplete || plan.adapted && (!sameVector || plan.receiver != nil || len(plan.vectors) > 0) || len(plan.actuals) != 1 || callee.native.referencesIncomplete {
		result.opaque = true
	}
	for i, argument := range plan.actuals {
		if !q.charge(result, argument) {
			return
		}
		if ast.IsSpreadElement(argument) {
			result.opaque = true
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
		// An immediate literal has ordinary own-property integrity operations. This
		// environmental effect contract does not prove its descriptors or identity.
		if !ast.IsObjectLiteralExpression(unwrapSourceCallableReference(argument)) || len(values) == 0 {
			result.opaque = true
		}
		if project != nil {
			for _, value := range values {
				if value.capture == nil {
					scope := q.acquireCallableScope(bindings, result)
					value.capture = &scope
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
