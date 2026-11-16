package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeDescriptorMapPlan requires the original ordered map
// protocol independently of its conditional target association. No entries,
// descriptors, values, successful definitions or local readiness follow from
// this plan. Original map owners supply entry Get anchors and alternatives.
// Each entry conversion requires its six field roles before target definitions.
// All conversions precede writes, with Throw and Proxy work separately owned.
type sourceStagedNativeDescriptorMapPlan struct {
	argumentSource      *sourceStagedNativeArgumentDescription // Immutable source association; no current authority.
	argumentOrder       *sourceStagedNativeArgumentOrder       // Current graph only; cleared when extraction is cloned.
	algorithm, protocol sourceStagedOperationRequest
	target, descriptors sourceRelativeEndpoint
}

// describeSelectedNativeDescriptorMap correlates an already selected standard
// algorithm with its original two inputs. It does not interpret a map literal,
// acquire a property, infer empty/absent work or invoke stored callable values.
// Authored/unknown alternatives stay independent. Live selection/admission and
// source-owned OwnKeys/enumerability/Get dispositions remain central obligations.
func describeSelectedNativeDescriptorMap(selection sourceStagedNativeSelection) (sourceStagedNativeDescriptorMapPlan, bool) {
	var plan sourceStagedNativeDescriptorMapPlan
	selected, request := selection.selected, selection.request
	call := selection.call
	if selected.native == nil || selected.native.kind != sourceNativeObjectDefineProperties || selected.node == nil || selected.node.Kind != ast.KindMethodSignature || !standardLibrarySource(ast.GetSourceFileOfNode(selected.node)) || len(selected.path) != 0 || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || selection.get != call.Expression() || request.producer.declaration == nil || request.producer.operation != call || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || request.consumer != request.producer.declaration || request.inputs != nil || request.use != call || request.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) {
		return plan, false
	}
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	if len(arguments) != 2 || len(selection.actuals) != 2 {
		return plan, false
	}
	for index, argument := range arguments {
		if ast.IsSpreadElement(argument) || !sameOperationEndpoint(selection.actuals[index], sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: argument, producer: call, cut: request.cut}) {
			return plan, false
		}
	}
	source := sourceStagedNativeGetSource{request: request, get: selection.get}
	protocol := request
	protocol.producer.selector = sourceStagedOperationSelector{occurrence: arguments[1], field: "descriptor-map"}
	protocol.edge += ":descriptor-map"
	return sourceStagedNativeDescriptorMapPlan{argumentSource: selection.argumentSource, argumentOrder: selection.argumentOrder, algorithm: nativeRootDebtRequest(&source, "algorithm"), protocol: protocol, target: cloneSourceRelativeEndpoint(selection.actuals[0]), descriptors: cloneSourceRelativeEndpoint(selection.actuals[1])}, true
}
