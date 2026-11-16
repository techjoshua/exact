package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceOriginalGetNativeField owns one actual ToPropertyDescriptor Has or Get.
// The Call AST is shared by all fields; the full field/member requests, ordinal
// and phase are identity. Future interest cuts are zero until a real publisher
// supplies them. No query, Get pointer, acquired scope or normal frame survives.
type sourceOriginalGetNativeField struct {
	root, algorithm, field, member sourceStagedOperationRequest
	ordinal                        int
	phase                          sourceStagedFieldObservationPhase
	method                         *ast.Node
	kind                           sourceNativeKind
	generation                     *projectGeneration
	queryCut, physicalCut          sourceRelativeCut
}

func cloneOriginalGetNativeField(h *sourceOriginalGetNativeField) *sourceOriginalGetNativeField {
	if h == nil {
		return nil
	}
	out := *h
	return &out
}

func sameOriginalGetNativeField(a, b *sourceOriginalGetNativeField) bool {
	return a == b || a != nil && b != nil && a.ordinal == b.ordinal && a.phase == b.phase && a.method == b.method && a.kind == b.kind && a.generation == b.generation && a.queryCut == b.queryCut && a.physicalCut == b.physicalCut && sameOperationRequest(a.root, b.root) && sameOperationRequest(a.algorithm, b.algorithm) && sameOperationRequest(a.field, b.field) && sameOperationRequest(a.member, b.member)
}

func originalFieldMutationHeaderIdentity(a, b *sourceOriginalGetNativeField) bool {
	if a == nil || b == nil {
		return false
	}
	ac, bc := *a, *b
	ac.queryCut, ac.physicalCut, bc.queryCut, bc.physicalCut = sourceRelativeCut{}, sourceRelativeCut{}, sourceRelativeCut{}, sourceRelativeCut{}
	return sameOriginalGetNativeField(&ac, &bc)
}

func validOriginalFieldMutationHeader(h *sourceOriginalGetNativeField, future bool) bool {
	if h == nil || h.generation == nil || h.method == nil || h.kind != sourceNativeObjectDefineProperty || !standardLibrarySource(ast.GetSourceFileOfNode(h.method)) || h.ordinal < 0 || h.ordinal >= len(reflectiveDescriptorKeys) || h.phase != stagedFieldObservationHas && h.phase != stagedFieldObservationGet {
		return false
	}
	call := h.root.producer.operation
	if call == nil || !ast.IsCallExpression(call) || h.root.producer.declaration == nil || h.root.producer.kind != relativeDemandEffects || h.root.producer.selector != (sourceStagedOperationSelector{}) || h.root.consumer != h.root.producer.declaration || h.root.inputs != nil || h.root.use != call || h.root.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 3 || !ast.IsStringLiteralLike(actuals[1]) || !ast.IsObjectLiteralExpression(actuals[2]) {
		return false
	}
	field := h.root
	field.producer.selector = sourceStagedOperationSelector{occurrence: actuals[2], field: reflectiveDescriptorKeys[h.ordinal]}
	member, valid := stagedFieldMemberRequest(field, h.phase)
	if !valid || !sameOperationRequest(field, h.field) || !sameOperationRequest(member, h.member) || !sameOperationRequest(h.algorithm, nativeRootDebtRequest(&sourceStagedNativeGetSource{request: h.root, get: call.Expression()}, "algorithm")) {
		return false
	}
	if future {
		return h.queryCut == (sourceRelativeCut{}) && h.physicalCut == (sourceRelativeCut{})
	}
	q, p := h.queryCut, h.physicalCut
	if q.operation != call || p.operation != call || q.reading != p.reading || q.initializing != p.initializing || q.returning != p.returning || q.invoking != p.invoking {
		return false
	}
	return q.use == p.use || q.use == nil && p.use == call && ast.IsFunctionLike(h.field.consumer)
}

func validOriginalFieldMutationSource(s *sourceOriginalGetMutationSource) bool {
	if s == nil || !validOriginalFieldMutationHeader(s.nativeField, false) || s.record != nil || s.nativeCallee != nil || s.nativeTarget != nil || s.ownMember != nil || s.standard != nil || s.kind != 0 || s.slot != 0 || s.intrinsicPrototype || s.receiverKind != 0 {
		return false
	}
	h := s.nativeField
	mode := accessorAcquire
	if h.phase == stagedFieldObservationHas {
		mode = accessorNoGet
	}
	return s.generation == h.generation && s.operation == h.field.producer.operation && sameOperationRequest(s.request, h.member) && s.origin == h.field.producer.selector.occurrence && s.property == h.field.producer.selector.field && s.mode == mode && s.queryCut == h.queryCut && sameOperationRequest(s.coverage, stagedMemberCoverageRequest(h.member, s.origin, s.queryCut))
}

func (work *callableEffectWork) originalFieldMutationHeaderCurrent(h *sourceOriginalGetNativeField, future bool) bool {
	if !validOriginalFieldMutationHeader(h, future) || h.generation != work.operationGeneration || !h.generation.active {
		return false
	}
	id, adopted := work.operationIDs[h.algorithm.producer]
	field, registered := work.operationRecipes[h.field.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !registered || !validNativeGetRequest(field, h.field) || field.nativeGet == nil {
		return false
	}
	e := work.operations[id.index].installationMutations
	if e == nil || !work.nativeInstallationMutationCurrent(&e.source) || !sameOperationRequest(e.source.request, h.root) || e.source.kind != h.kind || e.source.method != h.method {
		return false
	}
	for _, component := range e.components {
		if component.ordinal == h.ordinal && component.phase == h.phase && sameOperationRequest(component.field, h.field) && sameOperationRequest(component.member, h.member) {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) originalFieldMutationCurrent(s *sourceOriginalGetMutationSource) bool {
	if !validOriginalFieldMutationSource(s) || !work.originalFieldMutationHeaderCurrent(s.nativeField, false) {
		return false
	}
	coverage := work.operationRecipes[s.coverage.producer]
	if !validStagedMemberCoverageRecipe(coverage) || coverage.memberSource.generation != s.generation || !sameOperationRequest(coverage.memberSource.request, s.coverage) {
		return false
	}
	c := coverage.memberSource.coverage
	return sameOperationRequest(coverage.memberSource.parent, s.request) && c.origin == s.origin && c.cut == s.queryCut && sameOriginalGetMutationCoveragePartition(s, c)
}

func validOriginalFieldMutationInterest(i *sourceOriginalGetMutationInterest) bool {
	return i != nil && validOriginalFieldMutationHeader(i.nativeField, true) && i.nativeCallee == nil && i.descriptor == nil && i.nativeRoot.producer.operation == nil && i.method == nil && i.nativeKind == 0 && i.receiver == nil && i.reading.producer.operation == nil && i.queryCut == (sourceRelativeCut{}) && i.physicalCut == (sourceRelativeCut{}) && i.operation == i.nativeField.field.producer.operation && i.generation == i.nativeField.generation && sameOperationRequest(i.origin, i.nativeField.field) && sameOperationRequest(i.parent, i.nativeField.member)
}

func (work *callableEffectWork) originalFieldMutationInterestCurrent(i *sourceOriginalGetMutationInterest) bool {
	return validOriginalFieldMutationInterest(i) && work.originalFieldMutationHeaderCurrent(i.nativeField, true)
}

func originalFieldMutationInterestMatches(i *sourceOriginalGetMutationInterest, s *sourceOriginalGetMutationSource) bool {
	return validOriginalFieldMutationInterest(i) && validOriginalFieldMutationSource(s) && i.generation == s.generation && originalFieldMutationHeaderIdentity(i.nativeField, s.nativeField)
}

func (work *callableEffectWork) liveOriginalFieldMutationInterestBinding(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, cut *sourceMemberWriterReadCut, i *sourceOriginalGetMutationInterest, s *sourceOriginalGetMutationSource) bool {
	if !originalFieldMutationInterestMatches(i, s) || !work.originalFieldMutationInterestCurrent(i) || q == nil || q.owner == nil || q.executable == nil || q.executable.values == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || !q.liveStagedFieldMemberSource(get) || !q.liveStagedMemberSource(q.stagedMember, get, cut) {
		return false
	}
	h := s.nativeField
	b := get.stagedEffects
	actor, known := work.memberNodes[h.field.consumer]
	publisher := q.executable.pendingMemberPublishers[h.field.consumer]
	return known && actor >= 0 && actor < len(facts) && publisher != nil && publisher.live && publisher.fact == &facts[actor] && q.owner.generation == h.generation && q.owner.program == q.executable.values.program && q.owner.checker == q.executable.checker && b.observation != nil && b.observation.phase == h.phase && get.hasOnly == (h.phase == stagedFieldObservationHas) && sameOperationRequest(b.request, h.field) && sameOperationRequest(q.stagedMember.request, h.member) && q.relativeInputCut(get.operation) == h.queryCut && cut.operation == h.physicalCut.operation && cut.use == h.physicalCut.use && get.receiver.node == h.field.producer.selector.occurrence
}

// The original field publication owns this event. Effects accounting and Has
// presence are not output certificates: the exact coverage/population and each
// subsequent DATA/BODY source remain independently required.
func (work *callableEffectWork) publishOriginalNativeFieldMutationSource(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, cut *sourceMemberWriterReadCut, publication sourceStagedMemberPublication) bool {
	if publication == stagedMemberSourceRequest || q == nil || q.owner == nil || q.executable == nil || q.executable.values == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || !q.liveStagedFieldMemberSource(get) || !q.liveStagedMemberSource(q.stagedMember, get, cut) || get.stagedEffects.observation == nil {
		return false
	}
	b, member := get.stagedEffects, q.stagedMember
	field := b.request
	n := work.operationRecipes[field.producer].nativeGet
	header, issued := work.nativeInstallationMutationSourceFor(n)
	if !issued || b.generation != header.generation || q.owner.generation != header.generation || b.observation.phase != stagedFieldObservationHas && b.observation.phase != stagedFieldObservationGet || get.hasOnly != (b.observation.phase == stagedFieldObservationHas) || member.coverage == nil {
		return false
	}
	phase := b.observation.phase
	phaseMember, valid := stagedFieldMemberRequest(field, phase)
	ordinal := stagedDescriptorFieldIndex(field.producer.selector.field)
	if !valid || ordinal < 0 || !sameOperationRequest(phaseMember, member.request) || field.producer.selector.occurrence != header.installation.descriptor.expression || !sameOperationRequest(n.request, header.request) {
		return false
	}
	queryCut := q.relativeInputCut(get.operation)
	physicalCut := queryCut
	physicalCut.operation, physicalCut.use = cut.operation, cut.use
	h := &sourceOriginalGetNativeField{root: header.request, algorithm: header.algorithm, field: field, member: phaseMember, ordinal: ordinal, phase: phase, method: header.method, kind: header.kind, generation: header.generation, queryCut: queryCut, physicalCut: physicalCut}
	mode := accessorAcquire
	if phase == stagedFieldObservationHas {
		mode = accessorNoGet
	}
	if member.mode != mode {
		return false
	}
	// The actual publisher may have retained an earlier required prefix. The
	// canonical coverage, not this query-local proposal, owns that cumulative set.
	canonical := work.operationRecipes[member.coverage.request.producer]
	if !validStagedMemberCoverageRecipe(canonical) || canonical.memberSource.generation != header.generation || !sameOperationRequest(canonical.memberSource.parent, phaseMember) || canonical.memberSource.coverage.origin != get.receiver.node || canonical.memberSource.coverage.cut != queryCut {
		return false
	}
	coverage := canonical.memberSource.coverage
	s := &sourceOriginalGetMutationSource{nativeField: h, request: phaseMember, operation: get.operation, coverage: coverage.request, queryCut: queryCut, origin: get.receiver.node, property: get.propertyKey, mode: mode, generation: header.generation, population: originalGetMutationCoveragePopulation(coverage), upstreamBodies: cloneStagedMemberFieldBodies(coverage.fieldBodies), pending: publication != stagedMemberFinalObservation || !member.indexed || !member.represented || !originalGetMutationCoveragePartitionComplete(coverage)}
	if !validOriginalFieldMutationSource(s) || !work.registerOriginalGetMutationSource(facts, s) {
		return false
	}
	work.bindOriginalGetMutationInterests(facts, q, get, cut, s)
	id := work.operationIDs[header.algorithm.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	e := work.operations[id.index].installationMutations
	if e == nil || len(e.components) != 2*len(reflectiveDescriptorKeys) || !sameNativeInstallationMutationSource(&e.source, header) {
		return false
	}
	for index := range e.components {
		component := &e.components[index]
		if component.ordinal != ordinal || component.phase != phase {
			continue
		}
		if component.source != nil && !originalGetMutationRefinementAllowed(component.source, s) {
			return false
		}
		component.source = cloneOriginalGetMutationSource(s)
		component.enumerated = publication == stagedMemberFinalObservation
		if phase == stagedFieldObservationHas {
			component.absent = b.observation.hasSeen && b.observation.presence == propertyAbsent && b.observation.effects.has == sourceEffectsAccounted
		}
	}
	e.sealed = nativeInstallationMutationEnumerationComplete(e)
	work.publishDeclaredNativeMutationData(facts, id)
	return true
}

// A real own-data terminal is a local noninvoking Get arm. It is not the whole
// population and does not suppress authored writers, getters or unknown sources.
func (work *callableEffectWork) captureNativeInstallationOwnFieldSource(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, s *sourceOriginalGetMutationSource) bool {
	if q == nil || q.owner == nil || !q.liveStagedFieldGet(get) || get.hasOnly || !validOriginalOwnGetMutationSource(s) || get.stagedEffects.observation == nil || get.stagedEffects.observation.phase != stagedFieldObservationGet || !sameOperationRequest(get.stagedEffects.request, s.request) || get.operation != s.operation || q.relativeInputCut(get.operation) != s.queryCut {
		return false
	}
	n := work.operationRecipes[s.request.producer].nativeGet
	header, issued := work.nativeInstallationMutationSourceFor(n)
	if !issued || header.generation != s.generation || header.installation.descriptor.expression != s.origin {
		return false
	}
	registered := work.operationRecipes[originalGetMutationRequest(s).producer]
	if !work.originalGetMutationCurrent(registered) || !sameOriginalGetMutationIdentity(registered.memberSource.originalGetMutation, s) {
		return false
	}
	id := work.operationIDs[header.algorithm.producer]
	e := work.operations[id.index].installationMutations
	for index := range e.components {
		component := &e.components[index]
		if component.phase != stagedFieldObservationGet || !sameOperationRequest(component.field, s.request) {
			continue
		}
		if component.ownSource != nil && !originalGetMutationRefinementAllowed(component.ownSource, s) {
			return false
		}
		component.ownSource = cloneOriginalGetMutationSource(registered.memberSource.originalGetMutation)
		work.publishDeclaredNativeMutationData(facts, id)
		return true
	}
	return false
}

// The actual Has owner joins presence/accounting before invoking this callback.
// The separate phase SOURCE is still required; neither an Effects flag nor an
// empty Get population can manufacture the bypassed-Get branch.
func (work *callableEffectWork) captureNativeInstallationFieldHas(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, observation *sourceStagedFieldObservation) bool {
	if q == nil || q.owner == nil || !q.liveStagedFieldGet(get) || !get.hasOnly || observation == nil || get.stagedEffects.observation != observation || observation.phase != stagedFieldObservationHas || !observation.hasSeen || q.owner.generation != work.operationGeneration {
		return false
	}
	field := get.stagedEffects.request
	header, issued := work.nativeInstallationMutationSourceFor(work.operationRecipes[field.producer].nativeGet)
	if !issued || header.installation.descriptor.expression != get.receiver.node || get.stagedEffects.generation != header.generation || q.relativeInputCut(get.operation) != get.stagedEffects.cut {
		return false
	}
	id := work.operationIDs[header.algorithm.producer]
	e := work.operations[id.index].installationMutations
	for index := range e.components {
		component := &e.components[index]
		if component.phase != stagedFieldObservationHas || !sameOperationRequest(component.field, field) {
			continue
		}
		component.absent = observation.presence == propertyAbsent && observation.effects.has == sourceEffectsAccounted
		e.sealed = nativeInstallationMutationEnumerationComplete(e)
		work.publishDeclaredNativeMutationData(facts, id)
		return true
	}
	return false
}

func nativeInstallationMutationEnumerationComplete(e *sourceNativeInstallationMutationEnumeration) bool {
	if e == nil || len(e.components) != 2*len(reflectiveDescriptorKeys) {
		return false
	}
	for ordinal := range reflectiveDescriptorKeys {
		has, acquire := e.components[2*ordinal], e.components[2*ordinal+1]
		if !has.enumerated || has.source == nil || has.source.pending || !has.absent && (!acquire.enumerated || acquire.source == nil || acquire.source.pending) {
			return false
		}
	}
	return true
}
