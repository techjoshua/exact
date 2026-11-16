package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedArrayPushEffects describes one acquired ordinary-array alternative.
// It describes conditional mutation, not index/length hook coverage or output.
// Argument evaluation and abrupt alternatives remain on the original Call roles.
type sourceStagedArrayPushEffects struct {
	receiver, binding, origin, argument *ast.Node
	cut                                 sourceRelativeCut
}

func cloneArrayPushEffects(p *sourceStagedArrayPushEffects) *sourceStagedArrayPushEffects {
	if p == nil {
		return nil
	}
	copy := *p
	return &copy
}
func sameArrayPushEffects(a, b *sourceStagedArrayPushEffects) bool {
	return a == b || a != nil && b != nil && *a == *b
}
func validArrayPushSource(s *sourceStagedNativeGetSource) bool {
	if s == nil || s.arrayPush == nil || s.kind != sourceNativeArrayPush || s.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(s.method)) || !validStagedMemberParent(s.request) || !ast.IsSetAccessorDeclaration(s.request.consumer) || !ast.IsCallExpression(s.request.use) || s.get != s.request.use.Expression() || !ast.IsPropertyAccessExpression(s.get) {
		return false
	}
	p, call := s.arrayPush, s.request.use.AsCallExpression()
	return call.QuestionDotToken == nil && s.get.AsPropertyAccessExpression().QuestionDotToken == nil && len(restrictedInvocationArguments(call)) == 1 && restrictedInvocationArguments(call)[0] == p.argument && !ast.IsSpreadElement(p.argument) && p.receiver == s.get.Expression() && ast.IsIdentifier(p.receiver) && p.binding != nil && ast.IsVariableDeclaration(p.binding) && p.binding.Parent != nil && ast.IsVariableDeclarationList(p.binding.Parent) && p.binding.Parent.Flags&ast.NodeFlagsConst != 0 && p.binding.Initializer() == p.origin && stagedEmptyArrayDataConstruction(p.origin) && enclosingCallableNode(p.binding) == enclosingCallableNode(s.request.consumer.Parent) && p.cut.operation == s.request.use && p.cut.reading == s.request.use && p.cut.use == nil
}

// The existing native family keeps three independent, deliberately unpaid roles.
// A root/dependency prefix cannot serve as an algorithm, full Get or local ACK.
func validArrayPushRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.nativeGet
	if !validArrayPushSource(s) || recipe.delta.extracted || recipe.key.declaration != s.request.consumer || recipe.key.operation != s.request.use || recipe.key.kind != relativeDemandEffects || operationDeltaSize(recipe.delta) != len(recipe.delta.required) {
		return false
	}
	if s.effectsSource != nil && (recipe.key != s.request.producer || s.effectsSource.generation == nil || !sameOperationRequest(s.effectsSource.request, s.request)) {
		return false
	}
	if recipe.key == s.request.producer {
		return len(recipe.delta.required) == 3 && sameOperationRequest(recipe.delta.required[0], nativeRootDebtRequest(s, "callee-get")) && sameOperationRequest(recipe.delta.required[1], nativeRootDebtRequest(s, "eager-inputs")) && sameOperationRequest(recipe.delta.required[2], nativeRootDebtRequest(s, "algorithm"))
	}
	if recipe.key == nativeRootDebtRequest(s, "callee-get").producer {
		return len(recipe.delta.required) == 0 || len(recipe.delta.required) == 1 && sameOperationRequest(recipe.delta.required[0], stagedGetResultRequest(s.get, s.request.consumer, "effects", nil))
	}
	if recipe.key == nativeRootDebtRequest(s, "eager-inputs").producer && len(recipe.delta.required) == 1 {
		get, known := arrayPushArgumentGet(s)
		r := recipe.delta.required[0]
		return known && get != nil && r.use == get && r.consumer == s.request.consumer && r.producer.selector.field == "get-source:effects" && r.producer.selector.association != nil
	}
	return len(recipe.delta.required) == 0 && (recipe.key == nativeRootDebtRequest(s, "eager-inputs").producer || recipe.key == nativeRootDebtRequest(s, "algorithm").producer)
}

// liveArrayPushPublisher authenticates the actual acquired-Call interval. It
// cannot borrow the earlier Get, a description, or another executable's query.
func (i *sourceStagedNativeEffectsIssuer) liveArrayPushPublisher() bool {
	q, s := i.arrayQuery, i.arraySource
	if q == nil || q.owner == nil || !validArrayPushSource(s) || q.executable != i.owner || q.owner.program != i.owner.values.program || q.owner.checker != i.owner.values.checker || q.owner.generation != i.generation || !q.dependenciesOnly || q.operation != nil || q.inputs != nil || len(q.creators) != 0 || q.effectOwner != i.fact.node || q.normalBindingCall != i.call || !q.active[i.call] || q.reading != i.call || q.dependencyUse != i.call || q.relativeInputCut(i.call) != s.arrayPush.cut || i.arrayEpoch != i.work.operationEpoch || !sameOperationRequest(i.request, s.request) {
		return false
	}
	if i.task.index == 0 {
		return i.work.extracting == i.caller
	}
	parent := i.work.nativeEffectsTaskSource(i.task)
	return parent != nil && parent.request.use == i.call && i.work.liveNativeEffectsExecution(i.task, i.owner, i.fact)
}

// publishArrayPushEffects runs in the original native owner's existing origins
// iteration. It acquires no input again and leaves legacy writes untouched.
func (work *callableEffectWork) publishArrayPushEffects(facts []callableFacts, owner *executableBodyOwner, p *sourcePendingMemberPublisher, q *sourceValueQuery, call *ast.Node, selected sourceValue, receiver *ast.Node, origin sourceValue) {
	if q == nil || q.owner == nil || q.owner.checker == nil || owner == nil || owner.values == nil || q.executable != owner || q.owner.program != owner.values.program || q.owner.checker != owner.values.checker || q.owner.generation != owner.values.generation || q.owner.generation == nil || !q.owner.generation.active || !q.dependenciesOnly || q.operation != nil || q.inputs != nil || len(q.creators) != 0 || q.reading != call || q.dependencyUse != call || q.normalBindingCall != call || !q.active[call] || owner.project == nil || owner.project.activeGeneration != q.owner.generation || p == nil || !p.live || p.fact == nil || !ast.IsSetAccessorDeclaration(p.fact.node) || owner.pendingMemberPublishers[q.effectOwner] != p || p.fact.node != q.effectOwner || selected.native == nil || selected.native.kind != sourceNativeArrayPush || selected.native.acquired != q.reading || len(selected.path) != 0 || receiver == nil || !ast.IsIdentifier(receiver) || len(origin.path) != 0 {
		return
	}
	caller, known := work.memberNodes[p.fact.node]
	if !known || caller < 0 || caller >= len(facts) || &facts[caller] != p.fact {
		return
	}
	if call == nil || !ast.IsCallExpression(call) || len(restrictedInvocationArguments(call.AsCallExpression())) != 1 {
		return
	}
	symbol := q.owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || symbol.ValueDeclaration == nil || q.owner.bindingWritten(symbol) {
		return
	}
	request, owned := stagedNativeInputOccurrenceRequest(p.fact, call)
	if !owned {
		return
	}
	source := &sourceStagedNativeGetSource{request: request, get: call.Expression(), kind: sourceNativeArrayPush, method: selected.node, arrayPush: &sourceStagedArrayPushEffects{receiver: receiver, binding: symbol.ValueDeclaration, origin: origin.node, argument: restrictedInvocationArguments(call.AsCallExpression())[0], cut: q.relativeInputCut(call)}}
	if !validArrayPushSource(source) {
		return
	}
	work.initializeOperationIdentity()
	if work.operationGeneration == nil {
		work.operationGeneration = q.owner.generation
	}
	i := &sourceStagedNativeEffectsIssuer{work: work, owner: owner, fact: p.fact, facts: facts, caller: caller, call: call, request: request, generation: q.owner.generation, active: true, arrayQuery: q, arraySource: source, arrayEpoch: work.operationEpoch}
	if e := work.nativeEffectsExecution; e != nil && work.liveNativeEffectsExecution(e.id, owner, p.fact) {
		i.task = e.id
	}
	i.self = i
	defer func() { i.active = false; i.self = nil; i.arrayQuery = nil }()
	if !i.live() || !work.registerNativeGetSource(facts, source, true) {
		return
	}
	if _, registered := work.registerStagedGetResult(facts, caller, source.get, owner); !registered {
		return
	}
	callee := work.operationRecipes[nativeRootDebtRequest(source, "callee-get").producer]
	callee.delta.required = []sourceStagedOperationRequest{stagedGetResultRequest(source.get, p.fact.node, "effects", nil)}
	if !work.attachOperationSource(facts, callee) {
		return
	}
	root := work.operationRecipes[request.producer]
	copy := *root.nativeGet
	copy.effectsSource = &sourceStagedNativeEffectsRequest{request: request, generation: i.generation, arrayIssuer: i}
	i.arrayReceipt = copy.effectsSource
	root.nativeGet = &copy
	// The acquired prefix is available, not an ordinary collector adoption.
	// Actual protocol and Set read/write consumers require it through their
	// own dependencies; otherwise the original conservative Call stays owned.
	if !work.attachOperationSource(facts, root) {
		return
	}
	i.issued = true
}

// Prefix consumption rechecks graph/source ownership, never algorithm readiness.
// Clones retain the source description and must obtain their own original issue.
func (work *callableEffectWork) arrayPushPrefixCurrent(s *sourceStagedNativeGetSource) bool {
	if !validArrayPushSource(s) || s.effectsSource == nil || s.effectsSource.generation != work.operationGeneration || !sameOperationRequest(s.effectsSource.request, s.request) || work.operationGeneration == nil || !work.operationGeneration.active || work.operationGeneration.project == nil || work.operationGeneration.project.activeGeneration != work.operationGeneration {
		return false
	}
	i := s.effectsSource.arrayIssuer
	return i != nil && i.issued && i.arrayReceipt == s.effectsSource && i.work == work && i.arrayEpoch == work.operationEpoch && i.generation == work.operationGeneration && i.arraySource != nil && sameNativeGetSource(i.arraySource, s) && sameOperationRequest(i.request, s.request) && i.owner != nil && i.owner.values != nil && i.owner.project == work.operationGeneration.project && i.owner.values.generation == i.generation && i.fact != nil && i.caller >= 0 && i.caller < len(i.facts) && &i.facts[i.caller] == i.fact && i.fact.node == s.request.consumer && i.fact.sourceFile != nil && i.owner.values.program.GetSourceFile(i.fact.sourceFile.FileName()) == i.fact.sourceFile
}

// Only demanded original Gets are projected. This bounded argument shape does
// not grant primitive coercion/normal completion; the eager role remains unpaid.
func arrayPushArgumentGet(s *sourceStagedNativeGetSource) (*ast.Node, bool) {
	arg := s.arrayPush.argument
	if ast.IsStringLiteral(arg) {
		return nil, true
	}
	if ast.IsBinaryExpression(arg) && arg.AsBinaryExpression().OperatorToken.Kind == ast.KindPlusToken && ast.IsStringLiteral(arg.AsBinaryExpression().Left) && ast.IsPropertyAccessExpression(arg.AsBinaryExpression().Right) {
		return arg.AsBinaryExpression().Right, true
	}
	return nil, false
}

// reduceSetArrayPush substitutes only the original Set supplier's SOURCE roles.
// Its argument Get is a real required producer, not a returned argument value.
func (work *callableEffectWork) reduceSetArrayPush(facts []callableFacts, root sourceStagedOperationRequest, supplier *sourceStagedSetEffectsSupplier, call *ast.Node, owner *executableBodyOwner) (sourceQualifiedReadWrite, bool) {
	request, known := work.memberProtocolSources[call]
	s := work.operationRecipes[request.producer].nativeGet
	if !known || !work.arrayPushPrefixCurrent(s) || s.request.consumer != supplier.declaration {
		return sourceQualifiedReadWrite{}, false
	}
	a, mapped := setEffectReference(supplier, s.arrayPush.receiver, root, work.operationGeneration)
	if !mapped || a.binding != s.arrayPush.binding {
		return a, false
	}
	a.operation, a.write, a.mutation, a.arrayCall = call, true, "array-mutation", s.request
	a.required = appendEntryLawRequirement(a.required, s.request)
	a.required = appendEntryLawRequirement(a.required, nativeRootDebtRequest(s, "callee-get"))
	a.required = appendEntryLawRequirement(a.required, nativeRootDebtRequest(s, "eager-inputs"))
	arg, supported := arrayPushArgumentGet(s)
	if !supported {
		return a, false
	}
	if arg != nil {
		input, valid := setEffectReference(supplier, arg, root, work.operationGeneration)
		if !valid {
			return a, false
		}
		input.operation, input.read = arg, true
		caller := work.memberNodes[supplier.declaration]
		child, registered := work.registerQualifiedGetEffects(facts, caller, arg, owner, sourceAssignmentEffectsInput{parent: root, access: input})
		if !registered {
			return a, false
		}
		for _, required := range input.required {
			a.required = appendEntryLawRequirement(a.required, required)
		}
		a.required = appendEntryLawRequirement(a.required, child)
		eager := work.operationRecipes[nativeRootDebtRequest(s, "eager-inputs").producer]
		if len(eager.delta.required) != 0 && (len(eager.delta.required) != 1 || !sameOperationRequest(eager.delta.required[0], child)) {
			return a, false
		}
		eager.delta.required = []sourceStagedOperationRequest{child}
		if !work.attachOperationSource(facts, eager) {
			return a, false
		}
	}
	return a, true
}

func validSetArrayPushShape(a sourceQualifiedReadWrite) bool {
	return a.mutation == "array-mutation" && a.write && !a.read && !a.primitive && a.receiver == nil && a.operation != nil && ast.IsCallExpression(a.operation) && ast.IsPropertyAccessExpression(a.operation.Expression()) && a.operation.Expression().Expression() == a.reference && sameOperationEndpoint(a.writtenFrom, sourceRelativeEndpoint{}) && a.arrayCall.use == a.operation && a.arrayCall.consumer == a.declaration && validStagedMemberParent(a.arrayCall)
}

// The consumer independently requires argument mapping, even if its issuer omitted it.
func validSetArrayPushSubstitution(s *sourceStagedSetEffectsSupplier, a sourceQualifiedReadWrite, root sourceStagedOperationRequest) bool {
	if !validSetArrayPushShape(a) {
		return false
	}
	contains := func(r sourceStagedOperationRequest) bool { return operationContainsRequest(a.required, r) }
	source := &sourceStagedNativeGetSource{request: a.arrayCall, get: a.operation.Expression()}
	if !contains(nativeRootDebtRequest(source, "callee-get")) || !contains(nativeRootDebtRequest(source, "eager-inputs")) {
		return false
	}
	actuals := restrictedInvocationArguments(a.operation.AsCallExpression())
	if len(actuals) != 1 {
		return false
	}
	source.arrayPush = &sourceStagedArrayPushEffects{argument: actuals[0]}
	arg, supported := arrayPushArgumentGet(source)
	if !supported {
		return false
	}
	if arg == nil {
		return true
	}
	input, valid := setEffectReference(s, arg, root, a.generation)
	if !valid {
		return false
	}
	input.operation, input.read = arg, true
	for _, required := range input.required {
		if !contains(required) {
			return false
		}
	}
	return contains(qualifiedGetRequest(arg, a.declaration, "effects", sourceAssignmentEffectsInput{parent: root, access: input}))
}

// A semantic Call link cannot replace this graph's genuine original prefix receipt.
func (work *callableEffectWork) arrayPushAccessCurrent(a sourceQualifiedReadWrite) bool {
	s := work.operationRecipes[a.arrayCall.producer].nativeGet
	return validSetArrayPushShape(a) && work.arrayPushPrefixCurrent(s) && sameOperationRequest(a.arrayCall, s.request) && a.reference == s.arrayPush.receiver && a.binding == s.arrayPush.binding
}
