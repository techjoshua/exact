package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// settlementReturnEffects runs after ordinary demands, including finalizers.
// It emits only implicit Get obligations. It cannot publish a successful payload
// or borrow another call's activation. The cached sites and shared completion
// projection include bare returns and discard definitely replaced alternatives.
func (query *sourceValueQuery) settlementReturnEffects(declaration *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	observed := &sourceResultObservation{}
	retainValue := query.inputs != nil && query.inputs.declaration == declaration && query.inputs.fulfilled != nil
	if retainValue {
		observed = query.inputs.fulfilled
	}
	var references []sourceThenReference
	referencesReady := false
	query.consumeSuccessfulCompletions(declaration, bindings, observed, result, func(site, expression *ast.Node) {
		appendValue := func(term sourceValue, scope acquiredCallableScope) {
			observed.values = append(observed.values, sourceObservedValue{value: term, scope: scope, returned: site})
		}
		if expression == nil {
			if retainValue {
				appendValue(sourceValue{undefined: true}, query.acquireCallableScope(bindings, result))
			}
			return
		}
		expression = unwrapSourceCallableReference(expression)
		if sourcePrimitiveValue(expression) || query.primitiveSettlementValue(expression) {
			if retainValue {
				appendValue(sourceValue{node: expression}, query.acquireCallableScope(bindings, result))
			}
			return
		}
		observation := &sourceReturnObservation{owner: declaration, reader: site, receipts: result.nativeCalls, normalCalls: result.normalCalls, frame: query.inputs}
		previousObservation := query.returnObservation
		query.returnObservation = observation
		defer func() { query.returnObservation = previousObservation }()
		values := []sourceObservedValue{}
		acquired := false
		if query.inputs != nil {
			for _, get := range query.inputs.returnedGets {
				if get.site == site {
					values = append(values, get.values...)
					observed.incomplete = observed.incomplete || get.incomplete
					acquired = true
				}
			}
		}
		if !acquired {
			terms := accessorCandidates{}
			if ast.IsObjectLiteralExpression(expression) {
				terms.values = []sourceValue{{node: expression}}
			} else {
				terms = query.accessors(expression, nil, "", accessorAcquire, bindings, nil)
			}
			mergeAccessorCandidates(result, terms)
			observed.incomplete = observed.incomplete || terms.opaque || terms.valueIncomplete || terms.receiverIncomplete || len(terms.values) == 0
			for i, value := range terms.values {
				scope, exists := terms.callableScopes[i]
				if !exists {
					scope = query.acquireCallableScope(bindings, result)
				}
				original := sourceObservedValue{value: value, scope: scope, returned: site}
				if value.acquired != nil {
					original = *value.acquired
				}
				values = append(values, original)
			}
		}
		for _, value := range values {
			if !query.charge(result, site) {
				observed.incomplete = true
				return
			}
			previousCreators := query.creators
			query.creators = value.scope.creators
			if value.value.native != nil && value.value.native.async != nil {
				query.settleAsyncFacade(value.value, site, value.scope.bindings, result, observed)
			} else if query.settlementAcquiredValue(value, site, value.scope.bindings, result, &references, &referencesReady, observation) {
				if retainValue {
					appendValue(value.value, value.scope)
				}
			} else {
				observed.incomplete = true
			}
			query.creators = previousCreators
		}
	})
}

// appendReturnSettlementEffects uses the same implicit Get producer for direct
// callable collection. Child task analysis invokes it on its own lexical host.
func appendReturnSettlementEffects(fact *callableFacts, targets map[*ast.Node]int, source *ast.SourceFile, typeChecker *checker.Checker, owner *executableBodyOwner, componentTask bool) {
	// This is a source-construction accumulator, consumed before fingerprinting.
	// It is never a second project cache or an effect propagation graph.
	defer func() {
		fact.thenReferences = nil
		fact.thenIncomplete = false
		fact.nativeCalls = nil
		fact.normalCalls = nil
	}()

	async, ordinary := ordinaryResultCategory(fact.node)
	// The task runtime settles a synchronous task result even if its caller discards it.
	if !ordinary || !async && !componentTask {
		return
	}
	values := owner.sourceValues(typeChecker)
	query := sourceValueQuery{owner: values, executable: owner, effectOwner: fact.node, remaining: 4096, active: make(map[*ast.Node]bool)}
	// Normal Get/call producers have already retained this owner's references.
	// The current construction frame is still live here. It is cleared by the
	// collector's defer before facts are cached, never copied or retained by us.
	result := accessorCandidates{thenReferences: fact.thenReferences, thenIncomplete: fact.thenIncomplete, nativeCalls: fact.nativeCalls, normalCalls: fact.normalCalls}
	func() {
		previousInputs, previousOperation := query.inputs, query.operation
		defer func() { query.inputs, query.operation = previousInputs, previousOperation }()
		query.operation = &sourceOperationContext{node: fact.node, owner: fact.node}
		var bindings sourceValueBindings
		if inputs := fact.normalInputs; inputs != nil {
			// A direct construction frame has no foreign invocation/Get owner.
			// Invalid input cannot publish a completed local occurrence, but its
			// ordinary return/Get obligations must still be collected below.
			if inputs.declaration != fact.node || inputs.invocation != nil || inputs.get != nil || inputs.implicit != nil || inputs.bindings == nil {
				result.opaque = true
				result.cause = fact.node
			} else {
				query.inputs = inputs
				query.operation.inputs = inputs
				bindings = inputs.bindings
			}
		}
		query.settlementReturnEffects(fact.node, bindings, &result)
	}()
	appendOpaqueAccessorEffect(fact, result)
	appendSourceValueWrites(fact, result, typeChecker)
	appendAccessorTargets(fact, fact.node, result, targets, source)
}

// primitiveSettlementValue classifies the value after its ordinary expression
// effects have been collected. Primitive unions perform no implicit then Get.
// Object, any, unknown and unconstrained generic values supply no such fact.
func (query *sourceValueQuery) primitiveSettlementValue(node *ast.Node) bool {
	value := query.componentOperandType(node)
	if value == nil {
		return false
	}
	for _, member := range value.Distributed() {
		if member.Flags()&(checker.TypeFlagsStringLike|checker.TypeFlagsNumberLike|checker.TypeFlagsBooleanLike|checker.TypeFlagsBigIntLike|checker.TypeFlagsESSymbolLike|checker.TypeFlagsNull|checker.TypeFlagsUndefined|checker.TypeFlagsNever) == 0 {
			return false
		}
	}
	return true
}

// componentOperandType keeps checked object types and recovers the declared
// state field type when TypeScript lacks the bound function task receiver.
func (query *sourceValueQuery) componentOperandType(node *ast.Node) *checker.Type {
	value := query.owner.checker.GetTypeAtLocation(node)
	if value == nil || value.Flags()&(checker.TypeFlagsAny|checker.TypeFlagsUnknown) != 0 {
		if owned := query.settlementComponentStateType(node); owned != nil {
			return owned
		}
	}
	return value
}

// settlementComponentStateType uses the existing analysis-owned component/input
// facts. The charged lexical walk and authoritative receiver guard exclude class
// initializers, methods, explicit receivers and shadow policy providers.
func (query *sourceValueQuery) settlementComponentStateType(node *ast.Node) *checker.Type {
	root, path := effectArgumentRoot(node)
	if root == nil || root.Kind != ast.KindThisKeyword || len(path) < 2 || path[0] != "state" {
		return nil
	}
	var receiver *ast.Node
	for child, current := node, node.Parent; current != nil; child, current = current, current.Parent {
		if !query.charge(&accessorCandidates{}, current) {
			return nil
		}
		if bindings, component := query.owner.components[current]; component {
			if receiver != nil && componentOwnsReceiver(node, map[*ast.Node]bool{receiver: true, current: true}) {
				return functionTaskStatePrefixType(node, current, ast.GetSourceFileOfNode(node), query.owner.checker, bindings, path[1:])
			}
			return nil
		}
		if receiver == nil && ast.IsFunctionLike(current) && !ast.IsArrowFunction(current) && current.Name() != child {
			if !ast.IsFunctionDeclaration(current) && !ast.IsFunctionExpression(current) {
				return nil
			}
			// The receiver boundary is selected before seeking an outer component.
			// functionTaskPolicy checks the original import symbol, not its spelling.
			for _, parameter := range current.Parameters() {
				if parameter.Name() != nil && parameter.Name().Text() == "this" {
					return nil
				}
			}
			receiver = current
		}
	}
	return nil
}

// settlementAcquiredValue keeps descriptor safety separate from origin and
// successful completion. Only an immediate literal or a proved private transfer
// can use the standard absent inherited property alternative.
func (query *sourceValueQuery) settlementAcquiredValue(value sourceObservedValue, site *ast.Node, bindings sourceValueBindings, result *accessorCandidates, references *[]sourceThenReference, referencesReady *bool, observation *sourceReturnObservation) bool {
	term := value.value
	if term.native != nil && term.native.kind == sourceNativePromiseFacade {
		query.promiseFacadeThenEffects(term, site, bindings, result)
		result.opaque = true
		return false
	}

	if term.undefined || term.node != nil && len(term.path) == 0 && (sourcePrimitiveValue(term.node) || query.primitiveSettlementValue(term.node)) {
		return true
	}
	if term.node == nil || len(term.path) != 0 || !ast.IsObjectLiteralExpression(term.node) {
		// Required resolution Get precedes successful-payload precision. A
		// function object is read, not called. Missing prototype/construction
		// facts remain unknown beside independently acquired getter effects.
		get := &sourceGetInputs{operation: site, receiver: term, propertyKey: "then"}
		selected := query.acquireRequiredProperty(value, get, accessorAcquire)
		retainCallableThenEffects(&selected, site)
		mergeAccessorCandidates(result, selected)
		result.opaque = true
		if result.cause == nil {
			result.cause = site
		}
		return false
	}
	fresh := term.node == unwrapSourceCallableReference(site)
	if ast.IsReturnStatement(site) {
		fresh = term.node == unwrapSourceCallableReference(site.AsReturnStatement().Expression)
	}
	if term.awaited != nil {
		fresh = query.privateAwaitForwarding(term, result)
	}
	for _, member := range term.node.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, member) {
			return false
		}
		fresh = fresh && member.Name() != nil && !ast.IsComputedPropertyName(member.Name()) && callableNameText(member.Name()) != "__proto__" && !ast.IsSpreadAssignment(member)
	}
	// Source effect coverage is independent of the unavailable definition-root
	// normal property view. This branch publishes no successful payload.
	sourceLiteral := false
	if ast.IsReturnStatement(site) && unwrapSourceCallableReference(site.AsReturnStatement().Expression) == term.node {
		sourceLiteral = true
		for _, field := range term.node.AsObjectLiteralExpression().Properties.Nodes {
			ordinary := field.Name() != nil && !ast.IsComputedPropertyName(field.Name()) && !ast.IsSpreadAssignment(field)
			if ordinary && callableNameText(field.Name()) == "__proto__" {
				ordinary = ast.IsPropertyAssignment(field) && unwrapSourceCallableReference(field.Initializer()).Kind == ast.KindNullKeyword
			}
			sourceLiteral = sourceLiteral && ordinary
		}
	}
	if sourceLiteral {
		own := false
		for _, field := range term.node.AsObjectLiteralExpression().Properties.Nodes {
			own = own || field.Name() != nil && callableNameText(field.Name()) == "then"
		}
		if !own {
			obligations := query.sourceSettlementThen(&sourceGetInputs{operation: site, receiver: term, propertyKey: "then"}, bindings)
			mergeAccessorCandidates(result, obligations.effects)
			result.opaque = result.opaque || obligations.incomplete
			return false
		}
	}
	if !*referencesReady {
		query.preparePropertyReferences(observation.owner, result)
		*references = append(*references, result.thenReferences...)
		eager, incomplete := query.settlementThenReferences(observation.owner, result)
		*references = append(*references, eager...)
		result.thenIncomplete = result.thenIncomplete || incomplete
		*referencesReady = true
	}
	selected := query.settlementThen(&sourceGetInputs{operation: site, receiver: term, freshReturn: fresh}, bindings, *references, result.thenIncomplete)
	mergeAccessorCandidates(result, selected.effects)
	if !selected.noncallable {
		result.opaque = true
		if result.cause == nil {
			result.cause = site
		}
	}
	return fresh && selected.noncallable && !selected.effects.opaque && len(selected.effects.effects) == 0
}
