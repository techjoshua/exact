package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nativePromiseEffects consumes first assimilation at the actual normal call.
// Its saved result is conditional on success, not a raw Promise payload. Known
// getters execute with this=value even when exposure prevents later transfer.
func (query *sourceValueQuery) nativePromiseEffects(receipt *sourceNativeInvocation, result *accessorCandidates) {
	defer func() { receipt.observed = query.sealInitializerObservation(receipt.observed, result) }()
	receipt.observed.incomplete = receipt.incomplete || receipt.referencesIncomplete
	previous := query.creators
	query.creators = receipt.scope.creators
	defer func() { query.creators = previous }()
	// Scalar actual values perform no assimilation Get. Their original argument
	// evaluation and callee/receiver acquisition are already normal obligations.
	if receipt.scalarInput {
		receipt.values = query.sealInitializerValues(receipt.values, result)
		value := sourceValue{undefined: true}
		if receipt.actual != nil {
			value = sourceValue{node: receipt.actual}
		}
		receipt.observed.values = append(receipt.observed.values, sourceObservedValue{value: value, scope: receipt.scope})
	} else {
		query.preparePropertyReferences(receipt.owner, result)
		refs := append([]sourceThenReference{}, result.thenReferences...)
		if receipt.owner != nil {
			eager, incomplete := query.settlementThenReferences(receipt.owner, result)
			refs = append(refs, eager...)
			receipt.observed.incomplete = receipt.observed.incomplete || incomplete
		}
		receipt.values = query.sealInitializerValues(receipt.values, result)
		for _, value := range receipt.values {
			if value.undefined || value.node != nil && len(value.path) == 0 && (sourcePrimitiveValue(value.node) || query.primitiveSettlementValue(value.node)) {
				receipt.observed.values = append(receipt.observed.values, sourceObservedValue{value: value, scope: receipt.scope})
				continue
			}
			if value.node == nil {
				result.opaque = true
				receipt.observed.incomplete = true
				continue
			}
			fresh := query.nativeFreshInput(receipt, value, result)
			if !ast.IsObjectLiteralExpression(value.node) || len(value.path) != 0 {
				mergeAccessorCandidates(result, query.accessors(value.node, value.path, "then", accessorRead, receipt.scope.bindings, nil))
				result.opaque = true
				receipt.observed.incomplete = true
				continue
			}
			selected := query.settlementThen(&sourceGetInputs{operation: receipt.operation, receiver: value, freshReturn: fresh}, receipt.scope.bindings, refs, receipt.observed.incomplete)
			mergeAccessorCandidates(result, selected.effects)
			private := fresh && selected.noncallable && len(selected.effects.declarations) == 0 && !selected.effects.opaque
			receipt.observed.incomplete = receipt.observed.incomplete || !private
			receipt.privateInput = private
			receipt.observed.values = append(receipt.observed.values, sourceObservedValue{value: value, scope: receipt.scope})
		}
	}

}

// nativeFreshInput is deliberately narrower than a general borrowed result.
// Anonymous literal construction cannot publish its envelope. Field computation
// and all ordinary effects stay with the normal caller/input owner.
func (query *sourceValueQuery) nativeFreshInput(receipt *sourceNativeInvocation, value sourceValue, result *accessorCandidates) bool {
	call := receipt.operation.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 || unwrapSourceCallableReference(call.Arguments.Nodes[0]) != value.node || !ast.IsObjectLiteralExpression(value.node) || len(value.path) != 0 {
		return false
	}
	for _, field := range value.node.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, field) || !ast.IsPropertyAssignment(field) || field.Name() == nil || ast.IsComputedPropertyName(field.Name()) || callableNameText(field.Name()) == "__proto__" || !sourcePrimitiveValue(field.Initializer()) {
			return false
		}
	}
	return true
}
