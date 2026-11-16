package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// describeStagedEagerReturnCarriers transports known capture-free return
// templates through the supplied original B association. True validates only
// that descriptive association, never complete alternatives or normal return.
// Central must additionally authenticate creating's exact current graph pointer.
// Unknown/captured siblings remain with the ordinary Value producer.
func describeStagedEagerReturnCarriers(call sourceStagedNativeEagerCall, creating *sourceRelativeInputEdge, owner *sourceValueOwner) ([]sourceStagedOperationAlternative, bool) {
	invocation := call.invocation
	declaration, operation := invocation.declaration, invocation.operation
	if call.actual != 2 || call.property == nil || !ast.IsPropertyAssignment(call.property) || call.property.AsPropertyAssignment().Initializer != operation {
		return nil, false
	}
	if owner == nil || owner.checker == nil || owner.program == nil || creating == nil || !creating.delivered || declaration == nil || !ast.IsFunctionDeclaration(declaration) || declaration.Body() == nil || declaration.Parent == nil || !ast.IsSourceFile(declaration.Parent) || len(declaration.Parameters()) != 0 || operation == nil || !ast.IsCallExpression(operation) || !ast.IsIdentifier(operation.Expression()) || operation.AsCallExpression().QuestionDotToken != nil || len(restrictedInvocationArguments(operation.AsCallExpression())) != 0 || !invocation.actualsKnown || len(invocation.actuals)+len(invocation.captures) != 0 || !sameOperationEndpoint(invocation.receiver, sourceRelativeEndpoint{}) {
		return nil, false
	}
	source := ast.GetSourceFileOfNode(declaration)
	if source == nil || source.IsDeclarationFile || standardLibrarySource(source) || !ast.IsExternalModule(source) || ast.GetSourceFileOfNode(operation) != source || owner.program.GetSourceFile(source.FileName()) != source {
		return nil, false
	}
	if async, ordinary := ordinaryResultCategory(declaration); async || !ordinary {
		return nil, false
	}
	symbol := owner.checker.GetSymbolAtLocation(operation.Expression())
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration != declaration || owner.bindingWritten(symbol) {
		return nil, false
	}
	request := creating.request
	if request.declaration != declaration || request.operation != operation || !request.actualsKnown || len(request.actuals)+len(request.captures) != 0 || !sameOperationEndpoint(request.receiver, sourceRelativeEndpoint{}) || request.use != nil || request.cut != (sourceRelativeCut{operation: operation, reading: operation}) || !sameSourceRelativeInputEnvelope(request, creating.bound) || !sameSourceRelativeInputEnvelope(request, creating.relative) {
		return nil, false
	}
	for _, bound := range []sourceRelativeBoundInputs{creating.bound, creating.relative} {
		if bound.unsupported != relativeInputsSupported || len(bound.defaults)+len(bound.rest) != 0 {
			return nil, false
		}
		for _, binding := range bound.bindings {
			if binding.target.kind != relativeRoleReceiver {
				return nil, false
			}
		}
	}
	var alternatives []sourceStagedOperationAlternative
	for _, template := range describeStagedReturnTemplates(declaration, owner) {
		if template.unknown || template.callable == nil || len(template.captures) != 0 {
			continue
		}
		returned, valid := instantiateStagedReturnTemplate(template, creating.relative)
		if !valid {
			return nil, false
		}
		alternative, valid := stagedReturnedOperationAlternative(returned, creating)
		if !valid {
			return nil, false
		}
		alternatives = append(alternatives, alternative)
	}
	return alternatives, true
}
