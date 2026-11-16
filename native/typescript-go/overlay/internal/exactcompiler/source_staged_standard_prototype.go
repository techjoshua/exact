package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedStandardPrototype detaches the compiler's conditional standard premises
// during the original selected-native handoff. It reuses the premise domain,
// not the normal demand-preservation certificate or its global integrity check.
// The intrinsic default of an ordinary literal does not depend on a shadowed
// application Object binding. Authored writes remain separate source producers.
// This supplies no selected field value, absence, normal completion or NoWrites.
func (query *sourceValueQuery) stagedStandardPrototype(selected sourceValue) sourceDemandStandardPremises {
	if selected.native == nil || !(reflectiveNative(selected.native.kind) || selected.native.kind == sourceNativeObjectDefineProperties) || selected.node == nil || !standardLibrarySource(ast.GetSourceFileOfNode(selected.node)) {
		return sourceDemandStandardPremises{}
	}
	return query.stagedConditionalObjectPrototype(selected.node)
}

// stagedConditionalObjectPrototype shares only the conditional intrinsic
// Object root/default-link domain. The caller must own its original semantic
// operation and its library anchor. This is never a normal preservation proof.
func (query *sourceValueQuery) stagedConditionalObjectPrototype(member *ast.Node) sourceDemandStandardPremises {
	if query == nil || query.owner == nil || member == nil || !standardLibrarySource(ast.GetSourceFileOfNode(member)) {
		return sourceDemandStandardPremises{}
	}
	result := accessorCandidates{}
	if !query.charge(&result, member) {
		return sourceDemandStandardPremises{}
	}
	global := query.owner.checker.GetGlobalSymbol("Object", ast.SymbolFlagsValue, nil)
	if global == nil || global.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(global.ValueDeclaration)) {
		return sourceDemandStandardPremises{}
	}
	prototype := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), "prototype")
	if prototype == nil || prototype.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(prototype.ValueDeclaration)) || !query.charge(&result, prototype.ValueDeclaration) {
		return sourceDemandStandardPremises{}
	}
	return sourceDemandStandardPremises{root: global.ValueDeclaration, member: member, prototype: prototype.ValueDeclaration, rootData: true, memberData: true, prototypeData: true, ordinaryLink: true, terminalNull: true}
}

// stagedLiteralStandardPrototype consumes only the detached conditional premise.
// It covers the literal's default link, not any authored installation, unknown
// source alternative or inherited field selection. A special __proto__ setter
// has its own source relationship and cannot use this ordinary-link producer.
func stagedLiteralStandardPrototype(source *sourceStagedNativeGetSource, receiver *ast.Node) bool {
	if source == nil || receiver == nil || receiver != source.descriptorGet || !ast.IsObjectLiteralExpression(receiver) {
		return false
	}
	return stagedOrdinaryLiteralPrototype(receiver, source.standard)
}

// stagedOrdinaryLiteralPrototype keeps an explicit __proto__ colon relation
// outside the conditional default link. Computed names never imply that setter.
func stagedOrdinaryLiteralPrototype(receiver *ast.Node, premise sourceDemandStandardPremises) bool {
	if receiver == nil || !ast.IsObjectLiteralExpression(receiver) {
		return false
	}
	if premise.root == nil || premise.member == nil || premise.prototype == nil || !premise.rootData || !premise.memberData || !premise.prototypeData || !premise.ordinaryLink || !premise.terminalNull {
		return false
	}
	for _, member := range receiver.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsPropertyAssignment(member) && member.Name() != nil && !ast.IsComputedPropertyName(member.Name()) && callableNameText(member.Name()) == "__proto__" {
			return false
		}
	}
	return true
}

// stagedFieldStandardPrototype extends the existing conditional literal link
// only for a live original field Get consuming its authenticated descriptor
// DATA alternative. The Identifier/request/read cut remain on their producers.
// Binding immutability alone supplies no prototype or field-selection law.
func (work *callableEffectWork) stagedFieldStandardPrototype(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs, owner *executableBodyOwner) bool {
	source := work.operationRecipes[demand.request.producer].nativeGet
	if stagedLiteralStandardPrototype(source, get.receiver.node) {
		return true
	}
	if source == nil || source.descriptorEntry != nil || !ast.IsIdentifier(source.descriptorGet) || !query.liveStagedFieldGet(get) || get.receiver.node != demand.receiver.expression || get.operation != demand.request.producer.operation || get.propertyKey != demand.request.producer.selector.field {
		return false
	}
	current, issued := work.issueFieldEffectsDemand(facts, demand.producer, owner)
	if !issued || !sameOperationRequest(current.request, demand.request) || !sameOperationEndpoint(current.receiver, demand.receiver) {
		return false
	}
	reading, registered := work.prepareStagedDescriptorReceiver(facts, demand.request, source.descriptorGet, owner)
	if !registered {
		return false
	}
	delivery, available := work.stagedDescriptorReceiverData(facts, demand.request, reading)
	if !available {
		return false
	}
	for _, alternative := range delivery.delta.exposures {
		if alternative.creating == nil && sameOperationEndpoint(alternative.endpoint, demand.receiver) {
			return stagedOrdinaryLiteralPrototype(get.receiver.node, source.standard)
		}
	}
	return false
}
