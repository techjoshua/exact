package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// acquireAsyncFacade consumes actual execution output without invoking the body
// again. Multiple acquired alternatives stay separate and incomplete coverage
// cannot be hidden by one successful declaration.
func (query *sourceValueQuery) acquireAsyncFacade(call *ast.Node, result *accessorCandidates) bool {
	context := query.returnObservation
	if context == nil {
		return false
	}
	found := false
	for _, receipt := range context.normalCalls {
		if !query.charge(result, call) {
			return found
		}
		if !receipt.async || receipt.operation != call || receipt.owner != enclosingCallableNode(call) || receipt.owner != context.owner || receipt.frame == nil || receipt.frame != context.frame || receipt.frame != query.inputs {
			continue
		}
		found = true
		if !receipt.entered || receipt.raw.incomplete {
			result.opaque = true
			continue
		}
		result.values = append(result.values, sourceValue{node: call, native: &sourceNativeValue{kind: sourceNativeAsyncFacade, acquired: call, async: receipt}})
	}
	return found
}

// settleAsyncFacade handles only the directly returned actual call. The facade
// is a language-created Promise, independently of the current Promise binding.
// Native then is not pure: constructor, species and capability are separate
// obligations even though its derived promise is ignored by assimilation.
func (query *sourceValueQuery) settleAsyncFacade(value sourceValue, site *ast.Node, bindings sourceValueBindings, result *accessorCandidates, observed *sourceResultObservation) {
	previousReading := query.reading
	query.reading = site
	defer func() { query.reading = previousReading }()
	receipt := value.native.async
	outer := query.envelopeOuterExpression(value.node, result)
	direct := outer != nil && outer.Parent != nil && (ast.IsReturnStatement(outer.Parent) || ast.IsArrowFunction(outer.Parent) && outer.Parent.Body() == outer)
	if receipt == nil || !receipt.entered || receipt.operation != value.node || receipt.owner != enclosingCallableNode(value.node) || receipt.frame == nil || receipt.frame != query.inputs {
		result.opaque = true
		observed.incomplete = true
		return
	}

	closed := query.promiseFacadeThenEffects(value, site, bindings, result)
	closed = closed && direct
	if !closed || receipt.fulfilled.incomplete {
		result.opaque = true
		result.cause = site
		observed.incomplete = true
		return
	}
	// Forward settled primitive alternatives only. An object would be assimilated
	// again by the outer resolver and needs a new lifetime/settlement proof.
	for _, fulfilled := range receipt.fulfilled.values {
		if !query.charge(result, site) {
			observed.incomplete = true
			return
		}
		term := fulfilled.value
		if term.undefined || term.node != nil && len(term.path) == 0 && (sourcePrimitiveValue(term.node) || query.primitiveSettlementValue(term.node)) {
			observed.values = append(observed.values, fulfilled)
		} else {
			result.opaque = true
			observed.incomplete = true
		}
	}
}

// promiseFacadeThenEffects owns assimilation's public then and possible native
// capability operations. It does not interpret authored callbacks or supply a
// fulfilled result. Await wrapping and async return use the same actual Get owner.
func (query *sourceValueQuery) promiseFacadeThenEffects(value sourceValue, site *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	then := query.asyncFacadeGet(value, "then", nil, bindings, result)
	retainCallableThenEffects(&then, site)
	for _, effect := range then.effects {
		result.effects = append(result.effects, effect)
	}
	closed := len(then.values) > 0 && !then.opaque && !then.valueIncomplete && !then.receiverIncomplete && len(then.effects) == 0
	nativeThen := false
	for _, selected := range then.values {
		if !query.charge(result, site) {
			closed = false
			break
		}
		native := selected.native != nil && selected.native.kind == sourceNativePromiseThen
		nativeThen = nativeThen || native
		closed = closed && native && !selected.native.referencesIncomplete
	}
	// Only an intrinsic then invokes these capability operations. Authored then
	// alternatives keep their known body effects but no resolving callbacks are invented.
	if nativeThen {
		constructor := query.asyncFacadeGet(value, "constructor", nil, bindings, result)
		closed = closed && len(constructor.values) > 0 && !constructor.opaque && !constructor.valueIncomplete && !constructor.receiverIncomplete && len(constructor.effects) == 0
		for _, selected := range constructor.values {
			if !query.charge(result, site) {
				closed = false
				break
			}
			if selected.undefined {
				continue
			}
			standard := selected.native != nil && selected.native.kind == sourceNativePromiseConstructor && !selected.native.referencesIncomplete
			closed = closed && standard
			if selected.node == nil || selected.native == nil && (sourcePrimitiveValue(selected.node) || query.primitiveSettlementValue(selected.node)) {
				// A primitive constructor throws before the species Get. Rejection
				// is never converted into a fulfilled undefined value.
				continue
			}
			key, symbol := query.nativeSpeciesKey(result)
			if key == "" {
				closed = false
				continue
			}
			species := query.asyncFacadeGet(selected, key, symbol, bindings, result)
			closed = closed && len(species.values) > 0 && !species.opaque && !species.valueIncomplete && !species.receiverIncomplete && len(species.effects) == 0
			for _, capability := range species.values {
				if !query.charge(result, site) {
					closed = false
					break
				}
				if capability.undefined || capability.node != nil && capability.node.Kind == ast.KindNullKeyword {
					continue
				}
				if capability.native == nil || capability.native.kind != sourceNativePromiseConstructor || capability.native.referencesIncomplete {
					retainCallableThenEffects(&species, site)
					result.effects = append(result.effects, species.effects...)
					closed = false
				}
			}
		}
	}
	return closed
}

// asyncFacadeGet shares actual receiver and descriptor acquisition with native
// members. It creates no CallExpression, callback arguments or fake constructor.
func (query *sourceValueQuery) asyncFacadeGet(receiver sourceValue, key string, symbol *ast.Symbol, bindings sourceValueBindings, result *accessorCandidates) accessorCandidates {
	if receiver.native == nil {
		if receiver.node == nil {
			return accessorCandidates{opaque: true}
		}
		get := &sourceGetInputs{operation: query.reading, receiver: receiver, symbol: symbol}
		selected := query.accessorsAtGet(receiver.node, append(receiver.path, key), "", accessorAcquire, bindings, nil, get)
		mergeAccessorCandidates(result, selected)
		return selected
	}
	acquired := accessorCandidates{}
	query.nativeMemberKey(receiver, nil, key, symbol, accessorAcquire, bindings, &acquired, func(node *ast.Node, path []string, instance bool) {
		other := query.accessors(node, path, "", accessorAcquire, bindings, nil)
		offset := len(acquired.values)
		mergeAccessorCandidates(&acquired, other)
		if acquired.callableScopes == nil {
			acquired.callableScopes = make(map[int]acquiredCallableScope)
		}
		for i, scope := range other.callableScopes {
			acquired.callableScopes[offset+i] = scope
		}
		acquired.values = append(acquired.values, other.values...)
	})
	mergeAccessorCandidates(result, acquired)
	return acquired
}
