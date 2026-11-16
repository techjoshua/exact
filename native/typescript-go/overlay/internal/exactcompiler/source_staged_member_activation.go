package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMemberActivation keeps candidate source relationships separate
// from performed activation. Incomplete never means an inactive writer.
type sourceStagedMemberActivation struct {
	write, region                                                    *ast.Node
	observation                                                      sourceRelativeCut
	candidates                                                       []sourceStagedMemberActivationCandidate
	moduleWriter, moduleBeforeRead, priorInvocationState, incomplete bool
}

type sourceStagedMemberActivationCandidate struct {
	creating                                                 sourceRelativeEndpoint
	invocation                                               sourceRelativeInvocation
	inputs                                                   *sourceRelativeInputEdge
	sourceInputs                                             *sourceStagedInputSubstitution
	bound                                                    sourceRelativeBoundInputs
	sourceDescribed, delivered, moduleBeforeRead, incomplete bool
}

// describeStagedMemberActivation inventories original direct creating Calls
// without acquiring arguments/receivers or recursively proving a module write.
// Current-work associations are borrowed descriptions. Even a structurally
// matching delivered edge needs separate current-work pointer admission.
// Source order is an observation relationship only, never execution evidence.
func describeStagedMemberActivation(write *ast.Node, readCut sourceRelativeCut, owner *executableBodyOwner, associations ...sourceStagedDeclarationCall) sourceStagedMemberActivation {
	out := sourceStagedMemberActivation{write: write, observation: readCut, incomplete: true}
	if write == nil || readCut.operation == nil || owner == nil || owner.values == nil || owner.checker == nil || owner.values.program == nil {
		return out
	}
	file := ast.GetSourceFileOfNode(write)
	readFile := ast.GetSourceFileOfNode(readCut.operation)
	if file == nil || file.IsDeclarationFile || readFile == nil || owner.values.program.GetSourceFile(file.FileName()) != file || owner.values.program.GetSourceFile(readFile.FileName()) != readFile {
		return out
	}
	for _, node := range []*ast.Node{readCut.use, readCut.reading, readCut.initializing, readCut.invoking, readCut.returning} {
		if node != nil {
			source := ast.GetSourceFileOfNode(node)
			if source == nil || owner.values.program.GetSourceFile(source.FileName()) != source {
				return out
			}
		}
	}
	if !ast.IsBinaryExpression(write) && !ast.IsVariableDeclaration(write) {
		return out
	}
	if ast.IsBinaryExpression(write) && write.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return out
	}
	index := owner.values.index(file)
	occurrence := index.normalOccurrences[write]
	if index.incomplete || index.normalDynamicScope || occurrence == nil || occurrence.node != write {
		return out
	}
	readerIndex := owner.values.index(readFile)
	readerOccurrence := readerIndex.normalOccurrences[readCut.operation]
	if readerIndex.incomplete || readerIndex.normalDynamicScope || readerOccurrence == nil || readerOccurrence.node != readCut.operation {
		return out
	}
	region := occurrence.region
	out.region = region
	reader := readerOccurrence.region
	out.priorInvocationState = reader != nil
	out.moduleWriter = region == nil
	out.moduleBeforeRead = region == nil && reader == nil && file == readFile && write.End() <= readCut.operation.Pos()
	if region == nil {
		return out
	}
	for _, call := range index.calls {
		if call == nil || !ast.IsCallExpression(call) || !ast.IsIdentifier(call.Expression()) {
			continue
		}
		symbol := owner.checker.GetSymbolAtLocation(call.Expression())
		if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration != region {
			continue
		}
		callOccurrence := index.normalOccurrences[call]
		candidate := sourceStagedMemberActivationCandidate{creating: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: call, producer: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}, moduleBeforeRead: reader == nil && callOccurrence != nil && callOccurrence.region == nil && file == readFile && call.End() <= readCut.operation.Pos(), incomplete: true}
		if callOccurrence != nil && callOccurrence.node == call && !owner.values.bindingWritten(symbol) {
			for _, association := range associations {
				if !validStagedMemberActivationCall(association, region, call) {
					continue
				}
				if association.inputs != nil && association.sourceInputs != nil {
					continue
				}
				if edge := association.inputs; edge != nil {
					if !edge.delivered || !sameSourceRelativeVector(association.invocation, edge.request) || !sameSourceRelativeInputEnvelope(edge.request, edge.bound) || edge.request.declaration != region || edge.request.operation != call || edge.request.cut != (sourceRelativeCut{operation: call, use: edge.request.use, reading: call}) {
						continue
					}
					if edge.relative.declaration != nil && !sameSourceRelativeInputEnvelope(edge.request, edge.relative) {
						continue
					}
					detached := *edge
					detached.request = cloneStagedWriterInvocation(edge.request)
					detached.bound = cloneSourceRelativeBoundInputs(edge.bound)
					detached.relative = cloneSourceRelativeBoundInputs(edge.relative)
					candidate.inputs = &detached
					candidate.bound = cloneSourceRelativeBoundInputs(edge.bound)
					candidate.delivered = true
					candidate.incomplete = edge.bound.unsupported != relativeInputsSupported
				} else if source := association.sourceInputs; source != nil {
					if !sameSourceRelativeInvocation(association.invocation, source.invocation) || !sameSourceRelativeInputEnvelope(source.invocation, source.bindings) {
						continue
					}
					detached := *source
					detached.invocation = cloneStagedWriterInvocation(source.invocation)
					detached.bindings = cloneSourceRelativeBoundInputs(source.bindings)
					candidate.sourceInputs = &detached
					candidate.bound = cloneSourceRelativeBoundInputs(source.bindings)
					candidate.sourceDescribed = true
					candidate.incomplete = source.bindings.unsupported != relativeInputsSupported
				} else {
					continue
				}
				candidate.invocation = cloneStagedWriterInvocation(association.invocation)
				break
			}
		}
		out.candidates = append(out.candidates, candidate)
	}
	// Direct candidates cannot exhaust indirect/cross-source callers or prior
	// invocations. No empty index/private-use/global-owner shortcut closes this.
	return out
}

func validStagedMemberActivationCall(call sourceStagedDeclarationCall, declaration, operation *ast.Node) bool {
	invocation := call.invocation
	if call.kind != relativeDemandEffects || call.legacyInputs && (call.inputs == nil || !call.inputs.delivered) || operation.AsCallExpression().QuestionDotToken != nil || invocation.declaration != declaration || invocation.operation != operation || invocation.use != operation || invocation.cut != (sourceRelativeCut{operation: operation, use: operation, reading: operation}) || !invocation.actualsKnown {
		return false
	}
	actuals := restrictedInvocationArguments(operation.AsCallExpression())
	if len(actuals) != len(invocation.actuals) {
		return false
	}
	for index, actual := range invocation.actuals {
		if actual.expression != actuals[index] || actual.ordinal != index || actual.spread || ast.IsSpreadElement(actuals[index]) {
			return false
		}
	}
	return true
}
