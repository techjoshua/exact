package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedHasInstanceSource names one original operator phase. It contains
// no acquired receiver, selected value or binder. Each graph must observe the
// original Get again. Operand value, Get, prototype and body work are distinct.
type sourceStagedHasInstanceSource struct {
	request, root sourceStagedOperationRequest
	generation    *projectGeneration
	role          string
	lookup        *ast.Node // selected original source group, never runtime object identity
	standard      sourceDemandStandardPremises
}

// sourceStagedHasInstanceState is a graph-local original-owner disposition.
// Cached recipes and structurally equal input descriptions cannot issue it.
type sourceStagedHasInstanceState struct {
	generation        *projectGeneration
	observed, started bool
	returned          []sourceStagedOperationAlternative
	methods           []*sourceRelativeInputEdge
	defaultProof      *sourceStagedHasInstanceDefault
	defaultRequired   bool
	nativeDefault     *sourceStagedHasInstanceNativeDefault
}

var stagedHasInstanceRoles = [...]string{"rhs-input", "has-instance-get", "lhs-value", "prototype", "algorithm"}

func stagedHasInstanceRequest(root sourceStagedOperationRequest, role string) sourceStagedOperationRequest {
	request := root
	if role != "" {
		occurrence := root.producer.operation.AsBinaryExpression().Right
		if role == "lhs-value" {
			occurrence = root.producer.operation.AsBinaryExpression().Left
			request.producer.kind = relativeDemandDirectExposure
		}
		request.producer.selector = sourceStagedOperationSelector{occurrence: occurrence, field: "has-instance:" + role}
		request.edge += ":" + role
	}
	return request
}

func sameStagedHasInstanceSource(a, b *sourceStagedHasInstanceSource) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.role == b.role && a.lookup == b.lookup && a.standard == b.standard && a.generation == b.generation && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.root, b.root)
}

func validStagedHasInstanceRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.hasInstance
	if s == nil || s.generation == nil || s.root.producer.operation == nil || !ast.IsBinaryExpression(s.root.producer.operation) || s.root.producer.operation.AsBinaryExpression().OperatorToken.Kind != ast.KindInstanceOfKeyword || !validStagedMemberParent(s.root) || !sameOperationRequest(s.request, stagedHasInstanceSourceRequest(s)) || recipe.key != s.request.producer {
		return false
	}
	known := s.role == "" || s.role == "lookup-prototype" && stagedOrdinaryLiteralPrototype(s.lookup, s.standard)
	for _, role := range stagedHasInstanceRoles {
		known = known || s.role == role
	}
	if s.role != "lookup-prototype" && (s.lookup != nil || s.standard != (sourceDemandStandardPremises{})) {
		return false
	}
	if s.role == "lookup-prototype" {
		live := sourceRelativeCut{operation: s.root.use, reading: s.root.use}
		if runtimeModuleEvaluation(s.root.consumer) {
			live.use = s.root.use
		}
		if len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], stagedMemberCoverageRequest(s.root, s.lookup, live)) {
			return false
		}
	}
	if !known || recipe.nativeGet != nil || recipe.memberSource != nil || recipe.callResult != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructed != nil || recipe.constructedDisposition != nil || len(recipe.constructedGroup)+len(recipe.constructedInputs)+len(recipe.writerRequired)+len(recipe.fieldForwards) != 0 {
		return false
	}
	if len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	for _, effect := range recipe.delta.effects {
		if !validOperationEnvironmentEffect(effect) {
			return false
		}
	}
	for _, alternative := range recipe.delta.exposures {
		expected := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: s.root.producer.operation.AsBinaryExpression().Left, producer: s.root.producer.operation, cut: s.root.cut}
		if s.role != "lhs-value" || alternative.creating != nil || !sameOperationEndpoint(alternative.endpoint, expected) {
			return false
		}
	}
	if s.role == "" {
		if len(recipe.delta.required) != len(stagedHasInstanceRoles) {
			return false
		}
		for i, role := range stagedHasInstanceRoles {
			if !sameOperationRequest(recipe.delta.required[i], stagedHasInstanceRequest(s.root, role)) {
				return false
			}
		}
	} else if s.role != "has-instance-get" && s.role != "prototype" && s.role != "lookup-prototype" && s.role != "lhs-value" && s.role != "algorithm" && len(recipe.delta.required) != 0 {
		return false
	}
	if s.role == "algorithm" && len(recipe.delta.required) != 0 && (len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], stagedHasInstanceRequest(s.root, "lhs-value"))) {
		return false
	}
	if s.role == "lhs-value" && len(recipe.delta.required) != 0 {
		left := s.root.use.AsBinaryExpression().Left
		return ast.IsIdentifier(left) && len(recipe.delta.required) == 1 && sameOperationRequest(recipe.delta.required[0], stagedBindingResultRequest(left, s.root.consumer))
	}
	for _, required := range recipe.delta.required {
		if required.inputs != nil || required.consumer != s.root.consumer || required.cut != s.root.cut || required.use != s.root.use || required.producer.operation != s.root.producer.operation {
			return false
		}
	}
	return true
}

// stageHasInstance registers every phase before the first original source read.
// Adoption suppresses only this operator's old implicit protocol. The original
// source walker still owns evaluation of its two operands and their children.
func (work *callableEffectWork) stageHasInstance(facts []callableFacts, consumer int, operation *ast.Node, owner *executableBodyOwner) bool {
	if operation == nil || !ast.IsBinaryExpression(operation) || operation.AsBinaryExpression().OperatorToken.Kind != ast.KindInstanceOfKeyword || owner == nil || owner.values == nil || owner.values.generation == nil || facts[consumer].normalInputs != nil {
		return false
	}
	root, ok := sourceStagedOccurrenceRequest(&facts[consumer], operation, relativeDemandEffects, fmt.Sprintf("%s:has-instance:%d", facts[consumer].summary.ID, operation.Pos()))
	if !ok {
		return false
	}
	work.operationGeneration = owner.values.generation
	work.indexOperationSources(facts)
	for _, role := range append([]string{""}, stagedHasInstanceRoles[:]...) {
		request := stagedHasInstanceRequest(root, role)
		recipe := sourceStagedOperationRecipe{key: request.producer, hasInstance: &sourceStagedHasInstanceSource{request: request, root: root, role: role, generation: owner.values.generation}}
		if role == "" {
			for _, child := range stagedHasInstanceRoles {
				recipe.delta.required = append(recipe.delta.required, stagedHasInstanceRequest(root, child))
			}
		}
		if prior, exists := work.operationRecipes[recipe.key]; exists {
			if !sameStagedHasInstanceSource(prior.hasInstance, recipe.hasInstance) {
				return false
			}
		} else if !work.registerOperationRecipe(facts, recipe) {
			return false
		}
	}
	if !work.registerOperationUse(facts, sourceStagedOperationUse{request: root}) {
		return false
	}
	id := work.operationIDs[root.producer]
	work.registerOperationDependencies(facts, id)
	work.prepareStagedHasInstance(facts, id, owner)
	return true
}

func (work *callableEffectWork) publishHasInstancePhase(facts []callableFacts, root sourceStagedOperationRequest, role string, delta sourceStagedOperationDelta, owner *executableBodyOwner) {
	request := stagedHasInstanceRequest(root, role)
	recipe := work.operationRecipes[request.producer]
	if recipe.hasInstance == nil || recipe.hasInstance.generation != owner.values.generation {
		return
	}
	// Source prefixes are monotone. A cached complete prefix cannot authenticate
	// this graph, even when its descriptive metadata is still identical.
	if !operationDeltaPrefix(recipe.delta, delta) {
		return
	}
	recipe.delta = cloneOperationDelta(delta)
	if !work.attachOperationSource(facts, recipe) {
		return
	}
	id, ok := work.operationIDs[request.producer]
	if !ok {
		return
	}
	state := &work.operations[id.index]
	if state.hasInstance == nil {
		state.hasInstance = &sourceStagedHasInstanceState{generation: owner.values.generation, started: true}
	}
	state.hasInstance.observed = true
	work.registerOperationDependencies(facts, id)
	if operationDeltaSize(delta) == 0 {
		if delta.extracted {
			work.publishSourceDisposition(id)
		}
	} else {
		work.publishOperation(id, delta)
	}
}

// prepareStagedHasInstance uses the original source acquisition and binder.
// Unknown values are not manufactured from opaque/incomplete flags. A raw
// operand result or Proxy protocol remains an explicit required phase.
func (work *callableEffectWork) prepareStagedHasInstance(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	s := recipe.hasInstance
	if s == nil || s.generation != owner.values.generation {
		return
	}
	rootID, ok := work.operationIDs[s.root.producer]
	if !ok {
		return
	}
	work.prepareHasInstanceBindingData(facts, s.root, owner)
	state := &work.operations[rootID.index]
	if state.hasInstance != nil && state.hasInstance.started {
		return
	}
	state.hasInstance = &sourceStagedHasInstanceState{generation: owner.values.generation, started: true}
	root := s.root
	binary := root.producer.operation.AsBinaryExpression()
	q := newSourceDependencyQuery(root.use, owner.checker, owner, root.consumer)
	defer q.publishDependencyStatistics()
	// Registering all phases above precedes both the binding Get and member Get.
	// A Call/Get result needs its own demanded value producer, not recursive input
	// recovery on this operator's behalf.
	right := unwrapSourceCallableReference(binary.Right)
	if right == nil || ast.IsCallExpression(right) || ast.IsNewExpression(right) || ast.IsTaggedTemplateExpression(right) || ast.IsPropertyAccessExpression(right) || ast.IsElementAccessExpression(right) {
		return
	}
	rhs := q.accessorsAtGet(binary.Right, nil, "", accessorAcquire, nil, nil, nil)
	left := unwrapSourceCallableReference(binary.Left)
	leftKnown := sourceInertValueCreation(left)
	var lhs accessorCandidates
	var creation *sourceStagedHasInstanceCreation
	if leftKnown {
		creationBorrow := &sourceStagedHasInstanceGetBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, get: &sourceGetInputs{operation: root.use}, cut: q.relativeInputCut(root.use)}
		creationBorrow.creation = func(value sourceStagedHasInstanceCreation) { copy := value; creation = &copy }
		release := q.beginStagedHasInstanceGet(creationBorrow)
		lhs = q.accessorsAtGet(binary.Left, nil, "", accessorAcquire, nil, nil, nil)
		release()
	}
	lhsReady := leftKnown && hasInstanceAcquisitionRepresented(&lhs) && len(lhs.values) > 0
	if lhsReady {
		work.publishHasInstancePhase(facts, root, "lhs-value", sourceStagedOperationDelta{extracted: true, exposures: []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: binary.Left, producer: root.use, cut: root.cut}}}}, owner)
	}
	key, symbol := q.nativeWellKnownKey("hasInstance", &rhs)
	if key == "" {
		return
	}
	getDelta := sourceStagedOperationDelta{}
	prototypeDelta := sourceStagedOperationDelta{}
	rhsReady := hasInstanceAcquisitionRepresented(&rhs) && len(rhs.values) > 0
	allDefault, allMethods := len(rhs.values) > 0, len(rhs.values) > 0
	allGet := rhsReady
	protocolReady := lhsReady
	defaultPending := false
	var nativeBranches []sourceStagedHasInstanceNativeBranch
	nativePrototypeReady := true
	allProtocolSources := true
	for _, receiver := range rhs.values {
		if receiver.node == nil || len(receiver.path) != 0 {
			allDefault, allMethods, allGet = false, false, false
			continue
		}
		get := &sourceGetInputs{operation: root.use, receiver: receiver, symbol: symbol, propertyKey: key}
		revoke, installed := work.beginStagedMemberWork(q, facts, root)
		if !installed {
			allDefault, allMethods, allGet = false, false, false
			continue
		}
		sourceGet := &sourceStagedHasInstanceGetBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, get: get, cut: q.relativeInputCut(root.use), key: key, receiver: receiver, accounted: true, complete: true}
		releaseGet := q.beginStagedHasInstanceGet(sourceGet)
		sourceGet.classDefault = func(selectedGet *sourceGetInputs, proof sourceStagedHasInstanceClassDefault) bool {
			return work.acceptHasInstanceClassDefault(facts, q, selectedGet, proof)
		}
		sourceGet.requireLookup = func(origin *ast.Node) bool { return work.requireHasInstanceLookup(facts, root, q, get, origin, owner) }
		sourceGet.consume = func(member *ast.Node, selectedGet *sourceGetInputs, scope acquiredCallableScope, result *accessorCandidates) bool {
			return work.consumeHasInstanceMember(facts, root, q, selectedGet, member, scope, result, owner)
		}
		selected := q.accessorsAtGet(binary.Right, []string{key}, "", accessorAcquire, nil, nil, get, receiver)
		releaseGet()
		getDelta.required = appendHasInstanceRequests(getDelta.required, sourceGet.required)
		borrow := q.stagedMember
		if borrow != nil && borrow.coverage != nil {
			getDelta.required = appendHasInstanceRequired(getDelta.required, borrow.coverage.request)
		} else {
			allGet = false
		}
		revoke()
		if len(selected.values) == 0 {
			allDefault, allMethods, protocolReady = false, false, false
		}
		getRepresented := hasInstanceAcquisitionRepresented(&selected)
		if sourceGet.inherited {
			getRepresented = hasInstanceInheritedGetEffectsRepresented(&selected)
		}
		if sourceGet.observed {
			getRepresented = getRepresented && sourceGet.accounted
		}
		allGet = allGet && getRepresented && (len(selected.values) > 0 || sourceGet.inherited && sourceGet.observed && sourceGet.accounted)
		protocolReady = protocolReady && sourceGet.complete
		allProtocolSources = allProtocolSources && sourceGet.complete
		// Conditional own bodies do not establish which key was created. A
		// possible ordinary-default branch still needs its prototype protocol.
		if sourceGet.selectionUncertain && !sourcePrimitiveValue(left) && !ast.IsObjectLiteralExpression(receiver.node) {
			proof, represented := work.completeHasInstanceDefault(root, sourceGet.defaultClass, creation, q)
			prototypeID := work.operationIDs[stagedHasInstanceRequest(root, "prototype").producer]
			prototypeState := &work.operations[prototypeID.index]
			if prototypeState.hasInstance == nil {
				prototypeState.hasInstance = &sourceStagedHasInstanceState{generation: q.owner.generation}
			}
			prototypeState.hasInstance.defaultRequired = true
			if represented {
				prototypeState.hasInstance.defaultProof = proof
				prototypeDelta.required = appendHasInstanceRequests(prototypeDelta.required, proof.class.required)
			} else {
				defaultPending = true
			}
		}
		getDelta.effects = append(getDelta.effects, selected.environmentEffects...)
		for methodIndex, method := range selected.values {
			if method.native != nil && method.native.kind == sourceNativeDefaultHasInstance && receiver.native != nil && receiver.native.kind == sourceNativeWeakMapConstructor {
				allMethods = false
				protocolReady = protocolReady && hasInstanceOrdinaryLeft(left)
				if sourcePrimitiveValue(left) {
					nativePrototypeReady = false // This event did not perform prototype Get.
					continue
				} // The primitive branch returns before prototype Get.
				// OrdinaryHasInstance performs this distinct original protocol
				// Get. Selection of @@hasInstance cannot pay its source work.
				prototypeGet := &sourceGetInputs{operation: root.use, receiver: receiver, propertyKey: "prototype"}
				release, borrowed := work.beginStagedMemberWork(q, facts, root)
				if !borrowed {
					protocolReady = false
					nativePrototypeReady = false
					continue
				}
				prototype := q.accessorsAtGet(binary.Right, []string{"prototype"}, "", accessorAcquire, nil, nil, prototypeGet, receiver)
				if q.stagedMember != nil && q.stagedMember.coverage != nil {
					prototypeDelta.required = appendHasInstanceRequired(prototypeDelta.required, q.stagedMember.coverage.request)
				} else {
					protocolReady = false
					nativePrototypeReady = false
				}
				release()
				prototypeReady := hasInstanceAcquisitionRepresented(&prototype) && len(prototype.values) > 0
				for _, slot := range prototype.values {
					if slot.native == nil || slot.native.kind != sourceNativeWeakMapPrototype || slot.native.acquired != receiver.native.acquired {
						prototypeReady = false
						continue
					}
					nativeBranches = append(nativeBranches, sourceStagedHasInstanceNativeBranch{receiver: receiver.node, acquired: receiver.native.acquired, method: method.node, prototype: slot.node})
				}
				nativePrototypeReady = nativePrototypeReady && prototypeReady
				protocolReady = protocolReady && prototypeReady
				continue
			}
			allDefault = false
			if method.node == nil || !ast.IsFunctionLike(method.node) || method.node.Body() == nil || len(method.path) != 0 {
				allMethods = false
				protocolReady = false
				continue
			}
			// Known method effects remain connected even while Get selection or another
			// alternative is pending. Availability alone never authorizes invocation.
			scope, scoped := selected.callableScopes[methodIndex]
			var selectedScope *acquiredCallableScope
			if scoped {
				selectedScope = &scope
			}
			if !lhsReady || !work.bindHasInstanceMethod(facts, root, q, receiver, lhs.values, method, selectedScope, owner) {
				allMethods = false
				protocolReady = false
			}
		}
	}
	work.publishHasInstancePhase(facts, root, "rhs-input", sourceStagedOperationDelta{extracted: rhsReady}, owner)
	getDelta.extracted = allGet
	work.publishHasInstancePhase(facts, root, "has-instance-get", getDelta, owner)
	// A custom callable does not run OrdinaryHasInstance. Its original body is
	// the algorithm owner. Default prototype traversal remains separately pending
	// for Proxy, aliased object and unrepresented source operands.
	prototypeDelta.extracted = protocolReady && (allDefault || allMethods) && !defaultPending
	work.publishHasInstancePhase(facts, root, "prototype", prototypeDelta, owner)
	work.publishHasInstancePhase(facts, root, "algorithm", sourceStagedOperationDelta{extracted: protocolReady && (allDefault || allMethods)}, owner)
	work.publishHasInstancePhase(facts, root, "", recipeForHasInstanceRoot(work, root), owner)
	if allDefault && allGet && allProtocolSources && nativePrototypeReady && len(nativeBranches) != 0 {
		work.recordHasInstanceNativeDefault(root, q.relativeInputCut(root.use), nativeBranches, appendHasInstanceRequests(append([]sourceStagedOperationRequest(nil), getDelta.required...), prototypeDelta.required))
	}
}

func recipeForHasInstanceRoot(work *callableEffectWork, root sourceStagedOperationRequest) sourceStagedOperationDelta {
	delta := cloneOperationDelta(work.operationRecipes[root.producer].delta)
	delta.extracted = true // All independently required phases still gate closure.
	return delta
}

func appendHasInstanceRequired(requests []sourceStagedOperationRequest, request sourceStagedOperationRequest) []sourceStagedOperationRequest {
	for _, prior := range requests {
		if sameOperationRequest(prior, request) {
			return requests
		}
	}
	return append(requests, request)
}

func hasInstanceAcquisitionRepresented(result *accessorCandidates) bool {
	if result != nil {
		for _, value := range result.values {
			if value.native != nil && value.native.referencesIncomplete {
				return false
			}
		}
	}
	return result != nil && !result.opaque && !result.valueIncomplete && !result.receiverIncomplete && !result.fieldReceiverIncomplete && !result.ownOperation && !result.thenIncomplete && nativeMemberGetChannelsRepresented(result) && len(result.contextEffects) == 0 && len(result.environmentEffects) == 0 && result.ownedComponents == nil
}

// OrdinaryHasInstance does not inspect an argument which is not an object.
// A direct ordinary literal with the default intrinsic prototype has no Proxy
// link. Special __proto__, aliases and all result-dependent operands stay open.
func hasInstanceOrdinaryLeft(value *ast.Node) bool {
	if value == nil {
		return false
	}
	if sourcePrimitiveValue(value) {
		return true
	}
	if !ast.IsObjectLiteralExpression(value) || !sourceInertValueCreation(value) {
		return false
	}
	for _, member := range value.AsObjectLiteralExpression().Properties.Nodes {
		if member.Name() != nil && !ast.IsComputedPropertyName(member.Name()) && callableNameText(member.Name()) == "__proto__" {
			return false
		}
	}
	return true
}

func (work *callableEffectWork) bindHasInstanceMethod(facts []callableFacts, root sourceStagedOperationRequest, q *sourceValueQuery, receiver sourceValue, actuals []sourceValue, method sourceValue, scope *acquiredCallableScope, owner *executableBodyOwner) bool {
	target, known := work.memberNodes[method.node]
	if !known || len(actuals) != 1 {
		return false
	}
	consumer := work.memberNodes[root.consumer]
	request := sourceRelativeInvocation{declaration: method.node, operation: root.use, use: q.effectUse(), cut: q.relativeInputCut(root.use), actualsKnown: true}
	binary := root.use.AsBinaryExpression()
	request.receiver = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: binary.Right, producer: root.use, cut: request.cut}
	request.actuals = []sourceRelativeActual{{expression: binary.Left, endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: binary.Left, producer: root.use, cut: request.cut}}}
	edge := stagedDeclarationCallEdge(facts[consumer].summary.ID, request)
	work.requireStagedSummary(facts, consumer, target, edge, root.use, request.cut)
	// The original acquisition supplies capture scope. No scope is reconstructed
	// from a declaration or a body. Unavailable captures retain required work.
	if method.capture != nil {
		scope = method.capture
	}
	part := accessorCandidates{}
	inputs, delivered := q.bindStagedImplicitInputs(request, receiver, actuals, scope, &part)
	if !delivered || !sameSourceRelativeInputEnvelope(request, inputs.bound) {
		return false
	}
	inputs.relative = projectHasInstanceLiteralInput(inputs, actuals, owner.values)
	mapped := writerMethodInputsMapped(facts[target], inputs, owner)
	work.connectHasInstanceBody(facts, root, request, inputs, mapped)
	return mapped
}

// sourceStagedHasInstanceGetBorrow belongs to the original selected-member Get.
// Its issuing query slot and exact original/selected Get must agree. It never
// lends an acquired normal frame. Revocation clears callbacks before queued work.
type sourceStagedHasInstanceGetBorrow struct {
	issuer                                  *sourceValueQuery
	owner                                   *sourceValueOwner
	generation                              *projectGeneration
	get                                     *sourceGetInputs
	selected                                *sourceGetInputs
	cut                                     sourceRelativeCut
	key                                     string
	receiver                                sourceValue
	observed, accounted, complete, finished bool
	inherited                               bool
	selectionUncertain                      bool
	consume                                 func(*ast.Node, *sourceGetInputs, acquiredCallableScope, *accessorCandidates) bool
	requireLookup                           func(*ast.Node) bool
	required                                []sourceStagedOperationRequest
	creation                                func(sourceStagedHasInstanceCreation)
	classDefault                            func(*sourceGetInputs, sourceStagedHasInstanceClassDefault) bool
	defaultClass                            *sourceStagedHasInstanceClassDefault
}

func (q *sourceValueQuery) liveStagedHasInstanceGet(get *sourceGetInputs) bool {
	if q == nil || get == nil || get.hasInstance == nil || q.owner == nil {
		return false
	}
	b := get.hasInstance
	return q.stagedHasInstance == b && b.issuer == q && b.owner == q.owner && b.generation == q.owner.generation && (b.get == get || b.selected == get) && !b.finished && b.consume != nil && q.dependenciesOnly && q.inputs == nil && q.operation == nil && get.operation != nil && ast.IsBinaryExpression(get.operation) && get.operation.AsBinaryExpression().OperatorToken.Kind == ast.KindInstanceOfKeyword && q.reading == get.operation && b.cut == q.relativeInputCut(get.operation) && (get.propertyKey == b.key || b.selected == get && get.propertyKey == "") && get.receiver.node == b.receiver.node && len(get.receiver.path) == 0
}

// observeStagedHasInstanceMember runs at the original source member branch,
// after its writer inventory and before recursive getter execution. Computed
// MAY matches retain conditional body contributions and unfinished selection.
func (q *sourceValueQuery) observeStagedHasInstanceMember(origin, member *ast.Node, get *sourceGetInputs, receiver sourceValue, scope acquiredCallableScope, projection []string, name string, mode accessorTraversal, conditional bool, result *accessorCandidates) bool {
	if q == nil || q.stagedHasInstance == nil {
		return false
	}
	b := q.stagedHasInstance
	if !q.liveStagedHasInstanceGet(b.get) || get == nil || get.operation != b.get.operation || get.receiver.node != b.receiver.node || receiver.node != get.receiver.node || len(receiver.path) != 0 || len(projection) != 1 || projection[0] != b.key || name != "" || mode != accessorAcquire || member == nil || member.Parent != origin {
		return false
	}
	if origin != receiver.node && (get.lookupOwner == nil || get.lookupOwner.node != origin) {
		return false
	}
	if !q.liveStagedHasInstanceGet(get) {
		return false
	}
	b.observed = true
	b.selectionUncertain = b.selectionUncertain || conditional
	if !b.consume(member, get, scope, result) {
		b.accounted, b.complete = false, false
	}
	return true
}

// withStagedHasInstanceSelectedGet is called by the original class/literal
// owner only. It lends that branch's exact Get, without accepting a detached
// observation or retaining its source scope beyond this synchronous callback.
func (q *sourceValueQuery) withStagedHasInstanceSelectedGet(get *sourceGetInputs, observe func() bool) bool {
	if q == nil || q.stagedHasInstance == nil || get == nil || observe == nil {
		return false
	}
	b := q.stagedHasInstance
	if !q.liveStagedHasInstanceGet(b.get) || get.operation != b.get.operation || get.receiver.node != b.receiver.node || len(get.receiver.path) != 0 {
		return false
	}
	previous, marker := b.selected, get.hasInstance
	b.selected, get.hasInstance = get, b
	defer func() {
		if b.selected == get {
			b.selected = previous
		}
		if get.hasInstance == b {
			get.hasInstance = marker
		}
	}()
	return observe()
}

// beginStagedHasInstanceGet installs one synchronous source borrow. Query/Get
// copies and saved callbacks gain no rights. Nested borrows restore exact prior
// pointers, and no query, scope or callback survives in an operation recipe.
func (q *sourceValueQuery) beginStagedHasInstanceGet(b *sourceStagedHasInstanceGetBorrow) func() {
	previous, marker := q.stagedHasInstance, b.get.hasInstance
	q.stagedHasInstance, b.get.hasInstance = b, b
	live := true
	return func() {
		if !live {
			return
		}
		live = false
		if q.stagedHasInstance == b {
			q.stagedHasInstance = previous
		}
		if b.get.hasInstance == b {
			b.get.hasInstance = marker
		}
		b.finished = true
		b.issuer, b.selected, b.consume, b.requireLookup = nil, nil, nil, nil
		b.creation, b.classDefault = nil, nil
	}
}

func (work *callableEffectWork) consumeHasInstanceMember(facts []callableFacts, root sourceStagedOperationRequest, q *sourceValueQuery, get *sourceGetInputs, member *ast.Node, scope acquiredCallableScope, result *accessorCandidates, owner *executableBodyOwner) bool {
	if !q.liveStagedHasInstanceGet(get) || get.operation != root.use || owner == nil || owner.values.generation != q.owner.generation {
		return false
	}
	b := get.hasInstance
	expose := func(body *ast.Node) {
		if result.callableScopes == nil {
			result.callableScopes = make(map[int]acquiredCallableScope)
		}
		result.callableScopes[len(result.values)] = scope
		result.values = append(result.values, sourceValue{node: body})
	}
	if ast.IsMethodDeclaration(member) {
		expose(member)
		return true
	}
	if ast.IsPropertyAssignment(member) {
		value := unwrapSourceCallableReference(member.AsPropertyAssignment().Initializer)
		if value != nil && (ast.IsArrowFunction(value) || ast.IsFunctionExpression(value)) {
			expose(value)
			return true
		}
		// Reading storage does not replay its initializer or turn its unknown result
		// into a runtime unknown. A demanded value producer must supply that branch.
		b.complete = false
		return true
	}
	if !ast.IsGetAccessorDeclaration(member) {
		b.complete = false
		return true
	}
	target, known := work.memberNodes[member]
	if !known || len(member.Parameters()) != 0 {
		return false
	}
	consumer := work.memberNodes[root.consumer]
	invocation := sourceRelativeInvocation{declaration: member, operation: root.use, use: q.effectUse(), cut: q.relativeInputCut(root.use), actualsKnown: true, receiver: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: root.use.AsBinaryExpression().Right, producer: root.use, cut: q.relativeInputCut(root.use)}}
	edge := stagedDeclarationCallEdge(facts[consumer].summary.ID, invocation)
	// Required canonical body membership precedes the real original Get binder.
	work.requireStagedSummary(facts, consumer, target, edge, root.use, invocation.cut)
	inputs := q.bindGetInputs(member, root.use, get.receiver, scope.bindings, result)
	if !q.liveStagedHasInstanceGet(get) || inputs == nil || inputs.get == nil || inputs.get.operation != root.use || inputs.get.receiver.node != get.receiver.node {
		return false
	}
	bound := sourceRelativeBoundInputs{declaration: member, operation: root.use, use: invocation.use, cut: invocation.cut}
	receiver, gap := describeRelativeBoundValues(inputs.bindings[0], sourceRelativeRole{kind: relativeRoleReceiver, declaration: member}, bound.cut)
	bound.bindings = []sourceRelativeBinding{receiver}
	bound.unsupported = gap
	// This detached edge is issued by the actual synchronous Get binder above.
	// No Call AST, delivered input or receiver frame is manufactured from metadata.
	delivered := &sourceRelativeInputEdge{request: invocation, bound: cloneSourceRelativeBoundInputs(bound), relative: cloneSourceRelativeBoundInputs(bound), delivered: true}
	if !sameSourceRelativeInputEnvelope(invocation, bound) {
		return false
	}
	mapped := stagedFieldGetterInputsMapped(member, delivered, owner) && gap == relativeInputsSupported
	if !mapped {
		b.complete = false
	}
	work.connectHasInstanceBody(facts, root, invocation, delivered, mapped)
	// Return templates supply conditional literal sources only. Availability of a
	// getter body or an empty return inventory is not output completeness.
	templates := describeStagedReturnTemplates(member, owner.values)
	if len(templates) == 0 {
		b.complete = false
	}
	// This scope is the original Get binder's actual tuple, not the pre-Get
	// capture environment. Returned arrows retain that lexical receiver while
	// their unresolved capture/return relationships remain independently pending.
	scope.bindings = inputs.bindings
	for _, template := range templates {
		if template.unknown || template.callable == nil || len(template.captures) != 0 {
			b.complete = false
			continue
		}
		endpoint := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: template.callable, producer: member, creation: root.use, returning: template.returning, cut: bound.cut}
		rootState := work.operations[work.operationIDs[root.producer].index].hasInstance
		rootState.returned = append(rootState.returned, sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(endpoint), creating: delivered})
		// Capture-free literal creation supplies no installed scope or normal output.
		// Its original getter/return association stays separately retained above.
		expose(template.callable)
	}
	return true
}

func (work *callableEffectWork) connectHasInstanceBody(facts []callableFacts, root sourceStagedOperationRequest, invocation sourceRelativeInvocation, inputs *sourceRelativeInputEdge, mapped bool) {
	consumer := work.memberNodes[root.consumer]
	target := work.memberNodes[invocation.declaration]
	edge := stagedDeclarationCallEdge(facts[consumer].summary.ID, invocation)
	work.requireStagedSummary(facts, consumer, target, edge, root.use, invocation.cut)
	// Known body contributions survive unsupported capture/input siblings. The
	// canonical membership stays unfinished until those actual inputs are mapped.
	if !mapped {
		work.stagedRequired[sourceStagedDependencyKey{consumer, edge}].projectionPending = true
	}
	found := false
	for i, prior := range facts[consumer].staged.calls {
		if prior.invocation.operation == root.use && prior.invocation.declaration == invocation.declaration {
			facts[consumer].staged.calls[i] = sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: cloneStagedWriterInvocation(invocation), inputs: inputs}
			found = true
			break
		}
	}
	if !found {
		facts[consumer].staged.calls = append(facts[consumer].staged.calls, sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: cloneStagedWriterInvocation(invocation), inputs: inputs})
	}
	work.operationInvocationOnEdge(facts, consumer, target, root.use, invocation.cut, edge)
	work.operations[work.operationIDs[root.producer].index].hasInstance.methods = append(work.operations[work.operationIDs[root.producer].index].hasInstance.methods, inputs)
}

// projectHasInstanceLiteralInput preserves the original B while describing one
// already-acquired immediate capture-free callable as dormant formal data. The
// general binder's absent factory-creator gap is not a missing lexical capture
// for this original literal. Actual captures and every other gap stay pending.
func projectHasInstanceLiteralInput(inputs *sourceRelativeInputEdge, actuals []sourceValue, owner *sourceValueOwner) sourceRelativeBoundInputs {
	if inputs == nil {
		return sourceRelativeBoundInputs{unsupported: relativeInputsInvalidOwner}
	}
	out := cloneSourceRelativeBoundInputs(inputs.bound)
	if !inputs.delivered || out.unsupported != relativeInputsUnsupportedCapture || len(actuals) != 1 || owner == nil || inputs.request.operation == nil || !ast.IsBinaryExpression(inputs.request.operation) {
		return out
	}
	actual := actuals[0]
	literal := unwrapSourceCallableReference(inputs.request.operation.AsBinaryExpression().Left)
	if literal == nil || actual.node != literal || (!ast.IsArrowFunction(literal) && !ast.IsFunctionExpression(literal)) || !sourceInertValueCreation(literal) || stagedCallReturnLiteralHasCapture(literal, owner) || actual.normal != nil || actual.acquired != nil || actual.native != nil || len(actual.path) != 0 {
		return out
	}
	represented, changed := true, false
	for i := range out.bindings {
		binding := &out.bindings[i]
		if binding.target.kind == relativeRoleFormal && binding.target.declaration == out.declaration && binding.target.slot == 0 && binding.unknown && len(binding.pending) == 0 && len(binding.sources) == 1 {
			endpoint := &binding.sources[0]
			if endpoint.kind == relativeEndpointExpression && endpoint.expression == literal && len(endpoint.projection) == 0 && endpoint.creation == nil && endpoint.returning == nil && endpoint.cut == out.cut {
				binding.unknown = false
				changed = true
				endpoint.producer = inputs.request.operation
			}
		}
		represented = represented && !binding.unknown && len(binding.pending) == 0
	}
	if represented && changed {
		out.unsupported = relativeInputsSupported
	}
	return out
}

func stagedHasInstanceSourceRequest(source *sourceStagedHasInstanceSource) sourceStagedOperationRequest {
	request := stagedHasInstanceRequest(source.root, source.role)
	if source.role == "lookup-prototype" && source.lookup != nil {
		request.producer.selector.association = source.lookup
		request.edge += fmt.Sprintf(":%d:%d", source.lookup.Pos(), source.lookup.End())
	}
	return request
}

func appendHasInstanceRequests(target, requests []sourceStagedOperationRequest) []sourceStagedOperationRequest {
	for _, request := range requests {
		target = appendHasInstanceRequired(target, request)
	}
	return target
}

// observeStagedHasInstanceInheritedSource is called only by the original
// inherited Get owner at its source-only, missing-normal-view branch. The loan
// supplies Effects coverage and required sources, never presence or Get output.
func (q *sourceValueQuery) observeStagedHasInstanceInheritedSource(get *sourceGetInputs) bool {
	if !q.liveStagedHasInstanceGet(get) || get.hasInstance.requireLookup == nil {
		return false
	}
	b := get.hasInstance
	if !b.requireLookup(get.receiver.node) || !q.liveStagedHasInstanceGet(get) || get.hasInstance != b {
		return false
	}
	b.inherited = true
	return true
}

func hasInstanceInheritedGetEffectsRepresented(result *accessorCandidates) bool {
	// Value incompleteness is intentionally withheld by the positive source Get
	// transfer. All other outstanding effect/protocol channels remain required.
	return result != nil && !result.opaque && !result.receiverIncomplete && !result.fieldReceiverIncomplete && !result.ownOperation && !result.thenIncomplete && nativeMemberGetChannelsRepresented(result) && len(result.contextEffects)+len(result.environmentEffects) == 0 && result.ownedComponents == nil
}

// requireHasInstanceLookup is called from the actual ordinary source owner,
// after its writer traversal and before its inherited prototype lookup. Missing
// Own/Get/prototype authority remains pending with the original source group.
// Neither an empty inventory nor the computed member's type closes this role.
func (work *callableEffectWork) requireHasInstanceLookup(facts []callableFacts, root sourceStagedOperationRequest, q *sourceValueQuery, get *sourceGetInputs, origin *ast.Node, owner *executableBodyOwner) bool {
	if !q.liveStagedHasInstanceGet(get) || get.operation != root.use || origin != get.receiver.node || !ast.IsObjectLiteralExpression(origin) || owner == nil || owner.values.generation != q.owner.generation {
		return false
	}
	if q.stagedMember == nil || q.stagedMember.coverage == nil {
		return false
	}
	coverage := q.stagedMember.coverage
	if coverage.generation != q.owner.generation || coverage.origin != origin || coverage.cut != q.relativeInputCut(get.operation) || !coverage.extracted || work.memberCoverageObserved[coverage.request.producer] != q.owner.generation || !validStagedMemberCoverageRecipe(work.operationRecipes[coverage.request.producer]) {
		return false
	}
	key, symbol := q.nativeWellKnownKey("hasInstance", &accessorCandidates{})
	if key != get.propertyKey || symbol != get.symbol || symbol == nil {
		return false
	}
	premise := q.stagedConditionalObjectPrototype(symbol.ValueDeclaration)
	if !stagedOrdinaryLiteralPrototype(origin, premise) {
		return false
	}
	source := &sourceStagedHasInstanceSource{root: root, role: "lookup-prototype", lookup: origin, standard: premise, generation: q.owner.generation}
	source.request = stagedHasInstanceSourceRequest(source)
	recipe := sourceStagedOperationRecipe{key: source.request.producer, hasInstance: source, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{coverage.request}, extracted: true}}
	if prior, exists := work.operationRecipes[recipe.key]; exists {
		if !sameStagedHasInstanceSource(prior.hasInstance, source) {
			return false
		}
	} else if !work.registerOperationRecipe(facts, recipe) {
		return false
	}
	id, issued := work.requireOperation(facts, source.request)
	if !issued {
		return false
	}
	state := &work.operations[id.index]
	state.hasInstance = &sourceStagedHasInstanceState{generation: q.owner.generation, observed: true, started: true}
	work.registerOperationDependencies(facts, id)
	if !work.publishOperation(id, recipe.delta) {
		return false
	}
	get.hasInstance.required = appendHasInstanceRequired(get.hasInstance.required, source.request)
	return true
}

// prepareHasInstanceBindingData connects the original lhs Identifier to the
// existing binding/Get DATA publisher. Local population and its required
// closure are separate from OrdinaryHasInstance's prototype traversal. An
// arbitrary DATA alternative cannot certify an ordinary object or inert input.
func (work *callableEffectWork) prepareHasInstanceBindingData(facts []callableFacts, root sourceStagedOperationRequest, owner *executableBodyOwner) {
	left := root.use.AsBinaryExpression().Left
	if !ast.IsIdentifier(left) || owner == nil || owner.values == nil || work.operationGeneration != owner.values.generation {
		return
	}
	caller, known := work.memberNodes[root.consumer]
	if !known || caller < 0 || caller >= len(facts) {
		return
	}
	source, valid := work.describeStagedCallResultSource(facts, caller, left, owner)
	if !valid || source.binding == nil || !sameOperationRequest(source.request, stagedBindingResultRequest(left, root.consumer)) {
		return
	}
	if prior, registered := work.operationRecipes[source.request.producer]; registered {
		if !sameStagedCallResultSource(prior.callResult, source) {
			return
		}
	} else if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
		return
	}
	if _, registered := work.requireOperation(facts, source.request); !registered {
		return
	}
	delta := sourceStagedOperationDelta{required: []sourceStagedOperationRequest{source.request}}
	delivery, current := work.stagedCallResultData(source.request)
	if current && delivery.delta.extracted {
		delta.extracted = true
		delta.exposures = []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: left, producer: root.use, cut: root.cut}}}
	}
	work.publishHasInstancePhase(facts, root, "lhs-value", delta, owner)
}

// refreshStagedHasInstanceInputs consumes only current cumulative DATA on an
// already adopted lhs role. It neither restarts Get acquisitions nor resets the
// operator's existing observations, methods, default proof or required children.
func (work *callableEffectWork) refreshStagedHasInstanceInputs(facts []callableFacts, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || work.operationGeneration != owner.values.generation {
		return false
	}
	var roots []sourceStagedOperationRequest
	for _, state := range work.operations {
		recipe := work.operationRecipes[state.key]
		if source := recipe.hasInstance; !state.invalid && source != nil && source.role == "lhs-value" && source.generation == work.operationGeneration && validStagedHasInstanceRecipe(recipe) {
			left := source.root.use.AsBinaryExpression().Left
			if !ast.IsIdentifier(left) || len(recipe.delta.required) != 1 {
				continue
			}
			reading := stagedBindingResultRequest(left, source.root.consumer)
			if !sameOperationRequest(recipe.delta.required[0], reading) {
				continue
			}
			if _, current := work.stagedCallResultData(reading); current {
				roots = append(roots, source.root)
			}
		}
	}
	changed := false
	for _, root := range roots {
		id := work.operationIDs[stagedHasInstanceRequest(root, "lhs-value").producer]
		before := work.operations[id.index].revision
		work.prepareHasInstanceBindingData(facts, root, owner)
		changed = work.operations[id.index].revision != before || changed
		changed = work.refreshHasInstanceNativeDefault(facts, root, owner) || changed
	}
	return changed
}
