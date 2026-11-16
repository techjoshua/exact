package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedGetResultSource describes finite roles of one original Get.
// Observed source DATA and actual getter inputs belong to the current work,
// not this cloneable description. No normal property value is retained.
type sourceStagedGetResultSource struct {
	frameworkResume *sourceFrameworkGetResumption // Original Get source continuation; no normal Get DATA.

	role        string
	body        *ast.Node
	represented bool // Original selected source population, not cached readiness.
}

type sourceStagedGetResultBorrow struct {
	sourceOwner           *sourceValueOwner
	issuer                *sourceValueQuery
	work                  *callableEffectWork
	facts                 []callableFacts
	owner                 *executableBodyOwner
	get                   *sourceGetInputs
	request               sourceStagedOperationRequest
	cut                   sourceRelativeCut
	active, own, complete bool
	values                []sourceStagedOperationAlternative
	required              []sourceStagedOperationRequest
}

func stagedResultExpression(node *ast.Node) bool {
	return node != nil && (ast.IsCallExpression(node) || ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node))
}

func stagedGetResultBody(source *sourceStagedCallResultSource) bool {
	return source != nil && source.getResult != nil && source.getResult.role == "body" && source.getResult.body == source.declaration && ast.IsGetAccessorDeclaration(source.declaration)
}

func sameStagedGetResultSource(a, b *sourceStagedGetResultSource) bool {
	return a == b || a != nil && b != nil && a.role == b.role && a.body == b.body && sameFrameworkGetResumption(a.frameworkResume, b.frameworkResume)
}

func stagedGetResultRequest(operation, caller *ast.Node, role string, body *ast.Node) sourceStagedOperationRequest {
	kind := relativeDemandEffects
	if role == "value" || role == "body" {
		kind = relativeDemandDirectExposure
	}
	return sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: caller, operation: operation, kind: kind, selector: sourceStagedOperationSelector{occurrence: operation, association: body, field: "get-source:" + role}}, consumer: caller, use: operation, cut: sourceRelativeCut{operation: operation, use: operation, reading: operation}, edge: fmt.Sprintf("get-source:%d:%s:%p", operation.Pos(), role, body)}
}

func stagedResultSourceRequest(operation, caller, declaration *ast.Node) sourceStagedOperationRequest {
	if operation != nil && ast.IsIdentifier(operation) {
		return stagedBindingResultRequest(operation, caller)
	}
	if operation != nil && !ast.IsCallExpression(operation) {
		if declaration != nil && ast.IsGetAccessorDeclaration(declaration) {
			return stagedGetResultRequest(operation, caller, "body", declaration)
		}
		return stagedGetResultRequest(operation, caller, "value", nil)
	}
	return stagedCallResultRequest(operation, caller)
}

func originalStagedGetterCall(call sourceStagedDeclarationCall) bool {
	edge, request := call.inputs, call.invocation
	return edge != nil && call.sourceInputs == nil && edge.delivered && call.kind == relativeDemandEffects && request.operation != nil && !ast.IsCallExpression(request.operation) && stagedResultExpression(request.operation) && request.declaration != nil && ast.IsGetAccessorDeclaration(request.declaration) && request.actualsKnown && len(request.actuals) == 0 && sameSourceRelativeInvocation(edge.request, request) && sameSourceRelativeInputEnvelope(request, edge.bound) && sameSourceRelativeInputEnvelope(request, edge.relative)
}

func validStagedGetResultRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.callResult != nil && recipe.callResult.getResult != nil && recipe.callResult.getResult.frameworkResume != nil {
		return validFrameworkGetResumptionRecipe(recipe)
	}

	source := recipe.callResult
	if source == nil || source.getResult == nil || source.generation == nil || source.declaration != recipe.key.declaration || source.operand != nil || source.nativeCall || source.constructedRoot.producer.operation != nil || recipe.memberSource != nil || recipe.nativeGet != nil || recipe.constructed != nil || recipe.getter != nil || recipe.returning != nil || recipe.writer != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.assignment != nil || recipe.constructionEffects != nil || recipe.hasInstance != nil || recipe.entryLaw != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 || !stagedResultExpression(recipe.key.operation) || ast.IsCallExpression(recipe.key.operation) {
		return false
	}
	role := source.getResult.role
	if role != "value" && role != "effects" && role != "receiver" && role != "key" {
		return false
	}
	if source.getResult.body != nil || recipe.key != source.request.producer || !sameOperationRequest(source.request, stagedGetResultRequest(recipe.key.operation, recipe.key.declaration, role, nil)) {
		return false
	}
	if role != "value" && len(recipe.delta.exposures) != 0 || role == "value" && (len(recipe.delta.effects) != 0 || recipe.delta.extracted && !source.getResult.represented) {
		return false
	}
	for _, reading := range source.inputReadings {
		if !validStagedInputCallResultReading(source, reading) {
			return false
		}
	}
	for _, effect := range recipe.delta.effects {
		if !validOperationEnvironmentEffect(effect) {
			return false
		}
	}
	for _, required := range recipe.delta.required {
		if required.inputs != nil || required.consumer != required.producer.declaration {
			return false
		}
	}
	return true
}

func (work *callableEffectWork) describeStagedGetResultSource(facts []callableFacts, caller int, operation *ast.Node, owner *executableBodyOwner) *sourceStagedCallResultSource {
	return &sourceStagedCallResultSource{request: stagedGetResultRequest(operation, facts[caller].node, "value", nil), declaration: facts[caller].node, generation: owner.values.generation, getResult: &sourceStagedGetResultSource{role: "value"}}
}

// registerStagedGetResult reserves source roles without evaluating a receiver
// or activating an indexed occurrence. A Get's normal owner remains independent.
func (work *callableEffectWork) registerStagedGetResult(facts []callableFacts, caller int, node *ast.Node, owner *executableBodyOwner) (*sourceStagedCallResultSource, bool) {
	if owner == nil || owner.values == nil || node == nil || !stagedResultExpression(node) || ast.IsCallExpression(node) || !sourceStagedOccurrenceOwned(node, facts[caller].node) {
		return nil, false
	}
	work.indexOperationSources(facts)
	if work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return nil, false
	}
	work.operationGeneration = owner.values.generation
	for _, role := range []string{"receiver", "key", "effects", "value"} {
		source := work.describeStagedGetResultSource(facts, caller, node, owner)
		source.getResult.role = role
		source.request = stagedGetResultRequest(node, facts[caller].node, role, nil)
		if _, known := work.operationRecipes[source.request.producer]; !known && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
			return nil, false
		}
	}
	return work.operationRecipes[stagedGetResultRequest(node, facts[caller].node, "value", nil).producer].callResult, true
}

func (work *callableEffectWork) prepareStagedGetResult(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	source := work.operationRecipes[work.operations[id.index].key].callResult
	if source == nil || source.getResult == nil || owner == nil || source.generation != owner.values.generation {
		return
	}
	caller, known := work.memberNodes[source.request.consumer]
	if !known {
		return
	}
	if source.getResult.frameworkResume != nil {
		work.prepareFrameworkGetResumption(facts, id, owner)
		return
	}
	work.observeStagedGetResult(facts, caller, source.request.producer.operation, owner)
	if source.getResult.role == "value" && !work.stagedGetResultAdmitted(source.request.producer.operation, source.request.consumer) {
		owner.project.requireStagedReplacement(stagedReplacementGap{operation: source.request.producer.operation, consumer: source.request.consumer, parent: source.request, demand: "original Get receiver/source DATA producer", transition: "acquireRequiredPropertyAt"})
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if source.getResult.role == "value" && work.memberCoverageObserved[recipe.key] == work.operationGeneration {
		delta := cloneOperationDelta(recipe.delta)
		base := delta.exposures
		delta.exposures = nil
		// Direct member alternatives stay first. Getter DATA arrives through
		// separately required body subscribers, never through result acquisition.
		for _, alternative := range base {
			if alternative.endpoint.producer == recipe.key.operation {
				delta.exposures = append(delta.exposures, alternative)
			}
		}
		complete := true
		for _, required := range delta.required[1:] {
			if data, available := work.stagedCallResultData(required); available {
				delta.exposures = append(delta.exposures, data.delta.exposures...)
				complete = complete && data.delta.extracted
			} else {
				complete = false
			}
		}
		// With no body requirement, the original own-data observation already
		// supplies local completeness. Failed source populations stay pending.
		if len(delta.required) > 1 && complete && source.getResult.represented {
			delta.extracted = true
		}
		recipe.delta = delta
		work.attachOperationSource(facts, recipe)
		recipe = work.operationRecipes[recipe.key]
	}
	if work.memberCoverageObserved[recipe.key] == work.operationGeneration {
		if operationDeltaSize(recipe.delta) == 0 && recipe.delta.extracted {
			work.publishSourceDisposition(id)
		} else if operationDeltaSize(recipe.delta) != 0 {
			work.publishOperation(id, recipe.delta)
		}
	}
}

func stagedGetKey(operation *ast.Node) (string, bool) {
	if ast.IsPropertyAccessExpression(operation) {
		return operation.Name().Text(), !ast.IsOptionalChain(operation)
	}
	if ast.IsElementAccessExpression(operation) && !ast.IsOptionalChain(operation) {
		key := unwrapSourceCallableReference(operation.AsElementAccessExpression().ArgumentExpression)
		if key != nil && ast.IsStringLiteralLike(key) {
			return key.Text(), true
		}
	}
	return "", false
}

func (q *sourceValueQuery) liveStagedGetResult(get *sourceGetInputs) *sourceStagedGetResultBorrow {
	if q == nil || get == nil || get.resultSource == nil || q.owner == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil {
		return nil
	}
	b := get.resultSource
	if !b.active || b.issuer != q || b.get == nil || b.get.resultSource != b || b.sourceOwner != q.owner || b.owner.values.generation != b.work.operationGeneration || get.operation != b.request.producer.operation || q.relativeInputCut(get.operation) != b.cut {
		return nil
	}
	return b
}

// A whole ordinary literal's immediate Get precedes any exposure of that new
// receiver. This original Get relation, not an empty writer inventory, excludes
// earlier instance writers. Eager creation remains a separate requirement.
func (q *sourceValueQuery) stagedFreshGetResult(get *sourceGetInputs, receiver *ast.Node) bool {
	b := q.liveStagedGetResult(get)
	return b != nil && receiver != nil && ast.IsObjectLiteralExpression(receiver) && unwrapSourceCallableReference(get.operation.Expression()) == receiver && get.receiver.node == receiver && get.receiver.normal == nil && get.receiver.native == nil && get.receiver.acquired == nil && len(get.receiver.path) == 0
}

func (work *callableEffectWork) observeStagedGetResult(facts []callableFacts, caller int, operation *ast.Node, owner *executableBodyOwner) {
	value := stagedGetResultRequest(operation, facts[caller].node, "value", nil)
	if work.memberCoverageObserved[value.producer] == work.operationGeneration {
		return
	}
	if _, valid := work.registerStagedGetResult(facts, caller, operation, owner); !valid {
		return
	}
	if work.observeStagedExternalGetResult(facts, caller, operation, owner) {
		return
	}
	receiver := unwrapSourceCallableReference(operation.Expression())
	key, keyKnown := stagedGetKey(operation)
	if !keyKnown || receiver == nil || !ast.IsObjectLiteralExpression(receiver) || !sourceInertValueCreation(receiver) {
		return
	}
	query := newSourceDependencyQuery(operation, owner.checker, owner, facts[caller].node)
	defer query.publishDependencyStatistics()
	query.protectedMember = operation
	get := &sourceGetInputs{operation: operation, receiver: sourceValue{node: receiver}, propertyKey: key}
	b := &sourceStagedGetResultBorrow{issuer: query, work: work, facts: facts, owner: owner, sourceOwner: query.owner, get: get, request: value, cut: query.relativeInputCut(operation), active: true, complete: true}
	get.resultSource = b
	defer func() { b.active = false; b.issuer = nil; b.get = nil; b.facts = nil; get.resultSource = nil }()
	result := query.accessorsAtGet(receiver, []string{key}, "", accessorAcquire, nil, nil, get)
	b.complete = b.complete && !result.opaque && nativeMemberGetChannelsRepresented(&result)
	for _, candidate := range result.values {
		if candidate.undefined && b.own {
			b.values = append(b.values, sourceStagedOperationAlternative{endpoint: sourceRelativeEndpoint{kind: relativeEndpointUndefined, producer: operation, get: operation, cut: b.cut}})
		}
	}
	for _, role := range []string{"receiver", "key", "effects", "value"} {
		request := stagedGetResultRequest(operation, facts[caller].node, role, nil)
		recipe := work.operationRecipes[request.producer]
		delta := sourceStagedOperationDelta{}
		switch role {
		case "receiver":
			delta.extracted = sourceInertValueCreation(receiver)
		case "key":
			delta.extracted = keyKnown
		case "effects":
			delta.extracted = b.own && b.complete
			delta.required = []sourceStagedOperationRequest{stagedGetResultRequest(operation, facts[caller].node, "receiver", nil), stagedGetResultRequest(operation, facts[caller].node, "key", nil)}
		case "value":
			delta.extracted = b.own && b.complete && len(b.required) == 0
			delta.exposures = b.values
			delta.required = append([]sourceStagedOperationRequest{stagedGetResultRequest(operation, facts[caller].node, "effects", nil)}, b.required...)
		}
		snapshot := *recipe.callResult
		getSnapshot := *snapshot.getResult
		getSnapshot.represented = b.own && b.complete
		snapshot.getResult = &getSnapshot
		recipe.callResult = &snapshot
		recipe.delta = delta
		// A fresh original observation may be a prefix of a previously refined
		// description. Preserve that immutable DATA, while this graph still
		// reconstructs its actual getter B and every canonical requirement.
		if !work.attachOperationSource(facts, recipe) && !(b.own && b.complete && work.registerOperationSourcePrefix(facts, recipe)) {
			return
		}
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[recipe.key] = work.operationGeneration
	}
}

func stagedGetDataUse(node *ast.Node) bool {
	if node == nil || !stagedResultExpression(node) || ast.IsCallExpression(node) {
		return false
	}
	outer := node
	for outer.Parent != nil && (ast.IsParenthesizedExpression(outer.Parent) || ast.IsAsExpression(outer.Parent) || ast.IsNonNullExpression(outer.Parent)) {
		outer = outer.Parent
	}
	parent := outer.Parent
	return parent != nil && (ast.IsVariableDeclaration(parent) && parent.Initializer() == outer || ast.IsReturnStatement(parent) || ast.IsArrowFunction(parent) && parent.Body() == outer || ast.IsCallExpression(parent) && parent.Expression() != outer)
}

func (work *callableEffectWork) stageStagedGetResult(facts []callableFacts, caller int, node *ast.Node, owner *executableBodyOwner) bool {
	if _, valid := work.registerStagedGetResult(facts, caller, node, owner); !valid {
		return false
	}
	work.observeStagedGetResult(facts, caller, node, owner)
	request := stagedGetResultRequest(node, facts[caller].node, "effects", nil)
	if work.memberCoverageObserved[request.producer] != work.operationGeneration || !work.operationRecipes[request.producer].delta.extracted {
		return false
	}
	return work.registerOperationUse(facts, sourceStagedOperationUse{request: request})
}

// Local admission is the original Get owner's source disposition plus its
// represented evaluation roles. Getter DATA/body settlement may still be pending.
// Unadmitted default consumers retain their original recovery owner, while the
// private replacement gate reports the missing producer before that transition.
func (work *callableEffectWork) stagedGetResultAdmitted(operation, consumer *ast.Node) bool {
	request := stagedGetResultRequest(operation, consumer, "value", nil)
	source := work.operationRecipes[request.producer].callResult
	if source == nil || source.getResult == nil || !source.getResult.represented || work.memberCoverageObserved[request.producer] != work.operationGeneration {
		return false
	}
	for _, role := range []string{"receiver", "key"} {
		if !work.operationRecipes[stagedGetResultRequest(operation, consumer, role, nil).producer].delta.extracted {
			return false
		}
	}
	return true
}

// observeStagedGetResultMember is called only by the original selected member
// owner before initializer/result recovery. Getter membership precedes real B.
func (q *sourceValueQuery) observeStagedGetResultMember(receiver, member *ast.Node, get *sourceGetInputs, mode accessorTraversal, computed bool, arguments sourceValueBindings, result *accessorCandidates) bool {
	b := q.liveStagedGetResult(get)
	if b == nil || mode != accessorAcquire || !q.traceModeKnown || q.traceMode != mode || !q.stagedFreshGetResult(get, receiver) {
		return false
	}
	if computed {
		b.complete = false
	}
	key, known := stagedGetKey(get.operation)
	if known && member.Name() != nil && !ast.IsComputedPropertyName(member.Name()) && callableNameText(member.Name()) == key {
		b.own = true
	}
	work, facts := b.work, b.facts
	caller := work.memberNodes[b.request.consumer]
	if ast.IsGetAccessorDeclaration(member) {
		target, found := work.memberNodes[member]
		if !found {
			b.complete = false
			return true
		}
		if !stagedFieldGetterInputsMapped(member, nil, b.owner) && !fieldGetterInvokedCapturesEligible(facts[target], b.request.producer.declaration, b.owner) {
			b.complete = false
			return true
		}
		invocation := sourceRelativeInvocation{declaration: member, operation: get.operation, use: q.effectUse(), cut: q.relativeInputCut(get.operation), actualsKnown: true, receiver: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: receiver, producer: get.operation, cut: b.cut}}
		edge := stagedDeclarationCallEdge(facts[caller].summary.ID, invocation)
		work.requireStagedSummary(facts, caller, target, edge, get.operation, invocation.cut)
		scope := q.acquireCallableScope(arguments, result)
		inputs := q.bindGetInputs(member, get.operation, get.receiver, scope.bindings, result)
		bound := sourceRelativeBoundInputs{declaration: member, operation: get.operation, use: invocation.use, cut: invocation.cut}
		binding, gap := describeRelativeBoundValues(inputs.bindings[0], sourceRelativeRole{kind: relativeRoleReceiver, declaration: member}, bound.cut)
		bound.bindings, bound.unsupported = []sourceRelativeBinding{binding}, gap
		delivered := &sourceRelativeInputEdge{request: invocation, bound: cloneSourceRelativeBoundInputs(bound), relative: fieldGetterRelativeInputs(bound, sourceStagedFieldEffectsDemand{request: b.request}, facts[target], b.owner), delivered: true}
		mapped := stagedFieldGetterInputsMapped(member, delivered, b.owner) && gap == relativeInputsSupported
		if !mapped {
			b.complete = false
			work.stagedRequired[sourceStagedDependencyKey{caller, edge}].projectionPending = true
		}
		work.operationInvocationOnEdge(facts, caller, target, get.operation, invocation.cut, edge)
		present := false
		for index, call := range facts[caller].staged.calls {
			if call.inputs != nil && call.invocation.operation == get.operation && call.invocation.declaration == member {
				facts[caller].staged.calls[index] = sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: invocation, inputs: delivered}
				present = true
			}
		}
		if !present {
			facts[caller].staged.calls = append(facts[caller].staged.calls, sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: invocation, inputs: delivered})
		}
		request := stagedGetResultRequest(get.operation, facts[caller].node, "body", member)
		body := &sourceStagedCallResultSource{request: request, declaration: member, generation: work.operationGeneration, getResult: &sourceStagedGetResultSource{role: "body", body: member}}
		if !work.registerOperationSourcePrefix(facts, sourceStagedOperationRecipe{key: request.producer, callResult: body}) {
			b.complete = false
		}
		b.required = appendEntryLawRequirement(b.required, request)
		return true
	}
	var value *ast.Node
	switch {
	case ast.IsPropertyAssignment(member):
		value = member.AsPropertyAssignment().Initializer
	case ast.IsShorthandPropertyAssignment(member):
		value = member.Name()
	case ast.IsMethodDeclaration(member):
		value = member
	case ast.IsSetAccessorDeclaration(member):
		return true
	default:
		b.complete = false
		return true
	}
	endpoint := sourceStagedArgumentEndpoint(value, get.operation, facts[caller].node, q.owner)
	endpoint.producer, endpoint.get, endpoint.cut = get.operation, member, b.cut
	if endpoint.kind == relativeEndpointExpression && sourceInertValueCreation(value) || ast.IsMethodDeclaration(value) || endpoint.kind == relativeEndpointRole {
		b.values = append(b.values, sourceStagedOperationAlternative{endpoint: endpoint})
	} else {
		b.complete = false
	}
	return true
}

// stagedGetCaptureConsumer admits only an original invoked capture use whose
// selected Get has published its current source relation and real receiver B.
// Required membership is authenticated here; body/dependency closure is separate.
func (work *callableEffectWork) stagedGetCaptureConsumer(fact *callableFacts, node *ast.Node, owner *executableBodyOwner) bool {
	if fact == nil || node == nil || !ast.IsIdentifier(node) || owner == nil || owner.values == nil || work.operationGeneration != owner.values.generation {
		return false
	}
	caller, known := work.memberNodes[fact.node]
	if !known || caller >= len(work.operationFacts) || &work.operationFacts[caller] != fact {
		return false
	}
	body := enclosingCallableNode(node)
	target, known := work.memberNodes[body]
	if !known || !ast.IsGetAccessorDeclaration(body) {
		return false
	}
	role, valid := fieldGetterReturnedCaptureRole(node, body, owner)
	if !valid {
		demand, invoked := stageFieldGetterCaptureDemand(&work.operationFacts[target], node.Parent, owner)
		if !invoked || demand.origin.Expression() != node {
			return false
		}
		role = demand.role
	}
	formal, valid := fieldGetterCaptureFormal(role, fact.node, owner)
	if !valid {
		return false
	}
	for _, call := range fact.staged.calls {
		if call.invocation.declaration != body || !originalStagedGetterCall(call) || call.inputs.bound.unsupported != relativeInputsSupported || call.inputs.relative.unsupported != relativeInputsSupported || !fieldGetterCaptureUseMapped(node, body, call.inputs, owner) {
			continue
		}
		endpoint, mapped := fieldGetterCaptureSource(call.inputs.relative, role)
		if !mapped || endpoint.role != formal {
			continue
		}
		if endpoint.producer != call.invocation.operation || endpoint.get != call.invocation.operation || endpoint.cut != call.inputs.bound.cut {
			continue
		}
		request := stagedGetResultRequest(call.invocation.operation, fact.node, "effects", nil)
		recipe := work.operationRecipes[request.producer]
		source := recipe.callResult
		if source == nil || source.getResult == nil || !source.getResult.represented || source.generation != work.operationGeneration || !recipe.delta.extracted || !validStagedGetResultRecipe(recipe) || work.memberCoverageObserved[request.producer] != work.operationGeneration {
			continue
		}
		edge := stagedDeclarationCallEdge(fact.summary.ID, call.invocation)
		required := work.stagedRequired[sourceStagedDependencyKey{caller, edge}]
		if required != nil && !required.invalid && !required.projectionPending && required.producer == target && required.operation == call.invocation.operation && required.cut == call.invocation.cut {
			return true
		}
	}
	return false
}
