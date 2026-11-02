package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourcePendingWriterInput excludes only the writer candidate whose inputs are
// currently being matched. It is not projection recursion or Call authority.
// The issuing query expires and clears every borrowed pointer on scope exit.
type sourcePendingWriterInput struct {
	owner  *sourceValueQuery
	call   *ast.Node
	inputs *sourceValueInputs
	prior  *sourcePendingWriterInput
	active bool
}

// withPendingWriterInput covers raw, acquired and container input matching.
// Existing active state remains untouched so projection acquisition still owns
// its normal interval. Receiver/body/write inspection starts after this expires.
func (query *sourceValueQuery) withPendingWriterInput(call *ast.Node, result *accessorCandidates, match func()) {
	query.charge(result, call)
	query.recordFacts(1)
	pending := sourcePendingWriterInput{owner: query, call: call, inputs: query.inputs, prior: query.pendingWriterInput, active: true}
	query.pendingWriterInput = &pending
	defer func() {
		query.pendingWriterInput = pending.prior
		pending = sourcePendingWriterInput{}
	}()
	match()
}

// pendingWriterInputExcluded is read only by writer-candidate selectors. Query
// copies, other inputs and expired borrows cannot inherit the original fence.
func (query *sourceValueQuery) pendingWriterInputExcluded(call *ast.Node, result *accessorCandidates) bool {
	for pending := query.pendingWriterInput; pending != nil; pending = pending.prior {
		query.charge(result, call)
		if pending.active && pending.owner == query && pending.call == call && pending.inputs == query.inputs {
			return true
		}
	}
	return false
}

// interference retains uncertainty when a finite origin reaches a writer outside the indexed
// member relation. Recognized read-only intrinsics and source bodies without receiver writes
// do not invalidate a capture merely because its object was passed as an argument.
func (query *sourceValueQuery) interference(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates) sourceMemberOperationProof {
	return query.interferenceInSources(origin, projection, name, mode, bindings, result, nil)
}

func (query *sourceValueQuery) interferenceInSources(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, sources []*ast.SourceFile) sourceMemberOperationProof {
	// One completed native input operation has already consumed its real Get.
	// Its intrinsic never writes this fresh data input. This excludes only that
	// original operation, not another indexed call or a generic caller's inputs.
	var nativeInputs []*sourceNativeInvocation
	if context := query.returnObservation; context != nil && context.owner == query.effectOwner {
		nativeInputs = context.receipts
	}
	restoreOperation := query.suspendOperation()
	defer restoreOperation()
	// A closed eager own-data acquisition supplies occurrence-local call eligibility.
	// It does not complete acquired values, remove indexed assignments, or clear opacity.
	boundary := sourceMemberOperationProof{}
	if mode == accessorAcquire && ast.IsObjectLiteralExpression(origin) && len(projection) == 1 && name == "" && !query.provingFunctionOperation {
		boundary = query.sourceMemberOperation(origin, projection, name, mode, bindings, result)
	}
	// Interference contributes only the monotone opacity verdict. Boundary proof
	// above remains required by the member-write owner even when already opaque.
	if result.opaque {
		return boundary
	}
	// One scan retains the same origin, demand, bindings and restored creator context.
	// Cache complete predicates only, never a query failure or an acquired mutable cell.
	seen := make(map[*ast.Node]bool)
	_, nativeOriginKind := query.nativeRootDeclaration(origin)
	visit := func(calls []*ast.Node) {
		for _, node := range calls {
			if result.opaque {
				return
			}
			completed := false
			for _, receipt := range nativeInputs {
				if !query.charge(result, node) {
					return
				}
				if receipt.operation != node || receipt.owner != query.effectOwner || receipt.incomplete || receipt.observed.incomplete || !receipt.privateInput {
					continue
				}
				for _, value := range receipt.values {
					completed = completed || value.node == origin && len(value.path) == 0
				}
			}
			if completed {
				continue
			}
			if boundary.closed {
				if !query.charge(result, node) {
					return
				}
				if !boundary.calls[node] {
					continue
				}
			}
			if query.pendingInvocationExcluded(node, result) || query.completedInvocationExcluded(node, result) {
				continue
			}
			if query.deferredCandidateExcluded(node, result) {
				continue
			}
			if seen[node] || query.active[node] || query.pendingWriterInputExcluded(node, result) || query.afterRead(node) {
				continue
			}
			call := node.AsCallExpression()
			expression := unwrapSourceCallableReference(call.Expression)
			// A direct immutable source body with no demands cannot write an input.
			// Nested argument calls have their own indexed occurrences and remain visited.
			constructed := query.constructedModuleCall(node)
			if constructed && !query.charge(result, node) {
				return
			}
			if !constructed && ast.IsIdentifier(expression) {
				symbol := resolvedCallableSymbol(callTargetSymbol(expression, query.owner.checker), query.owner.checker)
				if symbol != nil && !query.owner.bindingWritten(symbol) {
					declarations := query.callDeclarations(expression, &accessorCandidates{})
					if len(declarations) == 1 && ast.IsFunctionLike(declarations[0]) && declarations[0].Body() != nil {
						// Reuse the generation's eager-operation region. New/tagged calls,
						// coercions, computed names and binding patterns are not empty work.
						region := query.owner.index(ast.GetSourceFileOfNode(declarations[0])).operationRegions[declarations[0]]
						empty := region == nil || len(region.members) == 0 && len(region.hazards) == 0 && len(region.writes) == 0
						simple := true
						for _, parameter := range declarations[0].Parameters() {
							simple = simple && ast.IsIdentifier(parameter.Name()) && parameter.Initializer() == nil
						}
						if simple && empty {
							continue
						}
					}
				}
			}
			if query.moduleRead() != nil {
				if body := enclosingCallableNode(node); body != nil && query.creators[body].invocation == nil {
					// A retained definition is not executing module work. An actual
					// earlier invocation opens its body through the existing producer
					// relation. Unknown executed work retains its own caller effect.
					var producer *ast.Node
					// An operation cannot establish its own caller while that caller's
					// inputs and callee are still being acquired.
					query.withActiveInvocation(node, func() {
						producer, _ = query.moduleWriteProducer(node, bindings)
					})
					if producer == nil {
						continue
					}
				}
			}

			seen[node] = true

			query.remaining--
			query.recordEstimatedCost(1)
			query.owner.work++

			reaches := func(input *ast.Node, operation string) bool {
				temporary := accessorCandidates{}
				relevant := false
				values := query.occurrenceOrigins(input, node, origin, bindings, &temporary)
				seenValues := make(map[*ast.Node]bool)
				for next := 0; next < len(values); next++ {
					value := values[next]
					// An actual call can receive the demanded function through a local
					// literal container. Follow its existing source origins only, never
					// arbitrary properties, dependency implementations or getter bodies.
					if value.node != nil && len(value.path) == 0 && ast.IsObjectLiteralExpression(value.node) && !seenValues[value.node] {
						seenValues[value.node] = true
						for _, member := range value.node.AsObjectLiteralExpression().Properties.Nodes {
							if !query.charge(&temporary, member) {
								break
							}
							if ast.IsPropertyAssignment(member) {
								values = append(values, query.occurrenceOrigins(member.Initializer(), node, origin, bindings, &temporary)...)
							}
							if ast.IsShorthandPropertyAssignment(member) {
								values = append(values, query.occurrenceOrigins(member.Name(), node, origin, bindings, &temporary)...)
							}
						}
					}
					sameOrigin := value.node == origin
					if !sameOrigin {
						// Bare standard globals keep their authored identifier. Native
						// member lookup uses the declaration, so normalize possible
						// overlap without proving the current runtime entry unchanged.
						if nativeOriginKind != 0 {
							sameOrigin = query.nativeReceiverMatches(value, sourceValue{node: origin, native: &sourceNativeValue{kind: nativeOriginKind}})
						}
					}
					if sameOrigin {
						demand := append(append([]string{}, projection...), name)
						matches := (len(value.path) < len(demand) || mode&accessorReachable != 0) && sourceProjectionOverlap(value.path, demand)
						if operation == "array-mutation" && len(value.path) < len(demand) {
							key := demand[len(value.path)]
							_, indexed := sourceArrayIndex(key)
							// Existing native collection write facts concern elements and length.
							// They cannot invalidate an unrelated named slot such as this method.
							matches = matches && (indexed || key == "length" || key == "" || key == "*")
						}
						relevant = relevant || matches
					}
					for _, creator := range query.creators {
						if creator.invocation != nil && value.node == creator.invocation {
							relevant = true
						}
					}
				}

				return relevant
			}
			relevant := false
			var receiver *ast.Node
			if ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression) {
				receiver, _ = accessorReceiver(expression)
			}
			receiverRelevant := false
			query.withPendingWriterInput(node, result, func() {
				if call.Arguments != nil {
					for _, argument := range call.Arguments.Nodes {
						relevant = reaches(argument, "") || relevant
					}
				}
				receiverRelevant = receiver != nil && reaches(receiver, "")
			})
			if receiverRelevant {
				// Looking up the member precedes its invocation. Resolve possible authored
				// bodies with the same projection visitor, never by the method's spelling.
				candidates := query.receiverCandidates(node, bindings)
				implemented := len(candidates.values) != 0 && !candidates.opaque
				for _, value := range candidates.values {
					if value.node == nil {
						implemented = false
						result.opaque = true
						continue
					}
					if ast.IsFunctionLike(value.node) && value.node.Body() != nil {
						query.receiverInterference(value.node, node, sourceValue{node: origin, path: append(append([]string{}, projection...), name)}, bindings, result, make(map[*ast.Node]bool))
					} else if ast.IsCallExpression(value.node) {
						// Resolve the closure under its creating captures, but inspect only
						// receiver writes on the acquired value. Reacquiring its container
						// or executing reads here would revisit sibling calls.
						query.active[node] = true
						effects := query.accessors(value.node, value.path, "", accessorInvoke, bindings, func(body *ast.Node, captures sourceValueBindings, result *accessorCandidates) {
							query.receiverInterference(body, node, sourceValue{node: origin, path: append(append([]string{}, projection...), name)}, captures, result, make(map[*ast.Node]bool))
						})
						delete(query.active, node)
						result.opaque = result.opaque || effects.opaque
						implemented = implemented && len(effects.declarations) != 0
					} else {
						implemented = false
						// A bodyless authored value cannot inherit the consumer member's
						// library nonwriter classification through structural assignability.
						result.opaque = result.opaque || !standardLibrarySource(ast.GetSourceFileOfNode(value.node))
					}
				}
				result.opaque = result.opaque || candidates.opaque
				if implemented {
					continue
				}
				_, operation := stateWriteTarget(node, query.owner.checker)
				// Declaration-owned native nonwriters add no receiver write. Structural
				// types do not establish a concrete mutation or an append position.
				relevant = relevant || (operation != "" && reaches(receiver, operation)) || !nativeReceiverMemberDeclarations(expression, query.owner.checker)
			}

			if !relevant {
				continue
			}
			if standardLibraryCallRoot(expression, query.owner.checker) && ast.IsPropertyAccessExpression(expression) {
				receiver, name := accessorReceiver(expression)
				if ast.IsIdentifier(receiver) && ((receiver.Text() == "Object" && (name == "keys" || name == "values" || name == "entries")) || (receiver.Text() == "JSON" && name == "stringify")) {
					continue
				}
			}
			if view, ok := query.receiverInspectionInputs(node, origin, projection, name, result); ok {
				query.receiverInterferenceAtInputs(view.call.selection.declaration, node, sourceValue{node: origin, path: append(append([]string{}, projection...), name)}, bindings, result, make(map[*ast.Node]bool), view.call.inputs)
				continue
			}
			body, selected := query.executable.body(expression)
			if !selected {
				if symbol := resolvedCallableSymbol(callTargetSymbol(expression, query.owner.checker), query.owner.checker); symbol != nil {
					for _, declaration := range symbol.Declarations {
						if ast.IsFunctionLike(declaration) && declaration.Body() != nil {
							body = declaration
						}
					}
				}
			}
			if body == nil {
				body = query.siblingBody(expression, bindings)
			}
			if body == nil {
				if query.convertedOwnMemberInterference(node, origin, projection, name, mode, result) {
					continue
				}
				demand := append(append([]string{}, projection...), name)
				if query.reflectiveWriteDisjoint(node, origin, demand, bindings, result) {
					continue
				}
				result.opaque = true
				continue
			}
			query.receiverInterference(body, node, sourceValue{node: origin, path: append(append([]string{}, projection...), name)}, bindings, result, make(map[*ast.Node]bool))
		}
	}

	for _, index := range query.occurrenceSourceViewIn(origin, result, sources) {
		if ast.IsFunctionLike(origin) {
			// Literal containers may carry this function into an actual opaque call.
			// Test the current occurrence's arguments, not hypothetical future users.
			visit(index.calls)
		} else {
			visit(index.originCalls[origin])
		}
		visit(index.dynamicCalls)
		for _, creator := range query.creators {
			visit(index.originCalls[creator.invocation])
		}
	}
	return boundary
}

// receiverInterference follows only writes and forwarded arguments that can reach the
// demanded origin. Binding replacement is handled by liveValues, separately from mutation.
// Unknown or recursive writer routes remain incomplete under the same root budget.
func (query *sourceValueQuery) receiverInterference(body, call *ast.Node, demanded sourceValue, bindings sourceValueBindings, result *accessorCandidates, active map[*ast.Node]bool) {
	query.receiverInterferenceAtInputs(body, call, demanded, bindings, result, active, nil)
}

// receiverInterferenceAtInputs shares writer traversal while an actual selected
// installation reuses its receiver, captures and formal/default decisions. It
// never rebinds that input domain or suppresses possible writes/foreign routes.
func (query *sourceValueQuery) receiverInterferenceAtInputs(body, call *ast.Node, demanded sourceValue, bindings sourceValueBindings, result *accessorCandidates, active map[*ast.Node]bool, installed *sourceValueInputs) {
	// Values and getter effects belong to acquisition, not this may-write scan.
	// Once opacity is retained, more writer routes cannot change its verdict.
	if result.opaque {
		return
	}
	priorInspection := query.receiverInspection
	query.receiverInspection = nil
	defer func() { query.receiverInspection = priorInspection }()

	restoreOperation := query.suspendOperation()
	defer restoreOperation()
	if active[body] {
		result.opaque = true
		return
	}
	active[body] = true
	defer delete(active, body)
	bound := bindings
	if installed != nil {
		bound = installed.bindings
	} else {
		if query.dependenciesOnly {
			// This scan asks only whether the original input may reach a write.
			// Argument/Get effects were owned by that Call, not this later Get.
			inputs := accessorCandidates{}
			bound = query.bindArguments(body, call, bindings, &inputs)
			bound = query.memberWriterActualValues(body, call, bound, &inputs)
			result.opaque = result.opaque || inputs.opaque || inputs.receiverIncomplete || inputs.valueIncomplete
		} else {
			bound = query.bindArguments(body, call, bindings, result)
		}
	}
	query.withActiveInvocation(call, func() {
		for _, demand := range query.owner.summary(body).nodes {
			if result.opaque {
				return
			}
			if installed != nil {
			}
			query.owner.interferenceWork++
			if !query.charge(result, demand) {
				return
			}
			if target, operation := stateWriteTarget(demand, query.owner.checker); operation != "" {
				_, path := effectArgumentRoot(target)
				if len(path) == 0 {
					continue
				}
				temporary := accessorCandidates{}
				// Indexed may writes retain their RHS effects, but do not prove the
				// demanded post-call value or supersede its initializer.
				origins := query.origins(target, bound, &temporary)
				result.opaque = result.opaque || len(origins) == 0
				for _, value := range origins {
					if value.node == demanded.node && len(value.path) < len(demanded.path) && sourceProjectionOverlap(value.path, demanded.path) {
						var producer *ast.Node
						if query.dependenciesOnly && query.moduleCallWriteProducer(target, body, call, bound) {
							producer = call
						}
						result.opaque = result.opaque || len(origins) != 1 || !query.replacesSourceValue(value.node, value.path, target, accessorRead, producer, bound)
					} else if sourceReceiverOriginUnresolved(value) {
						result.opaque = true
					}
				}
				result.opaque = result.opaque || temporary.opaque
			}
			if !ast.IsCallExpression(demand) {
				continue
			}
			nested := demand.AsCallExpression()
			// Native adapters keep the same declaration-owned nonwriter contract as
			// direct receiver calls. Authored call/apply overrides are not normalized.
			expression, _, _ := restrictedCallArguments(nested.Expression, restrictedInvocationArguments(nested), query.owner.checker, make(map[ast.SymbolId]bool))
			if nativeReceiverMemberDeclarations(expression, query.owner.checker) {
				if _, operation := stateWriteTarget(demand, query.owner.checker); operation == "" {
					continue
				}
			}
			relevant := false
			if nested.Arguments != nil {
				for _, argument := range nested.Arguments.Nodes {
					relevant = query.receiverInputMayReach(argument, demanded, bound, result) || relevant
				}
			}
			if ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression) {
				receiver, _ := accessorReceiver(expression)
				relevant = query.receiverInputMayReach(receiver, demanded, bound, result) || relevant
			}

			if !relevant {
				continue
			}

			target, selected := query.executable.body(nested.Expression)
			if !selected {
				if symbol := resolvedCallableSymbol(callTargetSymbol(nested.Expression, query.owner.checker), query.owner.checker); symbol != nil {
					for _, declaration := range symbol.Declarations {
						if ast.IsFunctionLike(declaration) && declaration.Body() != nil {
							target = declaration
						}
					}
				}
			}
			if target == nil {
				result.opaque = true
				continue
			}
			query.receiverInterference(target, demand, demanded, bound, result, active)
		}
	})
}

// sourceReceiverOriginUnresolved distinguishes unknown input data from a known
// disjoint origin. It does not itself create execution opacity or execute work.
func sourceReceiverOriginUnresolved(value sourceValue) bool {
	return value.node == nil || ast.IsIdentifier(value.node) || value.node.Kind == ast.KindThisKeyword
}

// receiverInputMayReach retains the MAY route for missing or unresolved actuals.
// The selected body still decides whether that route writes. Recursive inspection
// shares this query's budget and never evaluates or publishes the actual again.
func (query *sourceValueQuery) receiverInputMayReach(input *ast.Node, demanded sourceValue, bindings sourceValueBindings, result *accessorCandidates) bool {
	temporary := accessorCandidates{}
	values := query.origins(input, bindings, &temporary)
	relevant := len(values) == 0 || temporary.valueIncomplete || temporary.receiverIncomplete
	for _, value := range values {
		relevant = relevant || value.node == demanded.node || sourceReceiverOriginUnresolved(value)
	}
	result.opaque = result.opaque || temporary.opaque
	return relevant
}

// siblingBody recognizes a direct returned method at the current finite creating site.
// It does not ask structural checker types to select an arbitrary instance implementation.
func (query *sourceValueQuery) siblingBody(expression *ast.Node, bindings sourceValueBindings) *ast.Node {
	if !ast.IsPropertyAccessExpression(expression) && !ast.IsElementAccessExpression(expression) {
		return nil
	}
	receiver, name := accessorReceiver(expression)
	if name == "" {
		return nil
	}
	temporary := accessorCandidates{}
	var body *ast.Node
	for _, origin := range query.origins(receiver, bindings, &temporary) {
		for factory, creator := range query.creators {
			if origin.node != creator.invocation || len(origin.path) != 0 {
				continue
			}
			for _, returned := range query.owner.summary(factory).returns {
				if !ast.IsObjectLiteralExpression(returned) {
					continue
				}
				for _, member := range returned.AsObjectLiteralExpression().Properties.Nodes {
					if ast.IsMethodDeclaration(member) && member.Name() != nil && callableNameText(member.Name()) == name {
						if body != nil && body != member {
							return nil
						}
						body = member
					}
				}
			}
		}
	}
	return body
}
