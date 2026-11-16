package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceInputConsumerCovered asks whether this original input use is owned by a
// migrated consumer. Pure data transport is separate from an implicit protocol.
// It does not classify a value, execute a body or prove a type/normal result.
func (work *callableEffectWork) sourceInputConsumerCovered(fact *callableFacts, node *ast.Node) bool {
	if work.stagedCoercionConsumerAt(fact, node) {
		return true
	}
	outer := node
	for outer.Parent != nil && unwrapSourceCallableReference(outer.Parent) == node {
		outer = outer.Parent
	}
	parent := outer.Parent
	if parent == nil {
		return false
	}
	if ast.IsReturnStatement(parent) || ast.IsExpressionStatement(parent) || ast.IsTypeOfExpression(parent) || ast.IsVoidExpression(parent) {
		return true
	}
	if ast.IsPrefixUnaryExpression(parent) && parent.AsPrefixUnaryExpression().Operator == ast.KindExclamationToken {
		return true
	}
	if ast.IsIfStatement(parent) && parent.AsIfStatement().Expression == outer {
		return true
	}
	// Literal data is inert only when its eventual consumer owns the protocol.
	// An arbitrary authored call/assignment may inspect or invoke that data.
	// Type-only wrappers between literal containers preserve the same DATA use.
	// Walk them with the containers so a returned typed literal does not fall
	// back to an unrelated input protocol; the terminal consumer still owns it.
	for parent != nil && (ast.IsPropertyAssignment(parent) || ast.IsShorthandPropertyAssignment(parent) || ast.IsObjectLiteralExpression(parent) ||
		(ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) || ast.IsSatisfiesExpression(parent) || ast.IsNonNullExpression(parent)) && parent.Expression() == outer) {
		if ast.IsPropertyAssignment(parent) && parent.AsPropertyAssignment().Initializer != outer {
			return false
		}
		outer = parent
		parent = parent.Parent
	}
	if parent == nil {
		return false
	}
	if ast.IsReturnStatement(parent) {
		return true
	}
	if !ast.IsCallExpression(parent) {
		return false
	}
	if parent.Expression() == outer {
		for _, use := range fact.staged.operationUses {
			if invocation, original := work.stagedBindingInvocation(use); original && invocation == parent {
				return true
			}
		}
		for _, demand := range fact.staged.invoked {
			if demand.origin == parent {
				return true
			}
		}
		return false
	}
	if work.frameworkInputConsumerCovered(fact, parent, outer) {
		return true
	}
	if work.nativeEagerInputConsumerCovered(fact, parent, outer) {
		return true
	}
	for _, occurrence := range fact.staged.constructedOccurrences {
		if occurrence.request.producer.operation == parent {
			return true
		}
	}
	for _, use := range fact.staged.operationUses {
		if use.request.producer.operation == parent && work.operationRecipes[use.request.producer].nativeGet != nil {
			return true
		}
	}
	for _, call := range fact.staged.calls {
		if call.invocation.operation == parent {
			return true
		}
	}
	return false
}

// prepareSourceInputConsumers preserves existing semantic owners for genuinely
// unmigrated input protocols. The canonical body summary still yields on the
// queue. A distinct original input consumer is dispatched only where source
// substitution cannot yet account for Get/coercion/capture use. It grants no
// output/category rights and is explicitly excluded from migrated-input credit.
// The dispatch key is graph-local. No live query, acquired value or scope survives.
func (work *callableEffectWork) prepareSourceInputConsumers(facts []callableFacts, owner *executableBodyOwner) {
	work.prepareSourceInputConsumerDecisions(facts, owner, false)
}

// refreshSourceInputConsumerWaits revalidates only the exact Calls whose input
// decision was deferred. Unrelated DATA arrivals cannot reopen initial legacy
// classification or acquire projections for other already-classified Calls.
func (work *callableEffectWork) refreshSourceInputConsumerWaits(facts []callableFacts, owner *executableBodyOwner) {
	for _, fact := range facts {
		for _, call := range fact.staged.calls {
			if call.inputConsumerWait != nil {
				work.prepareSourceInputConsumerDecisions(facts, owner, true)
				return
			}
		}
	}
}

func (work *callableEffectWork) prepareSourceInputConsumerDecisions(facts []callableFacts, owner *executableBodyOwner, onlyWaiting bool) {
	if owner == nil || owner.values == nil {
		return
	}
	unsupported := make([]bool, len(facts))
	frameworkInputs := make([]bool, len(facts))
	waits := make([][]sourceStagedInputConsumerRequirement, len(facts))
	memberOwners := make([][]sourceStagedInputConsumerRequirement, len(facts))
	dependencies := make([][]int, len(facts))
	nodes := work.memberNodes
	for index := range facts {
		fact := &facts[index]
		if !ast.IsFunctionLike(fact.node) {
			continue
		}
		sourceIndex := owner.values.index(fact.sourceFile)
		for _, parameter := range fact.node.Parameters() {
			if parameter.Name() == nil || !ast.IsIdentifier(parameter.Name()) {
				unsupported[index] = true
				continue
			}
			symbol := owner.checker.GetSymbolAtLocation(parameter.Name())
			if symbol == nil || sourceIndex.privateUses == nil || !sourceIndex.privateUses.complete {
				unsupported[index] = true
				continue
			}
			for _, use := range sourceIndex.privateUses.uses[ast.GetSymbolId(symbol)] {
				if enclosingCallableNode(use.node) != fact.node {
					// The actual selected Get may already own this invoked capture
					// through its real receiver B and separate formal source role.
					if !work.stagedGetCaptureConsumer(fact, use.node, owner) {
						unsupported[index] = true
					}
					continue
				}
				outer := use.node
				for outer.Parent != nil && unwrapSourceCallableReference(outer.Parent) == use.node {
					outer = outer.Parent
				}
				if outer.Parent != nil && ast.IsCallExpression(outer.Parent) && work.frameworkInputConsumerCovered(fact, outer.Parent, outer) {
					frameworkInputs[index] = true
				}
				if !work.sourceInputConsumerCovered(fact, use.node) && !work.stagedBindingInputConsumerCovered(fact, use.node, owner, make(map[*ast.Node]bool)) {
					if pending, current, owned := work.memberInputConsumer(fact, use.node, owner); owned {
						memberOwners[index] = append(memberOwners[index], pending)
						if !current {
							waits[index] = append(waits[index], pending)
						}
					} else if pending, current, owned := work.nativeInputConsumer(fact, use.node, owner); owned {
						if !current {
							waits[index] = append(waits[index], pending)
						}
					} else {
						unsupported[index] = true
					}
				}
			}
		}
		// Forwarded roles retain the child's capability requirement. This boolean
		// qualification uses existing canonical edges and does not evaluate inputs.
		for _, call := range fact.staged.calls {
			dependent := false
			for _, actual := range call.invocation.actuals {
				dependent = dependent || actual.endpoint.kind == relativeEndpointRole || actual.endpoint.expression != nil && ast.IsIdentifier(actual.endpoint.expression)
			}
			if dependent {
				if target, found := nodes[call.invocation.declaration]; found {
					dependencies[index] = append(dependencies[index], target)
				}
			}
		}
	}
	changed := true
	for changed {
		changed = false
		for index, children := range dependencies {
			for _, child := range children {
				for _, required := range memberOwners[child] {
					found := false
					for _, prior := range memberOwners[index] {
						found = found || prior == required
					}
					if !found {
						memberOwners[index] = append(memberOwners[index], required)
						changed = true
					}
				}
				if frameworkInputs[child] && !frameworkInputs[index] {
					frameworkInputs[index] = true
					changed = true
				}
				for _, pending := range waits[child] {
					found := false
					for _, prior := range waits[index] {
						found = found || prior == pending
					}
					if !found {
						waits[index] = append(waits[index], pending)
						changed = true
					}
				}
				if unsupported[child] && !unsupported[index] {
					unsupported[index] = true
					changed = true
				}
			}
		}
	}
	if work.legacySourceInputs == nil {
		work.legacySourceInputs = make(map[*ast.Node]bool)
	}
	targets := make(map[*ast.Node]int, len(facts))
	for i := range facts {
		targets[facts[i].node] = i
	}
	for caller := range facts {
		fact := &facts[caller]
		for i := range fact.staged.calls {
			call := &fact.staged.calls[i]
			if onlyWaiting && call.inputConsumerWait == nil {
				continue
			}
			target, found := nodes[call.invocation.declaration]
			if !found || call.sourceInputs == nil {
				continue
			}
			memberAssociation := true
			for _, required := range memberOwners[target] {
				if required.memberCall && !work.memberInputWaitAssociation(*call, required.owner) {
					memberAssociation = false
				}
			}
			if !memberAssociation {
				call.legacyInputs = true
			}
			if !call.legacyInputs && !unsupported[target] && len(waits[target]) != 0 {
				call.inputConsumerWait = &sourceStagedInputConsumerWait{operation: call.invocation.operation, declaration: call.invocation.declaration, cut: call.invocation.cut, generation: work.operationGeneration, epoch: work.operationEpoch, required: append([]sourceStagedInputConsumerRequirement(nil), waits[target]...), sourceInputs: call.sourceInputs}
				facts[caller].staged.operationsPending = true
				continue // DEFER is not covered, a normal result, B, or relative transfer.
			}
			if call.inputConsumerWait != nil && !unsupported[target] {
				if !work.inputConsumerWaitCurrent(facts, *call, owner) {
					continue // Only actual CURRENT coverage can retire this exact wait.
				}
				call.inputConsumerWait = nil
			}
			if !unsupported[target] && call.inputs == nil {
				for _, demand := range facts[target].staged.invoked {
					plan := substituteSourceRelativeInvokedInput(call.sourceInputs.bindings, demand.role, nil)
					for _, binding := range plan.bindings {
						for _, endpoint := range binding.sources {
							if endpoint.kind != relativeEndpointRole && endpoint.kind != relativeEndpointUndefined {
								if endpoint.kind != relativeEndpointExpression || !isWriterInputCallable(endpoint.expression) || !stagedFieldGetterInputsMapped(endpoint.expression, nil, owner) {
									if work.prepareSourceInputProjection(facts, caller, *call, endpoint, owner) {
										continue // Registered DATA stays pending on its own required producer.
									}
									call.legacyInputs = true
								}
							}
						}
					}
				}
			}
			if !unsupported[target] {
				for _, effect := range facts[target].summary.DirectEffectSources {
					if effect.relativeCoercion == nil {
						continue
					}
					inputs := call.sourceInputs.bindings
					binding, found := coercionBinding(inputs, effect.relativeCoercion.role)
					call.legacyInputs = call.legacyInputs || !found || !coercionActualsCovered(binding)
				}
			}
			if !unsupported[target] && frameworkInputs[target] && !work.publishFrameworkBoundInputEffects(facts, caller, *call, owner) {
				call.legacyInputs = true
			}
			call.legacyInputs = call.legacyInputs || unsupported[target]
			if !call.legacyInputs {
				continue
			}
			operation := call.invocation.operation
			if work.legacySourceInputs[operation] {
				continue
			}
			owner.project.requireStagedReplacement(stagedReplacementGap{
				operation: operation, consumer: fact.node,
				parent: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: fact.node, operation: operation, kind: relativeDemandDirectExposure}},
				demand: "input DATA/relative projection", transition: "appendArgumentAccessorEffects",
			})
			work.legacySourceInputs[operation] = true
			// This is the original, explicitly unmigrated input owner. Its result is
			// consumed for MAY effects only. Normal outputs/identity stay independent.

			edge := &sourceRelativeInputEdge{request: cloneStagedWriterInvocation(call.invocation)}
			appendArgumentAccessorEffects(fact, operation, targets, fact.sourceFile, owner.checker, owner, nil, edge)
			if edge.delivered && sameSourceRelativeVector(call.invocation, edge.request) && sameSourceRelativeInputEnvelope(edge.request, edge.bound) {
				// Retain both meanings in the existing B packet: bound is the
				// original acquired projection, relative the prior canonical
				// source-role recipe. Neither retains its query or raw scope.
				edge.relative = cloneSourceRelativeBoundInputs(call.sourceInputs.bindings)
				edge.relative.use, edge.relative.cut = edge.request.use, edge.request.cut
				call.inputs, call.sourceInputs = edge, nil
			}

			fact.summary.DirectEffectSources = uniqueEnvironmentSources(fact.summary.DirectEffectSources)
		}
	}
}
