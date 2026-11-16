package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceDescriptorSourceEnumeration is a live original-P producer interval.
// It lends conditional SOURCE enumeration, never ordinary output transfer,
// completion, normal values or an observation recovered from cached DATA.
type sourceDescriptorSourceEnumeration struct {
	self          *sourceDescriptorSourceEnumeration
	work          *callableEffectWork
	issuer        *sourceValueQuery
	borrower      *sourceStagedMemberBorrow
	owner         *executableBodyOwner
	queryOwner    *sourceValueOwner
	id            sourceStagedOperationID
	parent        sourceStagedOperationRequest
	cut, queryCut sourceRelativeCut
	binding       *ast.Node
}

// descriptorEnumerationPayload checks local registered delivery only. The
// original Call and every discovered source/BODY requirement remain on D's
// dependency graph; this helper must never enter the closure solver. Only
// direct native payloads with no returned-input application enter currentness;
// the ordinary authored-return projection path can acquire inputs and is not
// this producer's enumeration domain.
func (work *callableEffectWork) descriptorEnumerationPayload(recipe sourceStagedOperationRecipe, reading, parent sourceStagedOperationRequest, cut sourceRelativeCut) ([]sourceNativeDescriptorView, bool) {
	registered, present := work.operationRecipes[recipe.key]
	if !present || reading.producer != recipe.key || registered.callResult == nil || registered.callResult.nativeDescriptor == nil || !sameStagedCallResultSource(registered.callResult, recipe.callResult) || !validNativeDescriptorResultRecipe(registered) || !registered.delta.extracted || registered.callResult.generation != work.operationGeneration || !work.stagedMemberResultReading(reading, parent, cut) {
		return nil, false
	}
	operation := parent.producer.operation
	if !ast.IsPropertyAccessExpression(operation) || operation.Name() == nil || operation.Name().Text() != "value" || operation.Expression() != recipe.key.operation {
		return nil, false
	}
	id, adopted := work.operationIDs[recipe.key]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil, false
	}
	state := &work.operations[id.index]
	if state.invalid || !state.dependenciesRegistered || !state.delta.extracted || state.revision == 0 {
		return nil, false
	}
	data, applied := work.stagedCallResultData(reading)
	if !applied || !data.delta.extracted || len(data.delta.exposures) == 0 {
		return nil, false
	}
	var views []sourceNativeDescriptorView
	represented := true
	for _, alternative := range data.delta.exposures {
		view := alternative.endpoint.descriptorView
		if alternative.creating != nil || alternative.endpoint.kind != relativeEndpointDescriptorView || view == nil || view.inputs[0].application != nil || view.inputs[1].application != nil || !descriptorViewDataEqual(registered.delta.exposures[0].endpoint.descriptorView, view) || !work.descriptorViewSourceCurrent(view) {
			represented = false
			continue
		}
		copy := projectNativeDescriptorView(*view, nil)
		copy.delivery = reading
		views = append(views, copy)
	}
	return views, represented && len(views) != 0
}

// beginDescriptorSourceEnumeration belongs to the already-running original Get
// resumer. Its query owns fresh value state; executable values are templates,
// not that query owner. The preparation visitor cannot issue this interval or a Get.
func (work *callableEffectWork) beginDescriptorSourceEnumeration(facts []callableFacts, q *sourceValueQuery, id sourceStagedOperationID, owner *executableBodyOwner) (func(), bool) {
	resume := work.frameworkGetResumptionSource(id)
	if resume == nil || q == nil || owner == nil || owner.values == nil || owner.project == nil || q.executable != owner || q.owner == nil || q.owner.program != owner.project.program || q.owner.checker != owner.checker || q.owner.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || !work.operations[id.index].writerSourceRunning || q.inputs != nil || q.operation != nil || q.returnObservation != nil || !q.dependenciesOnly {
		return func() {}, false
	}
	state := &work.operations[id.index]
	if state.invalid || !state.dependenciesRegistered || work.operationIDs[state.key] != id {
		return func() {}, false
	}
	b := q.stagedMember
	if b == nil || b.issuer != q || b.owner != q.owner || b.generation != work.operationGeneration || b.descriptorEnumeration != nil || !sameOperationRequest(b.request, resume.parent) || q.reading != resume.parent.producer.operation || q.effectOwner != resume.parent.consumer || !memberReceiverCutsCorrespond(resume.parent, q.relativeInputCut(resume.parent.producer.operation), resume.cut) {
		return func() {}, false
	}
	caller, owned := work.memberNodes[resume.parent.consumer]
	if !owned || caller < 0 || caller >= len(facts) || len(facts) != len(work.operationFacts) || &facts[caller] != &work.operationFacts[caller] || facts[caller].normalInputs != nil || facts[caller].sourceFile == nil || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return func() {}, false
	}
	publisher := owner.pendingMemberPublishers[resume.parent.consumer]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || len(resume.readings) == 0 {
		return func() {}, false
	}
	for _, reading := range resume.readings {
		if _, represented := work.descriptorEnumerationPayload(work.operationRecipes[reading.producer], reading, resume.parent, resume.cut); !represented {
			return func() {}, false
		}
	}
	e := &sourceDescriptorSourceEnumeration{work: work, issuer: q, borrower: b, owner: owner, queryOwner: q.owner, id: id, parent: resume.parent, cut: resume.cut, queryCut: q.relativeInputCut(resume.parent.producer.operation), binding: q.normalBindingCall}
	e.self = e
	b.descriptorEnumeration = e
	return func() {
		if b.descriptorEnumeration == e {
			b.descriptorEnumeration = nil
		}
		*e = sourceDescriptorSourceEnumeration{}
	}, true
}

// descriptorSourceEnumerationOwned checks the same live original producer and
// both cut domains without treating a payload or copied query as an issuer.
func (work *callableEffectWork) descriptorSourceEnumerationOwned(q *sourceValueQuery, parent sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	if q == nil || q.stagedMember == nil {
		return false
	}
	b := q.stagedMember
	e := b.descriptorEnumeration
	if e == nil || e.self != e || e.work != work || e.issuer != q || e.borrower != b || e.owner != q.executable || q.owner == nil || e.owner == nil || q.owner != e.queryOwner || b.issuer != q || b.owner != q.owner || b.generation != work.operationGeneration || q.owner.generation != work.operationGeneration || !sameOperationRequest(e.parent, parent) || !sameOperationRequest(b.request, parent) || e.cut != cut || q.normalBindingCall != e.binding || q.inputs != nil || q.operation != nil || q.returnObservation != nil || !q.dependenciesOnly || q.effectOwner != parent.consumer || q.relativeInputCut(parent.producer.operation) != e.queryCut || !memberReceiverCutsCorrespond(parent, e.queryCut, cut) {
		return false
	}
	resume := work.frameworkGetResumptionSource(e.id)
	if resume == nil || !sameOperationRequest(resume.parent, parent) || resume.cut != cut || !work.operations[e.id.index].writerSourceRunning || e.owner.project == nil || e.owner.project.activeGeneration != work.operationGeneration || q.owner.program != e.owner.project.program || q.owner.checker != e.owner.checker {
		return false
	}
	state := &work.operations[e.id.index]
	if state.invalid || !state.dependenciesRegistered || work.operationIDs[state.key] != e.id {
		return false
	}
	publisher := e.owner.pendingMemberPublishers[parent.consumer]
	caller, known := work.memberNodes[parent.consumer]
	return known && caller >= 0 && caller < len(work.operationFacts) && publisher != nil && publisher.live && publisher.fact == &work.operationFacts[caller]
}

// descriptorSourceViewsAtEnumerationReading additionally requires the actual
// lexical preparation/read or the actual Get borrow. A copied query, reference,
// reader, physical cut or expired producer interval supplies no permission.
func (work *callableEffectWork) descriptorSourceViewsAtEnumerationReading(q *sourceValueQuery, recipe sourceStagedOperationRecipe, reading, parent sourceStagedOperationRequest, cut sourceRelativeCut) ([]sourceNativeDescriptorView, bool) {
	if !work.descriptorSourceEnumerationOwned(q, parent, cut) {
		return nil, false
	}
	if p := q.memberReceiverPreparation; p != nil {
		if recipe.callResult == nil || !q.liveStagedMemberReceiverPreparation(recipe.key.operation) || !sameOperationRequest(p.parent, parent) || p.cut != cut || p.reference == nil || p.reference.operation != parent.producer.operation || p.read == nil || p.read.operation != parent.producer.operation || p.read.use != q.reading {
			return nil, false
		}
	} else {
		b := q.stagedMember
		if !q.liveStagedMemberSource(b, b.get, b.read) || b.get.operation != parent.producer.operation || !memberReceiverCutsCorrespond(parent, b.observation, cut) {
			return nil, false
		}
	}
	return work.descriptorEnumerationPayload(recipe, reading, parent, cut)
}

// The owning typed transfer chooses an explicit live producer domain. Ordinary
// current/closed APIs remain unchanged and cannot be opted out of by a boolean.
func (work *callableEffectWork) descriptorViewsForSourceReading(q *sourceValueQuery, recipe sourceStagedOperationRecipe, reading, parent sourceStagedOperationRequest, cut sourceRelativeCut) ([]sourceNativeDescriptorView, bool) {
	if q != nil && q.stagedMember != nil && q.stagedMember.descriptorEnumeration != nil {
		return work.descriptorSourceViewsAtEnumerationReading(q, recipe, reading, parent, cut)
	}
	return work.currentDeliveredDescriptorViewsAtReading(recipe, reading, parent, cut)
}

// descriptorViewsForSourceGet preserves the ordinary live-Get transfer unless
// this exact query already owns the running producer's enumeration interval.
func (work *callableEffectWork) descriptorViewsForSourceGet(facts []callableFacts, q *sourceValueQuery, recipe sourceStagedOperationRecipe) ([]sourceNativeDescriptorView, sourceStagedOperationRequest) {
	if q == nil {
		return nil, sourceStagedOperationRequest{}
	}
	if q.stagedMember == nil || q.stagedMember.descriptorEnumeration == nil {
		return work.currentDeliveredDescriptorViews(facts, q, recipe)
	}
	b := q.stagedMember
	if !q.liveStagedMemberSource(b, b.get, b.read) || recipe.callResult == nil {
		return nil, sourceStagedOperationRequest{}
	}
	for i, reading := range recipe.callResult.readings {
		if i >= len(recipe.callResult.readCuts) || reading.consumer != b.request.consumer {
			continue
		}
		cut := recipe.callResult.readCuts[i]
		if cut != b.descriptorEnumeration.cut {
			continue // Other registered readers are not source alternatives of this Get.
		}
		views, represented := work.descriptorSourceViewsAtEnumerationReading(q, recipe, reading, b.request, cut)
		if !represented {
			b.represented = false
		}
		if len(views) != 0 {
			return views, reading
		}
	}
	return nil, sourceStagedOperationRequest{}
}
