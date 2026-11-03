package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceSetterInputRequest borrows the original plain assignment's caller
// mapping during canonical setter selection. Nested selections replace this
// request rather than inheriting its input. It grants no normal output, performed
// write, descriptor identity or completed invocation authority.
type sourceSetterInputRequest struct {
	operation, target, right *ast.Node
	caller                   acquiredCallableScope
}

// sourceSetterRequest admits only authored plain assignment references. Other
// write protocols keep their existing residual path and cannot borrow its RHS.
func (q *sourceValueQuery) sourceSetterRequest(target *ast.Node, mode accessorTraversal, bindings sourceValueBindings) *sourceSetterInputRequest {
	if !q.dependenciesOnly || mode&accessorSet == 0 || mode == accessorSetAcquire || target == nil || target.Parent == nil || !ast.IsBinaryExpression(target.Parent) {
		return nil
	}
	assignment := target.Parent.AsBinaryExpression()
	if assignment.Left != target || assignment.OperatorToken.Kind != ast.KindEqualsToken {
		return nil
	}
	part := accessorCandidates{}
	scope := q.acquireCallableScope(bindings, &part)
	// Scope copying must not discard uncertainty while preparing an input.
	if part.opaque || part.valueIncomplete || part.receiverIncomplete {
		return nil
	}
	return &sourceSetterInputRequest{operation: target.Parent, target: target, right: assignment.Right, caller: scope}
}

// consumeSourceSetter installs the already selected receiver and captures before
// consuming source demands. RHS provenance uses the original caller's mapping
// and source phase. It never looks up the receiver or selects a setter again.
// Missing RHS alternatives stay unknown alongside every represented alternative.
func (q *sourceValueQuery) consumeSourceSetter(body *ast.Node, receiver sourceValue, captures sourceValueBindings, result *accessorCandidates) bool {
	request := q.setterInput
	if !q.dependenciesOnly || request == nil || request.target != q.protectedMember || !ast.IsSetAccessorDeclaration(body) {
		return false
	}
	// A nested Get during RHS acquisition cannot consume this assignment's input.
	q.setterInput = nil
	defer func() { q.setterInput = request }()
	previousCreators := q.creators
	q.creators = request.caller.creators
	part := accessorCandidates{}
	values := q.originsAt(request.right, request.right, request.caller.bindings, &part)
	for i := range values {
		if values[i].capture == nil {
			scope := request.caller
			values[i].capture = &scope
		}
	}
	q.creators = previousCreators
	incomplete := part.opaque || part.valueIncomplete || part.receiverIncomplete || len(values) == 0
	mergeAccessorCandidates(result, part)
	if incomplete {
		values = append(values, sourceValue{})
	}
	inputs := &sourceValueInputs{declaration: body, bindings: make(sourceValueBindings, len(captures)+2), defaults: make(map[*ast.Node]sourceDefaultInput)}
	for id, terms := range captures {
		inputs.bindings[id] = terms
	}
	inputs.bindings[0] = []sourceValue{receiver}
	for _, parameter := range body.Parameters() {
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		q.installParameterInput(parameter, values, inputs, result)
	}
	q.consumeSourceBodyEffects(request.operation, body, inputs.bindings, inputs, nil, result)
	return true
}
