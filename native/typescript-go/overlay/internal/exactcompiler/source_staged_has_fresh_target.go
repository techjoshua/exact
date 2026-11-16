package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This detached reading belongs to an original Has Get's candidate, not a
// generic function query. It carries no observation, value or invocation right.
type sourceStagedHasFreshTarget struct {
	root, coverage, native, law sourceStagedOperationRequest
	cut                         sourceRelativeCut
	generation                  *projectGeneration
}

func cloneHasFreshTarget(p *sourceStagedHasFreshTarget) *sourceStagedHasFreshTarget {
	if p == nil {
		return nil
	}
	c := *p
	return &c
}
func sameHasFreshTarget(a, b *sourceStagedHasFreshTarget) bool {
	return a == b || a != nil && b != nil && *a == *b
}
func hasFreshTargetReading(source *sourceStagedMemberSource) sourceStagedOperationRequest {
	p := source.hasFreshTarget
	r := p.law
	r.consumer = p.root.consumer
	r.reading = source.request.producer
	r.edge = fmt.Sprintf("%s:has-fresh-target:%d", source.request.edge, p.native.use.Pos())
	return r
}
func validHasFreshTargetRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	if s == nil || s.hasFreshTarget == nil {
		return false
	}
	p := s.hasFreshTarget
	if p.generation == nil || p.generation != s.generation || !sameOperationRequest(p.root, s.parent) || !ast.IsBinaryExpression(p.root.use) || p.root.use.AsBinaryExpression().OperatorToken.Kind != ast.KindInstanceOfKeyword || p.cut != s.candidate.cut || !s.candidate.reflective || s.candidate.protocol || p.native.use != s.candidate.operation || !runtimeModuleEvaluation(p.native.consumer) || p.native.consumer != sourceStagedModuleOwner(s.candidate.operation) || s.candidate.region != nil && s.candidate.region != p.native.consumer || !validStagedMemberParent(p.native) || !ast.IsCallExpression(p.native.use) || !sameOperationRequest(p.coverage, stagedMemberCoverageRequest(p.root, s.candidate.origin, p.cut)) {
		return false
	}
	copy := *s
	copy.hasFreshTarget = nil
	base := recipe
	base.memberSource = &copy
	base.delta = sourceStagedOperationDelta{}
	if !validStagedMemberRecipe(base) || len(recipe.delta.required) != 2 || !sameOperationRequest(recipe.delta.required[0], p.native) || !sameOperationRequest(recipe.delta.required[1], hasFreshTargetReading(s)) || operationDeltaSize(recipe.delta) != 2 {
		return false
	}
	law, ok := stagedEntryLawRequest(nativeRootDebtRequest(&sourceStagedNativeGetSource{request: p.native, get: p.native.use.Expression()}, "algorithm"), stagedEntryLawNativeAlgorithm)
	return ok && sameOperationRequest(law, p.law)
}
func (work *callableEffectWork) validHasFreshTargetReading(producer sourceStagedOperationRecipe, r sourceStagedOperationRequest) bool {
	candidate := work.operationRecipes[r.reading]
	s := candidate.memberSource
	if !validStagedEntryLawRecipe(producer) || !validHasFreshTargetRecipe(candidate) || s.generation != work.operationGeneration {
		return false
	}
	p := s.hasFreshTarget
	native := work.operationRecipes[p.native.producer]
	return native.nativeGet != nil && validNativeGetRequest(native, p.native) && sameOperationRequest(native.nativeGet.request, p.native) && sameOperationRequest(p.law, producer.entryLaw.request) && sameOperationRequest(r, hasFreshTargetReading(s))
}

// Only the live original candidate publisher can associate these existing
// producers. Children are registered before candidate adoption; C gains no new
// retrospective child. A cloned description cannot issue a current Get.
func (work *callableEffectWork) registerHasFreshTarget(facts []callableFacts, q *sourceValueQuery, key sourceStagedOperationKey) {
	if q == nil || q.owner == nil || q.executable == nil || q.executable.project == nil || q.owner.generation != work.operationGeneration || q.executable.project.activeGeneration != work.operationGeneration {
		return
	}
	b := q.stagedMember
	h := q.stagedHasInstance
	if b == nil || h == nil || !q.liveStagedHasInstanceGet(h.get) || !q.liveStagedMemberSource(b, b.get, b.read) || !b.publishing || b.current == nil || b.coverage != nil && (b.coverage.extracted || b.coverage.origin != b.current.origin || b.coverage.cut != b.current.cut) || h.get.receiver.native == nil || h.get.receiver.native.kind != sourceNativeWeakMapConstructor || h.get.receiver.native.referencesIncomplete || !standardLibrarySource(ast.GetSourceFileOfNode(h.get.receiver.node)) || b.current.origin != h.get.receiver.node {
		return
	}
	caller, ok := work.memberNodes[b.request.consumer]
	if !ok || q.executable == nil {
		return
	}
	publisher := q.executable.pendingMemberPublishers[b.request.consumer]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	recipe := work.operationRecipes[key]
	s := recipe.memberSource
	if s == nil || s.hasFreshTarget != nil || recipe.delta.extracted || !sameStagedMemberCandidate(s.candidate, *b.current) || !s.candidate.reflective {
		return
	}
	module := sourceStagedModuleOwner(s.candidate.operation)
	native := work.operationRecipes[sourceStagedOperationKey{declaration: module, operation: s.candidate.operation, kind: relativeDemandEffects}].nativeGet
	if native == nil || !work.describeStagedNativeFreshResult(work.operationRecipes[nativeRootDebtRequest(native, "algorithm").producer].nativeGet) {
		return
	}
	law, ok := work.nativeAlgorithmEntryLaw(facts, native)
	if !ok {
		return
	}
	copy := *s
	copy.hasFreshTarget = &sourceStagedHasFreshTarget{root: b.request, coverage: stagedMemberCoverageRequest(b.request, s.candidate.origin, s.candidate.cut), native: native.request, law: law, cut: s.candidate.cut, generation: work.operationGeneration}
	recipe.memberSource = &copy
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = []sourceStagedOperationRequest{native.request, hasFreshTargetReading(&copy)}
	if validHasFreshTargetRecipe(recipe) {
		work.attachOperationSource(facts, recipe)
	}
}
func (work *callableEffectWork) hasFreshTargetCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validHasFreshTargetRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration {
		return false
	}
	s := recipe.memberSource
	p := s.hasFreshTarget
	if work.currentHasInstanceNativeDefault(p.root) == nil {
		return false
	}
	native := work.operationRecipes[p.native.producer].nativeGet
	if native == nil || !sameOperationRequest(native.request, p.native) || !work.stagedNativeFreshResult(work.operationRecipes[nativeRootDebtRequest(native, "algorithm").producer].nativeGet) {
		return false
	}
	law := work.operationRecipes[p.law.producer]
	if !work.validHasFreshTargetReading(law, hasFreshTargetReading(s)) || !work.entryLawLocallyAccounted(law, work.entryLawReceipts[law.key]) {
		return false
	}
	id := work.operationIDs[p.law.producer]
	if id.epoch != work.operationEpoch || id.index == 0 {
		return false
	}
	state := &work.operations[id.index]
	r := hasFreshTargetReading(s)
	sub := state.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
	return state.revision != 0 && sub != nil && !sub.blocked && sub.applied == state.revision && sameOperationRequest(sub.request, r)
}
func (work *callableEffectWork) prepareHasFreshTarget(facts []callableFacts, id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !work.hasFreshTargetCurrent(recipe) {
		return
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.extracted = true
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, recipe.delta)
	}
}

// Both producer delivery and the original complete Has event wake the same
// adopted candidate. Consumed tasks never pay coalescing; no queue polling occurs.
func (work *callableEffectWork) queueHasFreshTarget(key sourceStagedOperationKey) {
	id, ok := work.operationIDs[key]
	if !ok || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[key]
	if state.key != key || state.invalid || !state.dependenciesRegistered || !validHasFreshTargetRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration {
		return
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery {
			return
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[key.declaration], operation: id})
}
func (work *callableEffectWork) afterHasFreshTargetDelivery(id sourceStagedOperationID, r sourceStagedOperationRequest) {
	if id.epoch != work.operationEpoch || id.index == 0 || !work.validHasFreshTargetReading(work.operationRecipes[work.operations[id.index].key], r) {
		return
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
	if sub != nil && !sub.blocked && sub.applied == state.revision && state.revision != 0 {
		work.queueHasFreshTarget(r.reading)
	}
}
func (work *callableEffectWork) queueHasFreshTargets(root sourceStagedOperationRequest) {
	for key, recipe := range work.operationRecipes {
		if s := recipe.memberSource; s != nil && s.hasFreshTarget != nil && sameOperationRequest(s.hasFreshTarget.root, root) && validHasFreshTargetRecipe(recipe) {
			work.queueHasFreshTarget(key)
		}
	}
}
