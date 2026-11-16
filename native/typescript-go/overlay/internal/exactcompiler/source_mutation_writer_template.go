package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceMutationWriterTemplate is passive syntax encountered by the ORIGINAL
// canonical source traversal. It has no publication/current/binder authority.
// The actual installed input or BODY subscriber must later issue its DATA role.
type sourceMutationWriterTemplate struct {
	write, region, left, right *ast.Node
	value                      sourceRelativeEndpoint
	role                       sourceRelativeRole
	generation                 *projectGeneration
}

func describeMutationWriterTemplate(node, declaration *ast.Node, owner *sourceValueOwner) (sourceMutationWriterTemplate, bool) {
	if node != nil && node.Parent != nil && ast.IsBinaryExpression(node.Parent) && node.Parent.AsBinaryExpression().Left == node {
		node = node.Parent
	}
	if owner == nil || owner.generation == nil || node == nil || declaration == nil || !ast.IsBinaryExpression(node) || node.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken || enclosingCallableNode(node) != declaration || !sourceStagedOccurrenceOwned(node, declaration) {
		return sourceMutationWriterTemplate{}, false
	}
	assignment := node.AsBinaryExpression()
	left := unwrapSourceCallableReference(assignment.Left)
	if left == nil || !ast.IsPropertyAccessExpression(left) && !ast.IsElementAccessExpression(left) {
		return sourceMutationWriterTemplate{}, false
	}
	t := sourceMutationWriterTemplate{write: node, region: declaration, left: left, right: assignment.Right, generation: owner.generation}
	t.value = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: assignment.Right, producer: node, get: left, cut: sourceRelativeCut{operation: node, reading: node}}
	expression := unwrapSourceCallableReference(assignment.Right)
	if ast.IsIdentifier(expression) {
		symbol := owner.checker.GetSymbolAtLocation(expression)
		if symbol != nil && symbol.ValueDeclaration != nil && !owner.bindingWritten(symbol) {
			selected := symbol.ValueDeclaration
			slot := 0
			for _, parameter := range declaration.Parameters() {
				if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
					continue
				}
				if selected == parameter {
					t.role = sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: slot}
					break
				}
				slot++
			}
			if t.role.kind == relativeRoleUnknown && enclosingCallableNode(selected) != declaration && !standardLibrarySource(ast.GetSourceFileOfNode(selected)) {
				t.role = sourceRelativeRole{kind: relativeRoleCapture, declaration: declaration, binding: selected}
			}
		}
	}
	if t.role.kind != relativeRoleUnknown {
		t.value.kind = relativeEndpointRole
		t.value.role = t.role
	}
	return t, true
}

func recordMutationWriterTemplate(fact *callableFacts, node *ast.Node, owner *executableBodyOwner) {
	if fact == nil || owner == nil || owner.values == nil || fact.node == nil || !ast.IsFunctionLike(fact.node) {
		return
	}
	t, valid := describeMutationWriterTemplate(node, fact.node, owner.values)
	if !valid {
		return
	}
	for _, prior := range fact.staged.mutationWriters {
		if prior.write == t.write {
			return
		}
	}
	fact.staged.mutationWriters = append(fact.staged.mutationWriters, t)
}

// projectMutationWriterTemplate performs DATA substitution only. It does not
// invoke a formal or acquire a captured expression under later bindings.
func projectMutationWriterTemplate(t sourceMutationWriterTemplate, bound sourceRelativeBoundInputs, captures []sourceRelativeBinding, owner *sourceValueOwner) (sourceStagedWriterProjection, bool) {
	out := sourceStagedWriterProjection{}
	if t.generation == nil || owner == nil || owner.generation != t.generation || bound.declaration != t.region || t.write == nil {
		return out, false
	}
	if t.role.kind != relativeRoleUnknown {
		bindings := append([]sourceRelativeBinding(nil), bound.bindings...)
		bindings = append(bindings, captures...)
		found := false
		out.delta.extracted = true
		for _, binding := range bindings {
			if binding.target != t.role {
				continue
			}
			found = true
			for _, endpoint := range binding.sources {
				out.delta.exposures = append(out.delta.exposures, sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(endpoint)})
			}
			out.pending = append(out.pending, cloneSourceRelativeEndpoints(binding.pending)...)
			if binding.unknown || len(binding.pending) != 0 || len(binding.sources) == 0 {
				out.delta.extracted = false
			}
		}
		if !found {
			out.delta.extracted = false
			out.pending = append(out.pending, cloneSourceRelativeEndpoint(t.value))
		}
		return out, true
	}
	if sourceInertValueCreation(t.right) && !stagedCallReturnLiteralHasCapture(t.right, owner) {
		out.delta.extracted = true
		out.delta.exposures = []sourceStagedOperationAlternative{{endpoint: cloneSourceRelativeEndpoint(t.value)}}
		return out, true
	}
	// Preserve the exact original expression/creator request for its authentic
	// DATA owner. A result or capturing construction is not an unknown value.
	out.pending = []sourceRelativeEndpoint{cloneSourceRelativeEndpoint(t.value)}
	return out, true
}

// currentMutationWriterTemplate reissues passive syntax at an authentic current
// binder. It uses the original indexed writer, not RHS value lookup, a body
// walk or a prior generation's checker role. Changed source ASTs fail closed.
func currentMutationWriterTemplate(prior sourceMutationWriterTemplate, owner *sourceValueOwner) (sourceMutationWriterTemplate, bool) {
	if owner == nil || owner.program == nil || owner.generation == nil || prior.write == nil || prior.region == nil {
		return sourceMutationWriterTemplate{}, false
	}
	source := ast.GetSourceFileOfNode(prior.write)
	if source == nil || owner.program.GetSourceFile(source.FileName()) != source {
		return sourceMutationWriterTemplate{}, false
	}
	occurrence := owner.index(source).normalOccurrences[prior.write]
	if occurrence == nil || occurrence.region != prior.region {
		return sourceMutationWriterTemplate{}, false
	}
	current, valid := describeMutationWriterTemplate(prior.write, prior.region, owner)
	return current, valid && current.left == prior.left && current.right == prior.right
}
