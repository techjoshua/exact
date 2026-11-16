package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedEagerRequirement is graph-local delivery state. Source templates
// retain only the ordered description, never this binder packet or work cursor.
type sourceStagedEagerRequirement struct {
	call               sourceStagedNativeEagerCall
	edge               string
	inputs             *sourceRelativeInputEdge
	ready, transferred bool
}

// stagedNativeEagerCallSyntax checks a detached construction recipe, not source
// selection. Live admission and every new graph authenticate the declaration
// through the existing source selector and original synchronous binder.
func stagedNativeEagerCallSyntax(plan sourceStagedNativeEagerInputs) bool {
	if len(plan.actuals) == 1 {
		return stagedLiteralCreationCallSyntax(plan)
	}
	if len(plan.actuals) != 3 || len(plan.calls) == 0 {
		return false
	}
	call := plan.request.producer.operation
	if call == nil || !ast.IsCallExpression(call) {
		return false
	}
	args := restrictedInvocationArguments(call.AsCallExpression())
	if len(args) != 3 {
		return false
	}
	targetCovered := ast.IsObjectLiteralExpression(args[0]) && sourceInertValueCreation(args[0])
	if plan.targetPending == targetCovered || !sourcePrimitiveValue(args[1]) || !sourceInertValueCreation(args[1]) || !ast.IsObjectLiteralExpression(args[2]) {
		return false
	}
	for i, actual := range plan.actuals {
		expected := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: args[i], producer: call, cut: plan.request.cut}
		if !sameOperationEndpoint(actual, expected) {
			return false
		}
	}
	next := 0
	for _, property := range args[2].AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) || property.Name() == nil || ast.IsComputedPropertyName(property.Name()) || callableNameText(property.Name()) == "__proto__" {
			return false
		}
		initializer := property.AsPropertyAssignment().Initializer
		if sourceInertValueCreation(initializer) {
			continue
		}
		if next == len(plan.calls) {
			return false
		}
		item := plan.calls[next]
		if !stagedEagerCallPosition(item, initializer, property, 2) {
			return false
		}
		next++
	}
	return next == len(plan.calls)
}

func (work *callableEffectWork) prepareNativeEagerCalls(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	state := &work.operations[id.index]
	source := work.operationRecipes[state.key].nativeGet
	if source == nil || source.eager == nil || !validStagedNativeEagerInputs(*source.eager, source) {
		return
	}
	consumer := work.memberNodes[source.request.consumer]
	if !work.requireNativeEagerTarget(facts, id) {
		return
	}
	state = &work.operations[id.index]
	if !state.eagerRegistered {
		state.eagerRegistered = true
		// All required memberships precede any original binder traversal.
		for _, call := range source.eager.calls {
			edge := fmt.Sprintf("%s:eager-call:%d", source.request.edge, call.invocation.operation.Pos())
			state.eagerCalls = append(state.eagerCalls, sourceStagedEagerRequirement{call: call, edge: edge})
			if target, ok := work.memberNodes[call.invocation.declaration]; ok {
				work.requireStagedSummary(facts, consumer, target, edge, call.invocation.operation, call.invocation.cut)
			}
		}
		for i := range state.eagerCalls {
			requirement := &state.eagerCalls[i]
			target, found := work.memberNodes[requirement.call.invocation.declaration]
			membership := work.stagedRequired[sourceStagedDependencyKey{consumer: consumer, edge: requirement.edge}]
			if !found || membership == nil || membership.invalid || membership.producer != target || membership.operation != requirement.call.invocation.operation || membership.cut != requirement.call.invocation.cut {
				continue
			}
			described, gap := describeStagedDeclarationInvocation(&facts[consumer], requirement.call.invocation.operation, owner.checker, owner)
			if gap != stagedCallSupported || described.declaration != requirement.call.invocation.declaration || len(described.actuals)+len(described.captures) != 0 {
				continue
			}
			inputs, ok := bindStagedDeclarationInputs(&facts[consumer], described, owner)
			if !ok || !inputs.delivered || inputs.request.operation != requirement.call.invocation.operation || inputs.request.declaration != described.declaration || !sameSourceRelativeInputEnvelope(inputs.request, inputs.bound) {
				continue
			}
			requirement.inputs = inputs
		}
	}
	work.deliverNativeEagerCalls(facts, id, owner)
	if !work.prepareNativeEagerSources(facts, id, owner) {
		return
	}
	state = &work.operations[id.index]
	source = work.operationRecipes[state.key].nativeGet
	complete := len(state.eagerCalls) == len(source.eager.calls) && validNativeEagerSources(source) && len(source.eager.operations) == len(source.eagerSources) && work.nativeEagerKeyCurrent(source)
	for _, requirement := range state.eagerCalls {
		complete = complete && requirement.inputs != nil
	}
	if complete && !state.delta.extracted {
		state.delta = work.operationRecipes[state.key].delta
		state.delta.extracted = true
		state.revision++
		work.notifyOperationSubscribers(state)
	}
}

func (work *callableEffectWork) deliverNativeEagerCalls(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	state := &work.operations[id.index]
	source := work.operationRecipes[state.key].nativeGet
	if source == nil {
		return
	}
	consumer := work.memberNodes[source.request.consumer]
	for i := range state.eagerCalls {
		requirement := &state.eagerCalls[i]
		target, found := work.memberNodes[requirement.call.invocation.declaration]
		if !found || requirement.inputs == nil {
			continue
		}
		requirement.ready = facts[target].staged.ready
		if !requirement.ready || requirement.transferred {
			continue
		}
		work.operationInvocationOnEdge(facts, consumer, target, requirement.call.invocation.operation, requirement.call.invocation.cut, requirement.edge)
		if facts[consumer].fieldEdgeOperations == nil {
			facts[consumer].fieldEdgeOperations = make(map[string]*ast.Node)
		}
		facts[consumer].fieldEdgeOperations[requirement.edge] = requirement.call.invocation.operation
		requirement.transferred = true
	}
}
