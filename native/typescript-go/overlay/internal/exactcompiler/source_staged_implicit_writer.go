package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// implicitNativeSource keeps the canonical producer and algorithm factories
// separate; optional phase snapshots never normalize one another's counts.
func (work *callableEffectWork) implicitNativeSource(request sourceStagedOperationRequest) *sourceStagedNativeGetSource {
	root := work.operationRecipes[request.producer]
	s := root.nativeGet
	if s == nil || !validNativeGetRequest(root, request) || !sameOperationRequest(s.request, request) {
		return nil
	}
	required := nativeRootDebtRequest(s, "algorithm")
	algorithm := work.operationRecipes[required.producer]
	a := algorithm.nativeGet
	if a == nil || !validNativeGetRequest(algorithm, required) || !sameOperationRequest(a.request, request) || a.get != s.get || a.method != s.method || a.kind != s.kind {
		return nil
	}
	return a
}
func validImplicitWriterCapabilityRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	if s == nil || s.nativeWriter == nil || s.generation == nil || s.candidate.operation == nil || !ast.IsCallExpression(s.candidate.operation) || s.candidate.runtimeUnknown || !s.candidate.reflective || s.candidate.protocol || !s.candidate.prior || s.candidate.region == nil || !ast.IsFunctionLike(s.candidate.region) || s.candidate.region != s.parent.consumer || enclosingCallableNode(s.candidate.operation) != s.parent.consumer || s.coverage != nil || s.call != nil || s.getEffects != nil || s.protocolSource != nil || s.globalWrite != nil || s.targetSource != nil || s.hasFreshTarget != nil || s.moduleExcluded != nil || s.writeEffects || len(s.values) != 0 || len(recipe.writerRequired) != 0 || recipe.delta.extracted || len(recipe.delta.effects)+len(recipe.delta.residuals)+len(recipe.delta.relative)+len(recipe.delta.invoked)+len(recipe.delta.exposures) != 0 {
		return false
	}
	p := s.nativeWriter
	if p.provenance != nativeWriterEmptyImplicitSources || p.law.producer.operation != nil || p.source.consumer != s.parent.consumer || p.source.consumer != p.source.producer.declaration || p.source.producer.selector != (sourceStagedOperationSelector{}) || p.source.use != s.candidate.operation || p.source.producer.operation != s.candidate.operation || s.parent.inputs != nil || s.parent.consumer != s.parent.producer.declaration || s.parent.producer.kind != relativeDemandEffects || !sameOperationRequest(s.candidate.request, s.parent) || !validStagedMemberObservation(s.parent, s.candidate.cut) || !sourceStagedOccurrenceOwned(s.parent.producer.operation, s.parent.consumer) {
		return false
	}
	if recipe.nativeGet != nil || recipe.callResult != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.hasInstance != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || len(recipe.constructedGroup)+len(recipe.constructedInputs)+len(recipe.fieldForwards) != 0 {
		return false
	}
	if s.extraction != nil && (s.extraction.generation != s.generation || !sameOperationRequest(s.extraction.request, s.parent) || s.extraction.cut != s.candidate.cut || s.extraction.delta.extracted) {
		return false
	}
	base := sourceStagedNativeGetSource{request: p.source, get: s.candidate.operation.Expression()}
	return recipe.key == s.request.producer && sameOperationRequest(s.request, stagedMemberCandidateRequest(s.parent, s.candidate)) && sameOperationRequest(p.accounting, nativeRootDebtRequest(&base, "algorithm")) && sameOperationRequest(p.coverage, stagedMemberCoverageRequest(s.parent, s.candidate.origin, s.candidate.cut)) && operationContainsRequest(recipe.delta.required, p.source) && operationContainsRequest(recipe.delta.required, p.accounting)
}
func nativeWriterEventRegionOwned(event *sourceStagedNativeWriterEvent, s *sourceStagedMemberSource) bool {
	if event.provenance == nativeWriterEmptyImplicitSources {
		return s.candidate.region == event.source.request.consumer && s.parent.consumer == event.source.request.consumer
	}
	return s.candidate.region == nil
}

// recordImplicitWriterDisjoint is the SAME outer all-row semantic event. It
// describes a conditional relevance result, never input/protocol currency.
func (work *callableEffectWork) recordImplicitWriterDisjoint(facts []callableFacts, q *sourceValueQuery, call *ast.Node) bool {
	if q == nil || q.stagedMember == nil || !q.liveStagedMemberSource(q.stagedMember, q.stagedMember.get, q.stagedMember.read) {
		return false
	}
	owner := enclosingCallableNode(call)
	if owner == nil || !ast.IsFunctionLike(owner) || q.stagedMember.request.consumer != owner || !work.nativeWriterObservationOwnerCurrent(facts, q, owner) {
		return false
	}
	root := work.operationRecipes[sourceStagedOperationKey{declaration: owner, operation: call, kind: relativeDemandEffects}]
	if root.nativeGet == nil {
		return false
	}
	source := work.implicitNativeSource(root.nativeGet.request)
	if source == nil || source.kind != sourceNativeObjectDefineProperties || source.descriptorMap == nil || !validNativeDescriptorMapRecipe(work.operationRecipes[source.descriptorMap.protocol.producer]) {
		return false
	}
	event := &sourceStagedNativeWriterEvent{work: work, query: q, borrow: q.stagedMember, epoch: work.operationEpoch, generation: work.operationGeneration, source: source, accounting: nativeRootDebtRequest(source, "algorithm"), provenance: nativeWriterEmptyImplicitSources, active: true}
	event.self = event
	defer event.revoke()
	return work.recordNativeWriterEvent(facts, event)
}
func (work *callableEffectWork) implicitWriterCapabilityCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validImplicitWriterCapabilityRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	actual := work.operationRecipes[recipe.key]
	if !validImplicitWriterCapabilityRecipe(actual) || !sameStagedMemberSource(actual.memberSource, recipe.memberSource) || !sameStagedMemberSource(recipe.memberSource, actual.memberSource) || !operationDeltaPrefix(actual.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, actual.delta) {
		return false
	}
	p := recipe.memberSource.nativeWriter
	source := work.implicitNativeSource(p.source)
	if source == nil || source.kind != sourceNativeObjectDefineProperties || !sameOperationRequest(p.accounting, nativeRootDebtRequest(source, "algorithm")) || !work.implicitNativeGetCurrent(source) {
		return false
	}
	c := work.operationRecipes[p.coverage.producer]
	if !validStagedMemberCoverageRecipe(c) || c.memberSource.generation != work.operationGeneration || !c.memberSource.coverage.extracted || work.memberCoverageObserved[c.key] != work.operationGeneration || !sameOperationRequest(c.memberSource.parent, recipe.memberSource.parent) || !operationContainsRequest(c.delta.required, recipe.memberSource.request) || !work.nativeWriterCapabilityApplied(p.coverage) {
		return false
	}
	// Existing conditional/selection requirements are never dropped. This first
	// slice refuses additional rights until their semantic owner is supported.
	if len(recipe.delta.required) != 2 {
		return false
	}
	return work.implicitDefinitionSourcesCurrent(source)
}
