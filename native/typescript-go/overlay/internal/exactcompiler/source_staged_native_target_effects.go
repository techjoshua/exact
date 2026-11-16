package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeTargetEffects retains original target Get accounting only.
// Selection and live issuance remain central. This conveys no result, identity,
// normal completion, pristine-global, mutation or NoWrites authority.
type sourceStagedNativeTargetEffects struct {
	request    sourceStagedOperationRequest
	cut        sourceRelativeCut
	target     *ast.Node
	generation *projectGeneration
}

func nativeEagerTargetRequest(source *sourceStagedNativeGetSource) sourceStagedOperationRequest {
	if source == nil {
		return sourceStagedOperationRequest{}
	}
	request := source.request
	operation := request.producer.operation
	if operation == nil || !ast.IsCallExpression(operation) {
		return sourceStagedOperationRequest{}
	}
	actuals := restrictedInvocationArguments(operation.AsCallExpression())
	if len(actuals) != 3 {
		return sourceStagedOperationRequest{}
	}
	request.producer.selector = sourceStagedOperationSelector{occurrence: actuals[0], field: "eager-target"}
	request.edge += ":eager-target"
	return request
}

// validStagedNativeTargetEffects checks descriptive correlation to the exact
// graph request and original live target cut. The standard premise and native
// member owner supplied root/prototype identity before this detached check.
func validStagedNativeTargetEffects(proof sourceStagedNativeTargetEffects, source *sourceStagedNativeGetSource) bool {
	if source == nil || !reflectiveNative(source.kind) || source.standard.root == nil || source.standard.prototype == nil || !standardLibrarySource(ast.GetSourceFileOfNode(source.standard.root)) || !standardLibrarySource(ast.GetSourceFileOfNode(source.standard.prototype)) || proof.generation == nil || proof.target == nil || !ast.IsPropertyAccessExpression(proof.target) || !ast.IsIdentifier(proof.target.Expression()) || !sameOperationRequest(proof.request, nativeEagerTargetRequest(source)) {
		return false
	}
	call := source.request.producer.operation
	if call == nil || !ast.IsCallExpression(call) || source.get != call.Expression() || source.request.producer.declaration == nil || source.request.producer.kind != relativeDemandEffects || source.request.producer.selector != (sourceStagedOperationSelector{}) || source.request.consumer != source.request.producer.declaration || source.request.inputs != nil || source.request.use != call || source.request.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) {
		return false
	}
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	return len(arguments) == 3 && arguments[0] == proof.target && proof.request.producer.selector.occurrence == proof.target && proof.cut == (sourceRelativeCut{operation: proof.target, reading: proof.target})
}

// describeStagedNativeTargetEffects consumes already selected native provenance
// and completed original Get accounting. A retained conditional seed alone is
// insufficient. Unknown/authored/effectful siblings remain independently owed.
func describeStagedNativeTargetEffects(source *sourceStagedNativeGetSource, selected sourceValue, result *accessorCandidates, cut sourceRelativeCut, generation *projectGeneration) (sourceStagedNativeTargetEffects, bool) {
	proof := sourceStagedNativeTargetEffects{request: nativeEagerTargetRequest(source), cut: cut, target: cut.operation, generation: generation}
	if !validStagedNativeTargetEffects(proof, source) || selected.native == nil || selected.native.kind != sourceNativeObjectPrototype || selected.node != source.standard.prototype || selected.native.acquired != proof.target.Expression() || selected.native.referencesIncomplete || len(selected.path) != 0 || !stagedNativeCalleeEffectsRepresented(selected, result) {
		return sourceStagedNativeTargetEffects{}, false
	}
	// Additional source protocols are not covered by the callee's initial domain.
	if result.thenIncomplete || len(result.writeOutcomes)+len(result.owned)+len(result.ownedGets)+len(result.ownedClaims)+len(result.thenReferences) != 0 {
		return sourceStagedNativeTargetEffects{}, false
	}
	// This source owner also reports an independent descriptor-integrity
	// verdict for the standard global entry. Top is not an executed effect and
	// cannot be promoted to NoWrites or made an Effects prerequisite.
	for _, descriptor := range result.nativeDescriptorEffects {
		if descriptor.kind != sourceStandardObjectEntry || descriptor.acquired != proof.target.Expression() {
			return sourceStagedNativeTargetEffects{}, false
		}
	}
	return proof, true
}
