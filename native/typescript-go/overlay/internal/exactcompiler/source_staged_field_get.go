package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedFieldEntryLaw names an original semantic owner's local
// no-user-entry contribution. It is independent of Effects accounting, selected
// values and prototype identity. The consuming owner must separately retain
// every source alternative and preceding implicit conversion requirement.
type sourceStagedFieldEntryLaw uint8

const (
	stagedFieldOrdinaryHasNoUserEntry sourceStagedFieldEntryLaw = iota + 1
	stagedFieldOwnDataNoUserEntry
	stagedFieldIntrinsicGetNoUserEntry
)

// sourceStagedFieldEntryEvent exists only during an original owner's local-law
// callback. The graph receives detached source metadata, never this Get pointer.
type sourceStagedFieldEntryEvent struct {
	get *sourceGetInputs
	law sourceStagedFieldEntryLaw
}

// sourceStagedFieldGetBorrow is one synchronous Effects-only field request. The
// original member/Get owner selects alternatives. Its binder can yield into the
// existing work graph before any normal lifetime, body or returned-value query.
// Only detached input descriptions survive this borrow.
type sourceStagedFieldGetBorrow struct {
	freshCreateTarget    *sourceStagedNativeGetSource // Current original Create target for this field read.
	intrinsicMutation    func(*sourceValueQuery, *sourceGetInputs, *sourceMemberWriterReadCut) bool
	intrinsicPublication *sourceStagedIntrinsicMutationEvent
	mutationHas          func(*sourceValueQuery, *sourceGetInputs, *sourceStagedFieldObservation) // Source-only actual Has event.
	memberRequest        *sourceStagedMemberRequest
	argumentOrder        *sourceStagedNativeArgumentOrder
	argumentEpoch        *sourceStagedOperationEpoch
	argumentGet          *sourceGetInputs
	argumentLookup       *sourceStagedFieldArgumentLookup
	argumentGroup        *ast.Node
	argumentRead         func() *sourceStagedNativeArgumentOrder
	issuer               *sourceValueQuery
	owner                *sourceValueOwner
	generation           *projectGeneration
	operation, receiver  *ast.Node
	field                string
	request              sourceStagedOperationRequest
	cut                  sourceRelativeCut
	consume              func(*ast.Node, sourceRelativeBoundInputs) bool
	observation          *sourceStagedFieldObservation
	disposition          func(sourceStagedFieldDisposition) bool
	expose               func(*ast.Node, sourceRelativeCut) bool
	prototype            func(*sourceValueQuery, *sourceGetInputs)
	sourcesCovered       func(*sourceValueQuery, *sourceGetInputs) bool
	beginMemberSource    func(*sourceGetInputs) (func(), bool)
	noUserEntry          func(*sourceGetInputs, sourceStagedFieldEntryLaw) bool
	noUserPublication    *sourceStagedFieldEntryEvent
}

// consumeFieldGetterSource asks the existing Get owner for the already-issued
// field demand. This is not replay of a captured query. Unsupported origins and
// own-writer/selection uncertainty remain required pending work. A source task
// runs once per graph. It neither caches a negative query result nor seals Get.
func (work *callableEffectWork) consumeFieldGetterSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner, dispatch ...*callableExtractionTask) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	if state.getterSourceRequested || state.effectsDemand == nil {
		return
	}
	// Descriptor DATA can arrive after the original role was issued. Refresh
	// its semantic receiver from that same current reader before body binding.
	work.prepareFieldGetterRequirements(facts, id, owner)
	demand, current := work.issueFieldEffectsDemand(facts, id, owner)
	if !current {
		return
	}
	argumentOrder, argumentNeeded := work.stagedModuleArgumentFieldOrder(work.operationRecipes[demand.request.producer].nativeGet, demand.request)
	if argumentNeeded && argumentOrder == nil {
		return
	}
	state = &work.operations[id.index]
	state.effectsDemand = &demand
	if demand.receiver.kind != relativeEndpointExpression || !ast.IsObjectLiteralExpression(demand.receiver.expression) {
		return
	}
	// A missing alias prefix must remain retryable on actual DATA delivery.
	// Known receiver/body prefixes are retained without closing other branches.
	state.getterSourceRequested = !demand.receiverPending
	if runtimeModuleEvaluation(demand.request.consumer) {
		work.registerFieldEntryLawSources(facts, work.operationRecipes[demand.request.producer].nativeGet)
	}
	query := newSourceDependencyQuery(demand.request.producer.operation, owner.checker, owner, demand.request.producer.declaration)
	defer query.publishDependencyStatistics()
	borrow := &sourceStagedFieldGetBorrow{argumentOrder: argumentOrder, argumentEpoch: work.operationEpoch, issuer: query, owner: query.owner, generation: query.owner.generation, operation: demand.request.producer.operation, receiver: demand.receiver.expression, field: demand.request.producer.selector.field, cut: query.relativeInputCut(demand.request.producer.operation)}
	borrow.request = demand.request
	if runtimeModuleEvaluation(demand.request.consumer) {
		source := work.operationRecipes[demand.request.producer].nativeGet
		borrow.freshCreateTarget = work.currentDirectCreateDefinitionTarget(source)
	}
	borrow.intrinsicMutation = func(issuer *sourceValueQuery, input *sourceGetInputs, physical *sourceMemberWriterReadCut) bool {
		return work.publishOriginalIntrinsicFieldMutationSource(facts, issuer, input, physical)
	}
	borrow.mutationHas = func(issuer *sourceValueQuery, input *sourceGetInputs, observation *sourceStagedFieldObservation) {
		work.captureNativeInstallationFieldHas(facts, issuer, input, observation)
	}
	if argumentNeeded {
		fieldSource := work.operationRecipes[demand.request.producer].nativeGet
		borrow.argumentGroup = fieldSource.descriptorEntry.entry.group
		borrow.argumentRead = func() *sourceStagedNativeArgumentOrder {
			current, _ := work.stagedModuleArgumentFieldOrder(work.operationRecipes[demand.request.producer].nativeGet, demand.request)
			return current
		}
	}
	borrow.noUserEntry = func(input *sourceGetInputs, law sourceStagedFieldEntryLaw) bool {
		// Record this pointwise event independently from the module prefix law.
		// Function events remain pending evidence, not no-user-entry publication.
		work.recordImplicitFieldPrimitive(facts, query, input, law)
		if runtimeModuleEvaluation(demand.request.consumer) {
			return work.recordFieldEntryLaw(facts, query, input, law)
		}
		return false
	}
	borrow.beginMemberSource = func(input *sourceGetInputs) (func(), bool) {
		if !query.liveStagedFieldGet(input) {
			return func() {}, false
		}
		parent, valid := stagedFieldMemberRequest(demand.request, borrow.observation.phase)
		if !valid {
			return func() {}, false
		}
		revoke, installed := work.beginStagedMemberWork(query, facts, parent)
		if !installed {
			return revoke, false
		}
		borrow.argumentGet = input
		return func() { revoke(); borrow.argumentGet = nil }, true
	}
	borrow.consume = func(body *ast.Node, bound sourceRelativeBoundInputs) bool {
		return work.acceptFieldGetterInputs(facts, id, demand, body, bound, owner)
	}
	borrow.observation = &sourceStagedFieldObservation{}
	borrow.disposition = func(value sourceStagedFieldDisposition) bool {
		if demand.receiverPending {
			value.kind = stagedFieldDispositionUnknown // Compiler-pending alternatives, not a runtime residual.
		}
		return work.recordStagedFieldDisposition(facts, id, demand, value, owner)
	}
	get := &sourceGetInputs{operation: borrow.operation, receiver: sourceValue{node: borrow.receiver}, propertyKey: borrow.field, stagedEffects: borrow}
	borrow.expose = func(value *ast.Node, cut sourceRelativeCut) bool {
		if !query.liveStagedFieldGet(get) || borrow.observation == nil || borrow.observation.phase != stagedFieldObservationGet || cut != borrow.cut {
			return false
		}
		return work.recordFieldCallableExposure(facts, id, demand, query, get, value, cut, owner)
	}
	borrow.prototype = func(issuer *sourceValueQuery, input *sourceGetInputs) {
		work.requestInstalledFieldGet(facts, demand, issuer, input, owner)
	}
	borrow.sourcesCovered = func(issuer *sourceValueQuery, input *sourceGetInputs) bool {
		return work.fieldSourcesLocallyRepresented(facts, demand, issuer, input, owner)
	}
	query.stagedFieldGet = borrow
	defer func() {
		borrow.issuer, borrow.consume, borrow.disposition, borrow.observation = nil, nil, nil, nil
		borrow.expose, borrow.prototype, borrow.sourcesCovered = nil, nil, nil
		borrow.beginMemberSource = nil
		borrow.mutationHas = nil
		borrow.intrinsicMutation, borrow.intrinsicPublication = nil, nil
		borrow.noUserEntry = nil
		borrow.noUserPublication = nil
		borrow.argumentOrder, borrow.argumentEpoch, borrow.argumentGet = nil, nil, nil
		borrow.argumentLookup = nil
		borrow.argumentGroup, borrow.argumentRead = nil, nil
		query.stagedFieldGet = nil
	}()
	roles, issued := fieldSourceRequests(demand.request)
	if issued {
		revoke, installed := query.beginStagedWriterSource(func(sourceStagedWriterRead) bool {
			return work.publishStagedWriterRead(facts, query, roles.ownWriters)
		})
		if installed {
			defer revoke()
		}
	}
	if len(dispatch) == 1 {
		revokeRequest, installed := work.beginStagedFieldMemberRequests(query, facts, id, owner, dispatch[0])
		if !installed {
			return
		}
		defer revokeRequest()
	}
	work.discoverFieldSources(facts, demand, query, get)
	// Normal Has/Get/descriptor state is intentionally absent. The existing
	// member owner still collects all own-write alternatives and uncertainty.
	disposition := consumeStagedFieldDispositionSource(query, get, borrow.observation)
	if borrow.memberRequest != nil && !borrow.memberRequest.completed() {
		return
	}
	query.publishStagedFieldDisposition(get, disposition)
	work.completeSequenceValueSources(facts, demand, query, get)
	work.completeReflectiveOwnFieldSources(facts, demand, query, get)
}

func (query *sourceValueQuery) transferStagedFieldGetter(body *ast.Node, get *sourceGetInputs, scope acquiredCallableScope, result *accessorCandidates) bool {
	borrow := query.stagedFieldGet
	if !query.liveStagedFieldGet(get) || borrow.consume == nil || body == nil || !ast.IsGetAccessorDeclaration(body) || len(body.Parameters()) != 0 {
		return false
	}
	// This is the original Get binder, not a manufactured Call or scope restored
	// at another cut. Captures remain with their original acquired creator map.
	previous := query.creators
	query.creators = scope.creators
	defer func() { query.creators = previous }()
	inputs := query.bindGetInputs(body, get.operation, get.receiver, scope.bindings, result)
	receiver := sourceRelativeRole{kind: relativeRoleReceiver, declaration: body}
	bound := sourceRelativeBoundInputs{declaration: body, operation: get.operation, use: query.effectUse(), cut: query.relativeInputCut(get.operation)}
	// Authentication above ties this bound slot to the original source receiver.
	// No acquired wrapper, scope or binding map enters the descriptive payload.
	if values := inputs.bindings[0]; len(values) == 1 && values[0].node == borrow.receiver && len(values[0].path) == 0 {
		bound.bindings = []sourceRelativeBinding{{target: receiver, sources: []sourceRelativeEndpoint{{kind: relativeEndpointExpression, expression: borrow.receiver, producer: get.operation, get: borrow.receiver, cut: bound.cut}}}}
	} else {
		bound.unsupported = relativeInputsUnsupportedReceiver
	}
	if !borrow.consume(body, bound) {
		return false // Unsupported selected alternatives keep their original consumer.
	}
	result.valueIncomplete = true
	return true // The Effects owner yielded. This supplies no Get output/completion.
}

func (work *callableEffectWork) acceptFieldGetterInputs(facts []callableFacts, id sourceStagedOperationID, demand sourceStagedFieldEffectsDemand, body *ast.Node, bound sourceRelativeBoundInputs, owner *executableBodyOwner) bool {
	current, valid := work.issueFieldEffectsDemand(facts, id, owner)
	target, found := work.memberNodes[body]
	if !valid || !found || owner.values.program.GetSourceFile(facts[target].sourceFile.FileName()) != facts[target].sourceFile || !sameOperationRequest(current.request, demand.request) || !sameOperationEndpoint(current.receiver, demand.receiver) || bound.declaration != body || bound.operation != demand.request.producer.operation {
		return false
	}
	request := sourceRelativeInvocation{declaration: body, operation: bound.operation, use: bound.use, cut: bound.cut, actualsKnown: true, receiver: cloneSourceRelativeEndpoint(demand.receiver)}
	if !sameSourceRelativeInputEnvelope(request, bound) {
		return false
	}
	// The selected Get may find another source getter through an authored own
	// writer/prototype alternative. Declaration inventory is not a whitelist.
	// Register this known body before yielding, retaining its independent debt.
	known := false
	for _, requirement := range work.operations[id.index].getters {
		known = known || requirement.declaration == body
	}
	if !known {
		edge := fmt.Sprintf("%s:field:%s:selected:%s", demand.request.edge, demand.request.producer.selector.field, facts[target].summary.ID)
		work.requireStagedSummary(facts, work.memberNodes[demand.request.consumer], target, edge, demand.request.producer.operation, demand.request.cut)
		work.operations[id.index].getters = append(work.operations[id.index].getters, sourceStagedGetterRequirement{demand: demand, declaration: body, edge: edge, receiverPending: true, selectionPending: true})
	}
	for index := range work.operations[id.index].getters {
		requirement := &work.operations[id.index].getters[index]
		if requirement.declaration != body {
			continue
		}
		if requirement.inputs == nil {
			requirement.inputs = &sourceRelativeInputEdge{request: request, bound: cloneSourceRelativeBoundInputs(bound), relative: fieldGetterRelativeInputs(bound, demand, facts[target], owner), delivered: true}
			requirement.selectionPending = false // Conditional branch, not aggregate Get coverage.
			requirement.receiverPending = bound.unsupported != relativeInputsSupported
		}
		work.deliverFieldGetterBody(facts, requirement, owner)
		return true
	}
	return false
}

// deliverFieldGetterBody consumes a late ready summary without reacquiring the
// Get or its receiver. The original required source edge owns revision delivery.
func (work *callableEffectWork) deliverFieldGetterBody(facts []callableFacts, requirement *sourceStagedGetterRequirement, owner *executableBodyOwner) {
	if requirement.installed != nil {
		return // The closure owner drains conditional source installations separately.
	}
	if requirement.inputs == nil || requirement.bodyTransferred || owner == nil {
		return
	}
	target := work.memberNodes[requirement.declaration]
	requirement.bodyReady = facts[target].staged.ready
	// Stateful/receiver/capture-dependent bodies retain their actual binder edge.
	if requirement.receiverPending || !requirement.bodyReady || !stagedFieldGetterInputsMapped(requirement.declaration, requirement.inputs, owner) {
		return
	}
	consumer := work.memberNodes[requirement.demand.request.consumer]
	operation := requirement.inputs.bound.operation
	work.operationInvocationOnEdge(facts, consumer, target, operation, requirement.demand.request.cut, requirement.edge)
	if facts[consumer].fieldEdgeOperations == nil {
		facts[consumer].fieldEdgeOperations = make(map[string]*ast.Node)
	}
	facts[consumer].fieldEdgeOperations[requirement.edge] = operation
	requirement.bodyTransferred = true
}

// This body consumer uses existing canonical summary propagation and M03's
// demanded immutable formal-capture substitution. Other receiver/capture/state
// requirements stay pending. Nested callable creation remains dormant.
func stagedFieldGetterInputsMapped(body *ast.Node, inputs *sourceRelativeInputEdge, owner *executableBodyOwner) bool {
	independent := true
	walkNode(body.Body(), func(node *ast.Node) bool {
		if node != body.Body() && ast.IsFunctionLike(node) {
			return false
		}
		if node.Kind == ast.KindThisKeyword || node.Kind == ast.KindSuperKeyword {
			independent = false
		}
		if ast.IsIdentifier(node) && !isStaticPropertyName(node) {
			symbol := owner.checker.GetSymbolAtLocation(node)
			if symbol != nil && symbol.ValueDeclaration != nil {
				declaration := symbol.ValueDeclaration
				source := ast.GetSourceFileOfNode(declaration)
				ambient := ast.IsFunctionDeclaration(declaration) && declaration.Body() == nil && declaration.Parent != nil && ast.IsSourceFile(declaration.Parent)
				if enclosingCallableNode(declaration) != body && source != nil && !source.IsDeclarationFile && !ambient {
					// A source-authenticated module callee has its own input/body
					// producer. Calling it needs no getter capture value lookup.
					if node.Parent != nil && ast.IsCallExpression(node.Parent) && node.Parent.Expression() == node {
						if _, admitted := describeStagedInputSubstitution(node.Parent, body, owner); admitted {
							return independent
						}
					}
					independent = fieldGetterCaptureUseMapped(node, body, inputs, owner)
				}
			}
		}
		return independent
	})
	return independent
}

// stagedFieldDataEffectsOnly recognizes the exact terminal read owned by the
// live Effects borrow. Reading a data slot cannot rerun its creating expression.
// Eager construction and any demanded output keep their independent producers.
func (query *sourceValueQuery) stagedFieldDataEffectsOnly(get *sourceGetInputs, projection []string, name string, mode accessorTraversal) bool {
	return mode == accessorAcquire && len(projection) == 1 && name == "" && query.liveStagedFieldGet(get) && !get.hasOnly && projection[0] == get.propertyKey && get.stagedEffects.observation != nil && get.stagedEffects.observation.phase == stagedFieldObservationGet
}
