package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// validStagedNativeInputPlan checks immutable transport correlation only. The
// live selected member owner, not this validator, authenticates the algorithm.
func validStagedNativeInputPlan(plan sourceStagedNativeInputPlan, source *sourceStagedNativeGetSource) bool {
	if source == nil || source.kind != sourceNativeObjectFreeze && source.kind != sourceNativeObjectCreate && source.kind != sourceNativeSymbolFor || plan.kind != source.kind || !sameOperationRequest(plan.request, nativeRootDebtRequest(source, "algorithm")) {
		return false
	}
	call := source.request.producer.operation
	if call == nil || !ast.IsCallExpression(call) || source.get != call.Expression() {
		return false
	}
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	if plan.bindingData.producer.operation != nil || source.kind == sourceNativeObjectFreeze && ast.IsIdentifier(plan.input.expression) {
		return validNativeInputBindingPlan(plan, source)
	}
	return len(arguments) == 1 && (source.kind == sourceNativeObjectCreate || source.kind == sourceNativeSymbolFor || ast.IsObjectLiteralExpression(arguments[0]) || ast.IsCallExpression(arguments[0])) && sameOperationEndpoint(plan.input, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: arguments[0], producer: call, cut: source.request.cut})
}

// stagedLiteralInputEffects covers ordinary literal creation, including lexical
// reads without value acquisition. Reading a formal is not invoking its value.
// Context/global/import reads, computed/spread properties and input Calls retain
// their existing owners. Deferred getter, method and callback bodies stay dormant.
// Abrupt lexical initialization remains possible. This is never a normal receipt.
func stagedLiteralInputEffects(node *ast.Node, owner *executableBodyOwner) bool {
	if node == nil || owner == nil || owner.checker == nil {
		return false
	}
	node = unwrapSourceCallableReference(node)
	if ast.IsIdentifier(node) {
		symbol := owner.checker.GetSymbolAtLocation(node)
		if node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) {
			symbol = owner.checker.GetShorthandAssignmentValueSymbol(node.Parent)
		}
		if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil {
			return false
		}
		declaration := symbol.ValueDeclaration
		if ast.GetSourceFileOfNode(declaration) != ast.GetSourceFileOfNode(node) || ast.GetCombinedModifierFlags(declaration)&ast.ModifierFlagsAmbient != 0 || !ast.IsVariableDeclaration(declaration) && !ast.IsParameterDeclaration(declaration) && !ast.IsFunctionDeclaration(declaration) {
			return false
		}
		if _, context := contextBindingReferenceEffect(symbol, ast.GetSourceFileOfNode(node), owner.checker); context {
			return false
		}
		return true
	}
	if !ast.IsObjectLiteralExpression(node) {
		return sourceInertValueCreation(node)
	}
	for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
		if property.Name() == nil || ast.IsComputedPropertyName(property.Name()) {
			return false
		}
		switch {
		case ast.IsPropertyAssignment(property):
			if !stagedLiteralInputEffects(property.AsPropertyAssignment().Initializer, owner) {
				return false
			}
		case ast.IsShorthandPropertyAssignment(property):
			if property.AsShorthandPropertyAssignment().ObjectAssignmentInitializer != nil || !stagedLiteralInputEffects(property.Name(), owner) {
				return false
			}
		case ast.IsMethodDeclaration(property), ast.IsGetAccessorDeclaration(property), ast.IsSetAccessorDeclaration(property):
			// Ordinary object creation stores these bodies without invoking them.
		default:
			return false
		}
	}
	return true
}

// admitNativeInputEffects runs only inside the original selected-owner handoff.
// Freeze's literal algorithm and one-argument create do not invoke stored bodies.
// Its input construction and callee Get remain independently required. No value,
// integrity, successful completion or property/prototype identity is published.
func (work *callableEffectWork) admitNativeInputEffects(facts []callableFacts, source *sourceStagedNativeGetSource, selection sourceStagedNativeSelection, owner *executableBodyOwner) bool {
	plan, described := describeSelectedNativeInputCall(selection)
	if !described && validNativeInputBindingPlan(plan, source) {
		return work.admitNativeInputBinding(facts, source, plan, owner)
	}
	if !described || !validStagedNativeInputPlan(plan, source) {
		return false
	}
	attached := *source
	attached.input = &plan
	attached.inputEffects = stagedLiteralInputEffects(plan.input.expression, owner)
	if source.kind == sourceNativeObjectCreate {
		prototype, represented := describeStagedCreatePrototypeInput(plan.input, source.request.producer.declaration, owner.values)
		if !represented {
			return false
		}
		attached.prototype = &prototype
		attached.inputEffects = true // Source formal read or inert construction, not prototype Get.
	}
	if !attached.inputEffects {
		caller, found := work.memberNodes[source.request.consumer]
		if found {
			calls, supported := describeStagedLiteralCreation(plan.input.expression, &facts[caller], owner)
			if supported && len(calls) != 0 {
				attached.eager = &sourceStagedNativeEagerInputs{request: nativeRootDebtRequest(source, "eager-inputs"), actuals: []sourceRelativeEndpoint{cloneSourceRelativeEndpoint(plan.input)}, calls: calls}
			}
		}
	}
	for _, role := range []string{"algorithm", "eager-inputs"} {
		request := nativeRootDebtRequest(source, role)
		recipe, found := work.operationRecipes[request.producer]
		if !found || !sameNativeGetSource(recipe.nativeGet, source) {
			return false
		}
		recipe.nativeGet = &attached
		recipe.delta.extracted = role == "algorithm" && ast.IsObjectLiteralExpression(plan.input.expression) || attached.inputEffects
		if !work.admitNativeRootEffects(facts, recipe) {
			return false
		}
	}
	work.queueReflectiveResults(&attached)
	return true
}
