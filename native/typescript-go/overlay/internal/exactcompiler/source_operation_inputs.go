package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceGetInputs records a real Get operation and its supplied receiver. It is
// neither a CallExpression nor the numeric-conversion implicit input contract.
// The enclosing installed plan retains captures and the zero-argument defaults.
type sourceGetInputs struct {
	resultSource        *sourceStagedGetResultBorrow       // One original Get SOURCE/Effects loan, revoked synchronously.
	constructionEffects *sourceStagedConstructionGetBorrow // Exact original New prototype Get, revoked synchronously.
	hasInstance         *sourceStagedHasInstanceGetBorrow  // One original operator Get, revoked synchronously.
	// argumentProjection observes only this original argument Get's selected
	// source completion. It grants no normal or invocation permission.
	argumentProjection *sourceArgumentGetProjection
	// arrayIndexMay is a source-only numeric-index effect domain. It never
	// supplies presence, descriptor contents, normal values or completion.
	arrayIndexMay *sourceArrayIndexMay
	ownedRequest  *ownedGetRequest

	// effectSummary borrows this settlement request only, not nested reads.
	effectSummary *sourceOwnEffectSummary
	// ownConditional is a native HasOwnProperty-gated Get. A proven
	// prototype-only descriptor cannot supply this operation's getter.
	// It supplies no own-slot presence, value or completeness certificate.
	ownConditional bool
	// enumerableString is the original entries algorithm's conditional own
	// enumerable string-key Get, separate from result and completion.
	enumerableString bool
	// Presence is an actual HasProperty result, distinct from a Get value.
	presence      *sourcePropertyPresence
	propertyKey   string
	hasOnly       bool
	reflective    *sourceReflectiveOperation
	fieldEffects  *sourceReflectiveFieldRead  // synchronous terminal Get accounting only
	stagedEffects *sourceStagedFieldGetBorrow // exact typed Effects request, never normal input authority
	// inspection is a synchronous reference-view borrow, never value input authority.
	inspection *sourcePropertyReadInspection
	// symbol is an actual well-known key supplied by an implicit native Get,
	// never a string spelling or a type-only receiver/descriptor certificate.
	symbol *ast.Symbol
	// ownSlot is valid only for this actual field Get and receiver alternative.
	ownSlot *sourceOwnSlot

	// thenReferences belong to this actual settlement Get's normal producers.
	// They add inherited alternatives, never private lifetime or absence proof.
	thenReferences []sourceThenReference
	thenIncomplete bool
	// freshReturn is produced only at immediate settlement of a whole literal.
	freshReturn bool
	operation   *ast.Node
	receiver    sourceValue
	// lookupOwner is the descriptor search origin when it differs from this.
	// It never replaces the receiver installed for a selected getter body.
	lookupOwner *sourceValue
}

// sourceArrayIndexMay belongs to one native callback input plan's actual Call
// and represented source array. It ends at index acquisition, before any
// returned element's member Gets are consumed.
type sourceArrayIndexMay struct {
	owner               *sourceValueQuery
	operation, receiver *ast.Node
}

func (query *sourceValueQuery) arrayIndexMayAtGet(get *sourceGetInputs, origin *ast.Node, projection []string, name string, mode accessorTraversal) bool {
	if !query.dependenciesOnly || get == nil || get.arrayIndexMay == nil || get.argumentProjection != nil || (mode != accessorRead && mode != accessorAcquire) || get.ownedRequest != nil || get.reflective != nil || get.symbol != nil || get.receiver.normal != nil || get.receiver.native != nil || get.receiver.acquired != nil || get.lookupOwner != nil || get.inspection != nil || get.effectSummary != nil || get.hasOnly || get.ownConditional || get.freshReturn || len(get.thenReferences) > 0 {
		return false
	}
	domain := get.arrayIndexMay
	if domain.owner != query || domain.operation != get.operation || domain.operation == nil || !ast.IsCallExpression(domain.operation) || domain.receiver != origin || origin == nil || !ast.IsArrayLiteralExpression(origin) || get.receiver.node != origin || len(get.receiver.path) != 0 || get.propertyKey != "*" {
		return false
	}
	return len(projection) == 0 && name == "*" || len(projection) == 1 && projection[0] == "*" && name == ""
}

// sourceGetKeyMayMatch preserves exact-key selection except for an explicitly
// owned source-array index domain. Unknown keys remain possible in either case.
func sourceGetKeyMayMatch(selected, key string, arrayIndexMay bool) bool {
	if selected == "" || selected == key {
		return true
	}
	_, index := sourceArrayIndex(selected)
	return arrayIndexMay && key == "*" && index
}

// receiverOrigins binds only the installed input's own lexical receiver. A
// deferred write in another method/component keeps its symbolic receiver instead
// of borrowing this consumer's arguments[0]. Arrow receivers remain lexical.
func (query *sourceValueQuery) receiverOrigins(node *ast.Node, bindings sourceValueBindings) []sourceValue {
	if query.inputs != nil && query.inputs.declaration != nil && !helperOwnsReceiver(node, query.inputs.declaration) {
		return []sourceValue{{node: node}}
	}
	if values, present := bindings[0]; present {
		return values
	}
	return []sourceValue{{node: node}}
}

func (get *sourceGetInputs) descriptorReceiver() sourceValue {
	if get.lookupOwner != nil {
		return *get.lookupOwner
	}
	return get.receiver
}

// explicitGetProjection checks a supplied operation's selected receiver and
// residual field. It preserves actual Get ownership independently of optional
// normal own-slot precision. It supplies neither a value nor completion proof.
func (query *sourceValueQuery) explicitGetProjection(get *sourceGetInputs, value sourceValue, projection []string, name string, result *accessorCandidates) bool {
	if get.operation == nil || !query.charge(result, get.operation) {
		return false
	}
	receiver := get.receiver
	if receiver.normal != nil && value.normal == nil && value.acquired != nil && receiver.acquired == value.acquired && value.acquired.value.normal == receiver.normal {
		// Normal scope installation precedes acquired-wrapper installation.
		// The matching observation retains the original normal relation after
		// traversal removes that wrapper, while the actual receiver stays intact.
		receiver.normal = nil
	}
	// The acquired wrapper was checked as a unit before its original value
	// entered a normal wrapper. Removing that traversal wrapper does not change
	// this Get's actual receiver or its original input/return association.
	if receiver.acquired != nil && value.acquired == nil {
		receiver = receiver.acquired.value
	}
	if receiver.normal != nil && receiver.normal == value.normal && value.acquired == nil {
		// normalValueScope already validated this exact binding observation.
		// Its original acquired wrapper is not another receiver alternative.
		receiver.acquired = nil
	}
	if receiver.number != value.number || receiver.node != value.node || receiver.normal != value.normal || receiver.acquired != value.acquired || receiver.native != value.native || receiver.bound != value.bound || receiver.awaited != value.awaited || receiver.undefined != value.undefined {
		return false
	}
	length := len(value.path) + len(projection)
	if name != "" {
		length++
	}
	if length != len(receiver.path)+1 {
		return false
	}
	part := func(i int) string {
		if i < len(value.path) {
			return value.path[i]
		}
		i -= len(value.path)
		if i < len(projection) {
			return projection[i]
		}
		return name
	}
	for i, key := range receiver.path {
		if !query.charge(result, get.operation) || part(i) != key {
			return false
		}
	}
	return get.propertyKey == "" || part(length-1) == get.propertyKey
}

// acquireRequiredProperty reads an already selected original alternative. The
// operation owner is supplied by settlement/conversion, while the observation
// retains its own scope and possibly nil inputs. No caller frame is lent.
// acquireRequiredReceivers selects once under the original observation. The
// retained alternatives are receivers, not snapshots of their mutable fields.
func (query *sourceValueQuery) acquireRequiredReceivers(observed sourceObservedValue, result *accessorCandidates) []sourceObservedValue {
	arguments := observed.scope.bindings
	var parent *sourceObservedValue
	selected := accessorCandidates{}
	query.withAcquiredObservation(observed, &arguments, &parent, &selected, func() {
		prior := query.operation
		if prior != nil {
			copy := *prior
			copy.outputOnly = true
			query.operation = &copy
		}
		defer func() { query.operation = prior }()
		value := observed.value
		value.acquired = &observed
		selected = query.accessorsAtGet(value.node, nil, "", accessorAcquire, arguments, nil, nil, value)
	})
	mergeAccessorCandidates(result, selected)
	var receivers []sourceObservedValue
	for i, value := range selected.values {
		if !query.charge(result, value.node) {
			result.valueIncomplete = true
			break
		}
		original := sourceObservedValue{value: value, scope: observed.scope}
		if value.acquired != nil {
			original = *value.acquired
		} else if scope, ok := selected.callableScopes[i]; ok {
			original.scope = scope
		}
		receivers = append(receivers, original)
	}
	if len(receivers) == 0 {
		result.opaque = true
		result.valueIncomplete = true
	}
	return receivers
}

// acquireRequiredPropertyAt consumes one selected receiver without projecting the
// whole operand again. Original value scope and execution inspection stay separate.
func (query *sourceValueQuery) acquireRequiredPropertyAt(original sourceObservedValue, get *sourceGetInputs, mode accessorTraversal) accessorCandidates {
	result := accessorCandidates{}
	if get == nil || get.operation == nil || !query.charge(&result, get.operation) {
		result.opaque = true
		result.valueIncomplete = true
		return result
	}
	if op := get.reflective; op != nil && (!reflectiveNative(op.native) || op.operation != get.operation || op.frame == nil || query.inputs != op.frame || query.operation == nil || query.operation.node != op.operation || query.operation.owner != op.owner || query.operation.inputs != op.frame) {
		result.opaque = true
		result.valueIncomplete = true
		return result
	}
	previousReading := query.reading
	query.reading = get.operation
	defer func() { query.reading = previousReading }()
	receiver := original.value
	receiver.acquired = &original
	actual := *get
	actual.receiver = receiver
	actual.inspection = query.issuePropertyInspection(actual.reflective, &original, actual.propertyKey, &result)
	if actual.reflective != nil && actual.inspection == nil {
		result.opaque = true
	}
	acquired := query.accessorsAtGet(receiver.node, []string{actual.propertyKey}, "", mode, original.scope.bindings, nil, &actual, receiver)
	mergeAccessorCandidates(&acquired, result)
	return acquired
}

// acquireRequiredProperty is the thin single-property adapter for settlement and
// existing owners. Presence is joined, never a last-receiver mutable cell.
func (query *sourceValueQuery) acquireRequiredProperty(observed sourceObservedValue, get *sourceGetInputs, mode accessorTraversal) accessorCandidates {
	result := accessorCandidates{}
	if get == nil || get.operation == nil || !query.charge(&result, get.operation) {
		result.opaque = true
		result.valueIncomplete = true
		return result
	}
	if op := get.reflective; op != nil && (!reflectiveNative(op.native) || op.operation != get.operation || op.frame == nil || query.inputs != op.frame || query.operation == nil || query.operation.owner != op.owner || query.operation.inputs != op.frame) {
		result.opaque = true
		result.valueIncomplete = true
		return result
	}
	receivers := query.acquireRequiredReceivers(observed, &result)
	incomplete := result.opaque || result.valueIncomplete || result.receiverIncomplete
	presence := propertyUnknown
	seen := false
	for _, original := range receivers {
		if !query.charge(&result, get.operation) {
			incomplete = true
			break
		}
		local := *get
		cell := propertyUnknown
		if get.presence != nil {
			local.presence = &cell
		}
		acquired := query.acquireRequiredPropertyAt(original, &local, mode)
		mergeAccessorCandidates(&result, acquired)
		if !seen {
			presence = cell
			seen = true
		} else if presence != cell {
			presence = propertyUnknown
		}
		for i, value := range acquired.values {
			if !query.charge(&result, get.operation) {
				incomplete = true
				break
			}
			if scope, ok := acquired.callableScopes[i]; ok {
				if result.callableScopes == nil {
					result.callableScopes = make(map[int]acquiredCallableScope)
				}
				result.callableScopes[len(result.values)] = scope
			}
			result.values = append(result.values, value)
		}
	}
	if get.presence != nil {
		if !seen || incomplete {
			presence = propertyUnknown
		}
		*get.presence = presence
	}
	if incomplete {
		result.valueIncomplete = true
	}
	return result
}

// installParameterInput is shared after each operation has acquired its actual
// argument domain. Undefined, unknown, rest and copied terms remain distinct.
func (query *sourceValueQuery) installParameterInput(parameter *ast.Node, values []sourceValue, inputs *sourceValueInputs, result *accessorCandidates) []sourceValue {
	values = query.bindingDefault(values, parameter.Initializer(), inputs.bindings, result, inputs)
	query.bindInputPattern(parameter.Name(), values, inputs.bindings, result, accessorAcquire, inputs)
	if inputs != nil && ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() != "this" && parameter.Initializer() == nil && parameter.AsParameterDeclaration().DotDotDotToken == nil {
		symbol := query.owner.checker.GetSymbolAtLocation(parameter.Name())
		if symbol != nil && query.charge(result, parameter) {
			if _, installed := inputs.bindings[ast.GetSymbolId(symbol)]; installed {
				if inputs.installedFormals == nil {
					inputs.installedFormals = make(map[ast.SymbolId]sourceInstalledFormal)
				}
				inputs.installedFormals[ast.GetSymbolId(symbol)] = sourceInstalledFormal{symbol: symbol, parameter: parameter, inputs: inputs}
			}
		}
	}
	return values
}

// bindDefinedParameterInput shares a native protocol's supplied, nonundefined
// top-level argument law. Its abstract value and nested pattern reads remain
// unchanged. This bypass is not normal DATA or body/Call completion authority.
func (query *sourceValueQuery) bindDefinedParameterInput(parameter *ast.Node, values []sourceValue, inputs *sourceValueInputs, result *accessorCandidates) {
	if initializer := parameter.Initializer(); initializer != nil {
		inputs.defaults[initializer] = sourceDefaultInput{}
		inputs.order = append(inputs.order, initializer)
	}
	query.bindInputPattern(parameter.Name(), values, inputs.bindings, result, accessorAcquire, inputs)
}

// bindGetInputs installs an accessor's actual this and zero supplied arguments.
// Arrow callbacks retain lexical this. Descriptor callbacks can have defaults or
// patterns even though ordinary accessor declarations cannot declare arguments.
// No caller or creating activation is inferred from the operation's AST identity.
func (query *sourceValueQuery) bindGetInputs(declaration, operation *ast.Node, receiver sourceValue, captures sourceValueBindings, result *accessorCandidates) *sourceValueInputs {
	inputs := &sourceValueInputs{declaration: declaration, get: &sourceGetInputs{operation: operation, receiver: receiver}, bindings: make(sourceValueBindings, len(captures)+1), defaults: make(map[*ast.Node]sourceDefaultInput)}
	for id, values := range captures {
		if !query.charge(result, operation) {
			return inputs
		}
		inputs.bindings[id] = values
	}
	if !ast.IsArrowFunction(declaration) {
		inputs.bindings[0] = []sourceValue{receiver}
	}
	for _, parameter := range declaration.Parameters() {
		if !query.charge(result, parameter) {
			return inputs
		}
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		values := []sourceValue{{undefined: true}}
		if parameter.AsParameterDeclaration().DotDotDotToken != nil {
			values = []sourceValue{{node: parameter.Name(), rest: make([][]sourceValue, 0)}}
		}
		values = query.installParameterInput(parameter, values, inputs, result)
		query.owner.substitutions += len(values)
		query.recordFacts(len(values))
		if len(values) > query.owner.maxTerms {
			query.owner.maxTerms = len(values)
		}
	}
	return inputs
}

// sourceGetReturn transfers a selected normal Get's values to that same
// accessor invocation's return consumer. Site identity selects storage only. The
// installed input owner and actually consumed demand supply its admission.
type sourceGetReturn struct {
	componentRefs []*ownedGetContribution
	ownedGets     []*ownedGetPopulation

	paid       *languageReceipt
	site       *ast.Node
	values     []sourceObservedValue
	incomplete bool
}

// sourceOperationContext links an existing normal demand to its installed inputs.
// The fact is conditional on that analysis operation. Generic index exploration
// cannot inherit it and source positions cannot create it. It is query-local.
type sourceOperationContext struct {
	node, owner *ast.Node
	inputs      *sourceValueInputs
	// outputOnly is a scoped installed return consumer, never operation creation.
	// It may select an existing disposition from this exact construction only.
	outputOnly bool
}

// suspendOperation separates indexed may-candidates from this normal demand.
// It changes no acquired alternative, effect, order, opacity or query budget.
func (query *sourceValueQuery) suspendOperation() func() {
	previous, previousCaller := query.operation, query.callerInputs
	previousObservation := query.returnObservation
	previousPrefix := query.argumentPrefix
	query.argumentPrefix = query.currentArgumentPrefix()
	if previous != nil && previous.inputs != nil && previous.inputs == query.inputs && (previous.owner == previous.inputs.declaration || previous.inputs.population != nil && previous.inputs.population.moduleEntry(previous.node, previous.owner) != nil) {
		query.callerInputs = &sourceCallerInputOwner{owner: previous.inputs.declaration, frame: previous.inputs, effectOwner: previous.owner, population: previous.inputs.population, authority: query.normalAuthority()}
	}
	query.operation = nil
	query.returnObservation = nil
	return func() {
		query.operation = previous
		query.callerInputs = previousCaller
		query.returnObservation = previousObservation
		query.argumentPrefix = previousPrefix
	}
}

// consumeGetInputs installs one selected Get's receiver/captures and zero
// arguments. Effect and value consumers share this owner without conflating
// unknown data with unknown execution. No caller or creating activation is lent.

func (query *sourceValueQuery) consumeGetInputs(body *ast.Node, get *sourceGetInputs, scope acquiredCallableScope, result *accessorCandidates, consume func(*sourceValueInputs)) {
	if query.operation != nil && query.operation.outputOnly {
		// Return acquisition can consume retained output, never enter a Get
		// wrapper to reconstruct a missing value or repeat its defaults/body.
		result.valueIncomplete = true
		return
	}
	previousObservation := query.returnObservation
	query.returnObservation = nil
	defer func() { query.returnObservation = previousObservation }()
	previous := query.creators
	query.creators = scope.creators
	defer func() { query.creators = previous }()
	inputs := query.bindGetInputs(body, get.operation, get.receiver, scope.bindings, result)
	inputs.get.ownedRequest = get.ownedRequest
	if query.inputs != nil {
		inputs.ownedFact = query.inputs.ownedFact
	}
	beginNormalOperations(inputs)
	// This wrapper created these Get inputs and owns the single interval until
	// its selected final consumer returns. Nested body entry only borrows it.
	defer func() { releaseNormalOperations(inputs) }()
	if query.inputs != nil {
		inputs.properties = query.inputs.properties
	}
	result.retainCallableEffect(get.operation, body)
	consume(inputs)
}

func (query *sourceValueQuery) executeGetEffects(body *ast.Node, get *sourceGetInputs, scope acquiredCallableScope, result *accessorCandidates) {
	if query.transferStagedFieldGetter(body, get, scope, result) {
		return
	}
	if query.transferInstalledSourceGetter(body, get, scope, result) {
		return
	}
	if query.inventoryLookupUnknown() {
		return
	}
	query.consumeGetInputs(body, get, scope, result, func(inputs *sourceValueInputs) {
		if query.dependenciesOnly {
			query.consumeSourceBodyEffects(get.operation, body, inputs.bindings, inputs, nil, result)
		} else {
			query.executeInputs(body, inputs.bindings, result, nil, inputs)
		}
	})
}

// acquireGetResult retains a selected Get's effects separately from its raw return.
// Discarded body values do not describe that return. Source projections grant no
// normal output authority. A callable return is never a promise-job interpretation.
func (query *sourceValueQuery) acquireGetResult(body *ast.Node, get *sourceGetInputs, scope acquiredCallableScope, result *accessorCandidates) sourceResultObservation {
	if query.liveStagedGetResult(get) != nil {

		return sourceResultObservation{incomplete: true, effects: sourceEffectsUnaccounted}
	}
	if query.transferStagedFieldGetter(body, get, scope, result) {
		// The Effects owner retained this selected binder/body requirement. The
		// output remains unavailable and grants no normal-completion authority.
		return sourceResultObservation{incomplete: true, effects: sourceEffectsAccounted}
	}
	if query.transferInstalledSourceGetter(body, get, scope, result) {
		// The original SOURCE Get body contributed Effects. Its returned DATA
		// remains unavailable to this caller; no normal lifetime was installed.
		return sourceResultObservation{incomplete: true, effects: sourceEffectsAccounted}
	}
	if query.inventoryLookupUnknown() {
		return sourceResultObservation{incomplete: true}
	}
	if query.dependenciesOnly {
		observed := sourceResultObservation{}
		execution := *result
		priorValueIncomplete := result.valueIncomplete
		query.consumeGetInputs(body, get, scope, &execution, func(inputs *sourceValueInputs) {
			entered := query.consumeSourceBodyEffects(get.operation, body, inputs.bindings, inputs, nil, &execution)
			// Defaults, patterns and discarded body values retain their effects,
			// but only the selected return describes this Get's output. Preserve
			// caller uncertainty and any refusal before this consumer is entered.
			execution.valueIncomplete = priorValueIncomplete
			assessment := query.projectSelectedSourceReturns(body, get.operation, inputs.bindings, inputs, &execution, func(value sourceValue, bindings sourceValueBindings) {
				observed.values = append(observed.values, sourceObservedValue{value: value, scope: query.acquireCallableScope(bindings, &execution)})
			}, func() { observed.incomplete = true })
			if entered {
				query.observeArgumentGetProjection(get, assessment)
			}
		})
		*result = execution
		return observed
	}

	// A wrapper that refuses before its consumer has no selected output.
	observed := sourceResultObservation{incomplete: true}
	// Body demands retain execution obligations in the same owned record, but
	// their discarded values do not describe this Get's returned observation.
	// A shallow local copy preserves receipt visibility without copying a frame.
	execution := *result
	query.consumeGetInputs(body, get, scope, &execution, func(inputs *sourceValueInputs) {
		observed.incomplete = false
		inputs.returnedGets = make([]sourceGetReturn, 0)
		entered := query.executeInputs(body, inputs.bindings, &execution, nil, inputs)
		query.observeInstalledGetResults(body, inputs, &observed, &execution)
		// Copy the mutation component while this wrapper still owns the inputs.
		// A primitive return or successful value observation cannot supply it.
		verdict := sourceWriteTop
		if entered && query.charge(&execution, body) {
			verdict = inputs.writeComponents[body.Body()]
		}
		execution.accessorMutations = append(execution.accessorMutations, sourceAccessorMutation{operation: get.operation, body: body, verdict: verdict})
		observed.effects = sourceEffectsRefused
		if entered {
			observed.effects = sourceEffectsAccounted
		}
	})
	// Publish body effects, writes and refusals once. The caller's prior value
	// uncertainty stays intact, while this Get's output precision travels only
	// with observed. No execution-accounting fact certifies a complete value.
	execution.valueIncomplete = result.valueIncomplete
	*result = execution
	return observed
}

// reachableGetResults preserves the existing deferred provenance traversal. It
// installs original receiver/captures but does not execute this getter or enroll
// prototype effects merely because a value is reachable from an argument.
func (query *sourceValueQuery) reachableGetResults(body *ast.Node, get *sourceGetInputs, scope acquiredCallableScope, result *accessorCandidates) sourceResultObservation {
	if query.inventoryLookupUnknown() {
		return sourceResultObservation{incomplete: true}
	}
	observed := sourceResultObservation{}
	restore := query.suspendOperation()
	defer restore()
	query.consumeGetInputs(body, get, scope, result, func(inputs *sourceValueInputs) { query.observeInstalledGetResults(body, inputs, &observed, result) })
	return observed
}
