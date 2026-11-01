package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceMemberWriterReadCut retains the original dependency consumer while
// alias acquisition visits an earlier New or return. It is source-only and
// query-local. Its scope is copied, never a normal input frame or identity proof.
type sourceMemberWriterReadCut struct {
	operation, use *ast.Node
	scope          acquiredCallableScope
}

func (q *sourceValueQuery) memberWriterReadCut(reference *sourceGetReference, bindings sourceValueBindings, result *accessorCandidates) *sourceMemberWriterReadCut {
	if !q.dependenciesOnly {
		return nil
	}
	operation := q.reading
	if reference != nil {
		operation = reference.operation
	}
	use := q.reading
	if use == nil {
		use = operation
	}
	return &sourceMemberWriterReadCut{operation: operation, use: use, scope: q.acquireCallableScope(bindings, result)}
}

// memberWriterRead lends the immutable reader cut only for source ordering.
// A factory's temporary return/acquisition cut cannot stand in for this use.
func (q *sourceValueQuery) memberWriterRead(cut *sourceMemberWriterReadCut) func() {
	if cut == nil {
		return func() {}
	}
	reading, initializing, returning := q.reading, q.initializing, q.returning
	q.reading, q.returning = cut.use, nil
	return func() { q.reading, q.initializing, q.returning = reading, initializing, returning }
}

// sourceMemberWriterInput retains one original Call's symbolic source bindings.
// It is query-local projection data, never a normal frame or completed Call.
type sourceMemberWriterInput struct {
	call       *ast.Node
	scope      acquiredCallableScope
	incomplete bool
}

// memberWriterInputs uses the ordinary selection/input owner without consuming
// any body. Argument/default effects remain with the original Call. Each body
// alternative keeps its own Call and creating bindings through alias matching.
func (q *sourceValueQuery) memberWriterInputs(left *ast.Node, bindings sourceValueBindings, result *accessorCandidates, cut *sourceMemberWriterReadCut) []sourceMemberWriterInput {
	writer := enclosingCallableNode(left)
	if !q.dependenciesOnly || writer == nil || writer == enclosingCallableNode(q.reading) || ast.IsGetAccessorDeclaration(writer) || ast.IsSetAccessorDeclaration(writer) || ast.IsConstructorDeclaration(writer) {
		return []sourceMemberWriterInput{{scope: acquiredCallableScope{bindings: bindings, creators: q.creators}}}
	}
	var alternatives []sourceMemberWriterInput
	seen := make(map[*ast.Node]bool)
	for _, index := range q.occurrenceSourceView(left, result) {
		for _, call := range index.calls {
			if seen[call] || q.active[call] || q.pendingWriterInputExcluded(call, result) || q.afterRead(call) {
				continue
			}
			if cut != nil && cut.use != nil && q.precedes(cut.use, call, cut.scope.bindings) {
				continue
			}
			seen[call] = true
			if possible, _ := q.reachable(call, bindings); !possible {
				continue
			}
			caller := enclosingCallableNode(call)
			if caller != nil && caller != enclosingCallableNode(q.reading) && q.creators[caller].invocation == nil {
				continue
			}
			start := len(alternatives)
			complete, bodySeen := false, false
			previousInitializing := q.initializing
			q.initializing = call
			invocation := accessorCandidates{}
			q.withActiveInvocation(call, func() {
				invocation = q.consumeInvocation(call, bindings, sourceInvocationConsumer{
					selection: func(value bool) { complete = value },
					body: func(body *ast.Node, bound sourceValueBindings, inputs *sourceValueInputs, _ *ast.Node, part *accessorCandidates) {
						if body != writer {
							return
						}
						bodySeen = true
						if _, ordinary := ordinaryResultCategory(body); !ordinary {
							return
						}
						defaults, isDefault := q.defaultInput(inputs, left, part)
						if isDefault {
							if defaults.bindings == nil {
								return
							}
							bound = defaults.bindings
						}
						if possible, _ := q.reachable(left, bound); !possible {
							return
						}
						bound = q.memberWriterActualValues(body, call, bound, part)
						scope := q.acquireCallableScope(bound, part)
						scope.creators[writer] = sourceValueCreation{invocation: call}
						alternatives = append(alternatives, sourceMemberWriterInput{call: call, scope: scope, incomplete: part.opaque || part.receiverIncomplete || part.valueIncomplete})
					},
					resolver: func(*ast.Node, []*ast.Node, bool, sourceValueBindings, *accessorCandidates) {},
				})
			})
			q.initializing = previousInitializing
			if !complete && !bodySeen && (invocation.opaque || invocation.valueIncomplete || invocation.receiverIncomplete) {
				// A refused input domain can still expose this actual source
				// callable. Keep its captures and MAY write, never invent arguments.
				for _, scope := range q.refusedMemberWriterScopes(writer, call, bindings, result) {
					alternatives = append(alternatives, sourceMemberWriterInput{scope: scope, incomplete: true})
					result.opaque = true
				}
			}
			for i := start; i < len(alternatives); i++ {
				alternatives[i].incomplete = alternatives[i].incomplete || !complete
			}
		}
	}
	return alternatives
}

// memberWriterScope lends only source relationships during one indexed write.
// Restoring the reader context prevents another Call from borrowing this scope.
func (q *sourceValueQuery) memberWriterScope(input sourceMemberWriterInput, consume func()) {
	previous := q.creators
	q.creators = input.scope.creators
	defer func() { q.creators = previous }()
	consume()
}

// memberWriterActualValues projects already-acquired formal arguments at their
// original Call cut. Only value relationships escape. Get/argument/body effects
// stay at the Call and are never republished at the later member observation.
func (q *sourceValueQuery) memberWriterActualValues(body, call *ast.Node, bindings sourceValueBindings, result *accessorCandidates) sourceValueBindings {
	bound := make(sourceValueBindings, len(bindings))
	for id, values := range bindings {
		bound[id] = values
	}
	reading, initializing, returning := q.reading, q.initializing, q.returning
	q.reading, q.initializing, q.returning = call, call, nil
	defer func() { q.reading, q.initializing, q.returning = reading, initializing, returning }()
	for _, parameter := range body.Parameters() {
		for _, name := range bindingIdentifiers(parameter.Name()) {
			if !q.charge(result, name) {
				return bound
			}
			symbol := q.owner.checker.GetSymbolAtLocation(name)
			if symbol == nil {
				continue
			}
			id := ast.GetSymbolId(symbol)
			var projected []sourceValue
			for _, value := range bound[id] {
				if len(value.path) == 0 {
					projected = append(projected, value)
					continue
				}
				part := q.accessorsAtGetOutput(nil, nil, "", accessorAcquire, bindings, nil, nil, nil, nil, value)
				result.valueIncomplete = result.valueIncomplete || part.opaque || part.valueIncomplete || part.receiverIncomplete
				for i, term := range part.values {
					if scope, ok := part.callableScopes[i]; ok {
						term.capture = &scope
					}
					projected = append(projected, term)
				}
				if len(part.values) == 0 {
					projected = append(projected, sourceValue{})
				}
			}
			bound[id] = projected
		}
	}
	return bound
}

// refusedMemberWriterScopes retains only represented source callables exposed
// at this original Call. A bodyless signature or an unrelated indexed function
// cannot supply a writer. Foreign invocation arguments and receiver stay unknown.
func (q *sourceValueQuery) refusedMemberWriterScopes(writer, call *ast.Node, bindings sourceValueBindings, result *accessorCandidates) []acquiredCallableScope {
	if writer == nil || !ast.IsFunctionLike(writer) || writer.Body() == nil {
		return nil
	}
	reading, initializing, returning := q.reading, q.initializing, q.returning
	q.reading, q.initializing, q.returning = call, call, nil
	defer func() { q.reading, q.initializing, q.returning = reading, initializing, returning }()
	var scopes []acquiredCallableScope
	retain := func(part accessorCandidates) {
		for i, value := range part.values {
			if value.node != writer || len(value.path) != 0 {
				continue
			}
			scope := q.acquireCallableScope(bindings, result)
			if value.capture != nil {
				scope = q.copyCallableScope(*value.capture, result)
			} else if captured, ok := part.callableScopes[i]; ok {
				scope = q.copyCallableScope(captured, result)
			}
			for _, parameter := range writer.Parameters() {
				for _, name := range bindingIdentifiers(parameter.Name()) {
					if !q.charge(result, name) {
						return
					}
					if symbol := q.owner.checker.GetSymbolAtLocation(name); symbol != nil {
						delete(scope.bindings, ast.GetSymbolId(symbol))
					}
				}
			}
			if !ast.IsArrowFunction(writer) {
				delete(scope.bindings, 0)
			}
			delete(scope.creators, writer)
			scopes = append(scopes, scope)
		}
	}
	q.withActiveInvocation(call, func() {
		retain(q.receiverCandidates(call, bindings))
		if args := call.AsCallExpression().Arguments; args != nil {
			for _, argument := range args.Nodes {
				if !q.charge(result, argument) {
					return
				}
				retain(q.accessors(argument, nil, "", accessorAcquire, bindings, nil))
			}
		}
	})
	return scopes
}
