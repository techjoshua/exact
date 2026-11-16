package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Provenance distinguishes the original exclusion owners. Neither a detached
// description nor a generic attachment can issue either owner's observation.
type sourceStagedNativeWriterProvenance uint8

const (
	nativeWriterUnknown sourceStagedNativeWriterProvenance = iota
	nativeWriterAllRowsDisjoint
	nativeWriterFreshTarget
	nativeWriterEmptyImplicitSources
)

// sourceStagedNativeWriterCapability describes an original writer exclusion
// and its specific semantic owner. Fresh-target and all-row events stay distinct.
// Current consumption separately requires complete callee
// selection and every hidden-entry/eager capability. This description grants
// neither normal values nor a whole invocation's no-user-entry conclusion.
type sourceStagedNativeWriterCapability struct {
	provenance            sourceStagedNativeWriterProvenance
	accounting            sourceStagedOperationRequest // Existing original algorithm owner, not an entry law.
	source, coverage, law sourceStagedOperationRequest
}

func sameNativeWriterCapability(a, b *sourceStagedNativeWriterCapability) bool {
	return a == b || a != nil && b != nil && a.provenance == b.provenance && sameOperationRequest(a.accounting, b.accounting) && sameOperationRequest(a.source, b.source) && sameOperationRequest(a.coverage, b.coverage) && sameOperationRequest(a.law, b.law)
}
func cloneNativeWriterCapability(p *sourceStagedNativeWriterCapability) *sourceStagedNativeWriterCapability {
	if p == nil {
		return nil
	}
	c := *p
	return &c
}
func (work *callableEffectWork) nativeWriterSource(r sourceStagedOperationRequest) *sourceStagedNativeGetSource {
	recipe := work.operationRecipes[r.producer]
	s := recipe.nativeGet
	if s == nil || !validNativeGetRecipe(recipe) || !sameOperationRequest(s.request, r) || !runtimeModuleEvaluation(r.consumer) || enclosingCallableNode(r.use) != nil || s.kind != sourceNativeObjectDefineProperties {
		return nil
	}

	algorithm := work.operationRecipes[nativeRootDebtRequest(s, "algorithm").producer]
	selected := algorithm.nativeGet
	if selected == nil || !validNativeGetRecipe(algorithm) || !sameOperationRequest(selected.request, r) || selected.get != s.get || selected.method != s.method || selected.kind != s.kind || selected.descriptorMap == nil || !validNativeDescriptorMapRecipe(work.operationRecipes[selected.descriptorMap.protocol.producer]) {
		return nil
	}
	return selected
}
func validNativeWriterCapabilityRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	if recipe.memberSource != nil && recipe.memberSource.nativeWriter != nil && recipe.memberSource.nativeWriter.provenance == nativeWriterEmptyImplicitSources {
		return validImplicitWriterCapabilityRecipe(recipe)
	}
	s := recipe.memberSource
	if s == nil || s.nativeWriter == nil || s.generation == nil || !s.candidate.reflective || s.candidate.protocol || s.candidate.runtimeUnknown || s.candidate.region != nil || s.candidate.operation == nil || enclosingCallableNode(s.candidate.operation) != nil || s.coverage != nil || s.call != nil || s.getEffects != nil || s.protocolSource != nil || s.globalWrite != nil || s.targetSource != nil || s.hasFreshTarget != nil || s.moduleExcluded != nil || s.writeEffects || len(s.values) != 0 || len(recipe.writerRequired) != 0 || recipe.delta.extracted || len(recipe.delta.effects)+len(recipe.delta.residuals)+len(recipe.delta.relative)+len(recipe.delta.invoked)+len(recipe.delta.exposures) != 0 {
		return false
	}
	p := s.nativeWriter
	if p.accounting.producer.operation != nil {
		return false
	}
	if p.provenance != nativeWriterAllRowsDisjoint && p.provenance != nativeWriterFreshTarget {
		return false
	}
	if p.provenance == nativeWriterFreshTarget && (!runtimeModuleEvaluation(s.parent.consumer) || enclosingCallableNode(s.parent.use) != nil || s.candidate.prior) {
		return false
	}

	if recipe.nativeGet != nil || recipe.callResult != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.hasInstance != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || len(recipe.constructedGroup)+len(recipe.constructedInputs)+len(recipe.fieldForwards) != 0 || s.parent.inputs != nil || s.parent.consumer != s.parent.producer.declaration || s.parent.producer.kind != relativeDemandEffects || !sourceStagedOccurrenceOwned(s.parent.producer.operation, s.parent.consumer) || !sameOperationRequest(s.candidate.request, s.parent) {
		return false
	}
	if s.extraction != nil && (s.extraction.generation != s.generation || !sameOperationRequest(s.extraction.request, s.parent) || s.extraction.cut != s.candidate.cut || s.extraction.delta.extracted) {
		return false
	}
	return sameOperationRequest(s.request, stagedMemberCandidateRequest(s.parent, s.candidate)) && recipe.key == s.request.producer && p.source.use == s.candidate.operation && p.source.consumer == p.source.producer.declaration && runtimeModuleEvaluation(p.source.consumer) && p.source.producer.selector == (sourceStagedOperationSelector{}) && sameOperationRequest(p.coverage, stagedMemberCoverageRequest(s.parent, s.candidate.origin, s.candidate.cut)) && operationContainsRequest(recipe.delta.required, p.source) && operationContainsRequest(recipe.delta.required, p.law) && validStagedMemberObservation(s.parent, s.candidate.cut)
}

// nativeWriterEagerCurrent consumes original module inert construction or the
// audited two-key map. The original selected owner issued the input associations.
// This pure consumer neither describes producers nor queries imported values.
func (work *callableEffectWork) nativeWriterEagerCurrent(s *sourceStagedNativeGetSource) bool {

	if s == nil {
		return false
	}
	eager := work.operationRecipes[nativeRootDebtRequest(s, "eager-inputs").producer]
	actual := eager.nativeGet
	if actual == nil || !validNativeGetRecipe(eager) || !sameOperationRequest(actual.request, s.request) || actual.get != s.get || actual.method != s.method || actual.kind != s.kind {
		return false
	}
	s = actual
	if !work.nativeEagerWitnessCurrent(s) {
		return false
	}
	if s.descriptorMap == nil || s.descriptorMap.target.expression == nil || !ast.IsObjectLiteralExpression(s.descriptorMap.target.expression) || len(s.descriptorMap.target.expression.AsObjectLiteralExpression().Properties.Nodes) != 0 {
		return false
	}
	// This separate module domain consumes the SAME successful original input
	// admission/Get witness above. The existing inert-creation owner pays only
	// argument construction; conversion/field/algorithm laws remain mandatory.
	if runtimeModuleEvaluation(s.request.consumer) && s.request.consumer == s.request.producer.declaration && enclosingCallableNode(s.request.use) == nil && sourceStagedOccurrenceOwned(s.request.use, s.request.consumer) && len(s.keySources) == 0 && len(s.moduleSources) == 0 && s.inputEffects && stagedMapInputsInert(s) {
		actuals := restrictedInvocationArguments(s.request.use.AsCallExpression())
		if len(actuals) == 2 && sameOperationEndpoint(s.descriptorMap.target, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals[0], producer: s.request.use, cut: s.request.cut}) && sameOperationEndpoint(s.descriptorMap.descriptors, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals[1], producer: s.request.use, cut: s.request.cut}) {
			return true
		}
	}
	group := s.descriptorMap.descriptors.expression
	if group == nil || !ast.IsObjectLiteralExpression(group) || len(group.AsObjectLiteralExpression().Properties.Nodes) != 2 || len(s.keySources) != 2 || len(s.moduleSources) != 1 {
		return false
	}
	for i, member := range group.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(member) || member.Name() == nil || !ast.IsComputedPropertyName(member.Name()) {
			return false
		}
		key := s.keySources[i]
		if key.expression != member.Name().AsComputedPropertyName().Expression || !key.symbol || !ast.IsIdentifier(key.expression) {
			return false
		}
		r := stagedKeySourceRequest(s, key)
		producer := work.operationRecipes[r.producer].nativeGet
		if producer == nil || producer.kind != sourceNativeSymbolFor || !sameOperationRequest(producer.request, key.producer) || !work.nativeSymbolKeyReadingCurrent(r) || !stagedNativeCallNoUserEntry(producer, producer.request.use) {
			return false
		}
		value := member.AsPropertyAssignment().Initializer
		if value == nil || !ast.IsObjectLiteralExpression(value) || len(value.AsObjectLiteralExpression().Properties.Nodes) != 1 {
			return false
		}
		field := value.AsObjectLiteralExpression().Properties.Nodes[0]
		if !ast.IsPropertyAssignment(field) || field.Name() == nil || ast.IsComputedPropertyName(field.Name()) || callableNameText(field.Name()) != "value" {
			return false
		}
		init := field.AsPropertyAssignment().Initializer
		if i == 0 {
			if init == nil || init.Kind != ast.KindTrueKeyword {
				return false
			}
		} else if init == nil || !ast.IsIdentifier(init) || s.moduleSources[0].reference != init || s.moduleSources[0].importEdge == nil {
			return false
		}
	}
	r := nativeRootDebtRequest(s, "eager-inputs")
	id := work.operationIDs[r.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	if state.invalid || !state.dependenciesRegistered || len(state.moduleInputs) != 1 {
		return false
	}
	input := s.moduleSources[0]
	m := state.moduleInputs[0]
	c, cok := work.memberNodes[r.consumer]
	p, pok := work.memberNodes[input.declaration]
	if !cok || !pok || p < 0 || p >= len(work.stagedRevisions) || m.producer != p || m.declaration != input.declaration || m.edge != fmt.Sprintf("%s:module-input:%d:%d", s.request.edge, input.reference.Pos(), input.declaration.Pos()) {
		return false
	}
	d := work.stagedRequired[sourceStagedDependencyKey{c, m.edge}]
	return d != nil && !d.invalid && !d.projectionPending && d.producer == p && d.operation == s.request.use && d.cut == s.request.cut && work.operationFacts[p].staged.ready && d.consumed == work.stagedRevisions[p]
}

// nativeWriterRefinementAllowed keeps an observation attached to its immutable
// association. A stamp issued by another family cannot authorize first refinement.
// This also guards generic attachment's automatic publication path.
func (work *callableEffectWork) nativeWriterRefinementAllowed(prior, next sourceStagedOperationRecipe) bool {
	if next.memberSource == nil || next.memberSource.nativeWriter == nil {
		return true
	}
	old, current := prior.memberSource, next.memberSource
	if old == nil || old.generation != current.generation || !sameOperationRequest(old.request, current.request) || !sameOperationRequest(old.parent, current.parent) || !sameStagedMemberCandidate(old.candidate, current.candidate) {
		return false
	}
	if old.nativeWriter == nil {
		return work.memberCoverageObserved[next.key] == nil
	}
	if !sameNativeWriterCapability(old.nativeWriter, current.nativeWriter) {
		return false
	}
	if work.memberCoverageObserved[next.key] != nil {
		return operationDeltaPrefix(prior.delta, next.delta) && operationDeltaPrefix(next.delta, prior.delta)
	}
	return true
}

// nativeWriterCapabilityDescription adds exact requirements without observing
// the event or dropping any prior/selection child. Extra rights stay pending at
// the unchanged current consumer until a separate owner supports them.
func nativeWriterCapabilityDescription(recipe sourceStagedOperationRecipe, p *sourceStagedNativeWriterCapability) (sourceStagedOperationRecipe, bool) {
	if p == nil || recipe.memberSource == nil {
		return sourceStagedOperationRecipe{}, false
	}
	s := *recipe.memberSource
	if s.nativeWriter != nil && !sameNativeWriterCapability(s.nativeWriter, p) {
		return sourceStagedOperationRecipe{}, false
	}
	s.nativeWriter = cloneNativeWriterCapability(p)
	recipe.memberSource = &s
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, p.source)
	if p.provenance == nativeWriterEmptyImplicitSources {
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, p.accounting)
	} else {
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, p.law)
	}
	return recipe, validNativeWriterCapabilityRecipe(recipe)
}

// attachNativeWriterCapability attaches a strict description only. An original
// event must separately observe the registered association before publication.
func (work *callableEffectWork) attachNativeWriterCapability(facts []callableFacts, recipe sourceStagedOperationRecipe, p *sourceStagedNativeWriterCapability) bool {
	attached, valid := nativeWriterCapabilityDescription(recipe, p)
	return valid && work.attachOperationSource(facts, attached)
}

// sourceStagedNativeWriterEvent is confined to one actual callback. The self
// issuer, live query/borrow and exact prepared factory are never cloned/stored.
// The persistent payload is descriptive; the existing observation map is still
// the only graph-local stamp, and cannot be reused for a different association.
type sourceStagedNativeWriterEvent struct {
	self       *sourceStagedNativeWriterEvent
	work       *callableEffectWork
	query      *sourceValueQuery
	borrow     *sourceStagedMemberBorrow
	epoch      *sourceStagedOperationEpoch
	generation *projectGeneration
	recipe     sourceStagedOperationRecipe
	source     *sourceStagedNativeGetSource
	law        sourceStagedOperationRequest
	accounting sourceStagedOperationRequest
	provenance sourceStagedNativeWriterProvenance
	prepared   bool
	active     bool
}

// revoke ends this original callback's authority, including retained references.
func (event *sourceStagedNativeWriterEvent) revoke() {
	event.active = false
	event.self = nil
	event.work = nil
	event.query = nil
	event.borrow = nil
	event.epoch = nil
	event.generation = nil
	event.source = nil
	event.law = sourceStagedOperationRequest{}
	event.accounting = sourceStagedOperationRequest{}
	event.provenance = nativeWriterUnknown
	event.recipe = sourceStagedOperationRecipe{}
	event.prepared = false
}

// observeNativeWriterCapability consumes only the registered full association
// prepared by this still-live original event. Descriptions alone never enter.
func (work *callableEffectWork) observeNativeWriterCapability(facts []callableFacts, event *sourceStagedNativeWriterEvent) bool {
	if event == nil || event.self != event || !event.active || event.work != work || event.epoch != work.operationEpoch || event.generation != work.operationGeneration || event.query == nil || event.borrow == nil || !event.prepared || event.query.stagedMember != event.borrow || !event.query.liveStagedMemberSource(event.borrow, event.borrow.get, event.borrow.read) {
		return false
	}
	q, b := event.query, event.borrow
	expected := event.recipe
	registered := work.operationRecipes[expected.key]
	s := registered.memberSource
	if expected.memberSource == nil || expected.memberSource.nativeWriter == nil || expected.memberSource.nativeWriter.provenance != event.provenance || event.source == nil || !sameOperationRequest(expected.memberSource.nativeWriter.source, event.source.request) || !sameOperationRequest(expected.memberSource.nativeWriter.law, event.law) || !sameOperationRequest(expected.memberSource.nativeWriter.accounting, event.accounting) {
		return false
	}
	if !validNativeWriterCapabilityRecipe(registered) || s == nil || s.generation != event.generation || !sameStagedMemberSource(expected.memberSource, s) || !sameStagedMemberSource(s, expected.memberSource) || !sameStagedMemberCandidate(expected.memberSource.candidate, s.candidate) || !operationDeltaPrefix(expected.delta, registered.delta) || !operationDeltaPrefix(registered.delta, expected.delta) || !sameOperationRequest(s.parent, b.request) || s.candidate.cut != q.relativeInputCut(b.get.operation) || !operationContainsRequest(b.required, s.request) || !work.nativeWriterObservationOwnerCurrent(facts, q, s.parent.consumer) || !work.nativeWriterObservationOwnerCurrent(facts, q, s.nativeWriter.source.consumer) {
		return false
	}
	if event.provenance == nativeWriterEmptyImplicitSources {
		id := work.operationIDs[event.source.request.producer]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid || !work.operations[id.index].dependenciesRegistered {
			return false
		}
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[expected.key] = work.operationGeneration
	work.indexNativeWriterCapability(expected.key)
	if id := work.operationIDs[expected.key]; id.index != 0 {
		work.publishNativeWriterCapability(id)
	}
	return true
}

// recordNativeWriterEvent is reached only by original semantic owners.
// The source owner has already selected the provenance-specific premise. Strict
// attachment must succeed before this callback can issue an observation.
func (work *callableEffectWork) recordNativeWriterEvent(facts []callableFacts, event *sourceStagedNativeWriterEvent) bool {
	if event == nil || event.self != event || !event.active || event.prepared || event.work != work || event.epoch != work.operationEpoch || event.generation != work.operationGeneration || event.query == nil || event.borrow == nil || event.query.stagedMember != event.borrow || event.source == nil || event.provenance != nativeWriterAllRowsDisjoint && event.provenance != nativeWriterFreshTarget && event.provenance != nativeWriterEmptyImplicitSources {
		return false
	}
	q, b, source, law := event.query, event.borrow, event.source, event.law
	if !q.liveStagedMemberSource(b, b.get, b.read) || !work.nativeWriterObservationOwnerCurrent(facts, q, b.request.consumer) || !work.nativeWriterObservationOwnerCurrent(facts, q, source.request.consumer) {
		return false
	}
	for _, r := range b.required {
		recipe := work.operationRecipes[r.producer]
		s := recipe.memberSource
		if s == nil || s.candidate.operation != source.request.use || !s.candidate.reflective || s.candidate.protocol || !nativeWriterEventRegionOwned(event, s) || s.candidate.cut != q.relativeInputCut(b.get.operation) || !sameOperationRequest(s.parent, b.request) {
			continue
		}
		p := &sourceStagedNativeWriterCapability{provenance: event.provenance, source: source.request, coverage: stagedMemberCoverageRequest(s.parent, s.candidate.origin, s.candidate.cut), law: law, accounting: event.accounting}
		recipe.delta = cloneOperationDelta(recipe.delta)
		for _, required := range b.selectionRequired {
			recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, required)
		}
		attached, valid := nativeWriterCapabilityDescription(recipe, p)
		if !valid {
			return false
		}
		event.recipe, event.prepared = attached, true
		if !work.attachOperationSource(facts, attached) {
			return false
		}
		return work.observeNativeWriterCapability(facts, event)
	}
	return false
}

func (work *callableEffectWork) nativeWriterCapabilityCurrent(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.nativeWriter != nil && recipe.memberSource.nativeWriter.provenance == nativeWriterEmptyImplicitSources {
		return work.implicitWriterCapabilityCurrent(recipe)
	}
	if !validNativeWriterCapabilityRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	registered := work.operationRecipes[recipe.key]
	if !validNativeWriterCapabilityRecipe(registered) || !sameStagedMemberSource(registered.memberSource, recipe.memberSource) || !sameStagedMemberSource(recipe.memberSource, registered.memberSource) || !sameStagedMemberCandidate(registered.memberSource.candidate, recipe.memberSource.candidate) || !operationDeltaPrefix(registered.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, registered.delta) {
		return false
	}
	p := recipe.memberSource.nativeWriter
	if len(recipe.delta.required) != 2 {
		return false
	} // Extra conditional source rights need their own current owner.
	c := work.operationRecipes[p.coverage.producer].memberSource
	if c == nil || c.coverage == nil || !validStagedMemberCoverageRecipe(work.operationRecipes[p.coverage.producer]) || !c.coverage.extracted || c.generation != work.operationGeneration || work.memberCoverageObserved[p.coverage.producer] != work.operationGeneration || !sameOperationRequest(c.parent, recipe.memberSource.parent) || !operationContainsRequest(c.coverage.required, recipe.memberSource.request) {
		return false
	}
	source := work.nativeWriterSource(p.source)
	if source == nil {
		return false
	}
	if p.provenance == nativeWriterFreshTarget {
		// Fresh result semantics belong to the registered algorithm role, not
		// the root description. Keep the original source for the full compositor.
		request := nativeRootDebtRequest(source, "algorithm")
		algorithm := work.operationRecipes[request.producer]
		law, valid := stagedEntryLawRequest(request, stagedEntryLawNativeAlgorithm)
		if !validNativeGetRecipe(algorithm) || algorithm.key != request.producer || !sameNativeGetSource(algorithm.nativeGet, source) || !sameOperationRequest(algorithm.nativeGet.request, p.source) || !valid || !sameOperationRequest(law, p.law) || !work.stagedNativeFreshResult(algorithm.nativeGet) {
			return false
		}
	}
	return work.nativeWriterCapabilityApplied(p.coverage) && work.nativeWriterCapabilitiesCurrent(source, p.law)
}

// publishNativeWriterCapability attempts local publication, never currentness.
// A fully published identical canonical envelope needs no repeated validation:
// either result of the pure currentness check would leave that envelope alone.
// Actual delivery/currentness consumers still authenticate every live receipt.
// This fast path is O(the existing delta), allocates nothing and caches no proof.
func (work *callableEffectWork) publishNativeWriterCapability(id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !state.dependenciesRegistered {
		return
	}
	if state.delta.extracted && state.revision != 0 && recipe.key == state.key && recipe.memberSource != nil && recipe.memberSource.nativeWriter != nil && work.operationGeneration != nil && work.operationGeneration.active && recipe.memberSource.generation == work.operationGeneration && operationDeltaCursor(state.delta) == operationDeltaCursor(recipe.delta) && operationDeltaPrefix(recipe.delta, state.delta) {
		return // No new atom, disposition, revision, notification or receipt.
	}
	if !work.nativeWriterCapabilityCurrent(recipe) {
		return
	}
	delta := cloneOperationDelta(recipe.delta)
	delta.extracted = true
	work.publishOperation(id, delta)
}

// nativeWriterCapabilitiesCurrent checks positive original laws and their exact
// delivered revisions. Full Effects roots remain dependency/closure debts, not
// semantic certificates. No primitive C/source requirement is removed.
func (work *callableEffectWork) nativeWriterCapabilitiesCurrent(source *sourceStagedNativeGetSource, original sourceStagedOperationRequest) bool {
	if source == nil || !work.nativeWriterEagerCurrent(source) {
		return false
	}
	get := work.currentNativeCalleeEffects(source)
	if get == nil || !get.noUserEntry || !work.nativeEffectsGetCurrent(source) {
		return false
	}
	expected, ok := stagedEntryLawRequest(nativeRootDebtRequest(source, "algorithm"), stagedEntryLawNativeAlgorithm)
	if !ok || !sameOperationRequest(expected, original) {
		return false
	}
	queue := []sourceStagedOperationRequest{original}
	seen := make(map[sourceStagedOperationKey]bool)
	for head := 0; head < len(queue); head++ {
		r := queue[head]
		if seen[r.producer] {
			continue
		}
		seen[r.producer] = true
		recipe := work.operationRecipes[r.producer]
		if !validStagedEntryLawRecipe(recipe) || !sameOperationRequest(recipe.entryLaw.request, r) || !work.entryLawLocallyAccounted(recipe, work.entryLawReceipts[r.producer]) || !work.nativeWriterCapabilityApplied(r) {
			return false
		}
		for _, child := range recipe.delta.required {
			producer := work.operationRecipes[child.producer]
			if producer.entryLaw != nil {
				queue = append(queue, child)
				continue
			}
			if c := producer.memberSource; c != nil && c.coverage != nil {
				// The unchanged law gate validates EVERY contextual candidate.
				// Current C observation is independently mandatory.
				if !validStagedMemberCoverageRecipe(producer) || !c.coverage.extracted || work.memberCoverageObserved[producer.key] != work.operationGeneration || !work.nativeWriterCapabilityApplied(child) {
					return false
				}
				continue
			}

			if producer.memberSource != nil && producer.memberSource.call != nil {
				if !work.nativeWriterPopulationCurrent(source, child) {
					return false
				}
				continue
			}
			native := producer.nativeGet
			if native == nil || !validNativeGetRecipe(producer) {
				return false
			}
			proof := work.currentNativeCalleeEffects(native)
			if proof == nil || !proof.noUserEntry || !work.nativeWriterCapabilityApplied(child) {
				return false
			}
			if sameOperationRequest(child, nativeRootDebtRequest(native, "callee-get")) {
				// This exact lookup has its own current no-entry proof and delivered
				// revision above. It grants no capability for invoking that Call.
				continue
			}
			if sameOperationRequest(child, source.request) || sameOperationRequest(child, nativeRootDebtRequest(source, "callee-get")) {
				// These are the declared creator/Get Effects debts, not evidence that the
				// algorithm is harmless. Its positive phase laws are checked separately.
				continue
			}
			if !stagedNativeCallNoUserEntry(native, native.request.use) {
				return false
			}
		}
	}
	return true
}
func (work *callableEffectWork) nativeWriterCapabilityApplied(r sourceStagedOperationRequest) bool {
	id := work.operationIDs[r.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
	return !state.invalid && state.dependenciesRegistered && state.delta.extracted && state.revision != 0 && sub != nil && !sub.blocked && sameOperationRequest(sub.request, r) && sub.applied == state.revision
}

// nativeWriterObservationOwnerCurrent authenticates an original event's two
// existing fact owners. It grants no Get receipt or whole-writer capability.
func (work *callableEffectWork) nativeWriterObservationOwnerCurrent(facts []callableFacts, q *sourceValueQuery, consumer *ast.Node) bool {
	if q == nil || q.owner == nil || q.executable == nil || q.executable.values == nil || q.executable.project == nil || q.owner.checker == nil || work.operationEpoch == nil || work.operationGeneration == nil || q.owner.generation != work.operationGeneration || q.owner.generation != q.executable.project.activeGeneration || q.owner.program != q.executable.project.program || q.executable.values.program != q.owner.program || q.executable.values.checker != q.owner.checker || q.executable.values.generation != q.owner.generation {
		return false
	}
	index, known := work.memberNodes[consumer]
	if !known || index < 0 || index >= len(facts) || index >= len(work.operationFacts) || &facts[index] != &work.operationFacts[index] || facts[index].node != consumer || facts[index].sourceFile == nil || q.owner.program.GetSourceFile(facts[index].sourceFile.FileName()) != facts[index].sourceFile {
		return false
	}
	publisher := q.executable.pendingMemberPublishers[consumer]
	return publisher != nil && publisher.live && publisher.fact == &facts[index]
}

// recordNativeWriterDisjoint is called AFTER the original outer writer-row
// aggregation. Every row must have reached the actual direct-target disjoint
// exit without unresolved siblings; selected-alternative syntax is insufficient.
func (work *callableEffectWork) recordNativeWriterDisjoint(facts []callableFacts, q *sourceValueQuery, call *ast.Node) bool {
	if call != nil && enclosingCallableNode(call) != nil {
		return work.recordImplicitWriterDisjoint(facts, q, call)
	}
	if q == nil {
		return false
	}
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || call == nil || enclosingCallableNode(call) != nil || !runtimeModuleEvaluation(sourceStagedModuleOwner(call)) || !work.nativeWriterObservationOwnerCurrent(facts, q, b.request.consumer) || !work.nativeWriterObservationOwnerCurrent(facts, q, sourceStagedModuleOwner(call)) {
		return false
	}
	root := work.operationRecipes[sourceStagedOperationKey{declaration: sourceStagedModuleOwner(call), operation: call, kind: relativeDemandEffects}]
	if root.nativeGet == nil {
		return false
	}
	source := work.nativeWriterSource(root.nativeGet.request)
	if source == nil {
		return false
	}
	// The authentic all-row event is conditional on the complete Get and hidden
	// entry capabilities. Record it before those can arrive; only the unchanged
	// current consumer/publisher may extract this candidate after they do.
	law, ok := stagedEntryLawRequest(nativeRootDebtRequest(source, "algorithm"), stagedEntryLawNativeAlgorithm)
	if !ok || !validStagedEntryLawRecipe(work.operationRecipes[law.producer]) {
		return false
	}
	event := &sourceStagedNativeWriterEvent{work: work, query: q, borrow: b, epoch: work.operationEpoch, generation: work.operationGeneration, source: source, law: law, provenance: nativeWriterAllRowsDisjoint, active: true}
	event.self = event
	defer event.revoke()
	return work.recordNativeWriterEvent(facts, event)
}

// nativeWriterPopulationCurrent consumes only the exact optional native-only
// population declared by this canonical source. It does not turn arbitrary Call
// metadata into an entry law or discard its full C/Get/Effects prerequisites.
func (work *callableEffectWork) nativeWriterPopulationCurrent(source *sourceStagedNativeGetSource, reading sourceStagedOperationRequest) bool {
	expected, described := work.describeNativeOnlyPopulation(source)
	return described && sameOperationRequest(reading, expected) && work.currentNativeOnlyPopulation(source) && work.nativeWriterCapabilityApplied(reading)
}
