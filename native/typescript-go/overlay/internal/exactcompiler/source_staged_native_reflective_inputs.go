package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// describeStagedNativeReflectiveInputs describes complete supported descriptor
// construction for an already selected reflective alternative. Calls and native
// input operations retain separate original property positions. Eligibility
// does not authenticate children, deliver B, acquire results or settle Effects.
func describeStagedNativeReflectiveInputs(selection sourceStagedNativeSelection, caller *callableFacts, owner *executableBodyOwner) (sourceStagedNativeEagerInputs, bool) {
	return describeStagedNativeReflectiveKeyInputs(selection, caller, owner, nil)
}

func describeStagedNativeReflectiveKeyInputs(selection sourceStagedNativeSelection, caller *callableFacts, owner *executableBodyOwner, key *sourceStagedKeySource) (sourceStagedNativeEagerInputs, bool) {
	actuals, valid := describeStagedNativeEagerCallActuals(selection, caller, owner)
	if !valid {
		return sourceStagedNativeEagerInputs{}, false
	}
	target := actuals[0].expression
	targetPending := false
	if ast.IsObjectLiteralExpression(target) && sourceInertValueCreation(target) {
		// Target creation is represented independently of the algorithm's input use.
	} else if stagedReflectivePendingTarget(target) {
		targetPending = true
	} else {
		return sourceStagedNativeEagerInputs{}, false
	}
	if !(sourcePrimitiveValue(actuals[1].expression) && sourceInertValueCreation(actuals[1].expression) || key != nil && validNativeEagerKeyDescription(*key, actuals[1].expression)) || !ast.IsObjectLiteralExpression(actuals[2].expression) {
		return sourceStagedNativeEagerInputs{}, false
	}
	source := sourceStagedNativeGetSource{request: selection.request, get: selection.get}
	plan := sourceStagedNativeEagerInputs{request: nativeRootDebtRequest(&source, "eager-inputs"), actuals: actuals, targetPending: targetPending}
	for _, property := range actuals[2].expression.AsObjectLiteralExpression().Properties.Nodes {
		if property.Name() == nil || ast.IsComputedPropertyName(property.Name()) || callableNameText(property.Name()) == "__proto__" {
			return sourceStagedNativeEagerInputs{}, false
		}
		switch {
		case ast.IsMethodDeclaration(property), ast.IsGetAccessorDeclaration(property), ast.IsSetAccessorDeclaration(property):
			continue // Creating the descriptor stores these bodies without invoking them.
		case ast.IsShorthandPropertyAssignment(property):
			if property.AsShorthandPropertyAssignment().ObjectAssignmentInitializer != nil || !stagedLiteralInputEffects(property.Name(), owner) {
				return sourceStagedNativeEagerInputs{}, false
			}
			continue
		case !ast.IsPropertyAssignment(property):
			return sourceStagedNativeEagerInputs{}, false
		}
		initializer := property.AsPropertyAssignment().Initializer
		if stagedLiteralInputEffects(initializer, owner) {
			continue
		}
		if initializer == nil || !ast.IsCallExpression(initializer) {
			return sourceStagedNativeEagerInputs{}, false
		}
		invocation, gap := describeStagedDeclarationInvocation(caller, initializer, owner.checker, owner)
		if gap == stagedCallSupported && len(invocation.declaration.Parameters()) == 0 && len(invocation.actuals)+len(invocation.captures) == 0 && stagedFieldGetterInputsMapped(invocation.declaration, nil, owner) {
			plan.calls = append(plan.calls, sourceStagedNativeEagerCall{actual: 2, property: property, invocation: invocation})
			continue
		}
		if !stagedNativeInputEligible(initializer, caller, owner) {
			return sourceStagedNativeEagerInputs{}, false
		}
		plan.operations = append(plan.operations, sourceStagedNativeEagerOperation{actual: 2, property: property, operation: initializer})
	}
	return plan, true
}

// stagedReflectivePendingTarget describes an original operand whose Effects
// remain with a separate producer. A plain prototype Get is only inventory:
// the existing target owner must acquire and authenticate its selected source.
// This grants no target value, ordinary-object status or no-user-entry law.
func stagedReflectivePendingTarget(target *ast.Node) bool {
	if ast.IsIdentifier(target) || ast.IsCallExpression(target) {
		return true // Preserve the existing non-inert target domains.
	}
	return target != nil && ast.IsPropertyAccessExpression(target) && !ast.IsOptionalChain(target) && ast.IsIdentifier(target.Expression()) && callableNameText(target.Name()) == "prototype"
}
