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
	taskOwned := false
	if ast.IsCallExpression(operand) {
		raw, present := query.acquireNormalCallResult(operand, result)
		if present {
			found = true
			values = append(values, raw.values...)
			observed.incomplete = observed.incomplete || raw.incomplete
			// Framework task invocation observes its owned result edge. A checked
			// primitive payload adds no caller-owned thenable/member work. Keep
			// the normal value unavailable; child Effects remain on their real edge.
			taskOwned = raw.effects == sourceEffectsTaskOwned && query.primitiveSettlementValue(operand)
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
	if taskOwned {
		observed.effects = sourceEffectsTaskOwned
	}
	result.opaque = result.opaque || observed.incomplete && !taskOwned
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
		get := &sourceGetInputs{operation: operation, receiver: value}
		selected := query.settlementThen(get, observed.scope.bindings, result.thenReferences, result.thenIncomplete)
		query.consumeAwaitThenInputs(get, observed.scope, &selected.effects)
		mergeAccessorCandidates(result, selected.effects)
	}
	if value.node != nil && len(value.path) == 0 && !ast.IsCallExpression(value.node) && !ast.IsPropertyAccessExpression(value.node) && !ast.IsElementAccessExpression(value.node) && !ast.IsObjectLiteralExpression(value.node) {
		// This is the terminal Get of an already acquired raw result. A symbolic
		// projection or unconsumed call cannot replay its earlier producer here.
		// Select each original receiver before supplying the implicit Get. A
		// conditional/logical operand is a relationship, not the actual receiver
		// of every branch's property read. Keep known effects beside refusals.
		get := &sourceGetInputs{operation: operation, receiver: value, propertyKey: "then"}
		selected := query.acquireRequiredProperty(observed, get, accessorAcquire)
		retainCallableThenEffects(&selected, operation)
		query.consumeAwaitThenInputs(get, observed.scope, &selected)
		mergeAccessorCandidates(result, selected)
	}
	output.incomplete = true
}

// awaitFacadeEffects owns PromiseResolve's observable constructor Get. Matching
// realm intrinsic identity uses internal PerformPromiseThen, not public then or
// species. A possible mismatch adds wrapping/assimilation MAY effects and unknown.
func (query *sourceValueQuery) awaitFacadeEffects(value sourceValue, operation *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	constructor := query.acquireImplicitMember(value, "constructor", nil, bindings, result)
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

// immediateScalarPromiseAwaitLookup identifies only the constructor lookup of a
// fresh standard Promise.resolve result consumed directly by its original Await.
// The installed receipt owns scalar evaluation; standard semantics exclude
// hypothetical foreign prototype corruption. Actual indexed replacements and
// descriptor/Get effects still pass through the ordinary member owner. This is
// lookup admission, never a completed Get, fulfillment or lifetime receipt.
func (query *sourceValueQuery) immediateScalarPromiseAwaitLookup(get *sourceGetInputs, key string) bool {
	if get == nil || get.operation == nil || !ast.IsAwaitExpression(get.operation) || key != "constructor" || len(get.receiver.path) != 0 || get.receiver.native == nil || get.receiver.native.kind != sourceNativePromiseFacade {
		return false
	}
	receipt, context := get.receiver.native.resolve, query.returnObservation
	if receipt == nil || context == nil || context.kind != sourceRawNormalResult || context.reader != get.operation || context.frame != query.inputs || query.inputs == nil || query.inputs.operationLifetime == nil || context.owner != query.inputs.declaration {
		return false
	}
	if receipt.frame != query.inputs || receipt.owner != context.owner || receipt.operation != get.receiver.node || get.receiver.native.acquired != receipt.operation || unwrapSourceCallableReference(get.operation.AsAwaitExpression().Expression) != receipt.operation || receipt.incomplete || !receipt.scalarInput {
		return false
	}
	for _, issued := range context.receipts {
		if issued == receipt {
			return true
		}
	}
	return false
}

// sourceAwaitThenInputs lends only this original Await's selected then binder.
// Parameter nodes denote supplied protocol functions only during this interval;
// no live issuer or inputs are stored in source values or cached callable facts.
type sourceAwaitThenInputs struct {
	issuer      *sourceValueQuery
	owner       *sourceValueOwner
	generation  *projectGeneration
	observation *sourceReturnObservation
	lifetime    *sourceNormalOperationLifetime
	get         *sourceGetInputs
	inputs      *sourceValueInputs
}

// consumeAwaitThenInputs instantiates conditional Effects, never a normal then
// invocation or fulfilled result. The existing descriptor observation already
// selected each callable under its receiver/capture scope. Unknown alternatives
// and the enclosing Await's incomplete result remain independent.
func (query *sourceValueQuery) consumeAwaitThenInputs(get *sourceGetInputs, scope acquiredCallableScope, selected *accessorCandidates) {
	observation := query.returnObservation
	if get == nil || get.operation == nil || !ast.IsAwaitExpression(get.operation) || observation == nil || observation.kind != sourceRawNormalResult || observation.reader != get.operation || observation.frame == nil || observation.frame != query.inputs || observation.owner != query.inputs.declaration || enclosingCallableNode(get.operation) != observation.owner || query.inputs.operationLifetime == nil {
		return
	}
	generation := query.owner.generation
	if generation == nil || !generation.active || generation.program != query.owner.program || generation.checker != query.owner.checker || !query.currentAwaitSource(get.operation) {
		return
	}
	// Capture the original selection population before body Effects append values.
	count := len(selected.values)
	for index := 0; index < count; index++ {
		value := selected.values[index]
		body := value.node
		if body == nil || len(value.path) != 0 || !ast.IsFunctionLike(body) || body.Body() == nil {
			continue
		}
		if _, ordinary := ordinaryResultCategory(body); !ordinary {
			continue // A generator's dormant body is not invoked by the protocol.
		}
		source := ast.GetSourceFileOfNode(body)
		if source == nil || source.IsDeclarationFile || query.owner.program.GetSourceFile(source.FileName()) != source || !query.charge(selected, body) {
			continue
		}
		captures := scope
		if value.capture != nil {
			captures = *value.capture
		} else if acquired, present := selected.callableScopes[index]; present {
			captures = acquired
		}
		func() {
			priorInputs, priorOperation, priorReturn := query.inputs, query.operation, query.returnObservation
			priorDependency, priorCreators, priorIssuer := query.dependenciesOnly, query.creators, query.awaitThenInputs
			defer func() {
				query.inputs, query.operation, query.returnObservation = priorInputs, priorOperation, priorReturn
				query.dependenciesOnly, query.creators, query.awaitThenInputs = priorDependency, priorCreators, priorIssuer
			}()
			// The source body visitor owns its ordinary Gets, arguments and Throws.
			// It cannot borrow the normal frame's output/storage authority.
			query.dependenciesOnly, query.operation, query.returnObservation = true, nil, nil
			query.creators = captures.creators
			contribution := accessorCandidates{}
			inputs := query.resolverInputs(body, captures.bindings, get.receiver, &contribution)
			query.awaitThenInputs = &sourceAwaitThenInputs{issuer: query, owner: query.owner, generation: generation, observation: observation, lifetime: priorInputs.operationLifetime, get: get, inputs: inputs}
			query.consumeSourceBodyEffects(get.operation, body, inputs.bindings, inputs, nil, &contribution)
			// Only Effects/debts travel back; no conditional body output is an
			// Await value or an independently usable callable selection.
			contribution.values, contribution.callableScopes = nil, nil
			mergeAccessorCandidates(selected, contribution)
		}()
	}
}

// awaitThenResolver validates the installed binder, not a spelling/signature or
// generic membership in a then method. Original live-value selection still owns
// reassignment and unknown alternatives before this acquired parameter arrives.
func (query *sourceValueQuery) awaitThenResolver(node *ast.Node) (bool, bool) {
	borrow := query.awaitThenInputs
	if borrow == nil || borrow.issuer != query || borrow.owner != query.owner || !query.dependenciesOnly || borrow.inputs == nil || query.inputs != borrow.inputs || borrow.inputs.declaration == nil || borrow.get == nil || borrow.get.operation == nil || borrow.observation == nil || borrow.observation.frame == nil || borrow.observation.reader != borrow.get.operation || borrow.observation.frame.operationLifetime != borrow.lifetime || borrow.lifetime == nil {
		return false, false
	}
	generation := borrow.generation
	if generation == nil || !generation.active || query.owner.generation != generation || query.owner.program != generation.program || query.owner.checker != generation.checker {
		return false, false
	}
	body, operation := borrow.inputs.declaration, borrow.get.operation
	call := query.normalBindingCall
	if call == nil || !ast.IsCallExpression(call) || enclosingCallableNode(call) != body || !query.currentAwaitSource(call) {
		return false, false
	}
	source := ast.GetSourceFileOfNode(body)
	if source == nil || query.owner.program.GetSourceFile(source.FileName()) != source || !query.currentAwaitSource(operation) || !ast.IsAwaitExpression(operation) || enclosingCallableNode(operation) != borrow.observation.owner || borrow.observation.frame.declaration != borrow.observation.owner {
		return false, false
	}
	if node != nil && ast.IsIdentifier(node) {
		symbol := query.owner.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return false, false
		}
		node = symbol.ValueDeclaration
	}
	position := 0
	for _, parameter := range body.Parameters() {
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		if position >= 2 {
			break
		}
		if node == parameter && ast.IsIdentifier(parameter.Name()) && parameter.AsParameterDeclaration().DotDotDotToken == nil {
			symbol := query.owner.checker.GetSymbolAtLocation(parameter.Name())
			if symbol == nil {
				return false, false
			}
			values := borrow.inputs.bindings[ast.GetSymbolId(symbol)]
			return position == 1, len(values) == 1 && values[0].node == parameter && len(values[0].path) == 0
		}
		position++
	}
	return false, false
}

// currentAwaitSource rejects a detached or replaced operation before supplying
// protocol input roles. It describes current source, never Await completion.
func (query *sourceValueQuery) currentAwaitSource(operation *ast.Node) bool {
	if operation == nil || query.owner == nil || query.owner.program == nil {
		return false
	}
	source := ast.GetSourceFileOfNode(operation)
	return source != nil && query.owner.program.GetSourceFile(source.FileName()) == source
}
