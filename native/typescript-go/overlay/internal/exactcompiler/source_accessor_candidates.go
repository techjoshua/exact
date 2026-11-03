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
	receivers              *sourceEffectReceivers
}

// sourceAccessorMutation is a detached mutation fact of one completed Get.
// It grants no execution, returned-value or family authority.
type sourceAccessorMutation struct {
	operation, body *ast.Node
	verdict         sourceWriteVerdict
}

type accessorCandidates struct {
	environmentEffects []EnvironmentEffectSource
	contextEffects     []ContextEffect

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
	var reference *sourceGetReference
	if query.dependenciesOnly {
		reference = sourceGetReferenceFor(operation, receiver, path, name, mode)
	}
	previousSetter := query.setterInput
	query.setterInput = query.sourceSetterRequest(operation, mode, arguments)
	defer func() { query.setterInput = previousSetter }()
	result := query.accessorsAtGetOutput(receiver, path, name, mode, arguments, nil, nil, nil, reference)
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

// accessors instantiates relative roots through this query's source acquisition owners.
func (query *sourceValueQuery) accessors(receiver *ast.Node, path []string, name string, mode accessorTraversal, arguments sourceValueBindings, invoke func(*ast.Node, sourceValueBindings, *accessorCandidates)) accessorCandidates {
	return query.accessorsAtGet(receiver, path, name, mode, arguments, invoke, nil)
}

// accessorsAtGet supplies an explicit implicit-Get input at the selected receiver.
// Ordinary recursive property/callee queries do not inherit this operation input.
func (query *sourceValueQuery) accessorsAtGet(receiver *ast.Node, path []string, name string, mode accessorTraversal, arguments sourceValueBindings, invoke func(*ast.Node, sourceValueBindings, *accessorCandidates), get *sourceGetInputs, alternatives ...sourceValue) accessorCandidates {
	return query.accessorsAtGetOutput(receiver, path, name, mode, arguments, invoke, get, nil, nil, alternatives...)
}

// acquireCallableScope snapshots a reached body's bindings and creator relations.
// Initializer observations are sealed before transfer. Scope allocation identity
// does not establish source identity, and cost accounting does not bound copying.
func (query *sourceValueQuery) acquireCallableScope(arguments sourceValueBindings, result *accessorCandidates) acquiredCallableScope {
	// Both maps remain writable and detached. Reserve their known entry counts
	// so snapshot publication does not repeatedly grow and rehash them.
	scope := acquiredCallableScope{bindings: make(sourceValueBindings, len(arguments)), creators: make(map[*ast.Node]sourceValueCreation, len(query.creators))}
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
	if receiver == nil || receiver.Parent == nil || len(projection) > 1 {
		return false
	}
	// Read and callee acquisition use two encodings of the same direct Get.
	// Only its exact source receiver/key may use this declaration contract.
	if len(projection) == 1 {
		if name != "" {
			return false
		}
		name = projection[0]
	}
	if name == "" {
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
