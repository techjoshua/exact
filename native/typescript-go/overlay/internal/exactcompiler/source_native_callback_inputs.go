package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

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
	actuals := restrictedInvocationArguments(node.AsCallExpression())
	var entryPattern *ast.Node
	freshPrivateEntries := false
	if len(actuals) == 1 && query.owner.directEntriesMap(node.Expression()) == declaration {
		freshPrivateEntries = entriesMapIdentityCallback(actuals[0], query.owner.checker)
		if !freshPrivateEntries {
			entryPattern, freshPrivateEntries = query.owner.directEntriesMapReturnPair(node, actuals[0])
		}
	}
	literal := directDenseArrayMap(node, query.owner.checker)
	var items []*ast.Node
	if literal != nil {
		items = literal.AsArrayLiteralExpression().Elements.Nodes
	}
	// A fresh singleton's only indexed Get occurs before any callback can
	// mutate its array argument. Keep non-primitive inputs with the existing
	// member visitor, which owns their identity and possible accessor work.
	accountedInput := literal != nil && len(items) == 0
	primitiveSingleton := len(items) == 1 && checkedPrimitiveOperand(items[0], query.owner.checker)
	part := accessorCandidates{}
	query.withActiveInvocation(node, func() {
		// This is the real native argument vector, acquired before callback
		// installation. A callback never borrows map's argument positions.
		native := query.bindInputs(declaration, node, bindings, &part)
		if accountedInput {
			return
		}
		callbackSymbol := query.owner.checker.GetSymbolAtLocation(declaration.Parameters()[0].Name())
		if callbackSymbol == nil {
			return
		}
		callbacks := native.bindings[ast.GetSymbolId(callbackSymbol)]
		var argument *ast.Node
		if len(actuals) > 0 {
			argument = actuals[0]
		}
		acquired, noSuccessfulArgument := query.acquireNativeCallbackArgument(node, argument, callbacks, bindings)
		mergeAccessorCandidates(&part, acquired)
		if noSuccessfulArgument {
			return
		}
		noncallable := !acquired.opaque && !acquired.valueIncomplete && !acquired.receiverIncomplete && !acquired.fieldReceiverIncomplete && !acquired.thenIncomplete && sourceValuesNoncallable(acquired.values)
		var keyParameter, confinedArray *ast.Node
		inlineCallback := len(actuals) == 1 && ast.IsArrowFunction(unwrapSourceCallableReference(argument))
		if len(actuals) == 1 && len(acquired.values) == 1 && len(acquired.values[0].path) == 0 && query.operation == nil && query.returnObservation == nil {
			keyParameter = query.mapIndexParameter(acquired.values[0].node)
		}
		if (inlineCallback || keyParameter != nil) && query.operation == nil && query.returnObservation == nil {
			confinedArray = query.confinedMapArray(node, native.bindings[0])
			if inlineCallback && confinedArray != nil && len(confinedArray.AsArrayLiteralExpression().Elements.Nodes) == 0 {
				return
			}
		}
		var elements []sourceValue
		frozenKeys := false
		for _, receiver := range native.bindings[0] {
			if primitiveSingleton && len(native.bindings[0]) == 1 && receiver.node == literal && len(receiver.path) == 0 && receiver.normal == nil && receiver.native == nil && receiver.acquired == nil {
				accountedInput = true
				elements = append(elements, sourceValue{node: items[0], capture: receiver.capture})
				break
			}
			if freshPrivateEntries {
				break
			}
			if (inlineCallback || keyParameter != nil) && len(native.bindings[0]) == 1 {
				if frozen, known := query.frozenMapKeyElements(receiver, keyParameter != nil, &part); known {
					if len(frozen) == 0 {
						return
					}
					elements, frozenKeys = frozen, true
					break
				}
			}
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
			scope, scoped := acquired.callableScopes[index]
			if !scoped && value.capture != nil {
				scope = *value.capture
			}
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
				if freshPrivateEntries && entryPattern != nil && body == argument && parameter.Name() == entryPattern {
					// The standard entries algorithm creates the pair and supplies
					// both slots. Its value can remain unknown until it is used.
					for _, element := range entryPattern.AsBindingPattern().Elements.Nodes {
						if ast.IsBindingElement(element) {
							query.bindInputPattern(element.Name(), []sourceValue{{}}, inputs.bindings, &part, accessorAcquire, inputs)
						}
					}
				} else if parameter.AsParameterDeclaration().DotDotDotToken == nil && (position == 1 || position == 2) {
					query.bindDefinedParameterInput(parameter, values, inputs, &part)
				} else {
					query.installParameterInput(parameter, values, inputs, &part)
				}
			}
			if keyParameter != nil && body == keyParameter.Parent && (frozenKeys || confinedArray != nil) {
				inputs.mapKey = mapKeyInput(keyParameter, elements)
			}
			first := len(part.effects)
			query.consumeOrdinaryBody(node, body, inputs.bindings, inputs, nil, &part)
			// Keep only the actual acquired callback's effect association. Its
			// scope/bindings/throw handling above remain owned by this producer.
			for i := first; i < len(part.effects); i++ {
				if part.effects[i].declaration == body && part.effects[i].operation == node {
					part.effects[i].arrayMapCall = node
				}
			}
			query.creators = prior
		}
	})
	// The possible callback cannot fulfill any Call, Get, field, descriptor or
	// normal output obligation. Keep donor edges address-only and independent.
	if freshPrivateEntries {
		result.valueIncomplete = true
		if part.opaque || part.receiverIncomplete || part.fieldReceiverIncomplete ||
			len(part.fieldFallbacks) != 0 || len(part.callFallbacks) != 0 || len(part.descriptorFallbacks) != 0 {
			result.opaque = true
			if result.cause == nil {
				result.cause = part.cause
				if result.cause == nil {
					result.cause = node
				}
			}
		}
		query.adoptSourceMayEffects(node, part, result)
	} else if accountedInput {
		// Keep callback effects and unresolved input alternatives independent
		// of the intentionally unmodeled map result.
		result.valueIncomplete = true
		result.opaque = result.opaque || part.opaque || part.receiverIncomplete || part.fieldReceiverIncomplete
		result.fieldFallbacks = append(result.fieldFallbacks, part.fieldFallbacks...)
		result.callFallbacks = append(result.callFallbacks, part.callFallbacks...)
		result.descriptorFallbacks = append(result.descriptorFallbacks, part.descriptorFallbacks...)
		query.adoptSourceMayEffects(node, part, result)
	} else {
		query.adoptConstructionMayEffects(node, part, result)
	}
	result.environmentEffects = append(result.environmentEffects, part.environmentEffects...)
	result.contextEffects = append(result.contextEffects, part.contextEffects...)
}

// entriesMapIdentityCallback keeps the private numeric Gets separate from the
// enclosing use of map's result. Returning the entry unchanged preserves its
// data slots. Other callback results may carry authored getters to a consumer.
func entriesMapIdentityCallback(callback *ast.Node, c *checker.Checker) bool {
	if !ast.IsArrowFunction(callback) || len(callback.Parameters()) != 1 || ast.HasSyntacticModifier(callback, ast.ModifierFlagsAsync) {
		return false
	}
	parameter := callback.Parameters()[0].AsParameterDeclaration()
	if parameter.DotDotDotToken != nil || !ast.IsIdentifier(parameter.Name()) || parameter.Initializer != nil {
		return false
	}
	value := unwrapSourceCallableReference(callback.Body())
	return ast.IsIdentifier(value) && c.GetSymbolAtLocation(value) == c.GetSymbolAtLocation(parameter.Name())
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
