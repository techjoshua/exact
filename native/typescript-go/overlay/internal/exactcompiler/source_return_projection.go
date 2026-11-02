package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// projectSourceCallReturns consumes the ordinary selected-body/input relation.
// Each alternative keeps its acquired creating scope through the callback. This
// observes parameterized return syntax without executing bodies or publishing
// a normal Call/Get output, mutation delta or completion receipt.
func (query *sourceValueQuery) projectSourceCallReturns(call *ast.Node, bindings sourceValueBindings, project func(sourceValue, sourceValueBindings), deferred func()) accessorCandidates {
	selected := false
	result := query.consumeInvocation(call, bindings, sourceInvocationConsumer{
		selection:    func(complete bool) { selected = complete },
		sourceReturn: project,
		body: func(body *ast.Node, captures sourceValueBindings, inputs *sourceValueInputs, invocation *ast.Node, part *accessorCandidates) {
			query.projectSelectedSourceReturns(body, call, captures, inputs, part, project, deferred)
		},
		resolver: func(_ *ast.Node, _ []*ast.Node, _ bool, _ sourceValueBindings, part *accessorCandidates) {
			part.valueIncomplete = true
		},
	})
	if !selected {
		result.opaque = true
	}
	return result
}

// projectSelectedSourceReturns shares parameterized return relationships between
// selected Call and Get inputs. It issues no output or execution capability.
func (query *sourceValueQuery) projectSelectedSourceReturns(body, operation *ast.Node, captures sourceValueBindings, inputs *sourceValueInputs, part *accessorCandidates, project func(sourceValue, sourceValueBindings), deferred func()) sourceSuccessfulProjection {

	if body == nil || body.Body() == nil {
		part.opaque = true
		return sourceSuccessfulProjection{}
	}
	if _, ordinary := ordinaryResultCategory(body); !ordinary {
		deferred()
		return sourceSuccessfulProjection{}
	}
	if query.dependenciesOnly {
		// Return reachability consumes the same selected source inputs as body
		// demands. Keep that acquisition active through predicate and value
		// projection, so a binding's initializer cannot reacquire its own pending
		// return under another copy of the same captures.
		release, fresh := query.enterDependencyBody(body, captures, inputs, operation, part)
		defer release()
		if !fresh {
			part.opaque, part.valueIncomplete = true, true
			return sourceSuccessfulProjection{}
		}
		previous, had := query.active[body]
		query.active[body] = true
		defer func() {
			if had {
				query.active[body] = previous
			} else {
				delete(query.active, body)
			}
		}()
	}
	previousInputs, previousReturn, previousFresh := query.inputs, query.returning, query.freshReturnCall
	query.inputs, query.freshReturnCall = inputs, nil
	defer func() {
		query.inputs, query.returning, query.freshReturnCall = previousInputs, previousReturn, previousFresh
	}()
	if query.creators == nil {
		query.creators = make(map[*ast.Node]sourceValueCreation)
	}
	previousCreator, hadCreator := query.creators[body]
	defer func() {
		if hadCreator {
			query.creators[body] = previousCreator
		} else {
			delete(query.creators, body)
		}
	}()
	query.creators[body] = sourceValueCreation{invocation: operation}
	observed := sourceResultObservation{}
	assessment := query.consumeSuccessfulCompletions(body, captures, &observed, part, func(site, returned *ast.Node) {
		query.returning = returned
		query.creators[body] = sourceValueCreation{invocation: operation, returning: returned}
		if returned == nil {
			project(sourceValue{undefined: true}, captures)
		} else {
			project(sourceValue{node: returned}, captures)
		}
	})
	part.valueIncomplete = part.valueIncomplete || observed.incomplete
	return assessment
}
