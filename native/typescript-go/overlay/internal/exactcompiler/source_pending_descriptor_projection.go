package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceDescriptorProjection is an effect requirement, never a value receipt.
// Records contain source endpoints only. Captures are consumed synchronously by
// the original producer and never enter this ledger or a deferred query.
type sourceDescriptorProjection struct {
	formals                                                           map[sourceFormalProjectionKey]*sourceFormalProjection
	get, call, writer, value, owner, use                              *ast.Node
	cuts                                                              [4]*ast.Node
	receiver, key                                                     sourceMemberEndpoint
	arguments                                                         []sourceMemberEndpoint
	valueSeen, valueDone, writerDone, protocolOwned, blocked, settled bool
}

// sourceDescriptorProducer is borrowed only by the original direct collector.
// The target index is its existing publication index, not captured input state.
// Nested calls restore the previous producer. No token survives collector exit.
type sourceDescriptorProducer struct {
	fact          *callableFacts
	call          *ast.Node
	targets       map[*ast.Node]int
	prior         *sourceDescriptorProducer
	query         *sourceValueQuery
	protocolOwned bool
	originalQuery *sourceValueQuery
}

// descriptorProjectionValue recognizes enrollment syntax only. Actual native
// selection, eager protocols and returned alternatives stay with their owners.
func descriptorProjectionValue(call *ast.Node, c *executableBodyOwner) *ast.Node {
	if call == nil || !ast.IsCallExpression(call) || c == nil || !reflectiveDescriptorCall(call.AsCallExpression(), c.checker) {
		return nil
	}
	args := restrictedInvocationArguments(call.AsCallExpression())
	if len(args) != 3 {
		return nil
	}
	descriptor := unwrapSourceCallableReference(args[2])
	if descriptor == nil || !ast.IsObjectLiteralExpression(descriptor) {
		return nil
	}
	fields := descriptor.AsObjectLiteralExpression().Properties.Nodes
	if len(fields) != 1 || !ast.IsPropertyAssignment(fields[0]) || callableNameText(fields[0].Name()) != "value" {
		return nil
	}
	value := unwrapSourceCallableReference(fields[0].Initializer())
	if !descriptorFreezeProducer(value, c) {
		return nil
	}
	return value
}

// descriptorFreezeProducer bounds enrollment to this projection family. It
// grants neither native selection nor a receipt for the returned object.
func descriptorFreezeProducer(value *ast.Node, c *executableBodyOwner) bool {
	if value == nil || !ast.IsCallExpression(value) || c == nil {
		return false
	}
	fn := unwrapSourceCallableReference(value.Expression())
	if fn == nil || !ast.IsPropertyAccessExpression(fn) {
		return false
	}
	member := fn.AsPropertyAccessExpression()
	if member.Name().Text() != "freeze" || !standardLibraryCallRoot(fn, c.checker) {
		return false
	}
	actuals := restrictedInvocationArguments(value.AsCallExpression())
	return len(actuals) == 1 && ast.IsObjectLiteralExpression(unwrapSourceCallableReference(actuals[0]))
}

// deferDescriptorProjection retires this recovery only while retaining its
// required downstream projection. It does not acknowledge the pending result.
func (q *sourceValueQuery) deferDescriptorProjection(writer *ast.Node, bindings sourceValueBindings, result *accessorCandidates, get *sourceGetInputs) bool {
	if !q.dependenciesOnly || q.executable == nil || q.inputs != nil || q.operation != nil || len(bindings) != 0 || len(q.creators) != 0 || q.returnObservation != nil || q.argumentPrefix != nil || get == nil || get.receiver.native == nil || get.receiver.native.kind != sourceNativeWeakMapSourceInstance {
		return false
	}
	member := q.protectedMember
	if member == nil || member.Parent == nil || !ast.IsCallExpression(member.Parent) || enclosingCallableNode(member) != q.effectOwner || enclosingCallableNode(writer) != q.effectOwner {
		return false
	}
	value := descriptorProjectionValue(writer, q.executable)
	if value == nil {
		return false
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact == nil {
		return false
	}
	if q.executable.descriptorProducersDone[writer] || q.executable.descriptorProducersDone[value] {
		return false
	}
	fact := publisher.fact
	if fact.pendingMembers == nil {
		fact.pendingMembers = &sourcePendingMemberLedger{sites: make(map[*ast.Node]*sourcePendingMemberDemand)}
	}
	ledger := fact.pendingMembers
	if ledger.descriptorProjections == nil {
		ledger.descriptorProjections = make(map[[2]*ast.Node]*sourceDescriptorProjection)
	}
	key := [2]*ast.Node{member, writer}
	row := ledger.descriptorProjections[key]
	cuts := [4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}
	if row != nil && (row.cuts != cuts || row.use != q.effectUse() || row.owner != q.effectOwner) {
		return false
	}
	if row == nil {
		args := restrictedInvocationArguments(writer.AsCallExpression())
		row = &sourceDescriptorProjection{get: member, call: member.Parent, writer: writer, value: value, owner: q.effectOwner, use: q.effectUse(), cuts: cuts, receiver: memberEndpoint(q, args[0], q.effectOwner), key: memberEndpoint(q, args[1], q.effectOwner)}
		for _, arg := range restrictedInvocationArguments(member.Parent.AsCallExpression()) {
			row.arguments = append(row.arguments, memberEndpoint(q, arg, q.effectOwner))
		}
		ledger.descriptorProjections[key] = row
		ledger.revision++
		ledger.stats.DescriptorRequired++
		progressPendingMemberDeclaration(q, member.Parent, "descriptor-required", ledger.stats)
	}
	// Unavailable values remain unavailable. This flag cannot fulfill normal Get,
	// Call, descriptor or replacement outcomes. The work owner must drain the row.
	result.opaque, result.valueIncomplete = true, true
	if result.cause == nil {
		result.cause = member
	}
	ledger.stats.DescriptorRecoveryDeferred++
	progressPendingMemberDeclaration(q, member.Parent, "descriptor-recovery-deferred", ledger.stats)
	return true
}

func beginDescriptorProducer(fact *callableFacts, call *ast.Node, targets map[*ast.Node]int, owner *executableBodyOwner) func() {
	if owner == nil || fact == nil || !descriptorFreezeProducer(call, owner) && descriptorProjectionValue(call, owner) == nil {
		return func() {}
	}
	token := &sourceDescriptorProducer{fact: fact, call: call, targets: targets, prior: owner.descriptorProducer}
	owner.descriptorProducer = token
	return func() {
		if owner.descriptorProducersDone == nil {
			owner.descriptorProducersDone = make(map[*ast.Node]bool)
		}
		owner.descriptorProducersDone[call] = true
		if fact.pendingMembers != nil {
			for _, row := range fact.pendingMembers.descriptorProjections {
				if row.writer == call {
					row.writerDone = true
					row.protocolOwned = token.protocolOwned
					fact.pendingMembers.stats.DescriptorWriterDelivered++
					progressPendingMemberDeclaration(token.originalQuery, call, "descriptor-writer-delivered", fact.pendingMembers.stats)
				}
				if row.value == call {
					row.valueDone = true
					if !row.valueSeen {
						row.blocked = true
					}
					fact.pendingMembers.stats.DescriptorValueDelivered++
					progressPendingMemberDeclaration(token.originalQuery, call, "descriptor-value-delivered", fact.pendingMembers.stats)
				}
			}
		}
		owner.descriptorProducer = token.prior
		token.originalQuery = nil
		token.query = nil
		token.targets = nil
		token.fact = nil
		token.prior = nil
	}
}

func (q *sourceValueQuery) claimDescriptorProducer(call *ast.Node) {
	if q.executable == nil {
		return
	}
	p := q.executable.descriptorProducer
	if p == nil || p.fact == nil || p.call != call || p.fact.node != q.effectOwner || q.reading != call {
		return
	}
	if p.originalQuery == nil {
		p.originalQuery = q
	}
	if q.dependenciesOnly && p.query == nil {
		p.query = q
	}
}

func (q *sourceValueQuery) descriptorProducerAt(call *ast.Node) *sourceDescriptorProducer {
	if q.executable == nil {
		return nil
	}
	p := q.executable.descriptorProducer
	if p == nil || p.query != q || p.call != call || p.fact == nil || p.fact.pendingMembers == nil {
		return nil
	}
	for _, r := range p.fact.pendingMembers.descriptorProjections {
		if r.value == call {
			return p
		}
	}
	return nil
}

// publishDescriptorValue uses the existing creating scope only while it is
// live. The new query consumes a selected callable at the original downstream
// Call. It never repeats that Get or reinstalls its earlier value-acquisition cut.
func (q *sourceValueQuery) publishDescriptorValue(p *sourceDescriptorProducer, value sourceValue, bindings sourceValueBindings) {
	if p == nil {
		return
	}
	part := accessorCandidates{}
	values := []sourceValue{value}
	if value.node != nil && !isWriterInputCallable(value.node) && !ast.IsObjectLiteralExpression(value.node) && !ast.IsArrayLiteralExpression(value.node) && !sourcePrimitiveValue(value.node) {
		acquired := q.accessors(value.node, value.path, "", accessorAcquire, bindings, nil)
		mergeAccessorCandidates(&part, candidatePublisherPayload(acquired))
		values = acquired.values
		for i := range values {
			if scope, ok := acquired.callableScopes[i]; ok {
				values[i].capture = &scope
			}
		}
	}
	for _, row := range p.fact.pendingMembers.descriptorProjections {
		if row.value != p.call {
			continue
		}
		if len(values) == 0 {
			row.blocked = true
		}
		for _, v := range values {
			if v.node == nil && !v.undefined {
				part.opaque = true
				continueUnknown := len(values) > 1
				if !continueUnknown {
					row.blocked = true
				}
				continue
			}
			if v.undefined || ast.IsObjectLiteralExpression(v.node) || ast.IsArrayLiteralExpression(v.node) || sourcePrimitiveValue(v.node) {
				row.valueSeen = true
				continue
			}
			if !isWriterInputCallable(v.node) || len(v.path) != 0 {
				row.blocked = true
				continue
			}
			scope := q.acquireCallableScope(bindings, &part)
			if v.capture != nil {
				scope = q.copyCallableScope(*v.capture, &part)
			}
			consumer := newSourceDependencyQuery(row.call, q.owner.checker, q.executable, row.owner)
			consumer.reading, consumer.initializing, consumer.returning, consumer.invoking = row.cuts[0], row.cuts[1], row.cuts[2], row.cuts[3]
			consumer.dependencyUse = row.use
			consumer.invokeAcquired(v.node, row.call, nil, scope, &part, false, sourceInvocationConsumer{body: func(body *ast.Node, bound sourceValueBindings, inputs *sourceValueInputs, invocation *ast.Node, out *accessorCandidates) {
				consumer.consumeOrdinaryBody(row.call, body, bound, inputs, invocation, out)
			}, resolver: consumer.invokePromiseResolver}, nil, nil, v.acquired)
			consumer.publishDependencyStatistics()
			row.valueSeen = true
		}
	}
	appendOpaqueAccessorEffect(p.fact, part)
	appendSourceValueWrites(p.fact, part, q.owner.checker)
	appendAccessorTargets(p.fact, p.call, part, p.targets, p.fact.sourceFile)
}

// drainDescriptorProjections is part of the existing effect work owner, before
// SCC/summary propagation and artifact qualification. Required unresolved rows
// remain explicit unknowns. Settlement is effects-only, never value selection.
func drainDescriptorProjections(facts []callableFacts) {
	for i := range facts {
		f := &facts[i]
		if f.pendingMembers == nil {
			continue
		}
		for _, r := range f.pendingMembers.descriptorProjections {
			if r.valueDone && r.writerDone && r.protocolOwned && r.valueSeen && !r.blocked && descriptorFormalsDelivered(r) {
				r.settled = true
				f.pendingMembers.stats.DescriptorSettled++
				progressDescriptorDisposition(true)
				continue
			}
			appendOpaqueAccessorEffect(f, accessorCandidates{opaque: true, cause: r.get})
			f.pendingMembers.stats.DescriptorUnresolved++
			progressDescriptorDisposition(false)
		}
	}
}

// publishDescriptorNormalResults reads the original normal producer's retained
// output alternatives while their creating observations still belong to it.
// No normal receipt, observation or capture map is put in the pending ledger.
func (q *sourceValueQuery) publishDescriptorNormalResults(call *ast.Node, result *accessorCandidates) {
	if q.dependenciesOnly || q.executable == nil {
		return
	}
	p := q.executable.descriptorProducer
	if p == nil || p.originalQuery != q || p.call != call || p.fact == nil || p.fact.pendingMembers == nil {
		return
	}
	needed := false
	for _, r := range p.fact.pendingMembers.descriptorProjections {
		needed = needed || r.value == call
	}
	if !needed {
		return
	}
	for _, receipt := range result.normalCalls {
		if receipt.operation != call {
			continue
		}
		for _, observed := range receipt.raw.values {
			value := observed.value
			value.capture = &observed.scope
			value.acquired = &observed
			q.publishDescriptorValue(p, value, observed.scope.bindings)
		}
	}
}
