package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// bindingReadBoundary separates acquisition and in-owner invocation from a later
// invocation of a returned capture. The latter observes the creating activation's
// completion, including return-expression evaluation and enclosing finally blocks.
func (query *sourceValueQuery) bindingReadBoundary(symbol *ast.Symbol, read *ast.Node) (*ast.Node, bool) {
	for _, declaration := range symbol.Declarations {
		owner := enclosingCallableNode(declaration)
		for _, at := range []*ast.Node{query.initializing, query.invoking, query.returning, read} {
			if at != nil && enclosingCallableNode(at) == owner {
				return at, false
			}
		}
		if returned := query.creators[owner].returning; returned != nil {
			return returned, true
		}
	}
	return query.initializing, false
}

// sourceValueReplacement retains a query-local replacement candidate. A certain
// write owns its whole assignment, distinct from acquiring its left reference.
// Uncertain descriptor operations never gain completed-assignment authority.
type sourceValueReplacement struct {
	at, operation *ast.Node
	values        []sourceValue
	bindings      sourceValueBindings
	certain       bool
	unordered     bool // Source Call selected, but its write timing is not proved.
}

// mergeReplacements discards a value only after a definitely performed replacement
// completes later. The same relation owns binding and own-member writes. Incomplete
// order or proof budget preserves the supplied conservative join and initializer.
func (query *sourceValueQuery) mergeReplacements(values []sourceValue, replacements []sourceValueReplacement, result *accessorCandidates) ([]sourceValue, bool) {
	// Find a last certain write across every writer, not within each declaration.
	// Incomparable certain occurrences retain the conservative alternatives.
	before := func(first, second sourceValueReplacement) bool {
		if first.unordered || second.unordered {
			return false
		}
		if first.at == second.at {
			// Certainty supplies execution, not mutation order. Compare complete
			// operations, including their RHS. A completed RHS assignment precedes
			// its enclosing PutValue. Other overlap retains the conservative join.
			if !first.certain || !second.certain || ast.GetSourceFileOfNode(first.operation) != ast.GetSourceFileOfNode(second.operation) || enclosingCallableNode(first.operation) != enclosingCallableNode(second.operation) {
				return false
			}
			return first.operation.End() <= second.operation.Pos() || query.charge(result, first.operation) && second.operation.AsBinaryExpression().Right.Contains(first.operation)
		}
		return query.precedes(first.at, second.at, second.bindings)
	}
	last, ordered := -1, true
	for i, change := range replacements {
		if !change.certain {
			continue
		}
		if last < 0 || before(replacements[last], change) {
			last = i
		} else if !before(change, replacements[last]) {
			ordered = false
		}
	}
	if last >= 0 && ordered {
		var merged []sourceValue
		for i, change := range replacements {
			if i == last || !before(change, replacements[last]) {
				merged = append(merged, change.values...)
			}
		}
		{
			return merged, true
		}
	}

	return values, false
}

// liveValues joins source assignments to one creating site. Sibling writes carry their
// actual invocation and body occurrence. Only proved later replacements supersede earlier
// values across all writers. Unordered and unresolved routes retain their alternatives.
// This relation never creates a dynamic invocation identity or recursively nested context.
func (query *sourceValueQuery) liveValues(symbol *ast.Symbol, entry []sourceValue, read *ast.Node, bindings sourceValueBindings, result *accessorCandidates) []sourceValue {
	return query.bindingValues(symbol, entry, nil, read, bindings, result)
}

// bindingValues permits source entry acquisition to wait until current-write selection.
// A proved replacement needs no obsolete entry value. The initializer's execution
// effects remain owned by its original body demand, never by this later value read.
// Eager callers retain their acquired entry and consumed-write associations.
func (query *sourceValueQuery) bindingValues(symbol *ast.Symbol, entry []sourceValue, acquire func() []sourceValue, read *ast.Node, bindings sourceValueBindings, result *accessorCandidates) []sourceValue {
	entryValues := func() []sourceValue {
		if acquire != nil {
			return acquire()
		}
		return entry
	}
	// A declaration-only variable can be assigned in the current executable source.
	// The declaration supplies no body. Source ordering must prove replacement.
	valueDeclaration := symbol.ValueDeclaration
	ambient := valueDeclaration != nil && ast.IsVariableDeclaration(valueDeclaration) && ast.GetSourceFileOfNode(valueDeclaration).IsDeclarationFile
	if ambient && read != nil {
		if values, proved := query.numericBindingReplacement(symbol, read, bindings, result); proved {
			return values
		}
	}
	if !query.owner.bindingWritten(symbol) && (!ambient || read == nil || len(query.owner.index(ast.GetSourceFileOfNode(read)).bindings[ast.GetSymbolId(symbol)]) == 0) {
		return entryValues()
	}
	// Only same-owner writes use the live capture's invocation/return boundary.
	// Applying it to sibling searches would hide writes after the factory returned.
	boundary, completed := query.bindingReadBoundary(symbol, read)
	previous := query.initializing
	reader := enclosingCallableNode(read)
	if reader != nil && (query.initializing == nil || enclosingCallableNode(query.initializing) != reader) && (query.returning == nil || enclosingCallableNode(query.returning) != reader) {
		for _, declaration := range symbol.Declarations {
			if enclosingCallableNode(declaration) == reader {
				query.initializing = read
				break
			}
		}
	}
	defer func() { query.initializing = previous }()
	id := ast.GetSymbolId(symbol)
	if query.live == nil {
		query.live = make(map[ast.SymbolId]bool)
	}
	if query.live[id] {
		result.opaque = true
		query.owner.widenings++
		return entryValues()
	}
	query.live[id] = true
	defer delete(query.live, id)
	values := append([]sourceValue{}, entry...)
	if acquire == nil {
		values = append(values, query.consumedWriteValues(symbol, entry, result)...)
	}
	// Keep the conservative join until all relevant writers have been acquired.
	// Declaration order is not execution order across sibling method bodies.
	var replacements []sourceValueReplacement
	add := func(at, operation *ast.Node, next []sourceValue, bound sourceValueBindings, certain bool) {
		// Preserve the actual PutValue transfer in an observed alternative's
		// lifetime path. Reacquiring only its RHS would lose publication uses.
		if query.returnObservation != nil && operation != nil {
			target := planMutationOperation(operation).target
			for i := range next {
				if next[i].awaited != nil {
					next[i].forwarded = query.forwardingTrace(result, next[i].forwarded, []*ast.Node{operation, target})
				}
			}
		}
		values = append(values, next...)
		replacements = append(replacements, sourceValueReplacement{at: at, operation: operation, values: next, bindings: bound, certain: certain})
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if ambient {
			if declaration != valueDeclaration || read == nil {
				continue
			}
			source = ast.GetSourceFileOfNode(read)
		}
		index := query.owner.index(source)
		for _, assignment := range index.bindings[id] {
			// The index retains the RHS's actual assignment operation. Acquiring its
			// left reference precedes the RHS, but replacement happens on completion.
			operation := assignment.right.Parent

			query.remaining--
			query.recordEstimatedCost(1)
			query.owner.work++
			if query.promiseExecutorWrite(assignment, declaration, bindings, result, &values) {
				continue
			}
			if query.moduleRead() != nil && enclosingCallableNode(declaration) == nil {
				producer, possible := query.moduleWriteProducer(assignment.left, bindings)
				if !possible {
					continue
				}
				if producer != nil {
					result.producers = append(result.producers, producer)
					if writer := enclosingCallableNode(assignment.left); writer != nil {
						bound := query.bindArguments(writer, producer, bindings, result)
						add(producer, operation, query.originsAt(assignment.right, assignment.left, bound, result), bound, false)
						continue
					}
				} else {
					result.opaque = true
				}
			}
			writer := enclosingCallableNode(assignment.left)
			if writer == enclosingCallableNode(declaration) {
				previous := query.initializing
				query.initializing = boundary
				possible := !query.afterRead(assignment.left)
				certain := false
				if completed {
					possible, certain = query.completionWrite(operation, boundary, bindings)
				} else if possible {
					possible, _ = query.reachable(assignment.left, bindings)
					certain = possible && (query.precedes(operation, boundary, bindings) || query.readerAssignmentCompleted(operation, boundary, bindings))
				}
				if possible {
					next, acquired := query.completedAssignmentValues(symbol, operation, bindings, result)
					if !acquired {
						next = query.originsAt(assignment.right, assignment.left, bindings, result)
					}
					at := operation
					if completed {
						if creator := query.creators[writer].invocation; creator != nil {
							at = creator
						}
					}
					add(at, operation, next, bindings, certain && operation.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken)
				}
				query.initializing = previous
				continue
			}
			// A module cell has no creating callable. Its source writers retain
			// their original Call inputs instead of requiring a nil-owner creator.
			// These are MAY alternatives, never performed writes or replacements.
			if query.dependenciesOnly && enclosingCallableNode(declaration) == nil && writer != nil {
				cut := query.memberWriterReadCut(nil, bindings, result)
				for _, input := range query.memberWriterInputs(assignment.left, bindings, result, cut) {
					// Accessor/constructor fallback scopes require their original
					// source body context. An exposed callback's incomplete MAY scope
					// remains relevant without proving a performed Call.
					if input.call == nil && !input.incomplete && writer != enclosingCallableNode(query.reading) && query.creators[writer].invocation == nil && (query.inputs == nil || query.inputs.declaration != writer) {
						continue
					}
					query.memberWriterScope(input, func() {
						if possible, _ := query.reachable(assignment.left, input.scope.bindings); !possible {
							return
						}
						// RHS acquisition effects belong to the original writer Call.
						// Only values and unresolved source relationships reach this read.
						projection := accessorCandidates{}
						next := query.originsAt(assignment.right, assignment.left, input.scope.bindings, &projection)
						result.valueIncomplete = result.valueIncomplete || projection.opaque || projection.valueIncomplete || projection.receiverIncomplete || projection.fieldReceiverIncomplete
						result.thenIncomplete = result.thenIncomplete || projection.thenIncomplete
						result.sourceCallable = result.sourceCallable || projection.sourceCallable
						for i := range next {
							if next[i].capture == nil {
								scope := input.scope
								next[i].capture = &scope
							}
						}
						at := input.call
						if at == nil {
							at = operation
						}
						add(at, operation, next, input.scope.bindings, false)
					})
				}
				result.opaque = true
				continue
			}
			creator := query.creators[enclosingCallableNode(declaration)].invocation
			if creator == nil || writer == nil {
				result.opaque = true
				continue
			}
			for _, node := range index.calls {

				query.remaining--
				query.recordEstimatedCost(1)
				query.owner.work++
				if query.initializing != nil && enclosingCallableNode(query.initializing) == enclosingCallableNode(declaration) && (enclosingCallableNode(node) != enclosingCallableNode(declaration) || node.Pos() >= query.initializing.Pos()) {
					continue
				}
				call := node.AsCallExpression()
				expression := unwrapSourceCallableReference(call.Expression)
				same, complete := false, false
				method := ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression)
				if method {
					receiver, _ := accessorReceiver(expression)
					for _, origin := range query.originsAt(receiver, node, bindings, result) {
						same = same || query.sourceCreatorValue(origin, enclosingCallableNode(declaration), creator)
					}
					if same {
						candidates := query.receiverCandidates(node, bindings)
						same = false
						for _, value := range candidates.values {
							same = same || value.node == writer && len(value.path) == 0
						}
						complete = same && len(candidates.values) == 1 && !candidates.opaque && !candidates.receiverIncomplete && !candidates.valueIncomplete
						result.opaque = result.opaque || candidates.opaque
					}
				} else if target := callTargetSymbol(expression, query.owner.checker); target != nil {
					for _, candidate := range target.Declarations {
						if candidate == writer {
							same = enclosingCallableNode(node) == enclosingCallableNode(declaration)
							complete = same && !query.owner.bindingWritten(target)
							result.opaque = result.opaque || !same
						}
					}
				}
				if !same {
					continue
				}
				bound := bindings
				if method {
					bound = query.bindSourceMethodInputs(writer, node, bindings, result).bindings
				} else {
					bound = query.bindArguments(writer, node, bindings, result)
				}
				at := query.moduleRead()
				if enclosingCallableNode(node) == enclosingCallableNode(declaration) {
					at = boundary
				}
				// Actual callee acquisition alone is not a performed-write proof. The
				// existing prefix and body owners must also prove unconditional order.
				next := query.originsAt(assignment.right, assignment.left, bound, result)
				certain := complete && query.precedes(node, at, bindings) && query.callableProducer(operation, writer, bound) && operation.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken
				add(node, operation, next, bound, certain)
				if certain {
					result.producers = append(result.producers, node)
				} else {
					result.opaque = true
				}
			}
		}
	}
	var replaced bool
	values, replaced = query.mergeReplacements(values, replacements, result)
	if acquire != nil && !replaced {
		// The entry keeps its original acquisition scope, outside the writer scan.
		delete(query.live, id)
		query.initializing = previous
		initial := append([]sourceValue{}, entryValues()...)
		initial = append(initial, query.consumedWriteValues(symbol, initial, result)...)
		values = append(initial, values...)
	}
	if len(values) > query.owner.maxTerms {
		query.owner.maxTerms = len(values)
	}
	return values
}

// sourceLocalBindingValues projects a local pattern's value relationship at its
// authored acquisition cut under its selected creating scope. Uninstantiated
// summaries retain their relative demand. The ordinary binder owns Get/default selection.
// Only values and uncertainty escape, so earlier Get/body effects are not
// republished at a later captured read. No normal output or receipt is issued.
func (query *sourceValueQuery) sourceLocalBindingValues(symbol *ast.Symbol, bindings sourceValueBindings, result *accessorCandidates) ([]sourceValue, bool) {
	if !query.dependenciesOnly || symbol == nil || symbol.ValueDeclaration == nil || !ast.IsBindingElement(symbol.ValueDeclaration) {
		return nil, false
	}
	declaration := symbol.ValueDeclaration
	for declaration != nil && (ast.IsBindingElement(declaration) || ast.IsObjectBindingPattern(declaration) || ast.IsArrayBindingPattern(declaration)) {
		declaration = declaration.Parent
	}
	if declaration == nil || !ast.IsVariableDeclaration(declaration) || declaration.Initializer() == nil || query.active[declaration] {
		return nil, false
	}
	owner := enclosingCallableNode(declaration)
	creator := query.creators[owner].invocation
	if owner == nil || creator == nil {
		return nil, false
	}
	part := accessorCandidates{}
	scope := query.acquireCallableScope(bindings, &part)
	reading, initializing, returning := query.reading, query.initializing, query.returning
	query.reading, query.initializing, query.returning = declaration, declaration, nil
	defer func() { query.reading, query.initializing, query.returning = reading, initializing, returning }()
	// The creating Call is not an external writer while matching its own input.
	// Same-owner indexed writes still use their original before/after cut.
	query.withPendingWriterInput(creator, &part, func() {
		query.withActiveInvocation(declaration, func() {
			values := query.originsAt(declaration.Initializer(), declaration, bindings, &part)
			// This transient default plan has no normal operations or receipts.
			inputs := &sourceValueInputs{declaration: owner, bindings: scope.bindings, defaults: make(map[*ast.Node]sourceDefaultInput)}
			query.bindInputPattern(declaration.Name(), values, scope.bindings, &part, accessorAcquire, inputs)
		})
	})
	values, acquired := scope.bindings[ast.GetSymbolId(symbol)]
	incomplete := part.opaque || part.valueIncomplete || part.receiverIncomplete || part.fieldReceiverIncomplete
	result.valueIncomplete = result.valueIncomplete || incomplete
	if acquired && (len(values) == 0 || incomplete) {
		values = append(append([]sourceValue(nil), values...), sourceValue{})
	}
	return values, acquired
}
