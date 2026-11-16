package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// effectUse distinguishes an instantiated observation from a declaration's
// relative obligation. It is a finite source use, never a runtime activation.
func (q *sourceValueQuery) effectUse() *ast.Node {
	if q.effectOwner != nil && ast.IsFunctionLike(q.effectOwner) && (q.inputs == nil || q.inputs.invocation == nil) {
		return nil
	}
	if q.dependencyUse != nil {
		return q.dependencyUse
	}
	return q.reading
}

func (q *sourceValueQuery) returnOutcome(operation *ast.Node, complete bool) sourceCallOutcome {
	return sourceCallOutcome{declaration: enclosingCallableNode(operation), operation: operation, use: q.effectUse(), consumer: q.effectOwner, phase: sourceReturnRelationship, complete: complete, dependencies: q.dependenciesOnly}
}

// refuseExactOutput classifies this terminal producer's missing output. Unknown
// selection, Get and body effects encountered before it remain unclassified.
func (q *sourceValueQuery) refuseExactOutput(operation *ast.Node, r *accessorCandidates) {
	r.callFallbacks = append(r.callFallbacks, q.returnOutcome(operation, false))
	r.valueIncomplete = true
}

func sameCallObligation(a, b sourceCallOutcome) bool {
	return a.declaration == b.declaration && a.operation == b.operation && a.phase == b.phase
}
func sameFieldObligation(a, b sourceFieldDemand) bool {
	return a.declaration == b.declaration && a.operation == b.operation && a.slot == b.slot && a.key == b.key
}
func localCallCovered(origin sourceCallOutcome, outcomes []sourceCallOutcome) bool {
	matched := false
	for _, outcome := range outcomes {
		if !outcome.dependencies || !sameCallObligation(origin, outcome) || origin.use != outcome.use || origin.consumer != outcome.consumer {
			continue
		}
		matched = true
		if !outcome.complete {
			return false
		}
	}
	return matched
}
func localFieldCovered(origin sourceFieldDemand, calls []sourceFieldCall, installed ...func(*sourceInstalledMemberRequirement) bool) bool {
	matched := false
	for _, call := range calls {
		if call.dependencies {
			for _, outcome := range call.outcomes {
				if !sameFieldObligation(origin, outcome.demand) || origin.use != outcome.demand.use || origin.consumer != outcome.demand.consumer {
					continue
				}
				matched = true
				fulfilled := outcome.fulfilled
				if outcome.installedMember != nil {
					fulfilled = len(installed) == 1 && installed[0] != nil && installed[0](outcome.installedMember)
				}
				if (!call.complete && !installedCallFieldBody(call, outcome)) || !fulfilled {
					return false
				}
			}
		}
	}
	return matched
}

// sourceObligationCoveredLocally normalizes only a contextual obligation at its
// original owner. A different use, phase or unmatched residual cannot discharge it.
func sourceObligationCoveredLocally(fact *callableFacts, source EnvironmentEffectSource, installed ...func(*sourceInstalledMemberRequirement) bool) bool {
	if origin := source.callOrigin; origin != nil && origin.use != nil && origin.consumer == fact.node && !source.callForwarded {
		return localCallCovered(*origin, fact.callOutcomes)
	}
	if origin := source.fieldOrigin; origin != nil && origin.use != nil && origin.consumer == fact.node && !source.fieldForwarded {
		return localFieldCovered(*origin, fact.fieldCalls, installed...)
	}
	return false
}

// sourceResidualOpaque uses the same contextual obligations for export placement.
// It never clears unclassified opacity, descriptor or receiver effects.
func sourceResidualOpaque(r accessorCandidates) bool {
	if r.opaque {
		return true
	}
	for _, origin := range r.callFallbacks {
		if !localCallCovered(origin, r.callOutcomes) {
			return true
		}
	}
	for _, origin := range r.fieldFallbacks {
		if !localFieldCovered(origin, r.fieldCalls) {
			return true
		}
	}
	return false
}

func sourceObligationDeclarationPos(node *ast.Node) int {
	if node == nil {
		return -1
	}
	return node.Pos()
}

// refuseExactArgument names absent normal input output, not unperformed argument
// effects. Source argument association can account for this same source use.
func (q *sourceValueQuery) refuseExactArgument(argument *ast.Node, r *accessorCandidates) {
	origin := q.returnOutcome(argument, false)
	origin.phase = sourceArgumentRelationship
	r.callFallbacks = append(r.callFallbacks, origin)
	r.valueIncomplete = true
}

// accountBypassedSourceDemand accounts for the effect operation, not its value.
// No skipped Get/Call is executed or granted a descriptor/output capability.
func (q *sourceValueQuery) accountBypassedSourceDemand(node *ast.Node, bindings sourceValueBindings, r *accessorCandidates) {
	if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
		receiver, key := accessorReceiver(node)
		if demand, _ := q.fieldDemand(node, receiver, key); demand.declaration != nil {
			r.fieldOutcomes = append(r.fieldOutcomes, sourceFieldOutcome{demand: demand, fulfilled: true})
		}
	}
	if ast.IsCallExpression(node) {
		r.callOutcomes = append(r.callOutcomes, sourceCallOutcome{declaration: enclosingCallableNode(node), operation: node, complete: true, use: q.effectUse(), consumer: q.effectOwner, dependencies: true})
	}
}

// sourceObligationCoveredOnEdge uses the complete instantiation at this actual
// caller edge, including every matching source alternative. It does not infer
// context from a target name or waive unclassified/descriptor effects.
func sourceObligationCoveredOnEdge(caller, target *callableFacts, edge CallEdge, source EnvironmentEffectSource, installed ...func(*sourceInstalledMemberRequirement) bool) bool {
	root := caller.fieldEdgeOperations[edge.ID]
	if root == nil {
		return false
	}
	if origin := source.fieldOrigin; origin != nil && len(installed) == 1 && installedCallFieldCoveredOnEdge(caller, target, root, *origin, installed[0]) {
		return true
	}
	rootCovered := false
	for _, call := range caller.fieldCalls {
		if call.dependencies && call.operation == root && call.target == target.node {
			if !call.complete {
				return false
			}
			rootCovered = true
		}
	}
	if !rootCovered {
		return false
	}
	if origin := source.callOrigin; origin != nil {
		contextual := *origin
		contextual.use, contextual.consumer = root, caller.node
		return localCallCovered(contextual, caller.callOutcomes)
	}
	if origin := source.fieldOrigin; origin != nil {
		contextual := *origin
		contextual.use, contextual.consumer = root, caller.node
		return localFieldCovered(contextual, caller.fieldCalls, installed...)
	}
	return false
}

// sourceParameterDefault locates a reference's lexical parameter-default phase.
func sourceParameterDefault(node, boundary *ast.Node) *ast.Node {
	for current := node; current != nil && current != boundary; current = current.Parent {
		if (ast.IsParameterDeclaration(current) || ast.IsBindingElement(current)) && current.Initializer() != nil && current.Initializer().Contains(node) {
			return current.Initializer()
		}
		if ast.IsFunctionLike(current) && !sourceDefinitionExpressionContains(current, node) {
			break
		}
	}
	return nil
}
