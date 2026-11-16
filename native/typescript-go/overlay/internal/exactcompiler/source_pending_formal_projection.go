package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceFormalProjection is a required effect input, not a represented value.
// Its issuer is checked synchronously at insertion. Durable records contain only
// source endpoints. Delivery means the original Call published its own effects,
// not that selection, argument evaluation or the Call completed normally.
type sourceFormalProjection struct {
	operation, argument, use *ast.Node
	cuts                     [4]*ast.Node
	formal                   sourceMemberEndpoint
	delivered                bool
}

type sourceFormalProjectionKey struct {
	operation, argument, use *ast.Node
	cuts                     [4]*ast.Node
}

// pendingDescriptorFormal preserves the declaration-relative input independently
// of member ACK. It covers only this argument's refused writer-exposure recovery.
// Callee/Get/eager effects stay on the original Call, and the descriptor's final
// effect disposition must wait for that original producer's publication.
func (r *sourceWriterInputRequest) pendingDescriptorFormal(q *sourceValueQuery, position int, bindings sourceValueBindings, result *accessorCandidates) bool {
	if r == nil || !q.dependenciesOnly || !r.atRecovery(q) || r.member == nil || q.inputs != nil || q.callerInputs != nil || q.installedReceiverCall != nil || q.sourceReceiver != nil || q.invoking != nil || q.operation != nil || q.effectUse() != nil || len(bindings) != 0 || len(q.creators) != 0 || q.returnObservation != nil || q.argumentPrefix != nil || position != 0 || !descriptorFormalReceiverCall(r.call, q.executable) {
		return false
	}
	ticket := r.member
	if ticket.publisher == nil || !ticket.publisher.live || ticket.publisher.fact == nil || ticket.demand == nil || ticket.demand.call != r.call || len(ticket.demand.arguments) != 1 {
		return false
	}
	formal := ticket.demand.arguments[position]
	arguments := restrictedInvocationArguments(r.call.AsCallExpression())
	if len(arguments) != 1 || formal.expression != unwrapSourceCallableReference(arguments[position]) || formal.kind != memberFormal || formal.owner != q.effectOwner || formal.declaration == nil || !ast.IsIdentifier(arguments[position]) {
		return false
	}
	// Recheck the checker-bound declaration at this issuing request. A missing
	// local/capture binding, a written formal or an installed actual is not this
	// relative proof and retains the ordinary recovery path.
	current := memberEndpoint(q, arguments[position], q.effectOwner)
	if current.kind != memberFormal || current.declaration != formal.declaration || current.owner != formal.owner || current.position != formal.position {
		return false
	}
	ledger := ticket.publisher.fact.pendingMembers
	if ledger == nil {
		return false
	}
	key := sourceFormalProjectionKey{operation: r.call, argument: arguments[position], use: r.use, cuts: r.original}
	accepted := false
	for _, row := range ledger.descriptorProjections {
		// This is exactly the receiver-producing source Call of the already
		// required descriptor projection, not a general unknown-call rule.
		if row.owner != q.effectOwner || row.use != r.use || row.receiver.source != r.call || row.settled {
			continue
		}
		if row.formals == nil {
			row.formals = make(map[sourceFormalProjectionKey]*sourceFormalProjection)
		}
		if row.formals[key] == nil {
			// A fixed per-projection bound limits descriptive cut combinations.
			// Overflow leaves recovery with its existing owner.
			if len(row.formals) >= 64 {
				ledger.stats.FormalProjectionOverflow++
				progressPendingMember(q, r, "formal-projection-overflow", position, ledger.stats)
				continue
			}
			row.formals[key] = &sourceFormalProjection{operation: r.call, argument: arguments[position], use: r.use, cuts: r.original, formal: formal, delivered: ledger.formalProducersDone[r.call]}
			if row.formals[key].delivered {
				ledger.stats.FormalProjectionDelivered++
				progressFormalProjectionDelivered()
			}
			ledger.stats.FormalProjectionRegistered++
			ledger.revision++
			progressPendingMember(q, r, "formal-projection-registered", position, ledger.stats)
		} else {
			ledger.stats.FormalProjectionReplay++
			progressPendingMember(q, r, "formal-projection-replay", position, ledger.stats)
		}
		accepted = true
	}
	if !accepted {
		return false
	}
	result.opaque, result.valueIncomplete = true, true
	if result.cause == nil {
		result.cause = arguments[position]
	}
	ledger.stats.FormalProjectionRecoveryRetired++
	progressPendingMember(q, r, "formal-projection-retired", position, ledger.stats)
	return true
}

// finishDescriptorFormalProducer runs only after the original collector's
// existing publication path returns. It publishes no value and replays no query.
func finishDescriptorFormalProducer(fact *callableFacts, operation *ast.Node, owner *executableBodyOwner) {
	if fact == nil || owner == nil || !descriptorFormalReceiverCall(operation, owner) {
		return
	}
	// Publication can precede registration. Retain only that monotone original
	// source event, independently of any subsequent issuer or input frame.
	if fact.pendingMembers == nil {
		fact.pendingMembers = &sourcePendingMemberLedger{sites: make(map[*ast.Node]*sourcePendingMemberDemand)}
	}
	if fact.pendingMembers.formalProducersDone == nil {
		fact.pendingMembers.formalProducersDone = make(map[*ast.Node]bool)
	}
	fact.pendingMembers.formalProducersDone[operation] = true
	for _, row := range fact.pendingMembers.descriptorProjections {
		for _, formal := range row.formals {
			if formal.operation == operation && !formal.delivered {
				formal.delivered = true
				fact.pendingMembers.stats.FormalProjectionDelivered++
				progressFormalProjectionDelivered()
			}
		}
	}
}

func descriptorFormalsDelivered(row *sourceDescriptorProjection) bool {
	for _, formal := range row.formals {
		if !formal.delivered {
			return false
		}
	}
	return true
}

// Syntax bounds this prototype to the observed receiver source. Recognition
// enrolls an effect-publication dependency only. It supplies no native identity,
// freshness, returned value, normal completion or argument invocation rights.
func descriptorFormalReceiverCall(call *ast.Node, owner *executableBodyOwner) bool {
	if call == nil || owner == nil || !ast.IsCallExpression(call) {
		return false
	}
	expression := unwrapSourceCallableReference(call.Expression())
	if expression == nil || !ast.IsPropertyAccessExpression(expression) || expression.AsPropertyAccessExpression().Name().Text() != "create" || !standardLibraryCallRoot(expression, owner.checker) {
		return false
	}
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	return len(arguments) == 1 && ast.IsIdentifier(arguments[0])
}
