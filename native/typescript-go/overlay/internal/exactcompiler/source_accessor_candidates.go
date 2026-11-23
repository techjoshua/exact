package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// acquiredCallableScope preserves the traversal-local creating inputs and return occurrence
// for one acquired alternative. It is not authority for other alternatives or later lookups.
type acquiredCallableScope struct {
	constructionCapture *sourceConstructionCallableValue // Source-only expected roles, never a creating B.
	bindings            sourceValueBindings
	creators            map[*ast.Node]sourceValueCreation
}

// accessorCandidates carries a bounded provenance proof. Exhaustion retains unknown effects.
// sourceCallableEffect preserves the producer operation before candidate joins.
// Declaration selection alone is not an execution contribution. A nil operation
// retains a conservative effect edge but can never fulfill an input disposition.
type sourceCallableEffect struct {
	arrayMapCall *ast.Node // Original acquired Array.map MAY callback parent; no execution rights.
	use          *ast.Node // Original contextual EFFECT parent only; operation identity remains separate.

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
	selectedProxy           *ast.Node                            // Original implicit construction only; never joined across candidate merges.
	installedMemberReadings []sourceInstalledMemberRequirement   // detached original Get-to-field handoff
	installedCallSelections []sourceInstalledCallSelectionSource // detached actual callee source descriptions
	installedMemberPending  []sourceInstalledMemberPending       // exact compiler-owned phase requirement, not opacity
	standardMemberTransfers []sourceStandardMemberTransfer       // source-only Get transfers, no execution authority

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
	// The value slot of an observed entries pair may consume own enumeration origins.
	accessorEnumerateEntries accessorTraversal = accessorEnumerate | 128
	accessorEnumerateValues  accessorTraversal = accessorEnumerateEntries | accessorAcquire
)

// sourceAccessorBoundCandidates substitutes source-owned arguments without granting authority to structural types.
func sourceAccessorBoundCandidates(receiver *ast.Node, path []string, name string, mode accessorTraversal, typeChecker *checker.Checker, bindings map[ast.SymbolId]*ast.Node, owner *executableBodyOwner, consumer *ast.Node) accessorCandidates {
	return sourceAccessorOperationCandidates(receiver, path, name, mode, typeChecker, bindings, owner, consumer, nil)
}

// sourceAccessorOperationCandidates retains mutation references at the existing
// evaluated member owner. A syntax reference is not execution or value authority.
func sourceAccessorOperationCandidates(receiver *ast.Node, path []string, name string, mode accessorTraversal, typeChecker *checker.Checker, bindings map[ast.SymbolId]*ast.Node, owner *executableBodyOwner, consumer, operation *ast.Node) accessorCandidates {
	values := owner.sourceValues(typeChecker)
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
func (query *sourceValueQuery) sourceAccessorOperationCandidates(receiver *ast.Node, path []string, name string, mode accessorTraversal, arguments sourceValueBindings, operation *ast.Node, setter ...*sourceSetterInputRequest) accessorCandidates {
	// A confined built-in result has no authored own map property.
	// The original producer and callback retain their own effects.
	member := operation
	if query.dependenciesOnly && len(path) == 0 && member != nil && ast.IsPropertyAccessExpression(member) &&
		(mode == accessorRead && name == "map" && receiver == member.Expression() ||
			mode == accessorAcquire && name == "" && receiver == member) {
		declaration := query.owner.directEntriesMap(member)
		if declaration == nil {
			_, declaration = query.confinedFilterMap(member, arguments)
		}
		if declaration != nil {
			result := accessorCandidates{sourceOwned: true}
			if mode == accessorAcquire {
				result.values = []sourceValue{{node: declaration}}
			}
			return result
		}
		if query.inputs == nil && len(arguments) == 0 && enclosingCallableNode(member) == query.effectOwner &&
			query.relativeFilterMapReceiver(member, member.Expression()) != nil {
			if demand := query.operationFieldDemand(member, "map"); demand.slot != nil && ast.IsParameterDeclaration(demand.slot) {
				return accessorCandidates{valueIncomplete: true, fieldFallbacks: []sourceFieldDemand{demand}}
			}
		}
	}
	// The helper's actual state-slot producers establish an inherited filter.
	// Original field evaluation and argument evaluation retain their owners.
	if query.dependenciesOnly && len(path) == 0 && member != nil && ast.IsPropertyAccessExpression(member) && member.Name().Text() == "filter" &&
		(mode == accessorRead && receiver == member.Expression() || mode == accessorAcquire && name == "" && receiver == member) {
		call := normalCalleeGetOwner(member)
		if query.componentFilterInputs(call, arguments) != nil {
			result := accessorCandidates{sourceOwned: true}
			if mode == accessorAcquire {
				result.values = []sourceValue{{node: query.owner.checker.GetResolvedSignature(call).Declaration()}}
			}
			return result
		}
	}
	// A fresh literal has no own map member before the original callee Get.
	// The captured-const key is proven at this occurrence. Its evaluation and
	// the map's callback effects still belong to their original owners.
	if query.dependenciesOnly && len(path) == 0 && member != nil && ast.IsElementAccessExpression(member) &&
		member.Parent != nil && ast.IsCallExpression(member.Parent) && member.Parent.Expression() == member &&
		(mode == accessorRead && receiver == member.Expression() || mode == accessorAcquire && name == "" && receiver == member) &&
		directDenseArrayMap(member.Parent, query.owner.checker) != nil {
		result := accessorCandidates{sourceOwned: true}
		if mode == accessorAcquire {
			result.values = []sourceValue{{node: query.owner.checker.GetResolvedSignature(member.Parent).Declaration()}}
		}
		return result
	}
	// A successful direct map creates a fresh array. Immediate dense index and
	// length Gets have no authored accessor. The map still owns callback effects.
	if query.dependenciesOnly && len(path) == 0 && mode == accessorRead && member != nil && ast.IsAccessExpression(member) && member.Expression() == receiver {
		if literal := directDenseArrayMap(unwrapSourceCallableReference(receiver), query.owner.checker); literal != nil {
			index, positional := sourceArrayIndex(name)
			if name == "length" || (positional && index < uint64(len(literal.AsArrayLiteralExpression().Elements.Nodes))) ||
				directMappedArrayJoin(member, query.owner.checker) {
				return accessorCandidates{sourceOwned: true}
			}
		}
	}
	// A read of the private facade's method is a data Get. The call and
	// producer retain their own effects, and no returned value is inferred.
	if query.dependenciesOnly && len(path) == 0 && member != nil && ast.IsPropertyAccessExpression(member) &&
		(mode == accessorRead && name == "get" && receiver == member.Expression() || mode == accessorAcquire && name == "" && receiver == member) &&
		ast.IsCallExpression(member.Parent) && member.Parent.Expression() == member {
		var result accessorCandidates
		if query.localReactiveReadProducer(member, &result) != nil {
			return accessorCandidates{sourceOwned: true, valueIncomplete: mode == accessorAcquire}
		}
	}
	// Both graph owners retain these dependencies at the original increment.
	// The recurrence is an effect source, with no staged DATA or normal output.
	if query.dependenciesOnly && mode == accessorRead && len(path) == 0 {
		var result accessorCandidates
		if entry := query.loopMemberBackedge(operation, &result); entry != nil && ast.IsIdentifier(entry) && operation.AsPropertyAccessExpression().QuestionDotToken == nil {
			query.visitLoopMemberReceivers(entry, operation, arguments, &result, nil)
			return result
		}
	}
	previous := query.protectedMember
	query.protectedMember = operation
	defer func() { query.protectedMember = previous }()
	// The original callee owner lends a distinct source selector; absence does
	// not invent source membership or broaden the definition-member factory.
	restoreSelection := func() {}
	if query.dependenciesOnly && query.initializing != nil {
		if revoke, owned := query.beginInstalledSourceCallSelectionWork(query.initializing); owned {
			restoreSelection = revoke
		}
	}
	defer restoreSelection()
	var reference *sourceGetReference
	if query.dependenciesOnly {
		reference = sourceGetReferenceFor(operation, receiver, path, name, mode)
		if reference != nil && mode == accessorRead && reference.selectConstGetKey(query.owner.checker, false) {
			name = reference.key.name
		}
	}
	previousSetter := query.setterInput
	if query.dependenciesOnly && mode == accessorSetAcquire && len(setter) == 1 && setter[0] != nil && setter[0].target == operation {
		query.setterInput = setter[0]
	} else {
		query.setterInput = query.sourceSetterRequest(operation, mode, arguments)
	}
	defer func() { query.setterInput = previousSetter }()
	if query.memberReceiverPreparation == nil && query.memberReceiverPreparationEligible(reference, path, name, mode) {
		// Only this original visitor issues preparation. A copied reference
		// outside this stack interval cannot install or authenticate the loan.
		prior := query.memberReceiverPreparation
		preparation := sourceMemberReceiverPreparation{issuer: query, borrower: query.stagedMember, reference: reference, parent: query.stagedMember.request, cut: query.stagedMember.request.cut, queryCut: query.relativeInputCut(operation), bindingCall: query.normalBindingCall, publisher: query.executable.pendingMemberPublishers[query.effectOwner]}
		query.memberReceiverPreparation = &preparation
		defer func() {
			if query.memberReceiverPreparation == &preparation {
				query.memberReceiverPreparation = prior
			}
			preparation.issuer, preparation.borrower, preparation.reference, preparation.read, preparation.publisher = nil, nil, nil, nil, nil
		}()
	}
	result := query.accessorsAtGetOutput(receiver, path, name, mode, arguments, nil, nil, nil, reference)
	if operation != nil && operation.Parent != nil {
		mutation := planMutationOperation(operation.Parent)
		if mutation.target == operation {
			query.retainThenOperation(operation.Parent, arguments, &result)
		}
	}
	query.finishInstalledSourceCallSelection(&result)
	return result
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
	if read && !write && componentRegistryDataRead(node, query.owner.checker) {
		return accessorCandidates{sourceOwned: true}
	}
	receiver, name := accessorReceiver(node)
	mode := accessorRead
	if write {
		mode |= accessorSet
	}
	if !read {
		mode |= accessorNoGet
	}
	candidates := query.sourceKeyedMemberCandidates(node, receiver, name, mode, bindings)
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

// sourceKeyedMemberCandidates keeps finite keys with the actual source reader.
// A represented empty iterator contributes no field alternatives. The original
// key expression and receiver evaluation retain their existing effect walk.
func (query *sourceValueQuery) sourceKeyedMemberCandidates(operation, receiver *ast.Node, name string, mode accessorTraversal, bindings sourceValueBindings) accessorCandidates {
	if name == "" && mode == accessorRead && ast.IsElementAccessExpression(operation) {
		keys := query.sourceFinitePropertyKeys(operation.AsElementAccessExpression().ArgumentExpression)
		if keys != nil {
			candidates := accessorCandidates{sourceOwned: len(keys) == 0}
			for _, key := range keys {
				mergeAccessorCandidates(&candidates, query.sourceAccessorOperationCandidates(receiver, nil, key, mode, bindings, operation))
			}
			return candidates
		}
	}
	return query.sourceAccessorOperationCandidates(receiver, nil, name, mode, bindings, operation)
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
	return query.captureCallableScope(arguments, result, true)
}

// captureCallableScope seals and accounts for the original caller inputs. A Call
// with no declarations dispatches through independently captured callable
// alternatives, so its header has no consumer for the writable indexes.
func (query *sourceValueQuery) captureCallableScope(arguments sourceValueBindings, result *accessorCandidates, retain bool) acquiredCallableScope {
	progressCount(query, tScopeAcquired, 1)
	var scope acquiredCallableScope
	if retain {
		scope.bindings = make(sourceValueBindings, len(arguments))
		scope.creators = make(map[*ast.Node]sourceValueCreation, len(query.creators))
	}
	for id, terms := range arguments {
		if !query.charge(result, nil) {
			break
		}
		sealed := query.sealInitializerValues(terms, result)
		if retain {
			scope.bindings[id] = sealed
		}
	}
	for owner, creator := range query.creators {
		if !query.charge(result, owner) {
			break
		}
		if retain {
			scope.creators[owner] = creator
		}
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
