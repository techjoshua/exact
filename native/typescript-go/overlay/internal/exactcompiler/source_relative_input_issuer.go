package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceRelativeInputEdge owns detached binder contributions for one composition
// edge. Delivery is input transfer only. It does not settle invoked obligations,
// complete effects, or publish a normal Call/Get result. Pending is created only
// by the central work owner when it consumes an actual invoked-role demand.
type sourceRelativeInputEdge struct {
	request   sourceRelativeInvocation
	bound     sourceRelativeBoundInputs
	relative  sourceRelativeBoundInputs // authenticated declaration-relative recipes, not acquired runtime values
	delivered bool
}

func (query *sourceValueQuery) relativeInputCut(operation *ast.Node) sourceRelativeCut {
	return sourceRelativeCut{operation: operation, use: query.effectUse(), reading: query.reading, initializing: query.initializing, returning: query.returning, invoking: query.invoking}
}

// beginSourceRelativeInputRequest borrows this original binder occurrence. The
// caller must already own the selected declaration/Call relation. A copied query
// cannot issue through the binder hook, and a saved callback is revoked on exit.
// Nested requests restore the prior issuer and callbacks. The returned edge owns
// source descriptions only, never this lease or any binding/query/frame maps.
func (query *sourceValueQuery) beginSourceRelativeInputRequest(request sourceRelativeInvocation, edge *sourceRelativeInputEdge) (func(), bool) {
	if query == nil || query.owner == nil || query.owner.checker == nil || edge == nil || edge.delivered || request.declaration == nil || !ast.IsFunctionLike(request.declaration) || request.operation == nil || ((request.inputKind != relativeInputInvocation || !ast.IsCallExpression(request.operation)) && !query.liveImplicitSourceInputs(request.declaration, request.operation, &request) && !query.liveInstalledGetterMutationInputs(request, query.relativeInputBinding)) || request.use != query.effectUse() || request.cut != query.relativeInputCut(request.operation) {
		return func() {}, false
	}
	owner, checker, program, generation := query.owner, query.owner.checker, query.owner.program, query.owner.generation
	priorRequest, priorConsumer, priorIssuer := query.relativeInputRequest, query.relativeInputConsumer, query.relativeInputIssuer
	request.actuals = append([]sourceRelativeActual(nil), request.actuals...)
	request.receiver = cloneSourceRelativeEndpoint(request.receiver)
	for index := range request.actuals {
		request.actuals[index].endpoint = cloneSourceRelativeEndpoint(request.actuals[index].endpoint)
	}
	request.captures = append([]sourceRelativeBinding(nil), request.captures...)
	for index := range request.captures {
		request.captures[index] = cloneSourceRelativeBinding(request.captures[index])
	}
	edge.request = request
	live := true
	revoked := false
	query.relativeInputRequest, query.relativeInputIssuer = &request, query
	query.relativeInputConsumer = func(bound sourceRelativeBoundInputs) {
		if !live || query.relativeInputIssuer != query || query.relativeInputRequest != &request || query.owner != owner || owner.checker != checker || owner.program != program || owner.generation != generation || query.relativeInputCut(request.operation) != request.cut || !sameSourceRelativeInputEnvelope(request, bound) {
			return
		}
		edge.bound = cloneSourceRelativeBoundInputs(bound)
		edge.delivered = true
		if inputs := query.relativeInputBinding; inputs != nil {
			// This is still the original binder's publication. Only its detached
			// description travels with the prepared alternative; no lease is retained.
			inputs.installedMemberDescription = query.describeInstalledMemberInput(inputs, edge)
		}
		// One installed request owns one original binder publication. Late
		// contributions belong to registered fact producers, not this callback.
		live = false
	}
	return func() {
		if revoked {
			return
		}
		revoked = true
		live = false
		query.relativeInputRequest, query.relativeInputConsumer, query.relativeInputIssuer = priorRequest, priorConsumer, priorIssuer
	}, true
}

// sameSourceRelativeInputEnvelope validates descriptive target roles as well as
// original observation identity. Unsupported known contributions may be retained,
// but their presence cannot acknowledge the unsupported input domain.
func sameSourceRelativeInputEnvelope(request sourceRelativeInvocation, bound sourceRelativeBoundInputs) bool {
	if request.inputKind > relativeInputSourceGetter || request.inputKind == relativeInputSourceGetter && (!request.actualsKnown || len(request.actuals) != 0) || bound.inputKind != request.inputKind || bound.declaration != request.declaration || bound.operation != request.operation || bound.use != request.use || bound.cut != request.cut {
		return false
	}
	for _, binding := range bound.bindings {
		if binding.target.declaration != request.declaration || binding.target.kind == relativeRoleUnknown {
			return false
		}
	}
	for _, input := range bound.defaults {
		if input.formal.declaration != request.declaration || input.formal.kind != relativeRoleFormal || input.initializer == nil || input.cut != request.cut {
			return false
		}
	}
	for _, input := range bound.rest {
		if input.formal.declaration != request.declaration || input.formal.kind != relativeRoleFormal || input.cut != request.cut {
			return false
		}
	}
	return true
}

func cloneSourceRelativeBoundInputs(bound sourceRelativeBoundInputs) sourceRelativeBoundInputs {
	bound.bindings = append([]sourceRelativeBinding(nil), bound.bindings...)
	for index := range bound.bindings {
		bound.bindings[index] = cloneSourceRelativeBinding(bound.bindings[index])
	}
	bound.defaults = append([]sourceRelativeDefaultInput(nil), bound.defaults...)
	bound.rest = append([]sourceRelativeRestInput(nil), bound.rest...)
	for index := range bound.rest {
		bound.rest[index].slots = append([]sourceRelativeRestSlot(nil), bound.rest[index].slots...)
		for slot := range bound.rest[index].slots {
			bound.rest[index].slots[slot].binding = cloneSourceRelativeBinding(bound.rest[index].slots[slot].binding)
		}
	}
	return bound
}

// mutationGetterInvocation copies a zero-actual Get's SOURCE binding vector.
// It supplies no issuer; the original live Get or input-preparation wrapper
// must separately lend one of the existing synchronous input-owner intervals.
func mutationGetterInvocation(q *sourceValueQuery, inputs *sourceValueInputs, get *sourceGetInputs) (sourceRelativeInvocation, bool) {
	if q == nil || q.owner == nil || inputs == nil || get == nil || inputs.declaration == nil || inputs.invocation != nil || inputs.get == nil || inputs.get.operation != get.operation || inputs.operationLifetime != nil || inputs.storage != nil || inputs.population != nil {
		return sourceRelativeInvocation{}, false
	}
	request := sourceRelativeInvocation{inputKind: relativeInputSourceGetter, declaration: inputs.declaration, operation: get.operation, use: q.effectUse(), cut: q.relativeInputCut(get.operation), actualsKnown: true}
	receiver, gap := describeRelativeBoundValues(inputs.bindings[0], sourceRelativeRole{kind: relativeRoleReceiver, declaration: inputs.declaration}, request.cut)
	if gap != relativeInputsSupported || receiver.unknown || len(receiver.pending) != 0 || len(receiver.sources) != 1 {
		return sourceRelativeInvocation{}, false
	}
	request.receiver = cloneSourceRelativeEndpoint(receiver.sources[0])
	return request, true
}

// publishMutationGetterBindings reuses the one original binder publication
// kernel. The distinct wrappers still authenticate their own Get/late-DATA
// lifetimes; a copied query, missing issuer or changed cut cannot use this
// descriptive reducer to create execution or BODY authority.
func publishMutationGetterBindings(q *sourceValueQuery, inputs *sourceValueInputs, get *sourceGetInputs, request sourceRelativeInvocation) *sourceRelativeInputEdge {
	if q == nil || inputs == nil || get == nil || request.inputKind != relativeInputSourceGetter {
		return nil
	}
	old := q.relativeInputBinding
	q.relativeInputBinding = inputs
	defer func() { q.relativeInputBinding = old }()
	edge := &sourceRelativeInputEdge{}
	revoke, issued := q.beginSourceRelativeInputRequest(request, edge)
	if !issued {
		return nil
	}
	defer revoke()
	bound := describeSourceRelativeGetBoundInputs(q, inputs, request, get)
	if q.relativeInputConsumer != nil {
		q.relativeInputConsumer(bound)
	}
	if !edge.delivered {
		return nil
	}
	edge.relative = cloneSourceRelativeBoundInputs(edge.bound)
	return edge
}
