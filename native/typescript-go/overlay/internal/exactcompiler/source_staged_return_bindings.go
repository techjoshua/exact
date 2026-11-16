package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedReturnBindingPlan is a conditional data-source projection, not a
// successful Call or current binding value. Pending branches need their original
// expression producer. Unrepresented cross-activation writes keep local coverage
// open independently of the known source prefix.
type sourceStagedReturnBindingPlan struct {
	branches           []sourceStagedCallReturnBranch
	locallyRepresented bool
}

// sourceStagedReturnBindingBorrow is private to the original binding/completion
// owners below. It abstracts predicates instead of acquiring their values and
// records original RHS syntax instead of recovering it. No input map or creating
// scope is installed, and neither the query nor this loan enters a graph recipe.
type sourceStagedReturnBindingBorrow struct {
	issuer      *sourceValueQuery
	declaration *ast.Node
	generation  *projectGeneration
	sources     map[*ast.Node]sourceRelativeEndpoint
	incomplete  bool
}

func (q *sourceValueQuery) liveStagedReturnBinding() *sourceStagedReturnBindingBorrow {
	if q == nil || q.owner == nil || q.inputs != nil || q.operation != nil || !q.dependenciesOnly {
		return nil
	}
	b := q.stagedReturnBinding
	if b == nil || b.issuer != q || b.generation != q.owner.generation || q.effectOwner != b.declaration || len(q.creators) != 0 {
		return nil
	}
	return b
}

// stagedReturnBindingOperand is called at the original initialization/write
// boundary. Its source endpoint carries that boundary and the later read
// separately. The resulting sourceValue is syntax only and is never acquired.
func (q *sourceValueQuery) stagedReturnBindingOperand(node, at *ast.Node) ([]sourceValue, bool) {
	b := q.liveStagedReturnBinding()
	if b == nil {
		return nil, false
	}
	if node == nil || at == nil || !sourceStagedOccurrenceOwned(at, b.declaration) {
		b.incomplete = true
		return nil, true
	}
	producer := at
	if at.Parent != nil && ast.IsBinaryExpression(at.Parent) && at.Parent.AsBinaryExpression().Left == at {
		producer = at.Parent
	}
	b.sources[node] = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: node, producer: producer, get: at, cut: q.relativeInputCut(producer)}
	return []sourceValue{{node: node}}, true
}

// stagedReturnBindingWrite preserves the original binding owner's write domain.
// Only a direct write in this activation can be described without its creating
// input producer. Other writes are required state, never an inactive/unknown
// branch. This check precedes all sibling writer and RHS recovery.
func (q *sourceValueQuery) stagedReturnBindingWrite(assignment sourceValueAssignment, declaration *ast.Node) bool {
	b := q.liveStagedReturnBinding()
	if b == nil {
		return false
	}
	operation := assignment.right.Parent
	index := q.owner.index(ast.GetSourceFileOfNode(declaration))
	occurrence := index.normalOccurrences[operation]
	if enclosingCallableNode(declaration) != b.declaration || occurrence == nil || occurrence.region != b.declaration || !ast.IsBinaryExpression(operation) || operation.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		b.incomplete = true
		return true
	}
	return false
}

// describeStagedReturnBindings reuses the original structured completion and
// lexical binding owners with abstract predicates and source-only operands.
// The caller still authenticates the exact retained creating association. Body
// Effects, raw expression results and captures keep independent requirements.
func describeStagedReturnBindings(plan sourceStagedCallReturnPlan, owner *executableBodyOwner) sourceStagedReturnBindingPlan {
	out := sourceStagedReturnBindingPlan{}
	if owner == nil || owner.values == nil || plan.declaration == nil || plan.operation == nil {
		return out
	}
	validated, associated := describeStagedCallReturnSources(plan.call, owner)
	if !associated || validated.declaration != plan.declaration || validated.operation != plan.operation {
		return out
	}
	q := newSourceDependencyQuery(plan.operation, owner.checker, owner, plan.declaration)
	borrow := &sourceStagedReturnBindingBorrow{issuer: q, declaration: plan.declaration, generation: owner.values.generation, sources: make(map[*ast.Node]sourceRelativeEndpoint)}
	q.stagedReturnBinding = borrow
	defer func() { borrow.issuer, borrow.sources, q.stagedReturnBinding = nil, nil, nil }()
	observed, obligations := sourceResultObservation{}, accessorCandidates{}
	assessment := q.consumeSuccessfulCompletions(plan.declaration, nil, &observed, &obligations, func(site, expression *ast.Node) {
		if site == nil {
			out.branches = append(out.branches, sourceStagedCallReturnBranch{endpoint: sourceRelativeEndpoint{kind: relativeEndpointUndefined, producer: plan.declaration, creation: plan.operation, cut: stagedCallReturnAssociationCut(plan.call)}})
			return
		}
		var branch sourceStagedCallReturnBranch
		found := false
		for _, candidate := range validated.branches {
			if candidate.returning == site {
				branch, found = candidate, true
				break
			}
		}
		if !found {
			borrow.incomplete = true
			return
		}
		if branch.binding == nil || !ast.IsVariableDeclaration(branch.binding) || enclosingCallableNode(branch.binding) != plan.declaration {
			out.branches = append(out.branches, branch)
			return
		}
		symbol := owner.checker.GetSymbolAtLocation(unwrapSourceCallableReference(expression))
		if symbol == nil || symbol.ValueDeclaration != branch.binding {
			borrow.incomplete = true
			out.branches = append(out.branches, branch)
			return
		}
		q.reading, q.returning, q.initializing = expression, site, nil
		values := q.bindingValues(symbol, nil, func() []sourceValue {
			values, _ := q.stagedReturnBindingOperand(branch.binding.Initializer(), branch.binding)
			return values
		}, expression, nil, &obligations)
		if len(values) == 0 {
			borrow.incomplete = true
		}
		for _, value := range values {
			endpoint, described := borrow.sources[value.node]
			if !described {
				borrow.incomplete = true
				continue
			}
			projected := branch
			projected.endpoint = cloneSourceRelativeEndpoint(endpoint)
			projected.endpoint.creation, projected.endpoint.returning = plan.operation, site
			// A symbolic RHS needs its original result/read producer even when
			// local binding relationships have been fully represented.
			projected.pending = !(sourceInertValueCreation(value.node) || stagedEmptyArrayDataConstruction(value.node)) || stagedCallReturnLiteralHasCapture(value.node, owner.values)
			out.branches = append(out.branches, projected)
		}
	})
	out.locallyRepresented = assessment.assessed && !assessment.unknown && !borrow.incomplete && !observed.incomplete && !obligations.opaque && !obligations.valueIncomplete
	return out
}

func stagedCallReturnAssociationCut(call sourceStagedDeclarationCall) sourceRelativeCut {
	if call.inputs != nil {
		return call.inputs.relative.cut
	}
	return call.invocation.cut
}
