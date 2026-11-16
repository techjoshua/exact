package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// descriptorStrongGetInputs is called at the original accessor visitor. A
// lexical reference or the live Call selector may issue this actual field Get;
// neither a retained descriptor marker nor a later caller's bindings can do so.
func (q *sourceValueQuery) descriptorStrongGetInputs(view sourceNativeDescriptorView, supplied *sourceGetInputs, reference *sourceGetReference, projection []string, name string, mode accessorTraversal) *sourceGetInputs {
	if q == nil || q.owner == nil || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || view.source.generation != q.owner.generation || len(view.projection) != 0 {
		return nil
	}
	key := name
	if len(projection) == 1 && name == "" {
		key = projection[0]
	} else if len(projection) != 0 {
		return nil
	}
	if key != "value" && key != "get" && key != "set" {
		return nil
	}
	operation := q.protectedMember
	if operation == nil || (!ast.IsPropertyAccessExpression(operation) && !ast.IsElementAccessExpression(operation)) {
		return nil
	}
	_, actual := accessorReceiver(operation)
	if actual != key {
		return nil
	}
	if supplied != nil {
		if supplied.operation != operation || supplied.hasOnly || supplied.symbol != nil || supplied.propertyKey != key || supplied.receiver.descriptorView == nil || !descriptorViewDataEqual(supplied.receiver.descriptorView, &view) {
			return nil
		}
		return supplied
	}
	lexical := mode == accessorRead && reference != nil && reference.operation == operation && reference.matches(projection, name)
	selector := q.installedCallSelection
	selected := mode == accessorAcquire && selector != nil && selector.live && selector.issuer == q && selector.borrow == q.stagedMember && selector.source.request.producer.operation == operation && q.installedCallSelectionObservationOwned(selector.borrow, operation)
	if !lexical && !selected {
		return nil
	}
	copy := projectNativeDescriptorView(view, nil)
	return &sourceGetInputs{operation: operation, propertyKey: key, receiver: sourceValue{descriptorView: &copy}}
}

// observeDescriptorStrongRead retains only delivered stored-source donors. It
// leaves the conditional record marker and independent record-Get/shape debts
// intact. Unsupported operations fall back to the existing strong source path.
func (q *sourceValueQuery) observeDescriptorStrongRead(view sourceNativeDescriptorView, supplied *sourceGetInputs, reference *sourceGetReference, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, read *sourceMemberWriterReadCut, result *accessorCandidates) bool {
	get := q.descriptorStrongGetInputs(view, supplied, reference, projection, name, mode)
	b := q.stagedMember
	if get == nil || b == nil || b.descriptorStrongRead == nil || b.issuer != q || read == nil || read.operation != get.operation || b.request.producer.operation != get.operation {
		return false
	}
	restore := q.enterStagedMemberSource(get, read, result)
	defer restore()
	if _, weak := q.descriptorGetEffectsUseOwned(get, read, mode); weak {
		return false // The original Effects owner owns its narrower interest.
	}
	delivered := b.descriptorStrongRead(view, get, read, mode, bindings, result)
	if delivered {
		// Target-source C does not account for the actual result-record Get or
		// prove that an own value slot shadows an inherited accessor.
		q.retainNativeDescriptorView(view, projection, name, mode, false, result)
		result.valueIncomplete, result.opaque = true, true
	}
	return delivered
}
