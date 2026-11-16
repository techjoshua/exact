package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// produceStagedWriterProjection borrows only the current original writer
// publication. Already acquired formal alternatives are projected individually,
// preserving their creating scopes. Raw operations stay required source work.
// Registration and final publication are separate central owner responsibilities.
func produceStagedWriterProjection(q *sourceValueQuery, assignment sourceValueAssignment, input sourceMemberWriterInput, retain ...func(sourceValue)) sourceStagedWriterProjection {
	out := sourceStagedWriterProjection{}
	if q == nil || q.stagedWriter == nil {
		return out
	}
	borrow := q.stagedWriter
	read := borrow.current
	if read == nil || !borrow.publishing || borrow.projecting != nil || !q.liveStagedWriterSource(borrow, borrow.read) || assignment.right != read.value.expression || assignment.left != read.value.get || input.call != read.call {
		return out
	}
	pending := func() {
		endpoint := cloneSourceRelativeEndpoint(read.value)
		endpoint.projection = append(endpoint.projection, read.projection...)
		out.pending = append(out.pending, endpoint)
	}
	var values []sourceValue
	rhs := unwrapSourceCallableReference(assignment.right)
	if ast.IsIdentifier(rhs) {
		symbol := q.owner.checker.GetSymbolAtLocation(rhs)
		if symbol != nil && symbol.ValueDeclaration != nil && ast.IsParameterDeclaration(symbol.ValueDeclaration) && enclosingCallableNode(symbol.ValueDeclaration) == read.region && !q.owner.bindingWritten(symbol) {
			values = input.scope.bindings[ast.GetSymbolId(symbol)]
		}
	} else if sourceInertValueCreation(rhs) {
		values = []sourceValue{{node: rhs}}
	}
	if len(values) == 0 {
		pending()
		out.resultContext = !read.incomplete && !input.incomplete && (read.invocation.actualsKnown || read.region == nil || read.call == nil && enclosingCallableNode(read.readCut.use) == read.region) && stagedDataSourceExpression(rhs)
		return out
	}
	active := &sourceStagedWriterInputProjection{issuer: q}
	borrow.projecting = active
	previousReading, previousInitializing, previousReturning, previousInvoking := q.reading, q.initializing, q.returning, q.invoking
	previousCreators := q.creators
	q.creators = input.scope.creators
	creating := input.call
	if creating == nil {
		// Inert source creation needs no invocation actuals. Its original write
		// occurrence supplies the cut, without inventing a creating Call.
		creating = read.write
	}
	q.reading, q.initializing, q.returning, q.invoking = creating, nil, nil, nil
	defer func() {
		q.reading, q.initializing, q.returning, q.invoking = previousReading, previousInitializing, previousReturning, previousInvoking
		q.creators = previousCreators
		if borrow.projecting == active {
			borrow.projecting = nil
		}
	}()
	cut := q.relativeInputCut(creating)
	out.delta.extracted = !read.incomplete && !input.incomplete && (input.call == nil && sourceInertValueCreation(rhs) || read.invocation.actualsKnown)
	out.resultContext = out.delta.extracted
	for _, original := range values {
		unknownBefore, pendingBefore := len(active.runtimeUnknown), len(active.pending)
		result := q.accessorsAtGetOutput(nil, nil, "", accessorAcquire, input.scope.bindings, nil, nil, nil, nil, original)
		deferredResult := len(active.pending) == pendingBefore+1 && active.pending[pendingBefore].expression == original.node && len(original.path) == 0 && stagedResultExpression(original.node)
		other := result
		// Only the exact root deferral owns this withheld value channel.
		other.valueIncomplete = false
		deferredResult = deferredResult && len(result.values) == 0 && !other.opaque && !other.receiverIncomplete && stagedWriterProjectionOtherChannelsRepresented(other)
		if !deferredResult && (result.opaque || result.valueIncomplete || result.receiverIncomplete || !stagedWriterProjectionOtherChannelsRepresented(result) || len(result.values) == 0 && len(active.runtimeUnknown) == unknownBefore) {
			out.resultContext = false
		}
		if result.opaque || result.valueIncomplete || result.receiverIncomplete || !stagedWriterProjectionOtherChannelsRepresented(result) {
			out.delta.extracted = false
		}
		if len(result.values) == 0 && len(active.runtimeUnknown) == unknownBefore {
			out.delta.extracted = false
		}
		for index, value := range result.values {
			scope := input.scope
			if original.capture != nil {
				scope = *original.capture
			}
			if selected, exists := result.callableScopes[index]; exists {
				scope = selected
			}
			described := value
			if value.node != nil && ast.IsFunctionLike(value.node) && len(scope.creators) != 0 {
				described.capture = &scope
			}
			if len(retain) == 1 && retain[0] != nil && q.stagedWriter == borrow && borrow.issuer == q && borrow.projecting == active && active.issuer == q && borrow.current == read && q.relativeInputCut(creating) == cut {
				// Retain the already produced source prefix on the original Get.
				// Queue transfer must not erase authored siblings from that owner.
				retained := value
				retained.path = append(append([]string(nil), value.path...), read.projection...)
				if retained.capture == nil && value.node != nil && ast.IsFunctionLike(value.node) {
					copy := scope
					retained.capture = &copy
				}
				retain[0](retained)
			}
			binding, gap := describeRelativeBoundValues([]sourceValue{described}, sourceRelativeRole{}, cut)
			if gap != relativeInputsSupported || binding.unknown {
				out.delta.extracted, out.resultContext = false, false
			}
			for _, endpoint := range binding.sources {
				endpoint.projection = append(endpoint.projection, read.projection...)
				if endpoint.expression != nil && !ast.IsFunctionLike(endpoint.expression) && !sourceInertValueCreation(endpoint.expression) {
					out.pending = append(out.pending, cloneSourceRelativeEndpoint(endpoint))
					out.delta.extracted = false
					continue
				}
				alternative := sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(endpoint)}
				out.delta.exposures = append(out.delta.exposures, alternative)
				if value.node != nil && ast.IsFunctionLike(value.node) {
					borrow.projectedScopes = append(borrow.projectedScopes, sourceStagedWriterCallableScope{alternative: alternative, scope: scope})
				}
			}
		}
	}
	for _, endpoint := range active.pending {
		endpoint = cloneSourceRelativeEndpoint(endpoint)
		endpoint.projection = append(endpoint.projection, read.projection...)
		out.pending = append(out.pending, endpoint)
	}
	for range active.runtimeUnknown {
		if read.get == nil {
			out.delta.extracted = false
			continue
		}
		out.delta.residuals = append(out.delta.residuals, sourceStagedOperationResidual{operation: read.get})
	}
	if len(out.pending) != 0 || len(out.delta.exposures)+len(out.delta.residuals) == 0 {
		out.delta.extracted = false
	}
	if q.stagedWriter != borrow || borrow.issuer != q || borrow.current != read || borrow.generation != q.owner.generation {
		out.delta.extracted, out.resultContext = false, false
	}
	return out
}

// The value channel is reduced separately. Other source protocols cannot be
// discarded or promoted into value projection coverage.
func stagedWriterProjectionOtherChannelsRepresented(result accessorCandidates) bool {
	result.values = nil
	return stagedMapEnumerationPrefixRepresented(result)
}

// deferStagedWriterInputOperation runs before original raw source acquisition.
// It records the exact operation and current creating cut without executing it.
// This hook has no effect outside the exact original projection interval.
func (q *sourceValueQuery) deferStagedWriterInputOperation(value *ast.Node, result *accessorCandidates) bool {
	if q == nil || q.owner == nil || q.stagedWriter == nil || result == nil || value == nil {
		return false
	}
	borrow := q.stagedWriter
	active := borrow.projecting
	if active == nil || active.issuer != q || borrow.issuer != q || borrow.owner != q.owner || borrow.generation != q.owner.generation || borrow.current == nil || !borrow.publishing || !q.dependenciesOnly || q.inputs != nil || q.operation != nil {
		return false
	}
	if !ast.IsCallExpression(value) && !ast.IsNewExpression(value) && !ast.IsTaggedTemplateExpression(value) && !ast.IsPropertyAccessExpression(value) && !ast.IsElementAccessExpression(value) {
		return false
	}
	endpoint := sourceRelativeEndpoint{kind: relativeEndpointResult, expression: value, producer: value, creation: borrow.current.call, cut: q.relativeInputCut(value)}
	if ast.IsCallExpression(value) {
		endpoint.get = value.Expression()
	} else if ast.IsPropertyAccessExpression(value) || ast.IsElementAccessExpression(value) {
		endpoint.get = value
	}
	active.pending = append(active.pending, endpoint)
	result.valueIncomplete = true
	return true
}

// Only this exact live projection may count represented ambient entry branches.
// Per-visit snapshots keep unrelated missing branches independently incomplete.
func (q *sourceValueQuery) stagedWriterUnknownSourceCount() int {
	if q == nil || q.owner == nil || q.stagedWriter == nil {
		return 0
	}
	borrow := q.stagedWriter
	if borrow.projecting == nil || borrow.projecting.issuer != q || borrow.issuer != q || borrow.owner != q.owner || borrow.generation != q.owner.generation || !borrow.publishing || borrow.current == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil {
		return 0
	}
	return len(borrow.projecting.runtimeUnknown)
}

// The original liveValues terminal supplies positive retention of this exact
// ambient entry. Missing inputs, authored locals, imports and environment-owned
// declarations cannot be reclassified by generic opacity or empty acquisition.
func (q *sourceValueQuery) observeStagedWriterAmbientEntry(value, declaration *ast.Node) bool {
	if q == nil || q.owner == nil || q.stagedWriter == nil || q.stagedWriter.projecting == nil {
		return false
	}
	borrow := q.stagedWriter
	active := borrow.projecting
	if active.issuer != q || borrow.issuer != q || borrow.owner != q.owner || borrow.generation != q.owner.generation || !borrow.publishing || borrow.current == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || !q.traceModeKnown || q.traceMode != accessorAcquire || value == nil || !ast.IsIdentifier(value) || declaration == nil || !ast.IsVariableDeclaration(declaration) || declaration.Initializer() != nil || ast.GetCombinedModifierFlags(declaration)&ast.ModifierFlagsAmbient == 0 {
		return false
	}
	file := ast.GetSourceFileOfNode(declaration)
	if file == nil || file.IsDeclarationFile || standardLibrarySource(file) || file != ast.GetSourceFileOfNode(value) || file != ast.GetSourceFileOfNode(borrow.current.write) || q.owner.program.GetSourceFile(file.FileName()) != file {
		return false
	}
	index, present := q.owner.indexes[file]
	if !present || index.incomplete || index.normalDynamicScope {
		return false
	}
	symbol := q.owner.checker.GetSymbolAtLocation(value)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration != declaration {
		return false
	}
	if _, classified := declarationCallEnvironment(symbol); classified {
		return false
	}
	active.runtimeUnknown = append(active.runtimeUnknown, sourceStagedWriterUnknownSource{expression: value, declaration: declaration, cut: q.relativeInputCut(value)})
	return true
}
