package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceMemberWriterReadCut retains the original dependency consumer while
// alias acquisition visits an earlier New or return. It is source-only and
// query-local. Its scope is copied, never a normal input frame or identity proof.
type sourceMemberWriterReadCut struct {
	operation, use *ast.Node
	scope          acquiredCallableScope
	saved          *sourceMemberWriterScopeEntries
	// afterArguments supplies MAY ordering only for the issuing native array
	// index Get. Receiver acquisition retains its earlier, original source value.
	afterArguments *sourceArrayIndexMay
}

// Sealed entries retain the mappings at the original read. Plain lookup and
// ordering often use only its source position. Build writable indexes only
// when a consumer needs the bindings or creator relationships.
type sourceMemberWriterScopeEntries struct {
	bindings []sourceDetachedPropertyBinding
	creators []sourceDetachedPropertyCreator
}

func (q *sourceValueQuery) memberWriterReadCut(reference *sourceGetReference, bindings sourceValueBindings, result *accessorCandidates, actual ...*sourceGetInputs) *sourceMemberWriterReadCut {
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
	cut := &sourceMemberWriterReadCut{operation: operation, use: use}
	if len(bindings) == 0 && len(q.creators) == 0 {
		progressCount(q, tScopeAcquired, 1)
	} else if q.stagedWriter != nil || q.calleeWriteInventory != nil || q.memberReceiverPreparation != nil {
		// These registered consumers bind or compare the original source inputs.
		cut.scope = q.acquireCallableScope(bindings, result)
	} else {
		progressCount(q, tScopeAcquired, 1)
		saved := &sourceMemberWriterScopeEntries{
			bindings: make([]sourceDetachedPropertyBinding, 0, len(bindings)),
			creators: make([]sourceDetachedPropertyCreator, 0, len(q.creators)),
		}
		for symbol, values := range bindings {
			if !q.charge(result, nil) {
				break
			}
			saved.bindings = append(saved.bindings, sourceDetachedPropertyBinding{symbol, q.sealInitializerValues(values, result)})
		}
		for owner, creator := range q.creators {
			if !q.charge(result, owner) {
				break
			}
			saved.creators = append(saved.creators, sourceDetachedPropertyCreator{owner, creator})
		}
		cut.saved = saved
	}
	if len(actual) == 1 && actual[0] != nil && q.arrayIndexMayAtGet(actual[0], actual[0].receiver.node, []string{"*"}, "", accessorAcquire) && operation == actual[0].operation && use == operation {
		cut.afterArguments = actual[0].arrayIndexMay
	}
	return cut
}

// evaluationScope supplies detached writable maps only when the original
// reader is actually used for branch evaluation or invocation binding.
func (cut *sourceMemberWriterReadCut) evaluationScope() *acquiredCallableScope {
	if saved := cut.saved; saved != nil {
		cut.scope.bindings = make(sourceValueBindings, len(saved.bindings))
		for _, item := range saved.bindings {
			cut.scope.bindings[item.symbol] = item.values
		}
		cut.scope.creators = make(map[*ast.Node]sourceValueCreation, len(saved.creators))
		for _, item := range saved.creators {
			cut.scope.creators[item.owner] = item.value
		}
		cut.saved = nil
	} else if cut.scope.bindings == nil {
		cut.scope.bindings = make(sourceValueBindings)
		cut.scope.creators = make(map[*ast.Node]sourceValueCreation)
	}
	return &cut.scope
}

// argumentMayPrecede admits only eager source Calls inside this original Call's
// actual argument expressions. It cannot enter deferred bodies or prove that an
// argument completed, a write performed or the native Call was reached normally.
func (cut *sourceMemberWriterReadCut) argumentMayPrecede(q *sourceValueQuery, call *ast.Node, result *accessorCandidates) bool {
	if cut == nil || !q.dependenciesOnly || cut.afterArguments == nil || cut.afterArguments.owner != q || cut.operation != cut.afterArguments.operation || cut.use != cut.operation || q.reading != cut.use || call == nil || call.Pos() <= cut.operation.Pos() || call.End() > cut.operation.End() {
		return false
	}
	return cut.argumentContains(q, call, result)
}

// memberWriterRead lends the immutable reader cut only for source ordering.
// A factory's temporary return/acquisition cut cannot stand in for this use.
func (q *sourceValueQuery) memberWriterRead(get *sourceGetInputs, cut *sourceMemberWriterReadCut) func() {
	if cut == nil {
		return func() {}
	}
	event := q.beginInstalledMemberReader(get, cut)
	reading, initializing, returning := q.reading, q.initializing, q.returning
	q.reading, q.returning = cut.use, nil
	live := true
	return func() {
		if !live {
			return
		}
		live = false
		if event != nil {
			event.readerActive = false
		}
		q.reading, q.initializing, q.returning = reading, initializing, returning
	}
}

// sourceMemberWriterInput retains one original Call's symbolic source bindings.
// It is query-local projection data, never a normal frame or completed Call.
type sourceMemberWriterInput struct {
	componentSource *sourceComponentAssignmentInput // Ephemeral same-definition MAY relation, never an invocation/normal input.

	directTargetExcluded bool // Query-local disjoint outcome; never a complete writer disposition.
	writerInputs         *sourceStagedWriterInputs
	call                 *ast.Node
	scope                acquiredCallableScope
	incomplete           bool
}

// memberWriterInputs uses the ordinary selection/input owner without consuming
// any body. Argument/default effects remain with the original Call. Each body
// alternative keeps its own Call and creating bindings through alias matching.
func (q *sourceValueQuery) memberWriterInputs(left *ast.Node, bindings sourceValueBindings, result *accessorCandidates, cut *sourceMemberWriterReadCut) []sourceMemberWriterInput {
	// Lexical-this SOURCE correspondence is needed even when this original
	// outer reader already owns ordinary direct scope. The authenticated MAY
	// arm is exclusive; it cannot add a second supplier or replacement proof.
	if input, owned := q.componentAssignmentWriterInput(left, bindings, result, cut); owned {
		return []sourceMemberWriterInput{input}
	}
	writer := enclosingCallableNode(left)
	if !q.dependenciesOnly || writer == nil || ast.IsGetAccessorDeclaration(writer) || ast.IsSetAccessorDeclaration(writer) || ast.IsConstructorDeclaration(writer) {
		return []sourceMemberWriterInput{{scope: acquiredCallableScope{bindings: bindings, creators: q.creators}}}
	}
	readingOwner := enclosingCallableNode(q.reading)
	if writer == readingOwner {
		return []sourceMemberWriterInput{{scope: acquiredCallableScope{bindings: bindings, creators: q.creators}}}
	}
	var alternatives []sourceMemberWriterInput
	var collect func(*ast.Node, sourceValueBindings)
	collect = func(call *ast.Node, bindings sourceValueBindings) {
		if q.stagedMapInvocationFollows(call) {
			return
		}
		trace := progressWriterBegin(q, call, writer)
		defer progressWriterEnd(q, trace)
		request := q.registerWriterInputRequest(call)
		defer request.revoke()
		if request != nil && request.writerSourceWork != nil {
			method := request.writerSourceWork.consumeWriterSource(q, request)
			if method.compilerPending {
				result.valueIncomplete = true // Required compiler work, no source-scope exclusion.
				return
			}
			if method.calleeCovered {
				for _, scope := range q.memberWriterComponentScopes(writer, call, bindings, result, request, true) {
					alternatives = append(alternatives, sourceMemberWriterInput{scope: scope, incomplete: result.valueIncomplete})
				}
				return
			}
			if method.handled {
				if method.excluded {
					request.graph.stats.DiscoveryRetired++
				} else {
					result.valueIncomplete = true
				}
				return
			}
		}
		if request != nil && request.excludeDiscovery(q, bindings) {
			progressWriterEvent(q, "discovery-retired", 0)
			return
		}
		// A method-source attempt may itself walk this receiver's own writers.
		// Let its already-owned constructor continuation run before that attempt.
		if q.yieldStagedConstructionWriter(call, request) {
			result.valueIncomplete = true
			return
		}
		if request != nil {
			if method := q.stagedWriterCall(call); method.handled {
				if method.excluded {
					request.graph.stats.DiscoveryRetired++
				} else {
					result.valueIncomplete = true
				}
				return
			}
		}
		// Discovery and handled source work are not legacy input acquisition.
		// Once any candidate needs reconstruction, retain that debt for the
		// entire original Get, including when later candidates are excluded.
		if q.stagedNativeGet != nil {
			q.stagedNativeGet.writerDependent = true
		}
		start := len(alternatives)
		complete, bodySeen := false, false
		previousInitializing := q.initializing
		q.initializing = call
		invocation := accessorCandidates{}
		func() {
			previousMemberRequest := q.pendingMemberRequest
			q.pendingMemberRequest = request
			defer func() { q.pendingMemberRequest = previousMemberRequest }()
			q.withActiveInvocation(call, func() {
				if disposition := request.descriptorWriterDisposition(q); disposition.handled {
					if disposition.calleeOnly {
						for _, scope := range q.refusedMemberWriterScopesWithCallee(writer, call, bindings, result, true, request) {
							alternatives = append(alternatives, sourceMemberWriterInput{scope: scope, incomplete: true})
						}
					} else {
						result.valueIncomplete = true // The registered compiler source is still pending.
					}
					return
				}
				invocation = q.consumeInvocation(call, bindings, sourceInvocationConsumer{
					selection: func(value bool) { complete = value },
					body: func(body *ast.Node, bound sourceValueBindings, inputs *sourceValueInputs, _ *ast.Node, part *accessorCandidates) {
						if body != writer {
							q.memberWriterBodyCalls(body, call, bound, inputs, part, collect)
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
						var writerInputs *sourceStagedWriterInputs
						bound = q.memberWriterActualValues(body, call, bound, part, func(values sourceValueBindings) {
							if q.stagedWriter == nil || inputs.writerInvocation == nil {
								return
							}
							projected := *inputs
							projected.bindings = values
							request := cloneStagedWriterInvocation(*inputs.writerInvocation)
							// The projection owner is still at the original creating Call.
							// Do not detach these values at the later reader's cut.
							request.use, request.cut = q.effectUse(), q.relativeInputCut(call)
							for i := range request.actuals {
								request.actuals[i].endpoint.cut = request.cut
							}
							request.receiver.cut = request.cut
							described := describeSourceRelativeBoundInputs(q, &projected, request)
							writerInputs = &sourceStagedWriterInputs{edge: inputs.writerEdge, invocation: request, bound: described}
							if edge := inputs.writerEdge; edge != nil && edge.delivered {
								edge.relative = cloneSourceRelativeBoundInputs(edge.bound)
								edge.relative.bindings = described.bindings
								edge.relative.unsupported = described.unsupported
							}
						})
						scope := q.acquireCallableScope(bound, part)
						scope.creators[writer] = sourceValueCreation{invocation: call}
						input := sourceMemberWriterInput{writerInputs: writerInputs, call: call, scope: scope, incomplete: part.opaque || part.receiverIncomplete || part.valueIncomplete}
						alternatives = append(alternatives, input)
					},
					resolver: func(*ast.Node, []*ast.Node, bool, sourceValueBindings, *accessorCandidates) {},
				})
			})
		}()
		q.initializing = previousInitializing
		if !complete && !bodySeen && (invocation.opaque || invocation.valueIncomplete || invocation.receiverIncomplete) {
			// A refused input domain can still expose this actual source
			// callable. Keep its captures and MAY write, never invent arguments.
			for _, scope := range q.refusedMemberWriterScopes(writer, call, bindings, result, request) {
				alternatives = append(alternatives, sourceMemberWriterInput{scope: scope, incomplete: true})
				result.opaque = true
			}
		}
		for i := start; i < len(alternatives); i++ {
			alternatives[i].incomplete = alternatives[i].incomplete || !complete

		}
	}
	// Nested recovery restores the outer read position before the next
	// candidate. Positions are comparable only within its source and callable.
	at := q.readPosition()
	atOwner, atFile := enclosingCallableNode(at), ast.GetSourceFileOfNode(at)
	seen := make(map[*ast.Node]bool)
	var sourceIndexes [4]sourceValueIndex
	for _, index := range q.occurrenceSourceView(left, result, sourceIndexes[:0]) {
		sameFile := len(index.calls) != 0 && ast.GetSourceFileOfNode(index.calls[0]) == atFile
		for _, call := range index.calls {
			if q.stagedMapInvocationFollows(call) || seen[call] || q.active[call] || q.pendingWriterInputExcluded(call, result) {
				continue
			}
			caller := enclosingCallableNode(call)
			if sameFile && call.Pos() >= at.Pos() && caller == atOwner && !cut.argumentMayPrecede(q, call, result) {
				continue
			}
			// Transformation erases only this authenticated policy default subtree.
			// Its indexed Calls cannot execute as writers of another input.
			if caller != nil {
				if entry := index.normalOccurrences[call]; entry != nil && entry.defaultRoot != nil {
					if policy := q.owner.summary(caller).erasedPolicy; policy != nil && policy.Initializer() == entry.defaultRoot {
						continue
					}
				}
			}
			if caller != nil && caller != readingOwner && q.creators[caller].invocation == nil {
				continue
			}
			// Eligibility cannot select this same original Call as a separate
			// writer of its own precondition. Unknown branches remain possible.
			// End this interval before collect owns argument/body acquisition.
			possible := false
			q.withActiveInvocation(call, func() {
				if cut != nil && cut.use != nil && q.precedes(cut.use, call, cut.evaluationScope().bindings) {
					return
				}
				seen[call] = true
				possible, _ = q.reachable(call, bindings)
			})
			if possible {
				collect(call, bindings)
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
func (q *sourceValueQuery) memberWriterActualValues(body, call *ast.Node, bindings sourceValueBindings, result *accessorCandidates, describe ...func(sourceValueBindings)) sourceValueBindings {
	bound := make(sourceValueBindings, len(bindings))
	for id, values := range bindings {
		bound[id] = values
	}
	reading, initializing, returning := q.reading, q.initializing, q.returning
	q.reading, q.initializing, q.returning = call, call, nil
	defer func() { q.reading, q.initializing, q.returning = reading, initializing, returning }()
	defer func() {
		if len(describe) == 1 && describe[0] != nil {
			describe[0](bound)
		}
	}()
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
func (q *sourceValueQuery) refusedMemberWriterScopes(writer, call *ast.Node, bindings sourceValueBindings, result *accessorCandidates, requests ...*sourceWriterInputRequest) []acquiredCallableScope {
	var request *sourceWriterInputRequest
	if len(requests) == 1 {
		request = requests[0]
	}
	return q.memberWriterScopes(writer, call, bindings, result, request, false, false)
}

// memberWriterComponentScopes skips only an authentically consumed source callee.
// Every argument/default/capture remains with the original recovery owner.
func (q *sourceValueQuery) memberWriterComponentScopes(writer, call *ast.Node, bindings sourceValueBindings, result *accessorCandidates, issued *sourceWriterInputRequest, calleeCovered bool) []acquiredCallableScope {
	if calleeCovered && (issued == nil || !issued.live || issued.issuer != q || issued.call != call || issued.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking})) {
		result.valueIncomplete = true
		return nil
	}
	return q.memberWriterScopes(writer, call, bindings, result, issued, calleeCovered, false)
}

// refusedMemberWriterScopesWithCallee keeps descriptor-only callee coverage
// separate from source-callee coverage. Neither pays an argument obligation.
func (q *sourceValueQuery) refusedMemberWriterScopesWithCallee(writer, call *ast.Node, bindings sourceValueBindings, result *accessorCandidates, calleeOnly bool, requests ...*sourceWriterInputRequest) []acquiredCallableScope {
	var request *sourceWriterInputRequest
	if len(requests) == 1 {
		request = requests[0]
	}
	return q.memberWriterScopes(writer, call, bindings, result, request, false, calleeOnly)
}

// memberWriterScopes shares the existing original component recovery while
// retaining each callee proof's independent issuer checks and scope lifetime.
func (q *sourceValueQuery) memberWriterScopes(writer, call *ast.Node, bindings sourceValueBindings, result *accessorCandidates, issued *sourceWriterInputRequest, calleeCovered, calleeOnly bool) []acquiredCallableScope {
	if writer == nil || !ast.IsFunctionLike(writer) || writer.Body() == nil {
		return nil
	}
	// Each value-only recovery component owns its earlier Call cut. Between
	// components the original member observation remains live, so an uncovered
	// result can transfer to its current source consumer before legacy recovery.
	atRecovery := func(consume func()) {
		reading, initializing, returning := q.reading, q.initializing, q.returning
		q.reading, q.initializing, q.returning = call, call, nil
		defer func() { q.reading, q.initializing, q.returning = reading, initializing, returning }()
		consume()
	}
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
		var request *sourceWriterInputRequest
		atRecovery(func() {
			if issued != nil && issued.atRecovery(q) {
				request = issued
				request.graph.stats.FallbackEntries++
			}
		})
		expose := func(position int, expression *ast.Node, acquire func() accessorCandidates) {
			handled := false
			atRecovery(func() {
				if position == -1 && calleeOnly && request != nil && request.atRecovery(q) && request.descriptorIssuer == request && request.descriptorWork != nil {
					handled = true // Callee only. No argument/default/capture is omitted.
					return
				}
				if values, transferred := request.pendingMemberComponent(q, position, bindings, result); transferred {
					retain(accessorCandidates{values: values})
					handled = true
				} else if position >= 0 && request.pendingDescriptorFormal(q, position, bindings, result) {
					handled = true // A required relative input, not a covered-empty value.
				} else if values, covered := request.component(q, position, bindings); covered {
					request.graph.stats.RecoveryRetired++
					retain(accessorCandidates{values: values})
					handled = true
				}
			})
			if handled {
				return
			}
			if expression = unwrapSourceCallableReference(expression); stagedDataSourceExpression(expression) {
				transfer := q.transferStagedCallReturn(expression, sourceCallResultInterest{purpose: resultCallableExposure})
				if transfer.accepted {
					// This consumer needs direct callable exposure, not the object
					// returned by an independently selected native producer. Its
					// exact used Effects root remains a selection prerequisite.
					if len(transfer.views) != 0 {
						borrow := q.stagedMember
						borrow.selectionRequired = appendEntryLawRequirement(borrow.selectionRequired, transfer.required)
						// Source-domain DATA is current; normal output and every
						// transformed/unknown view alternative remain unavailable.
						// Only the existing original input source may expose a
						// known writer; never flatten the view into that value.
						represented := true
						atRecovery(func() {
							for _, view := range transfer.views {
								represented = q.frameworkViewWriterSources(view, bindings, result, retain) && represented
							}
						})
						if represented {
							for _, view := range transfer.views {
								q.observeFrameworkViewRuntime(view, result)
							}
						} else {
							// This reader discovered unpaid source work; the
							// runtime alternative cannot retire that obligation.
							borrow.represented = false
						}
					}
					if len(transfer.descriptorViews) != 0 {
						borrow := q.stagedMember
						borrow.selectionRequired = appendEntryLawRequirement(borrow.selectionRequired, transfer.required)
						represented := true
						atRecovery(func() {
							for _, view := range transfer.descriptorViews {
								part := accessorCandidates{}
								q.retainNativeDescriptorView(view, nil, "", accessorAcquire, false, &part, bindings)
								retain(part)
								represented = represented && !frameworkEffectsCompilerPending(part)
							}
						})
						if represented {
							for _, view := range transfer.descriptorViews {
								q.observeDescriptorViewRuntime(view, result)
							}
						} else {
							borrow.represented = false
						}
					}
					if transfer.noncallable {
						borrow := q.stagedMember
						borrow.selectionRequired = appendEntryLawRequirement(borrow.selectionRequired, transfer.required)
					}
					if transfer.sourcePending {
						q.stagedMember.represented = false
						result.opaque = true
					}
					result.valueIncomplete = result.valueIncomplete || !transfer.noncallable
					return
				}
			}
			atRecovery(func() {
				progressWriterFallback(q, request, call, position)
				if position >= 0 && q.guardedObjectArgument(call, expression) {
					// Only equality is settled. Other input provenance may remain unknown.
					result.valueIncomplete = result.valueIncomplete || calleeCovered
					return
				}
				part := acquire()
				retain(part)
				if calleeCovered {
					// Unknown argument alternatives remain pending beside known captures.
					result.valueIncomplete = result.valueIncomplete || part.opaque || part.valueIncomplete || part.receiverIncomplete || part.fieldReceiverIncomplete || part.thenIncomplete
				}
			})
		}
		if !calleeCovered {
			expose(-1, call.Expression(), func() accessorCandidates { return q.receiverCandidates(call, bindings) })
		}
		if args := call.AsCallExpression().Arguments; args != nil {
			for position, argument := range args.Nodes {
				if !q.charge(result, argument) {
					return
				}
				expose(position, argument, func() accessorCandidates {
					prior, consumer := q.directWriterExposure, q.directExposureConsumer
					priorArgument, priorCuts := q.directExposureArgument, q.directExposureCuts
					q.directExposureArgument, q.directExposureCuts = argument, [4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}
					q.directWriterExposure, q.directExposureConsumer = true, call
					defer func() {
						q.directWriterExposure, q.directExposureConsumer = prior, consumer
						q.directExposureArgument, q.directExposureCuts = priorArgument, priorCuts
					}()
					return q.accessors(argument, nil, "", accessorAcquire, bindings, nil)
				})
			}
		}
		atRecovery(func() {
			if request != nil {
				request.graph.stats.FallbackYields += uint64(len(scopes))
			}
		})
	})
	progressWriterEvent(q, "recovery-result", len(scopes))
	return scopes
}

// guardedObjectArgument proves only that the original argument cannot equal
// a writer function. In this single-return module function no prior statement,
// parameter initializer or earlier argument could hand a closure over this
// parameter to a getter. Looking up the method can still execute authored code.
func (q *sourceValueQuery) guardedObjectArgument(call, argument *ast.Node) bool {
	parent := call.Parent
	if parent == nil || !ast.IsConditionalExpression(parent) || parent.AsConditionalExpression().WhenTrue != call ||
		!ast.IsIdentifier(argument) || len(call.AsCallExpression().Arguments.Nodes) != 1 || call.AsCallExpression().Arguments.Nodes[0] != argument {
		return false
	}
	condition := parent.AsConditionalExpression().Condition
	if !ast.IsBinaryExpression(condition) || condition.AsBinaryExpression().OperatorToken.Kind != ast.KindAmpersandAmpersandToken {
		return false
	}
	left, right := condition.AsBinaryExpression().Left, condition.AsBinaryExpression().Right
	if !ast.IsBinaryExpression(left) || !ast.IsBinaryExpression(right) {
		return false
	}
	category, present := left.AsBinaryExpression(), right.AsBinaryExpression()
	if category.OperatorToken.Kind != ast.KindEqualsEqualsEqualsToken || !ast.IsTypeOfExpression(category.Left) ||
		!ast.IsIdentifier(category.Left.Expression()) || !ast.IsStringLiteral(category.Right) || category.Right.Text() != "object" ||
		present.OperatorToken.Kind != ast.KindExclamationEqualsEqualsToken || !ast.IsIdentifier(present.Left) || present.Right.Kind != ast.KindNullKeyword {
		return false
	}
	method, statement := call.Expression(), parent.Parent
	if !ast.IsPropertyAccessExpression(method) || !ast.IsIdentifier(method.Expression()) || statement == nil || !ast.IsReturnStatement(statement) ||
		statement.Parent == nil || !ast.IsBlock(statement.Parent) || len(statement.Parent.AsBlock().Statements.Nodes) != 1 {
		return false
	}
	fn := statement.Parent.Parent
	if fn == nil || !ast.IsFunctionDeclaration(fn) || len(fn.Parameters()) != 1 || !ast.IsExternalModule(ast.GetSourceFileOfNode(fn)) {
		return false
	}
	parameter := fn.Parameters()[0]
	symbol := q.owner.checker.GetSymbolAtLocation(argument)
	return symbol != nil && symbol.ValueDeclaration == parameter && parameter.Initializer() == nil && ast.IsIdentifier(parameter.Name()) &&
		q.owner.checker.GetSymbolAtLocation(category.Left.Expression()) == symbol && q.owner.checker.GetSymbolAtLocation(present.Left) == symbol
}

// memberWriterBodyCalls follows only reached Call demands under the selected
// wrapper's original inputs. It does not execute its body or publish effects.
// The shared finite dependency entry relation joins recursive source contexts.
func (q *sourceValueQuery) memberWriterBodyCalls(body, call *ast.Node, bindings sourceValueBindings, inputs *sourceValueInputs, result *accessorCandidates, visit func(*ast.Node, sourceValueBindings)) {
	if _, ordinary := ordinaryResultCategory(body); !ordinary {
		return
	}
	release, fresh := q.enterDependencyBody(body, bindings, inputs, call, result)
	defer release()
	if !fresh {
		result.opaque = true
		return
	}
	// Only a nested writer Call consumes the projected actuals and creator scope.
	nodes := q.owner.summary(body).nodes
	for len(nodes) != 0 && !ast.IsCallExpression(nodes[0]) {
		nodes = nodes[1:]
	}
	// Projection and initializer sealing can also contribute uncertainty to
	// refused-callee recovery, even when no nested Call consumes the scope.
	if len(nodes) == 0 && !memberWriterInputsNeedResolution(bindings) {
		return
	}
	scope := q.acquireCallableScope(q.memberWriterActualValues(body, call, bindings, result), result)
	scope.creators[body] = sourceValueCreation{invocation: call}
	previous, had := q.active[body]
	q.active[body] = true
	defer func() {
		if had {
			q.active[body] = previous
		} else {
			delete(q.active, body)
		}
	}()
	q.memberWriterScope(sourceMemberWriterInput{scope: scope}, func() {
		for _, node := range nodes {
			if !ast.IsCallExpression(node) {
				continue
			}
			if !q.charge(result, node) {
				return
			}
			bound := scope.bindings
			defaults, isDefault := q.defaultInput(inputs, node, result)
			if isDefault {
				if defaults.bindings == nil {
					continue
				}
				bound = defaults.bindings
			}
			if possible, _ := q.reachable(node, bound); !possible {
				continue
			}
			visit(node, bound)
		}
	})
}

// memberWriterInputsNeedResolution reports whether preparing otherwise unused
// bindings could consult a member or resolve a captured initializer.
func memberWriterInputsNeedResolution(bindings sourceValueBindings) bool {
	for _, terms := range bindings {
		for _, term := range terms {
			if len(term.path) != 0 || term.initializerUse != nil {
				return true
			}
		}
	}
	return false
}

// A source callee Get occurs before this original Call/New evaluates its actuals.
// This excludes only eager operations inside those arguments, not operations in
// the callee expression, earlier statements, other occurrences or deferred bodies.
// It supplies no completed write, normal input or descriptor/NoWrites authority.
func (cut *sourceMemberWriterReadCut) followsCalleeGet(q *sourceValueQuery, get *sourceGetInputs, operation *ast.Node, result *accessorCandidates) bool {
	if cut.followsStagedArgumentInvocation(q, get, operation) {
		return true
	}
	if cut == nil || q == nil || !q.dependenciesOnly || get == nil || cut.afterArguments != nil || cut.operation == nil || get.operation != cut.operation || q.reading != cut.use || operation == nil {
		return false
	}
	original := cut.operation
	if call := q.originalSourceCalleeOperation(); call != nil && (original == call || nodeInside(original, call.Expression())) {
		original = call
	} else {
		return false // An unborrowed definition may include prior invocation state.
	}
	if operation == original {
		return false
	}
	// An original module initializer is evaluated once in source order. Later
	// direct module operations cannot alter this earlier callee Get. Deferred
	// callable bodies and other files retain their existing activation owners.
	if runtimeModuleEvaluation(q.effectOwner) && sourceStagedOccurrenceOwned(original, q.effectOwner) && enclosingCallableNode(operation) == nil && ast.GetSourceFileOfNode(operation) == ast.GetSourceFileOfNode(original) && operation.Pos() >= original.End() {
		return true
	}
	earlier := *cut
	earlier.operation = original
	return earlier.argumentContains(q, operation, result)
}

func (cut *sourceMemberWriterReadCut) argumentContains(q *sourceValueQuery, call *ast.Node, result *accessorCandidates) bool {
	for child, parent := call, call.Parent; parent != nil; child, parent = parent, parent.Parent {
		if !q.charge(result, parent) {
			return false
		}
		if parent == cut.operation {
			var arguments []*ast.Node
			if ast.IsCallExpression(parent) {
				arguments = restrictedInvocationArguments(parent.AsCallExpression())
			} else if ast.IsNewExpression(parent) && parent.AsNewExpression().Arguments != nil {
				arguments = parent.AsNewExpression().Arguments.Nodes
			}
			for _, argument := range arguments {
				if argument == child {
					return true
				}
			}
			return false
		}
		if sourceMemberOperationOwnsChild(parent, child) {
			return false
		}
	}
	return false
}
