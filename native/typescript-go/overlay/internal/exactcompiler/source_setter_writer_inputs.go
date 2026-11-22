package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceSetterBindingWrites joins an indexed lexical write with source inputs
// from conditional setter selections. The original member assignment supplies
// caller/RHS provenance. Every contribution remains a MAY replacement, so neither
// this association nor source ordering can remove the original binding value.
func (q *sourceValueQuery) sourceSetterBindingWrites(write sourceValueAssignment, writer, boundary *ast.Node, bindings sourceValueBindings, result *accessorCandidates) []sourceValueReplacement {
	if !q.dependenciesOnly || writer == nil || !ast.IsSetAccessorDeclaration(writer) || writer.Parent == nil {
		return nil
	}
	index := q.owner.index(ast.GetSourceFileOfNode(writer))
	assignments := append(append([]sourceValueAssignment{}, index.memberOrigins[writer.Parent]...), index.dynamicMembers...)
	var replacements []sourceValueReplacement
	for _, assignment := range assignments {
		if assignment.left == nil || assignment.right == nil || assignment.left.Parent == nil {
			continue
		}
		caller := enclosingCallableNode(assignment.left)
		if caller != nil && caller != enclosingCallableNode(writer.Parent) && q.creators[caller].invocation == nil {
			continue
		}
		if boundary != nil && q.precedes(boundary, assignment.left, bindings) {
			continue
		}
		if possible, _ := q.reachable(assignment.left, bindings); !possible {
			continue
		}
		request := q.sourceSetterRequest(assignment.left, accessorSetAcquire, bindings)
		if request == nil {
			continue
		}
		request.writer = writer
		receiver, name := accessorReceiver(assignment.left)
		if receiver == nil {
			continue
		}
		selected := q.sourceAccessorOperationCandidates(receiver, nil, name, accessorSetAcquire, bindings, assignment.left, request)
		result.valueIncomplete = result.valueIncomplete || selected.valueIncomplete || selected.receiverIncomplete || selected.fieldReceiverIncomplete
		for _, scope := range request.scopes {
			part := accessorCandidates{}
			var values []sourceValue
			func() {
				previous := q.creators
				q.creators = scope.creators
				defer func() { q.creators = previous }()
				values = q.originsAt(write.right, write.left, scope.bindings, &part)
			}()
			for i := range values {
				if values[i].capture == nil {
					captured := scope
					values[i].capture = &captured
				}
			}
			if part.opaque || part.valueIncomplete || part.receiverIncomplete {
				values = append(values, sourceValue{})
			}
			replacements = append(replacements, sourceValueReplacement{at: request.operation, operation: write.right.Parent, values: values, bindings: scope.bindings})
		}
		// Selection is conditional even when it exposes one body. Keep descriptor,
		// target and execution uncertainty separate from represented RHS alternatives.
		if len(request.scopes) > 0 || selected.opaque {
			result.opaque = true
		}
	}
	return replacements
}

// localSetterWriterInputs recovers the original Set's receiver and RHS scope for
// a receiver-relative write in a local object literal setter. A direct helper
// Call supplies its own bindings and bounds when the Set could have run.
// Each scope describes a possible input to the later Get.
func (q *sourceValueQuery) localSetterWriterInputs(write, origin *ast.Node, cut *sourceMemberWriterReadCut, bindings sourceValueBindings, result *accessorCandidates, inputs []sourceMemberWriterInput) []sourceMemberWriterInput {
	if !q.dependenciesOnly || q.moduleRead() != nil || cut == nil || origin == nil || !ast.IsObjectLiteralExpression(origin) {
		return inputs
	}
	getter := q.protectedMember
	if getter == nil || !ast.IsPropertyAccessExpression(getter) && !ast.IsElementAccessExpression(getter) {
		return inputs
	}
	writer := enclosingCallableNode(write)
	caller := enclosingCallableNode(origin)
	if writer == nil || !ast.IsSetAccessorDeclaration(writer) || q.active[writer] || writer.Parent != origin || caller == nil {
		return inputs
	}
	if receiver, _ := accessorReceiver(write); receiver == nil || receiver.Kind != ast.KindThisKeyword {
		return inputs
	}
	boundary := q.localMemberReadBoundary(caller)
	if boundary == nil {
		return inputs
	}
	q.active[writer] = true
	defer delete(q.active, writer)
	cursor := q.owner.index(ast.GetSourceFileOfNode(origin)).memberAssignments(origin)
	for {
		assignment, ok := cursor.next()
		if !ok {
			break
		}
		outer := enclosingCallableNode(assignment.left)
		receiver, name := accessorReceiver(assignment.left)
		if name != callableNameText(writer.Name()) || !ast.IsIdentifier(receiver) || outer == nil {
			continue
		}
		operation := assignment.left.Parent
		if !plainStagedAssignment(operation) || operation.AsBinaryExpression().Left != assignment.left {
			continue
		}
		if !q.charge(result, operation) {
			break
		}
		if outer == caller {
			if operation.End() <= boundary.Pos() {
				inputs = q.localSetterWriterRow(writer, origin, assignment.left, operation, bindings, result, inputs)
			}
			continue
		}
		if enclosingCallableNode(outer) != caller || !envelopeSynchronousFunction(outer) ||
			operation.Parent == nil || !ast.IsExpressionStatement(operation.Parent) ||
			operation.Parent.Parent != outer.Body() || len(outer.Body().AsBlock().Statements.Nodes) != 1 {
			continue
		}
		for _, input := range q.memberWriterInputs(assignment.left, bindings, result, cut) {
			if call := input.call; call != nil && !input.incomplete && enclosingCallableNode(call) == caller &&
				call.End() <= boundary.Pos() && ast.IsCallExpression(call) && ast.IsIdentifier(call.Expression()) {
				q.memberWriterScope(input, func() {
					inputs = q.localSetterWriterRow(writer, origin, assignment.left, call, input.scope.bindings, result, inputs)
				})
			}
		}
	}
	return inputs
}

// localMemberReadBoundary keeps the member's acquisition position in the
// creating helper. A downstream Get can observe the selected return even when
// the original Get belongs to the component. A saved field keeps its earlier cut.
func (q *sourceValueQuery) localMemberReadBoundary(owner *ast.Node) *ast.Node {
	boundary := q.protectedMember
	if boundary == nil || enclosingCallableNode(boundary) != owner {
		boundary = q.creators[owner].returning
		if boundary == nil {
			return nil
		}
	}
	if read := q.readPosition(); read != nil && enclosingCallableNode(read) == owner && read.Pos() < boundary.Pos() {
		boundary = read
	}
	return boundary
}

func (q *sourceValueQuery) localSetterWriterRow(writer, origin, target, occurrence *ast.Node, bindings sourceValueBindings, result *accessorCandidates, inputs []sourceMemberWriterInput) []sourceMemberWriterInput {
	receiver, name := accessorReceiver(target)
	part := accessorCandidates{}
	values := q.originsAt(receiver, target, bindings, &part)
	if part.opaque || part.receiverIncomplete || len(values) != 1 || values[0].node != origin || len(values[0].path) != 0 {
		return inputs
	}
	if may, _ := q.reachable(target, bindings); !may {
		return inputs
	}
	request := q.sourceSetterRequest(target, accessorSetAcquire, bindings)
	if request == nil {
		return inputs
	}
	request.writer = writer
	selection := q.sourceAccessorOperationCandidates(receiver, nil, name, accessorSetAcquire, bindings, target, request)
	result.valueIncomplete = result.valueIncomplete || selection.valueIncomplete || selection.receiverIncomplete
	for _, scope := range request.scopes {
		inputs = append(inputs, sourceMemberWriterInput{implicitMember: occurrence, scope: scope, incomplete: true})
	}
	return inputs
}
