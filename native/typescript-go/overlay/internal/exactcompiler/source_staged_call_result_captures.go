package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// currentStagedResultCreating checks the original creating edge still belongs
// to this graph's source Call. A copied binder packet cannot acquire capture
// authority merely by preserving its request or endpoint fields.
func (work *callableEffectWork) currentStagedResultCreating(alternative sourceStagedOperationAlternative) bool {
	edge, endpoint := alternative.creating, alternative.endpoint
	if edge == nil || !edge.delivered || endpoint.kind != relativeEndpointExpression || endpoint.creation != edge.request.operation || endpoint.producer != edge.request.declaration || endpoint.cut != edge.request.cut || endpoint.returning == nil || endpoint.expression == nil || len(endpoint.projection) != 0 {
		return false
	}
	caller, known := work.memberNodes[enclosingCallableNode(edge.request.operation)]
	if !known || caller >= len(work.operationFacts) {
		return false
	}
	for _, call := range work.operationFacts[caller].staged.calls {
		if call.inputs == edge && call.sourceInputs == nil && call.invocation.operation == endpoint.creation && call.invocation.declaration == endpoint.producer && validStagedDataResultCall(call) {
			return true
		}
	}
	return false
}

// stagedCapturedCallResult transports an original returned literal with its
// already delivered creating B. It does not resolve captures or invoke a body.
// Source-only packets cannot stand in for the creating binder, and completed
// local state, written formals, receivers and parameter activation retain their
// own pending producer requirements.
func stagedCapturedCallResult(branch sourceStagedCallReturnBranch, association sourceStagedDeclarationCall, owner *executableBodyOwner) (sourceStagedOperationAlternative, bool) {
	edge := association.inputs
	literal := branch.endpoint.expression
	if edge == nil || !edge.delivered || !validStagedDataResultCall(association) || literal == nil || !isWriterInputCallable(literal) || len(literal.Parameters()) != 0 || branch.endpoint.creation != edge.request.operation || branch.endpoint.cut != edge.request.cut {
		return sourceStagedOperationAlternative{}, false
	}
	if async, ordinary := ordinaryResultCategory(literal); async || !ordinary {
		return sourceStagedOperationAlternative{}, false
	}
	for _, template := range describeStagedReturnTemplates(edge.request.declaration, owner.values) {
		if template.callable != literal || template.returning != branch.returning || template.unknown || len(template.captures) == 0 {
			continue
		}
		for _, capture := range template.captures {
			binding := capture.binding
			if capture.kind != relativeRoleCapture || binding == nil || !ast.IsParameterDeclaration(binding) || enclosingCallableNode(binding) != edge.request.declaration || binding.Initializer() != nil || binding.AsParameterDeclaration().DotDotDotToken != nil {
				return sourceStagedOperationAlternative{}, false
			}
			symbol := owner.checker.GetSymbolAtLocation(binding.Name())
			if symbol == nil || symbol.ValueDeclaration != binding || owner.values.bindingWritten(symbol) {
				return sourceStagedOperationAlternative{}, false
			}
		}
		value, matched := instantiateStagedReturnTemplate(template, edge.relative)
		if matched {
			return stagedReturnedOperationAlternative(value, edge)
		}
	}
	return sourceStagedOperationAlternative{}, false
}
