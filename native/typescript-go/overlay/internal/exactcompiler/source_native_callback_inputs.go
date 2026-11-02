package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nativeCallbackInputEffects instantiates a selected library callback's source
// demands with possible actual receiver elements. It adds MAY effects only.
// The original native Call owns acquisition and defaults, with no result model,
// runtime method identity, normal entry or callback completion certificate.
func (query *sourceValueQuery) nativeCallbackInputEffects(node *ast.Node, bindings sourceValueBindings, prepared sourcePreparedInvocation, result *accessorCandidates) {
	if !query.dependenciesOnly || !ast.IsCallExpression(node) {
		return
	}
	signature := query.owner.checker.GetResolvedSignature(node)
	if signature == nil {
		return
	}
	declaration := signature.Declaration()
	if declaration == nil || declaration.Kind != ast.KindMethodSignature || callableNameText(declaration.Name()) != "map" || !standardLibrarySource(ast.GetSourceFileOfNode(declaration)) {
		return
	}
	parent := declaration.Parent
	if parent == nil || !ast.IsInterfaceDeclaration(parent) || (callableNameText(parent.Name()) != "Array" && callableNameText(parent.Name()) != "ReadonlyArray") || len(declaration.Parameters()) == 0 {
		return
	}
	if prepared.acquired.sourceCallable {
		possibleNative := false
		for _, value := range prepared.acquired.values {
			possibleNative = possibleNative || value.node == declaration
		}
		if !possibleNative {
			return
		}
	}
	part := accessorCandidates{}
	query.withActiveInvocation(node, func() {
		// This is the real native argument vector, acquired before callback
		// installation. A callback never borrows map's argument positions.
		native := query.bindInputs(declaration, node, bindings, &part)
		callbackSymbol := query.owner.checker.GetSymbolAtLocation(declaration.Parameters()[0].Name())
		if callbackSymbol == nil {
			return
		}
		callbacks := native.bindings[ast.GetSymbolId(callbackSymbol)]
		var argument *ast.Node
		if actuals := restrictedInvocationArguments(node.AsCallExpression()); len(actuals) > 0 {
			argument = actuals[0]
		}
		acquired, noSuccessfulArgument := query.acquireNativeCallbackArgument(node, argument, callbacks, bindings)
		mergeAccessorCandidates(&part, acquired)
		if noSuccessfulArgument {
			return
		}
		noncallable := !acquired.opaque && !acquired.valueIncomplete && !acquired.receiverIncomplete && !acquired.fieldReceiverIncomplete && !acquired.thenIncomplete && sourceValuesNoncallable(acquired.values)
		var elements []sourceValue
		for _, receiver := range native.bindings[0] {
			if !query.charge(&part, receiver.node) {
				break
			}
			get := &sourceGetInputs{operation: node, propertyKey: "*", receiver: receiver}
			if receiver.node != nil && ast.IsArrayLiteralExpression(receiver.node) && len(receiver.path) == 0 && receiver.normal == nil && receiver.native == nil && receiver.acquired == nil {
				get.arrayIndexMay = &sourceArrayIndexMay{owner: query, operation: node, receiver: receiver.node}
			}
			if noncallable && query.arrayIndexMayAtGet(get, receiver.node, []string{"*"}, "", accessorAcquire) {
				continue
			}
			// Unclassified receiver acquisition keeps its existing MAY donors.
			// It is not a numeric-index or complete native length protocol.
			elements = append(elements, query.bindingPropertyAtGet(receiver, "*", bindings, &part, accessorAcquire, get)...)
		}
		if noncallable {
			return
		}
		// Acquisition uncertainty remains an effect residual. It is not a supplied
		// undefined value and cannot itself activate a callback default.
		if len(elements) == 0 {
			elements = []sourceValue{{}}
		}
		for index, value := range acquired.values {
			if !query.charge(&part, value.node) {
				break
			}
			body := value.node
			if len(value.path) != 0 || !query.sourceCallableImplementation(body, &part) {
				continue
			}
			scope := acquired.callableScopes[index]
			prior := query.creators
			query.creators = scope.creators
			inputs := &sourceValueInputs{declaration: body, invocation: node, bindings: make(sourceValueBindings), defaults: make(map[*ast.Node]sourceDefaultInput)}
			for id, values := range scope.bindings {
				if !query.charge(&part, body) {
					break
				}
				inputs.bindings[id] = values
			}
			if !ast.IsArrowFunction(body) {
				inputs.bindings[0] = []sourceValue{{undefined: true}}
				if len(declaration.Parameters()) > 1 {
					if symbol := query.owner.checker.GetSymbolAtLocation(declaration.Parameters()[1].Name()); symbol != nil {
						inputs.bindings[0] = native.bindings[ast.GetSymbolId(symbol)]
					}
				}
			}
			actuals := [][]sourceValue{elements, {{}}, native.bindings[0]}
			position := -1
			for _, parameter := range body.Parameters() {
				if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
					continue
				}
				position++
				if !query.charge(&part, parameter) {
					break
				}
				values := []sourceValue{{undefined: true}}
				if position < len(actuals) {
					values = actuals[position]
				}
				if parameter.AsParameterDeclaration().DotDotDotToken != nil {
					groups := [][]sourceValue{}
					if position < len(actuals) {
						groups = actuals[position:]
					}
					values = []sourceValue{{node: parameter.Name(), rest: groups}}
				}
				query.installParameterInput(parameter, values, inputs, &part)
			}
			query.consumeOrdinaryBody(node, body, inputs.bindings, inputs, nil, &part)
			query.creators = prior
		}
	})
	// The possible callback cannot fulfill any Call, Get, field, descriptor or
	// normal output obligation. Keep donor edges address-only and independent.
	query.adoptConstructionMayEffects(node, part, result)
	result.environmentEffects = append(result.environmentEffects, part.environmentEffects...)
	result.contextEffects = append(result.contextEffects, part.contextEffects...)
}

// sourceArgumentGetProjection borrows one original callback argument Get. The
// selected source completion producer explicitly assesses each getter route.
// No generic empty/incomplete candidate can establish abrupt completion.
// The observer is local to acquisition and never enters an input/output cache.
type sourceArgumentGetProjection struct {
	owner                           *sourceValueQuery
	nativeCall, argument, operation *ast.Node
	receiver                        sourceValue
	key                             string
	routes                          int
	successful, unknown             bool
}

func (query *sourceValueQuery) observeArgumentGetProjection(get *sourceGetInputs, assessment sourceSuccessfulProjection) {
	if !query.dependenciesOnly || get == nil || get.argumentProjection == nil || get.arrayIndexMay != nil || get.receiver.normal != nil || get.receiver.native != nil {
		return
	}
	p := get.argumentProjection
	actual := get.receiver
	if actual.acquired != nil {
		if actual.acquired.inputs != nil || actual.acquired.value.normal != nil || actual.acquired.value.acquired != nil {
			return
		}
		actual = actual.acquired.value
	}
	if p.owner != query || p.nativeCall == nil || !ast.IsCallExpression(p.nativeCall) || p.operation != get.operation || unwrapSourceCallableReference(p.argument) != p.operation || get.propertyKey != p.key || actual.node != p.receiver.node || len(actual.path) != 0 || actual.capture != p.receiver.capture {
		return
	}
	arguments := restrictedInvocationArguments(p.nativeCall.AsCallExpression())
	if len(arguments) == 0 || arguments[0] != p.argument {
		return
	}
	p.routes++
	p.successful = p.successful || assessment.successful
	p.unknown = p.unknown || !assessment.assessed || assessment.unknown
}

// acquireNativeCallbackArgument consumes the existing actual-value plan before
// index access. Only a direct first-argument Get can lend its exact projection
// observer. Nested expressions and missing/foreign/refused routes stay unknown.
// The first argument has no preceding actual whose effects could retarget its
// receiver. The native array receiver remains the earlier acquired alternative.
func (query *sourceValueQuery) acquireNativeCallbackArgument(call, argument *ast.Node, values []sourceValue, bindings sourceValueBindings) (accessorCandidates, bool) {
	result := accessorCandidates{}
	if !query.dependenciesOnly {
		result.opaque = true
		return result, false
	}
	operation := unwrapSourceCallableReference(argument)
	var key string
	if operation != nil && (ast.IsPropertyAccessExpression(operation) || ast.IsElementAccessExpression(operation)) {
		_, key = accessorReceiver(operation)
	}
	allAssessedAbrupt := len(values) > 0
	appendAcquired := func(acquired accessorCandidates) {
		for index, candidate := range acquired.values {
			if !query.charge(&result, candidate.node) {
				allAssessedAbrupt = false
				break
			}
			if scope, present := acquired.callableScopes[index]; present {
				if result.callableScopes == nil {
					result.callableScopes = make(map[int]acquiredCallableScope)
				}
				result.callableScopes[len(result.values)] = scope
			}
			result.values = append(result.values, candidate)
		}
		mergeAccessorCandidates(&result, acquired)
	}
	for _, value := range values {
		if !query.charge(&result, value.node) {
			allAssessedAbrupt = false
			break
		}
		if key == "" || value.node == nil || len(value.path) != 1 || value.path[0] != key || value.normal != nil || value.acquired != nil || value.native != nil {
			allAssessedAbrupt = false
			appendAcquired(query.accessorsAtGet(value.node, nil, "", accessorAcquire, bindings, nil, nil, value))
			continue
		}
		receiver := value
		receiver.path = nil
		scope := query.acquireCallableScope(bindings, &result)
		if receiver.capture != nil {
			scope = *receiver.capture
		}
		receiverEffects := accessorCandidates{}
		receivers := query.acquireRequiredReceivers(sourceObservedValue{value: receiver, scope: scope}, &receiverEffects)
		// An unresolved receiver route cannot disappear merely because another
		// represented getter has no successful source return.
		routeAbrupt := len(receivers) > 0 && !receiverEffects.opaque && !receiverEffects.valueIncomplete && !receiverEffects.receiverIncomplete && !receiverEffects.fieldReceiverIncomplete && !receiverEffects.thenIncomplete
		mergeAccessorCandidates(&result, receiverEffects)
		for _, original := range receivers {
			observer := &sourceArgumentGetProjection{owner: query, nativeCall: call, argument: argument, operation: operation, receiver: original.value, key: key}
			get := &sourceGetInputs{operation: operation, receiver: original.value, propertyKey: key, argumentProjection: observer}
			acquired := query.acquireRequiredPropertyAt(original, get, accessorAcquire)
			noSuccess := observer.routes > 0 && !observer.successful && !observer.unknown && len(acquired.values) == 0 && !acquired.opaque && !acquired.receiverIncomplete && !acquired.fieldReceiverIncomplete && !acquired.thenIncomplete && len(acquired.fieldFallbacks) == 0 && len(acquired.callFallbacks) == 0
			routeAbrupt = routeAbrupt && noSuccess
			appendAcquired(acquired)
		}
		allAssessedAbrupt = allAssessedAbrupt && routeAbrupt
	}
	return result, allAssessedAbrupt && !result.opaque && !result.receiverIncomplete && !result.fieldReceiverIncomplete
}
