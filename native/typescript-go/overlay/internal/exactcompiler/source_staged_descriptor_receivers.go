package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Each implicit descriptor field retains the original Identifier read and its
// own subscriber on the existing binding DATA producer. Eager evaluation uses
// the same relation, without treating it as a field selection or normal value.
func stagedDescriptorReceiverRequest(parent sourceStagedOperationRequest, read *ast.Node) sourceStagedOperationRequest {
	if read == nil || parent.producer.operation == nil {
		return sourceStagedOperationRequest{}
	}
	request := stagedBindingResultRequest(read, parent.producer.declaration)
	request.reading = parent.producer
	request.edge = fmt.Sprintf("descriptor-data:%d:%d:%s", parent.producer.operation.Pos(), read.Pos(), parent.producer.selector.field)
	return request
}

func stagedDescriptorReceiverParent(parent sourceStagedOperationRequest, read *ast.Node) bool {
	call := parent.producer.operation
	if read == nil || !ast.IsIdentifier(read) || call == nil || !ast.IsCallExpression(call) || parent.producer.kind != relativeDemandEffects || parent.producer.declaration != parent.consumer || parent.consumer != enclosingCallableNode(read) || parent.use != call || parent.inputs != nil || parent.reading != (sourceStagedOperationKey{}) || parent.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || parent.producer.selector.association != nil {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 3 || actuals[2] != read {
		return false
	}
	selector := parent.producer.selector
	return stagedDescriptorFieldIndex(selector.field) >= 0 && selector.occurrence == read || selector.field == "eager-inputs" && selector.occurrence == call.Expression()
}

// This validates a source association only. Current owner, generation and field
// recipe admission are checked separately before any reader is registered.
func validStagedDescriptorReceiverReading(source *sourceStagedCallResultSource, reading sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	if source == nil || source.binding == nil || !ast.IsVariableDeclaration(source.binding) || source.binding.Parent == nil || !ast.IsVariableDeclarationList(source.binding.Parent) || source.binding.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(source.binding) != source.declaration {
		return false
	}
	read := source.request.producer.operation
	parent := sourceStagedOperationRequest{producer: reading.reading, consumer: reading.consumer, use: reading.reading.operation, cut: cut}
	return stagedDescriptorReceiverParent(parent, read) && sameOperationRequest(source.request, stagedBindingResultRequest(read, parent.consumer)) && sameOperationRequest(reading, stagedDescriptorReceiverRequest(parent, read))
}

func validStagedDescriptorReceiverRequirement(source *sourceStagedNativeGetSource, parent sourceStagedOperationRequest, reading sourceStagedOperationRequest) bool {
	return source != nil && reflectiveNative(source.kind) && source.descriptorEntry == nil && source.descriptorGet != nil && stagedDescriptorReceiverParent(parent, source.descriptorGet) && sameOperationRequest(reading, stagedDescriptorReceiverRequest(parent, source.descriptorGet))
}

func (work *callableEffectWork) descriptorReceiverParent(facts []callableFacts, parent sourceStagedOperationRequest, read *ast.Node) (sourceStagedOperationRecipe, int, bool) {
	recipe, known := work.operationRecipes[parent.producer]
	caller, owned := work.memberNodes[parent.producer.declaration]
	if !known || !owned || caller < 0 || caller >= len(facts) || len(work.operationFacts) != len(facts) || &work.operationFacts[caller] != &facts[caller] || !validNativeGetRecipe(recipe) || recipe.nativeGet == nil || !validNativeGetRequest(recipe, parent) || !validStagedDescriptorReceiverRequirement(recipe.nativeGet, parent, stagedDescriptorReceiverRequest(parent, read)) || recipe.nativeGet.descriptorGet != read {
		return sourceStagedOperationRecipe{}, 0, false
	}
	return recipe, caller, true
}

// prepareStagedDescriptorReceiver authenticates registration, not DATA readiness.
// Required fields subscribe without ordinary use, invocation, B or a saved Get.
// An unadopted eager description records its reader but creates no operation ID.
func (work *callableEffectWork) prepareStagedDescriptorReceiver(facts []callableFacts, parent sourceStagedOperationRequest, read *ast.Node, owner *executableBodyOwner) (sourceStagedOperationRequest, bool) {
	if owner == nil || owner.values == nil || owner.checker == nil || read == nil || !ast.IsIdentifier(read) || work.operationGeneration != owner.values.generation {
		return sourceStagedOperationRequest{}, false
	}
	recipe, caller, valid := work.descriptorReceiverParent(facts, parent, read)
	if !valid || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return sourceStagedOperationRequest{}, false
	}
	binding := stagedBindingDataDeclaration(read, facts[caller].node, owner)
	symbol := owner.checker.GetSymbolAtLocation(read)
	if binding == nil || !ast.IsVariableDeclaration(binding) || binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || symbol == nil || owner.values.bindingWritten(symbol) || enclosingCallableNode(binding) != facts[caller].node {
		return sourceStagedOperationRequest{}, false
	}
	source := &sourceStagedCallResultSource{request: stagedBindingResultRequest(read, facts[caller].node), declaration: facts[caller].node, binding: binding, generation: work.operationGeneration}
	reading := stagedDescriptorReceiverRequest(parent, read)
	if !work.registerStagedCallResultReading(facts, source, reading, parent.cut, nil) {
		return sourceStagedOperationRequest{}, false
	}
	if stagedDescriptorFieldIndex(parent.producer.selector.field) >= 0 {
		required := appendEntryLawRequirement(recipe.delta.required, reading)
		if len(required) != len(recipe.delta.required) {
			recipe.delta = cloneOperationDelta(recipe.delta)
			recipe.delta.required = required
			if !work.attachOperationSource(facts, recipe) {
				return sourceStagedOperationRequest{}, false
			}
		}
	}
	if _, adopted := work.operationIDs[parent.producer]; adopted {
		if _, registered := work.requireOperation(facts, reading); !registered {
			return sourceStagedOperationRequest{}, false
		}
	}
	return reading, true
}

// stagedDescriptorReceiverData reads the existing subscriber cumulatively.
// It preserves endpoint creation/read cuts and pending source children. Binding
// immutability supplies no object-property, Has/Get, scope or getter-body law.
func (work *callableEffectWork) stagedDescriptorReceiverData(facts []callableFacts, parent, reading sourceStagedOperationRequest) (sourceStagedOperationDelivery, bool) {
	read := reading.producer.operation
	recipe, _, valid := work.descriptorReceiverParent(facts, parent, read)
	source := work.operationRecipes[reading.producer].callResult
	if !valid || source == nil || source.generation != work.operationGeneration || !validStagedDescriptorReceiverReading(source, reading, parent.cut) {
		return sourceStagedOperationDelivery{}, false
	}
	registered := false
	for i, issued := range source.readings {
		registered = registered || sameOperationRequest(issued, reading) && source.readCuts[i] == parent.cut
	}
	required := false
	for _, child := range recipe.delta.required {
		required = required || sameOperationRequest(child, reading)
	}
	if !registered || !required {
		return sourceStagedOperationDelivery{}, false
	}
	return work.stagedCallResultData(reading)
}

// Descriptor DATA arrival schedules the already-issued field producer on the
// existing extraction queue. Delivery itself performs no query or getter bind.
func (work *callableEffectWork) notifyStagedDescriptorReceiver(facts []callableFacts, reading sourceStagedOperationRequest) {
	if stagedDescriptorFieldIndex(reading.reading.selector.field) < 0 {
		return
	}
	source := work.operationRecipes[reading.producer].callResult
	parentRecipe := work.operationRecipes[reading.reading]
	if source == nil || parentRecipe.nativeGet == nil {
		return
	}
	parent := parentRecipe.nativeGet.request
	parent.producer = reading.reading
	if !validStagedDescriptorReceiverReading(source, reading, parent.cut) {
		return
	}
	if _, _, valid := work.descriptorReceiverParent(facts, parent, reading.producer.operation); !valid {
		return
	}
	id, adopted := work.operationIDs[parent.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[parent.producer.declaration], operation: id})
}

// A descriptor alias's eager read stays at the original argument occurrence.
// The required DATA relationship, not this syntax check, owns its source value.
func stagedDescriptorAliasEagerSyntax(plan sourceStagedNativeEagerInputs, source *sourceStagedNativeGetSource) bool {
	if source == nil || len(plan.actuals) != 3 || len(plan.calls)+len(plan.operations) != 0 || !validStagedDescriptorReceiverRequirement(source, plan.request, plan.descriptorData) {
		return false
	}
	arguments := restrictedInvocationArguments(source.request.producer.operation.AsCallExpression())
	if len(arguments) != 3 {
		return false
	}
	for i, actual := range plan.actuals {
		if !sameOperationEndpoint(actual, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: arguments[i], producer: source.request.producer.operation, cut: source.request.cut}) {
			return false
		}
	}
	target := arguments[0]
	inert := ast.IsObjectLiteralExpression(target) && sourceInertValueCreation(target)
	return (inert || ast.IsIdentifier(target) || ast.IsCallExpression(target)) && plan.targetPending == !inert && sourcePrimitiveValue(arguments[1]) && sourceInertValueCreation(arguments[1]) && ast.IsIdentifier(arguments[2])
}
