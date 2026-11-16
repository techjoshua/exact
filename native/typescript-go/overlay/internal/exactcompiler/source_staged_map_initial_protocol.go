package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMapInitialProtocol describes Effects/source coverage only. It is
// not a key list, current descriptor, property presence or normal outcome.
type sourceStagedMapInitialProtocol struct {
	keysAccounted, enumerabilityAccounted bool
}

// describeStagedMapInitialProtocol consumes the original immediate-creation
// association after its writer/source disposition. The caller must authenticate
// the exact current graph receipt. Matching metadata here grants no live rights.
// The boolean checks association only. Flags may remain false for an otherwise
// valid association with unfinished source population or entry ordering.
// Computed-key evaluation/coercion and all initializer effects remain with the
// original eager input owner, independently of this ordinary-object protocol.
func describeStagedMapInitialProtocol(source *sourceStagedNativeGetSource, receipt sourceStagedMapWriterDisposition) (sourceStagedMapInitialProtocol, bool) {
	result := sourceStagedMapInitialProtocol{}
	if source == nil || source.descriptorMap == nil || receipt.generation == nil || receipt.group == nil || !ast.IsObjectLiteralExpression(receipt.group) || receipt.group != source.descriptorMap.descriptors.expression || !sameOperationRequest(receipt.request, source.descriptorMap.protocol) || !validNativeDescriptorMapRecipe(sourceStagedOperationRecipe{key: source.descriptorMap.protocol.producer, nativeGet: source}) {
		return result, false
	}
	call := source.request.producer.operation
	expected := sourceRelativeCut{operation: call, reading: call}
	if runtimeModuleEvaluation(source.request.producer.declaration) {
		expected.use = call
	}
	if receipt.cut != expected {
		return result, false
	}
	result.keysAccounted, result.enumerabilityAccounted = true, true
	for _, member := range receipt.group.AsObjectLiteralExpression().Properties.Nodes {
		key := member.Name()
		if key == nil || ast.IsSpreadAssignment(member) {
			return sourceStagedMapInitialProtocol{}, true
		}
		if !ast.IsComputedPropertyName(key) && callableNameText(key) == "__proto__" {
			// Only colon PropertyAssignment has special prototype creation semantics.
			// Other forms are own entries. The current original observer omits those
			// too, so neither omission may be promoted into population coverage here.
			return sourceStagedMapInitialProtocol{}, true
		}
		switch {
		case ast.IsPropertyAssignment(member), ast.IsMethodDeclaration(member):
		case ast.IsShorthandPropertyAssignment(member):
			if member.AsShorthandPropertyAssignment().ObjectAssignmentInitializer != nil {
				return sourceStagedMapInitialProtocol{}, true
			}
		case ast.IsGetAccessorDeclaration(member), ast.IsSetAccessorDeclaration(member):
			// Entry Get can execute a getter that changes a later descriptor. Keep
			// enumerability/order pending rather than reconstructing current state.
			result.enumerabilityAccounted = false
		default:
			return sourceStagedMapInitialProtocol{}, true
		}
	}
	return result, true
}
