package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceSetterInputRequest borrows the original plain assignment's caller
// mapping during canonical setter selection. Nested selections replace this
// request rather than inheriting its input. It grants no normal output, performed
// write, descriptor identity or completed invocation authority.
type sourceSetterInputRequest struct {
	assignment               *sourceStagedAssignmentBorrow // Exact synchronous original Set observer, never cached.
	operation, target, right *ast.Node
	caller                   acquiredCallableScope
	// writer requests source input mappings only, never body execution.
	writer *ast.Node
	scopes []acquiredCallableScope
}

// sourceSetterRequest admits only authored plain assignment references. Other
// write protocols keep their existing residual path and cannot borrow its RHS.
func (q *sourceValueQuery) sourceSetterRequest(target *ast.Node, mode accessorTraversal, bindings sourceValueBindings) *sourceSetterInputRequest {
	if !q.dependenciesOnly || mode&accessorSet == 0 || target == nil || target.Parent == nil || !ast.IsBinaryExpression(target.Parent) {
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
func (q *sourceValueQuery) consumeSourceSetter(body, effectOperation *ast.Node, receiver sourceValue, captures sourceValueBindings, result *accessorCandidates) bool {
	request := q.setterInput
	if !q.dependenciesOnly || request == nil || request.target != q.protectedMember || !ast.IsSetAccessorDeclaration(body) {
		return false
	}
	inputs := q.bindSourceSetterInputs(request, body, receiver, captures, result)

	q.withSourceReceiverInputs(request.operation, body, inputs, result, func() {
		q.consumeSourceBodyEffects(effectOperation, body, inputs.bindings, inputs, nil, result)
	})
	return true
}

// bindSourceSetterInputs shares the assignment's whole RHS and formal binding
// across effect consumption and captured-writer inspection. It does not consume
// the setter body or establish that the assignment completed.
func (q *sourceValueQuery) bindSourceSetterInputs(request *sourceSetterInputRequest, body *ast.Node, receiver sourceValue, captures sourceValueBindings, result *accessorCandidates) *sourceValueInputs {
	// A nested Get during RHS acquisition cannot consume this assignment's input.
	staged := q.liveStagedAssignment()
	q.setterInput = nil
	defer func() { q.setterInput = request }()
	part := accessorCandidates{}
	var values []sourceValue
	if staged != nil && staged.request == request {
		values = append(values, staged.rhs...)
		if !staged.rhsKnown {
			part.valueIncomplete = true
		}
	} else {
		func() {
			previousCreators := q.creators
			q.creators = request.caller.creators
			defer func() { q.creators = previousCreators }()
			values = q.originsAt(request.right, request.right, request.caller.bindings, &part)
		}()
	}
	for i := range values {
		if staged != nil && sourcePrimitiveValue(values[i].node) {
			continue // Primitive DATA needs no captured creating association.
		}
		if values[i].capture == nil {
			scope := request.caller
			values[i].capture = &scope
		}
	}
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
	return inputs
}

// retainSourceSetterWriterInputs publishes the mapping only for an already
// selected conditional setter at this original assignment. The caller retains
// all other candidates and uncertainty. No body/output driver is entered.
func (q *sourceValueQuery) retainSourceSetterWriterInputs(body *ast.Node, receiver sourceValue, captures sourceValueBindings, result *accessorCandidates) {
	request := q.setterInput
	if !q.dependenciesOnly || request == nil || request.writer != body || request.target != q.protectedMember {
		return
	}
	inputs := q.bindSourceSetterInputs(request, body, receiver, captures, result)
	request.scopes = append(request.scopes, q.acquireCallableScope(inputs.bindings, result))
}
