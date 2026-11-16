package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedExternalGetRoot describes one immutable same-activation receiver alias.
// This is admission to the original Get owner, not a runtime value, DATA slot,
// successful read or no-user-entry premise. Other alias domains remain pending.
func stagedExternalGetRoot(operation, caller *ast.Node, owner *executableBodyOwner) *ast.Node {
	if operation == nil || owner == nil || owner.values == nil || !stagedResultExpression(operation) || ast.IsCallExpression(operation) || ast.IsOptionalChain(operation) || !sourceStagedOccurrenceOwned(operation, caller) {
		return nil
	}
	receiver := unwrapSourceCallableReference(operation.Expression())
	if receiver == nil || !ast.IsIdentifier(receiver) {
		return nil
	}
	binding := stagedBindingDataDeclaration(receiver, caller, owner)
	if binding == nil || !ast.IsVariableDeclaration(binding) || binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(binding) != caller || binding.Pos() >= operation.Pos() {
		return nil
	}
	symbol := owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || owner.values.bindingWritten(symbol) {
		return nil
	}
	root := unwrapSourceCallableReference(binding.Initializer())
	if root == nil || !ast.IsIdentifier(root) {
		return nil
	}
	global := owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil)
	if global == nil || owner.checker.GetSymbolAtLocation(root) != global || owner.values.bindingWritten(global) {
		return nil
	}
	return root
}

// observeStagedExternalGetValue runs only inside the actual original Get's
// acquisition. The reached runtime terminal licenses arbitrary DATA if Get
// returns. Missing values/opacity and the lexical classifier cannot issue it.
func (q *sourceValueQuery) observeStagedExternalGetValue(expression *ast.Node, symbol *ast.Symbol, projection []string, name string, mode accessorTraversal, get *sourceGetInputs, cut *sourceMemberWriterReadCut, result *accessorCandidates) {
	b := q.liveStagedGetResult(get)
	if b == nil || get != b.get || mode != accessorAcquire || !q.traceModeKnown || q.traceMode != mode || q.protectedMember != get.operation || expression != stagedExternalGetRoot(get.operation, b.request.consumer, b.owner) || symbol == nil || symbol != q.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil) || q.owner.bindingWritten(symbol) || cut == nil {
		return
	}
	member := q.stagedMember
	if member == nil {
		return
	}
	restore := q.enterStagedMemberSource(get, cut, result)
	defer restore()
	if !q.liveStagedMemberSource(member, get, cut) {
		return
	}
	sources, _ := q.nativeSelectionSources(expression, result)
	var storage [4]sourceValueIndex
	indexes := q.occurrenceSourceViewIn(expression, result, sources, storage[:0])
	q.prepareStagedMemberSources(get, cut, expression, projection, name, mode, indexes, result)
	if q.liveStagedGetResult(get) != b || !q.liveStagedMemberSource(member, get, cut) {
		return
	}
	endpoint := sourceRelativeEndpoint{kind: relativeEndpointRole, role: sourceRelativeRole{kind: relativeRoleUnknown, declaration: b.request.consumer}, producer: get.operation, get: get.operation, cut: b.cut}
	present := false
	for _, prior := range b.values {
		present = present || sameOperationEndpoint(prior.endpoint, endpoint)
	}
	if !present {
		b.values = append(b.values, sourceStagedOperationAlternative{endpoint: endpoint})
	}
	// This positively reached external Get owns runtime uncertainty. Do not
	// manufacture the generic unresolved-source residual/provenance marker.
	effect := environmentSource("unknown", "external property Get", b.facts[b.work.memberNodes[b.request.consumer]].summary.Name)
	effect.Opaque = true
	present = false
	for _, prior := range result.environmentEffects {
		present = present || sameOperationEffect(prior, effect)
	}
	if !present {
		result.environmentEffects = append(result.environmentEffects, effect)
	}
}

// observeStagedExternalGetResult uses the existing Get roles, member C and
// original key producers. No query, scope or callback survives this interval.
func (work *callableEffectWork) observeStagedExternalGetResult(facts []callableFacts, caller int, operation *ast.Node, owner *executableBodyOwner) bool {
	if caller < 0 || caller >= len(facts) {
		return false
	}
	root := stagedExternalGetRoot(operation, facts[caller].node, owner)
	if root == nil {
		return false
	}
	value := stagedGetResultRequest(operation, facts[caller].node, "value", nil)
	parent, owned := stagedMemberGetSourceRequest(&facts[caller], operation)
	if !owned {
		return false
	}
	keyReady := true
	var keyRequired []sourceStagedOperationRequest
	if ast.IsElementAccessExpression(operation) {
		key, known := work.stagedPrimitiveKeySource(facts, operation.AsElementAccessExpression().ArgumentExpression, facts[caller].node, owner)
		keyReady = known
		if known && key.producer.producer.operation != nil {
			keyRequired = append(keyRequired, key.producer)
		}
	}
	query := newSourceDependencyQuery(operation, owner.checker, owner, facts[caller].node)
	defer query.publishDependencyStatistics()
	query.protectedMember = operation
	revoke, installed := work.beginStagedMemberWork(query, facts, parent)
	if !installed {
		return false
	}
	defer revoke()
	receiver, name := accessorReceiver(operation)
	projection := []string{name}
	if name == "" {
		projection[0] = "*" // Unknown property population, never a key identity.
	}
	get := &sourceGetInputs{operation: operation, receiver: sourceValue{node: receiver}, propertyKey: projection[0]}
	b := &sourceStagedGetResultBorrow{issuer: query, work: work, facts: facts, owner: owner, sourceOwner: query.owner, get: get, request: value, cut: query.relativeInputCut(operation), active: true, complete: true}
	get.resultSource = b
	defer func() { b.active = false; b.issuer = nil; b.get = nil; b.facts = nil; get.resultSource = nil }()
	member := query.stagedMember
	result := query.accessorsAtGet(receiver, projection, "", accessorAcquire, nil, nil, get)
	terminal := false
	for _, value := range b.values {
		terminal = terminal || value.creating == nil && value.endpoint.kind == relativeEndpointRole && value.endpoint.role.kind == relativeRoleUnknown && value.endpoint.producer == operation && value.endpoint.get == operation && value.endpoint.cut == b.cut
	}
	if !terminal || member.coverage == nil || member.coverage.origin != root || member.coverage.generation != work.operationGeneration {
		return true // No actual issuer: keep the registered source pending.
	}
	required := appendEntryLawRequirement(append([]sourceStagedOperationRequest(nil), member.required...), member.coverage.request)
	for _, request := range b.required {
		required = appendEntryLawRequirement(required, request)
	}
	for _, role := range []string{"receiver", "key", "effects", "value"} {
		request := stagedGetResultRequest(operation, facts[caller].node, role, nil)
		recipe := work.operationRecipes[request.producer]
		delta := sourceStagedOperationDelta{}
		switch role {
		case "receiver":
			delta.extracted = true // The original lexical read; no initializer replay.
		case "key":
			delta.extracted, delta.required = keyReady, keyRequired
		case "effects":
			delta.extracted = b.complete && nativeMemberGetChannelsRepresented(&result)
			delta.effects = append(delta.effects, result.environmentEffects...)
			delta.required = append([]sourceStagedOperationRequest{stagedGetResultRequest(operation, facts[caller].node, "receiver", nil), stagedGetResultRequest(operation, facts[caller].node, "key", nil)}, required...)
		case "value":
			delta.extracted = true // Conditional arbitrary runtime DATA, not Get Effects.
			delta.required = append([]sourceStagedOperationRequest{stagedGetResultRequest(operation, facts[caller].node, "effects", nil)}, b.required...)
			delta.exposures = append([]sourceStagedOperationAlternative(nil), b.values...)
		}
		snapshot, description := *recipe.callResult, *recipe.callResult.getResult
		description.represented = true
		snapshot.getResult = &description
		recipe.callResult, recipe.delta = &snapshot, delta
		if !work.attachOperationSource(facts, recipe) {
			return true
		}
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[recipe.key] = work.operationGeneration
	}
	return true
}
