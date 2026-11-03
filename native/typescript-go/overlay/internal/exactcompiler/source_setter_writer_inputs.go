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
