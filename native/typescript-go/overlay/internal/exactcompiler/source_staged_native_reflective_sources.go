package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// prepareStagedReflectiveTarget retains a descriptive immutable target relation
// at its original constructor read. Only the later original Create event can
// publish the conditional result law; registration never evaluates the binding.
func (work *callableEffectWork) prepareStagedReflectiveTarget(facts []callableFacts, query *sourceValueQuery, operation *ast.Node, target sourceValue) sourceStagedReflectiveTargetTransfer {
	var none sourceStagedReflectiveTargetTransfer
	if query != nil && query.stagedNativeGet == nil && query.stagedMember != nil && !query.stagedMember.constructionCallee && query.stagedMember.getPreparation != nil {
		if context, ok := work.getPreparationContext(facts, query); ok {
			return work.prepareGetReflectiveTarget(facts, query, context, operation, target)
		}
	}
	if query == nil || query.owner == nil || query.executable == nil || operation == nil || !ast.IsCallExpression(operation) {
		return none
	}
	b := query.stagedMember
	if b == nil || b.coverage == nil || !query.liveStagedMemberSource(b, b.get, b.read) {
		return none
	}
	native := query.stagedNativeGet
	if !b.constructionCallee && (native == nil || native.issuer != query || native.owner != query.owner || native.generation != query.owner.generation || !sameOperationRequest(native.getRequest, b.request)) {
		return none
	}
	args := restrictedInvocationArguments(operation.AsCallExpression())
	if len(args) == 0 || !ast.IsIdentifier(args[0]) {
		return none
	}
	symbol := query.owner.checker.GetSymbolAtLocation(args[0])
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || query.owner.bindingWritten(symbol) {
		return none
	}
	binding := symbol.ValueDeclaration
	if !ast.IsVariableDeclaration(binding) || binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || binding.Pos() >= args[0].Pos() || enclosingCallableNode(binding) != b.request.consumer {
		return none
	}
	call := binding.Initializer()
	if call == nil || !ast.IsCallExpression(call) || target.node != call || len(target.path) != 0 || target.capture != nil {
		return none
	}
	receiver, name := accessorReceiver(call.Expression())
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if receiver == nil || name != "create" || len(actuals) != 1 {
		return none
	}
	// This identifies the expected standard branch, not its selection. Actual
	// publication still requires the genuine original selected source event.
	global := query.owner.checker.GetGlobalSymbol("Object", ast.SymbolFlagsValue, nil)
	root := query.owner.checker.GetSymbolAtLocation(receiver)
	if global == nil || global.ValueDeclaration == nil || root == nil || root.ValueDeclaration != global.ValueDeclaration || !standardLibrarySource(ast.GetSourceFileOfNode(global.ValueDeclaration)) {
		return none
	}
	method := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), name)
	if method == nil || method.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(method.ValueDeclaration)) {
		return none
	}
	caller, known := work.memberNodes[b.request.consumer]
	if !known || caller < 0 || caller >= len(facts) {
		return none
	}
	creating, valid := stagedNativeInputOccurrenceRequest(&facts[caller], call)
	if !valid {
		return none
	}
	if source := work.operationRecipes[creating.producer].nativeGet; source != nil {
		creating = source.request
	}
	cut := query.relativeInputCut(b.get.operation)
	description := sourceStagedReflectiveTargetSource{parent: b.coverage.request, construction: b.request, creating: creating, operation: operation, binding: binding, target: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: args[0], producer: operation, cut: cut}, cut: cut, generation: query.owner.generation, method: method.ValueDeclaration, prototype: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals[0], producer: call, cut: creating.cut}}
	if !b.constructionCallee {
		description.native = sourceStagedNativeObserver{request: b.request, get: native.call.Expression(), cut: cut}
		description.construction = sourceStagedOperationRequest{}
	}
	request, registered := work.registerStagedReflectiveTargetSource(facts, query, description)
	if !registered {
		return none
	}
	return sourceStagedReflectiveTargetTransfer{request: request, creating: creating, registered: true, current: work.stagedReflectiveTargetCurrent(request), pending: work.stagedReflectiveTargetPending(query, request), keyExcluded: work.reflectiveKeyCurrent(work.operationRecipes[request.producer])}
}

// validNativeTargetSource describes a conditional fresh ordinary source, not a
// current target value. An immutable local read retains its original declaration
// and creating Call. The exact child Effects root remains independently required.
func validNativeTargetSource(source *sourceStagedNativeGetSource) bool {
	if source == nil || !reflectiveNative(source.kind) || source.installation == nil {
		return false
	}
	target := source.installation.target.expression
	request := source.targetSource
	child := request.producer.operation
	if child == nil || !ast.IsCallExpression(child) || request.producer.declaration != source.request.producer.declaration || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || request.consumer != source.request.consumer || request.use != child || request.edge == "" || request.inputs != nil || request.cut != (sourceRelativeCut{operation: child, use: child, reading: child}) {
		return false
	}
	if target == child {
		return source.targetBinding == nil
	}
	return target != nil && ast.IsIdentifier(target) && source.targetBinding != nil && ast.IsVariableDeclaration(source.targetBinding) && source.targetBinding.Initializer() == child && source.targetBinding.Pos() < target.Pos() && enclosingCallableNode(source.targetBinding) == source.request.consumer
}

func validNativeEagerSources(source *sourceStagedNativeGetSource) bool {
	return source != nil && source.eager != nil && len(source.eager.operations) == len(source.eagerSources) && validNativeEagerSourcesPrefix(source)
}

// A pending ordered prefix retains every encountered child before yielding. It
// never describes complete input acquisition or permits local extraction.
func validNativeEagerSourcesPrefix(source *sourceStagedNativeGetSource) bool {
	if source == nil || source.eager == nil || len(source.eager.operations) < len(source.eagerSources) {
		return false
	}
	for i, request := range source.eagerSources {
		operation := source.eager.operations[i].operation
		if operation == nil || request.producer.operation != operation || request.producer.declaration != source.request.consumer || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || request.consumer != source.request.consumer || request.use != operation || request.inputs != nil || request.edge == "" || request.cut != (sourceRelativeCut{operation: operation, use: operation, reading: operation}) {
			return false
		}
	}
	return true
}

func nativeEagerRequired(source *sourceStagedNativeGetSource) []sourceStagedOperationRequest {
	var required []sourceStagedOperationRequest
	if source.eager != nil && source.eager.targetPending {
		required = append(required, nativeEagerTargetRequest(source))
	}
	if source.eager != nil && source.eager.descriptorData.producer.operation != nil {
		required = append(required, source.eager.descriptorData)
	}
	required = append(required, stagedKeyRequirements(source)...)
	return append(required, source.eagerSources...)
}

// nativeOrdinaryTargetResult consumes original current semantic receipts, not
// noncallable exposures. Each successful selected algorithm returns an ordinary
// object; success, identity and mutation outcomes remain independent. The caller
// must retain the outer full Effects request, including every descendant root.
func (work *callableEffectWork) nativeOrdinaryTargetResult(request sourceStagedOperationRequest) bool {
	seen := make(map[sourceStagedOperationKey]bool)
	var visit func(sourceStagedOperationRequest) bool
	visit = func(request sourceStagedOperationRequest) bool {
		if seen[request.producer] {
			return false
		}
		seen[request.producer] = true
		root := work.currentNativeResultRoot(request.producer)
		if root == nil || !sameOperationRequest(root.request, request) {
			return false
		}
		source := work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer].nativeGet
		switch source.kind {
		case sourceNativeObjectCreate:
			return true
		case sourceNativeObjectDefineProperties:
			return source.descriptorMap != nil && ast.IsObjectLiteralExpression(source.descriptorMap.target.expression) && sourceInertValueCreation(source.descriptorMap.target.expression)
		case sourceNativeObjectDefineProperty:
			if source.installation == nil {
				return false
			}
			target := source.installation.target.expression
			if ast.IsObjectLiteralExpression(target) && sourceInertValueCreation(target) {
				return true
			}
			return validNativeTargetSource(source) && visit(source.targetSource)
		case sourceNativeObjectFreeze:
			target := source.input.input.expression
			if ast.IsObjectLiteralExpression(target) && sourceInertValueCreation(target) {
				return true
			}
			return validStagedNativeInputSource(source) && visit(source.inputSource)
		}
		return false
	}
	return visit(request)
}

// nativeReflectiveTargetCall names a child producer without replacing the
// original consumer operand. Saved targets require the checker's own immutable
// local declaration; no initializer evaluation or caller binding is performed.
func nativeReflectiveTargetCall(source *sourceStagedNativeGetSource, owner *executableBodyOwner) (*ast.Node, *ast.Node) {
	if source == nil || source.installation == nil || owner == nil || owner.values == nil {
		return nil, nil
	}
	target := source.installation.target.expression
	if ast.IsCallExpression(target) {
		return target, nil
	}
	if target == nil || !ast.IsIdentifier(target) {
		return nil, nil
	}
	symbol := owner.checker.GetSymbolAtLocation(target)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || owner.values.bindingWritten(symbol) {
		return nil, nil
	}
	binding := symbol.ValueDeclaration
	if binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || binding.Pos() >= target.Pos() || enclosingCallableNode(binding) != source.request.consumer || !ast.IsCallExpression(binding.Initializer()) {
		return nil, nil
	}
	return binding.Initializer(), binding
}

// describeStagedNativeDescriptorInputs describes an original immutable alias
// read under the selected algorithm callback. The initializer stays with its
// own DATA/evaluation producers; no descriptor properties are scanned here.
func (work *callableEffectWork) describeStagedNativeDescriptorInputs(facts []callableFacts, selection sourceStagedNativeSelection, caller *callableFacts, owner *executableBodyOwner) (sourceStagedNativeEagerInputs, bool) {
	actuals, valid := describeStagedNativeEagerCallActuals(selection, caller, owner)
	if !valid || !ast.IsIdentifier(actuals[2].expression) || !sourcePrimitiveValue(actuals[1].expression) || !sourceInertValueCreation(actuals[1].expression) {
		return sourceStagedNativeEagerInputs{}, false
	}
	source := work.operationRecipes[selection.request.producer].nativeGet
	if source == nil || !sameOperationRequest(source.request, selection.request) || !reflectiveNative(source.kind) {
		return sourceStagedNativeEagerInputs{}, false
	}
	target := actuals[0].expression
	inert := ast.IsObjectLiteralExpression(target) && sourceInertValueCreation(target)
	if !inert && !ast.IsIdentifier(target) && !ast.IsCallExpression(target) {
		return sourceStagedNativeEagerInputs{}, false
	}
	parent := nativeRootDebtRequest(source, "eager-inputs")
	// Eager admission precedes descriptor algorithm/field admission. Retain the
	// original selected vector's descriptor anchor on this role before asking
	// its reader to correlate that operand; this publishes no field outcome.
	eager, present := work.operationRecipes[parent.producer]
	if !present || !sameNativeGetSource(eager.nativeGet, source) {
		return sourceStagedNativeEagerInputs{}, false
	}
	if eager.nativeGet.descriptorGet == nil {
		copy := *eager.nativeGet
		copy.descriptorGet = selection.descriptorGet
		eager.nativeGet = &copy
		if !work.attachOperationSource(facts, eager) {
			return sourceStagedNativeEagerInputs{}, false
		}
	} else if eager.nativeGet.descriptorGet != selection.descriptorGet {
		return sourceStagedNativeEagerInputs{}, false
	}
	reading, registered := work.prepareStagedDescriptorReceiver(facts, parent, actuals[2].expression, owner)
	if !registered {
		return sourceStagedNativeEagerInputs{}, false
	}
	return sourceStagedNativeEagerInputs{request: parent, actuals: actuals, targetPending: !inert, descriptorData: reading}, true
}
