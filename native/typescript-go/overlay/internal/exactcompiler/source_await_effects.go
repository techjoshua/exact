package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceAwaitResult belongs to one normal Await in its actual installed frame.
// It separates effect collection from later conditional value observation.
// It is cleared with that frame before callable facts are cached.
type sourceAwaitResult struct {
	operation, owner *ast.Node
	observed         sourceResultObservation
}

// consumeAwaitEffects consumes the operand's already-produced normal alternatives.
// The normal traversal supplies timing only. Receipt/frame ownership supplies the
// actual conditional values, and absence never invents a successful undefined.
func (query *sourceValueQuery) consumeAwaitEffects(operation, owner *ast.Node, bindings sourceValueBindings, result *accessorCandidates, inputs *sourceValueInputs) {
	if inputs == nil || query.inputs != inputs || inputs.declaration != owner || enclosingCallableNode(operation) != owner {
		result.opaque = true
		return
	}
	query.preparePropertyReferences(owner, result)
	previousObservation, previousReading := query.returnObservation, query.reading
	query.returnObservation = &sourceReturnObservation{kind: sourceRawNormalResult, owner: owner, reader: operation, frame: inputs, receipts: result.nativeCalls, normalCalls: result.normalCalls}
	query.reading = operation
	defer func() { query.returnObservation, query.reading = previousObservation, previousReading }()
	observed := sourceResultObservation{}
	operand := unwrapSourceCallableReference(operation.AsAwaitExpression().Expression)
	var values []sourceObservedValue
	found := false
	if ast.IsCallExpression(operand) {
		raw, present := query.acquireNormalCallResult(operand, result)
		if present {
			found = true
			values = append(values, raw.values...)
			observed.incomplete = observed.incomplete || raw.incomplete
		}
	} else {
		// Local completed values retain their actual original binding/creator pair.
		// This is provenance lookup, not reexecution of a member getter or call.
		terms := query.originsAt(operand, operation, bindings, result)
		for _, value := range terms {
			if !query.charge(result, operation) {
				observed.incomplete = true
				break
			}
			scope := query.acquireCallableScope(bindings, result)
			if value.normal != nil {
				original, admitted := query.normalValueScope(value, result)
				if !admitted {
					observed.incomplete = true
					continue
				}
				scope = original
			}
			values = append(values, sourceObservedValue{value: value, scope: scope})
		}
		found = len(terms) > 0
	}
	for _, value := range values {
		if !query.charge(result, operation) {
			observed.incomplete = true
			break
		}
		previousCreators := query.creators
		query.creators = value.scope.creators
		query.awaitAcquiredValue(value, operation, result, &observed)
		query.creators = previousCreators
	}
	observed.incomplete = observed.incomplete || !found
	result.opaque = result.opaque || observed.incomplete
	inputs.awaits = append(inputs.awaits, sourceAwaitResult{operation: operation, owner: owner, observed: observed})
}

func (query *sourceValueQuery) awaitAcquiredValue(observed sourceObservedValue, operation *ast.Node, result *accessorCandidates, output *sourceResultObservation) {
	value := observed.value
	if value.undefined || value.node != nil && len(value.path) == 0 && (sourcePrimitiveValue(value.node) || value.native == nil && query.primitiveSettlementValue(value.node)) {
		output.values = append(output.values, observed)
		return
	}
	if value.native != nil && value.native.kind == sourceNativePromiseFacade {
		receipt := value.native.resolve
		if receipt == nil || receipt.operation != value.node {
			output.incomplete = true
			return
		}
		closed := query.awaitFacadeEffects(value, operation, observed.scope.bindings, result)
		owned := receipt.frame == query.inputs && receipt.owner == enclosingCallableNode(operation)
		output.incomplete = output.incomplete || !closed || !owned || receipt.observed.incomplete
		if closed && owned {
			for _, fulfilled := range receipt.observed.values {
				if !query.charge(result, operation) {
					output.incomplete = true
					return
				}
				fulfilled.value.awaited = receipt
				fulfilled.scope = query.copyCallableScope(fulfilled.scope, result)
				output.values = append(output.values, fulfilled)
			}
		}
		return
	}

	if value.native != nil && value.native.kind == sourceNativeAsyncFacade {
		receipt := value.native.async
		if receipt == nil || !receipt.entered || receipt.operation != value.node {
			output.incomplete = true
			return
		}
		closed := query.awaitFacadeEffects(value, operation, observed.scope.bindings, result)
		output.incomplete = output.incomplete || !closed || receipt.fulfilled.incomplete
		if closed {
			for _, fulfilled := range receipt.fulfilled.values {
				if !query.charge(result, operation) {
					output.incomplete = true
					return
				}
				fulfilled.scope = query.copyCallableScope(fulfilled.scope, result)
				output.values = append(output.values, fulfilled)
			}
		}
		return
	}
	// A raw synchronous object is assimilated at this Await. No successful-value
	// or private transfer follows merely from a noncallable Get result.
	if value.node != nil && ast.IsObjectLiteralExpression(value.node) && len(value.path) == 0 {
		selected := query.settlementThen(&sourceGetInputs{operation: operation, receiver: value}, observed.scope.bindings, result.thenReferences, result.thenIncomplete)
		mergeAccessorCandidates(result, selected.effects)
	}
	if value.node != nil && len(value.path) == 0 && !ast.IsCallExpression(value.node) && !ast.IsPropertyAccessExpression(value.node) && !ast.IsElementAccessExpression(value.node) && !ast.IsObjectLiteralExpression(value.node) {
		// This is the terminal Get of an already acquired raw result. A symbolic
		// projection or unconsumed call cannot replay its earlier producer here.
		// Select each original receiver before supplying the implicit Get. A
		// conditional/logical operand is a relationship, not the actual receiver
		// of every branch's property read. Keep known effects beside refusals.
		selected := query.acquireRequiredProperty(observed, &sourceGetInputs{operation: operation, receiver: value, propertyKey: "then"}, accessorAcquire)
		retainCallableThenEffects(&selected, operation)
		mergeAccessorCandidates(result, selected)
	}
	output.incomplete = true
}

// awaitFacadeEffects owns PromiseResolve's observable constructor Get. Matching
// realm intrinsic identity uses internal PerformPromiseThen, not public then or
// species. A possible mismatch adds wrapping/assimilation MAY effects and unknown.
func (query *sourceValueQuery) awaitFacadeEffects(value sourceValue, operation *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	constructor := query.asyncFacadeGet(value, "constructor", nil, bindings, result)
	closed := len(constructor.values) > 0 && !constructor.opaque && !constructor.valueIncomplete && !constructor.receiverIncomplete && len(constructor.effects) == 0
	for _, selected := range constructor.values {
		if !query.charge(result, operation) {
			closed = false
			break
		}
		closed = closed && selected.native != nil && selected.native.kind == sourceNativePromiseConstructor && !selected.native.referencesIncomplete
	}
	if !closed {
		// A native public then alternative has its own constructor/species/capability
		// operations. Authored then callbacks retain MAY body effects, no interpreter.
		query.promiseFacadeThenEffects(value, operation, bindings, result)
		result.opaque = true
	}
	return closed
}
