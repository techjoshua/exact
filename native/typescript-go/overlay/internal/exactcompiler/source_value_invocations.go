package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Invocation consumers preserve pre-argument acquisition and operation/value obligations
// while binding ordinary adapters and authored source methods through their existing plans.
// sourceInvocationConsumer separates selecting/installing a call from consuming its
// body or intrinsic resolver. A result observer never enrolls execution escapes
// merely by selecting the same call. Both consumers keep actual input obligations.
type sourceInvocationConsumer struct {
	// native consumes an already acquired alternative, never a declaration lookup.
	native     func(*sourceNativeInvocation, *accessorCandidates)
	reflective func(*sourceReflectiveOperation, *accessorCandidates)
	// selection reports callee coverage separately from input value/effect opacity.
	selection func(bool)
	// sourceReturn receives only a selected source relationship, never native output.
	sourceReturn func(sourceValue, sourceValueBindings)
	// callbackInputs contributes source-only MAY effects at this original native Call.
	callbackInputs func(*ast.Node, sourceValueBindings, sourcePreparedInvocation, *accessorCandidates)
	// construction consumes an acquired callable result without executing its body.
	construction func(sourceInvocationBody, *accessorCandidates)
	// unaccounted belongs to normal execution only. Observing a selected result
	// cannot enroll execution escapes merely by installing its input context.
	unaccounted func(*ast.Node, sourceValueBindings, *accessorCandidates)
	body        func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates)
	resolver    func(*ast.Node, []*ast.Node, bool, sourceValueBindings, *accessorCandidates)
}

func (query *sourceValueQuery) invocation(node *ast.Node, bindings sourceValueBindings) (result accessorCandidates) {
	defer query.normalWork(&result, node).finish(&result)
	slot := query.normalOperation(node, false)
	if slot != nil {
		defer func() { finishNormalPending(query.inputs, slot) }()
		if slot.state == sourceOperationConsumed || slot.state == sourceOperationRefused || slot.state == sourceOperationBypassed {
			return accessorCandidates{opaque: slot.state != sourceOperationConsumed, invocationOwned: slot.invocationOwned, replacedInvocation: slot.replacedInvocation}
		}
		if slot.state == sourceOperationInProgress {
			return accessorCandidates{opaque: true, invocationOwned: true}
		}
		slot.state = sourceOperationInProgress
		defer func() {
			slot.invocationOwned = result.invocationOwned
			slot.replacedInvocation = result.replacedInvocation
			slot.state = sourceOperationConsumed

			dropInitializerOperation(slot)
			slot.selected = nil
			slot.actuals = nil
		}()
	}
	previousNormalBinding := query.normalBindingCall
	query.normalBindingCall = node
	defer func() { query.normalBindingCall = previousNormalBinding }()
	entry := query.beginPropertyModuleOperation(node)
	ownedComplete := false
	defer func() {
		if entry != nil {
			entry.resolved = true
			entry.incomplete = !ownedComplete || result.thenIncomplete
			if v := query.propertyView(); v != nil {
				v.references = append(v.references, result.thenReferences...)
			}
		}
	}()
	return query.consumeInvocation(node, bindings, sourceInvocationConsumer{
		selection:      func(value bool) { ownedComplete = value },
		callbackInputs: query.nativeCallbackInputEffects,
		construction: func(body sourceInvocationBody, result *accessorCandidates) {
			query.boundConstructionGets(node, body, result)
			if query.inputs == nil || !query.invocationValueConsumed(node, result) || !query.charge(result, node) {
				return
			}
			if slot != nil {
				for _, actual := range slot.actuals {
					if !query.charge(result, actual.node) {
						break
					}
					actual.observed = query.sealInitializerObservation(actual.observed, result)
					body.actuals = append(body.actuals, actual)
				}
			}
			body.binding = node
			body.scope = query.copyCallableScope(body.scope, result)
			value := sourceObservedValue{value: sourceValue{node: node, bound: &body}, inputs: query.inputs, scope: body.scope}
			result.normalCalls = append(result.normalCalls, &sourceInvocationResult{operation: node, owner: enclosingCallableNode(node), declaration: body.declaration, frame: query.inputs, construction: true, raw: sourceResultObservation{values: []sourceObservedValue{value}, incomplete: false, effects: sourceEffectsAccounted}})
		},
		body: func(body *ast.Node, captures sourceValueBindings, inputs *sourceValueInputs, invocation *ast.Node, result *accessorCandidates) {
			query.consumeOrdinaryBody(node, body, captures, inputs, invocation, result)
		},
		resolver: query.invokePromiseResolver, unaccounted: query.retainOpaqueThenReceiver,
		native: query.nativePromiseEffects, reflective: query.reflectiveOperationEffects,
	})
}

// consumeInvocation is the single existing ordinary selection/adapter boundary.
// Its consumer receives each installed alternative under its acquired captures.
func (query *sourceValueQuery) consumeInvocation(node *ast.Node, bindings sourceValueBindings, consumer sourceInvocationConsumer) (result accessorCandidates) {
	// A binding may have a real normal phase. Its declaration is still not
	// an authored Call or constructor.
	if node == nil || !ast.IsCallExpression(node) && !ast.IsNewExpression(node) {
		result.opaque, result.valueIncomplete, result.cause = true, true, node
		return
	}
	complete := false
	enrolled := false
	enroll := func() {
		if !enrolled && consumer.unaccounted != nil && !complete && ast.IsCallExpression(node) {
			consumer.unaccounted(node, bindings, &result)
		}
		enrolled = true
	}
	// No-body/refusal exits still retain the original opaque operation. Paths
	// with known bodies enroll before any dependent body or settlement query.
	defer enroll()
	defer func() {
		if slot := query.normalOperation(node, false); slot != nil {
			slot.selectionComplete = complete
		}
		query.finishWriteOutcome(node, complete, &result)
		for _, operation := range result.reflective {
			if operation.operation == node {
				operation.covered = operation.covered && complete
				operation.finalized = true
			}
		}
		for _, receipt := range result.normalCalls {
			if receipt.operation == node {
				if !complete {
					receipt.raw.effects = sourceEffectsRefused
				}
				receipt.raw.incomplete = receipt.raw.incomplete || !complete
				receipt.fulfilled.incomplete = receipt.fulfilled.incomplete || !complete
			}
		}
		for i := range result.fieldCalls {
			if result.fieldCalls[i].operation == node {
				result.fieldCalls[i].complete = result.fieldCalls[i].complete && complete
			}
		}
		query.finishDescriptorEffectCalls(node, &result)
		if (query.operation != nil || query.dependenciesOnly) && query.inputs != nil && ast.IsCallExpression(node) && query.inputs.declaration == enclosingCallableNode(node) {
			result.callOutcomes = append(result.callOutcomes, sourceCallOutcome{declaration: query.inputs.declaration, operation: node, complete: complete, use: query.effectUse(), consumer: query.effectOwner, dependencies: query.dependenciesOnly})
		}
		if consumer.selection != nil {
			consumer.selection(complete)
		}
	}()
	if ast.IsNewExpression(node) {
		if query.dependenciesOnly {
			return query.constructDependencyEffects(node, bindings)
		}
		if slot := query.normalOperation(node, false); slot != nil {
			query.retainSourceConstructorEffects(node, slot.selected, &result)
		}
		if query.constructPossibleProxyGet(node, &result) {
			return result
		}
		if query.operation == nil && query.constructionMay.live(query) {
			query.constructMaySourceClass(node, bindings, &result)
			return result
		}
		if query.constructSourceClass(node, &result) {
			return result
		}
		return query.promiseConstruction(node, bindings)
	}
	call := node.AsCallExpression()
	selected := query.normalOperation(node, false)
	var prepared sourcePreparedInvocation
	if selected != nil && selected.selected != nil {
		prepared = *selected.selected
		if prepared.remaining < query.remaining {
			query.remaining = prepared.remaining
		}
	} else {
		var effects accessorCandidates
		prepared, effects = query.prepareInvocation(node, bindings)
		mergeAccessorCandidates(&result, effects)
	}
	mergeAccessorCandidates(&result, prepared.base)
	if consumer.callbackInputs != nil && query.dependenciesOnly {
		consumer.callbackInputs(node, bindings, prepared, &result)
	}
	declarations := prepared.declarations
	if result.selected && result.opaque {
		return result
	}
	if !result.selected {
		acquired := prepared.acquired
		nativeCount := 0
		for _, value := range acquired.values {
			if value.native != nil && nativeInvocable(value.native.kind) {
				nativeCount++
			}
		}
		if acquired.sourceCallable || nativeCount > 0 {
			// Ordinary bind alternatives construct a callable without invoking its body.
			// Authored method alternatives below still execute with their raw inputs.
			construction := ordinaryBindingConstruction(node, acquired, query.owner.checker)
			adapterOwned := construction
			var plan ordinaryInvocationPlan
			if !construction {
				plan, adapterOwned = query.ordinaryAdapterExecution(node, acquired, &result)
			}
			if adapterOwned && !construction {
				// Consume the acquired plan once in caller scope, before any
				// alternative installs its creating/formal bindings.
				query.withActiveInvocation(node, func() { query.materializeInvocationVectors(node, plan, bindings, &result) })
			}
			// Capture callee coverage before installing any formal/default inputs.
			// Later value or body opacity remains in result without rewriting this fact.
			complete = !acquired.opaque && !acquired.valueIncomplete && !acquired.receiverIncomplete && (len(acquired.values) > 0 || adapterOwned)
			mergeAccessorCandidates(&result, acquired)
			result.invocationOwned = true
			result.replacedInvocation = !adapterOwned
			// Classify the entire acquired set before executing any selected body.
			// Unknown alternatives keep the actual receiver escape on this normal
			// effect consumer, before a known branch can publish neutral then facts.
			type installedBody struct {
				declaration  *ast.Node
				scope        acquiredCallableScope
				sourceMethod bool
				binding      *ast.Node
				actuals      []sourceNormalActual
				observed     *sourceObservedValue
			}
			var bodies []installedBody
			if adapterOwned {
				for _, body := range acquired.ordinaryBodies {
					if body.invocation != node {
						continue
					}
					if construction {
						if consumer.construction != nil {
							consumer.construction(body, &result)
						}
					} else {
						bodies = append(bodies, installedBody{body.declaration, body.scope, false, body.binding, body.actuals, nil})
					}
				}
			} else {
				result.opaque = result.opaque || acquired.valueIncomplete || len(acquired.values) == 0
			}
			for index, value := range acquired.values {
				if value.native != nil {
					if value.native.kind == sourceNativeObjectFreeze {
						if query.dependenciesOnly {
							query.sourceFreezeRelationship(node, value, bindings, complete, consumer.sourceReturn, &result)
							continue
						}
						query.consumeNativeFreeze(node, value, len(acquired.values) == 1 && complete, &result)
						continue
					}
					if reflectiveNative(value.native.kind) {
						query.withActiveInvocation(node, func() {
							operation := query.acquireReflectiveOperation(node, value, bindings, nativeCount == len(acquired.values) && !acquired.opaque && !acquired.valueIncomplete && !acquired.receiverIncomplete, &result)
							result.reflective = append(result.reflective, operation)
							if consumer.reflective != nil {
								consumer.reflective(operation, &result)
							} else {
								result.valueIncomplete = true
							}
						})
						continue
					}

					query.withActiveInvocation(node, func() {
						receipt := query.acquireNativeInputs(node, value, bindings, nativeCount == len(acquired.values) && !acquired.opaque && !acquired.valueIncomplete && !acquired.receiverIncomplete, &result)
						result.nativeCalls = append(result.nativeCalls, receipt)
						if consumer.native != nil {
							consumer.native(receipt, &result)
						} else {
							result.opaque = true
						}
					})
					continue
				}
				body := value.node
				bound := false
				for _, relation := range acquired.ordinaryBodies {
					bound = bound || relation.invocation == node && relation.binding == body
				}
				if adapterOwned && (bound || body == nil || ast.GetSourceFileOfNode(body).IsDeclarationFile) {
					continue
				}
				if len(value.path) != 0 || !query.sourceCallableImplementation(body, &result) {
					complete = false
					result.opaque = true
					continue
				}
				bodies = append(bodies, installedBody{body, acquired.callableScopes[index], true, nil, nil, value.acquired})
			}
			enroll()
			for _, body := range bodies {
				if ast.IsFunctionLike(body.declaration) {
					result.declarations = append(result.declarations, body.declaration)
				}
				query.invokeAcquired(body.declaration, node, bindings, body.scope, &result, body.sourceMethod, consumer, body.binding, body.actuals, body.observed)
			}
			return result
		}
	}
	// Missing element symbols and data slots still have finite source values. Library
	// declarations stay on their existing call path, including native call/apply.
	if len(declarations) == 0 {
		if query.dependenciesOnly && len(prepared.bodies) > 0 {
			complete = !result.opaque && !prepared.acquired.receiverIncomplete
			result.invocationOwned = true
		}
		if nativeReceiverMemberDeclarations(call.Expression, query.owner.checker) {
			return result
		}
		enroll()
		for _, body := range prepared.bodies {
			query.invokeAcquired(body.declaration, node, bindings, body.scope, &result, false, consumer, nil, nil, body.observed)
		}

		return result
	}
	complete = len(declarations) > 0 && !result.opaque
	declarations = append([]*ast.Node(nil), declarations...) // symbol declaration storage is shared
	for index, declaration := range declarations {
		// Library variables describe intrinsic calls without source initializers.
		// Keep their declaration identity through the ordinary native boundary.
		if ast.IsVariableDeclaration(declaration) && !ast.GetSourceFileOfNode(declaration).IsDeclarationFile {
			declaration = unwrapSourceCallableReference(declaration.Initializer())
			declarations[index] = declaration
		}
		complete = complete && declaration != nil && ast.IsFunctionLike(declaration) && declaration.Body() != nil && !ast.GetSourceFileOfNode(declaration).IsDeclarationFile
	}
	enroll()
	for _, declaration := range declarations {
		// Normalization can expose an ambient/uninitialized binding with no
		// source implementation. Callee coverage is already incomplete and its
		// normal receiver escape enrolled. No body or body default is invented.
		if declaration == nil {
			result.opaque = true
			continue
		}
		if ast.IsPropertyAssignment(declaration) || ast.IsShorthandPropertyAssignment(declaration) {
			complete = false
			for _, body := range prepared.bodies {
				query.invokeAcquired(body.declaration, node, bindings, body.scope, &result, false, consumer, nil, nil, body.observed)
			}
			result.opaque = true
			return result
		}
		if declaration == nil || ast.GetSourceFileOfNode(declaration) == nil || ast.GetSourceFileOfNode(declaration).IsDeclarationFile {
			complete = false
			continue
		}
		if !ast.IsFunctionLike(declaration) {
			complete = false
			for _, body := range prepared.bodies {
				query.invokeAcquired(body.declaration, node, bindings, body.scope, &result, false, consumer, nil, nil, body.observed)
			}
			query.retainCallSelectionFallback(node, &result)
			continue
		}
		if declaration.Body() == nil && ast.HasSyntacticModifier(declaration, ast.ModifierFlagsAmbient) {
			complete = false
			// An authored ambient signature supplies no invocation implementation.
			// Keep this actual call opaque, independently of other known definitions.
			result.opaque = true
			result.cause = node
			continue
		}
		query.invokeAcquired(declaration, node, bindings, prepared.scope, &result, false, consumer, nil, nil)
	}
	return result
}

func sourceInvocationCandidates(node *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node) accessorCandidates {
	return sourceInvocationWithResults(node, c, owner, consumer, nil, nil)
}

// sourceInvocationWithResults carries this normal owner's earlier operation
// receipts to later actual input/Get acquisition. Indexed interference suspends
// observation, and each successful await still checks its original owner.
func sourceInvocationWithResults(node *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node, receipts []*sourceNativeInvocation, results []*sourceInvocationResult, normal ...*sourceValueInputs) (result accessorCandidates) {
	values := newSourceValueOwner(c)
	if owner != nil && owner.values != nil {
		values = owner.values
	}
	query := &sourceValueQuery{owner: values, executable: owner, effectOwner: consumer, remaining: 4096, active: make(map[*ast.Node]bool), reading: node}
	query.operation = &sourceOperationContext{node: node, owner: consumer}
	if (len(receipts) > 0 || len(results) > 0) && consumer != nil {
		query.returnObservation = &sourceReturnObservation{owner: consumer, reader: node, receipts: receipts, normalCalls: results}
	}
	// Preserve this operation's routing receipt. Nested candidate merges do not
	// transfer ownership of the enclosing invocation.
	if len(normal) == 1 {
		query.inputs = normal[0]
		query.operation.inputs = normal[0]
		if query.returnObservation != nil {
			query.returnObservation.frame = normal[0]
		}
	}
	defer query.normalWork(&result, node).finish(&result)
	references := accessorCandidates{}
	query.retainThenOperation(node, nil, &references)
	result = query.invocation(node, nil)
	mergeAccessorCandidates(&result, references)
	if result.opaque && result.cause == nil {
		result.cause = node
	}
	return result
}

// sourceCallableImplementation admits actual source bodies and constructor-owned
// intrinsic inputs through the same member acquisition and invocation relation.
func (query *sourceValueQuery) sourceCallableImplementation(value *ast.Node, result *accessorCandidates) bool {
	if value == nil {
		return false
	}
	if ast.IsFunctionLike(value) && value.Body() != nil && !ast.GetSourceFileOfNode(value).IsDeclarationFile {
		return true
	}
	_, intrinsic := query.promiseResolver(value, result)
	return intrinsic
}

// invokeAcquired transfers one acquired occurrence's creating scope to the existing
// source-method input owner. Restoration also covers nested demands and refusals.
func (query *sourceValueQuery) invokeAcquired(body, node *ast.Node, bindings sourceValueBindings, scope acquiredCallableScope, result *accessorCandidates, sourceMethod bool, consumer sourceInvocationConsumer, binding *ast.Node, actuals []sourceNormalActual, selected ...*sourceObservedValue) {
	previousCreators, previousReturn := query.creators, query.returning
	defer func() { query.creators, query.returning = previousCreators, previousReturn }()
	if reject, intrinsic := query.promiseResolver(body, result); intrinsic {
		actuals := restrictedInvocationArguments(node.AsCallExpression())
		if actuals == nil {
			actuals = []*ast.Node{}
		}
		if !sourceMethod {
			plan := planOrdinaryInvocation(node.AsCallExpression().Expression, actuals, query.owner.checker, func(value *ast.Node) bool { return query.charge(result, value) })
			actuals = plan.actuals
		}
		consumer.resolver(node, actuals, reject, bindings, result)
		return
	}
	var boundPlan *ordinaryInvocationPlan
	if binding != nil {
		plan := planOrdinaryInvocation(binding, restrictedInvocationArguments(node.AsCallExpression()), query.owner.checker, func(at *ast.Node) bool { return query.charge(result, at) })
		plan.captured = actuals
		boundPlan = &plan
	}
	var selectedScope *acquiredCallableScope
	if scope.creators != nil {
		selectedScope = &scope
	}
	var observed *sourceObservedValue
	if selectedScope != nil && len(selected) == 1 {
		observed = selected[0]
	}
	inputs := query.bindInvocationInputsFromObservation(body, node, bindings, selectedScope, observed, result, sourceMethod, boundPlan)
	if selectedScope != nil {
		query.creators, query.returning = scope.creators, nil
	}
	previousInstalled := query.installedReceiverCall
	query.installedReceiverCall = nil
	defer func() { query.installedReceiverCall = previousInstalled }()
	if slot := query.normalOperation(node, false); slot != nil && slot.state == sourceOperationInProgress && slot.selected != nil && query.charge(result, node) {
		query.installedReceiverCall = &sourceInstalledReceiverCall{slot: slot, operation: node, parent: query.inputs, inputs: inputs, selection: sourceInvocationBody{declaration: body, scope: scope, invocation: node, binding: binding}}
	}
	consumer.body(body, inputs.bindings, inputs, nil, result)
}

// receiverCandidates acquires callable alternatives before invocation. The active call
// cannot interfere with its own lookup, and later assignments cannot retarget this value.
func (query *sourceValueQuery) receiverCandidates(call *ast.Node, bindings sourceValueBindings) accessorCandidates {
	// Associate before initializing and active state change. This source-only
	// borrow cannot outlive or reinstall the canonical pending selection header.
	if query.dependenciesOnly {
		if borrow := query.calleeWriteBorrow(call, bindings); borrow.header != nil {
			use := sourceCalleeWriteUse{borrow: borrow, prior: query.calleeWriteUse}
			query.calleeWriteUse = &use
			defer func() { query.calleeWriteUse = use.prior }()
		}
	}
	previous := query.initializing
	query.initializing = call
	defer func() { query.initializing = previous }()
	result := accessorCandidates{}
	query.withActiveInvocation(call, func() {
		callee := unwrapSourceCallableReference(call.AsCallExpression().Expression)
		if query.dependenciesOnly && (ast.IsPropertyAccessExpression(callee) || ast.IsElementAccessExpression(callee)) {
			// A member callee owns this exact Get. A saved identifier's earlier
			// binding Get belongs to its initializer, not this later Call.
			result = query.sourceAccessorOperationCandidates(callee, nil, "", accessorAcquire, bindings, callee)
		} else {
			result = query.accessors(call.AsCallExpression().Expression, nil, "", accessorAcquire, bindings, nil)
		}
	})
	return result
}

// sourceInvocationBody pairs an actual source receiver alternative with its
// creating scope. It is an ordinary invocation edge, not complete callee identity.
type sourceInvocationBody struct {
	actuals     []sourceNormalActual
	invocation  *ast.Node
	binding     *ast.Node
	declaration *ast.Node
	scope       acquiredCallableScope
}

// sourceOrdinaryAdapter belongs to one actual callee Get construction. It
// retains routing, not native identity, body completion or effect coverage.
// The existing operation lifetime, not this header, owns output availability.
type sourceOrdinaryAdapter struct {
	body      sourceInvocationBody
	operation *ast.Node
	frame     *sourceValueInputs
}

// retainOrdinaryAdapter reads only the matching admitted output. Original scope
// stays on body, while construction authority stays on the explicit operation.
func (query *sourceValueQuery) retainOrdinaryAdapter(call *ast.Node, value sourceValue, result *accessorCandidates) bool {
	header := value.adapter
	if header == nil {
		return false
	}
	if !query.charge(result, call) {
		return false
	}
	if call == nil || !ast.IsCallExpression(call) || header.body.invocation != call || len(value.path) != 0 || query.operation == nil || query.operation.inputs != header.frame || header.frame == nil || normalCalleeGetOwner(header.operation) != call {
		result.valueIncomplete = true
		return false
	}
	slot := query.normalOperation(header.operation, false)
	if slot == nil || slot.state != sourceOperationConsumed && slot.state != sourceOperationRefused {
		result.valueIncomplete = true
		return false
	}
	retainResultUncertainty(normalGetOutput(slot), result, sourceExecutionOutput)
	for _, original := range slot.output.values {
		if !query.charge(result, original.value.node) {
			return false
		}
		if original.value.adapter == header && original.value.node == value.node && len(original.value.path) == 0 {
			result.ordinaryBodies = append(result.ordinaryBodies, header.body)
			result.sourceCallable = true
			return true
		}
	}
	result.valueIncomplete = true
	return false
}

// ordinaryBindingConstruction recognizes only a reached ordinary bind relation.
// Actual source methods and uncertain Get effects remain on acquisition candidates.
func ordinaryBindingConstruction(node *ast.Node, acquired accessorCandidates, c *checker.Checker) bool {
	_, name := restrictedInvocationMember(node.AsCallExpression().Expression, c)
	if name != "bind" {
		return false
	}
	for _, body := range acquired.ordinaryBodies {
		if body.invocation == node {
			return true
		}
	}
	return false
}

// boundConstructionGets owns the metadata operations of an actually selected
// ordinary bind construction. It does not invoke the target or its defaults.
// Unknown acquired alternatives remain on the enclosing invocation. Source
// descriptors supply may-effects, not target identity or native purity.
func (query *sourceValueQuery) boundConstructionGets(operation *ast.Node, body sourceInvocationBody, result *accessorCandidates) {
	previous := query.creators
	query.creators = body.scope.creators
	defer func() { query.creators = previous }()
	for _, key := range []string{"length", "name"} {
		if !query.charge(result, operation) {
			return
		}
		get := &sourceGetInputs{operation: operation, receiver: sourceValue{node: body.declaration}, ownConditional: key == "length"}
		acquired := query.accessorsAtGet(body.declaration, nil, key, accessorRead, body.scope.bindings, nil, get)
		mergeAccessorCandidates(result, acquired)
	}
}

// acquireBoundBodies carries an actual bound construction into its later invocation.
// The input owner retains the original receiver/prefix sites. This is not a return
// value interpreter or authority for an authored method merely named bind.
func (query *sourceValueQuery) acquireBoundBodies(node *ast.Node, bindings sourceValueBindings, acquired *accessorCandidates) {
	for _, value := range acquired.values {
		if value.bound != nil && len(value.path) == 0 {
			if !query.charge(acquired, node) {
				return
			}
			body := *value.bound
			body.invocation = node
			body.scope = query.copyCallableScope(body.scope, acquired)
			acquired.ordinaryBodies = append(acquired.ordinaryBodies, body)
			// The retained construction already selected its target. Preserve the
			// same routing marker used by the acquired bound-value path.
			acquired.sourceCallable = true
			continue
		}
		// Unknown inputs and non-node values are real alternatives. They
		// cannot denote a bound construction, and remain on acquired for
		// the ordinary complete-callee and effect consumers to classify.
		if value.node == nil {
			continue
		}
		if !ast.IsCallExpression(value.node) || len(value.path) != 0 {
			continue
		}
		_, method := restrictedInvocationMember(value.node.AsCallExpression().Expression, query.owner.checker)
		if method != "bind" {
			continue
		}
		binding := query.receiverCandidates(value.node, bindings)
		if !ordinaryBindingConstruction(value.node, binding, query.owner.checker) {
			mergeAccessorCandidates(acquired, binding)
			continue
		}
		for _, body := range binding.ordinaryBodies {
			if body.invocation == value.node {
				body.invocation, body.binding = node, value.node
				acquired.ordinaryBodies = append(acquired.ordinaryBodies, body)
			}
		}
		binding.ordinaryBodies = nil
		mergeAccessorCandidates(acquired, binding)
	}
}

// ordinaryAdapterExecution routes independently established body requirements
// even when Get or another callable alternative remains uncertain. Those facts
// stay on acquired and cannot become purity or performed-execution authority.
func (query *sourceValueQuery) ordinaryAdapterExecution(node *ast.Node, acquired accessorCandidates, result *accessorCandidates) (ordinaryInvocationPlan, bool) {
	present := false
	for _, body := range acquired.ordinaryBodies {
		present = present || body.invocation == node
	}
	if !present || !query.charge(result, node) {
		return ordinaryInvocationPlan{}, false
	}
	expression := node.AsCallExpression().Expression
	var construction *ast.Node
	for _, body := range acquired.ordinaryBodies {
		if body.invocation != node || body.binding == nil {
			continue
		}
		if construction != nil && construction != body.binding {
			// Each acquired bound alternative supplies its own original plan
			// to invokeAcquired. No aggregate receiver/vector can replace them.
			return ordinaryInvocationPlan{adapted: true}, true
		}
		construction = body.binding
	}
	if construction != nil {
		expression = construction
	}
	plan := planOrdinaryInvocation(expression, restrictedInvocationArguments(node.AsCallExpression()), query.owner.checker, func(value *ast.Node) bool { return query.charge(result, value) })
	return plan, plan.adapted
}

// sourceImplicitInvocation owns one selected synchronous numeric conversion. Its
// original operation, receiver, method and input plan stay together. The record
// does not assert native identity, execute JavaScript or describe other operators.
type sourceImplicitInvocation struct {
	operation, receiver, method *ast.Node
	assignment, returned        *ast.Node
	inputs                      *sourceValueInputs
	producer                    *ast.Node
}

// numericOwnInvocation selects only a stable source literal's own ordinary method.
// The caller must first preserve the standard-startup descriptors through the real
// execution prefix. Computed keys, custom prototypes, accessors and object returns
// cannot use this shortcut past @@toPrimitive or fallback/abrupt completion.
func (query *sourceValueQuery) numericOwnInvocation(node, producer *ast.Node, result *accessorCandidates) *sourceImplicitInvocation {
	if !query.charge(result, node) || !ast.IsPrefixUnaryExpression(node) || node.AsPrefixUnaryExpression().Operator != ast.KindPlusToken {
		return nil
	}
	operand := unwrapSourceCallableReference(node.AsPrefixUnaryExpression().Operand)
	if !ast.IsIdentifier(operand) {
		return nil
	}
	symbol := sourceCallableReferenceSymbol(operand, query.owner.checker)
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = query.owner.checker.GetAliasedSymbol(symbol)
	}
	if symbol == nil || len(symbol.Declarations) != 1 || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || symbol.ValueDeclaration.Parent.Flags&ast.NodeFlagsConst == 0 || query.owner.bindingWritten(symbol) {
		return nil
	}
	origin := unwrapSourceCallableReference(symbol.ValueDeclaration.Initializer())
	if !ast.IsObjectLiteralExpression(origin) {
		return nil
	}
	var method *ast.Node
	for _, member := range origin.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, member) || member.Name() == nil || ast.IsComputedPropertyName(member.Name()) || callableNameText(member.Name()) == "__proto__" || ast.IsGetAccessorDeclaration(member) || ast.IsSetAccessorDeclaration(member) {
			return nil
		}
		if callableNameText(member.Name()) == "valueOf" {
			if method != nil || !ast.IsMethodDeclaration(member) {
				return nil
			}
			method = member
		}
	}
	if method == nil || len(method.Parameters()) != 0 || method.Body() == nil || !ast.IsBlock(method.Body()) || ast.HasSyntacticModifier(method, ast.ModifierFlagsAsync) || method.AsMethodDeclaration().AsteriskToken != nil {
		return nil
	}
	statements := method.Body().AsBlock().Statements.Nodes
	if len(statements) < 1 || len(statements) > 2 || !ast.IsReturnStatement(statements[len(statements)-1]) {
		return nil
	}
	returned := unwrapSourceCallableReference(statements[len(statements)-1].AsReturnStatement().Expression)
	if !sourceNumericPrimitive(returned) {
		return nil
	}
	var assignment *ast.Node
	if len(statements) == 2 {
		if !ast.IsExpressionStatement(statements[0]) {
			return nil
		}
		assignment = statements[0].AsExpressionStatement().Expression
		if !ast.IsBinaryExpression(assignment) || assignment.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
			return nil
		}
		rhs := unwrapSourceCallableReference(assignment.AsBinaryExpression().Right)
		if !ast.IsArrowFunction(rhs) || len(rhs.Parameters()) != 0 || !sourceNumericPrimitive(unwrapSourceCallableReference(rhs.Body())) || ast.HasSyntacticModifier(rhs, ast.ModifierFlagsAsync) {
			return nil
		}
	}
	// Known-empty actuals do not enter the explicit CallExpression parser. This
	// narrow method has no formals/defaults. Preserve its real this identity even
	// though the admitted body cannot read it or a captured parameter.
	invocation := &sourceImplicitInvocation{operation: node, receiver: origin, method: method, assignment: assignment, returned: returned, producer: producer}
	invocation.inputs = &sourceValueInputs{implicit: invocation, declaration: method, invocation: node, bindings: sourceValueBindings{0: {{node: origin}}}, defaults: make(map[*ast.Node]sourceDefaultInput)}
	return invocation
}

// sourceNumericPrimitive certifies normal ToNumber completion without interpreting
// a fallback method, Symbol, BigInt or arbitrary expression. Global Number is not
// consulted by unary plus itself.
func sourceNumericPrimitive(node *ast.Node) bool {
	if node == nil {
		return false
	}
	switch node.Kind {
	case ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return true
	}
	return false
}

// prepareInvocation is the existing selection owner, split before input/default
// dispatch. Retained alternatives cannot be retargeted by argument writes.
func (query *sourceValueQuery) prepareInvocation(node *ast.Node, bindings sourceValueBindings) (sourcePreparedInvocation, accessorCandidates) {
	result := accessorCandidates{}
	// A binding declaration remains an unsupported invocation operation,
	// never a Call selected by this fallback.
	if node == nil || !ast.IsCallExpression(node) {
		result.opaque, result.valueIncomplete, result.cause = true, true, node
		return sourcePreparedInvocation{base: selectionProjection(result), remaining: query.remaining}, result
	}
	if query.retainDefinitionSavedGetSelection(node, bindings, &result) {
		return sourcePreparedInvocation{base: selectionProjection(result), remaining: query.remaining}, result
	}
	if release := query.beginCalleeAcquisition(node, bindings); release != nil {
		defer release()
	}
	call := node.AsCallExpression()
	declarations := query.callDeclarations(call.Expression, &result)
	selectedCall := result.selected
	if query.dependenciesOnly {
		// A value binding's initializer may itself be a return, branch or
		// container projection. Its declaration is not the callable target.
		for _, declaration := range declarations {
			if ast.IsVariableDeclaration(declaration) && declaration.Initializer() != nil {
				initializer := unwrapSourceCallableReference(declaration.Initializer())
				if !ast.IsFunctionLike(initializer) {
					declarations = nil
					break
				}
			}
		}
		if symbol := query.owner.checker.GetSymbolAtLocation(unwrapSourceCallableReference(call.Expression)); symbol != nil {
			if _, installed := bindings[ast.GetSymbolId(symbol)]; installed {
				declarations = nil
			}
		}
	}
	if result.selected && result.opaque {
		return sourcePreparedInvocation{declarations: declarations, base: selectionProjection(result), remaining: query.remaining}, result
	}
	if !result.selected {
		if prepared, effects, available := query.prepareComponentProtocolGet(node); available {
			prepared.base = selectionProjection(result)
			mergeAccessorCandidates(&result, effects)
			return prepared, result
		}
	}
	acquired := accessorCandidates{}
	if !result.selected {
		acquired = query.receiverCandidates(node, bindings)
		query.acquireBoundBodies(node, bindings, &acquired)
		// Several overload declarations may share one acquired adapter relation.
		// Deduplicate that owned record only, never distinct creator alternatives.
		var retained map[*sourceOrdinaryAdapter]bool
		for _, value := range acquired.values {
			if !query.charge(&acquired, value.node) {
				break
			}
			if value.adapter == nil || retained[value.adapter] {
				continue
			}
			if query.retainOrdinaryAdapter(node, value, &acquired) {
				if retained == nil {
					retained = make(map[*sourceOrdinaryAdapter]bool)
				}
				retained[value.adapter] = true
			}
		}
		// A captured callable can lack an ordinary symbol target while acquisition
		// still discovers source alternatives. This activates the existing may-call
		// bridge only. All operation/value uncertainty and other alternatives remain.
		ordinaryBody := false
		for _, declaration := range declarations {
			if !query.charge(&acquired, declaration) {
				break
			}
			if ast.IsVariableDeclaration(declaration) {
				declaration = unwrapSourceCallableReferenceWithBudget(declaration.Initializer(), func(value *ast.Node) bool { return query.charge(&acquired, value) })
			}
			ordinaryBody = ordinaryBody || declaration != nil && ast.IsFunctionLike(declaration) && declaration.Body() != nil && !ast.GetSourceFileOfNode(declaration).IsDeclarationFile
		}
		if !ordinaryBody {
			for _, value := range acquired.values {
				if !query.charge(&acquired, value.node) {
					break
				}
				if len(value.path) == 0 && query.sourceCallableImplementation(value.node, &acquired) {
					acquired.sourceCallable = true
					break
				}
			}
		}
		// Classification is selection, not a requirement for a signature body.
		// Only exhaustion refuses the independently acquired alternatives here.

	}
	scope := query.acquireCallableScope(bindings, &result)
	selected := sourcePreparedInvocation{declarations: append([]*ast.Node(nil), declarations...), base: selectionProjection(result), acquired: selectionProjection(acquired), scope: scope, remaining: query.remaining}
	// Legacy invocation-only selection consumes the already acquired alternatives,
	// never raw callee syntax after argument mutation. The callback retains a
	// selected body/scope and performs no input/default/body dispatch here.
	if !acquired.sourceCallable && len(declarations) == 0 {
		for index, value := range acquired.values {
			if !query.charge(&result, value.node) {
				break
			}
			// entrySlot is produced by unavailable original lexical-input acquisition.
			// With no field projection or recorded value, refusal belongs to this
			// Call's selection, not to a synthetic property Get on the entry term.
			// Recorded/normal values and residual fields keep their own acquisition.
			if value.entrySlot != nil && len(value.path) == 0 && value.acquired == nil && value.normal == nil {
				query.retainCallSelectionFallback(node, &result)
				continue
			}
			scope := acquired.callableScopes[index]
			original := sourceObservedValue{value: value, scope: scope}
			if value.acquired != nil {
				original = *value.acquired
				original.value = value
			}
			seed := value
			seed.acquired = &original
			selection := query.accessorsAtGet(value.node, nil, "", accessorInvoke, bindings, func(body *ast.Node, captures sourceValueBindings, r *accessorCandidates) {
				selected.bodies = append(selected.bodies, sourcePreparedBody{body, query.acquireCallableScope(captures, r), value.acquired})
			}, nil, seed)
			mergeAccessorCandidates(&result, selection)
		}

	}
	receiver, _ := restrictedInvocationMember(call.Expression, query.owner.checker)
	if receiver != nil {
		selected.receiver = receiver
		selected.receiverValues = query.originsAt(receiver, node, bindings, &result)
	}
	selected.remaining = query.remaining
	mergeAccessorCandidates(&result, acquired)
	// A selected factory in the callee's value history does not own this Call.
	// Keep its effects, but dispatch this operation using its own selection.
	result.selected = selectedCall
	return selected, result
}

// consumeOrdinaryBody is shared by actual normal and eager-module Call consumers.
// Retained raw output is observed before the installed operation interval ends.
func (query *sourceValueQuery) consumeOrdinaryBody(node, body *ast.Node, captures sourceValueBindings, inputs *sourceValueInputs, invocation *ast.Node, result *accessorCandidates) {
	_, ordinary := ordinaryResultCategory(body)
	generator := body != nil && ast.IsFunctionLike(body) && body.Body() != nil && !ordinary
	if generator {
		if inputs == nil {
			inputs = query.bindInputs(body, node, captures, result)
		}
		inputs.deferredBody = true
		result.invocationOwned, result.replacedInvocation = true, true
		result.valueIncomplete = true
	} else {
		result.retainCallableEffect(node, body)
		if query.dependenciesOnly {
			index := len(result.effects) - 1
			receivers := query.sourceEffectReceiverBindings(result.effects[index], inputs, result)
			result.effects[index].receivers = receivers
		}
	}
	if query.dependenciesOnly {
		query.consumeSourceBodyEffects(node, body, captures, inputs, invocation, result)
		return
	}
	if inputs != nil {
		inputs.writeAlternative = query.selectedWriteAlternative(query.normalOperation(node, false), body, result)
	}
	async, ordinary := ordinaryResultCategory(body)
	consumeValue := ordinary && query.invocationValueConsumed(node, result)
	if (async && ordinary || consumeValue) && inputs == nil {
		inputs = query.bindInputs(body, node, captures, result)
		invocation = nil
	}
	if (async && ordinary || consumeValue) && inputs != nil {
		inputs.returnedGets = make([]sourceGetReturn, 0)
	}
	var receipt *sourceInvocationResult
	if ordinary && inputs != nil && (async || consumeValue) {
		receipt = &sourceInvocationResult{operation: node, owner: enclosingCallableNode(node), declaration: body, frame: query.inputs, async: async}
		if async {
			inputs.fulfilled = &receipt.fulfilled
		}
	}
	firstReflective := len(result.reflective)
	firstCall := len(result.callOutcomes)
	first := len(result.fieldOutcomes)
	entered := query.executeInputs(body, captures, result, invocation, inputs)
	retainedConstruction := false
	defer func() {
		if inputs != nil && !retainedConstruction {
			releaseNormalOperations(inputs)
		}
	}()
	if receipt != nil {
		receipt.entered = entered
		if !async && entered {
			query.observeInstalledGetResults(body, inputs, &receipt.raw, result)
		}
		receipt.raw.effects = sourceEffectsRefused
		if entered {
			receipt.raw.effects = sourceEffectsAccounted
		}
		receipt.raw.incomplete = receipt.raw.incomplete || !entered
		receipt.fulfilled.incomplete = receipt.fulfilled.incomplete || !entered
		result.normalCalls = append(result.normalCalls, receipt)
		retainedConstruction = query.retainConstructedCallResult(node, inputs, receipt.raw, result)
		inputs.fulfilled = nil
	}
	var outcomes []sourceFieldOutcome
	for _, outcome := range result.fieldOutcomes[first:] {
		if outcome.demand.declaration == body {
			outcomes = append(outcomes, outcome)
		}
	}
	var calls []sourceCallOutcome
	for _, outcome := range result.callOutcomes[firstCall:] {
		if outcome.declaration == body {
			calls = append(calls, outcome)
		}
	}
	occurrence, descriptorEffects := query.descriptorBodyEffects(node, body, inputs, entered, result.reflective[firstReflective:], result)
	result.fieldCalls = append(result.fieldCalls, sourceFieldCall{operation: node, target: body, outcomes: outcomes, calls: calls, complete: entered, descriptorOccurrence: occurrence, descriptorEffects: descriptorEffects})
}

// visitSourceCallableInvocation keeps deferred source selection separate from
// creating its closure. Captured inputs use the existing invocation consumer.
func (query *sourceValueQuery) visitSourceCallableInvocation(value *ast.Node, projection []string, mode accessorTraversal, arguments sourceValueBindings, result *accessorCandidates, invoke func(*ast.Node, sourceValueBindings, *accessorCandidates)) bool {
	if !ast.IsFunctionLike(value) || mode != accessorInvoke || len(projection) != 0 {
		return false
	}

	if value.Body() == nil || ast.GetSourceFileOfNode(value).IsDeclarationFile {
		return true
	}
	// Existing ordinary method effects stay on their call graph. A creating
	// edge or an executing parameter pattern needs this input substitution.
	binding := false
	for _, parameter := range value.Parameters() {
		if !query.charge(result, parameter) {
			return true
		}
		binding = binding || parameter.Initializer() != nil || ast.IsObjectBindingPattern(parameter.Name()) || ast.IsArrayBindingPattern(parameter.Name())
	}
	for _, creator := range query.creators {
		binding = binding || creator.invocation != nil
	}
	if !binding {
		return true
	}
	result.declarations = append(result.declarations, value)
	previousReturn := query.returning
	query.returning = nil
	// The callback borrows the complete current result during this synchronous
	// visit. Publish every header change, including partial changes on panic,
	// without making all non-callback accessor results escape through invoke.
	callbackResult := *result
	defer func() { *result = callbackResult }()
	invoke(value, arguments, &callbackResult)
	query.returning = previousReturn
	return true
}
