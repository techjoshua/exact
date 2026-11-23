package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// reflectiveSourceGet selects an installed getter from its definition's source
// inputs. Selection does not republish earlier descriptor/argument Gets. Each
// selected body keeps its captures, without a normal Get lease or output.
// The shared Get owner separates input/body effects from returned values.
func (query *sourceValueQuery) reflectiveSourceGet(expression, definition *ast.Node, key string, actualGet *sourceGetInputs, bindings sourceValueBindings, result *accessorCandidates) {
	selected := query.reflectiveGetterCandidates(expression, definition, bindings)
	// Unknown callable alternatives retain their own invocation uncertainty.
	// Definition-time selection effects belong to the earlier operation.
	result.opaque = true
	result.valueIncomplete = result.valueIncomplete || selected.valueIncomplete
	result.receiverIncomplete = result.receiverIncomplete || selected.receiverIncomplete
	for i, value := range selected.values {
		body := value.node
		if len(value.path) != 0 || body == nil || !ast.IsFunctionLike(body) || body.Body() == nil {
			result.valueIncomplete = true
			continue
		}
		scope := query.acquireCallableScope(bindings, result)
		if value.capture != nil {
			scope = query.copyCallableScope(*value.capture, result)
		} else if captured, ok := selected.callableScopes[i]; ok {
			scope = query.copyCallableScope(captured, result)
		}
		query.memberWriterScope(sourceMemberWriterInput{scope: scope}, func() {
			// A later projection cannot lend its receiver to this earlier field.
			// Arrows retain lexical this through the shared Get input owner.
			var operation *ast.Node
			receiver := sourceValue{}
			if actualGet != nil && (actualGet.originalReflectRead || actualGet.freshDescriptorEffects) && actualGet.propertyKey == key {
				operation, receiver = actualGet.operation, actualGet.receiver
			} else if actualGet != nil && actualGet.operation != nil && (ast.IsPropertyAccessExpression(actualGet.operation) || ast.IsElementAccessExpression(actualGet.operation)) {
				_, observedKey := accessorReceiver(actualGet.operation)
				if observedKey != "" && observedKey == key {
					operation, receiver = actualGet.operation, actualGet.receiver
				}
			}
			get := &sourceGetInputs{operation: operation, receiver: receiver}
			if actualGet != nil && actualGet.freshDescriptorEffects && actualGet.propertyKey == key {
				// The discarded fresh definition needs the actual receiver and body
				// effects. No consumer acquires this descriptor field's value.
				get.freshDescriptorEffects = true
				query.executeGetEffects(body, get, scope, result)
				return
			}
			observed := query.acquireGetResult(body, get, scope, result)
			result.valueIncomplete = result.valueIncomplete || observed.incomplete
			for _, returned := range observed.values {
				term, captured := returned.value, returned.scope
				term.capture = &captured
				result.values = append(result.values, term)
			}
		})
	}
}

// reflectiveGetterCandidates selects the getter at installation time with its original captures.
func (query *sourceValueQuery) reflectiveGetterCandidates(expression, definition *ast.Node, bindings sourceValueBindings) accessorCandidates {
	selected := accessorCandidates{}
	if ast.IsFunctionLike(expression) {
		selected.values = []sourceValue{{node: expression}}
	} else {
		func() {
			reading, initializing, returning := query.reading, query.initializing, query.returning
			defer func() { query.reading, query.initializing, query.returning = reading, initializing, returning }()
			query.reading, query.initializing, query.returning = definition, definition, nil
			query.withActiveInvocation(definition, func() {
				selected = query.accessors(expression, nil, "", accessorAcquire, bindings, nil)
			})
		}()
	}
	return selected
}
