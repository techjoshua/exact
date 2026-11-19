package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// accessorsAtGetOutput admits a producer's initial acquisition exactly once.
// Later raw/acquired entries read that operation's output without its effects.
func (query *sourceValueQuery) accessorsAtGetOutput(receiver *ast.Node, path []string, name string, mode accessorTraversal, arguments sourceValueBindings, invoke func(*ast.Node, sourceValueBindings, *accessorCandidates), get *sourceGetInputs, producer *sourceNormalOperation, reference *sourceGetReference, alternatives ...sourceValue) (result accessorCandidates) {
	priorMode, priorKnown := query.traceMode, query.traceModeKnown
	query.traceMode, query.traceModeKnown = mode, true
	defer func() { query.traceMode, query.traceModeKnown = priorMode, priorKnown }()
	restoreDeferredRead := query.beginDeferredRead(get)
	defer restoreDeferredRead()
	previousReading := query.reading
	if query.reading == nil {
		query.reading = receiver
	}
	defer func() { query.reading = previousReading }()
	if arguments == nil {
		arguments = make(sourceValueBindings)
	}
	var readCut *sourceMemberWriterReadCut
	if event := query.installedMemberPhase; event != nil && mode == event.getMode() && query.installedMemberReaderOwned(get, event.read) {
		// An implicit native field retains its original Call operation and the
		// actual SOURCE return reader. Do not rebuild it from q.reading alone.
		readCut = event.read
	} else {
		readCut = query.memberWriterReadCut(reference, arguments, &result)
	}
	restoreReceiverData := query.lendStagedMemberReceiverRead(reference, readCut, path, name, mode)
	defer restoreReceiverData()
	typeChecker, owner := query.owner.checker, query.executable
	deep := mode&accessorReachable != 0
	enumerable := mode&accessorEnumerate != 0
	if get != nil && get.propertyKey != "" && (len(path) != 1 || name != "" || path[0] != get.propertyKey) {
		// A different residual read cannot inherit the outer Get operation.
		result.opaque, result.valueIncomplete = true, true
		return result
	}
	actualEmptyKey := false
	if operation := query.protectedMember; operation != nil && ast.IsElementAccessExpression(operation) {
		selected := sourceMemberKey(operation.AsElementAccessExpression().ArgumentExpression)
		actualEmptyKey = selected.resolved && selected.name == ""
		if !selected.resolved && !query.deferStagedAssignmentKey(operation, mode) {
			result.opaque = true
			result.cause = operation
		}
	}
	defer func() {
		query.sealInitializerCandidates(&result)
	}()
	var acquiredParent *sourceObservedValue
	type memberVisit struct {
		node       *ast.Node
		projection []string
		instance   bool
	}
	// Each branch owns its active prefix. Early returns need no cycle trail.
	var seen []memberVisit
	// Class heritage changes the declaration being selected, not the Get's
	// receiver. A NewExpression remains an origin, never a repeated construction.
	var inheritedReceiver *sourceValue
	var visit func(*ast.Node, []string, bool)
	// Unknown origins constrain a consumer. Acquiring an unused input has no effects.
	var visitOrigins func([]sourceValue, []string, bool)
	// Source member alternatives keep the writer's acquired bindings through
	// the next projection. Normal consumers retain their original raw route.
	visitMember := func(value sourceValue) {
		if query.dependenciesOnly {
			visitOrigins([]sourceValue{value}, nil, false)
		} else {
			visit(value.node, value.path, false)
		}
	}
	// The initial producer entry alone may acquire. A nested read of the same
	// in-progress slot refuses, while an independent sibling keeps its output.
	producerEntry := producer != nil
	visitProduced := func(node *ast.Node, projection []string, instance bool) bool {
		if node != nil && ast.IsNewExpression(node) {
			if observed, found := query.constructedOutput(node); found {
				retainResultUncertainty(observed, &result, query.getProjectionDemand())
				for _, value := range observed.values {
					visitOrigins([]sourceValue{value.value}, projection, instance)
				}
				return true
			}
		}
		if node == nil || !(ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node)) {
			return false
		}
		slot := query.normalOperation(node, false)
		if producerEntry && node == receiver && slot == producer {
			producerEntry = false
			return false
		}
		if slot == nil {
			return false
		}
		observed := normalGetOutput(slot)
		importCandidateReferences(&result, observed.componentRefs)
		importCandidateReferences(&result, ownedPopulationContributions(observed.ownedGets))
		mergeOwnedGets(&result.ownedGets, observed.ownedGets)
		retainResultUncertainty(observed, &result, query.getProjectionDemand())
		for _, original := range observed.values {
			if !query.charge(&result, node) {
				return true
			}
			original := original
			// Enter the existing alternative-preserving path. An identity read keeps
			// this acquired tuple, while a residual path still acquires its own child.
			value := original.value
			if value.ownedGetRow == nil {
				value.acquired = &original
			}
			visitOrigins([]sourceValue{value}, projection, instance)
		}
		return true
	}
	visitOrigins = func(values []sourceValue, projection []string, instance bool) {
		for _, term := range values {
			if query.projectFreezeLexicalReturn(term, projection, name, mode, arguments, &result, visit) {
				continue
			}
			if term.constructionCallable != nil {
				query.retainConstructionCallable(term.constructionCallable, append(append([]string(nil), term.path...), projection...), &result)
				continue
			}
			if term.constructionView != nil {
				path := append(append([]string(nil), term.path...), projection...)
				func() {
					actualGet := query.installedConstructionMemberGet(*term.constructionView, get, reference, path, name, mode)
					restore, owned := query.observeInstalledConstructionMember(*term.constructionView, actualGet, mode, arguments, &result)
					if owned {
						defer restore()
					}
					query.retainConstructionView(*term.constructionView, path, name, mode, instance, &result)
				}()
				continue
			}
			if term.descriptorView != nil {
				if query.observeDescriptorRecordGet(*term.descriptorView, reference, append(append([]string(nil), term.path...), projection...), name, mode, arguments, readCut, &result) {
					continue
				}
				if query.observeDescriptorStrongRead(*term.descriptorView, get, reference, append(append([]string(nil), term.path...), projection...), name, mode, arguments, readCut, &result) {
					continue
				}
				query.retainNativeDescriptorView(*term.descriptorView, append(append([]string(nil), term.path...), projection...), name, mode, instance, &result, arguments)
				continue
			}
			if term.frameworkView != nil {
				query.retainFrameworkView(*term.frameworkView, append(append([]string(nil), term.path...), projection...), name, mode, instance, &result)
				continue
			}
			if query.calleeWriteInventory != nil {
				query.recordEstimatedCost(1)
			}
			if query.calleeWriteInventory != nil && !inventorySourceValue(term) {
				query.calleeWriteInventory.unknown = true
				result.valueIncomplete = true
				continue
			}
			if term.instance != nil {
				query.constructedRead(term, projection, name, mode, arguments, &result, func(observed sourceObservedValue, path []string) {
					query.withAcquiredObservation(observed, &arguments, &acquiredParent, &result, func() { visitOrigins([]sourceValue{observed.value}, path, false) })
				}, func(target *ast.Node, path []string) {
					previous := inheritedReceiver
					receiver := term
					receiver.path = nil
					inheritedReceiver = &receiver
					defer func() { inheritedReceiver = previous }()
					visit(target, path, true)
				})
				continue
			}
			if term.ownedGetRow != nil {
				mergeOwnedGets(&result.ownedGets, []*ownedGetPopulation{term.ownedGetRow.population})
				if len(projection) == 0 && name == "" {
					result.values = append(result.values, term)
				} else {
					result.valueIncomplete = true
					result.opaque = true
				}
				continue
			}
			if term.initializerUse != nil {
				resolved := query.resolveInitializerUse(term, &result)
				visitOrigins(resolved, projection, instance)
				continue
			}
			if term.number == (numberPayload{}) && term.acquired == nil && term.normal == nil && visitProduced(term.node, append(append([]string(nil), term.path...), projection...), instance) {
				continue
			}
			if term.entrySlot != nil {
				fieldPath := append(append([]string(nil), term.path...), projection...)
				if len(fieldPath) == 0 && name == "" && mode == accessorAcquire {
					result.valueIncomplete = true
					result.values = append(result.values, term)
					if result.callableScopes == nil {
						result.callableScopes = make(map[int]acquiredCallableScope)
					}
					result.callableScopes[len(result.values)-1] = query.acquireCallableScope(arguments, &result)
				} else {
					key := name
					if len(fieldPath) == 1 && name == "" {
						key = fieldPath[0]
					}
					if len(fieldPath) > 1 || len(fieldPath) == 1 && name != "" {
						key = ""
					}
					term.path = nil
					query.missingFieldGet(term, key, query.protectedMember, &result)
				}
				continue
			}
			if term.capture != nil {
				scope := term.capture
				term.capture = nil
				previousArguments, previousCreators := arguments, query.creators
				arguments, query.creators = scope.bindings, scope.creators
				visitOrigins([]sourceValue{term}, projection, instance)
				arguments, query.creators = previousArguments, previousCreators
				continue
			}
			if term.normal != nil {
				// Acquired bindings can already carry a member path. Consume it
				// at this exact Get before deriving the slot relation, just as a
				// direct member demand consumes its explicit projection.
				projection := projection
				if len(term.path) != 0 {
					for range len(term.path) + len(projection) {
						if !query.charge(&result, term.node) {
							return
						}
					}
					projection = append(append([]string(nil), term.path...), projection...)
					term.path = nil
				}
				key := name
				if len(projection) == 1 && name == "" {
					key = projection[0]
				}
				if query.protectedMember != nil && key != "" && len(projection) <= 1 {
					result.fieldAlternatives = append(result.fieldAlternatives, sourceFieldAlternative{operation: query.protectedMember, key: key, value: term})
				}
				scope, admitted := query.normalValueScope(term, &result)
				if !admitted {
					result.opaque = true
					continue
				}
				func() {
					previousArguments, previousCreators, previousGet := arguments, query.creators, get
					defer func() { arguments, query.creators, get = previousArguments, previousCreators, previousGet }()
					arguments, query.creators = scope.bindings, scope.creators
					key := name
					if len(projection) == 1 && name == "" {
						key = projection[0]
					}
					if get != nil {
						if !query.explicitGetProjection(get, term, projection, name, &result) {
							result.opaque, result.valueIncomplete = true, true
							return
						}
						if get.operation == query.protectedMember {
							if proof := query.normalFieldGet(term, key, get.operation, &result); proof != nil && proof.ownSlot != nil {
								actual := *get
								actual.ownSlot = proof.ownSlot
								get = &actual
							}
						}
					} else if len(projection) <= 1 {
						get = query.normalFieldGet(term, key, query.protectedMember, &result)
					}
					term.normal = nil
					visitOrigins([]sourceValue{term}, projection, instance)
				}()
				continue
			}
			if term.acquired != nil {
				if get != nil && !query.explicitGetProjection(get, term, projection, name, &result) {
					result.opaque, result.valueIncomplete = true, true
					continue
				}
				observed := *term.acquired
				observed.value = term
				observed.value.acquired = nil
				// Preserve a residual member projection without reacquiring the Get.
				observed.value.path = term.path
				inspection := query.receiverInspectionFor(term.acquired, term, projection, name, &result)
				query.withAcquiredObservation(observed, &arguments, &acquiredParent, &result, func() {
					if observed.value.undefined {
						result.values = append(result.values, observed.value)
					} else if mode == accessorAcquire && len(projection) == 0 && len(term.path) == 0 && name == "" && term.node != nil && !ast.IsIdentifier(term.node) && !ast.IsConditionalExpression(term.node) && !ast.IsBinaryExpression(term.node) {
						if result.callableScopes == nil {
							result.callableScopes = make(map[int]acquiredCallableScope)
						}
						result.callableScopes[len(result.values)] = query.copyCallableScope(observed.scope, &result)
						// This identity transfer keeps the acquired source routing as well
						// as its original scope. A signature cannot retarget this value.
						result.sourceCallable = result.sourceCallable || query.sourceCallableImplementation(term.node, &result)
						result.values = append(result.values, term)
					} else {
						visitOrigins([]sourceValue{observed.value}, projection, instance)
					}
				}, inspection)
				continue
			}
			// Acquired Number trees are output artifacts, not another source visit.
			// Existing normal/acquired wrappers above retain their original scope.
			if term.number != (numberPayload{}) {
				known, _, _ := query.acquiredNumberDecision(term)
				if !known || len(term.path) != 0 || len(projection) != 0 || name != "" || instance || mode == accessorInvoke || mode&accessorSet != 0 {
					result.opaque, result.valueIncomplete = true, true
				} else if mode == accessorAcquire {
					result.values = append(result.values, term)
				}
				continue
			}
			if term.bound != nil && len(term.path) == 0 && len(projection) == 0 && name == "" && mode == accessorAcquire {
				result.sourceCallable = true
				if result.callableScopes == nil {
					result.callableScopes = make(map[int]acquiredCallableScope)
				}
				result.callableScopes[len(result.values)] = query.copyCallableScope(term.bound.scope, &result)
				result.values = append(result.values, term)
				continue
			}
			if term.awaited != nil && query.returnObservation != nil && mode == accessorAcquire && len(term.path) == 0 && len(projection) == 0 && name == "" {
				term.forwarded = query.forwardingTrace(&result, term.forwarded, query.returnObservation.path)
				if result.callableScopes == nil {
					result.callableScopes = make(map[int]acquiredCallableScope)
				}
				result.callableScopes[len(result.values)] = query.acquireCallableScope(arguments, &result)
				result.values = append(result.values, term)
				continue
			}
			if !query.dependenciesOnly && query.protectedMember != nil && (name != "" && len(projection) == 0 || name == "" && len(projection) == 1) && !query.ownsDataSlot(get, term.node, projection, name, mode) {
				result.fieldReceiverIncomplete = true
			}
			if term.native != nil {
				query.nativeMemberKeyAtGet(term, projection, name, nil, mode, arguments, &result, visit, get, visitMember)
				continue
			}
			if term.undefined {
				continue
			}
			if term.copied != nil {
				path := projection
				if len(path) == 0 && name != "" {
					path = []string{name}
				}
				if query.copiedFieldEffectOwned(term, path, &result) {
					result.sourceOwned = true
				}
				if len(path) > 0 {
					for _, entry := range query.boundProjection([]sourceValue{term}, path, &result) {
						var selected accessorCandidates
						if query.calleeWriteInventory != nil {
							// Selected children retain their carrier and capture through
							// the same guarded visitor as direct source alternatives.
							selected = query.accessorsAtGetOutput(nil, nil, "", mode, arguments, invoke, nil, nil, nil, entry)
						} else {
							selected = query.accessors(entry.node, entry.path, "", mode, arguments, invoke)
						}
						mergeAccessorCandidates(&result, selected)
						for index, scope := range selected.callableScopes {
							if result.callableScopes == nil {
								result.callableScopes = make(map[int]acquiredCallableScope)
							}
							result.callableScopes[len(result.values)+index] = scope
						}
						result.values = append(result.values, selected.values...)
					}
				}
				continue
			}
			if term.node == nil {
				result.opaque = true
				continue
			}
			if observed := query.returnObservation; observed != nil {
				previous := observed.path
				observed.path = query.forwardingTrace(&result, previous, term.forwarded)
				visit(term.node, append(append([]string{}, term.path...), projection...), instance)
				observed.path = previous
			} else {
				visit(term.node, append(append([]string{}, term.path...), projection...), instance)
			}
		}
	}
	visit = func(value *ast.Node, projection []string, instance bool) {
		value = unwrapSourceCallableReference(value)
		if mode == accessorSet|accessorNoGet && query.setterInput != nil && query.setterInput.assignment != nil {
			finishAssignmentAlternative := query.stagedAssignmentAlternativeVisit(mode)
			defer finishAssignmentAlternative()
		}
		if query.calleeWriteInventory != nil && value != nil && (ast.IsCallExpression(value) || ast.IsNewExpression(value) || ast.IsTaggedTemplateExpression(value)) {
			// Output-producing syntax is not a represented direct method body.
			// Keep its uncertainty without starting another argument/body driver.
			query.calleeWriteInventory.unknown = true
			result.valueIncomplete = true
			return
		}
		if query.projectGetEffectsSource(value, projection, mode, get, visit) {
			return
		}
		if query.projectAssignmentSourceReceiver(value, mode, &result, visit) {
			return
		}
		if query.deferStagedAssignmentReceiver(value, mode, &result) {
			return
		}
		if query.deferStagedWriterInputOperation(value, &result) {
			return
		}
		if visitProduced(value, projection, instance) {
			return
		}
		if query.operation != nil && query.operation.outputOnly && value != nil && (ast.IsPropertyAccessExpression(value) || ast.IsElementAccessExpression(value)) {
			// This return demand did not retain a Get output. Syntax and an
			// installed scope cannot authorize a second Get to recover it.
			result.valueIncomplete = true
			return
		}

		acquired := len(result.values)
		unknownAcquired := query.stagedWriterUnknownSourceCount()
		defer func() {
			// Every value branch must contribute a finite origin or retain uncertainty.
			if mode == accessorAcquire && len(result.values) == acquired && query.stagedWriterUnknownSourceCount() == unknownAcquired {
				result.valueIncomplete = true
			}
		}()
		if observed := query.returnObservation; observed != nil {
			previous := observed.path
			observed.path = query.forwardingTrace(&result, previous, []*ast.Node{value})
			defer func() { observed.path = previous }()
		}
		if value == nil {
			return
		}
		for _, prior := range seen {
			if prior.node == value && prior.instance == instance && slices.Equal(prior.projection, projection) {
				result.opaque = true
				query.owner.widenings++
				return
			}
		}
		if len(seen) == 128 {
			result.opaque = true
			return
		}
		query.remaining--
		query.recordEstimatedCost(1)
		query.owner.work++
		// A getter can select another member of its original receiver. Only a
		// repeated receiver/projection lookup is a local cycle. Outer visits
		// remain active until their own selected output has been consumed.
		slot := len(seen)
		if seen == nil {
			seen = make([]memberVisit, 0, 4)
		}
		seen = append(seen, memberVisit{value, slices.Clone(projection), instance})
		defer func() {
			seen[slot] = memberVisit{}
			seen = seen[:slot]
		}()
		if ast.IsSpreadElement(value) {
			result.opaque = true
			visit(value.AsSpreadElement().Expression, append([]string{"*"}, projection...), false)
			return
		}
		if ast.IsCallExpression(value) && len(projection) == 0 && name == "" && mode == accessorAcquire && query.excludeNativeDirectExposure(value, arguments) {
			return
		}
		if ast.IsCallExpression(value) && query.returnObservation != nil && len(projection) == 0 && name == "" && mode == accessorAcquire {
			if query.acquireAsyncFacade(value, &result) {
				return
			}
		}
		if ast.IsAwaitExpression(value) && query.returnObservation != nil {
			query.observeNativeAwait(value, arguments, &result)
			return
		}
		if ast.IsBinaryExpression(value) {
			binary := value.AsBinaryExpression()
			if binary.OperatorToken.Kind == ast.KindCommaToken || binary.OperatorToken.Kind == ast.KindEqualsToken {
				// A normal comma continuation observes the completed left PutValue.
				// This binding is scoped to this result traversal, never indexed entry.
				previousArguments := arguments
				if query.returnObservation != nil && binary.OperatorToken.Kind == ast.KindCommaToken {
					left := unwrapSourceCallableReference(binary.Left)
					if ast.IsBinaryExpression(left) && left.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken && ast.IsIdentifier(left.AsBinaryExpression().Left) {
						assignment := left.AsBinaryExpression()
						symbol := typeChecker.GetSymbolAtLocation(assignment.Left)
						if symbol != nil && symbol.ValueDeclaration != nil && ast.IsVariableDeclaration(symbol.ValueDeclaration) && enclosingCallableNode(symbol.ValueDeclaration) == enclosingCallableNode(left) {
							acquired := query.accessors(assignment.Right, nil, "", accessorAcquire, arguments, nil)
							mergeAccessorCandidates(&result, acquired)
							arguments = query.acquireCallableScope(previousArguments, &result).bindings
							for i := range acquired.values {
								acquired.values[i].forwarded = query.forwardingTrace(&acquired, acquired.values[i].forwarded, []*ast.Node{assignment.Left})
							}
							arguments[ast.GetSymbolId(symbol)] = acquired.values
						}
					}
				}
				visit(binary.Right, projection, false)
				arguments = previousArguments
				return
			}
			if binary.OperatorToken.Kind == ast.KindBarBarToken || binary.OperatorToken.Kind == ast.KindAmpersandAmpersandToken || binary.OperatorToken.Kind == ast.KindQuestionQuestionToken {
				known, truthy, nullish := query.branchDecision(binary.Left, arguments)
				take := sourceLogicalTakesRight(binary.OperatorToken.Kind, truthy, nullish)
				if !known || !take {
					visit(binary.Left, projection, false)
				}
				if !known || take {
					visit(binary.Right, projection, false)
				}
			}
			return
		}
		if ast.IsConditionalExpression(value) {
			conditional := value.AsConditionalExpression()
			known, truthy, _ := query.branchDecision(conditional.Condition, arguments)
			if !known || truthy {
				visit(conditional.WhenTrue, projection, false)
			}
			if !known || !truthy {
				visit(conditional.WhenFalse, projection, false)
			}
			return
		}
		if ast.IsPropertyAccessExpression(value) {
			member := value.AsPropertyAccessExpression()
			visit(member.Expression, append([]string{member.Name().Text()}, projection...), false)
			return
		}
		if ast.IsElementAccessExpression(value) {
			member := value.AsElementAccessExpression()
			selected := sourceMemberKey(member.ArgumentExpression)
			if !selected.resolved {
				// Children already evaluated this key under the actual original
				// scope. Possible named members do not cover unknown lookup,
				// inherited alternatives or traps. Keep that effect obligation.
				result.opaque = true
				if result.cause == nil {
					result.cause = value
				}
			}
			visit(member.Expression, append([]string{selected.name}, projection...), false)
			return
		}
		if mode == accessorAcquire && len(projection) == 0 && !ast.IsIdentifier(value) && (!query.dependenciesOnly || !ast.IsCallExpression(value)) && (query.returnObservation == nil || !ast.IsCallExpression(value)) {
			if ast.IsFunctionLike(value) && value.Body() != nil {
				returned := false
				for owner, creator := range query.creators {
					if !query.charge(&result, owner) {
						return
					}
					if creator.returning != nil {
						returned = true
						break
					}
				}
				if returned {
					scope := query.acquireCallableScope(arguments, &result)
					if result.callableScopes == nil {
						result.callableScopes = make(map[int]acquiredCallableScope)
					}
					result.callableScopes[len(result.values)] = scope
				}
			}
			term := sourceValue{node: value}
			if query.dependenciesOnly && (ast.IsObjectLiteralExpression(value) || ast.IsArrayLiteralExpression(value) || ast.IsFunctionLike(value) || ast.IsNewExpression(value)) {
				scope := query.acquireCallableScope(arguments, &result)
				term.capture = &scope
			}
			if query.returnObservation != nil {
				term.forwarded = query.forwardingTrace(&result, query.returnObservation.path)
				if result.callableScopes == nil {
					result.callableScopes = make(map[int]acquiredCallableScope)
				}
				result.callableScopes[len(result.values)] = query.acquireCallableScope(arguments, &result)
			}
			// This terminal is the actual child acquisition under the installed
			// parent observation. Retain its own value/scope with that construction.
			if acquiredParent != nil {
				scope, ok := result.callableScopes[len(result.values)]
				if !ok {
					scope = query.acquireCallableScope(arguments, &result)
				}
				child := sourceObservedValue{value: term, inputs: acquiredParent.inputs, scope: scope, returned: acquiredParent.returned}
				term.acquired = &child
			}
			query.observeStagedHasInstanceCreation(term)
			result.values = append(result.values, term)
			return
		}
		if ast.IsNewExpression(value) {
			previousReceiver := inheritedReceiver
			inheritedReceiver = &sourceValue{node: value}
			defer func() { inheritedReceiver = previousReceiver }()
			query.visitConstructedAccessor(sourceConstructedMemberDemand{value, projection, name, mode, reference}, arguments, &result, visit, visitOrigins)
			return
		}
		if len(projection) > 1 && projection[0] == "prototype" && sourceFunctionPrototype(sourceValue{node: value, path: projection[:1]}, typeChecker) {
			// Native prototype identity is only a possible source write route.
			// Keep its original/unaccounted member beside acquired source bodies.
			query.memberValuesAtGet(value, projection, name, mode, arguments, &result, visitMember, sourceMemberOperationProof{}, nil, readCut)
			result.opaque = true
			result.valueIncomplete = true
			for _, term := range result.values[acquired:] {
				result.sourceCallable = result.sourceCallable || query.sourceCallableImplementation(term.node, &result)
			}
			return
		}
		if query.sourceCallableImplementation(value, &result) && (len(projection) > 0 || name != "") {
			result.sourceCallable = true
			actualGet := get
			if actualGet == nil && query.protectedMember != nil && mode == accessorAcquire && len(projection) == 1 && name == "" {
				if slot := query.normalOperation(query.protectedMember, false); slot != nil && slot.state == sourceOperationInProgress && slot.authority.valid(query) {
					actualGet = &sourceGetInputs{operation: query.protectedMember, receiver: sourceValue{node: value}, propertyKey: projection[0]}
				}
			}
			actualGet = query.functionPrototypeLookup(actualGet, value, &result)
			// Definition requirements and actual member effects are independent of
			// a whole-prefix descriptor certificate. Query-owned writes still select
			// authored methods and retain unresolved lookup/invocation alternatives.
			members := accessorCandidates{}
			operation := sourceMemberOperationProof{}
			if query.moduleRead() != nil {
				operation = query.sourceMemberOperation(value, projection, name, mode, arguments, &result)
			}
			replaced := query.memberValuesAtGet(value, projection, name, mode, arguments, &members, visitMember, operation, actualGet, readCut)
			ordinary, occurrence := query.ordinaryFunctionMember(value, projection, name, mode)
			// A possible authored replacement does not remove the original adapter.
			// Keep both bodies until a completed replacement owns the property.
			if ordinary != nil && !members.ownOperation && !replaced {
				body := sourceInvocationBody{invocation: occurrence, declaration: value, scope: query.acquireCallableScope(arguments, &result)}
				result.ordinaryBodies = append(result.ordinaryBodies, body)
				if mode == accessorAcquire {
					var header *sourceOrdinaryAdapter
					if query.operation != nil && query.operation.inputs != nil && normalCalleeGetOwner(query.protectedMember) == occurrence {
						if slot := query.normalOperation(query.protectedMember, false); slot != nil && slot.state == sourceOperationInProgress {
							header = &sourceOrdinaryAdapter{body: body, operation: query.protectedMember, frame: query.operation.inputs}
						}
					}
					for _, declaration := range ordinary.Declarations {
						result.values = append(result.values, sourceValue{node: declaration, adapter: header})
					}
				}
			}
			if members.opaque && query.moduleRead() != nil {
				// A completed eager operation can refine its own effect facts. Ordinary
				// body routing never requires this certificate, and refusal adds nothing.
				if operation.closed {
					members.opaque = false
					members.cause = nil
				}
			}
			// The generic join transfers effects only. Converted descriptors also
			// produced values under their original Get/descriptor scopes, which
			// must reach the enclosing Get without rebinding to this consumer.
			for i, member := range members.values {
				if !query.charge(&result, member.node) {
					break
				}
				if member.ownedGetRow == nil {
					scope, ok := members.callableScopes[i]
					if member.acquired != nil {
						scope, ok = member.acquired.scope, true
					}
					if !ok {
						result.valueIncomplete = true
						continue
					}
					if result.callableScopes == nil {
						result.callableScopes = make(map[int]acquiredCallableScope)
					}
					result.callableScopes[len(result.values)] = scope
				}
				result.values = append(result.values, member)
			}
			mergeAccessorCandidates(&result, members)
			result.valueIncomplete = result.valueIncomplete || !replaced && len(result.values) == acquired
			return
		}
		if query.visitSourceCallableInvocation(value, projection, mode, arguments, &result, invoke) {
			return
		}
		if ast.IsArrayLiteralExpression(value) {
			result.sourceOwned = true
			query.arrayValues(value, projection, name, mode, arguments, &result, visit, visitMember, get)
			return
		}
		if ast.IsClassDeclaration(value) || ast.IsClassExpression(value) || ast.IsObjectLiteralExpression(value) {

			result.sourceOwned = true
			if containsString(projection, "*") {
				result.opaque = true
				result.cause = value
			}
			// Member interference and descriptor lookup consume this same actual Get.
			// The lookup origin never replaces an inherited getter's receiver.
			actualReceiver := sourceValue{node: value}
			if !ast.IsObjectLiteralExpression(value) && inheritedReceiver != nil {
				actualReceiver = *inheritedReceiver
			}
			selectedGet := &sourceGetInputs{operation: query.reading, receiver: actualReceiver}
			if get == nil && query.installedCallSelectionObservationOwned(query.stagedMember, query.protectedMember) {
				actualKey := name
				if len(projection) == 1 && name == "" {
					actualKey = projection[0]
				}
				_, selectedKey := accessorReceiver(query.protectedMember)
				if actualKey == selectedKey && actualKey != "" {
					selectedGet.operation, selectedGet.propertyKey = query.protectedMember, actualKey
					readCut = &sourceMemberWriterReadCut{operation: selectedGet.operation, use: query.reading, scope: readCut.scope, saved: readCut.saved}
				}
			}
			var argumentLookup *sourceStagedFieldArgumentLookup
			if get != nil && len(projection) == 0 && name == "" && query.liveStagedMapObservation(get, mode) {
				selectedGet = get
			} else if get != nil && len(projection) == 1 && name == "" && (get.propertyKey == "" || get.propertyKey == projection[0]) && (get.receiver.node == value || inheritedReceiver != nil && get.receiver.node == inheritedReceiver.node && len(get.receiver.path) == 0 || query.stagedLocalGetEffectsSelection(get, value, projection, name, mode)) {
				// The selected New/class/heritage route changes lookup origin only.
				// Preserve this read's receiver tuple, native relation and Has cell.
				selectedGet, argumentLookup = query.copyStagedFieldLookupGet(get, value)
			} else if get != nil {
				// An explicit operation cannot be lent to an unrelated child read.
				result.opaque, result.valueIncomplete = true, true
				return
			}
			if selectedGet.receiver.node != value && !query.liveStagedMapObservation(get, mode) {
				lookup := sourceValue{node: value}
				selectedGet.lookupOwner = &lookup
				if selectedGet.inspection != nil {
					local := *selectedGet.inspection
					local.lookup = selectedGet.lookupOwner
					selectedGet.inspection = &local
				}
			}
			if mode == accessorSet|accessorNoGet && query.setterInput != nil && query.setterInput.assignment != nil {
				releaseAssignmentAlternative := query.beginStagedAssignmentAlternative(value, selectedGet, mode)
				defer releaseAssignmentAlternative()
			}
			if ast.IsObjectLiteralExpression(value) && query.frozenOwnGet(value, projection, name, mode, selectedGet, acquiredParent, &result) {
				return
			}
			// Only a whole anonymous return allocation can bypass prior own writes
			// at its immediate settlement Get. This is a language transfer fact
			// supplied by the operation owner, never an indexed-origin certificate.
			freshGet := get != nil && get.freshReturn && get.receiver.node == value && len(get.receiver.path) == 0 && len(projection) == 1 || query.stagedFreshGetResult(selectedGet, value)
			if mode != accessorReachable && !freshGet && (get == nil || !get.hasOnly) {
				if query.dependenciesOnly {
					key := name
					if len(projection) == 1 && name == "" {
						key = projection[0]
					}
					if len(projection) == 0 || len(projection) == 1 && name == "" {
						restorePhase := query.beginAuthoredInstalledMemberPopulation(selectedGet, readCut, mode, key, value)
						defer restorePhase()
					}
				}
				// The collector already validated this observation before stripping
				// its wrapper. Lend it only to the synchronous constraint lookup.
				proofGet := selectedGet
				if acquiredParent != nil && acquiredParent.inputs == query.inputs && acquiredParent.value.node == value {
					copy := *selectedGet
					copy.receiver.acquired = acquiredParent
					if query.nativeFreezeFor(&copy, value, selectedGet.operation, &result) != nil {
						proofGet = &copy
					}
				}
				handled := false
				func() {
					revokeLookup := argumentLookup.begin(query, proofGet, mode)
					defer revokeLookup()
					visitLookupMember := func(value sourceValue) {
						restoreLookup := query.suspendStagedFieldArgumentLookup()
						defer restoreLookup()
						visitMember(value)
					}
					handled = query.memberValuesAtGet(value, projection, name, mode, arguments, &result, visitLookupMember, sourceMemberOperationProof{}, proofGet, readCut)
				}()
				if assignment := query.liveStagedAssignment(); assignment != nil {
					query.recordStagedAssignmentCoverage(assignment.alternative)
				}
				if len(projection) == 0 && name == "" && query.observeStagedMapObject(value, sourceValue{node: value}, get, mode) {
					query.observeStagedMapWriterDisposition(value, get, mode)
					result.sourceOwned, result.valueIncomplete = true, true
					return
				}
				if query.stagedHasInstance != nil && (ast.IsClassDeclaration(value) || ast.IsClassExpression(value)) {
					query.withStagedHasInstanceSelectedGet(selectedGet, func() bool {
						return query.observeStagedHasInstanceClassDefault(value, selectedGet, query.acquireCallableScope(arguments, &result))
					})
				}
				if handled {
					return
				}
			}
			var members []*ast.Node
			if ast.IsObjectLiteralExpression(value) {
				members = value.AsObjectLiteralExpression().Properties.Nodes
			}
			if ast.IsClassDeclaration(value) {
				members = value.AsClassDeclaration().Members.Nodes
			}
			if ast.IsClassExpression(value) {
				members = value.AsClassExpression().Members.Nodes
			}
			selection := name
			exactEmpty := actualEmptyKey && len(projection) <= 1
			if len(projection) > 0 {
				selection = projection[0]
			}
			if get != nil && get.presence != nil && get.hasOnly && get.receiver.node == value && len(projection) == 1 && ast.IsObjectLiteralExpression(value) {
				if query.liveStagedFieldMemberSource(get) {
					// The original Has owns source discovery independently of
					// presence. It cannot inherit the later Get's source interval.
					query.memberValuesAtGet(value, projection, name, mode, arguments, &result, visitMember, sourceMemberOperationProof{}, get, readCut)
				}
				ordinary := true
				owns := false
				for _, field := range members {
					if !query.charge(&result, field) {
						ordinary = false
						break
					}
					if field.Name() == nil || ast.IsComputedPropertyName(field.Name()) || ast.IsSpreadAssignment(field) || callableNameText(field.Name()) == "__proto__" {
						ordinary = false
					}
					owns = owns || field.Name() != nil && !ast.IsComputedPropertyName(field.Name()) && callableNameText(field.Name()) == selection
				}
				// Has on an already selected ordinary own slot invokes no getter.
				// Its Effects accounting does not establish property presence or
				// settle the independent prototype/value precision lookup below.
				query.recordReflectiveFieldHas(get, projection, name, ordinary && owns, &result)
				if ordinary {
					query.observeStagedFieldEntryLaw(get, stagedFieldOrdinaryHasNoUserEntry)
				}
				ownHasAccounted := ordinary && owns && !result.opaque && !result.receiverIncomplete
				inherited := query.propertyReferenceEffects(get, selection, arguments, &result, readCut)
				if ordinary && !result.opaque && inherited == propertyAbsent {
					if owns {
						*get.presence = propertyPresent
					} else {
						*get.presence = propertyAbsent
					}
				} else {
					*get.presence = propertyUnknown
				}
				if get.stagedEffects != nil {
					accounting := sourceEffectsUnaccounted
					if ownHasAccounted || ordinary && !result.opaque && inherited == propertyAbsent || ordinary && query.liveStagedFieldGet(get) && get.stagedEffects.observation != nil && get.stagedEffects.observation.sourceHas {
						accounting = sourceEffectsAccounted
					}
					query.observeStagedFieldHas(get, *get.presence, accounting, get.stagedEffects.observation)
				}
				return
			}
			ownsSelection := false
			ownGetter, ownSetter := false, false
			for _, member := range members {
				if !ast.IsObjectLiteralExpression(value) && ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) == instance {
					continue
				}
				if enumerable && !ast.IsObjectLiteralExpression(value) && (ast.IsGetAccessorDeclaration(member) || ast.IsSetAccessorDeclaration(member)) {
					continue
				}
				// Instance initialization belongs to actual construction. Neither Has
				// nor a later Get may reconstruct it from a declaration initializer.
				if (selection != "" || exactEmpty) && member.Name() != nil && !ast.IsComputedPropertyName(member.Name()) && callableNameText(member.Name()) == selection {
					ownsSelection = true
					if mode == accessorSet|accessorNoGet {
						query.observeStagedAssignmentData(member, selectedGet)
					}
					ownGetter = ownGetter || ast.IsGetAccessorDeclaration(member)
					ownSetter = ownSetter || ast.IsSetAccessorDeclaration(member)
				}
				if mode == accessorSet|accessorNoGet && query.setterInput != nil && query.setterInput.assignment != nil {
					query.observeStagedAssignmentAccessor(member, selection)
				}
				if ast.IsSpreadAssignment(member) {
					visit(member.AsSpreadAssignment().Expression, projection, false)
					continue
				}
				if deep && instance && query.dependenciesOnly && ast.IsPropertyDeclaration(member) {
					query.visitSourceConstructedField(member, actualReceiver, arguments, &result, readCut, func(values []sourceValue) {
						previousGet, previousReference := get, reference
						get, reference = nil, reference.after(projection, name)
						visitOrigins(values, projection, false)
						get, reference = previousGet, previousReference
					})
				}
				if deep && ast.IsPropertyAssignment(member) {
					visit(member.AsPropertyAssignment().Initializer, projection, false)
				}
				if deep && ast.IsShorthandPropertyAssignment(member) {
					visit(member.Name(), projection, false)
				}
				if len(projection) > 0 {
					privateMatch, privateGet := query.sourcePrivateMemberMatch(member, projection)
					computedMayMatch := !privateGet && member.Name() != nil && ast.IsComputedPropertyName(member.Name()) && sourceLiteralMemberName(member.Name().AsComputedPropertyName().Expression) == ""
					if member.Name() != nil && (privateMatch || !privateGet && (projection[0] == "" && !exactEmpty || projection[0] == "*" || callableNameText(member.Name()) == projection[0] || computedMayMatch)) {
						if query.observeStagedGetResultMember(value, member, selectedGet, mode, computedMayMatch, arguments, &result) {
							continue
						}
						if query.stagedHasInstance != nil {
							if query.withStagedHasInstanceSelectedGet(selectedGet, func() bool {
								scope := query.acquireCallableScope(arguments, &result)
								return query.observeStagedHasInstanceMember(value, member, selectedGet, selectedGet.receiver, scope, projection, name, mode, computedMayMatch, &result)
							}) {
								continue
							}
						}
						if computedMayMatch {
							result.opaque = true
						}
						if (mode == accessorAcquire || mode == accessorInvoke) && ast.IsMethodDeclaration(member) {
							query.recordReflectiveFieldRead(get, projection, name, mode, nil, sourceEffectsAccounted, &result)
							query.recordStagedFieldRead(get, nil, sourceEffectsAccounted, &result)
							query.observeStagedFieldOwnDataEntry(get, member, projection, name, mode)
							if query.stagedFieldDataEffectsOnly(get, projection, name, mode) {
								query.recordStagedFieldCallable(get, member)
								result.valueIncomplete = true
							} else {
								visit(member, projection[1:], false)
							}
						}
						if ast.IsPropertyAssignment(member) || ast.IsShorthandPropertyAssignment(member) {
							query.recordReflectiveFieldRead(get, projection, name, mode, nil, sourceEffectsAccounted, &result)
							query.recordStagedFieldRead(get, nil, sourceEffectsAccounted, &result)
							query.observeStagedFieldOwnDataEntry(get, member, projection, name, mode)
							// This selected data read is consumed. Its output owns
							// any later child read, not this receiver's outer Get.
							previousGet, previousReference := get, reference
							get, reference = nil, reference.after(projection, name)
							if ast.IsPropertyAssignment(member) {
								query.recordStagedFieldCallable(selectedGet, member.AsPropertyAssignment().Initializer)
							}
							if query.stagedFieldDataEffectsOnly(selectedGet, projection, name, mode) {
								result.valueIncomplete = true
							} else if ast.IsPropertyAssignment(member) {
								visit(member.AsPropertyAssignment().Initializer, projection[1:], false)
							} else {
								visit(member.Name(), projection[1:], false)
							}
							get, reference = previousGet, previousReference
						}
						if ast.IsGetAccessorDeclaration(member) {
							if mode&accessorNoGet == 0 && len(projection) == 1 && name == "" && mode != accessorAcquire && mode != accessorInvoke && !deep {
								query.executeGetEffects(member, selectedGet, query.acquireCallableScope(arguments, &result), &result)
							} else if mode&accessorNoGet == 0 && query.operation != nil && query.operation.outputOnly {
								result.valueIncomplete = true
							} else if mode&accessorNoGet == 0 {
								observed := query.acquireGetResult(member, selectedGet, query.acquireCallableScope(arguments, &result), &result)
								query.recordReflectiveFieldRead(selectedGet, projection, name, mode, member, observed.effects, &result)
								query.recordStagedFieldRead(selectedGet, member, observed.effects, &result)
								retainResultUncertainty(observed, &result, query.getProjectionDemand())
								// Import once before filtering. Only unchanged terminal outputs
								// can transfer publication to this settlement request.
								var population paidMayPopulation
								associate := selectedGet.effectSummary != nil && get != nil && selectedGet.effectSummary == get.effectSummary && len(projection) == 1 && projection[0] == "then" && name == "" && mode == accessorAcquire
								if associate {
									population.receipt = importPaidGetterMayObservation(query.owner.language, observed)
									population.indices = make([]int, 0, len(observed.values))
								}
								complete := associate
								for _, returned := range observed.values {
									value := returned.value
									if query.dependenciesOnly {
										value.capture = &returned.scope
									} else {
										value.acquired = &returned
									}
									previousGet, previousReference := get, reference
									get, reference = nil, reference.after(projection, name) // This read was consumed. Its output is not another receiver.
									start := len(result.values)
									visitOrigins([]sourceValue{value}, projection[1:], false)
									if associate {
										if len(result.values) != start+1 || result.values[start].acquired != &returned || result.values[start].node != returned.value.node || len(result.values[start].path) != 0 || len(returned.value.path) != 0 {
											complete = false
										} else {
											population.indices = append(population.indices, start)
										}
									}
									get, reference = previousGet, previousReference
								}
								if complete {
									selectedGet.effectSummary.populations = append(selectedGet.effectSummary.populations, population)
								}
							}
						}
						if ast.IsPropertyDeclaration(member) && mode&accessorNoGet == 0 {
							if instance {
								if query.dependenciesOnly {
									query.visitSourceConstructedField(member, actualReceiver, arguments, &result, readCut, func(values []sourceValue) {
										previousGet, previousReference := get, reference
										get, reference = nil, reference.after(projection, name)
										visitOrigins(values, projection[1:], false)
										get, reference = previousGet, previousReference
									})
								} else {
									result.valueIncomplete = true
								}
							} else {
								visit(member.AsPropertyDeclaration().Initializer, projection[1:], false)
							}
						}
					}
					continue
				}
				if ((ast.IsGetAccessorDeclaration(member) && mode&accessorNoGet == 0) || (ast.IsSetAccessorDeclaration(member) && mode&accessorSet != 0)) && member.Name() != nil && (name == "" && !exactEmpty || callableNameText(member.Name()) == name || ast.IsComputedPropertyName(member.Name())) {

					query.remaining--
					query.recordEstimatedCost(1)
					query.owner.work++
					query.recordFacts(1)
					if !ast.IsGetAccessorDeclaration(member) || mode == accessorReachable || mode == accessorSetAcquire {
						result.declarations = append(result.declarations, member)
					}
					if mode == accessorReachable && ast.IsGetAccessorDeclaration(member) {
						observed := query.reachableGetResults(member, selectedGet, query.acquireCallableScope(arguments, &result), &result)
						for _, returned := range observed.values {
							previousArguments, previousCreators := arguments, query.creators
							arguments, query.creators = returned.scope.bindings, returned.scope.creators
							visitOrigins([]sourceValue{returned.value}, projection, false)
							arguments, query.creators = previousArguments, previousCreators
						}
					}
					if mode == accessorSetAcquire && ast.IsSetAccessorDeclaration(member) {
						query.retainSourceSetterWriterInputs(member, actualReceiver, arguments, &result)
					}
					if mode != accessorReachable && mode != accessorSetAcquire && ((ast.IsGetAccessorDeclaration(member) && mode&accessorNoGet == 0) || (ast.IsSetAccessorDeclaration(member) && mode&accessorSet != 0)) {
						if ast.IsGetAccessorDeclaration(member) && query.operation != nil && query.operation.outputOnly {
							result.valueIncomplete = true
						} else if ast.IsGetAccessorDeclaration(member) && !deep {
							query.executeGetEffects(member, selectedGet, query.acquireCallableScope(arguments, &result), &result)
						} else if ast.IsGetAccessorDeclaration(member) {
							// Effects and projected results consume this same selected Get.
							// The nested receiver replaces this, while original captures,
							// zero supplied arguments and defaults remain installed.
							observed := query.acquireGetResult(member, selectedGet, query.acquireCallableScope(arguments, &result), &result)
							if deep {
								retainResultUncertainty(observed, &result, query.getProjectionDemand())
								for _, returned := range observed.values {
									previousArguments, previousCreators := arguments, query.creators
									arguments, query.creators = returned.scope.bindings, returned.scope.creators
									previousGet, previousReference := get, reference
									get, reference = nil, reference.after(projection, name)
									visitOrigins([]sourceValue{returned.value}, projection, false)
									get, reference = previousGet, previousReference
									arguments, query.creators = previousArguments, previousCreators
								}
							}
						} else {
							if query.supplyAssignmentSourceSetter(member, selectedGet, mode, &result) {
								continue
							}
							if staged := query.liveStagedAssignment(); staged != nil && staged.consume != nil && staged.consume(member, actualReceiver, arguments, &result) {
								continue
							}
							result.retainCallableEffect(selectedGet.operation, member)
							if !query.consumeSourceSetter(member, selectedGet.operation, actualReceiver, arguments, &result) {
								query.execute(member, arguments, &result, nil)
							}
						}
					}
				}
			}
			if !ast.IsObjectLiteralExpression(value) && !ownsSelection {
				var class *ast.ClassLikeBase
				if ast.IsClassDeclaration(value) {
					class = &value.AsClassDeclaration().ClassLikeBase
				} else {
					class = &value.AsClassExpression().ClassLikeBase
				}
				if class.HeritageClauses != nil {
					for _, clause := range class.HeritageClauses.Nodes {
						if clause.AsHeritageClause().Token == ast.KindExtendsKeyword {
							for _, base := range clause.AsHeritageClause().Types.Nodes {
								previousReceiver := inheritedReceiver
								inheritedReceiver = &actualReceiver
								visit(base.AsExpressionWithTypeArguments().Expression, projection, instance)
								inheritedReceiver = previousReceiver
							}
						}
					}
				}
			}
			// Only a known setter-only slot reads as undefined. An empty
			// successful-result set from a throwing getter is not undefined.
			if ownsSelection && ownSetter && !ownGetter && get != nil && len(projection) == 1 && mode == accessorAcquire && !result.opaque {
				result.values = append(result.values, sourceValue{undefined: true})
			}
			if get != nil && get.propertyKey != "" && ast.IsObjectLiteralExpression(value) && !ownsSelection && len(projection) == 1 {
				query.propertyReferenceEffects(get, selection, arguments, &result, readCut)
			}
			if ast.IsObjectLiteralExpression(value) && !ownsSelection && selection == "then" && get != nil && get.receiver.node == value && len(projection) == 1 && len(get.thenReferences) > 0 {
				query.inheritedThenValues(get, arguments, get.thenReferences, get.thenIncomplete, &result)
			}
			return
		}
		if value.Kind == ast.KindThisKeyword {
			if query.readBoundComponentProtocol(value, projection, name, mode, arguments, &result, visitMember, get, readCut) {
				return
			}
			for _, receiver := range query.receiverOrigins(value, arguments) {
				// An uninstantiated caller receiver stays symbolic. Rebinding that
				// same this occurrence cannot manufacture a new getter execution.
				if receiver.node == value && len(receiver.path) == 0 {
					continue
				}
				visitOrigins([]sourceValue{receiver}, projection, false)
			}
			return
		}
		if ast.IsIdentifier(value) {
			symbol := typeChecker.GetSymbolAtLocation(value)
			if value.Parent != nil && ast.IsShorthandPropertyAssignment(value.Parent) {
				symbol = typeChecker.GetShorthandAssignmentValueSymbol(value.Parent)
			}
			if symbol == nil {
				return
			}
			if mode == accessorAcquire && typeChecker.IsUndefinedSymbol(symbol) {
				result.values = append(result.values, sourceValue{node: value, undefined: true})
				return
			}
			if owner != nil {
				if selected, owned := owner.symbol(symbol, make(map[ast.SymbolId]bool)); owned {
					result.selected = true
					symbol = selected
					if selected == nil {
						result.opaque = true
						return
					}
				}
			}
			query.observeStagedAssignmentInputGap(symbol, mode, arguments)
			query.observeStagedExternalMember(value, projection, name, mode, readCut, &result)
			query.observeStagedExternalGetValue(value, symbol, projection, name, mode, get, readCut, &result)
			if query.observeStagedAssignmentExternal(value, symbol, mode) {
				return
			}
			query.observeOriginalExternalSet(value, symbol, mode, &result)
			query.observeOriginalExternalReceiverGet(value, symbol, projection, name, mode, &result)
			if symbol.Flags&ast.SymbolFlagsAlias != 0 {
				symbol = query.sourceAlias(symbol, &result)
			}
			if symbol == nil {
				return
			}
			nativePath := projection
			if len(nativePath) == 0 && name != "" {
				nativePath = []string{name}
			}
			if native, _ := query.nativePromiseEntry(value, value, nativePath); native != nil && mode&accessorNoGet == 0 {
				values := query.nativeEntryValues(*native, arguments, &result)
				if native.native.kind != sourceNativeGlobalObject {
					values = query.liveValues(symbol, values, value, arguments, &result)
				}
				visitOrigins(values, projection, instance)
				return
			}
			if callable, rest := query.namespaceCallable(symbol, projection, &result); callable != nil {
				visit(callable, rest, instance)
				return
			}
			if argument, exists := arguments[ast.GetSymbolId(symbol)]; exists {
				argument = query.liveValues(symbol, argument, value, arguments, &result)
				// Reading a rest-array slot does not read that element's members.
				if len(projection) == 0 && name != "" && len(argument) == 1 && argument[0].rest != nil {
					return
				}
				visitOrigins(query.boundProjection(argument, projection, &result), nil, false)
				return
			}
			if _, intrinsic := query.promiseResolver(value, &result); intrinsic {
				result.sourceCallable = true
				values := query.liveValues(symbol, []sourceValue{{node: symbol.ValueDeclaration}}, value, arguments, &result)
				visitOrigins(values, projection, instance)
				return
			}
			if values, acquired := query.sourceLocalBindingValues(symbol, arguments, &result); acquired {
				values = query.liveValues(symbol, values, value, arguments, &result)
				visitOrigins(values, projection, instance)
				return
			}
			if query.dependenciesOnly && symbol.ValueDeclaration != nil && ast.IsBindingElement(symbol.ValueDeclaration) && !sourcePatternParameter(value, typeChecker) {
				// Local pattern slots obey the same live writer cut as lexical aliases.
				// An uninstalled initializer remains a demand, not an acquired value.
				unresolved := false
				for _, current := range query.liveValues(symbol, []sourceValue{{node: value}}, value, arguments, &result) {
					if current.node == value && len(current.path) == 0 {
						unresolved = true
					} else {
						visitOrigins([]sourceValue{current}, projection, instance)
					}
				}
				if !unresolved {
					return
				}
			}
			if symbol.ValueDeclaration != nil && (ast.IsParameterDeclaration(symbol.ValueDeclaration) || ast.IsBindingElement(symbol.ValueDeclaration)) {
				if query.stagedMap != nil && len(projection) == 0 && name == "" {
					// An unresolved original input is a distinct source alternative,
					// even when another selected literal withheld normal output.
					query.observeStagedMapUnrepresentedInput(value, symbol.ValueDeclaration, get, mode)
				}
				if query.dependenciesOnly && mode == accessorRead && (name != "" || len(projection) > 0) {
					key := name
					if key == "" && len(projection) == 1 {
						key = projection[0]
					}
					if demand := query.operationFieldDemand(query.protectedMember, key); demand.declaration != nil {
						result.fieldFallbacks = append(result.fieldFallbacks, demand)
					} else {
						result.opaque = true
					}
					return
				}
				if mode == accessorAcquire && len(projection) == 0 {
					result.values = append(result.values, sourceValue{node: value})
				} else if mode == accessorAcquire {
					demand := sourceFieldDemand{}
					if name == "" && len(projection) == 1 {
						demand = query.operationFieldDemand(query.protectedMember, projection[0])
					}
					if demand.declaration != nil {
						result.fieldFallbacks = append(result.fieldFallbacks, demand)
						result.values = append(result.values, sourceValue{node: value, path: append([]string(nil), projection...)})
					} else {
						result.opaque = true
					}
					result.valueIncomplete = true
				}
				return
			}
			// An uninstalled captured local is an input demand at this exact Get.
			// Preserve its entry and every live writer before projecting the field.
			// This supplies no value, completion or descriptor authority.
			if symbol.ValueDeclaration != nil && ast.IsVariableDeclaration(symbol.ValueDeclaration) && symbol.ValueDeclaration.Initializer() == nil && query.creators[enclosingCallableNode(symbol.ValueDeclaration)].invocation == nil {
				key := name
				if key == "" && len(projection) == 1 {
					key = projection[0]
				}
				if demand, _ := query.fieldDemand(query.protectedMember, value, key); demand.declaration != nil {
					values := query.liveValues(symbol, []sourceValue{{node: value, entrySlot: symbol.ValueDeclaration}}, value, arguments, &result)
					visitOrigins(values, projection, instance)
					return
				}
			}
			// Source reads of an initializer-free module cell consume its MAY
			// writer origins in every member mode. Acquisition alone cannot own
			// later getter effects, and no normal slot/output is supplied here.
			if query.dependenciesOnly && symbol.ValueDeclaration != nil && ast.IsVariableDeclaration(symbol.ValueDeclaration) && symbol.ValueDeclaration.Initializer() == nil && enclosingCallableNode(symbol.ValueDeclaration) == nil && !ast.GetSourceFileOfNode(symbol.ValueDeclaration).IsDeclarationFile && symbol.ValueDeclaration.Flags&ast.NodeFlagsAmbient == 0 {
				values := query.liveValues(symbol, []sourceValue{{node: value}}, value, arguments, &result)
				for _, term := range values {
					if term.node == value {
						result.opaque, result.valueIncomplete = true, true
						continue
					}
					visitOrigins([]sourceValue{term}, projection, instance)
				}
				return
			}
			// An ambient authored receiver is not a proven ordinary source object.
			// Library globals retain their existing environment owner.
			if len(projection) > 0 || name != "" {
				for _, declaration := range symbol.Declarations {
					if !standardLibrarySource(ast.GetSourceFileOfNode(declaration)) && ((ast.IsVariableDeclaration(declaration) && declaration.Initializer() == nil) || (ast.IsFunctionLike(declaration) && declaration.Body() == nil)) {
						if ast.GetSourceFileOfNode(declaration).IsDeclarationFile || (mode == accessorRead || mode == accessorAcquire) && query.declaredFrameworkMemberRead(value, projection, name, &result) {
							// Retain uncertainty beside existing external execution classification.
							// A mixed source-callable receiver consumes it without adopting identity.
							result.receiverIncomplete = true
							if query.dependenciesOnly && mode == accessorRead && !query.declaredFrameworkMemberRead(value, projection, name, &result) {
								result.opaque = true
								result.cause = value
							}
							if mode == accessorAcquire {
								// The package Get contract supplies effects, never a normal value
								// or callable identity for this acquired member.
								result.valueIncomplete = true
								if !query.declaredFrameworkMemberRead(value, projection, name, &result) {
									result.opaque = true
									if result.cause == nil {
										result.cause = value
									}
								}
							}
						} else {
							result.opaque = true
							if result.cause == nil {
								result.cause = value
							}
						}
					}
				}
			}
			for _, declaration := range symbol.Declarations {
				if ast.IsFunctionLike(declaration) && declaration.Body() != nil && query.owner.bindingWritten(symbol) {
					visitOrigins(query.origins(value, arguments, &result), projection, instance)
					break
				}
				if ast.IsClassDeclaration(declaration) || (ast.IsFunctionLike(declaration) && (mode == accessorInvoke || (mode == accessorAcquire && declaration.Body() != nil) || declaration.Body() != nil && (len(projection) > 0 || name != ""))) {
					visit(declaration, projection, instance)
				}
				if ast.IsVariableDeclaration(declaration) && declaration.Initializer() == nil && mode == accessorAcquire {
					values := query.liveValues(symbol, []sourceValue{{node: value}}, value, arguments, &result)
					for _, acquired := range values {
						if acquired.node != value {
							visit(acquired.node, append(append([]string{}, acquired.path...), projection...), instance)
						} else if len(projection) != 0 || name != "" || !query.observeStagedWriterAmbientEntry(value, declaration) {
							result.valueIncomplete = true
						}
					}
				}
				if ast.IsVariableDeclaration(declaration) && declaration.Initializer() != nil {
					// Uninstantiated lexical aliases keep symbolic entry demands. Containers
					// and projected values are acquired before their later member consumers.
					root, entryPath := effectArgumentRoot(declaration.Initializer())
					factory := enclosingCallableNode(declaration)
					if factory != nil && query.creators[factory].invocation == nil && ast.IsIdentifier(root) && len(entryPath) == 0 && sourceCapturedParameter(root, nil, typeChecker, map[ast.SymbolId]bool{}) {
						previous := query.initializing
						query.initializing = declaration
						visit(declaration.Initializer(), projection, instance)
						query.initializing = previous
						continue
					}
					visitOrigins(query.origins(value, arguments, &result), projection, instance)
				}
			}

			return
		}
		if ast.IsCallExpression(value) {
			for parent := value.Parent; parent != nil && !ast.IsFunctionLike(parent); parent = parent.Parent {
				if ast.IsForStatement(parent) || ast.IsForOfStatement(parent) || ast.IsWhileStatement(parent) || ast.IsDoStatement(parent) {
					result.opaque = true
					query.owner.widenings++
					break
				}
			}
			var produced sourceResultObservation
			hasProduced := false
			if !query.dependenciesOnly {
				produced, hasProduced = query.acquireNormalCallResult(value, &result)
			}
			// A source Set effect can follow the existing return relationship
			// without claiming presence, setter selection or normal receiver output.
			sourceSetEffects := query.dependenciesOnly && mode&accessorSet != 0 && mode != accessorSetAcquire && get == nil
			if !hasProduced && (mode&accessorNoGet != 0 && !sourceSetEffects || get != nil && instance) {
				// Presence and instance lookup cannot reconstruct initializer or
				// heritage values by binding a receiptless Call's defaults.
				result.opaque, result.valueIncomplete = true, true
				return
			}
			if !hasProduced && query.operation != nil && query.operation.outputOnly {
				// Selection/input-only facts are not normal output. The actual
				// Call owner retains foreign/refused effects independently.
				result.valueIncomplete = true
				return
			}
			if hasProduced || query.returnObservation != nil {
				observed := produced
				if !hasProduced {
					observed = query.observeInvocationResults(value, arguments, &result)
				}
				demand := sourceExecutionOutput
				if !hasProduced {
					demand = sourceValueProjection
				}
				retainResultUncertainty(observed, &result, demand)
				for _, returned := range observed.values {
					query.withAcquiredObservation(returned, &arguments, &acquiredParent, &result, func() {
						if returned.value.undefined {
							result.values = append(result.values, returned.value)
						} else {
							visitOrigins([]sourceValue{returned.value}, projection, false)
						}
					})
				}
				return
			}
			// Source return relationships use the same selected-body/input owner
			// as invocation effects. Per-alternative captures stay installed while
			// the projected value is consumed, without a normal output receipt.
			sourcePending := false
			query.withAcquiredOutput(&acquiredParent, nil, func() {
				if query.dependenciesOnly {
					// Classify this projection independently from earlier alternatives.
					// Every prior uncertainty survives the additive join below.
					opaque, receiverIncomplete := result.opaque, result.receiverIncomplete
					result.opaque, result.receiverIncomplete = false, false
					defer func() {
						result.opaque = result.opaque || opaque
						result.receiverIncomplete = result.receiverIncomplete || receiverIncomplete
					}()
				}
				start := len(result.values)
				tracePriorProjection := query.traceProjection
				query.traceProjection = progressBeginProjection(query, value, projection, name, mode)
				defer func() { query.traceProjection = tracePriorProjection }()
				interest := sourceCallResultInterest{purpose: resultSourceProjection}
				if query.dependenciesOnly && query.stagedMember != nil && query.stagedMember.returnResult != nil && query.normalBindingCall == nil && len(query.creators) == 0 && len(arguments) == 0 && (len(projection) != 0 || name != "" || mode&(accessorReachable|accessorEnumerate) != 0) {
					interest.discover = func(source *sourceStagedFreezeReturnSource) bool {
						if query.projectFreezeReturnPrefix(source, projection, name, mode, arguments, &result, visit) {
							sourcePending = true
							return true
						}
						return false
					}
				}
				part := query.projectSourceCallReturnsWithViews(value, arguments, interest, func(returned sourceValue, captures sourceValueBindings) {
					previous := arguments
					arguments = captures
					defer func() { arguments = previous }()
					if returned.undefined {
						result.values = append(result.values, returned)
					} else {
						visitOrigins([]sourceValue{returned}, projection, false)
					}
				}, func(view sourceFrameworkStorageView, captures sourceValueBindings) {
					query.retainFrameworkView(view, projection, name, mode, instance, &result)
				}, func() {
					result.valueIncomplete = true
					if len(projection) > 0 || name != "" || mode == accessorInvoke {
						result.opaque = true
					} else {
						result.values = append(result.values, sourceValue{node: value})
					}
				}, func(view sourceNativeDescriptorView, captures sourceValueBindings) {
					// Deliver through the same lexical visitor as other typed
					// origins. It owns the actual reference/read cut and retains
					// the old marker fallback when no record rule represents it.
					visitOrigins([]sourceValue{{descriptorView: &view}}, projection, instance)
				})
				traceCurrentProjection := query.traceProjection
				query.traceProjection = tracePriorProjection
				mergeAccessorCandidates(&result, part)
				if query.dependenciesOnly && len(result.values) == start && (len(projection) > 0 || name != "") && (result.opaque || result.receiverIncomplete) {
					progressMemberRecovery(query, traceCurrentProjection)
					// An unavailable output still has its original binding origin.
					// Retain indexed MAY writes through that origin without inventing
					// an object, a fresh allocation or a completed Call result.
					query.withActiveInvocation(value, func() {
						query.memberValuesAtGet(value, projection, name, mode, arguments, &result, visitMember, sourceMemberOperationProof{}, nil, readCut)
					})
				}
			})
			if query.dependenciesOnly {
				result.callOutcomes = append(result.callOutcomes, query.returnOutcome(value, !sourcePending && !result.opaque && !result.receiverIncomplete))
			} else {
				query.refuseExactOutput(value, &result)
			}
		}
	}
	if len(alternatives) == 1 {
		visitOrigins(alternatives, path, false)
	} else {
		visit(receiver, path, false)
	}
	if result.sourceCallable && result.receiverIncomplete {
		result.opaque = true
	}
	if result.opaque && result.cause == nil {
		result.cause = receiver
	}
	return result
}

// sourcePrivateMemberMatch selects only the declaration of an authored private
// Get. Its symbol owns the entire selected segment, so a public '#name' member
// cannot also match. Public reflection and normal traversal keep their owner.
func (query *sourceValueQuery) sourcePrivateMemberMatch(member *ast.Node, projection []string) (matches, privateGet bool) {
	operation := query.protectedMember
	if !query.dependenciesOnly || len(projection) != 1 || operation == nil || !ast.IsPropertyAccessExpression(operation) {
		return false, false
	}
	name := operation.AsPropertyAccessExpression().Name()
	if name.Kind != ast.KindPrivateIdentifier || projection[0] != name.Text() {
		return false, false
	}
	if member.Name() == nil || member.Name().Kind != ast.KindPrivateIdentifier || member.Parent == nil || !ast.IsClassDeclaration(member.Parent) && !ast.IsClassExpression(member.Parent) {
		return false, true
	}
	original := query.owner.checker.GetSymbolAtLocation(name)
	return original != nil && original == query.owner.checker.GetSymbolAtLocation(member.Name()), true
}
