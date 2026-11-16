package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// describeStagedNativeEagerInputs describes the inert construction and primitive
// key conversion of an already selected direct reflective alternative. The live
// owner authenticates selection separately. Descriptor field Gets, algorithm
// work and callee acquisition remain independently required. Deferred accessor
// and callback bodies are not executed by constructing the descriptor.
func describeStagedNativeEagerInputs(selection sourceStagedNativeSelection) (sourceStagedNativeEagerInputs, bool) {
	installation, valid := describeSelectedNativeInstallation(selection)
	if !valid {
		return sourceStagedNativeEagerInputs{}, false
	}
	actuals := []sourceRelativeEndpoint{installation.target, installation.key, installation.descriptor}
	if !stagedNativeEagerActualsInert(selection.call, actuals) {
		return sourceStagedNativeEagerInputs{}, false
	}
	source := sourceStagedNativeGetSource{request: selection.request, get: selection.get}
	return sourceStagedNativeEagerInputs{request: nativeRootDebtRequest(&source, "eager-inputs"), actuals: actuals}, true
}

// validStagedNativeEagerInputs checks detached proof correlation, not source
// authentication. The eager root phase is independent of descriptor admission,
// so its original descriptor occurrence may not have been attached yet. No
// selected value, query, scope or normal-completion capability is reconstructed.
func validStagedNativeEagerInputs(plan sourceStagedNativeEagerInputs, source *sourceStagedNativeGetSource) bool {
	if source == nil || !sameOperationRequest(plan.request, nativeRootDebtRequest(source, "eager-inputs")) {
		return false
	}
	request := source.request
	call := request.producer.operation
	if call == nil || !ast.IsCallExpression(call) || source.get != call.Expression() || request.producer.declaration == nil || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || request.consumer != request.producer.declaration || request.inputs != nil || request.use != call || request.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) {
		return false
	}
	if source.kind == sourceNativeObjectFreeze {
		return source.input != nil && validStagedNativeInputPlan(*source.input, source) && len(plan.calls) != 0 && stagedLiteralCreationCallSyntax(plan)
	}
	if !reflectiveNative(source.kind) {
		return false
	}
	// Preserve the original source-owned target protocol. The additional
	// operation descriptions cannot narrow a previously authenticated eager
	// plan (notably an independently owned Object.prototype target Get).
	original := len(plan.operations) == 0 && (len(plan.calls) == 0 && !plan.targetPending && stagedNativeEagerActualsInert(call, plan.actuals) || len(plan.calls) != 0 && stagedNativeEagerCallSyntax(plan))
	if !original && !stagedReflectiveInputSyntax(plan, source) && !stagedDescriptorAliasEagerSyntax(plan, source) {
		return false
	}

	arguments := restrictedInvocationArguments(call.AsCallExpression())
	if source.descriptorGet != nil && source.descriptorGet != arguments[2] {
		return false
	}
	for _, actual := range plan.actuals {
		if actual.cut != request.cut {
			return false
		}
	}
	return true
}

// stagedNativeEagerActualsInert uses the shared language creation proof for each
// original argument. A fresh ordinary target cannot be a Proxy, and primitive
// key conversion invokes no authored hook. Unsupported construction stays owed.
func stagedNativeEagerActualsInert(call *ast.Node, actuals []sourceRelativeEndpoint) bool {
	if call == nil || !ast.IsCallExpression(call) || len(actuals) != 3 {
		return false
	}
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	if len(arguments) != 3 || !ast.IsObjectLiteralExpression(arguments[0]) || !sourcePrimitiveValue(arguments[1]) {
		return false
	}
	for index, actual := range actuals {
		if ast.IsSpreadElement(arguments[index]) || actual.kind != relativeEndpointExpression || actual.expression != arguments[index] || actual.producer != call || actual.get != nil || actual.creation != nil || actual.returning != nil || actual.role != (sourceRelativeRole{}) || actual.restPosition != 0 || len(actual.projection) != 0 || !sourceInertValueCreation(arguments[index]) {
			return false
		}
	}
	return true
}
