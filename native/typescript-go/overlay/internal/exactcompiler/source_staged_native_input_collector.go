package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// stagedNativeInputOccurrenceRequest names the original input Call independently
// of when its genuine selected source is delivered.
func stagedNativeInputOccurrenceRequest(fact *callableFacts, call *ast.Node) (sourceStagedOperationRequest, bool) {
	return sourceStagedOccurrenceRequest(fact, call, relativeDemandEffects, fmt.Sprintf("%s:input-effects:%d", fact.summary.ID, call.Pos()))
}

// stageNativeInputCall enrolls an Effects-only input operation at its
// original Call. Definition-relative lexical reads need no installed frame or
// callable exposure. Existing control owners decide reached/conditional uses.
// Statement count is neither selection nor input coverage authority.
func (work *callableEffectWork) stageNativeInputCall(facts []callableFacts, consumer int, call *ast.Node, owner *executableBodyOwner) bool {
	fact := &facts[consumer]
	if !stagedNativeInputSourceOwner(fact, call, owner) {
		return false
	}
	intent := stagedNativeInputIntent(call.Expression())
	if reflectiveNative(intent) && work.stageNativeDescriptorCall(facts, consumer, call, owner) {
		return true
	}
	if !stagedNativeInputEligible(call, fact, owner) {
		return false
	}
	return work.stageNativeInputOperation(facts, consumer, call, owner)
}

// stagedNativeInputSourceOwner is shared by ordinary collection and a demanded
// passive source task. It grants neither ordinary membership nor selection.
func stagedNativeInputSourceOwner(fact *callableFacts, call *ast.Node, owner *executableBodyOwner) bool {
	if fact.normalInputs != nil || owner == nil || owner.values == nil || !ast.IsExternalModule(fact.sourceFile) || !sourceStagedOccurrenceOwned(call, fact.node) || sourceParameterDefault(call, fact.node) != nil {
		return false
	}
	if ast.IsFunctionLike(fact.node) {
		if !ast.IsFunctionDeclaration(fact.node) || fact.node.Parent != fact.sourceFile.AsNode() || !envelopeSynchronousFunction(fact.node) {
			return false
		}
		if _, component := owner.values.components[fact.node]; component {
			return false
		}
		for _, parameter := range fact.node.Parameters() {
			if !ast.IsIdentifier(parameter.Name()) || parameter.Name().Text() == "this" || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
				return false
			}
		}
	} else if !runtimeModuleEvaluation(fact.node) {
		return false
	}
	return true
}

// Eligibility does not authenticate standard selection. It bounds the source
// domain before any membership is installed, including unsupported child Calls.
func stagedNativeInputEligible(call *ast.Node, fact *callableFacts, owner *executableBodyOwner) bool {
	if call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil {
		return false
	}
	get := call.Expression()
	if !ast.IsPropertyAccessExpression(get) && !ast.IsElementAccessExpression(get) {
		return false
	}
	receiver, _ := accessorReceiver(get)
	if receiver == nil || !ast.IsIdentifier(receiver) {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	kind := stagedNativeInputIntent(get)
	if ((kind == sourceNativeObjectDefineProperties || kind == sourceNativeObjectGetOwnPropertyDescriptor) && len(actuals) != 2) || (reflectiveNative(kind) && len(actuals) != 3) || (!reflectiveNative(kind) && kind != sourceNativeObjectDefineProperties && kind != sourceNativeObjectGetOwnPropertyDescriptor && len(actuals) != 1) {
		return false
	}
	for _, actual := range actuals {
		if ast.IsSpreadElement(actual) {
			return false
		}
	}
	switch kind {
	case sourceNativeObjectGetOwnPropertyDescriptor:
		// Unknown formal targets keep conditional native/Proxy semantics; their
		// TypeScript shape is not admission or NoUser authority.
		if symbol != owner.checker.GetGlobalSymbol("Object", ast.SymbolFlagsValue, nil) {
			return false
		}
	case sourceNativeObjectFreeze:
		if ast.IsCallExpression(actuals[0]) {
			return stagedNativeInputEligible(actuals[0], fact, owner)
		}
		if ast.IsIdentifier(actuals[0]) {
			return stagedNativeInputBindingDeclaration(actuals[0], fact.node, owner) != nil
		}
		if !ast.IsObjectLiteralExpression(actuals[0]) {
			return false
		}
		if _, represented := describeStagedLiteralCreation(actuals[0], fact, owner); !represented {
			return false
		}
	case sourceNativeSymbolFor:
		// ToString and argument Effects remain independent original input work.
	case sourceNativeObjectDefineProperties:
		// Map conversion and target definition have separate pending owners.
	case sourceNativeObjectDefineProperty, sourceNativeReflectDefineProperty:
		// The selected algorithm registers independent original field roles.
	case sourceNativeObjectCreate:
		endpoint := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals[0], producer: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
		if _, represented := describeStagedCreatePrototypeInput(endpoint, fact.node, owner.values); !represented {
			return false
		}
	default:
		return false
	}

	return true
}

// stageNativeInputOperation collects original selected producers in AST order.
// The parent exists pending before child discovery. Only graph requirements,
// never a saved query or an acquired input result, connect the two operations.
func (work *callableEffectWork) stageNativeInputOperation(facts []callableFacts, consumer int, call *ast.Node, owner *executableBodyOwner) bool {
	issuer := work.beginNativeEffectsIssuer(facts, consumer, call, owner, sourceStagedOperationID{})
	if issuer != nil {
		defer func() { issuer.active = false; issuer.self = nil; issuer.scopePending = nil }()
	}
	occurrence, supported := work.describeOrdinaryNativeInputOccurrence(facts, consumer, call, owner, issuer)
	if supported && work.adoptNativeInputOccurrence(facts, occurrence) {
		if issuer != nil && issuer.issued {
			// This is still the original returned Get and live issuer. Retain
			// that event's vector; later dependency publication needs a new Get.
			work.admitNativeEffectsSourceGet(facts, occurrence, issuer)
		}
		return true
	}
	if work.adoptNativeEffectsInputContinuation(facts, occurrence, issuer) || work.adoptPendingNativeEffects(facts, occurrence, issuer) {
		return true
	}
	work.requireStagedNativeEffectsConsumer(occurrence, owner)
	return false
}

// describeOrdinaryNativeInputOccurrence lends the current collector interval
// independently of adoption. Reusing a cached use can renew its observation
// without appending another ordinary use or activating a body.
func (work *callableEffectWork) describeOrdinaryNativeInputOccurrence(facts []callableFacts, consumer int, call *ast.Node, owner *executableBodyOwner, effects ...*sourceStagedNativeEffectsIssuer) (*sourceStagedNativeOccurrence, bool) {
	entry := work.beginStagedNativeArgumentEntry(facts, consumer, call, owner)
	if entry != nil {
		defer func() { entry.active = false }()
	}
	return work.describeNativeInputOccurrenceInEntry(facts, consumer, call, owner, entry, nil, effects...)
}

// describeNativeInputOccurrence registers original relationships before its
// source Get, but does not suppress legacy or create required consumers. All
// descendant handoffs must be supported before this graph adopts the group.
func (work *callableEffectWork) describeNativeInputOccurrence(facts []callableFacts, consumer int, call *ast.Node, owner *executableBodyOwner) (*sourceStagedNativeOccurrence, bool) {
	return work.describeNativeInputOccurrenceInEntry(facts, consumer, call, owner, nil, nil)
}

func (work *callableEffectWork) describeNativeInputOccurrenceInEntry(facts []callableFacts, consumer int, call *ast.Node, owner *executableBodyOwner, entry *sourceStagedNativeArgumentEntry, issuer *sourceStagedNativeArgumentIssuer, effects ...*sourceStagedNativeEffectsIssuer) (*sourceStagedNativeOccurrence, bool) {
	fact := &facts[consumer]
	get := call.Expression()
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	original, owned := stagedNativeInputOccurrenceRequest(fact, call)
	if !owned {
		return nil, false
	}
	if prior := work.operationRecipes[original.producer].nativeGet; prior != nil {
		original = prior.request
	}
	if len(effects) > 1 {
		return nil, false
	}
	var effectsIssuer *sourceStagedNativeEffectsIssuer
	if len(effects) == 1 {
		effectsIssuer = effects[0]
	}
	request := sourceStagedNativeRequest{effectsIssuer: effectsIssuer, argumentIssuer: issuer, algorithmKind: stagedNativeInputIntent(get), call: call, get: get, request: original}
	if reflectiveNative(request.algorithmKind) && len(actuals) == 3 {
		request.descriptorGet = actuals[2]
	}
	occurrence, installed := work.observeSelectedNativeGetSource(facts, consumer, request, owner)
	if !installed {
		return nil, false
	}
	recipe, registered := work.operationRecipes[nativeRootDebtRequest(&sourceStagedNativeGetSource{request: original, get: get}, "algorithm").producer]
	if !registered || recipe.nativeGet == nil || recipe.nativeGet.input == nil && recipe.nativeGet.descriptorMap == nil && recipe.nativeGet.descriptorGet == nil && recipe.nativeGet.descriptorRead == nil || occurrence.callee == nil {
		// Describing a queued return-data dependency does not authorize the
		// ordinary collector to adopt an unsupported selection domain. A typed
		// data consumer can require that producer independently.
		return occurrence, false // Preserve the original publisher for the owning fallback gate.
	}
	// Algorithm availability does not adopt an unmapped original input protocol.
	// In particular a computed key/descriptor/target needs its independent eager
	// source owner. Retain legacy for those untransferred consumers while keeping
	// any passive selected algorithm relationship registered.
	if recipe.nativeGet.descriptorMap != nil && !recipe.nativeGet.inputEffects {
		return occurrence, false // No consumer adopts an unrepresented original map-input protocol.
	}
	if recipe.nativeGet.kind == sourceNativeSymbolFor && !recipe.nativeGet.inputEffects {
		return occurrence, false // Original ToString/input source work is not yet represented.
	}
	if reflectiveNative(recipe.nativeGet.kind) {
		// Algorithm and eager-input metadata are published by separate original
		// owners. Correlate the eager role rather than requiring its plan on an
		// earlier algorithm snapshot; extraction still belongs to that role.
		eager := work.operationRecipes[nativeRootDebtRequest(recipe.nativeGet, "eager-inputs").producer]
		if !sameNativeGetSource(eager.nativeGet, recipe.nativeGet) || eager.nativeGet.eager == nil || !validNativeGetRecipe(eager) || !validStagedNativeEagerInputs(*eager.nativeGet.eager, eager.nativeGet) {
			return occurrence, false
		}
	}
	if reflectiveNative(recipe.nativeGet.kind) {
		// The same selected publisher already enrolled the target ticket.
		// Its future owned dispatch, never this passive recursion, acquires it.
		target := work.operationRecipes[nativeEagerTargetRequest(recipe.nativeGet).producer]
		eager := work.operationRecipes[nativeRootDebtRequest(recipe.nativeGet, "eager-inputs").producer]
		if effectsIssuer.live() && effectsIssuer.work == work && sameOperationRequest(effectsIssuer.request, occurrence.source.request) && target.nativeGet != nil && target.nativeGet.createTarget && eager.nativeGet.createTarget && operationContainsRequest(eager.delta.required, nativeEagerTargetRequest(recipe.nativeGet)) && sameNativeGetSource(target.nativeGet, recipe.nativeGet) && validOperationEnvelope(target) {
			return occurrence, true
		}
		if target, binding := nativeReflectiveTargetCall(recipe.nativeGet, owner); target != nil {
			child, supported := work.describeNativeInputOccurrence(facts, consumer, target, owner)
			if !supported {
				return occurrence, false
			}
			if occurrence.callee == nil || child.callee == nil || !validStagedNativeCalleeEffects(*child.callee, child.source) || child.callee.generation != work.operationGeneration || !work.describeNativeTargetSource(facts, recipe.nativeGet, child.source.request, binding) {
				return occurrence, false
			}
			occurrence.child = child
		}
	}
	if recipe.nativeGet.kind == sourceNativeObjectFreeze && ast.IsCallExpression(actuals[0]) {
		if effectsIssuer.live() && effectsIssuer.work == work && effectsIssuer.call == call && effectsIssuer.issued {
			// Only the ordinary collector defers input discovery. Its actual Get
			// must be adopted/current before the existing root task can issue a
			// child observation; source-only callers keep their original route.
			return occurrence, false
		}
		child, supported := work.describeNativeInputOccurrenceInEntry(facts, consumer, actuals[0], owner, entry, entry.childIssuer(occurrence, actuals[0]))
		if !supported {
			return occurrence, false
		}
		childAlgorithm := work.operationRecipes[nativeRootDebtRequest(child.source, "algorithm").producer]
		if child.callee == nil || !validStagedNativeCalleeEffects(*child.callee, child.source) || child.callee.generation != work.operationGeneration || !work.describeNativeOrdinaryInputResult(childAlgorithm.nativeGet) || !work.describeNativeInputSource(facts, recipe.nativeGet, child.source) {
			return occurrence, false
		}
		occurrence.child = child
	}
	return occurrence, true
}

// Names choose which bounded algorithm to request, never whether it is genuine.
// The original Get owner independently authenticates the selected alternative,
// retains authored/unknown siblings and owns all callee/writer prerequisites.
func stagedNativeInputIntent(get *ast.Node) sourceNativeKind {
	if get == nil || !ast.IsPropertyAccessExpression(get) && !ast.IsElementAccessExpression(get) {
		return 0
	}
	_, name := accessorReceiver(get)
	switch name {
	case "getOwnPropertyDescriptor":
		receiver, _ := accessorReceiver(get)
		if receiver != nil && ast.IsIdentifier(receiver) && receiver.Text() == "Reflect" {
			return 0 // Reflect has distinct primitive-rejection semantics.
		}
		return sourceNativeObjectGetOwnPropertyDescriptor
	case "defineProperties":
		return sourceNativeObjectDefineProperties
	case "defineProperty":
		receiver, _ := accessorReceiver(get)
		if receiver != nil && ast.IsIdentifier(receiver) && receiver.Text() == "Reflect" {
			return sourceNativeReflectDefineProperty
		}
		return sourceNativeObjectDefineProperty
	case "for":
		return sourceNativeSymbolFor
	case "freeze":
		return sourceNativeObjectFreeze
	case "create":
		return sourceNativeObjectCreate
	}
	return 0
}

// nativeGroupOwnsInputCollection distinguishes a protocol group whose original
// eager expressions still belong to source descent from a qualified eager kernel
// that already owns them. A parent carrier inherits this from its child. This
// transports Effects ownership, not a returned value or normal step.
func (work *callableEffectWork) nativeGroupOwnsInputCollection(fact *callableFacts, call *ast.Node) bool {
	seen := make(map[*ast.Node]bool)
	var visit func(*ast.Node) bool
	visit = func(operation *ast.Node) bool {
		if operation == nil || seen[operation] {
			return false
		}
		seen[operation] = true
		key := sourceStagedOperationKey{declaration: fact.node, operation: operation, kind: relativeDemandEffects}
		root := work.operationRecipes[key].nativeGet
		if root == nil {
			return false
		}
		source := work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer].nativeGet
		if source == nil {
			return false
		}
		if source.descriptorMap != nil {
			return true
		}
		return visit(source.inputSource.producer.operation)
	}
	return visit(call)
}
