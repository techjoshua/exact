package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// describeStagedNativeEagerCallInputs describes source-ordered initializer Calls
// within the original selected descriptor construction. It consumes no result,
// creates no B delivery and schedules no work. Central must independently bind
// every original Call and require its canonical summary before eager closure.
func describeStagedNativeEagerCallInputs(selection sourceStagedNativeSelection, caller *callableFacts, owner *executableBodyOwner) (sourceStagedNativeEagerInputs, bool) {
	actuals, valid := describeStagedNativeEagerCallActuals(selection, caller, owner)
	if !valid {
		return sourceStagedNativeEagerInputs{}, false
	}
	calls, valid := describeStagedEagerCallConstruction(actuals, caller, owner)
	if !valid {
		return sourceStagedNativeEagerInputs{}, false
	}
	source := sourceStagedNativeGetSource{request: selection.request, get: selection.get}
	return sourceStagedNativeEagerInputs{request: nativeRootDebtRequest(&source, "eager-inputs"), actuals: actuals, calls: calls}, true
}

// describeStagedNativeEagerCallPrefix retains represented initializer Calls
// beside an unrepresented target. It makes no target-effect or completion claim.
// Central must require the separate target owner before eager closure.
func describeStagedNativeEagerCallPrefix(selection sourceStagedNativeSelection, caller *callableFacts, owner *executableBodyOwner) (sourceStagedNativeEagerInputs, bool) {
	actuals, valid := describeStagedNativeEagerCallActuals(selection, caller, owner)
	if !valid || ast.IsObjectLiteralExpression(actuals[0].expression) && sourceInertValueCreation(actuals[0].expression) {
		return sourceStagedNativeEagerInputs{}, false
	}
	calls, valid := describeStagedEagerDescriptorCalls(actuals, caller, owner)
	if !valid {
		return sourceStagedNativeEagerInputs{}, false
	}
	source := sourceStagedNativeGetSource{request: selection.request, get: selection.get}
	return sourceStagedNativeEagerInputs{request: nativeRootDebtRequest(&source, "eager-inputs"), actuals: actuals, calls: calls, targetPending: true}, true
}

// describeStagedNativeEagerCallActuals correlates only the already selected
// original vector. Shared language traversal grants no native selection rights.
func describeStagedNativeEagerCallActuals(selection sourceStagedNativeSelection, caller *callableFacts, owner *executableBodyOwner) ([]sourceRelativeEndpoint, bool) {
	installation, valid := describeSelectedNativeInstallation(selection)
	if !valid || caller == nil || owner == nil || owner.values == nil || owner.checker == nil || caller.node != selection.request.producer.declaration || caller.sourceFile != ast.GetSourceFileOfNode(selection.call) {
		return nil, false
	}
	actuals := []sourceRelativeEndpoint{installation.target, installation.key, installation.descriptor}
	for _, actual := range actuals {
		canonical := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actual.expression, producer: selection.call, cut: selection.request.cut}
		if !sameOperationEndpoint(actual, canonical) {
			return nil, false
		}
	}
	return actuals, true
}

// describeStagedEagerCallConstruction describes only language-level argument
// creation and ordered initializer Calls. It recognizes no native or selection,
// mutates no request and grants no binding, result or publication authority.
func describeStagedEagerCallConstruction(actuals []sourceRelativeEndpoint, caller *callableFacts, owner *executableBodyOwner) ([]sourceStagedNativeEagerCall, bool) {
	if len(actuals) != 3 || actuals[0].expression == nil || !ast.IsObjectLiteralExpression(actuals[0].expression) || !sourceInertValueCreation(actuals[0].expression) {
		return nil, false
	}
	return describeStagedEagerDescriptorCalls(actuals, caller, owner)
}

// describeStagedEagerDescriptorCalls covers key/descriptor creation only. The
// caller separately owns target representation, so no target is evaluated here.
func describeStagedEagerDescriptorCalls(actuals []sourceRelativeEndpoint, caller *callableFacts, owner *executableBodyOwner) ([]sourceStagedNativeEagerCall, bool) {
	if len(actuals) != 3 || caller == nil || caller.node == nil || owner == nil || owner.values == nil || owner.checker == nil {
		return nil, false
	}
	for _, actual := range actuals {
		if actual.expression == nil {
			return nil, false
		}
	}
	if !sourcePrimitiveValue(actuals[1].expression) || !sourceInertValueCreation(actuals[1].expression) || !ast.IsObjectLiteralExpression(actuals[2].expression) {
		return nil, false
	}
	var calls []sourceStagedNativeEagerCall
	for _, property := range actuals[2].expression.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) || property.Name() == nil || ast.IsComputedPropertyName(property.Name()) || callableNameText(property.Name()) == "__proto__" {
			return nil, false
		}
		initializer := property.AsPropertyAssignment().Initializer
		if sourceInertValueCreation(initializer) {
			continue
		}
		if initializer == nil || !ast.IsCallExpression(initializer) || len(restrictedInvocationArguments(initializer.AsCallExpression())) != 0 {
			return nil, false
		}
		invocation, gap := describeStagedDeclarationInvocation(caller, initializer, owner.checker, owner)
		if gap != stagedCallSupported || len(invocation.declaration.Parameters()) != 0 || len(invocation.actuals) != 0 || len(invocation.captures) != 0 || !stagedFieldGetterInputsMapped(invocation.declaration, nil, owner) {
			return nil, false
		}
		calls = append(calls, sourceStagedNativeEagerCall{actual: 2, property: property, invocation: invocation})
	}
	if len(calls) == 0 {
		return nil, false
	}
	return calls, true
}
