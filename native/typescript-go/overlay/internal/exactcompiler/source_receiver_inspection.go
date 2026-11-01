package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceInstalledReceiverCall belongs only to the actual selected input installation.
// It retains routing and original captures, never execution completion or a return receipt.
// The query restores it when the selected body consumer exits, including nested calls.
type sourceInstalledReceiverCall struct {
	operation      *ast.Node
	parent, inputs *sourceValueInputs
	selection      sourceInvocationBody
	slot           *sourceNormalOperation
}

// sourceReceiverInspection names one admitted Get of an actually installed input.
// Observation identity keeps its original value/scope/input/return together. Neither
// this view nor the consumed Call grants a clean receiver or property completion.
type sourceReceiverInspection struct {
	call        *sourceInstalledReceiverCall
	consumed    *sourceConsumedCallInputs
	observation *sourceObservedValue
	get         *ast.Node
	slot        *sourceNormalOperation
	key         string
}

// receiverInspectionFor derives only from the current actual binding producer.
// Projection paths select a key already acquired by this Get, not an activation.
func (query *sourceValueQuery) receiverInspectionFor(original *sourceObservedValue, value sourceValue, projection []string, name string, result *accessorCandidates) *sourceReceiverInspection {
	call, operation := query.installedReceiverCall, query.operation
	if query.protectedMember == nil || !ast.IsPropertyAccessExpression(query.protectedMember) && !ast.IsElementAccessExpression(query.protectedMember) {
		return nil
	}
	if original == nil || original.inputs == nil || original.value.node == nil || original.value.undefined || len(original.value.path) != 0 || value.node != original.value.node || len(value.path) != 0 || call == nil || operation == nil || query.inputs != call.inputs || operation.inputs != call.inputs || operation.owner != call.selection.declaration || operation.node != query.protectedMember {
		return nil
	}
	consumed := call.inputs.consumedCall
	if consumed == nil || !consumed.entered || consumed.operation != call.operation || consumed.declaration != call.selection.declaration || consumed.inputs != call.inputs || consumed.parent != call.parent {
		return nil
	}
	slot := query.normalOperation(query.protectedMember, false)
	if slot == nil || slot.state != sourceOperationInProgress {
		return nil
	}
	key, ok := receiverInspectionKey(projection, name)
	if !ok {
		return nil
	}
	for _, values := range call.inputs.bindings {
		if !query.charge(result, query.protectedMember) {
			return nil
		}
		for _, bound := range values {
			if !query.charge(result, bound.node) {
				return nil
			}
			if bound.acquired == original && bound.node == value.node && len(bound.path) == 0 {
				return &sourceReceiverInspection{call: call, consumed: consumed, observation: original, get: query.protectedMember, slot: slot, key: key}
			}
		}
	}
	return nil
}

func receiverInspectionKey(projection []string, name string) (string, bool) {
	if len(projection) == 1 && name == "" && projection[0] != "" {
		return projection[0], true
	}
	if len(projection) == 0 && name != "" {
		return name, true
	}
	return "", false
}

// receiverInspectionInputs authorizes only readonly write inspection of this
// exact installed Call. An indexed occurrence alone cannot enter a body. Missing
// or mismatched views leave the existing conservative bodyless/foreign path intact.
func (query *sourceValueQuery) receiverInspectionInputs(node, origin *ast.Node, projection []string, name string, result *accessorCandidates) (*sourceReceiverInspection, bool) {
	view := query.receiverInspection
	if view == nil || !query.charge(result, node) {
		return nil, false
	}
	call := view.call
	if call == nil || query.installedReceiverCall != call || node == nil || !ast.IsCallExpression(node) || node != call.operation || query.invoking != node || call.inputs == nil || call.parent == nil || call.inputs.invocation != node || call.parent.operations[node] != call.slot || call.slot == nil || call.slot.state != sourceOperationInProgress || call.slot.selected == nil || call.inputs.declaration != call.selection.declaration || view.consumed == nil || call.inputs.consumedCall != view.consumed || !view.consumed.entered || view.consumed.operation != node || view.consumed.declaration != call.selection.declaration || view.consumed.inputs != call.inputs || view.consumed.parent != call.parent {
		return nil, false
	}
	if view.get == nil || !ast.IsPropertyAccessExpression(view.get) && !ast.IsElementAccessExpression(view.get) || query.protectedMember != view.get || call.inputs.operations[view.get] != view.slot || view.slot == nil || view.slot.state != sourceOperationInProgress || view.observation == nil || view.observation.inputs == nil || query.inputs != view.observation.inputs || view.observation.value.node != origin || len(view.observation.value.path) != 0 {
		return nil, false
	}
	key, ok := receiverInspectionKey(projection, name)
	if !ok || key != view.key {
		return nil, false
	}
	return view, true
}
