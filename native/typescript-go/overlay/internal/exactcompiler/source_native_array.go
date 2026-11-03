package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nativeArrayPushEffects consumes a selected standard alternative through the
// existing adapter routing and source-write owner. The actual this input, not
// the method's acquisition receiver, owns the mutation. Push stores its arguments
// without coercing them. Length/index access, setters, proxies and abrupt exits
// remain conservative where this source domain has no algorithm-specific model.
// This consumer emits no output receipt, exact contents or successful completion.
func (query *sourceValueQuery) nativeArrayPushEffects(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	call := node.AsCallExpression()
	plan := planOrdinaryInvocation(call.Expression, restrictedInvocationArguments(call), query.owner.checker, func(n *ast.Node) bool { return query.charge(result, n) })
	query.materializeInvocationVectors(node, plan, bindings, result)
	receiver := plan.receiver
	if !plan.adapted {
		receiver, _ = restrictedInvocationMember(unwrapSourceCallableReference(call.Expression), query.owner.checker)
	}
	// Generic receiver requirements belong to push's algorithm, not its identity.
	// Missing mappings cannot borrow the array from the earlier method Get.
	result.opaque, result.valueIncomplete = true, true
	if receiver == nil {
		return
	}
	for _, value := range query.originsAt(receiver, node, bindings, result) {
		result.writes = append(result.writes, sourceValueWrite{value: value, operation: stateEffectOperation("array-mutation")})
		query.recordFacts(1)
	}
}
