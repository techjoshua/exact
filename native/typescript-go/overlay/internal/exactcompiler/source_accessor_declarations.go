package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// acquiredCallableScope preserves the traversal-local creating inputs and return occurrence
// for one acquired alternative. It is not authority for other alternatives or later lookups.
type acquiredCallableScope struct {
	bindings sourceValueBindings
	creators map[*ast.Node]sourceValueCreation
}

// accessorCandidates carries a bounded provenance proof. Exhaustion retains unknown effects.
// sourceCallableEffect preserves the producer operation before candidate joins.
// Declaration selection alone is not an execution contribution. A nil operation
// retains a conservative effect edge but can never fulfill an input disposition.
type sourceCallableEffect struct {
	operation, declaration *ast.Node
}

// sourceAccessorMutation is a detached mutation fact of one completed Get.
// It grants no execution, returned-value or family authority.
type sourceAccessorMutation struct {
	operation, body *ast.Node
	verdict         sourceWriteVerdict
}

type accessorCandidates struct {
	// Late source refusal transport only. It grants no Get/Call authority.
	prefixCoverage                  *sourcePrefixRefusalCoverage
	closedPrefixReason              string
	ownedComponents                 *sourceCandidateComponents
	ownedGets                       []*ownedGetPopulation
	ownedClaims                     []*ownedGetFactObligation
	ownedSealed, ownedReferenceOnly bool
	ownedLocalCauses                []string

	accessorMutations []sourceAccessorMutation

	nativeDescriptorEffects []sourceNativeDescriptorEffect
	descriptorFallbacks     []sourceDescriptorEffectOrigin

	writeBodies   []sourceWriteBody
	writeOutcomes []sourceCompletedWriteOutcome

	effects []sourceCallableEffect
	// Missing input demands are separate from residual operation opacity.
	fieldFallbacks []sourceFieldDemand
	// callFallbacks retain callee-selection refusal separately from residual Get/effect opacity.
	callFallbacks           []sourceCallOutcome
	fieldOutcomes           []sourceFieldOutcome
	callOutcomes            []sourceCallOutcome
	fieldCalls              []sourceFieldCall
	ownSlots                []*sourceOwnSlot
	fieldAlternatives       []sourceFieldAlternative
	fieldReceiverIncomplete bool

	reflective     []*sourceReflectiveOperation
	nativeCalls    []*sourceNativeInvocation
	normalCalls    []*sourceInvocationResult
	owned          []sourceOwnedObligations
	thenReferences []sourceThenReference
	thenIncomplete bool
	// receiverIncomplete retains an unaccounted receiver alternative independently
	// from acquired callable values. A source-callable member demand consumes it.
	// Ordinary native execution classification remains on its existing owner.
	receiverIncomplete bool
	// valueIncomplete describes returned-value uncertainty separately from operation effects.
	valueIncomplete bool
	// sourceCallable records a source member or writable source-callable binding route.
	// It is a may-demand marker, never an identity or completeness certificate.
	sourceCallable bool
	// invocationOwned means this call consumed acquired values and must not borrow a signature body.
	invocationOwned bool
	// replacedInvocation prevents a signature/base-body edge from overriding acquired methods.
	replacedInvocation bool
	ordinaryBodies     []sourceInvocationBody
	// ownOperation retains a modeled method/descriptor change independently of its value.
	ownOperation bool
	inputs       []*sourceValueInputs
	// sourceOwned prevents structural getter declarations from restoring a superseded value.
	sourceOwned bool
	producers   []*ast.Node
	values      []sourceValue
	// callableScopes is indexed by values occurrence, never just by declaration.
	callableScopes map[int]acquiredCallableScope
	declarations   []*ast.Node
	opaque         bool
	selected       bool
	writes         []sourceValueWrite
	cause          *ast.Node
}

// accessorTraversal distinguishes property reads, reachable argument values and own-value serialization.
type accessorTraversal uint8

const (
	accessorRead      accessorTraversal = 0
	accessorReachable accessorTraversal = 1
	accessorEnumerate accessorTraversal = 2
	accessorSerialize accessorTraversal = 3
	accessorInvoke    accessorTraversal = 4
	accessorAcquire   accessorTraversal = 8
	accessorSet       accessorTraversal = 16
	accessorNoGet     accessorTraversal = 32
	// accessorSetAcquire selects an authored setter without executing its body.
	accessorSetAcquire accessorTraversal = accessorSet | accessorNoGet | 64
)

// sourceAccessorBoundCandidates substitutes source-owned arguments without granting authority to structural types.
func sourceAccessorBoundCandidates(receiver *ast.Node, path []string, name string, mode accessorTraversal, typeChecker *checker.Checker, bindings map[ast.SymbolId]*ast.Node, owner *executableBodyOwner, consumer *ast.Node) accessorCandidates {
	return sourceAccessorOperationCandidates(receiver, path, name, mode, typeChecker, bindings, owner, consumer, nil)
}

// sourceAccessorOperationCandidates retains mutation references at the existing
// evaluated member owner. A syntax reference is not execution or value authority.
func sourceAccessorOperationCandidates(receiver *ast.Node, path []string, name string, mode accessorTraversal, typeChecker *checker.Checker, bindings map[ast.SymbolId]*ast.Node, owner *executableBodyOwner, consumer, operation *ast.Node) accessorCandidates {
	values := newSourceValueOwner(typeChecker)
	if owner != nil && owner.values != nil {
		values = owner.values
	}
	query := &sourceValueQuery{owner: values, executable: owner, effectOwner: consumer, remaining: 4096, active: make(map[*ast.Node]bool)}
	query.operation = &sourceOperationContext{node: receiver, owner: consumer}

	arguments := make(sourceValueBindings)
	for id, value := range bindings {
		arguments[id] = []sourceValue{{node: value}}
	}
	return query.sourceAccessorOperationCandidates(receiver, path, name, mode, arguments, operation)
}

// sourceAccessorOperationCandidates owns the member's key identity and mutation
// retention for direct, eager, and installed-input consumers on the same query.
func (query *sourceValueQuery) sourceAccessorOperationCandidates(receiver *ast.Node, path []string, name string, mode accessorTraversal, arguments sourceValueBindings, operation *ast.Node) accessorCandidates {
	previous := query.protectedMember
	query.protectedMember = operation
	defer func() { query.protectedMember = previous }()
	result := query.accessors(receiver, path, name, mode, arguments, nil)
	if operation != nil && operation.Parent != nil {
		mutation := planMutationOperation(operation.Parent)
		if mutation.target == operation {
			query.retainThenOperation(operation.Parent, arguments, &result)
		}
	}
	return result
}

// evaluatedSourceAccessors shares member evaluation provenance with eager module
// placement. Installed consumers use the same operation and declaration fallback.
// reading retains the eager consumer across captured body and receiver lookups.
// A nil boundary keeps definition-only queries in their conservative MAY domain.
func evaluatedSourceAccessors(node *ast.Node, typeChecker *checker.Checker, bindings map[ast.SymbolId]*ast.Node, owner *executableBodyOwner, consumer, reading *ast.Node) accessorCandidates {
	values := newSourceValueOwner(typeChecker)
	if owner != nil && owner.values != nil {
		values = owner.values
	}
	query := sourceValueQuery{owner: values, executable: owner, effectOwner: consumer, remaining: 4096, active: make(map[*ast.Node]bool), reading: reading}
	receiver := node
	if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
		receiver, _ = accessorReceiver(node)
	}
	query.operation = &sourceOperationContext{node: receiver, owner: consumer}
	arguments := make(sourceValueBindings)
	for id, value := range bindings {
		arguments[id] = []sourceValue{{node: value}}
	}
	return query.evaluatedSourceAccessors(node, arguments)
}

// evaluatedSourceAccessors retains checker-known MAY effects when receiver
// selection is incomplete. Unknown provenance never erases a known accessor.
func (query *sourceValueQuery) evaluatedSourceAccessors(node *ast.Node, bindings sourceValueBindings) accessorCandidates {
	if !ast.IsPropertyAccessExpression(node) && !ast.IsElementAccessExpression(node) {
		return accessorCandidates{}
	}
	read, write := accessorEvaluationMode(node)
	if !read && !write {
		return accessorCandidates{}
	}
	receiver, name := accessorReceiver(node)
	mode := accessorRead
	if write {
		mode |= accessorSet
	}
	if !read {
		mode |= accessorNoGet
	}
	candidates := query.sourceAccessorOperationCandidates(receiver, nil, name, mode, bindings, node)
	if !candidates.selected && (!candidates.sourceOwned || candidates.opaque) {
		if symbol := sourceCallableReferenceSymbol(node, query.owner.checker); symbol != nil {
			for _, declaration := range symbol.Declarations {
				if (read && ast.IsGetAccessorDeclaration(declaration)) || (write && ast.IsSetAccessorDeclaration(declaration)) {
					candidates.retainCallableEffect(node, declaration)
				}
			}
		}
	}
	return candidates
}

// accessors instantiates finite relative roots. Recursive demands share this query's budget.
func (query *sourceValueQuery) accessors(receiver *ast.Node, path []string, name string, mode accessorTraversal, arguments sourceValueBindings, invoke func(*ast.Node, sourceValueBindings, *accessorCandidates)) accessorCandidates {
	return query.accessorsAtGet(receiver, path, name, mode, arguments, invoke, nil)
}

// accessorsAtGet supplies an explicit implicit-Get input at the selected receiver.
// Ordinary recursive property/callee queries do not inherit this operation input.
func (query *sourceValueQuery) accessorsAtGet(receiver *ast.Node, path []string, name string, mode accessorTraversal, arguments sourceValueBindings, invoke func(*ast.Node, sourceValueBindings, *accessorCandidates), get *sourceGetInputs, alternatives ...sourceValue) accessorCandidates {
	return query.accessorsAtGetOutput(receiver, path, name, mode, arguments, invoke, get, nil, alternatives...)
}

// accessorsAtGetOutput admits a producer's initial acquisition exactly once.
// All later raw/acquired entries read that operation's output without effects.
func (query *sourceValueQuery) accessorsAtGetOutput(receiver *ast.Node, path []string, name string, mode accessorTraversal, arguments sourceValueBindings, invoke func(*ast.Node, sourceValueBindings, *accessorCandidates), get *sourceGetInputs, producer *sourceNormalOperation, alternatives ...sourceValue) (result accessorCandidates) {
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
		if !selected.resolved {
			result.opaque = true
			result.cause = operation
		}
	}
	defer func() {
		query.sealInitializerCandidates(&result)
	}()
	var acquiredParent *sourceObservedValue
	seen := make(map[*ast.Node]bool)
	depth := 0
	// Class heritage changes the declaration being selected, not the Get's
	// receiver. A NewExpression remains an origin, never a repeated construction.
	var inheritedReceiver *sourceValue
	var visit func(*ast.Node, []string, bool)
	// Unknown origins constrain a consumer. Acquiring an unused input has no effects.
	var visitOrigins func([]sourceValue, []string, bool)
	// The initial producer entry alone may acquire. A nested read of the same
	// in-progress slot refuses, while an independent sibling keeps its output.
	producerEntry := producer != nil
	visitProduced := func(node *ast.Node, projection []string, instance bool) bool {
		if node != nil && ast.IsNewExpression(node) {
			if observed, found := query.constructedOutput(node); found {
				retainResultUncertainty(observed, &result, sourceExecutionOutput)
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
		retainResultUncertainty(observed, &result, sourceExecutionOutput)
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
			if query.protectedMember != nil && (name != "" && len(projection) == 0 || name == "" && len(projection) == 1) && !query.ownsDataSlot(get, term.node, projection, name, mode) {
				result.fieldReceiverIncomplete = true
			}
			if term.native != nil {
				query.nativeMember(term, projection, name, mode, arguments, &result, visit)
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
				if len(path) > 0 {
					for _, entry := range query.boundProjection([]sourceValue{term}, path, &result) {
						selected := query.accessors(entry.node, entry.path, "", mode, arguments, invoke)
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
		defer func() {
			// Every value branch must contribute a finite origin or retain uncertainty.
			if mode == accessorAcquire && len(result.values) == acquired {
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
		if seen[value] {
			result.opaque = true
			query.owner.widenings++
			return
		}
		if depth == 128 {
			result.opaque = true
			return
		}
		query.remaining--
		query.recordEstimatedCost(1)
		query.owner.work++
		depth++
		defer func() { depth-- }()
		seen[value] = true
		defer delete(seen, value)
		if ast.IsSpreadElement(value) {
			result.opaque = true
			visit(value.AsSpreadElement().Expression, append([]string{"*"}, projection...), false)
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
		if mode == accessorAcquire && len(projection) == 0 && !ast.IsIdentifier(value) && (query.returnObservation == nil || !ast.IsCallExpression(value)) {
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
			result.values = append(result.values, term)
			return
		}
		if ast.IsNewExpression(value) {
			if (len(projection) > 0 || name != "") && query.possibleProxyGetEffects(value, projection, name, mode, arguments, &result) {
				return
			}
			previousReceiver := inheritedReceiver
			inheritedReceiver = &sourceValue{node: value}
			defer func() { inheritedReceiver = previousReceiver }()
			// A structural array type can revoke completeness, never prove native identity.
			if len(projection) > 0 && typeChecker.IsArrayLikeType(typeChecker.GetTypeAtLocation(value)) {
				result.opaque = true
			}
			sourceInstance := false
			if definition, selected := owner.definition(value.AsNewExpression().Expression); selected {
				result.selected = true
				if definition == nil {
					result.opaque = true
				} else {
					sourceInstance = (ast.IsClassDeclaration(definition) || ast.IsClassExpression(definition)) && !ast.GetSourceFileOfNode(definition).IsDeclarationFile
					visit(definition, projection, true)
				}
				if !sourceInstance && (len(projection) > 0 || name != "") {
					result.receiverIncomplete = true
				}
				return
			}
			symbol := sourceCallableReferenceSymbol(value.AsNewExpression().Expression, typeChecker)
			if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
				symbol = query.sourceAlias(symbol, &result)
			}
			if symbol != nil {
				if argument, exists := arguments[ast.GetSymbolId(symbol)]; exists {
					visitOrigins(argument, projection, true)
				}
				for _, declaration := range symbol.Declarations {
					if ast.IsClassDeclaration(declaration) {
						sourceInstance = !ast.GetSourceFileOfNode(declaration).IsDeclarationFile
						visit(declaration, projection, true)
					}
					if ast.IsVariableDeclaration(declaration) {
						initializer := unwrapSourceCallableReference(declaration.Initializer())
						sourceInstance = sourceInstance || initializer != nil && ast.IsClassExpression(initializer) && !ast.GetSourceFileOfNode(initializer).IsDeclarationFile
						visit(declaration.AsVariableDeclaration().Initializer, projection, true)
					}
				}
			}
			// An unmodeled constructor result may be a Proxy or foreign object.
			// Structural callable/member types do not account for its Get/Set effects.
			if !sourceInstance && (len(projection) > 0 || name != "") {
				result.receiverIncomplete = true
				// An unmodeled callable constructor result may be a Proxy. Its
				// compatible Function methods cannot discharge real Get/trap
				// effects. This withholds authority, never asserts native identity.
				if nativeFunctionInvocation(value, "call", typeChecker) {
					result.opaque = true
					result.cause = value
				}
			}
			return
		}
		if len(projection) > 1 && projection[0] == "prototype" && sourceFunctionPrototype(sourceValue{node: value, path: projection[:1]}, typeChecker) {
			// Native prototype identity is only a possible source write route.
			// Keep its original/unaccounted member beside acquired source bodies.
			query.memberValues(value, projection, name, mode, arguments, &result, visit)
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
			replaced := query.memberValuesAtGet(value, projection, name, mode, arguments, &members, visit, operation, actualGet)
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
		if ast.IsFunctionLike(value) && mode == accessorInvoke && len(projection) == 0 {
			if value.Body() == nil || ast.GetSourceFileOfNode(value).IsDeclarationFile {
				return
			}
			// Existing ordinary method effects stay on their call graph. A creating
			// edge or an executing parameter pattern needs this input substitution.
			binding := false
			for _, parameter := range value.Parameters() {
				if !query.charge(&result, parameter) {
					return
				}
				binding = binding || parameter.Initializer() != nil || ast.IsObjectBindingPattern(parameter.Name()) || ast.IsArrayBindingPattern(parameter.Name())
			}
			for _, creator := range query.creators {
				binding = binding || creator.invocation != nil
			}
			if !binding {
				return
			}
			result.declarations = append(result.declarations, value)
			previousReturn := query.returning
			query.returning = nil
			invoke(value, arguments, &result)
			query.returning = previousReturn
			return
		}
		if ast.IsArrayLiteralExpression(value) {
			result.sourceOwned = true
			query.arrayValues(value, projection, name, mode, arguments, &result, visit)
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
			if get != nil && len(projection) == 1 && name == "" && (get.propertyKey == "" || get.propertyKey == projection[0]) && (get.receiver.node == value || inheritedReceiver != nil && get.receiver.node == inheritedReceiver.node && len(get.receiver.path) == 0) {
				// The selected New/class/heritage route changes lookup origin only.
				// Preserve this read's receiver tuple, native relation and Has cell.
				actual := *get
				selectedGet = &actual
			} else if get != nil {
				// An explicit operation cannot be lent to an unrelated child read.
				result.opaque, result.valueIncomplete = true, true
				return
			}
			if selectedGet.receiver.node != value {
				lookup := sourceValue{node: value}
				selectedGet.lookupOwner = &lookup
				if selectedGet.inspection != nil {
					local := *selectedGet.inspection
					local.lookup = selectedGet.lookupOwner
					selectedGet.inspection = &local
				}
			}
			if ast.IsObjectLiteralExpression(value) && query.frozenOwnGet(value, projection, name, mode, selectedGet, acquiredParent, &result) {
				return
			}
			// Only a whole anonymous return allocation can bypass prior own writes
			// at its immediate settlement Get. This is a language transfer fact
			// supplied by the operation owner, never an indexed-origin certificate.
			freshGet := get != nil && get.freshReturn && get.receiver.node == value && len(get.receiver.path) == 0 && len(projection) == 1
			if mode != accessorReachable && !freshGet && (get == nil || !get.hasOnly) {
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
				if query.memberValuesAtGet(value, projection, name, mode, arguments, &result, visit, sourceMemberOperationProof{}, proofGet) {
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
				inherited := query.propertyReferenceEffects(get, selection, arguments, &result)
				if ordinary && !result.opaque && inherited == propertyAbsent {
					if owns {
						*get.presence = propertyPresent
					} else {
						*get.presence = propertyAbsent
					}
				} else {
					*get.presence = propertyUnknown
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
					ownGetter = ownGetter || ast.IsGetAccessorDeclaration(member)
					ownSetter = ownSetter || ast.IsSetAccessorDeclaration(member)
				}
				if ast.IsSpreadAssignment(member) {
					visit(member.AsSpreadAssignment().Expression, projection, false)
					continue
				}
				if deep && ast.IsPropertyAssignment(member) {
					visit(member.AsPropertyAssignment().Initializer, projection, false)
				}
				if deep && ast.IsShorthandPropertyAssignment(member) {
					visit(member.Name(), projection, false)
				}
				if len(projection) > 0 {
					computedMayMatch := member.Name() != nil && ast.IsComputedPropertyName(member.Name()) && sourceLiteralMemberName(member.Name().AsComputedPropertyName().Expression) == ""
					if member.Name() != nil && (projection[0] == "" && !exactEmpty || projection[0] == "*" || callableNameText(member.Name()) == projection[0] || computedMayMatch) {
						if computedMayMatch {
							result.opaque = true
						}
						if (mode == accessorAcquire || mode == accessorInvoke) && ast.IsMethodDeclaration(member) {
							visit(member, projection[1:], false)
						}
						if ast.IsPropertyAssignment(member) || ast.IsShorthandPropertyAssignment(member) {
							// This selected data read is consumed. Its output owns
							// any later child read, not this receiver's outer Get.
							previousGet := get
							get = nil
							if ast.IsPropertyAssignment(member) {
								visit(member.AsPropertyAssignment().Initializer, projection[1:], false)
							} else {
								visit(member.Name(), projection[1:], false)
							}
							get = previousGet
						}
						if ast.IsGetAccessorDeclaration(member) {
							if mode&accessorNoGet == 0 && len(projection) == 1 && name == "" && mode != accessorAcquire && mode != accessorInvoke && !deep {
								query.executeGetEffects(member, selectedGet, query.acquireCallableScope(arguments, &result), &result)
							} else if mode&accessorNoGet == 0 && query.operation != nil && query.operation.outputOnly {
								result.valueIncomplete = true
							} else if mode&accessorNoGet == 0 {
								observed := query.acquireGetResult(member, selectedGet, query.acquireCallableScope(arguments, &result), &result)
								retainResultUncertainty(observed, &result, sourceExecutionOutput)
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
									value.acquired = &returned
									previousGet := get
									get = nil // This read was consumed. Its output is not another receiver.
									start := len(result.values)
									visitOrigins([]sourceValue{value}, projection[1:], false)
									if associate {
										if len(result.values) != start+1 || result.values[start].acquired != &returned || result.values[start].node != returned.value.node || len(result.values[start].path) != 0 || len(returned.value.path) != 0 {
											complete = false
										} else {
											population.indices = append(population.indices, start)
										}
									}
									get = previousGet
								}
								if complete {
									selectedGet.effectSummary.populations = append(selectedGet.effectSummary.populations, population)
								}
							}
						}
						if ast.IsPropertyDeclaration(member) && mode&accessorNoGet == 0 {
							if instance {
								// An admitted normal output was consumed at entry. Without
								// that producer, an instance field has no retained value.
								result.valueIncomplete = true
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
								retainResultUncertainty(observed, &result, sourceExecutionOutput)
								for _, returned := range observed.values {
									previousArguments, previousCreators := arguments, query.creators
									arguments, query.creators = returned.scope.bindings, returned.scope.creators
									previousGet := get
									get = nil
									visitOrigins([]sourceValue{returned.value}, projection, false)
									get = previousGet
									arguments, query.creators = previousArguments, previousCreators
								}
							}
						} else {
							result.retainCallableEffect(selectedGet.operation, member)
							query.execute(member, arguments, &result, nil)
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
				query.propertyReferenceEffects(get, selection, arguments, &result)
			}
			if ast.IsObjectLiteralExpression(value) && !ownsSelection && selection == "then" && get != nil && get.receiver.node == value && len(projection) == 1 && len(get.thenReferences) > 0 {
				query.inheritedThenValues(get, arguments, get.thenReferences, get.thenIncomplete, &result)
			}
			return
		}
		if value.Kind == ast.KindThisKeyword {
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
			if symbol.ValueDeclaration != nil && (ast.IsParameterDeclaration(symbol.ValueDeclaration) || ast.IsBindingElement(symbol.ValueDeclaration)) {
				if mode == accessorAcquire && len(projection) == 0 {
					result.values = append(result.values, sourceValue{node: value})
				} else if mode == accessorAcquire {
					demand := sourceFieldDemand{}
					if name == "" && len(projection) == 1 {
						demand, _ = query.fieldDemand(query.protectedMember, value, projection[0])
					}
					if demand.slot == symbol.ValueDeclaration && ast.IsParameterDeclaration(demand.slot) {
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
			// An ambient authored receiver is not a proven ordinary source object.
			// Library globals retain their existing environment owner.
			if len(projection) > 0 || name != "" {
				for _, declaration := range symbol.Declarations {
					if !standardLibrarySource(ast.GetSourceFileOfNode(declaration)) && ((ast.IsVariableDeclaration(declaration) && declaration.Initializer() == nil) || (ast.IsFunctionLike(declaration) && declaration.Body() == nil)) {
						if ast.GetSourceFileOfNode(declaration).IsDeclarationFile || mode == accessorRead && query.declaredFrameworkMemberRead(value, projection, name, &result) {
							// Retain uncertainty beside existing external execution classification.
							// A mixed source-callable receiver consumes it without adopting identity.
							result.receiverIncomplete = true
							if mode == accessorAcquire {
								result.opaque = true
								if result.cause == nil {
									result.cause = value
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
						} else {
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
			call := value.AsCallExpression()
			for parent := value.Parent; parent != nil && !ast.IsFunctionLike(parent); parent = parent.Parent {
				if ast.IsForStatement(parent) || ast.IsForOfStatement(parent) || ast.IsWhileStatement(parent) || ast.IsDoStatement(parent) {
					result.opaque = true
					query.owner.widenings++
					break
				}
			}
			expression := unwrapSourceCallableReference(call.Expression)
			produced, hasProduced := query.acquireNormalCallResult(value, &result)
			if !hasProduced && (mode&accessorNoGet != 0 || get != nil && instance) {
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
			if mode == accessorRead && query.moduleRead() != nil && query.effectOwner == nil && query.inputs == nil {
				if families := query.moduleCallEffectOrigins(value); len(families) != 0 {
					previousArguments, previousCreators, previousOperation := arguments, query.creators, query.operation
					// Detached origin metadata is a MAY effect demand, never an
					// installed normal operation or a source of Get/Call output.
					query.operation = nil
					for _, family := range families {
						arguments = make(sourceValueBindings, len(family.Captures))
						for _, capture := range family.Captures {
							symbol := typeChecker.GetSymbolAtLocation(capture.Formal.Name())
							arguments[ast.GetSymbolId(symbol)] = []sourceValue{{node: capture.Origin}}
						}
						query.creators = map[*ast.Node]sourceValueCreation{family.Body: {invocation: family.Call, returning: family.Returned}}
						visit(family.Origin, projection, false)
					}
					arguments, query.creators, query.operation = previousArguments, previousCreators, previousOperation
					return
				}
			}
			// Declaration-only return syntax has no acquired output receipt. Keep
			// its known routes, but withhold outer construction/return authority.
			query.withAcquiredOutput(&acquiredParent, nil, func() {
				priorCreators := query.creators
				defer func() { query.creators = priorCreators }()
				declarations := query.callDeclarations(call.Expression, &result)
				concrete := false
				for _, declaration := range declarations {
					if ast.IsVariableDeclaration(declaration) {
						declaration = unwrapSourceCallableReference(declaration.Initializer())
					}
					if declaration != nil && ast.IsFunctionLike(declaration) && declaration.Body() != nil {
						concrete = true
					}
				}
				if !concrete && (ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression)) {
					candidates := query.receiverCandidates(value, arguments)
					for _, candidate := range candidates.values {
						if candidate.node != nil && ast.IsFunctionLike(candidate.node) && candidate.node.Body() != nil {
							declarations = append(declarations, candidate.node)
							concrete = true
						}
					}
					if concrete {
						mergeAccessorCandidates(&result, candidates)
					}
				}
				if !concrete && ((len(projection) > 0 && typeChecker.IsArrayLikeType(typeChecker.GetTypeAtLocation(value))) || unresolvedCallEnvironment(call.Expression, ast.GetSourceFileOfNode(value), typeChecker, nil) == "unknown") {
					result.opaque = true
				}
				// This is eligibility from the existing ordinary selection, not a second
				// resolver. Return projection alone does not authorize body execution.
				finiteReturn := len(declarations) == 1 && !result.opaque && ast.IsIdentifier(expression) && ast.IsFunctionDeclaration(declarations[0])
				if finiteReturn {
					symbol := resolvedCallableSymbol(callTargetSymbol(expression, typeChecker), typeChecker)
					finiteReturn = symbol != nil && !query.owner.bindingWritten(symbol)
				}
				// Keep existing finite-route eligibility, independently of the
				// uncertainty of this receiptless output.
				result.opaque = true
				for _, declaration := range declarations {
					if ast.IsVariableDeclaration(declaration) {
						declaration = unwrapSourceCallableReference(declaration.AsVariableDeclaration().Initializer)
					}
					if declaration != nil && ast.IsFunctionLike(declaration) {
						if query.creators == nil {
							query.creators = make(map[*ast.Node]sourceValueCreation)
						}
						previousCreator, hadCreator := query.creators[declaration]
						query.creators[declaration] = sourceValueCreation{invocation: value}
						previous := arguments

						arguments = query.bindArguments(declaration, value, arguments, &result)
						for _, returned := range query.owner.summary(declaration).returns {
							query.creators[declaration] = sourceValueCreation{invocation: value}
							possible, _ := query.reachable(returned, arguments)
							if !possible || !query.returnCompletes(returned, arguments) {
								continue
							}
							previousReturn := query.returning
							query.returning = returned
							query.creators[declaration] = sourceValueCreation{invocation: value, returning: returned}
							previousFresh := query.freshReturnCall
							query.freshReturnCall = nil
							if finiteReturn {
								query.freshReturnCall = value
							}
							visit(returned, projection, false)
							query.freshReturnCall = previousFresh
							query.returning = previousReturn
						}
						if hadCreator {
							query.creators[declaration] = previousCreator
						} else {
							delete(query.creators, declaration)
						}
						arguments = previous
					}
				}
			})
		}
	}
	if len(alternatives) == 1 {
		visitOrigins(alternatives, path, false)
	} else {
		visit(receiver, path, false)
	}
	result.opaque = result.opaque || result.sourceCallable && result.receiverIncomplete
	if result.opaque && result.cause == nil {
		result.cause = receiver
	}
	return result
}

// acquireCallableScope retains one reached body's creating inputs. Copies are
// query-local and fuel bounded, with no identity inferred from declaration spans.
func (query *sourceValueQuery) acquireCallableScope(arguments sourceValueBindings, result *accessorCandidates) acquiredCallableScope {
	scope := acquiredCallableScope{bindings: make(sourceValueBindings), creators: make(map[*ast.Node]sourceValueCreation)}
	for id, terms := range arguments {
		if !query.charge(result, nil) {
			break
		}
		scope.bindings[id] = query.sealInitializerValues(terms, result)
	}
	for owner, creator := range query.creators {
		if !query.charge(result, owner) {
			break
		}
		scope.creators[owner] = creator
	}
	return scope
}

// declaredFrameworkMemberRead preserves the actual selected package method's Get
// contract without manufacturing a value origin or clearing other acquisition effects.
func (query *sourceValueQuery) declaredFrameworkMemberRead(receiver *ast.Node, projection []string, name string, result *accessorCandidates) bool {
	if receiver == nil || len(projection) != 0 || name == "" || receiver.Parent == nil {
		return false
	}
	member := receiver.Parent
	if !ast.IsPropertyAccessExpression(member) && !ast.IsElementAccessExpression(member) {
		return false
	}
	actual, key := accessorReceiver(member)
	if actual != receiver || key != name || !portableDeclaredMethod(nativeReceiverMemberSymbol(member, query.owner.checker)) {
		return false
	}
	symbol := query.owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || query.owner.bindingWritten(symbol) {
		return false
	}
	// Inspect only actual references to this binding in its existing source index.
	// Local escapes and writes keep the generic refusal. Published consumers and
	// dependency implementations are not enumerated or required to be private.
	index := query.owner.index(ast.GetSourceFileOfNode(receiver))
	for _, region := range index.operationRegions {
		for _, reference := range region.references {
			if !query.charge(result, reference) {
				return false
			}
			selected := query.owner.checker.GetSymbolAtLocation(reference)
			if reference.Parent != nil && ast.IsShorthandPropertyAssignment(reference.Parent) {
				selected = query.owner.checker.GetShorthandAssignmentValueSymbol(reference.Parent)
			}
			if selected != symbol || query.afterRead(reference) {
				continue
			}
			member := reference.Parent
			if member == nil || !ast.IsPropertyAccessExpression(member) && !ast.IsElementAccessExpression(member) {
				return false
			}
			read, write := accessorEvaluationMode(member)
			if member.Expression() != reference || !read || write || nativeAssignmentPatternTarget(member) || !portableDeclaredMethod(nativeReceiverMemberSymbol(member, query.owner.checker)) {
				return false
			}
		}
	}
	return true
}
