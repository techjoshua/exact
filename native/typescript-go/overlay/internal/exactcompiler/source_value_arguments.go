package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strconv"
)

// boundProjection shares ordinary projection and finite rest-element substitution.
// A spread or whole-rest demand keeps all known alternatives and incomplete provenance.
func (query *sourceValueQuery) boundProjection(values []sourceValue, path []string, result *accessorCandidates) []sourceValue {
	var terms []sourceValue
	appendTerms := func(values []sourceValue, path []string) {
		for _, value := range values {
			if !query.charge(result, value.node) {
				return
			}
			if value.copied != nil && len(path) > 0 {
				terms = append(terms, query.boundProjection(value.copied[path[0]], path[1:], result)...)
				continue
			}
			result.opaque = result.opaque || value.node == nil && !value.undefined && value.copied == nil && (len(value.path) != 0 || len(path) != 0)
			value.path = append(append([]string{}, value.path...), path...)
			terms = append(terms, value)
		}
	}
	for _, value := range values {
		if value.rest == nil {
			appendTerms([]sourceValue{value}, path)
			continue
		}
		if len(path) == 0 {
			// Forwarding the array is not an element read or a native identity proof.
			appendTerms([]sourceValue{{}}, nil)
			continue
		}
		index, finite := uint64(0), false
		if len(path) > 0 {
			index, finite = sourceArrayIndex(path[0])
		}
		for position, group := range value.rest {
			if finite && uint64(position) > index {
				break
			}
			for _, origin := range group {
				if !query.charge(result, origin.node) {
					finite = false
					break
				}
				finite = finite && origin.node != nil && !ast.IsSpreadElement(origin.node)
			}
		}
		if finite {
			if index < uint64(len(value.rest)) {
				appendTerms(value.rest[index], path[1:])
			}
			continue
		}
		result.opaque = true
		restPath := path
		if len(restPath) > 0 {
			restPath = restPath[1:]
		}
		for _, group := range value.rest {
			appendTerms(group, restPath)
		}
	}
	return terms
}

// sourceValueInputs is an invocation-local binding execution plan. A nil default entry
// proves bypass. Active entries retain the earlier bindings used by that initializer.
// This is neither a runtime environment nor a selected-callee or production certificate.
type sourceValueInputs struct {
	priorPropertyFacts *sourcePriorPropertyFacts // live collector borrow, never cached
	initializerCursor  *moduleInitializerCursor
	ownedFact          *callableFacts

	storage          *storageOwnedBody
	writeAlternative *sourceWriteAlternative
	writeComponents  map[*ast.Node]sourceWriteVerdict
	installedFormals map[ast.SymbolId]sourceInstalledFormal
	dispatcher       *sourceNormalDispatcher
	population       *sourceNormalPopulation

	// operations retains only actual normal dispositions for this construction.
	operations        map[*ast.Node]*sourceNormalOperation
	operationLifetime *sourceNormalOperationLifetime
	// consumedWrites belongs only to the construction root and is cleared at disposal.
	// consumedCall is installed only while this actual Call body is consumed.
	cells          map[ast.SymbolId]sourceLexicalCell
	consumedWrites []sourceConsumedLexicalWrite
	consumedCall   *sourceConsumedCallInputs
	lexicalGets    []sourceGetReturn

	properties *sourcePropertyReferenceView
	// awaits are conditional outputs of this frame's actual normal Await
	// operations. Later value observers read them without repeating effects.
	awaits []sourceAwaitResult
	// fulfilled is requested only by actual ordinary async execution and consumed
	// before this installed frame is released. It never belongs in cached facts.
	fulfilled *sourceResultObservation

	// completed contains only this normal frame's conditional binding occurrences.
	// It is not a pool of caller receipts or generic declaration authority.
	completed map[ast.SymbolId]sourceNormalBinding
	// Non-nil only after this normal consumer starts collecting its own references.
	// Selection alone and generic indexed input plans cannot publish an empty list.
	thenReferences []sourceThenReference
	// returnedGets contains outputs of normal direct-return member demands in
	// this installed accessor plan. It is not a global/per-AST execution cache.
	returnedGets []sourceGetReturn
	// implicit retains an actual unary occurrence, never a fabricated CallExpression.
	implicit                *sourceImplicitInvocation
	get                     *sourceGetInputs
	declaration, invocation *ast.Node
	bindings                sourceValueBindings
	defaults                map[*ast.Node]sourceDefaultInput
	order                   []*ast.Node
}

// sourceDefaultInput separates possible activation from the value an initializer returns.
// Missing bindings prove bypass. Conditional execution cannot grant removal authority.
type sourceDefaultInput struct {
	bindings    sourceValueBindings
	conditional bool
}

// defaultInput finds the binding-time context of a summary demand, stopping at its
// lexical execution owner so creating a closure cannot execute its deferred defaults.
func (query *sourceValueQuery) defaultInput(inputs *sourceValueInputs, node *ast.Node, result *accessorCandidates) (sourceDefaultInput, bool) {
	for current := node; current != nil && !ast.IsFunctionLike(current); current = current.Parent {
		if !query.charge(result, current) {
			return sourceDefaultInput{bindings: inputs.bindings, conditional: true}, true
		}
		if bindings, ok := inputs.defaults[current]; ok {
			return bindings, true
		}
	}
	return sourceDefaultInput{bindings: inputs.bindings}, false
}

// bindArguments supplies provenance-only consumers with the same actual/default decisions.
func (query *sourceValueQuery) bindArguments(declaration, node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) sourceValueBindings {
	return query.bindInputs(declaration, node, bindings, result).bindings
}

// bindInputs shares formal/default substitution for execution, returned projections and
// sibling writes. Resolve actuals before installing formals so caller bindings stay intact.
func (query *sourceValueQuery) bindInputs(declaration, node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) *sourceValueInputs {
	return query.bindInvocationInputs(declaration, node, bindings, result, false)
}

// bindSourceMethodInputs keeps an acquired authored method's receiver and raw arguments.
// Its spelling or library-compatible type cannot adapt them as a native call/apply operation.
func (query *sourceValueQuery) bindSourceMethodInputs(declaration, node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) *sourceValueInputs {
	return query.bindInvocationInputs(declaration, node, bindings, result, true)
}

func (query *sourceValueQuery) bindInvocationInputs(declaration, node *ast.Node, bindings sourceValueBindings, result *accessorCandidates, sourceMethod bool, selectedPlans ...*ordinaryInvocationPlan) *sourceValueInputs {
	return query.bindInvocationInputsAtScope(declaration, node, bindings, nil, result, sourceMethod, selectedPlans...)
}

// bindInvocationInputsAtScope acquires actuals under their caller's context before
// installing defaults and formals under the selected callable's original captures.
// Neither the selected scope nor a default can retarget an earlier actual value.
func (query *sourceValueQuery) bindInvocationInputsAtScope(declaration, node *ast.Node, bindings sourceValueBindings, scope *acquiredCallableScope, result *accessorCandidates, sourceMethod bool, selectedPlans ...*ordinaryInvocationPlan) *sourceValueInputs {
	return query.bindInvocationInputsFromObservation(declaration, node, bindings, scope, nil, result, sourceMethod, selectedPlans...)
}

// bindInvocationInputsFromObservation preserves actual argument acquisition in
// caller context while projecting only the selected result's owned local slots.
func (query *sourceValueQuery) bindInvocationInputsFromObservation(declaration, node *ast.Node, bindings sourceValueBindings, scope *acquiredCallableScope, observed *sourceObservedValue, result *accessorCandidates, sourceMethod bool, selectedPlans ...*ordinaryInvocationPlan) *sourceValueInputs {
	captures := bindings
	callerCreators := query.creators
	if scope != nil {
		captures = scope.bindings
	}
	actualCache := make(map[*ast.Node][]sourceValue)
	acquireActual := func(value, at *ast.Node) (values []sourceValue) {
		defer func() {
		}()
		if values, ok := actualCache[value]; ok {
			return values
		}
		// Cache only the consumer publication. Hits never resolve the original
		// pending actual again, including an earlier unavailable result.
		defer func() {
			values = query.sealInitializerValues(values, result)
			actualCache[value] = values
		}()
		previous := query.creators
		query.creators = callerCreators
		defer func() { query.creators = previous }()
		if at == node {
			if values, ok := query.actualArgumentValues(node, value, result); ok {
				return values
			}
		}
		if at == node {
			if values, ok := query.callerActualValues(node, value, result); ok {
				return values
			}
		}
		if len(selectedPlans) == 1 && selectedPlans[0] != nil {
			for _, actual := range selectedPlans[0].captured {
				if !query.charge(result, value) {
					return []sourceValue{{}}
				}
				if actual.node == value {
					values := query.observedArgumentValues(actual.observed, result)
					return values
				}
			}
		}
		if at == node {
			if slot := query.normalOperation(node, false); slot != nil && slot.selected != nil {
				observed := query.normalArgumentObservation(value, bindings, result)
				values := query.observedArgumentValues(observed, result)
				return values
			}
		}
		values = query.originsAt(value, at, bindings, result)
		return values
	}
	if scope != nil {
		query.creators = scope.creators
		defer func() { query.creators = callerCreators }()
	}
	inputs := &sourceValueInputs{declaration: declaration, invocation: node, bindings: make(sourceValueBindings, len(captures)+len(declaration.Parameters())), defaults: make(map[*ast.Node]sourceDefaultInput)}
	beginNormalOperations(inputs)
	bound := inputs.bindings
	for id, values := range captures {
		if !query.charge(result, declaration) {
			return inputs
		}
		bound[id] = query.sealInitializerValues(values, result)
	}
	query.installNormalCaptures(inputs, query.inputs, result)
	query.installSelectedNormalCaptures(inputs, observed, result)
	call := node.AsCallExpression()
	expression := unwrapSourceCallableReferenceWithBudget(call.Expression, func(value *ast.Node) bool { return query.charge(result, value) })
	originalExpression := expression
	actuals := restrictedInvocationArguments(call)
	var receiver *ast.Node
	if !sourceMethod {
		plan := ordinaryInvocationPlan{}
		if len(selectedPlans) == 1 && selectedPlans[0] != nil {
			plan = *selectedPlans[0]
		} else {
			plan = planOrdinaryInvocation(call.Expression, actuals, query.owner.checker, func(value *ast.Node) bool { return query.charge(result, value) })
		}
		expression, actuals, receiver = plan.target, plan.actuals, plan.receiver
	}
	// Budgeted callee resolution can withhold the reference. Retain invocation
	// uncertainty and existing body targets before receiver lookup or formal defaults.
	if expression == nil {
		result.opaque = true
		return inputs
	}
	// The existing adapter resolver can withhold positional inputs. Do not turn
	// that absence of proof into an invocation of a formal's default.
	unknownVector := receiver != nil && actuals == nil
	if receiver == nil && expression == originalExpression {
		receiver, _ = restrictedInvocationMember(expression, query.owner.checker)
	}
	if !ast.IsArrowFunction(declaration) {
		delete(bound, 0)
	}
	if !ast.IsArrowFunction(declaration) && receiver != nil {
		bound[0] = acquireActual(receiver, query.boundInputAcquisition(receiver, node))
	}
	// Materialize in authored order before formal/default installation, including
	// extras and rest inputs. Adapter capture sites retain their original lookup.
	for _, actual := range actuals {
		if !query.charge(result, actual) {
			break
		}
		acquireActual(actual, query.boundInputAcquisition(actual, node))
	}
	// A spread ends positional proof. Share its finite may inputs across later formals.
	spread := len(actuals)
	for index, actual := range actuals {
		if !query.charge(result, actual) {
			break
		}
		if ast.IsSpreadElement(actual) {
			spread = index
			break
		}
	}
	var spreadValues []sourceValue
	for _, actual := range actuals[spread:] {
		if !query.charge(result, actual) {
			break
		}
		spreadValues = append(spreadValues, acquireActual(actual, query.boundInputAcquisition(actual, node))...)
	}
	index := -1
	for _, parameter := range declaration.Parameters() {
		if !query.charge(result, parameter) {
			break
		}
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		index++
		var values []sourceValue
		if parameter.AsParameterDeclaration().DotDotDotToken != nil {
			groups := make([][]sourceValue, 0)
			if unknownVector {
				groups = append(groups, []sourceValue{{}})
			} else if spread < len(actuals) && spread < index {
				groups = append(groups, spreadValues)
			} else if index < len(actuals) {
				for _, actual := range actuals[index:] {
					if !query.charge(result, actual) {
						break
					}
					groups = append(groups, acquireActual(actual, query.boundInputAcquisition(actual, node)))
				}
			}
			for _, group := range groups {
				query.owner.substitutions += len(group)
				query.recordFacts(len(group))
			}
			values = []sourceValue{{node: parameter.Name(), rest: groups}}
		} else if unknownVector || spread < len(actuals) && index >= spread {
			values = spreadValues
			if unknownVector {
				values = []sourceValue{{}}
			}

		} else {
			values = []sourceValue{{undefined: true}}
			if index < len(actuals) {
				values = acquireActual(actuals[index], query.boundInputAcquisition(actuals[index], node))
			}
		}
		query.withActiveInvocation(node, func() {
			values = query.installParameterInput(parameter, values, inputs, result)
		})
		query.owner.substitutions += len(values)
		query.recordFacts(len(values))
		if len(values) > query.owner.maxTerms {
			query.owner.maxTerms = len(values)
		}
	}
	return inputs
}

// boundInputAcquisition preserves a bind prefix's authored capture site. Ordinary
// invocation inputs still acquire at the call, including their argument effects.
func (query *sourceValueQuery) boundInputAcquisition(value, invocation *ast.Node) *ast.Node {
	if value != nil && value.Parent != invocation && ast.IsCallExpression(value.Parent) {
		parent := value.Parent
		receiver, method := restrictedInvocationMember(parent.AsCallExpression().Expression, query.owner.checker)
		if receiver != nil && method == "bind" && nativeFunctionInvocation(receiver, method, query.owner.checker) {
			return parent
		}
	}
	return invocation
}

// withActiveInvocation prevents an occurrence already being analyzed from reentering
// itself as a separate writer. Each caller owns its acquisition/body boundary.
// Nested scopes restore the exact prior entry presence and value.
func (query *sourceValueQuery) withActiveInvocation(invocation *ast.Node, bind func()) {
	previous, present := query.active[invocation]
	query.active[invocation] = true
	defer func() {
		if present {
			query.active[invocation] = previous
		} else {
			delete(query.active, invocation)
		}
	}()
	bind()
}

// materializeInvocationVectors preserves apply's length and indexed Gets independently
// of whether any formal consumes an input. Literal vectors and finite source lengths bound the required Gets.
// Other values retain known Get effects and incompleteness. Positional formal
// substitution remains separate and cannot turn an unresolved vector into empty inputs.
func (query *sourceValueQuery) materializeInvocationVectors(node *ast.Node, plan ordinaryInvocationPlan, bindings sourceValueBindings, result *accessorCandidates) {
	for _, vector := range plan.vectors {
		if !query.charge(result, vector) {
			return
		}
		vector = unwrapSourceCallableReference(vector)
		if vector == nil {
			result.opaque = true
			continue
		}
		if vector.Kind == ast.KindNullKeyword || ast.IsVoidExpression(vector) || ast.IsIdentifier(vector) && query.owner.checker.IsUndefinedSymbol(query.owner.checker.GetSymbolAtLocation(vector)) {
			continue
		}
		if ast.IsArrayLiteralExpression(vector) {
			for _, element := range vector.AsArrayLiteralExpression().Elements.Nodes {
				if !query.charge(result, element) {
					return
				}
				if ast.IsOmittedExpression(element) || ast.IsSpreadElement(element) {
					result.opaque = true
				}
			}
			continue
		}
		previous := query.initializing
		query.initializing = node
		mergeAccessorCandidates(result, query.accessors(vector, nil, "length", accessorRead, bindings, nil))
		length := query.accessors(vector, []string{"length"}, "", accessorAcquire, bindings, nil)
		mergeAccessorCandidates(result, length)
		complete := !length.opaque && len(length.values) > 0
		for _, value := range length.values {
			if !query.charge(result, value.node) {
				complete = false
				break
			}
			if value.node == nil || len(value.path) != 0 || !ast.IsNumericLiteral(value.node) {
				complete = false
				continue
			}
			count, finite := sourceArrayIndex(value.node.Text())
			if !finite {
				complete = false
				continue
			}
			for i := uint64(0); i < count; i++ {
				if !query.charge(result, vector) {
					complete = false
					break
				}
				mergeAccessorCandidates(result, query.accessors(vector, nil, strconv.FormatUint(i, 10), accessorRead, bindings, nil))
			}
		}
		if !complete {
			// Unknown length cannot certify a vector. Retain finite known cell Gets
			// without reading the members of the values stored in those cells.
			for _, origin := range query.originsAt(vector, node, bindings, result) {
				if origin.node == nil || len(origin.path) != 0 {
					continue
				}
				var keys []string
				if ast.IsArrayLiteralExpression(origin.node) {
					for i, element := range origin.node.AsArrayLiteralExpression().Elements.Nodes {
						if !query.charge(result, element) {
							break
						}
						keys = append(keys, strconv.Itoa(i))
					}
				} else if ast.IsObjectLiteralExpression(origin.node) {
					for _, member := range origin.node.AsObjectLiteralExpression().Properties.Nodes {
						if !query.charge(result, member) {
							break
						}
						if member.Name() != nil {
							key := callableNameText(member.Name())
							if _, finite := sourceArrayIndex(key); finite {
								keys = append(keys, key)
							}
						}
					}
				}
				for _, key := range keys {
					if !query.charge(result, vector) {
						break
					}
					mergeAccessorCandidates(result, query.accessors(vector, nil, key, accessorRead, bindings, nil))
				}
			}
			result.opaque = true
		}
		query.initializing = previous
		if result.cause == nil {
			result.cause = vector
		}
	}
}
