package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedWriterMethodReceiver lends the already selected Get receiver to
// its original Call binder. It is never stored in a graph or used as normal
// object identity. Arguments still belong to that Call's input owner.
type sourceStagedWriterMethodReceiver struct {
	issuer                        *sourceValueQuery
	call, declaration, expression *ast.Node
	receiver                      sourceValue
}

// bindStagedWriterMethodInputs is called only while the original Get owns a
// projected callable and its acquired source scope. It lends the original
// receiver and reader context to the Call binder. Neither is reconstructed from
// endpoint metadata or retained after the source publication returns.
func (q *sourceValueQuery) bindStagedWriterMethodInputs(alternative sourceStagedOperationAlternative, caller *ast.Node) (*sourceRelativeInputEdge, bool) {
	borrow := q.stagedWriter
	if borrow == nil || borrow.current == nil || borrow.currentProjection == nil || !borrow.publishing || !q.liveStagedWriterSource(borrow, borrow.read) || borrow.get == nil || borrow.methodReceiver != nil {
		return nil, false
	}
	call := caller
	body := alternative.endpoint.expression
	if call == nil || !ast.IsCallExpression(call) || !ast.IsPropertyAccessExpression(call.Expression()) || call.AsCallExpression().QuestionDotToken != nil || body == nil || !ast.IsFunctionLike(body) || body.Body() == nil || len(alternative.endpoint.projection) != 0 {
		return nil, false
	}
	var scope acquiredCallableScope
	found := false
	for _, original := range borrow.projectedScopes {
		if sameOperationAlternative(original.alternative, alternative) {
			scope = original.scope
			found = true
			break
		}
	}
	if !found {
		return nil, false
	}
	previousCreators := q.creators
	q.creators = borrow.read.scope.creators
	defer func() { q.creators = previousCreators }()
	receiver, _ := accessorReceiver(call.Expression())
	method := &sourceStagedWriterMethodReceiver{issuer: q, call: call, declaration: body, expression: receiver, receiver: borrow.get.receiver}
	borrow.methodReceiver = method
	defer func() {
		if borrow.methodReceiver == method {
			borrow.methodReceiver = nil
		}
	}()
	request := sourceRelativeInvocation{declaration: body, operation: call, use: q.effectUse(), cut: q.relativeInputCut(call), actualsKnown: true}
	request.receiver = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: receiver, producer: call, get: call.Expression(), cut: request.cut}
	if ast.IsArrowFunction(body) {
		request.receiver = sourceRelativeEndpoint{kind: relativeEndpointRole, role: sourceRelativeRole{kind: relativeRoleReceiver, declaration: enclosingCallableNode(body.Parent), lexical: true}, producer: call, cut: request.cut}
	}
	for ordinal, actual := range restrictedInvocationArguments(call.AsCallExpression()) {
		if ast.IsSpreadElement(actual) {
			request.actualsKnown = false
		}
		request.actuals = append(request.actuals, sourceRelativeActual{expression: actual, ordinal: ordinal, spread: ast.IsSpreadElement(actual), endpoint: sourceStagedArgumentEndpoint(actual, call, q.effectOwner, q.owner)})
	}
	for _, actual := range request.actuals {
		if actual.spread || actual.endpoint.kind == relativeEndpointResult {
			return nil, false
		}
	}
	edge := &sourceRelativeInputEdge{}
	revoke, installed := q.beginSourceRelativeInputRequest(request, edge)
	if !installed {
		return nil, false
	}
	defer revoke()
	part := accessorCandidates{}
	q.withActiveInvocation(call, func() {
		q.bindInvocationInputsFromObservation(body, call, borrow.read.scope.bindings, &scope, nil, &part, true)
	})
	if !edge.delivered || !sameSourceRelativeInputEnvelope(edge.request, edge.bound) {
		return nil, false
	}
	plan := planSourceRelativeInputs(request, q.owner)
	edge.relative = cloneSourceRelativeBoundInputs(edge.bound)
	edge.relative.bindings, edge.relative.unsupported = plan.bindings, plan.unsupported
	return edge, true
}
