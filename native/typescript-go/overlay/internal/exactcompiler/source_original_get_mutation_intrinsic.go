package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceOriginalIntrinsicFieldMutation names the conditional ordinary local Get
// arm. OrdinaryGetOwnProperty/GetPrototypeOf metadata reads and terminal returns
// themselves do not write; accessor Calls and prototype/exotic delegation remain
// independent output obligations. This is a new output purpose, not an Effects
// receipt or an assertion that this conditional arm was selected at runtime.
// https://tc39.es/ecma262/#sec-ordinaryget
// Graph-local component capture authenticates the original event. Cloning these
// descriptions cannot copy that capture or its current/APPLIED observations.
type sourceOriginalIntrinsicFieldMutation struct {
	header       *sourceOriginalGetNativeField
	installation *sourceNativeInstallationMutationSource
	standard     sourceDemandStandardPremises
	phaseSource  sourceStagedOperationRequest
}

func cloneOriginalIntrinsicFieldMutation(p *sourceOriginalIntrinsicFieldMutation) *sourceOriginalIntrinsicFieldMutation {
	if p == nil {
		return nil
	}
	out := *p
	out.header = cloneOriginalGetNativeField(p.header)
	out.installation = cloneNativeInstallationMutationSource(p.installation)
	return &out
}
func sameOriginalIntrinsicFieldMutation(a, b *sourceOriginalIntrinsicFieldMutation) bool {
	return a == b || a != nil && b != nil && sameOriginalGetNativeField(a.header, b.header) && sameNativeInstallationMutationSource(a.installation, b.installation) && a.standard == b.standard && sameOperationRequest(a.phaseSource, b.phaseSource)
}
func validOriginalIntrinsicFieldMutationSource(s *sourceOriginalGetMutationSource) bool {
	if s == nil {
		return false
	}
	p := s.intrinsicField
	if p == nil || !validOriginalFieldMutationHeader(p.header, false) || p.header.phase != stagedFieldObservationGet || !validNativeInstallationMutationSource(p.installation) || p.header.generation != s.generation || p.installation.generation != s.generation || !sameOperationRequest(p.header.root, p.installation.request) || !sameOperationRequest(p.header.algorithm, p.installation.algorithm) || p.header.method != p.installation.method || p.header.kind != p.installation.kind {
		return false
	}
	h := p.header
	if s.nativeField != nil || s.nativeCallee != nil || s.nativeTarget != nil || s.record != nil || s.ownMember != nil || s.standard != nil || s.kind != 0 || s.slot != 0 || s.intrinsicPrototype || s.receiverKind != 0 || s.mode != accessorAcquire || s.pending || len(s.population)+len(s.providers)+len(s.upstreamBodies) != 0 || s.operation != h.field.producer.operation || !sameOperationRequest(s.request, h.member) || s.queryCut != h.queryCut || s.origin != h.field.producer.selector.occurrence || s.origin != p.installation.installation.descriptor.expression || s.property != h.field.producer.selector.field || !sameOperationRequest(s.coverage, stagedMemberCoverageRequest(h.member, s.origin, s.queryCut)) {
		return false
	}
	if p.standard.member != h.method || p.standard.root == nil || p.standard.prototype == nil || !standardLibrarySource(ast.GetSourceFileOfNode(p.standard.root)) || !standardLibrarySource(ast.GetSourceFileOfNode(p.standard.prototype)) || !stagedOrdinaryLiteralPrototype(s.origin, p.standard) {
		return false
	}
	// Reconstruct only the existing phase SOURCE key equation, never a Get or
	// observation. The original publisher must supply its actual current source.
	phase := &sourceOriginalGetMutationSource{nativeField: h, request: h.member, operation: s.operation, origin: s.origin, property: s.property, mode: accessorAcquire}
	return sameOperationRequest(p.phaseSource, originalGetMutationRequest(phase))
}
func originalIntrinsicFieldMutationRequirements(s *sourceOriginalGetMutationSource) []sourceStagedOperationRequest {
	p := s.intrinsicField
	required := nativeInstallationMutationRequirements(p.installation)
	return appendEntryLawRequirement(required, p.phaseSource)
}
func (work *callableEffectWork) originalIntrinsicFieldMutationCurrent(s *sourceOriginalGetMutationSource) bool {
	if !validOriginalIntrinsicFieldMutationSource(s) || s.generation != work.operationGeneration || !work.originalFieldMutationHeaderCurrent(s.intrinsicField.header, false) || !work.nativeInstallationMutationCurrent(s.intrinsicField.installation) {
		return false
	}
	p := s.intrinsicField
	field := work.operationRecipes[p.header.field.producer].nativeGet
	if field == nil || field.standard != p.standard || !stagedLiteralStandardPrototype(field, s.origin) {
		return false
	}
	id := work.operationIDs[p.header.algorithm.producer]
	e := work.operations[id.index].installationMutations
	for _, c := range e.components {
		if c.phase == stagedFieldObservationGet && c.ordinal == p.header.ordinal && c.source != nil && c.intrinsicSource != nil && sameOriginalGetNativeField(c.source.nativeField, p.header) && sameOriginalGetMutationSource(c.intrinsicSource, s) && sameOperationRequest(c.source.coverage, s.coverage) && sameOperationRequest(originalGetMutationRequest(c.source), p.phaseSource) && work.originalFieldMutationCurrent(c.source) {
			return true
		}
	}
	return false
}

// The actual branch supplies this description while its independent event is
// live. The previous member traversal may have unwound; its physical cut is
// explicitly carried by the original caller instead of reconstructed from use.
func (work *callableEffectWork) publishOriginalIntrinsicFieldMutationSource(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, physical *sourceMemberWriterReadCut) bool {
	if q == nil || q.owner == nil || q.executable == nil || !q.liveStagedFieldGet(get) || get.hasOnly || physical == nil || physical.operation != get.operation || physical.use != q.reading || !q.traceModeKnown || q.traceMode != accessorAcquire {
		return false
	}
	b := get.stagedEffects
	event := b.intrinsicPublication
	if event == nil || event.issuer != q || event.get != get || event.physical != physical || b.observation == nil || b.observation.phase != stagedFieldObservationGet || b.generation != work.operationGeneration {
		return false
	}
	n := work.operationRecipes[b.request.producer].nativeGet
	installation, issued := work.nativeInstallationMutationSourceFor(n)
	if !issued || n == nil || installation.installation.descriptor.expression != get.receiver.node || !stagedLiteralStandardPrototype(n, get.receiver.node) {
		return false
	}
	member, valid := stagedFieldMemberRequest(b.request, stagedFieldObservationGet)
	if !valid {
		return false
	}
	actor, known := work.memberNodes[b.request.consumer]
	publisher := q.executable.pendingMemberPublishers[b.request.consumer]
	if !known || actor < 0 || actor >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[actor] || q.owner.generation != installation.generation {
		return false
	}
	queryCut := q.relativeInputCut(get.operation)
	physicalCut := queryCut
	physicalCut.operation, physicalCut.use = physical.operation, physical.use
	h := &sourceOriginalGetNativeField{root: installation.request, algorithm: installation.algorithm, field: b.request, member: member, ordinal: stagedDescriptorFieldIndex(b.field), phase: stagedFieldObservationGet, method: installation.method, kind: installation.kind, generation: installation.generation, queryCut: queryCut, physicalCut: physicalCut}
	id := work.operationIDs[installation.algorithm.producer]
	e := work.operations[id.index].installationMutations
	for index := range e.components {
		c := &e.components[index]
		if c.phase != stagedFieldObservationGet || c.ordinal != h.ordinal || c.source == nil || !sameOriginalGetNativeField(c.source.nativeField, h) || !work.originalFieldMutationCurrent(c.source) {
			continue
		}
		s := &sourceOriginalGetMutationSource{intrinsicField: &sourceOriginalIntrinsicFieldMutation{header: h, installation: installation, standard: n.standard, phaseSource: originalGetMutationRequest(c.source)}, request: member, operation: get.operation, coverage: c.source.coverage, queryCut: queryCut, origin: get.receiver.node, property: get.propertyKey, mode: accessorAcquire, generation: installation.generation}
		if !validOriginalGetMutationSource(s) || c.intrinsicSource != nil && !sameOriginalGetMutationSource(c.intrinsicSource, s) || !work.registerOriginalGetMutationSource(facts, s) {
			return false
		}
		// Capture belongs to this work's actual original event, never a cloned recipe.
		c = &work.operations[id.index].installationMutations.components[index]
		c.intrinsicSource = cloneOriginalGetMutationSource(s)
		request := originalGetMutationRequest(s)
		if sourceID, adopted := work.operationIDs[request.producer]; adopted && sourceID.epoch == work.operationEpoch && sourceID.index != 0 && int(sourceID.index) < len(work.operations) {
			work.attachSourceObservationDependencies(facts, sourceID)
			if work.originalGetMutationCurrent(work.operationRecipes[request.producer]) {
				work.publishMemberSourceContributions(sourceID)
			}
		}
		work.publishDeclaredNativeMutationData(facts, id)
		return true
	}
	return false
}
