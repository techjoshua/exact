package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// reduceStagedModuleActivation reduces a borrowed original module event loan.
// Association is checked here. Live event authenticity, selected imports and
// each no-user-entry contribution belong to their original owners. No event
// shape, empty Effects result or pending child can substitute for that law.
// Neither this reducer nor its detached receipt retains a callback or frame.
func reduceStagedModuleActivation(source sourceStagedModuleActivationRequest, events []sourceNormalDemand, imports []sourceStagedModuleEntryContribution, contribute func(sourceNormalDemand) (sourceStagedModuleEntryContribution, bool)) (sourceStagedModuleActivation, bool) {
	var invalid sourceStagedModuleActivation
	request := source.request
	operation, declaration := request.producer.operation, request.producer.declaration
	if source.generation == nil || source.root == nil || operation == nil || declaration == nil || source.cut.operation == nil || source.cut.reading != source.cut.operation || !sourceStagedOccurrenceOwned(source.cut.operation, declaration) || !runtimeModuleEvaluation(declaration) || !sourceStagedOccurrenceOwned(operation, declaration) {
		return invalid, false
	}
	file := ast.GetSourceFileOfNode(operation)
	if file == nil || file.IsDeclarationFile || ast.GetSourceFileOfNode(source.root) != file || ast.GetSourceFileOfNode(source.cut.operation) != file {
		return invalid, false
	}
	if !ast.IsSourceFile(source.root) && source.root != declaration {
		return invalid, false
	}
	if source.read == nil {
		if source.root != declaration {
			return invalid, false
		}
	} else if ast.GetSourceFileOfNode(source.read) != file || !sourceStagedOccurrenceOwned(source.read, declaration) || !sourceStagedOccurrenceOwned(source.cut.operation, declaration) {
		return invalid, false
	}
	for _, node := range []*ast.Node{source.cut.use, source.cut.initializing, source.cut.invoking, source.cut.returning} {
		if node != nil && ast.GetSourceFileOfNode(node) != file {
			return invalid, false
		}
	}
	source.request = cloneOperationDelta(sourceStagedOperationDelta{required: []sourceStagedOperationRequest{request}}).required[0]
	out := sourceStagedModuleActivation{source: source, supported: true, accounted: true}
	appendContribution := func(contribution sourceStagedModuleEntryContribution) {
		detached := cloneOperationDelta(sourceStagedOperationDelta{required: contribution.required})
		out.required = append(out.required, detached.required...)
		out.accounted = out.accounted && contribution.accounted
	}
	for _, contribution := range imports {
		appendContribution(contribution)
	}
	found := source.read == nil
	for _, event := range events {
		if event.node == nil || ast.GetSourceFileOfNode(event.node) != file || !nodeInside(event.node, source.root) {
			return invalid, false
		}
		if event.node == source.read && event.fold == nil && event.phase == nil && event.operand == nil {
			found = true
			break
		}
		if contribute == nil {
			out.supported, out.accounted = false, false
			continue
		}
		contribution, authorized := contribute(event)
		if !authorized {
			out.supported, out.accounted = false, false
			continue
		}
		appendContribution(contribution)
	}
	if !found {
		return invalid, false
	}
	return out, true
}
