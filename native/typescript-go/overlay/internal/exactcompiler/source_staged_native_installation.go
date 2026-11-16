package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeInstallation describes a conditional nominal installation
// if one selected standard algorithm succeeds. Its original expression endpoints
// carry no target/key/prototype identity, converted descriptor, field exposure,
// normal completion, mutation or NoWrites authority. Storing a callable does not
// invoke it, and an ordinary target setter is not invoked by this relationship.
// No selected sourceValue, query, scope or live admission callback is retained.
type sourceStagedNativeInstallation struct {
	request                 sourceStagedOperationRequest
	target, key, descriptor sourceRelativeEndpoint
}

// describeSelectedNativeInstallation consumes a synchronously supplied selected
// alternative without recognizing syntax, types or signatures as a native.
// These checks correlate the direct original vector only. The live source owner
// separately authenticates selection and retains all authored/unknown siblings.
// Actual argument/key/Get/Proxy/descriptor/Throw work remains independently owed.
func describeSelectedNativeInstallation(selection sourceStagedNativeSelection) (sourceStagedNativeInstallation, bool) {
	var installation sourceStagedNativeInstallation
	request := selection.request
	if selection.selected.native == nil || !reflectiveNative(selection.selected.native.kind) || len(selection.selected.path) != 0 || selection.call == nil || !ast.IsCallExpression(selection.call) || selection.get != selection.call.Expression() || request.producer.declaration == nil || request.producer.operation != selection.call || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || request.consumer != request.producer.declaration || request.inputs != nil || request.use != selection.call || request.cut != (sourceRelativeCut{operation: selection.call, use: selection.call, reading: selection.call}) {
		return installation, false
	}
	arguments := restrictedInvocationArguments(selection.call.AsCallExpression())
	if len(arguments) != 3 || len(selection.actuals) != 3 || selection.descriptorGet != arguments[2] {
		return installation, false
	}
	for index, endpoint := range selection.actuals {
		if ast.IsSpreadElement(arguments[index]) || endpoint.kind != relativeEndpointExpression || endpoint.expression != arguments[index] || endpoint.producer != selection.call || endpoint.cut != request.cut || len(endpoint.projection) != 0 {
			return installation, false
		}
	}
	return sourceStagedNativeInstallation{request: request, target: cloneSourceRelativeEndpoint(selection.actuals[0]), key: cloneSourceRelativeEndpoint(selection.actuals[1]), descriptor: cloneSourceRelativeEndpoint(selection.actuals[2])}, true
}
