package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Phases locate syntax dependencies. Only a matching actual operation/input
// owner can instantiate a disposition. No state certifies runtime completion.
type sourceNormalPhaseRole uint8

const (
	sourceNormalSelect sourceNormalPhaseRole = iota
	sourceNormalAdmit
	sourceNormalArgumentBegin
	sourceNormalArgumentEnd
	sourceNormalArgumentAbort
)

type sourceNormalPhase struct {
	node, argument *ast.Node
	role           sourceNormalPhaseRole
	ordinal        int
}
type sourceOperationDisposition uint8

const (
	sourceOperationPending sourceOperationDisposition = iota
	sourceOperationInProgress
	sourceOperationConsumed
	sourceOperationRefused
	sourceOperationBypassed
)

type sourceNormalActual struct {
	footprint sourceWriteVerdict

	node     *ast.Node
	observed sourceResultObservation
}
type sourcePreparedBody struct {
	declaration *ast.Node
	scope       acquiredCallableScope
	observed    *sourceObservedValue
}
type sourcePreparedInvocation struct {
	bodies         []sourcePreparedBody
	declarations   []*ast.Node
	base, acquired accessorCandidates
	scope          acquiredCallableScope
	remaining      int
	receiver       *ast.Node
	receiverValues []sourceValue
}
type sourceNormalOperation struct {
	closedPrefix *closedPrefixHistory
	closedView   *closedPrefixSlotView
	ownedRequest *ownedGetRequest

	prefixView   *sourcePropertyReferenceView
	prefixSource *sourceNormalSourceIdentity
	prefixRoot   *ast.Node
	authority    sourceNormalAuthority

	writeIdentity           *sourceWriteOperationIdentity
	writeAlternatives       []*sourceWriteAlternative
	writePopulationComplete bool
	writeCallee             sourceWriteVerdict

	descriptorOccurrence *sourceDescriptorEffectOccurrence
	selectionComplete    bool
	remaining            int
	writeEffect          sourceWriteVerdict

	entry      *sourceNormalOccurrence
	population *sourceNormalPopulation

	state                               sourceOperationDisposition
	selected                            *sourcePreparedInvocation
	actuals                             []sourceNormalActual
	output                              sourceResultObservation
	invocationOwned, replacedInvocation bool
}

// sourceCallerInputOwner is retained only from an actual installed operation
// before auxiliary inspection suspends creation. It is not a value/capture frame.
type sourceCallerInputOwner struct {
	owner       *ast.Node
	frame       *sourceValueInputs
	effectOwner *ast.Node
	population  *sourceNormalPopulation
	authority   sourceNormalAuthority
}

// sourceCallInputDemand names one raw Call input in its admitted construction.
// Argument position/expression and parent disposition are checked before lookup.
// Receiver inputs use position -1 and the retained preargument receiver header.
type sourceCallInputDemand struct {
	caller           *sourceCallerInputOwner
	call, expression *ast.Node
	position         int
	parent           *sourceNormalOperation
}

// callerActualValues never executes an argument or publishes its effects. Missing
// association preserves ordinary inspection. An admitted unresolved child refuses
// output instead of turning auxiliary binding into another actual producer.
func (query *sourceValueQuery) callerActualValues(call, expression *ast.Node, result *accessorCandidates) ([]sourceValue, bool) {
	caller := query.callerInputs
	if caller == nil || caller.frame == nil || caller.owner != caller.frame.declaration || !ast.IsCallExpression(call) {
		return nil, false
	}
	if enclosingCallableNode(call) != caller.owner {
		if !caller.authority.valid(query) || caller.population == nil || caller.frame.population != caller.population || caller.population.root != caller.owner || caller.population.moduleEntry(call, caller.effectOwner) == nil {
			return nil, false
		}
	}
	if !query.charge(result, call) {
		return []sourceValue{{}}, true
	}
	parent := caller.frame.operations[call]
	if parent == nil {
		return nil, false
	}
	demand := sourceCallInputDemand{caller: caller, call: call, expression: expression, position: -2, parent: parent}
	if args := call.AsCallExpression().Arguments; args != nil {
		for position, actual := range args.Nodes {
			if !query.charge(result, actual) {
				return []sourceValue{{}}, true
			}
			if actual == expression {
				demand.position = position
				break
			}
		}
	}
	if demand.position == -2 && parent.selected != nil && parent.selected.receiver == expression {
		demand.position = -1
	}
	if demand.position == -2 {
		return nil, false
	}
	if query.callerInputs != demand.caller || demand.caller.frame.operations[demand.call] != demand.parent {
		return nil, false
	}
	if parent.state == sourceOperationBypassed {
		return nil, true
	}
	for _, actual := range parent.actuals {
		if !query.charge(result, expression) {
			return []sourceValue{{}}, true
		}
		if actual.node == demand.expression {
			return query.observedArgumentValues(actual.observed, result), true
		}
	}
	if demand.position == -1 && parent.selected != nil {
		return parent.selected.receiverValues, true
	}
	operand, _ := query.normalResultValueOperand(expression, result)
	if !query.charge(result, operand) {
		return []sourceValue{{}}, true
	}
	child := caller.frame.operations[operand]
	if child != nil && (ast.IsPropertyAccessExpression(operand) || ast.IsElementAccessExpression(operand)) {
		return query.observedArgumentValues(normalGetOutput(child), result), true
	}
	if child != nil && ast.IsCallExpression(operand) {
		// A Call disposition is not a raw return receipt. Before the parent
		// actual observation is published, retain unknown without another Call.
		return []sourceValue{{}}, true
	}
	if parent.state == sourceOperationConsumed || parent.state == sourceOperationRefused {
		return []sourceValue{{}}, true
	}
	// This admitted actual has not published a value yet. Auxiliary receiver
	// inspection gets unknown data, never another evaluation or execution opacity.
	// A body that uses it as a writer still retains its ordinary MAY uncertainty.
	return []sourceValue{{}}, true
}

// A body/default operation overlay lives until its final raw-result consumer.
// Restoration returns the exact preexisting table, including nonnil prior maps.
type sourceNormalOperationLifetime struct {
	previous            map[*ast.Node]*sourceNormalOperation
	previousDispatcher  *sourceNormalDispatcher
	previousComponents  map[*ast.Node]sourceWriteVerdict
	previousFormals     map[ast.SymbolId]sourceInstalledFormal
	previousAlternative *sourceWriteAlternative
}

func beginNormalOperations(inputs *sourceValueInputs) {
	if inputs == nil || inputs.operationLifetime != nil {
		return
	}
	inputs.operationLifetime = &sourceNormalOperationLifetime{previous: inputs.operations, previousDispatcher: inputs.dispatcher, previousComponents: inputs.writeComponents, previousFormals: inputs.installedFormals, previousAlternative: inputs.writeAlternative}
	inputs.dispatcher = &sourceNormalDispatcher{}
	inputs.writeComponents = nil
	inputs.installedFormals = nil
	inputs.writeAlternative = nil
	inputs.operations = nil
}
func releaseNormalOperations(inputs *sourceValueInputs) {
	if inputs != nil {
		releaseConstructedOutputs(inputs)
	}
	if inputs != nil {
		inputs.storage = nil
	}
	if inputs == nil || inputs.operationLifetime == nil {
		return
	}
	for _, slot := range inputs.operations {
		// closed prefix view release observation
		slot.closedView = nil
		slot.closedPrefix = nil
	}
	dropInitializerActuals(inputs.operations)
	inputs.writeComponents = inputs.operationLifetime.previousComponents
	inputs.installedFormals = inputs.operationLifetime.previousFormals
	inputs.writeAlternative = inputs.operationLifetime.previousAlternative
	inputs.operations = inputs.operationLifetime.previous
	releaseNormalDispatcher(inputs)
	inputs.dispatcher = inputs.operationLifetime.previousDispatcher
	inputs.operationLifetime = nil
}

// normalOperation separates admission from lookup. Only the actual operation's
// explicit construction owns records. Projected output inputs never supply it.
func (query *sourceValueQuery) normalOperation(node *ast.Node, create bool) *sourceNormalOperation {
	operation := query.operation
	if operation == nil || operation.inputs == nil {
		return nil
	}
	callable := enclosingCallableNode(node)
	if query.constructionFieldDomain(operation.inputs, node) {
		if operation.owner != operation.inputs.declaration {
			return nil
		}
	} else if callable != nil {
		if operation.owner != operation.inputs.declaration || callable != operation.owner {
			return nil
		}
	} else {
		population := operation.inputs.population
		if population == nil || population.root != operation.inputs.declaration || population.moduleEntry(node, operation.owner) == nil {
			return nil
		}
	}
	inputs := operation.inputs
	if create && (operation.outputOnly || query.inputs != inputs || operation.node != node) {
		return nil
	}
	if inputs.operations == nil {
		if !create {
			return nil
		}
		inputs.operations = make(map[*ast.Node]*sourceNormalOperation)
	}
	slot := inputs.operations[node]
	if slot == nil && create {
		slot = &sourceNormalOperation{state: sourceOperationPending, population: inputs.population, remaining: query.remaining, authority: query.normalAuthority(), writeIdentity: &sourceWriteOperationIdentity{}}
		if inputs.population != nil {
			slot.entry = inputs.population.entries[node]
		}
		if view := query.propertyView(); view != nil && view.normalSelectionDone {
			source := view.normalSources[ast.GetSourceFileOfNode(node)]
			if source != nil && source.domains[inputs.declaration] == inputs.population {
				slot.prefixView, slot.prefixSource, slot.prefixRoot = view, source, inputs.declaration
			}
		}
		inputs.operations[node] = slot
		if query.owner != nil {
			query.owner.closedPrefixCandidate.observeSlot(query, node, slot)
		}
		if ast.IsCallExpression(node) && inputs.dispatcher != nil {
			inputs.dispatcher.pending = append(inputs.dispatcher.pending, slot)
		}
	}
	return slot
}

// normalGetOutput is output-only. A nonterminal occurrence has not supplied a
// value, and refusal keeps known conditional alternatives with incompleteness.
func normalGetOutput(slot *sourceNormalOperation) sourceResultObservation {
	observed := slot.output
	switch slot.state {
	case sourceOperationPending, sourceOperationInProgress, sourceOperationRefused:
		observed.incomplete = true
		observed.effects = sourceEffectsRefused
	case sourceOperationBypassed:
		if len(observed.ownedGets) > 0 || len(observed.componentRefs) > 0 {
			observed.incomplete = true
			observed.effects = sourceEffectsRefused
			return observed
		}
		return sourceResultObservation{effects: sourceEffectsBypassed}
	}
	return observed
}

// selectionProjection transfers only retained selection facts. Producer effects
// have already been published and must not be merged by later lookup.
func selectionProjection(c accessorCandidates) accessorCandidates {
	return accessorCandidates{ownedComponents: candidateReferenceView(c), ownedGets: c.ownedGets, values: c.values, callableScopes: c.callableScopes, ordinaryBodies: c.ordinaryBodies, sourceCallable: c.sourceCallable, sourceOwned: c.sourceOwned, selected: c.selected, opaque: c.opaque, valueIncomplete: c.valueIncomplete, receiverIncomplete: c.receiverIncomplete}
}

func (query *sourceValueQuery) consumeNormalPhase(phase sourceNormalPhase, bindings sourceValueBindings, result *accessorCandidates) {

	priorOperation := query.operation
	if priorOperation != nil && query.inputs != nil && priorOperation.inputs == query.inputs && (priorOperation.owner == query.inputs.declaration || query.inputs.population != nil && query.inputs.population.moduleEntry(phase.node, priorOperation.owner) != nil) {
		query.operation = &sourceOperationContext{node: phase.node, owner: priorOperation.owner, inputs: query.inputs, outputOnly: priorOperation.outputOnly}
	}
	defer func() { query.operation = priorOperation }()
	if ast.IsNewExpression(phase.node) {
		query.prepareConstructionPhase(phase, bindings, result)
		return
	}
	slot := query.normalOperation(phase.node, true)
	if slot == nil {
		// No actual schedule is not a failed admitted phase. Existing inventory
		// demand consumption still owns its independent effects and refusals.
		if query.operation != nil {
			result.opaque = true
		}
		return
	}

	if query.owner != nil {
		if h := query.owner.prefixHistory(phase.node); h != nil {
			p := query.owner.closedPrefixCandidate
			if phase.role == sourceNormalAdmit && p != nil && !p.authenticated && phase.node == p.call && (h.state == prefixQualified || h.state == prefixEntered && p.continuation != nil) {
				if p.retryLegacy {
					return
				}
				if p.authenticate(query, phase.node, slot) {
					p.enter(query, slot)
					return
				}
				if h.state == prefixEntered {
					p.refuseSourceContinuation()
					slot.state = sourceOperationRefused
					result.opaque, result.valueIncomplete, result.cause = true, true, phase.node
					return
				}
				p.retryLegacy = true
				return // the outer source owner restarts whole legacy before any execution
			} else {
				query.projectClosedPrefixPhase(phase, slot, h)
				return
			}
		}
	}
	// Only an authenticated prefix may consume an implicit binding phase.
	// Before-entry refusal must stop here, before Call-only preparation and
	// write-alternative helpers can interpret the declaration as Call syntax.
	if !ast.IsCallExpression(phase.node) {
		slot.state = sourceOperationRefused
		result.opaque, result.valueIncomplete, result.cause = true, true, phase.node
		return
	}
	defer query.normalWork(result, phase.node)()
	if phase.role == sourceNormalAdmit {
		if !query.charge(result, phase.node) {
			slot.state = sourceOperationRefused
		}
		slot.remaining = query.remaining
		return
	}
	if phase.role == sourceNormalArgumentAbort {
		slot.state = sourceOperationRefused
		if query.inputs != nil && query.inputs.dispatcher != nil {
			d := query.inputs.dispatcher
			if d.prefix != nil && d.prefix.operation == slot {
				d.prefix.active = false
				d.prefix = d.prefix.prior
			}
		}
		return
	}
	if slot.state == sourceOperationBypassed || slot.state == sourceOperationRefused || slot.state == sourceOperationConsumed {
		return
	}
	if phase.role == sourceNormalArgumentBegin {
		if query.inputs == nil || query.inputs.dispatcher == nil || slot.entry == nil || !slot.entry.once {
			return
		}
		if slot.selected == nil || slot.state != sourceOperationPending || phase.ordinal != len(slot.actuals) {
			result.opaque = true
			return
		}
		d := query.inputs.dispatcher
		prior := d.prefix
		if prior == nil {
			prior = query.argumentPrefix
		}
		d.prefix = &sourceArgumentPrefix{operation: slot, call: phase.node, ordinal: phase.ordinal, prior: prior, active: true, dispatcher: d}
		return
	}
	if phase.role == sourceNormalArgumentEnd && query.inputs != nil && query.inputs.dispatcher != nil {
		d := query.inputs.dispatcher
		prefix := d.prefix
		defer func() {
			if prefix != nil && prefix.operation == slot {
				prefix.active = false
				d.prefix = prefix.prior
			}
		}()
	}
	possible, _ := query.reachable(phase.node, bindings)
	if !possible {
		slot.state = sourceOperationBypassed
		return
	}

	if slot.selected != nil && slot.selected.remaining < query.remaining {
		query.remaining = slot.selected.remaining
	}
	defer func() {
		if slot.selected != nil && query.remaining < slot.selected.remaining {
			slot.selected.remaining = query.remaining
		}
	}()
	if slot.state == sourceOperationConsumed || slot.state == sourceOperationRefused || slot.state == sourceOperationBypassed {
		return
	}
	if !query.charge(result, phase.node) {
		slot.state = sourceOperationRefused
		return
	}
	if phase.argument == nil {
		if slot.selected != nil || slot.state != sourceOperationPending {
			return
		}
		slot.state = sourceOperationInProgress
		selected, effects := query.prepareInvocation(phase.node, bindings)
		mergeAccessorCandidates(result, effects)
		slot.selected = &selected
		query.prepareWriteAlternatives(slot, phase.node, selected, result)
		slot.state = sourceOperationPending

		return
	}
	if slot.selected == nil || slot.state != sourceOperationPending {
		result.opaque = true
		return
	}
	// Each authored actual is produced once, in the shared plan's lexical order.
	for _, actual := range slot.actuals {
		if !query.charge(result, phase.argument) {
			slot.state = sourceOperationRefused
			return
		}
		if actual.node == phase.argument {
			return
		}
	}
	previousSelection := query.initializerSelection
	query.initializerSelection = query.initializerArgument(phase, slot, result)
	defer func() { query.initializerSelection = previousSelection }()
	observed := query.normalArgumentObservation(phase.argument, bindings, result)
	slot.actuals = append(slot.actuals, sourceNormalActual{node: phase.argument, observed: observed, footprint: query.inputs.writeComponents[phase.argument]})
	if phase.ordinal == 0 {
		query.observeMapInput(phase.node, slot, observed)
	}
}

func (query *sourceValueQuery) normalArgumentObservation(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) sourceResultObservation {
	if query.holdClosedPrefix(node, result) {
		return sourceResultObservation{incomplete: true, effects: sourceEffectsRefused}
	}
	value, _ := query.normalResultValueOperand(node, result)
	// Budgeted projection can refuse a nonnil operand. Its obligations already
	// retain that refusal, while the missing value stays incomplete.
	if value == nil {
		return sourceResultObservation{incomplete: true}
	}
	if ast.IsSpreadElement(value) {
		// Finite syntax contributes possible element inputs, never proof of the
		// iterator or an empty/positional vector. Unknown remains independent.
		operand := unwrapSourceCallableReference(value.AsSpreadElement().Expression)
		observed := sourceResultObservation{incomplete: true}
		if ast.IsArrayLiteralExpression(operand) {
			for _, element := range operand.AsArrayLiteralExpression().Elements.Nodes {
				if !query.charge(result, element) {
					break
				}
				part := query.normalArgumentObservation(element, bindings, result)
				observed.values = append(observed.values, part.values...)
			}
		}
		return observed
	}
	if slot := query.normalOperation(value, false); slot != nil && (ast.IsPropertyAccessExpression(value) || ast.IsElementAccessExpression(value)) {
		return normalGetOutput(slot)
	}
	if ast.IsCallExpression(value) {
		raw, found := query.acquireNormalCallResult(value, result)
		raw.incomplete = raw.incomplete || !found
		return raw
	}
	if ast.IsNewExpression(value) {
		if observed, found := query.constructedOutput(value); found {
			return observed
		}
		result.opaque, result.valueIncomplete = true, true
		return sourceResultObservation{incomplete: true, effects: sourceEffectsRefused}
	}
	terms := query.originsAt(value, node, bindings, result)
	observed := sourceResultObservation{incomplete: len(terms) == 0, effects: sourceEffectsAccounted}
	for _, term := range terms {
		if !query.charge(result, value) {
			observed.incomplete = true
			observed.effects = sourceEffectsRefused
			break
		}
		if term.acquired != nil {
			original := *term.acquired
			original.value = term
			observed.values = append(observed.values, original)
			continue
		}
		scope := query.acquireCallableScope(bindings, result)
		if term.normal != nil {
			var admitted bool
			scope, admitted = query.normalValueScope(term, result)
			if !admitted {
				observed.incomplete = true
				continue
			}
		}
		observed.incomplete = observed.incomplete || term.node == nil && !term.undefined
		observed.values = append(observed.values, sourceObservedValue{value: term, inputs: query.inputs, scope: scope})
	}
	return observed
}

func (query *sourceValueQuery) observedArgumentValues(observed sourceResultObservation, result *accessorCandidates) []sourceValue {
	importCandidateReferences(result, observed.componentRefs)
	importCandidateReferences(result, ownedPopulationContributions(observed.ownedGets))
	mergeOwnedGets(&result.ownedGets, observed.ownedGets)
	values := make([]sourceValue, 0, len(observed.values)+1)
	for _, original := range observed.values {
		if original.value.ownedGetRow != nil {
			values = append(values, original.value)
			continue
		}
		if !query.charge(result, original.value.node) {
			values = append(values, sourceValue{})
			return values
		}
		copy := original
		value := original.value
		value.acquired = &copy
		values = append(values, value)
	}
	if observed.incomplete {
		values = append(values, sourceValue{})
	}
	return values
}

// actualArgumentValues is input-only lookup. It cannot invoke, select a callee,
// manufacture a return receipt or turn a missing vector into an empty vector.
func (query *sourceValueQuery) actualArgumentValues(call, argument *ast.Node, result *accessorCandidates) ([]sourceValue, bool) {
	slot := query.normalOperation(call, false)
	if slot == nil {
		return nil, false
	}
	if slot.selected == nil {
		result.opaque = true
		return []sourceValue{{}}, true
	}
	for _, actual := range slot.actuals {
		if !query.charge(result, argument) {
			return []sourceValue{{}}, true
		}
		if actual.node == argument {
			return query.observedArgumentValues(actual.observed, result), true
		}
	}
	if slot.selected.receiver == argument {
		return slot.selected.receiverValues, true
	}
	result.opaque = true
	return []sourceValue{{}}, true
}

// consumeNormalGet pairs effects and acquired output at the existing actual Get
// owner. Refusal remains opaque and later lookup cannot start another Get.
func (query *sourceValueQuery) consumeNormalGet(node *ast.Node, bindings sourceValueBindings) (result accessorCandidates) {
	// Finalize the producer cache after deferred budget setters. A cached lookup
	// never rewrites the original producer or acquires a publication right.
	var produced *sourceNormalOperation
	defer func() {
		if produced != nil && result.ownedComponents != nil {
			produced.output.componentRefs = candidateContributionReferences(result)
		}
	}()
	defer query.normalWork(&result, node)()
	priorOperation := query.operation
	if priorOperation != nil && query.inputs != nil && priorOperation.inputs == query.inputs && priorOperation.owner == query.inputs.declaration {
		query.operation = &sourceOperationContext{node: node, owner: priorOperation.owner, inputs: query.inputs, outputOnly: priorOperation.outputOnly}
	}
	defer func() { query.operation = priorOperation }()
	if query.operation != nil && query.operation.inputs != nil {
		defaults, isDefault := query.defaultInput(query.operation.inputs, node, &result)
		if isDefault && defaults.bindings == nil {
			return result
		}
	}
	if possible, _ := query.reachable(node, bindings); !possible {
		return result
	}
	slot := query.normalOperation(node, true)
	if slot == nil {
		return query.accessors(node, nil, "", accessorAcquire, bindings, nil)
	}
	if slot.state != sourceOperationPending {
		return normalOutputCandidates(normalGetOutput(slot))
	}
	produced = slot
	ownedResult, adopted := query.tryOwnedGet(node, slot)
	slot.state = sourceOperationInProgress
	query.prepareNormalGetProperties(node, slot, &result)
	preparation := result
	previousReading, previousMember := query.reading, query.protectedMember
	query.reading, query.protectedMember = node, node
	defer func() { query.reading, query.protectedMember = previousReading, previousMember }()
	acquire := func() {
		if adopted {
			result = ownedResult
			return
		}
		if query.observeComponentProtocolGet(node, slot, bindings, &result) {
			return
		}
		result = query.accessorsAtGetOutput(node, nil, "", accessorAcquire, bindings, nil, nil, slot)
	}
	// This Get used to run inside receiverCandidates' active invocation interval.
	// Keep that same fence when the shared normal producer consumes it first.
	if call := normalCalleeGetOwner(node); call != nil {
		query.withActiveInvocation(call, acquire)
	} else {
		acquire()
	}
	mergeAccessorCandidates(&result, preparation)

	slot.output = sourceResultObservation{componentRefs: candidateContributionReferences(result), ownedGets: result.ownedGets, incomplete: result.valueIncomplete || result.receiverIncomplete || len(result.values) == 0, effects: sourceEffectsAccounted}
	if len(result.ownedGets) > 0 {
		slot.output.owned = result.ownedGets[len(result.ownedGets)-1].receipt
	}
	for i, value := range result.values {
		if value.ownedGetRow != nil {
			slot.output.values = append(slot.output.values, sourceObservedValue{value: value})
			continue
		}
		if !query.charge(&result, node) {
			slot.output.incomplete = true
			break
		}
		if value.acquired != nil {
			original := *value.acquired
			original.value = value
			slot.output.values = append(slot.output.values, original)
			continue
		}
		scope, ok := result.callableScopes[i]
		if !ok {
			scope = query.acquireCallableScope(bindings, &result)
		}
		slot.output.values = append(slot.output.values, sourceObservedValue{value: value, inputs: query.inputs, scope: scope})
	}
	slot.writeEffect = query.nativeGetWriteEffect(node, &result)
	if slot.writeEffect != sourceWriteNoWrites && query.ordinaryAdapterDataGet(node, &result) {
		slot.writeEffect = sourceWriteNoWrites
	}
	if slot.writeEffect != sourceWriteNoWrites {
		slot.writeEffect = query.namespaceExportReadEffect(node, slot, &result)
	}
	if slot.writeEffect == sourceWriteNoWrites && query.inputs != nil {
		if query.inputs.writeComponents == nil {
			query.inputs.writeComponents = make(map[*ast.Node]sourceWriteVerdict)
		}
		for _, component := range result.nativeDescriptorEffects {
			if !query.charge(&result, node) {
				slot.writeEffect = sourceWriteTop
				break
			}
			if (component.kind == sourceStandardPromiseEntry || component.kind == sourceStandardObjectEntry) && component.verdict == sourceWriteNoWrites {
				query.inputs.writeComponents[component.acquired] = sourceWriteNoWrites
			}
		}
	}
	slot.state = sourceOperationConsumed
	query.retainCompletedDataGet(slot, node, &result)
	if read, write := accessorEvaluationMode(node); read && !write {
		receiver, key := accessorReceiver(node)
		query.appendFieldReadOutcome(node, receiver, key, &result)
	}

	return result
}
func normalOutputCandidates(observed sourceResultObservation) accessorCandidates {
	result := accessorCandidates{ownedReferenceOnly: len(observed.ownedGets) > 0, ownedGets: observed.ownedGets, callableScopes: make(map[int]acquiredCallableScope)}
	retainResultUncertainty(observed, &result, sourceExecutionOutput)
	if len(observed.ownedGets) > 0 || len(observed.componentRefs) > 0 {
		result.ownedComponents = &sourceCandidateComponents{references: append([]*ownedGetContribution(nil), observed.componentRefs...)}
		appendContributionRefs(&result.ownedComponents.references, ownedPopulationContributions(observed.ownedGets))
	}
	retainCandidateReferenceFlags(&result)
	for _, original := range observed.values {
		if original.value.ownedGetRow != nil {
			result.values = append(result.values, original.value)
			continue
		}
		copy := original
		value := original.value
		value.acquired = &copy
		result.callableScopes[len(result.values)] = original.scope
		result.values = append(result.values, value)
	}
	return result
}

func (query *sourceValueQuery) withNormalReceipts(owner, reader *ast.Node, inputs *sourceValueInputs, result *accessorCandidates, consume func()) {
	previous := query.returnObservation
	query.returnObservation = &sourceReturnObservation{owner: owner, reader: reader, frame: inputs, receipts: result.nativeCalls, normalCalls: result.normalCalls}
	defer func() { query.returnObservation = previous }()
	consume()
}

// consumeDefaultPlan uses the same cached admitted normal demands. It is called
// only while the actual selected Call installs this default, not by an input or
// return observer. Subsequent body demands reuse those operation dispositions.
func (query *sourceValueQuery) consumeDefaultPlan(initializer *ast.Node, inputs *sourceValueInputs, bindings sourceValueBindings, result *accessorCandidates) (sourceResultObservation, bool) {
	if inputs == nil || inputs.invocation == nil || query.normalBindingCall != inputs.invocation {
		return sourceResultObservation{}, false
	}
	parent := query.normalOperation(inputs.invocation, false)
	if parent == nil || parent.state != sourceOperationInProgress || parent.selected == nil {
		return sourceResultObservation{}, false
	}
	previousInputs, previousOperation, previousInitializing := query.inputs, query.operation, query.initializing
	query.inputs, query.operation, query.initializing = inputs, &sourceOperationContext{node: initializer, owner: inputs.declaration, inputs: inputs}, initializer
	defer func() {
		query.inputs, query.operation, query.initializing = previousInputs, previousOperation, previousInitializing
	}()
	for _, demand := range query.owner.summary(inputs.declaration).normal {
		if demand.visitOnly {
			continue
		}
		if !query.charge(result, initializer) {
			break
		}
		belongs := demand.defaultKnown && demand.defaultRoot == initializer
		if !demand.defaultKnown {
			for n := demand.node; n != nil && !ast.IsFunctionLike(n); n = n.Parent {
				if !query.charge(result, n) {
					break
				}
				if n == initializer {
					belongs = true
					break
				}
			}
		}
		if !belongs {
			continue
		}
		query.withNormalReceipts(inputs.declaration, demand.node, inputs, result, func() {
			if demand.fold != nil {
				query.consumeNormalFold(*demand.fold, result)
			} else if demand.phase != nil {
				query.consumeNormalPhase(*demand.phase, bindings, result)
			} else if demand.operand != nil {
				query.consumeNormalOperand(*demand.operand, inputs.declaration, bindings, result, inputs)
			} else {
				query.executeDemand(demand.node, inputs.declaration, bindings, result, nil, inputs)
			}
		})
	}
	var observed sourceResultObservation
	query.withNormalReceipts(inputs.declaration, initializer, inputs, result, func() { observed = query.normalArgumentObservation(initializer, bindings, result) })
	return observed, true
}

// normalCalleeGetOwner locates the existing acquisition interval only. It cannot
// install inputs, select a target or supply an acquired value.
func normalCalleeGetOwner(node *ast.Node) *ast.Node {
	current := node
	for current != nil && current.Parent != nil {
		parent := current.Parent
		if ast.IsCallExpression(parent) && parent.AsCallExpression().Expression == current {
			return parent
		}
		if unwrapSourceCallableReference(parent) == node {
			current = parent
			continue
		}
		if ast.IsPropertyAccessExpression(parent) && parent.AsPropertyAccessExpression().Expression == current || ast.IsElementAccessExpression(parent) && parent.AsElementAccessExpression().Expression == current {
			current = parent
			continue
		}
		break
	}
	return nil
}

// normalGetEffectsAccounted grants only the matching producer's accounting.
// Receiver/key/alternative coverage and independent refusal remain separate.
func (query *sourceValueQuery) normalGetEffectsAccounted(node *ast.Node, result *accessorCandidates) bool {
	if !query.charge(result, node) {
		return false
	}
	slot := query.normalOperation(node, false)
	return slot != nil && slot.state == sourceOperationConsumed && slot.output.effects == sourceEffectsAccounted
}

// normalDemandDefault reads the generation's edge classification. It does not
// rediscover default membership with an ancestry walk for every scalar event.
func (query *sourceValueQuery) normalDemandDefault(demand sourceNormalDemand, inputs *sourceValueInputs, result *accessorCandidates) (sourceDefaultInput, bool) {
	if !demand.defaultKnown {
		return query.defaultInput(inputs, demand.node, result)
	}
	if !query.charge(result, demand.node) {
		return sourceDefaultInput{}, true
	}
	if demand.defaultRoot == nil {
		return sourceDefaultInput{}, false
	}
	return inputs.defaults[demand.defaultRoot], true
}

// componentProtocolGetSlot is the shared live occurrence boundary. Source shape
// and checker selection alone cannot authorize an installed Get observation.
func (query *sourceValueQuery) componentProtocolGetSlot(node *ast.Node, state sourceOperationDisposition) *sourceNormalOperation {
	if query.inputs == nil || query.inputs.operationLifetime == nil || query.operation == nil || query.operation.inputs != query.inputs || query.operation.owner != query.inputs.declaration {
		return nil
	}
	slot := query.normalOperation(node, false)
	if slot == nil || slot.state != state || !slot.authority.valid(query) || slot.population == nil || slot.population != query.inputs.population || slot.population.root != query.inputs.declaration || slot.entry == nil || slot.entry.node != node || slot.population.entries[node] != slot.entry || slot.entry.callOwner == nil || slot.entry.callOwner.node != normalCalleeGetOwner(node) || slot.population.entries[slot.entry.callOwner.node] != slot.entry.callOwner {
		return nil
	}
	return slot
}

// observeComponentProtocolGet retains the original member occurrence directly.
// It does not traverse signatures or reacquire a receiver. Existing preparation
// and child effects remain with their actual producers and are never cleared.
func (query *sourceValueQuery) observeComponentProtocolGet(node *ast.Node, slot *sourceNormalOperation, bindings sourceValueBindings, result *accessorCandidates) bool {
	if query.operation == nil || query.operation.node != node || query.operation.outputOnly || query.componentProtocolGetSlot(node, sourceOperationInProgress) != slot || checkedNonliteralComponentProtocolGet(node, query.owner.checker) == nil {
		return false
	}
	key := unwrapSourceCallableReference(node.AsElementAccessExpression().ArgumentExpression)
	if !ast.IsIdentifier(key) {
		// A property/call key needs its actual child output. A consumed flag or
		// literal type alone cannot account for an unknown child Get/effect.
		child := query.normalOperation(key, false)
		if child == nil || child.state != sourceOperationConsumed || !child.authority.valid(query) || child.population != slot.population || child.entry == nil || child.population.entries[key] != child.entry {
			return false
		}
		observed := sourceResultObservation{}
		if ast.IsPropertyAccessExpression(key) || ast.IsElementAccessExpression(key) {
			observed = normalGetOutput(child)
		} else if ast.IsCallExpression(key) {
			var found bool
			observed, found = query.acquireNormalCallResult(key, result)
			if !found {
				return false
			}
		} else {
			return false
		}
		if observed.effects != sourceEffectsAccounted {
			return false
		}
		if observed.incomplete {
			if !query.retainComponentInputDemand(node, slot, child, observed, result) {
				return false
			}
			result.valueIncomplete = true
		}
	}
	if !query.charge(result, node) {
		return false
	}
	scope := query.acquireCallableScope(bindings, result)
	if result.callableScopes == nil {
		result.callableScopes = make(map[int]acquiredCallableScope)
	}
	result.callableScopes[len(result.values)] = scope
	result.values = append(result.values, sourceValue{node: node})
	return true
}

// prepareComponentProtocolGet reads only the current completed Get slot. The
// output keeps the original member/input/scope identity, while selected library
// declarations stay on the existing declaration path, never in value origins.
func (query *sourceValueQuery) prepareComponentProtocolGet(call *ast.Node) (sourcePreparedInvocation, accessorCandidates, bool) {
	if call == nil || !ast.IsCallExpression(call) || query.operation == nil || query.operation.node != call {
		return sourcePreparedInvocation{}, accessorCandidates{}, false
	}
	node := call.AsCallExpression().Expression
	if normalCalleeGetOwner(node) != call {
		return sourcePreparedInvocation{}, accessorCandidates{}, false
	}
	slot := query.componentProtocolGetSlot(node, sourceOperationConsumed)
	if slot == nil {
		return sourcePreparedInvocation{}, accessorCandidates{}, false
	}
	observed := normalGetOutput(slot)
	if observed.effects != sourceEffectsAccounted || observed.incomplete && !query.hasComponentInputDemand(node) || len(observed.values) != 1 {
		return sourcePreparedInvocation{}, accessorCandidates{}, false
	}
	original := observed.values[0]
	if original.inputs != query.inputs || original.returned != nil || original.value.node != node || len(original.value.path) != 0 || original.value.instance != nil || original.value.acquired != nil || original.value.native != nil || original.value.adapter != nil || original.value.bound != nil || original.value.normal != nil || original.value.entrySlot != nil || original.value.ownedGetRow != nil || original.value.initializerUse != nil || original.value.awaited != nil || original.value.undefined || original.value.number != (numberPayload{}) || original.value.rest != nil || original.value.copied != nil || len(original.value.forwarded) != 0 {
		return sourcePreparedInvocation{}, accessorCandidates{}, false
	}
	selected := checkedNonliteralComponentProtocolGet(node, query.owner.checker)
	if selected == nil {
		return sourcePreparedInvocation{}, accessorCandidates{}, false
	}
	acquired := normalOutputCandidates(observed)
	prepared := sourcePreparedInvocation{declarations: append([]*ast.Node(nil), selected.Declarations...), acquired: selectionProjection(acquired), scope: original.scope, remaining: query.remaining, receiver: node.AsElementAccessExpression().Expression}
	// There is no source body or adapter to install, so no receiver-origin
	// acquisition is needed. Receiver/key execution already belongs to the Get.
	return prepared, acquired, true
}

// appendFieldReadOutcome preserves the original checked coverage law. A matched
// parameter demand does not itself prove that its supplied receiver was covered.
func (query *sourceValueQuery) appendFieldReadOutcome(node, receiver *ast.Node, key string, candidates *accessorCandidates) {
	if demand, _ := query.fieldDemand(node, receiver, key); demand.declaration != nil {
		covered := query.fieldAlternativesCovered(node, key, candidates)
		if ast.IsParameterDeclaration(demand.slot) {
			if query.dependenciesOnly {
				// Effect coverage comes from the instantiated source receiver,
				// independently of a concrete Get result or normal receipt.
				covered = candidates.sourceOwned && !candidates.opaque && !candidates.receiverIncomplete
			} else {
				covered = query.parameterFieldReadCovered(demand, candidates)
			}
		}
		fulfilled := covered && !candidates.fieldReceiverIncomplete && !candidates.opaque && !candidates.receiverIncomplete && (query.dependenciesOnly || !candidates.valueIncomplete || query.normalGetEffectsAccounted(node, candidates))
		candidates.fieldOutcomes = append(candidates.fieldOutcomes, sourceFieldOutcome{demand: demand, fulfilled: fulfilled})
	}
}

// parameterFieldReadCovered consumes only this installed Call's actual completed
// normal Get. This is read-effect coverage, never descriptor or NoWrites proof.
// The later immutable fieldCall still requires complete whole-call selection.
func (query *sourceValueQuery) parameterFieldReadCovered(demand sourceFieldDemand, result *accessorCandidates) bool {
	inputs := query.inputs
	if inputs == nil || inputs.operationLifetime == nil || inputs.declaration != demand.declaration || inputs.invocation == nil || inputs.consumedCall == nil || query.operation == nil || query.operation.node != demand.operation || query.operation.inputs != inputs || query.operation.owner != demand.declaration {
		return false
	}
	call := inputs.consumedCall
	if !call.entered || call.conditional || call.inputs != inputs || call.operation != inputs.invocation || call.declaration != demand.declaration || call.parent == nil || call.parent.operationLifetime == nil {
		return false
	}
	parent := call.parent.operations[call.operation]
	if parent == nil || parent.state != sourceOperationInProgress || parent.selected == nil || !parent.authority.valid(query) {
		return false
	}
	symbol := query.owner.checker.GetSymbolAtLocation(demand.slot.Name())
	if symbol == nil || symbol.ValueDeclaration != demand.slot || query.owner.bindingWritten(symbol) {
		return false
	}
	actuals := inputs.bindings[ast.GetSymbolId(symbol)]
	if len(actuals) == 0 {
		return false
	}
	for _, actual := range actuals {
		original := actual.acquired
		if actual.node == nil || len(actual.path) != 0 || original == nil || original.inputs != call.parent || original.value.node != actual.node || len(original.value.path) != 0 || original.value.undefined || actual.undefined {
			return false
		}
	}
	slot := query.normalOperation(demand.operation, false)
	if slot == nil || slot.state != sourceOperationConsumed || !slot.authority.valid(query) || slot.population != inputs.population || slot.population == nil || slot.entry == nil || !slot.entry.once || slot.entry.structural || slot.entry.region != demand.declaration || slot.population.root != demand.declaration || slot.population.entries[demand.operation] != slot.entry || slot.entry.node != demand.operation {
		return false
	}
	observed := normalGetOutput(slot)
	if observed.effects != sourceEffectsAccounted || observed.incomplete || len(observed.values) == 0 || result.opaque || result.receiverIncomplete || result.fieldReceiverIncomplete || result.valueIncomplete {
		return false
	}
	for _, value := range observed.values {
		if value.value.ownedGetRow == nil && value.inputs != inputs && value.inputs != call.parent {
			return false
		}
	}
	return true
}
