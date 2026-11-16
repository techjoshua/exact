package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceBoundComponentProtocol is one synchronous conditional DEFAULT source
// contribution. It owns no value, selected Get, BODY or graph-current receipt.
// Ordinary member population still owns every authored alternative and debt.
type sourceBoundComponentProtocol struct {
	assignmentSources *sourceComponentAssignmentScope // Query-local MAY supplier only, independently issued from DEFAULT.

	issuer                                     *sourceValueQuery
	inputs                                     *sourceValueInputs
	publisher                                  *sourcePendingMemberPublisher
	writerInputs                               *sourceWriterInputGraph
	generation                                 *projectGeneration
	receiver, member, call, token, tokenOrigin *ast.Node
	implicitReading                            bool
	tokenSymbol                                *ast.Symbol
	cut                                        sourceRelativeCut
	read                                       *sourceMemberWriterReadCut
}

func (s *sourceBoundComponentProtocol) live(q *sourceValueQuery) bool {
	if s == nil || q == nil || s.issuer != q || q.installedMemberIssuer != q || s.publisher == nil || s.publisher.fact == nil || q.componentContextSource != s || q.owner == nil || q.executable == nil || q.inputs != s.inputs || !q.active[s.inputs.declaration] || (q.protectedMember != s.member && !(s.implicitReading && q.protectedMember == nil && q.stagedMember == nil && q.installedMemberPhase == nil)) || q.effectOwner != s.publisher.fact.node || q.owner.generation != s.generation || q.executable.pendingMemberPublishers[q.effectOwner] != s.publisher || q.executable.writerInputFacts[q.effectOwner] != s.writerInputs || s.publisher.fact.writerInputs != s.writerInputs || !s.publisher.live {
		return false
	}
	g := s.generation
	if g == nil || !g.active || g.project == nil || g.project.abandoned || g.project.activeGeneration != g || g.program != q.owner.program || g.checker != q.owner.checker || q.executable.values == nil || q.executable.values.generation != g || q.executable.values.program != q.owner.program || q.executable.checker != g.checker {
		return false
	}
	actual := q.relativeInputCut(s.member)
	if actual == s.cut {
		return true
	}
	// Only this original reader's mechanical projection is also permitted.
	// Its semantic cut stays distinct and is never rewritten in a descriptor.
	if s.read == nil {
		return false
	}
	physical := s.cut
	physical.reading, physical.returning = s.read.use, nil
	return actual == physical
}

// boundComponentContextSource authenticates the original formal substitution,
// component definition and live collector. Type matching describes a conditional
// framework default arm; it never selects that arm over an authored override.
func (q *sourceValueQuery) boundComponentContextSource(receiver, member *ast.Node, bindings sourceValueBindings, read *sourceMemberWriterReadCut) *sourceBoundComponentProtocol {
	if q == nil || q.installedMemberIssuer != q || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || receiver == nil || receiver.Kind != ast.KindThisKeyword || q.owner == nil || q.executable == nil || q.inputs == nil || q.inputs.declaration == nil || !q.active[q.inputs.declaration] || q.inputs.invocation == nil || q.inputs.invocation != q.invoking || q.inputs.operationLifetime != nil || q.inputs.storage != nil || q.inputs.deferredBody || member == nil || member != q.protectedMember || !ast.IsPropertyAccessExpression(member) || member.Name().Text() != "hasContext" || enclosingCallableNode(member) != q.inputs.declaration {
		return nil
	}
	formal := member.Expression()
	if !ast.IsIdentifier(formal) {
		return nil
	}
	symbol := q.owner.checker.GetSymbolAtLocation(formal)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsParameterDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != q.inputs.declaration || q.owner.bindingWritten(symbol) {
		return nil
	}
	actual := bindings[ast.GetSymbolId(symbol)]
	if len(actual) != 1 || actual[0].node != receiver || len(actual[0].path) != 0 || !inventorySourceValue(actual[0]) {
		return nil
	}
	if _, component := q.owner.components[q.effectOwner]; !component || !componentOwnsReceiver(receiver, componentStateReceiverScopes(q.effectOwner, q.owner.checker)) {
		return nil
	}
	method := conditionalComponentContextMethod(member, receiver, q.owner.checker)
	call := normalCalleeGetOwner(member)
	if method == nil || call == nil || !ast.IsCallExpression(call) || call.Expression() != member || call.AsCallExpression().QuestionDotToken != nil {
		return nil
	}
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	if len(arguments) != 1 {
		return nil
	}
	tokenSymbol := q.componentContextTokenSource(arguments[0], method)
	if tokenSymbol == nil {
		return nil
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	g := q.owner.generation
	if publisher == nil || !publisher.live || publisher.fact == nil || publisher.fact.node != q.effectOwner || publisher.fact.writerInputs == nil || q.executable.writerInputFacts[q.effectOwner] != publisher.fact.writerInputs || g == nil || !g.active || g.project == nil || g.project.abandoned || g.project.activeGeneration != g || q.executable.values == nil || q.executable.values.generation != g || q.executable.values.program != q.owner.program || g.program != q.owner.program || g.checker != q.owner.checker || q.executable.checker != g.checker {
		return nil
	}
	for _, node := range []*ast.Node{q.inputs.declaration, q.inputs.invocation} {
		file := ast.GetSourceFileOfNode(node)
		if file == nil || g.program.GetSourceFile(file.FileName()) != file {
			return nil
		}
	}
	file := ast.GetSourceFileOfNode(q.effectOwner)
	if file == nil || publisher.fact.sourceFile != file || g.program.GetSourceFile(file.FileName()) != file {
		return nil
	}
	return &sourceBoundComponentProtocol{issuer: q, inputs: q.inputs, publisher: publisher, writerInputs: publisher.fact.writerInputs, generation: g, receiver: receiver, member: member, call: call, token: arguments[0], tokenOrigin: tokenSymbol.ValueDeclaration.Initializer(), tokenSymbol: tokenSymbol, cut: q.relativeInputCut(member), read: read}
}

// componentContextTokenSource establishes only the original framework-token
// association. Private const and readonly do not prove inert token fields:
// the primitive separately consumes ordinary token-field source obligations.
func (q *sourceValueQuery) componentContextTokenSource(token *ast.Node, method *ast.Symbol) *ast.Symbol {
	if token == nil || !ast.IsIdentifier(token) {
		return nil
	}
	symbol := q.owner.checker.GetSymbolAtLocation(token)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || q.owner.bindingWritten(symbol) {
		return nil
	}
	declaration := symbol.ValueDeclaration
	if declaration.Parent == nil || !ast.IsVariableDeclarationList(declaration.Parent) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
		return nil
	}
	initial := declaration.Initializer()
	if initial == nil || !ast.IsCallExpression(initial) {
		return nil
	}
	factory := resolvedCallableSymbol(callTargetSymbol(initial.Expression(), q.owner.checker), q.owner.checker)
	if factory == nil || factory.Name != "createContext" || len(factory.Declarations) == 0 {
		return nil
	}
	for _, source := range factory.Declarations {
		if componentContextPackage(source) == "" || componentContextPackage(source) != componentContextPackage(method.Declarations[0]) {
			return nil
		}
	}
	index := q.owner.index(ast.GetSourceFileOfNode(declaration))
	if index.incomplete {
		return nil
	}

	return symbol
}

// readBoundComponentProtocol composes one conditional primitive contribution with
// the ordinary source population. Authored methods keep their actual Call/BODY
// consumer; getters, replacements and pending source requirements are not paid
// by the default arm. No callable value or boolean result is manufactured.
func (q *sourceValueQuery) readBoundComponentProtocol(receiver *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(sourceValue), supplied *sourceGetInputs, read *sourceMemberWriterReadCut) bool {
	if q == nil || mode != accessorRead || supplied != nil || result == nil {
		return false
	}
	if len(projection) == 1 && name == "" {
		name = projection[0]
	} else if len(projection) != 0 {
		return false
	}
	if name != "hasContext" {
		return false
	}
	if previous := q.componentContextSource; previous != nil && previous.issuer == q && previous.inputs == q.inputs && previous.member == q.protectedMember {
		// This is the same original lookup, not another source contribution.
		return false
	}
	member := q.protectedMember
	source := q.boundComponentContextSource(receiver, member, bindings, read)
	if source == nil {
		if !q.pendingBoundComponentContextRead(receiver, member, bindings) {
			return false
		}
		// Failed primitive admission does not suppress ordinary suppliers.
		// This scoped population sentinel has no publisher: live always refuses
		// it, so it fences only recursive lookup and grants no default SOURCE.
		previous := q.componentContextSource
		population := sourceBoundComponentProtocol{issuer: q, inputs: q.inputs, member: member}
		q.componentContextSource = &population
		defer func() {
			q.componentContextSource = previous
			population = sourceBoundComponentProtocol{}
		}()
		q.populateBoundComponentContextSources(receiver, member, normalCalleeGetOwner(member), name, bindings, result, visit, read)
		result.fieldReceiverIncomplete = true
		return true
	}
	previous := q.componentContextSource
	q.componentContextSource = source
	defer func() {
		if q.componentContextSource == source {
			q.componentContextSource = previous
		}
		source.issuer, source.inputs, source.publisher, source.writerInputs, source.tokenSymbol = nil, nil, nil, nil, nil
	}()
	q.populateBoundComponentContextSources(receiver, source.member, source.call, name, bindings, result, visit, read)
	// The default method's implicit token read is a separate semantic child.
	// It cannot inherit the outer physical Get or be discharged by its nominal
	// context-map write footprint.
	q.consumeComponentContextRead(source, source.tokenOrigin, "id", bindings, result)
	// These are the current instance reads of the established framework
	// primitive, including its lazy context-token backing field. Parent-context
	// traversal remains the existing framework context model, not heap analysis.
	for _, key := range [...]string{"contextTokens", "contextTokensValue", "ambientContexts", "parent"} {
		q.consumeComponentContextRead(source, source.receiver, key, bindings, result)
	}
	if source.live(q) {
		result.sourceOwned = true
	}
	return true
}

// populateBoundComponentContextSources retains ordinary suppliers for both
// admitted and pending DEFAULT contributions. Its actual member/Call syntax is
// descriptive SOURCE input, never a selected/normal Get or execution receipt.
// Only real authored bodies receive the existing original source-body consumer.
func (q *sourceValueQuery) populateBoundComponentContextSources(receiver, member, call *ast.Node, name string, bindings sourceValueBindings, result *accessorCandidates, visit func(sourceValue), read *sourceMemberWriterReadCut) {
	revokeAssignments := q.beginComponentAssignmentSources(receiver, member, call, bindings, result, read)
	defer revokeAssignments()
	get := &sourceGetInputs{operation: member, receiver: sourceValue{node: receiver}, propertyKey: name}
	// Reachable visits the original terminal RHS and its captures as MAY SOURCE.
	// Read-only inventory omits that supplier; this grants no selected Get,
	// performed write, replacement, normal result or BODY/current/APPLIED loan.
	q.memberValuesAtGet(receiver, nil, name, accessorRead|accessorReachable, bindings, result, func(value sourceValue) {
		visit(value)
		if call == nil || !ast.IsCallExpression(call) || value.node == nil || len(value.path) != 0 || !ast.IsFunctionLike(value.node) || value.node.Body() == nil {
			result.opaque = true
			return
		}
		scope := acquiredCallableScope{}
		if value.capture != nil {
			scope = *value.capture
		}
		q.invokeAcquired(value.node, call, bindings, scope, result, true, sourceInvocationConsumer{body: func(body *ast.Node, captures sourceValueBindings, inputs *sourceValueInputs, invocation *ast.Node, out *accessorCandidates) {
			q.consumeOrdinaryBody(call, body, captures, inputs, invocation, out)
			q.receiverInterferenceAtInputs(body, call, sourceValue{node: receiver, path: []string{name}}, captures, out, make(map[*ast.Node]bool), inputs)
		}}, nil, nil)
	}, sourceMemberOperationProof{}, get, read)
}

// componentContextWriteSource consumes only the nominal DEFAULT invocation's
// disjoint write component. The enclosing original population independently
// retains authored bodies, getters, unknown alternatives and required delivery.
// Context bookkeeping is not whole receiver NoWrites, nor a currentness proof.
func (q *sourceValueQuery) componentContextWriteSource(call, origin *ast.Node, projection []string, name string) bool {
	s := q.componentContextSource
	if !s.live(q) || call != s.call {
		return false
	}
	if len(projection) == 1 && name == "" {
		name = projection[0]
	} else if len(projection) != 0 {
		return false
	}
	return !s.implicitReading && origin == s.receiver && name == "hasContext"
}

// pendingBoundComponentContextRead names only the unresolved canonical branch.
// In particular an ordinary sibling's sourceOwned bit cannot pay this branch.
func (q *sourceValueQuery) pendingBoundComponentContextRead(receiver, member *ast.Node, bindings sourceValueBindings) bool {
	if !q.dependenciesOnly || q.owner == nil || q.inputs == nil || receiver == nil || receiver.Kind != ast.KindThisKeyword || member == nil || !ast.IsPropertyAccessExpression(member) || member.Name().Text() != "hasContext" || enclosingCallableNode(member) != q.inputs.declaration || !ast.IsIdentifier(member.Expression()) {
		return false
	}
	if _, canonical := q.owner.components[q.effectOwner]; !canonical || !componentOwnsReceiver(receiver, componentStateReceiverScopes(q.effectOwner, q.owner.checker)) {
		return false
	}
	formal := q.owner.checker.GetSymbolAtLocation(member.Expression())
	if formal == nil || formal.ValueDeclaration == nil || !ast.IsParameterDeclaration(formal.ValueDeclaration) || enclosingCallableNode(formal.ValueDeclaration) != q.inputs.declaration {
		return false
	}
	for _, actual := range bindings[ast.GetSymbolId(formal)] {
		if actual.node == receiver && len(actual.path) == 0 {
			return true
		}
	}
	return false
}

// consumeComponentContextRead retains each implicit field's ordinary MAY-source
// children. A semantic role has no synthetic property AST, physical Get, selected
// observation or outer installed loan. The current parent/input acquisition is
// fenced only against its own recursive writer-candidate entry; other indexed
// calls, assignments, getters and unknown alternatives remain mandatory.
func (q *sourceValueQuery) consumeComponentContextRead(s *sourceBoundComponentProtocol, origin *ast.Node, key string, bindings sourceValueBindings, result *accessorCandidates) {
	if !s.live(q) {
		result.fieldReceiverIncomplete = true
		return
	}
	part := accessorCandidates{}
	func() {
		member, native, phase := q.stagedMember, q.stagedNativeGet, q.installedMemberPhase
		protected, installedGet, installedCall := q.protectedMember, q.installedGetBody, q.installedCallBody
		effects := q.sourceEffects
		q.stagedMember, q.stagedNativeGet, q.installedMemberPhase = nil, nil, nil
		q.protectedMember, q.installedGetBody, q.installedCallBody = nil, nil, nil
		q.sourceEffects = sourceEffectsObserver{}
		s.implicitReading = true
		defer func() {
			s.implicitReading = false
			q.sourceEffects = effects
			q.protectedMember, q.installedGetBody, q.installedCallBody = protected, installedGet, installedCall
			q.stagedMember, q.stagedNativeGet, q.installedMemberPhase = member, native, phase
		}()
		q.withPendingWriterInput(s.inputs.invocation, &part, func() {
			q.withPendingWriterInput(s.call, &part, func() {
				q.memberValuesAtGet(origin, nil, key, accessorRead, bindings, &part, func(sourceValue) {}, sourceMemberOperationProof{}, nil, s.read)
			})
		})
	}()
	// The framework model describes its own initial fields; this inventory asks
	// only about authored work and unresolved source children, never field values,
	// absence or purity. Exported/unknown token aliases retain external-writer debt.
	closed := !part.opaque && !part.receiverIncomplete && !part.fieldReceiverIncomplete && !part.valueIncomplete && !part.thenIncomplete && len(part.installedMemberPending) == 0 && len(part.installedMemberReadings) == 0 && len(part.installedCallSelections) == 0 && len(part.standardMemberTransfers) == 0
	if origin == s.tokenOrigin {
		index := q.owner.index(ast.GetSourceFileOfNode(origin))
		closed = closed && s.tokenSymbol != nil && !index.incomplete && !index.normalDynamicScope && !index.normalExportUnknown && !index.normalExported[ast.GetSymbolId(s.tokenSymbol)]
	}
	mergeAccessorCandidates(result, part)
	if !closed {
		result.fieldReceiverIncomplete = true
	}
}
