package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// prepareBindingInvocations consumes only reached local-callee DATA uses issued
// by the original collector. A child recipe, declaration or initializer alone
// cannot activate a callable. Queue cursor delivery remains with its owner.
func (work *callableEffectWork) prepareBindingInvocations(facts []callableFacts, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil || work.operationGeneration != owner.values.generation {
		return
	}
	for caller := range facts {
		fact := &facts[caller]
		for _, use := range fact.staged.operationUses {
			call, reached := work.stagedBindingInvocation(use)
			if !reached {
				continue
			}
			read := use.request.producer.operation
			recipe := work.operationRecipes[use.request.producer]
			source := recipe.callResult
			if source == nil || source.binding == nil || !ast.IsVariableDeclaration(source.binding) || source.generation != work.operationGeneration || !validStagedCallResultRecipe(recipe) || stagedBindingDataDeclaration(read, fact.node, owner) != source.binding {
				continue
			}
			delivery, available := work.stagedCallResultData(use.request)
			if !available {
				continue
			}
			cut := sourceRelativeCut{operation: call, reading: call}
			for _, alternative := range delivery.delta.exposures {
				endpoint := alternative.endpoint
				if endpoint.kind == relativeEndpointUndefined {
					continue
				}
				if endpoint.kind == relativeEndpointRole && endpoint.role.kind == relativeRoleFormal && endpoint.role.declaration == fact.node && validOperationRelativeRole(endpoint.role, fact.node) {
					before := len(fact.staged.invoked)
					appendOperationRelative(fact, sourceRelativeInvokedInput{kind: relativeDemandEffects, role: endpoint.role, origin: call, cut: cut})
					if len(fact.staged.invoked) != before && caller < len(work.dirty) {
						work.dirty[caller] = true
					}
					continue
				}
				target, known := work.memberNodes[endpoint.expression]
				if endpoint.kind == relativeEndpointExpression && len(endpoint.projection) == 0 && known {
					if sourceProjectedCallableInputsMapped(endpoint.expression, owner) {
						work.operationInvocation(facts, caller, target, call, cut)
						continue
					}
					if work.currentStagedResultCreating(alternative) && work.registerReturnedInvocation(facts, caller, alternative, call, owner) {
						continue
					}
				}
				// A known but unprovided input domain is compiler work, never a new
				// runtime-unknown invocation or a completed captured activation.
				producer := caller
				if known {
					producer = target
				}
				edge := fmt.Sprintf("%s:binding-invocation-inputs:%d:%p", fact.summary.ID, call.Pos(), endpoint.expression)
				work.requireStagedSummary(facts, caller, producer, edge, call, cut)
				work.stagedRequired[sourceStagedDependencyKey{caller, edge}].projectionPending = true
			}
		}
	}
}
