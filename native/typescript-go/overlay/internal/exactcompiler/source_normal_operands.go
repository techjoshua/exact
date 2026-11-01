package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// sourceNormalOperand is a cached syntax demand, never an installed result.
// Only the actual normal producer can supply successful alternatives. A cell-only
// declaration demand publishes identity and never acquires an initializer value.
type sourceNormalOperand struct {
	node, value, binding *ast.Node
	pattern              bool
	cellOnly             bool
	await                bool
	get                  bool
}

type sourceNormalBinding struct {
	owner, site *ast.Node
	symbol      *ast.Symbol
	observed    sourceResultObservation
}

func describeNormalOperand(node *ast.Node) (sourceNormalOperand, bool) {
	demand := sourceNormalOperand{node: node}
	if ast.IsAwaitExpression(node) {
		demand.await = true
		return demand, true
	}
	if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		binary := node.AsBinaryExpression()
		demand.value = binary.Right
		if ast.IsObjectLiteralExpression(binary.Left) && nativeAssignmentTargetRole(binary.Left) == nativeAssignmentPattern {
			demand.pattern = true
			return demand, true
		}
		if ast.IsIdentifier(binary.Left) {
			demand.binding = binary.Left
		}
	} else if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) {
		demand.value = node.Initializer()
		demand.binding = node.Name()
	}
	operand := unwrapSourceCallableReference(demand.value)
	demand.get = operand != nil && (ast.IsPropertyAccessExpression(operand) || ast.IsElementAccessExpression(operand))
	dependent := demand.binding != nil && demand.value != nil && (demand.get || ast.IsAwaitExpression(operand) || ast.IsCallExpression(operand) || ast.IsBinaryExpression(node) && ast.IsIdentifier(operand))
	if !dependent && ast.IsVariableDeclaration(node) && demand.binding != nil && demand.value != nil {
		demand.cellOnly = true
		return demand, true
	}
	return demand, dependent
}

// normalBindingSymbol is the shared admission for invocation-local publication.
// Parameters and outer variables retain their ordinary effect owners. Syntax
// alone cannot authorize a completed slot or suppress its RHS operation.
func normalBindingSymbol(binding, owner *ast.Node, inputs *sourceValueInputs, typeChecker *checker.Checker) *ast.Symbol {
	if inputs == nil || inputs.declaration != owner || binding == nil {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(binding)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != owner {
		return nil
	}
	return symbol
}

// normalGetBinding defers a direct Get only to its admitted normal local producer.
// Discarded, called, returned and nonlocal assignment Gets keep ordinary ownership.
func normalGetBinding(node, owner *ast.Node, inputs *sourceValueInputs, typeChecker *checker.Checker) bool {
	if !ast.IsPropertyAccessExpression(node) && !ast.IsElementAccessExpression(node) {
		return false
	}
	outer := node
	for outer.Parent != nil && unwrapSourceCallableReference(outer.Parent) == node {
		outer = outer.Parent
	}
	if outer.Parent == nil {
		return false
	}
	demand, dependent := describeNormalOperand(outer.Parent)
	return dependent && demand.get && unwrapSourceCallableReference(demand.value) == node && normalBindingSymbol(demand.binding, owner, inputs, typeChecker) != nil
}

// consumeNormalOperand owns a binding's Get or reads an already-produced receipt. It never invokes the
// RHS or treats successful await alternatives as guaranteed normal completion.
func (query *sourceValueQuery) consumeNormalOperand(demand sourceNormalOperand, owner *ast.Node, bindings sourceValueBindings, result *accessorCandidates, inputs *sourceValueInputs) {
	if query.holdClosedPrefix(demand.node, result) {
		return
	}
	defer query.normalWork(result, demand.node)()
	if ast.IsVariableDeclaration(demand.node) {
		query.produceLexicalCell(demand.node, owner, bindings, inputs, result)
	}
	if demand.cellOnly {
		return
	}
	if demand.await {
		query.consumeAwaitEffects(demand.node, owner, bindings, result, inputs)
		return
	}
	previous := query.returnObservation
	query.returnObservation = &sourceReturnObservation{owner: owner, reader: demand.node, receipts: result.nativeCalls, normalCalls: result.normalCalls, frame: inputs}
	defer func() { query.returnObservation = previous }()
	if demand.pattern {
		query.assignmentPatternReads(demand.node, bindings, result)
		return
	}
	symbol := normalBindingSymbol(demand.binding, owner, inputs, query.owner.checker)
	if symbol == nil {
		query.consumeLexicalWrite(demand.node, bindings, result, inputs)
		return
	}
	acquired := accessorCandidates{}
	outputEffects := sourceEffectsUnaccounted // local value publication is not execution proof
	operand := unwrapSourceCallableReference(demand.value)
	if demand.get {
		previousReading, previousMember := query.reading, query.protectedMember
		query.reading, query.protectedMember = operand, operand
		acquired = query.consumeNormalGet(operand, bindings)
		query.reading, query.protectedMember = previousReading, previousMember
		mergeAccessorCandidates(result, acquired)
	} else if ast.IsAwaitExpression(operand) {
		query.observeNativeAwait(operand, bindings, &acquired)
	} else if ast.IsIdentifier(operand) {
		// A completing local transfer consumes an already installed operand,
		// never a declaration initializer or the current query's creator map.
		// Other writers stay in the ordinary live-value join before selection.
		values := query.originsAt(operand, demand.node, bindings, &acquired)
		admittedInput := false
		acquired.callableScopes = make(map[int]acquiredCallableScope)
		for _, value := range values {
			normal := value.normal
			if normal == nil || normal.owner != owner || normal.observed.inputs != inputs || normal.installed != nil || query.inputs != inputs {
				acquired.opaque = true
				continue
			}
			scope, admitted := query.normalValueScope(value, &acquired)
			if !admitted {
				acquired.opaque = true
				continue
			}
			admittedInput = true
			value.normal = nil
			value.forwarded = query.forwardingTrace(&acquired, value.forwarded, []*ast.Node{demand.node, demand.binding})
			acquired.callableScopes[len(acquired.values)] = scope
			acquired.values = append(acquired.values, value)
		}
		if !admittedInput {
			return
		}
	} else {
		raw, found := query.acquireNormalCallResult(operand, &acquired)
		if !found {
			acquired.opaque = true
		}
		retainResultUncertainty(raw, &acquired, sourceExecutionOutput)
		outputEffects = raw.effects
		acquired.callableScopes = make(map[int]acquiredCallableScope)
		for _, value := range raw.values {
			if !query.charge(&acquired, operand) {
				break
			}
			original := value
			term := value.value
			term.acquired = &original
			acquired.callableScopes[len(acquired.values)] = value.scope
			acquired.values = append(acquired.values, term)
		}
	}
	observed := sourceResultObservation{componentRefs: candidateContributionReferences(acquired), ownedGets: acquired.ownedGets, incomplete: acquired.valueIncomplete || len(acquired.values) == 0, effects: outputEffects}
	for index, value := range acquired.values {
		if value.ownedGetRow != nil {
			observed.values = append(observed.values, sourceObservedValue{value: value})
			continue
		}
		value.forwarded = query.forwardingTrace(&acquired, value.forwarded, []*ast.Node{demand.binding})
		scope, exists := acquired.callableScopes[index]
		if !exists {
			if !demand.get {
				observed.incomplete = true
				continue
			}
			scope = query.acquireCallableScope(bindings, &acquired)
		}
		observed.values = append(observed.values, sourceObservedValue{value: value, inputs: inputs, scope: scope})
	}
	observed.incomplete = observed.incomplete || acquired.valueIncomplete

	if inputs.completed == nil {
		inputs.completed = make(map[ast.SymbolId]sourceNormalBinding)
	}
	inputs.completed[ast.GetSymbolId(symbol)] = sourceNormalBinding{owner: owner, site: demand.node, symbol: symbol, observed: observed}
}

// sourceNormalValue is one conditional successful operand alternative. Its input
// receipt is set only by a selected synchronous invocation, never by body lookup.
type sourceNormalValue struct {
	observed    sourceObservedValue
	owner, site *ast.Node
	symbol      *ast.Symbol
	installed   *sourceValueInputs
	selected    *sourceObservedValue
}

func (query *sourceValueQuery) normalBindingValues(entry sourceNormalBinding, result *accessorCandidates) []sourceValue {
	importCandidateReferences(result, entry.observed.componentRefs)
	importCandidateReferences(result, ownedPopulationContributions(entry.observed.ownedGets))
	mergeOwnedGets(&result.ownedGets, entry.observed.ownedGets)
	var values []sourceValue
	for _, observed := range entry.observed.values {
		if observed.value.ownedGetRow != nil {
			values = append(values, observed.value)
			continue
		}
		if observed.inputs == nil || observed.inputs != query.inputs || observed.inputs.declaration != entry.owner {
			values = append(values, sourceValue{})
			continue
		}
		if !query.charge(result, observed.value.node) {
			break
		}
		observed.scope = query.copyCallableScope(observed.scope, result)
		value := observed.value
		value.normal = &sourceNormalValue{observed: observed, owner: entry.owner, site: entry.site, symbol: entry.symbol}
		values = append(values, value)
	}
	if entry.observed.incomplete || len(values) == 0 {
		values = append(values, sourceValue{})
	}
	return values
}

// normalLocalInput is a charged direct lookup, not all-bindings rebinding on
// every demand. Its actual owner and precedence are checked before publication.
func (query *sourceValueQuery) normalLocalInput(symbol *ast.Symbol, read *ast.Node, result *accessorCandidates) ([]sourceValue, bool) {
	if query.inputs == nil || symbol == nil {
		return nil, false
	}
	entry, exists := query.inputs.completed[ast.GetSymbolId(symbol)]
	if !exists || entry.owner != query.inputs.declaration || enclosingCallableNode(read) != entry.owner || !query.charge(result, entry.site) || !query.normalOperandPrecedes(entry, read, query.inputs.bindings) {
		return nil, false
	}
	return query.normalBindingValues(entry, result), true
}

// installNormalCaptures supplies only lexical captures selected by this actual
// synchronous call. It copies the original value/scope pair and preserves live
// writers. A foreign factory scope cannot acquire the current caller's entries.
func (query *sourceValueQuery) installNormalCaptures(inputs, parent *sourceValueInputs, result *accessorCandidates) {
	if parent == nil || len(parent.completed) == 0 && len(parent.cells) == 0 || inputs.invocation == nil || parent.declaration != enclosingCallableNode(inputs.invocation) || parent.declaration != enclosingCallableNode(inputs.declaration) {
		return
	}
	async, ordinary := ordinaryResultCategory(inputs.declaration)
	if !ordinary || async {
		// The actual allocating New can install captures for its indexed field
		// region. This is not a callable-class frame or deferred body entry.
		if !ast.IsPropertyDeclaration(inputs.declaration) || !ast.IsNewExpression(inputs.invocation) || !query.constructionFieldDomain(inputs, inputs.declaration.Initializer()) || len(inputs.bindings[0]) != 1 || inputs.bindings[0][0].instance.inputs != parent || inputs.bindings[0][0].instance.site != inputs.invocation {
			return
		}
	}
	index := query.owner.index(ast.GetSourceFileOfNode(inputs.declaration))
	if index.incomplete {
		result.opaque = true
		return
	}
	region := index.operationRegions[inputs.declaration]
	if region == nil {
		return
	}
	selected := make(map[ast.SymbolId]bool)
	for _, reference := range region.references {
		if !query.charge(result, reference) {
			return
		}
		symbol := query.owner.checker.GetSymbolAtLocation(reference)
		if symbol == nil {
			continue
		}
		id := ast.GetSymbolId(symbol)
		if !selected[id] {
			query.captureLexicalCell(inputs, parent, symbol, inputs.invocation, result)
		}
		entry, exists := parent.completed[id]
		if !exists || selected[id] || entry.owner != parent.declaration || !query.normalOperandPrecedes(entry, inputs.invocation, parent.bindings) {
			continue
		}
		selected[id] = true
		installLexicalCell(inputs, parent, symbol)
		values := query.normalBindingValues(entry, result)
		for position, value := range values {
			if value.normal != nil {
				installed := *value.normal
				installed.installed = inputs
				values[position].normal = &installed
			}
		}
		inputs.bindings[id] = values
		inputs.bindings[id] = query.liveValues(symbol, values, inputs.invocation, inputs.bindings, result)
	}
}

// normalValueScope consumes the saved binding/creator pair. Only a real selected
// input/result plan can add its own forwarding return, with no ambient map loan.
func (query *sourceValueQuery) normalValueScope(value sourceValue, result *accessorCandidates) (acquiredCallableScope, bool) {
	normal := value.normal
	if !normalInputOwned(normal, query.inputs) {
		return acquiredCallableScope{}, false
	}
	scope := query.copyCallableScope(normal.observed.scope, result)
	if inputs := normal.installed; inputs != nil && query.returning != nil && enclosingCallableNode(query.returning) == inputs.declaration {
		scope.creators[inputs.declaration] = sourceValueCreation{invocation: inputs.invocation, returning: query.returning}
	}
	return scope, true
}

// completedAssignmentValues reuses only the admitted operand result of this
// very writer. Other writes still pass through the unchanged replacement join.
func (query *sourceValueQuery) completedAssignmentValues(symbol *ast.Symbol, operation *ast.Node, bindings sourceValueBindings, result *accessorCandidates) ([]sourceValue, bool) {
	var selected []sourceValue
	for _, value := range bindings[ast.GetSymbolId(symbol)] {
		if !query.charge(result, value.node) {
			return nil, false
		}
		if value.normal != nil && value.normal.site == operation && value.normal.symbol == symbol {
			selected = append(selected, value)
		}
	}
	return selected, len(selected) > 0
}

// normalOperandPrecedes orders an already produced same-frame occurrence. The
// ordinary module-writer relation deliberately excludes these local initializer
// and comma continuations. No loop or unrelated lexical body inherits the fact.
func (query *sourceValueQuery) normalOperandPrecedes(entry sourceNormalBinding, read *ast.Node, bindings sourceValueBindings) bool {
	site := entry.site
	if site == nil || read == nil || entry.owner != enclosingCallableNode(read) || ast.GetSourceFileOfNode(site) != ast.GetSourceFileOfNode(read) || site.End() > read.Pos() || !query.charge(&accessorCandidates{}, site) {
		return false
	}
	if query.precedes(site, read, bindings) {
		return true
	}
	for parent := site.Parent; parent != nil && parent != entry.owner; parent = parent.Parent {
		if !query.charge(&accessorCandidates{}, parent) || ast.IsIterationStatement(parent, false) {
			return false
		}
	}
	possible, certain := query.reachable(site, bindings)
	if !possible || !certain {
		return false
	}
	if ast.IsVariableDeclaration(site) && site.Initializer() != nil {
		list := site.Parent
		if list != nil && list.Parent != nil && ast.IsVariableStatement(list.Parent) {
			statement := list.Parent
			if statement.Parent != nil && ast.IsBlock(statement.Parent) && statement.Parent.Contains(read) {
				return true
			}
		}
	}
	for parent := site.Parent; parent != nil && enclosingCallableNode(parent) == entry.owner; parent = parent.Parent {
		if !query.charge(&accessorCandidates{}, parent) {
			return false
		}
		if ast.IsBinaryExpression(parent) && parent.AsBinaryExpression().OperatorToken.Kind == ast.KindCommaToken && parent.AsBinaryExpression().Left.Contains(site) && parent.AsBinaryExpression().Right.Contains(read) {
			return true
		}
	}
	return false
}

// sourceOwnSlot is an operation-local descriptor relation. It does not describe
// the field value, final settlement, or any other use of the same allocation.
type sourceOwnSlot struct {
	operation, origin *ast.Node
	key               string
	normal            *sourceNormalValue
	frame             *sourceValueInputs
}

// normalFieldGet consumes the admitted successful alternative and its original
// complete forwarding inventory. The caller has installed normalValueScope.
func (query *sourceValueQuery) normalFieldGet(value sourceValue, key string, operation *ast.Node, result *accessorCandidates) *sourceGetInputs {
	normal := value.normal
	if normal == nil || operation == nil || key == "" || len(value.path) != 0 || normal.observed.inputs == nil || value.awaited == nil || normal.owner != value.awaited.owner {
		return nil
	}
	value.normal = nil
	present := false
	if !ast.IsObjectLiteralExpression(value.node) {
		return nil
	}
	for _, field := range value.node.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, field) {
			return nil
		}
		if ast.IsPropertyAssignment(field) && field.Name() != nil && !ast.IsComputedPropertyName(field.Name()) && callableNameText(field.Name()) == key {
			present = true
		}
	}
	get := &sourceGetInputs{operation: operation, receiver: value}
	if present && query.privateNativeForwardingAt(value, normal.owner, operation, normal, result) {
		get.ownSlot = &sourceOwnSlot{operation: operation, origin: value.node, key: key, normal: normal, frame: query.inputs}
		result.ownSlots = append(result.ownSlots, get.ownSlot)
	}
	// Refusing descriptor safety must not erase the actual receiver for an
	// ordinary possible getter. That Get retains its effects and uncertainty.
	return get
}

func (query *sourceValueQuery) ownsDataSlot(get *sourceGetInputs, origin *ast.Node, projection []string, name string, mode accessorTraversal) bool {
	if get == nil || get.ownSlot == nil || get.operation != get.ownSlot.operation || get.receiver.node != origin || get.ownSlot.origin != origin || get.ownSlot.frame != query.inputs || get.ownSlot.normal == nil || mode != accessorRead && mode != accessorAcquire {
		return false
	}
	if len(projection) == 0 {
		return name == get.ownSlot.key
	}
	return len(projection) == 1 && projection[0] == get.ownSlot.key && name == ""
}

// sourceFieldAlternative and sourceOwnSlot are temporary operation inputs. Neither
// can be retained by callable facts or reused at another field, frame or call.
type sourceFieldAlternative struct {
	operation *ast.Node
	key       string
	value     sourceValue
}

func (query *sourceValueQuery) fieldSlotsCover(operation *ast.Node, key string, values []sourceValue, slots []*sourceOwnSlot, result *accessorCandidates) bool {
	if operation == nil || len(values) == 0 {
		return false
	}
	for _, value := range values {
		if !query.charge(result, operation) || value.normal == nil {
			return false
		}
		matched := false
		for _, slot := range slots {
			if !query.charge(result, operation) {
				return false
			}
			if slot.operation == operation && slot.key == key && slot.origin == value.node && slot.normal == value.normal && slot.frame == query.inputs {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

func (query *sourceValueQuery) fieldAlternativesCovered(operation *ast.Node, key string, candidates *accessorCandidates) bool {
	matched := false
	for _, alternative := range candidates.fieldAlternatives {
		if !query.charge(candidates, operation) {
			return false
		}
		if alternative.operation == operation && alternative.key == key {
			if !query.fieldSlotsCover(operation, key, []sourceValue{alternative.value}, candidates.ownSlots, candidates) {
				return false
			}
			matched = true
		}
	}
	return matched
}

// normalCalleeResultOperand describes the producing Call operand of an ordinary
// invocation. The shared normal demand walk consumes it once before the outer
// call. It does not assert that either call completes or selects a finite body.
func normalCalleeResultOperand(node *ast.Node) *ast.Node {
	if !ast.IsCallExpression(node) {
		return nil
	}
	callee := unwrapSourceCallableReference(node.AsCallExpression().Expression)
	if ast.IsCallExpression(callee) {
		return callee
	}
	return nil
}

// inventoryNormalResultEndpoints tracks conditional envelope forwarding from the
// actual installed synchronous input into its ordinary local result consumer.
// This is a descriptor-inventory endpoint, not completed output or final lifetime
// authority. Every resulting alias remains in the same complete reference scan.
func (query *sourceValueQuery) inventoryNormalResultEndpoints(value sourceValue, endpoint *sourceNormalValue, fields map[string]bool, result *accessorCandidates, binders map[ast.SymbolId]bool, allowed map[*ast.Node]bool) bool {
	if endpoint == nil || endpoint.installed == nil {
		return true
	}
	installed, original := endpoint.installed, endpoint.observed.inputs
	if installed != query.inputs || installed.invocation == nil || original == nil || original.declaration != endpoint.owner || enclosingCallableNode(installed.invocation) != endpoint.owner {
		return false
	}
	async, ordinary := ordinaryResultCategory(installed.declaration)
	if !ordinary || async {
		return false
	}
	completing := sourceResultObservation{}
	forwarded := []*ast.Node{}
	query.consumeSuccessfulCompletions(installed.declaration, installed.bindings, &completing, result, func(site, expression *ast.Node) {
		expression = unwrapSourceCallableReference(expression)
		if expression == nil || !ast.IsIdentifier(expression) {
			return
		}
		symbol := query.owner.checker.GetSymbolAtLocation(expression)
		if symbol == nil || !binders[ast.GetSymbolId(symbol)] {
			return
		}
		actual := accessorCandidates{}
		terms := query.originsAt(expression, expression, installed.bindings, &actual)
		completing.incomplete = completing.incomplete || actual.opaque || actual.valueIncomplete || actual.receiverIncomplete || len(terms) == 0
		for _, term := range terms {
			if !query.charge(result, expression) {
				completing.incomplete = true
				return
			}
			if term.undefined || term.node != nil && len(term.path) == 0 && sourcePrimitiveValue(term.node) {
				continue
			}
			normal := term.normal
			if term.node != value.node || term.awaited != value.awaited || normal == nil || normal.owner != endpoint.owner || normal.observed.inputs != original || normal.installed != installed {
				completing.incomplete = true
				continue
			}
			// Only a primitive field leaves this envelope. Its actual descriptor
			// Get and all receiver/key effects are still checked by the caller.
			if len(term.path) == 1 && fields[term.path[0]] {
				continue
			}
			if len(term.path) != 0 {
				completing.incomplete = true
				continue
			}
			forwarded = append(forwarded, unwrapSourceCallableReference(expression))
		}
	})
	if completing.incomplete {
		return false
	}
	if len(forwarded) == 0 {
		return true
	}
	outer := query.envelopeOuterExpression(installed.invocation, result)
	if outer == nil || outer.Parent == nil {
		return false
	}
	consumer := outer.Parent
	// The shared assignment description distinguishes a bare local PutValue from
	// module/member/setter publication. Its normal value exists only conditionally.
	demand, _ := describeNormalOperand(consumer)
	if demand.binding != nil && unwrapSourceCallableReference(demand.value) == unwrapSourceCallableReference(installed.invocation) {
		symbol := query.owner.checker.GetSymbolAtLocation(demand.binding)
		if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != endpoint.owner || enclosingCallableNode(consumer) != endpoint.owner {
			return false
		}
		binders[ast.GetSymbolId(symbol)] = true
		allowed[demand.binding] = true
	} else if !ast.IsReturnStatement(consumer) || enclosingCallableNode(consumer) != endpoint.owner || !query.returnCompletesFor(consumer, original.bindings, true) {
		return false
	}
	for _, reference := range forwarded {
		if !query.charge(result, reference) {
			return false
		}
		allowed[reference] = true
	}
	// An owning normal output is a tracked endpoint for this earlier field Get.
	// It is not a private returned-object certificate. Settlement reacquires then
	// independently, including the normal setter/prototype/reference obligations.
	root := sourceResultObservation{}
	query.consumeSuccessfulCompletions(endpoint.owner, original.bindings, &root, result, func(site, expression *ast.Node) {
		expression = unwrapSourceCallableReference(expression)
		if expression == nil || !ast.IsIdentifier(expression) {
			return
		}
		symbol := query.owner.checker.GetSymbolAtLocation(expression)
		if symbol != nil && binders[ast.GetSymbolId(symbol)] {
			if query.charge(result, expression) {
				allowed[expression] = true
			}
		}
	})
	return !root.incomplete
}
