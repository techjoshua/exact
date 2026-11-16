package exactcompiler

import (
	"sort"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The interest and selection intervals are synchronous SOURCE-use permissions.
// Neither is callee selection, a creating activation or a normal input frame.
type sourceConstructionCallInterest struct {
	issuer     *sourceValueQuery
	call       *ast.Node
	generation *projectGeneration
	original   [4]*ast.Node
}
type sourceConstructionCallSelection struct {
	interest *sourceConstructionCallInterest
	issuer   *sourceValueQuery
	call     *ast.Node
	cuts     [4]*ast.Node
}

func (q *sourceValueQuery) beginConstructionCallInterest(call *ast.Node) func() {
	if q == nil || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || q.owner == nil || q.executable == nil || q.executable.project == nil || q.owner.generation == nil || !q.owner.generation.active || q.executable.project.activeGeneration != q.owner.generation || call == nil || !ast.IsCallExpression(call) {
		return func() {}
	}
	if q.inputs != nil && (q.inputs.operationLifetime != nil || q.inputs.population != nil || q.inputs.storage != nil || q.inputs.get != nil) {
		return func() {}
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact == nil || publisher.fact.node != q.effectOwner || publisher.fact.normalInputs != nil || publisher.fact.sourceFile == nil || q.owner.program.GetSourceFile(publisher.fact.sourceFile.FileName()) != publisher.fact.sourceFile || ast.GetSourceFileOfNode(call) != publisher.fact.sourceFile {
		return func() {}
	}
	prior := q.constructionCall
	interest := &sourceConstructionCallInterest{issuer: q, call: call, generation: q.owner.generation, original: q.calleeAcquisitionCuts()}
	q.constructionCall = interest
	return func() { q.constructionCall = prior; interest.issuer = nil }
}
func (q *sourceValueQuery) beginConstructionCallSelection(call *ast.Node) func() {
	interest := q.constructionCall
	if interest == nil || interest.issuer != q || interest.call != call || interest.generation != q.owner.generation || q.initializing != call || q.reading != interest.original[0] || q.returning != interest.original[2] || q.invoking != interest.original[3] {
		return func() {}
	}
	prior := q.constructionSelection
	selection := &sourceConstructionCallSelection{interest: interest, issuer: q, call: call, cuts: q.calleeAcquisitionCuts()}
	q.constructionSelection = selection
	return func() { q.constructionSelection = prior; selection.issuer = nil }
}

func (q *sourceValueQuery) retainConstructionCallable(value *sourceConstructionCallableValue, path []string, result *accessorCandidates) {
	copy := cloneConstructionCallableValue(value)
	result.values = append(result.values, sourceValue{constructionCallable: copy, path: append([]string(nil), path...)})
	result.opaque, result.valueIncomplete = true, true
	if len(path) != 0 {
		return
	}
	selection := q.constructionSelection
	if selection == nil || selection.issuer != q || selection.interest == nil || selection.interest.issuer != q || q.constructionCall != selection.interest || selection.call != selection.interest.call || selection.cuts != q.calleeAcquisitionCuts() || !q.active[selection.call] || value == nil || value.source == nil || value.pending || value.source.unsupported || value.source.generation != q.owner.generation || !q.owner.generation.active || len(value.captures) != len(value.source.captures) {
		return
	}
	source := value.source
	if source.parent.inputs != nil || source.parent.producer.kind != relativeDemandDirectExposure || source.parent.producer.operation != source.creation || source.parent.producer.declaration != source.owner || source.parent.consumer != source.owner {
		return
	}
	if ast.GetSourceFileOfNode(source.callable) == nil || q.owner.program.GetSourceFile(ast.GetSourceFileOfNode(source.callable).FileName()) != ast.GetSourceFileOfNode(source.callable) || enclosingCallableNode(source.creation) != source.owner {
		return
	}
	scope := acquiredCallableScope{bindings: make(sourceValueBindings), creators: make(map[*ast.Node]sourceValueCreation), constructionCapture: cloneConstructionCallableValue(value)}
	for i, capture := range value.captures {
		expected := source.captures[i]
		if capture.pending || capture.role != expected.role || !sameOperationRequest(capture.required, expected.required) || !localConstructionBinding(expected.binding, source.owner, q.owner) {
			return
		}
		symbol := q.owner.checker.GetSymbolAtLocation(expected.binding.Name())
		if symbol == nil || symbol.ValueDeclaration != expected.binding {
			return
		}
		for _, alternative := range capture.alternatives {
			endpoint := alternative.endpoint
			// Captured objects stay typed source operators. No raw receiver is seeded.
			if endpoint.kind == relativeEndpointModuleConstruction && endpoint.moduleConstruction != nil {
				copy := cloneSourceRelativeEndpoint(endpoint)
				scope.bindings[ast.GetSymbolId(symbol)] = append(scope.bindings[ast.GetSymbolId(symbol)], sourceValue{constructionView: &copy})
			} else if endpoint.kind == relativeEndpointConstructionCallable && endpoint.constructionCallable != nil {
				scope.bindings[ast.GetSymbolId(symbol)] = append(scope.bindings[ast.GetSymbolId(symbol)], sourceValue{constructionCallable: cloneConstructionCallableValue(endpoint.constructionCallable)})
			} else if endpoint.kind == relativeEndpointExpression && stagedSourceDataValue(endpoint.expression) && !stagedCallReturnLiteralHasCapture(endpoint.expression, q.owner) && alternative.creating == nil {
				scope.bindings[ast.GetSymbolId(symbol)] = append(scope.bindings[ast.GetSymbolId(symbol)], sourceValue{node: endpoint.expression})
			} else if endpoint.kind == relativeEndpointUndefined {
				scope.bindings[ast.GetSymbolId(symbol)] = append(scope.bindings[ast.GetSymbolId(symbol)], sourceValue{undefined: true})
			} else {
				return
			}
		}
		for index := range scope.bindings[ast.GetSymbolId(symbol)] {
			bound := &scope.bindings[ast.GetSymbolId(symbol)][index]
			bound.constructionRole = capture.role
			bound.constructionRequired = capture.required
			bound.constructionGeneration = source.generation
			bound.constructionOrdinal = i
		}
		if len(scope.bindings[ast.GetSymbolId(symbol)]) == 0 {
			return
		}
	}
	index := len(result.values)
	result.values = append(result.values, sourceValue{node: source.callable, capture: &scope})
	if result.callableScopes == nil {
		result.callableScopes = make(map[int]acquiredCallableScope)
	}
	result.callableScopes[index] = scope
	// Known source bodies coexist with the conditional/unknown marker. Their
	// actual inputs/defaults/Throw/Effects still belong to invokeAcquired.
}

func (q *sourceValueQuery) retainConstructionView(endpoint sourceRelativeEndpoint, path []string, name string, mode accessorTraversal, instance bool, result *accessorCandidates) {
	copy := cloneSourceRelativeEndpoint(endpoint)
	copy.projection = append(copy.projection, path...)
	if name != "" {
		copy.projection = append(copy.projection, name)
	}
	result.values = append(result.values, sourceValue{constructionView: &copy})
	result.opaque, result.valueIncomplete = true, true
	if q == nil || q.owner == nil || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || instance || len(copy.projection) != 1 || (mode != accessorAcquire && mode != accessorRead && mode != accessorInvoke) {
		return
	}
	// A known field is donor provenance only. The original Get/C owner still
	// consumes this contribution's runtime MAY and full required SOURCE set.
	if q.stagedMember == nil {
		return
	}
	contribution, represented := constructionFieldReadContribution(q, copy, q.stagedMember.get)
	if !represented {
		return
	}
	alternatives := contribution.alternatives
	if contribution.pending {
		result.valueIncomplete = true
	}
	for _, alternative := range alternatives {
		value := alternative.endpoint
		if value.kind == relativeEndpointConstructionCallable && value.constructionCallable != nil {
			q.retainConstructionCallable(value.constructionCallable, nil, result)
		}
	}
}

// New operators cannot piggyback on a normal/native/identity carrier. Their
// source creation/reader association is carried only by the typed payload.
func constructionMarkerCarrier(value sourceValue) bool {
	return value.node == nil && value.frameworkView == nil && value.descriptorView == nil && value.capture == nil && value.instance == nil && value.normal == nil && value.native == nil && value.acquired == nil && value.initializerUse == nil && value.ownedGetRow == nil && value.adapter == nil && value.bound == nil && value.entrySlot == nil && value.number == (numberPayload{}) && value.rest == nil && value.copied == nil && value.awaited == nil && !value.undefined
}

// constructionBoundCaptureBindings is called at the actual installed SOURCE
// binder/body publication. It reads supplied role metadata, not later AST or
// arbitrary caller bindings. The phase owner separately validates its own fact,
// reader/cut, required membership and APPLIED delivery before publishing.
func constructionBoundCaptureBindings(q *sourceValueQuery, inputs *sourceValueInputs) ([]sourceRelativeBinding, []sourceStagedOperationRequest, bool) {
	if q == nil || inputs == nil || q.inputs != inputs || !q.dependenciesOnly || q.operation != nil || q.owner == nil || q.owner.generation == nil || !q.owner.generation.active || inputs.invocation == nil || !ast.IsCallExpression(inputs.invocation) || inputs.declaration == nil || inputs.constructionCapture == nil || inputs.constructionCapture.source == nil || inputs.constructionCapture.pending || inputs.constructionCapture.source.callable != inputs.declaration || inputs.constructionCapture.source.generation != q.owner.generation || inputs.operationLifetime != nil || inputs.population != nil || inputs.storage != nil || inputs.get != nil {
		return nil, nil, false
	}
	type entry struct {
		ordinal  int
		binding  sourceRelativeBinding
		required sourceStagedOperationRequest
	}
	var entries []entry
	var bindings []sourceRelativeBinding
	var required []sourceStagedOperationRequest
	if inputs.constructionCapture.source.parent.producer.operation == nil {
		return nil, nil, false
	}
	required = appendEntryLawRequirement(required, inputs.constructionCapture.source.parent)
	for symbol, values := range inputs.bindings {
		var role sourceRelativeRole
		var source sourceStagedOperationRequest
		marked := false
		for _, value := range values {
			if value.constructionRole.kind == relativeRoleUnknown {
				continue
			}
			if value.constructionRole.kind != relativeRoleCapture || value.constructionRole.declaration != inputs.declaration || value.constructionGeneration != q.owner.generation || value.constructionRole.binding == nil || value.constructionRequired.producer.operation == nil {
				return nil, nil, false
			}
			if marked && (role != value.constructionRole || !sameOperationRequest(source, value.constructionRequired)) {
				return nil, nil, false
			}
			role, source, marked = value.constructionRole, value.constructionRequired, true
		}
		if !marked {
			continue
		}
		original := q.owner.checker.GetSymbolAtLocation(role.binding.Name())
		if original == nil || ast.GetSymbolId(original) != symbol || original.ValueDeclaration != role.binding || q.owner.bindingWritten(original) {
			return nil, nil, false
		}
		for _, value := range values {
			if value.constructionRole != role || value.constructionGeneration != q.owner.generation || !sameOperationRequest(value.constructionRequired, source) {
				return nil, nil, false
			}
		}
		binding, gap := describeRelativeBoundValues(values, role, q.relativeInputCut(inputs.invocation))
		if gap != relativeInputsSupported {
			return nil, nil, false
		}
		entries = append(entries, entry{ordinal: values[0].constructionOrdinal, binding: binding, required: source})
	}
	if len(entries) != len(inputs.constructionCapture.source.captures) {
		return nil, nil, false
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].ordinal < entries[j].ordinal })
	for ordinal, entry := range entries {
		if entry.ordinal != ordinal || entry.binding.target != inputs.constructionCapture.source.captures[ordinal].role || !sameOperationRequest(entry.required, inputs.constructionCapture.source.captures[ordinal].required) {
			return nil, nil, false
		}
		bindings = append(bindings, entry.binding)
		required = appendEntryLawRequirement(required, entry.required)
	}
	return bindings, required, true
}

// A field contribution authenticates donor provenance under one original Get.
// runtimeMay is retained even for a known field: property presence, replacement,
// getters and trap Effects belong to the phase owner's independent C closure.
type sourceConstructionFieldReadContribution struct {
	parent       sourceStagedOperationRequest
	cut          sourceRelativeCut
	source       sourceRelativeEndpoint
	alternatives []sourceStagedOperationAlternative
	required     []sourceStagedOperationRequest
	pending      bool
	runtimeMay   bool
}

func constructionFieldReadContribution(q *sourceValueQuery, endpoint sourceRelativeEndpoint, get *sourceGetInputs) (sourceConstructionFieldReadContribution, bool) {
	var result sourceConstructionFieldReadContribution
	if q == nil || q.owner == nil || get == nil || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || endpoint.moduleConstruction == nil || endpoint.moduleConstruction.source == nil || endpoint.moduleConstruction.source.generation != q.owner.generation || len(endpoint.projection) != 1 || endpoint.projection[0] != get.propertyKey {
		return result, false
	}
	// Definition lookup and installed/selector lookup have distinct issuers.
	// Neither can borrow the other's outer C or retarget the supplied Get.
	var parent sourceStagedOperationRequest
	var cut sourceRelativeCut
	owned := false
	if b := q.stagedMember; b != nil && b.coverage != nil && q.protectedMember != nil && get == b.get && get.operation == q.protectedMember && b.request.producer.operation == q.protectedMember && q.liveStagedMemberSource(b, get, b.read) {
		parent, cut, owned = b.request, b.observation, true
	}
	if !owned {
		parent, cut, owned = q.installedSourceMemberReadOwner(get)
	}
	if !owned {
		return result, false
	}
	alternatives, known, pending := moduleConstructionFieldSources(endpoint, get.propertyKey)
	if !known {
		return result, false
	}
	result.parent, result.cut = parent, cut
	result.source = cloneSourceRelativeEndpoint(endpoint)
	result.alternatives, result.pending, result.runtimeMay = alternatives, pending, true
	result.required = appendEntryLawRequirement(result.required, endpoint.moduleConstruction.source.request)
	for index, field := range endpoint.moduleConstruction.source.fields {
		if field.name != get.propertyKey {
			continue
		}
		if field.required.producer.operation != nil {
			result.required = appendEntryLawRequirement(result.required, field.required)
		}
		result.pending = result.pending || endpoint.moduleConstruction.fields[index].pending
	}
	for _, alternative := range alternatives {
		required, represented := constructionEndpointRoleRequirements(alternative.endpoint)
		for _, request := range required {
			result.required = appendEntryLawRequirement(result.required, request)
		}
		result.pending = result.pending || !represented
	}
	return result, true
}
