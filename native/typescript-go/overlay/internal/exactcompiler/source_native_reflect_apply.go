package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// reflectApplyEffects uses an already acquired standard Reflect.apply alternative.
// The original argument occurrence supplies the callback and its creating scope.
// The ordinary binder receives thisArg and the vector's elements, with no claim
// to a normal result or successful entry for an unresolved array-like vector.
func (query *sourceValueQuery) reflectApplyEffects(node *ast.Node, bindings sourceValueBindings, consumer sourceInvocationConsumer, result *accessorCandidates) {
	result.opaque, result.valueIncomplete = true, true
	if !query.dependenciesOnly || consumer.body == nil || query.returnObservation != nil {
		return
	}
	args := restrictedInvocationArguments(node.AsCallExpression())
	if len(args) < 3 || ast.IsSpreadElement(args[0]) || ast.IsSpreadElement(args[1]) || ast.IsSpreadElement(args[2]) {
		return
	}
	vector := unwrapSourceCallableReference(args[2])
	if sourcePrimitiveValue(vector) || ast.IsIdentifier(vector) && query.owner.checker.IsUndefinedSymbol(query.owner.checker.GetSymbolAtLocation(vector)) {
		return // Reflect.apply throws on these vectors, before calling the target.
	}
	plan := ordinaryInvocationPlan{target: args[0], receiver: args[1], vectors: args[2:3]}
	if ast.IsArrayLiteralExpression(vector) {
		plan.actuals = vector.AsArrayLiteralExpression().Elements.Nodes
		if plan.actuals == nil {
			plan.actuals = []*ast.Node{}
		}
		// The shared binder keeps fixed positions before the first spread.
		for _, element := range plan.actuals {
			if !query.charge(result, element) || ast.IsOmittedExpression(element) {
				plan.actuals = nil
				break
			}
		}
	}
	query.withActiveInvocation(node, func() {
		part := accessorCandidates{}
		var acquired accessorCandidates
		var abrupt bool
		func() {
			previous := query.reflectApplyTarget
			query.reflectApplyTarget = args[0]
			defer func() { query.reflectApplyTarget = previous }()
			targets, available := query.actualArgumentValues(node, args[0], &part)
			if !available {
				targets = query.originsAt(args[0], args[0], bindings, &part)
			}
			acquired, abrupt = query.acquireNativeCallbackArgument(node, args[0], targets, bindings)
		}()
		mergeAccessorCandidates(&part, acquired)
		noncallable := !acquired.opaque && !acquired.valueIncomplete && !acquired.receiverIncomplete &&
			!acquired.fieldReceiverIncomplete && !acquired.thenIncomplete && sourceValuesNoncallable(acquired.values)
		if !abrupt && !noncallable && !query.materializeInvocationVectors(node, plan, bindings, &part) {
			for index, value := range acquired.values {
				if !query.charge(&part, value.node) {
					break
				}
				body := value.node
				if len(value.path) != 0 || body == nil || !ast.IsFunctionLike(body) || !query.sourceCallableImplementation(body, &part) {
					continue
				}
				scope, scoped := acquired.callableScopes[index]
				if !scoped && value.capture != nil {
					scope = *value.capture
				}
				query.invokeAcquiredWithPlan(body, node, bindings, scope, &part, false, consumer, nil, &plan, value.acquired)
			}
		}
		mergeAccessorCandidates(result, part)
	})
}
