package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// installedConstructionMemberGet is called at the original accessor visitor,
// before its construction marker is joined. An explicit implicit Get is reused;
// an authored Read's actual lexical reference or the live callee selector may
// issue its source Get here. This is not a later reader rebuilding an operation,
// and its receiver remains the typed SOURCE marker rather than a raw object.
func (q *sourceValueQuery) installedConstructionMemberGet(endpoint sourceRelativeEndpoint, supplied *sourceGetInputs, reference *sourceGetReference, projection []string, name string, mode accessorTraversal) *sourceGetInputs {
	if q == nil || q.owner == nil || !q.dependenciesOnly || q.operation != nil || endpoint.moduleConstruction == nil || endpoint.moduleConstruction.source == nil || endpoint.moduleConstruction.source.generation != q.owner.generation {
		return nil
	}
	key := name
	if len(projection) == 1 && name == "" {
		key = projection[0]
	} else if len(projection) != 0 {
		return nil
	}
	operation := q.protectedMember
	if supplied != nil {
		// Explicit implicit fields retain their native original Call operation.
		// Only the real selected algorithm issuer may lend that nonlexical Get.
		phase := installedMemberAcquire
		if mode == accessorNoGet {
			phase = installedMemberHas
		}
		cut := &sourceMemberWriterReadCut{operation: supplied.operation, use: q.reading}
		if native := q.installedMemberNativePhase; native != nil && key == supplied.propertyKey && q.installedDescriptorMemberPhaseOwned(native.algorithm, supplied, cut, phase, key) {
			return supplied
		}
		if supplied.operation != operation || !installedMemberGetKey(supplied, key) {
			return nil
		}
	}
	if operation == nil {
		return nil
	}
	_, actualKey := accessorReceiver(operation)
	if key == "" || key != actualKey || (!ast.IsPropertyAccessExpression(operation) && !ast.IsElementAccessExpression(operation)) {
		return nil
	}
	if supplied != nil {
		return supplied
	}
	lexical := mode == accessorRead && reference != nil && reference.operation == operation && reference.matches(projection, name)
	selector := q.installedCallSelection
	selected := mode == accessorAcquire && selector != nil && selector.live && selector.issuer == q && selector.borrow == q.stagedMember && selector.source.request.producer.operation == operation && q.installedCallSelectionObservationOwned(selector.borrow, operation)
	if !lexical && !selected {
		return nil
	}
	receiver := cloneSourceRelativeEndpoint(endpoint)
	return &sourceGetInputs{operation: operation, propertyKey: key, receiver: sourceValue{constructionView: &receiver}}
}

// installedMemberReceiverOrigin is a source index anchor, not receiver DATA.
// The typed source itself remains in the application and every use retains its
// independent creation/capture/field requirements and runtime MAY alternative.
func installedMemberReceiverOrigin(receiver sourceRelativeEndpoint, generation *projectGeneration) *ast.Node {
	if receiver.expression != nil {
		return receiver.expression
	}
	if receiver.kind != relativeEndpointModuleConstruction || receiver.moduleConstruction == nil || receiver.moduleConstruction.source == nil || receiver.moduleConstruction.source.generation != generation || receiver.moduleConstruction.source.initializer == nil {
		return nil
	}
	source := receiver.moduleConstruction.source
	if !ast.IsObjectLiteralExpression(source.initializer) || source.request.producer.kind == relativeDemandEffects || source.request.producer.operation == nil {
		return nil
	}
	return source.initializer
}

// observeInstalledConstructionMember owns a separate source population result
// before the retained construction marker is joined by its DATA owner. It never
// clears that outer marker's opacity, returns a raw receiver or sets sourceOwned.
// Only a real current Get, input lease or callee selector can enroll the phase.
func (q *sourceValueQuery) observeInstalledConstructionMember(endpoint sourceRelativeEndpoint, get *sourceGetInputs, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates) (func(), bool) {
	if q == nil || q.owner == nil || result == nil || get == nil || q.protectedMember != get.operation && !q.installedConstructionImplicitGetOwned(get, mode) || q.operation != nil || !q.dependenciesOnly || endpoint.moduleConstruction == nil || len(endpoint.projection) != 0 || (mode != accessorRead && mode != accessorAcquire && mode != accessorNoGet) {
		return func() {}, false
	}
	origin := installedMemberReceiverOrigin(endpoint, q.owner.generation)
	if origin == nil || !q.installedMemberSourceOwned(origin, get.operation, q.effectOwner) {
		return func() {}, false
	}
	key := get.propertyKey
	if key == "" {
		_, key = accessorReceiver(get.operation)
	}
	if key == "" || key == "*" {
		return func() {}, false
	}
	var part accessorCandidates
	cut := &sourceMemberWriterReadCut{operation: get.operation, use: q.reading, scope: q.acquireCallableScope(bindings, &part)}
	var event *sourceInstalledMemberEvent
	revoke := func() {}
	if q.installedMemberInputOwned(q.installedMemberInput) {
		phase := installedMemberRead
		if mode == accessorAcquire {
			phase = installedMemberAcquire
		} else if mode == accessorNoGet {
			phase = installedMemberHas
		}
		var parent sourceStagedOperationRequest
		described := false
		if native := q.installedMemberNativePhase; native != nil && q.installedDescriptorMemberPhaseOwned(native.algorithm, get, cut, phase, key) {
			parent, described = native.algorithm, true
		} else {
			producer := enclosingCallableNode(get.operation)
			publisher := q.executable.pendingMemberPublishers[producer]
			if publisher == nil || !publisher.live || publisher.fact == nil || publisher.fact.node != producer {
				return func() {}, false
			}
			parent, described = stagedMemberGetSourceRequest(publisher.fact, get.operation)
		}
		if !described {
			return func() {}, false
		}
		if prior := q.installedMemberPhase; prior != nil && q.liveInstalledMemberPhase(prior, get, prior.read) && sameOperationEndpoint(prior.application.receiver, endpoint) {
			event = prior
			cut = prior.read
		} else {
			var admitted bool
			event, revoke, admitted = q.beginInstalledMemberWorkPhase(parent, get, cut, phase, key, endpoint)
			if !admitted {
				return func() {}, false
			}
		}
	} else if q.installedCallSelection == nil || !q.installedCallSelectionObservationOwned(q.stagedMember, get.operation) {
		return func() {}, false
	}
	restore := q.enterStagedMemberSource(get, cut, &part)
	accepted := false
	defer func() {
		if !accepted {
			restore()
			revoke()
		}
	}()
	field := cloneSourceRelativeEndpoint(endpoint)
	field.projection = []string{key}
	contribution, represented := constructionFieldReadContribution(q, field, get)
	if !represented {
		return func() {}, false
	}
	if event != nil {
		event.construction = &contribution
	}
	// Keep the anchor in the writer/source inventory only. The DATA owner alone
	// transports actual known field alternatives from its typed contribution.
	q.memberValuesAtGet(origin, nil, key, mode, bindings, &part, func(sourceValue) {}, sourceMemberOperationProof{}, get, cut)
	if event != nil {
		q.finishInstalledConstructionMember(event, &contribution, &part)
	}
	accepted = true
	live := true
	return func() {
		if !live {
			return
		}
		live = false
		restore()
		revoke()
		mergeAccessorCandidates(result, part)
	}, true
}

// A complete typed contribution is field-source membership, never a pure or
// ordinary object proof. Pending captures, unknown fields and any unrelated
// source/normal channels remain on their original pending paths.
func (q *sourceValueQuery) finishInstalledConstructionMember(event *sourceInstalledMemberEvent, contribution *sourceConstructionFieldReadContribution, result *accessorCandidates) bool {
	if event == nil || contribution == nil || result == nil || event.construction != contribution || contribution.pending || !contribution.runtimeMay || contribution.parent.producer != event.application.request.producer || contribution.cut != event.application.memberCut || !q.liveInstalledMemberPhase(event, event.get, event.read) {
		return false
	}
	source := cloneSourceRelativeEndpoint(contribution.source)
	source.projection = nil
	if !sameOperationEndpoint(source, event.application.receiver) {
		return false
	}
	for _, required := range contribution.required {
		if !operationContainsRequest(event.application.inputRequired, required) {
			return false
		}
	}
	event.constructionAccounted = true
	return true
}

// installedConstructionImplicitGetOwned keeps the selected native field role
// separate from lexical Read/callee references. No arbitrary Call can issue it.
func (q *sourceValueQuery) installedConstructionImplicitGetOwned(get *sourceGetInputs, mode accessorTraversal) bool {
	if q == nil || get == nil || q.installedMemberNativePhase == nil {
		return false
	}
	phase := installedMemberAcquire
	if mode == accessorNoGet {
		phase = installedMemberHas
	} else if mode != accessorAcquire {
		return false
	}
	cut := &sourceMemberWriterReadCut{operation: get.operation, use: q.reading}
	return q.installedDescriptorMemberPhaseOwned(q.installedMemberNativePhase.algorithm, get, cut, phase, get.propertyKey)
}
