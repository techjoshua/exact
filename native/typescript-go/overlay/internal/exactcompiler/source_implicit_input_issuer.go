package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceImplicitInputBorrow lends an original protocol's already acquired
// receiver and actuals to the existing binder. The protocol owner authenticates
// its selected callable. No synthetic Call, normal frame or body execution is
// introduced, and this acquired vector never survives the synchronous loan.
type sourceImplicitInputBorrow struct {
	issuer     *sourceValueQuery
	owner      *sourceValueOwner
	generation *projectGeneration
	request    sourceRelativeInvocation
	receiver   sourceValue
	actuals    []sourceValue
}

func (q *sourceValueQuery) liveImplicitSourceInputs(declaration, operation *ast.Node, request *sourceRelativeInvocation) bool {
	if q == nil || q.owner == nil || q.implicitSourceInputs == nil {
		return false
	}
	b := q.implicitSourceInputs
	return b.issuer == q && b.owner == q.owner && b.generation == q.owner.generation && q.dependenciesOnly && q.inputs == nil && q.operation == nil && b.request.declaration == declaration && b.request.operation == operation && b.request.use == q.effectUse() && b.request.cut == q.relativeInputCut(operation) && (request == nil || sameSourceRelativeInvocation(*request, b.request))
}

// bindStagedImplicitInputs consumes only an original instanceof protocol's
// selected method and retained operand values. Selection belongs to that
// semantic owner, not these transport checks. Formal/default/rest installation
// and B publication are delegated to the same binder used by explicit Calls.
// Captures are borrowed at their original scope and never reconstructed here.
func (q *sourceValueQuery) bindStagedImplicitInputs(request sourceRelativeInvocation, receiver sourceValue, actuals []sourceValue, scope *acquiredCallableScope, result *accessorCandidates) (*sourceRelativeInputEdge, bool) {
	op := request.operation
	if q == nil || q.owner == nil || q.owner.program == nil || q.owner.generation == nil || result == nil || len(actuals) == 0 || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || op == nil || !ast.IsBinaryExpression(op) || op.AsBinaryExpression().OperatorToken.Kind != ast.KindInstanceOfKeyword || request.declaration == nil || !ast.IsFunctionLike(request.declaration) || request.declaration.Body() == nil || !request.actualsKnown || len(request.actuals) != 1 || request.use != q.effectUse() || request.cut != q.relativeInputCut(op) {
		return nil, false
	}
	binary := op.AsBinaryExpression()
	expectedReceiver := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: binary.Right, producer: op, cut: request.cut}
	expectedActual := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: binary.Left, producer: op, cut: request.cut}
	actual := request.actuals[0]
	if !sameOperationEndpoint(request.receiver, expectedReceiver) || actual.expression != binary.Left || actual.ordinal != 0 || actual.spread || actual.restPosition != 0 || !sameOperationEndpoint(actual.endpoint, expectedActual) || receiver.normal != nil || receiver.acquired != nil {
		return nil, false
	}
	for _, node := range []*ast.Node{op, request.declaration} {
		file := ast.GetSourceFileOfNode(node)
		if file == nil || q.owner.program.GetSourceFile(file.FileName()) != file {
			return nil, false
		}
	}
	for _, value := range actuals {
		if value.normal != nil || value.acquired != nil {
			return nil, false
		}
	}
	b := &sourceImplicitInputBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, request: cloneStagedWriterInvocation(request), receiver: receiver, actuals: append([]sourceValue(nil), actuals...)}
	previous := q.implicitSourceInputs
	q.implicitSourceInputs = b
	defer func() {
		q.implicitSourceInputs = previous
		b.issuer, b.owner, b.generation = nil, nil, nil
		b.request = sourceRelativeInvocation{}
		b.receiver, b.actuals = sourceValue{}, nil
	}()
	edge := &sourceRelativeInputEdge{}
	revoke, installed := q.beginSourceRelativeInputRequest(request, edge)
	if !installed {
		return nil, false
	}
	defer revoke()
	q.withActiveInvocation(op, func() { q.bindInvocationInputsFromObservation(request.declaration, op, nil, scope, nil, result, true) })
	return edge, edge.delivered
}
