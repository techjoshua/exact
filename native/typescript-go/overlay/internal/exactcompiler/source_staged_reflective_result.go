package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedReflectiveResult retains existing original result-owner factories.
// It is a description, not a birth receipt. Current result consumption still
// requires the original exclusive Get and guarded Create/prototype relation.
type sourceStagedReflectiveResult struct {
	get, algorithm, population sourceStagedOperationRequest
}

func cloneReflectiveResult(p *sourceStagedReflectiveResult) *sourceStagedReflectiveResult {
	if p == nil {
		return nil
	}
	c := *p
	return &c
}
func sameReflectiveResult(a, b *sourceStagedReflectiveResult) bool {
	return a == b || a != nil && b != nil && sameOperationRequest(a.get, b.get) && sameOperationRequest(a.algorithm, b.algorithm) && (a.population.producer.operation == nil || sameOperationRequest(a.population, b.population))
}
func reflectiveResultRequirements(s *sourceStagedReflectiveTargetSource) []sourceStagedOperationRequest {
	p := s.resultSupport
	if p == nil {
		return nil
	}
	r := []sourceStagedOperationRequest{p.get, p.algorithm}
	if p.population.producer.operation != nil {
		r = append(r, p.population)
	}
	return r
}
func validReflectiveResult(s *sourceStagedReflectiveTargetSource) bool {
	p := s.resultSupport
	if p == nil || s.creating.use == nil || !ast.IsCallExpression(s.creating.use) {
		return false
	}
	n := &sourceStagedNativeGetSource{request: s.creating, get: s.creating.use.Expression()}
	return sameOperationRequest(p.get, nativeRootDebtRequest(n, "callee-get")) && sameOperationRequest(p.algorithm, nativeRootDebtRequest(n, "algorithm")) && (p.population.producer.operation == nil || sameOperationRequest(p.population, nativeMemberAlternativeRequest(n, "callee-alternatives")))
}

// describeReflectiveResult only names factories already issued by the original
// semantic owner. It never asks another Get, infers a native from syntax, or
// introduces an unissued child into an adopted or completed prefix.
func (work *callableEffectWork) describeReflectiveResult(s *sourceStagedReflectiveTargetSource) *sourceStagedReflectiveResult {
	r := work.operationRecipes[s.creating.producer]
	n := r.nativeGet
	if !validNativeGetRecipe(r) || n == nil || n.kind != sourceNativeObjectCreate || n.method != s.method || !sameOperationRequest(n.request, s.creating) || n.get != s.creating.use.Expression() {
		return nil
	}
	p := &sourceStagedReflectiveResult{get: nativeRootDebtRequest(n, "callee-get"), algorithm: nativeRootDebtRequest(n, "algorithm")}
	for _, child := range []sourceStagedOperationRequest{p.get, p.algorithm} {
		c := work.operationRecipes[child.producer]
		if !validNativeGetRecipe(c) || !validNativeGetRequest(c, child) || !sameNativeGetSource(c.nativeGet, n) {
			return nil
		}
	}
	pop := nativeMemberAlternativeRequest(n, "callee-alternatives")
	if operationContainsRequest(r.delta.required, pop) {
		c := work.operationRecipes[pop.producer]
		if !validStagedMemberCallRecipe(c) || !sameOperationRequest(c.memberSource.parent, s.creating) {
			return nil
		}
		p.population = pop
	}
	return p
}

// extendReflectiveResult precedes local publication. Existing full creator and
// alternative debts retain their order; additional support is appended uniquely.
func (work *callableEffectWork) extendReflectiveResult(recipe sourceStagedOperationRecipe) sourceStagedOperationRecipe {
	s := recipe.memberSource.targetSource
	if recipe.delta.extracted {
		return recipe
	}
	p := work.describeReflectiveResult(s)
	if p == nil || s.resultSupport != nil && !sameReflectiveResult(s.resultSupport, p) {
		return recipe
	}
	m := *recipe.memberSource
	t := *s
	t.resultSupport = p
	m.targetSource = &t
	recipe.memberSource = &m
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, s.creating)
	for _, child := range reflectiveResultRequirements(&t) {
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, child)
	}
	return recipe
}

func (work *callableEffectWork) reflectiveResultReady(recipe sourceStagedOperationRecipe) (uint64, bool) {
	if !validStagedReflectiveTargetRecipe(recipe) {
		return 0, false
	}
	s := recipe.memberSource.targetSource
	g := work.operationGeneration
	if g == nil || !g.active || g.project == nil || g.project.activeGeneration != g || g.program == nil || g.checker == nil {
		return 0, false
	}
	caller, known := work.memberNodes[s.creating.consumer]
	file := ast.GetSourceFileOfNode(s.creating.use)
	if !known || caller < 0 || caller >= len(work.operationFacts) || work.operationFacts[caller].node != s.creating.consumer || work.operationFacts[caller].sourceFile != file || file == nil || g.program.GetSourceFile(file.FileName()) != file {
		return 0, false
	}
	if s.resultSupport == nil || s.sourceCut == (sourceRelativeCut{}) || s.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return 0, false
	}
	n := work.currentNativeResultRoot(s.creating.producer)
	if n == nil || n.kind != sourceNativeObjectCreate || n.method != s.method || !sameOperationRequest(n.request, s.creating) || n.get != s.creating.use.Expression() {
		return 0, false
	}
	algorithm := work.operationRecipes[s.resultSupport.algorithm.producer].nativeGet
	proof := work.currentNativeCalleeEffects(n)
	if algorithm == nil || algorithm.prototype == nil || !sameOperationEndpoint(s.prototype, algorithm.prototype.input) || proof == nil || proof.cut != s.sourceCut || proof.method != s.method {
		return 0, false
	}
	get := work.operationIDs[s.resultSupport.get.producer]
	if get.epoch != work.operationEpoch || get.index == 0 || int(get.index) >= len(work.operations) {
		return 0, false
	}
	for _, child := range reflectiveResultRequirements(s) {
		id := work.operationIDs[child.producer]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return 0, false
		}
		st := &work.operations[id.index]
		sub := st.subscribers[sourceStagedOperationConsumer{child.consumer, child.edge}]
		if st.key != child.producer || st.invalid || !st.dependenciesRegistered || st.revision == 0 || !st.delta.extracted || sub == nil || sub.blocked || !sameOperationRequest(sub.request, child) || sub.applied != st.revision {
			return 0, false
		}
		if child.producer == s.resultSupport.population.producer {
			p := work.operationRecipes[child.producer].memberSource
			if p == nil || p.call == nil || !p.call.complete || len(p.call.values)+len(p.call.mapped)+len(p.call.standard)+len(p.call.storage) != 0 || p.call.sourceRequest != nil || work.memberCoverageObserved[child.producer] != work.operationGeneration {
				return 0, false
			}
		}
	}
	owned := false
	for _, child := range work.operations[get.index].delta.required {
		c := work.operationRecipes[child.producer].memberSource
		if c == nil || c.coverage == nil || !sameOperationRequest(c.parent, s.creating) {
			continue
		}
		owned = true
		id := work.operationIDs[child.producer]
		if !validStagedMemberCoverageRecipe(work.operationRecipes[child.producer]) || !c.coverage.extracted || c.coverage.nativeObserver.get != n.get || !sameOperationRequest(c.coverage.nativeObserver.request, n.request) || c.generation != work.operationGeneration || work.memberCoverageObserved[child.producer] != work.operationGeneration || id.epoch != work.operationEpoch || id.index == 0 || !work.operations[id.index].delta.extracted || !work.operations[id.index].memberCoverageObserved {
			return 0, false
		}
	}
	return work.operations[get.index].revision, owned
}

func (work *callableEffectWork) reflectiveBirthCurrent(recipe sourceStagedOperationRecipe) bool {
	revision, ok := work.reflectiveResultReady(recipe)
	id := work.operationIDs[recipe.key]
	return ok && id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) && work.operations[id.index].key == recipe.key && !work.operations[id.index].invalid && work.operations[id.index].targetResultObserved == revision
}

// A genuine newly consumed creator Get revision is a new semantic observation
// even when key-local extraction already published identical Effects atoms.
func (work *callableEffectWork) prepareReflectiveBirth(facts []callableFacts, id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 {
		return false
	}
	r := work.operationRecipes[work.operations[id.index].key]
	revision, ok := work.reflectiveResultReady(r)
	if !ok {
		return false
	}
	st := &work.operations[id.index]
	if st.targetResultObserved == revision {
		return true
	}
	r.delta = cloneOperationDelta(r.delta)
	r.delta.extracted = true
	prior := st.revision
	if !work.attachOperationSource(facts, r) {
		return false
	}
	st = &work.operations[id.index]
	st.targetResultObserved = revision
	if st.revision == prior {
		st.revision++
		work.notifyOperationSubscribers(st)
	}
	return true
}

func (work *callableEffectWork) queueReflectiveResult(key sourceStagedOperationKey) {
	id := work.operationIDs[key]
	r := work.operationRecipes[key]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].key != key || !validStagedReflectiveTargetRecipe(r) || r.memberSource.targetSource.resultSupport == nil || r.memberSource.generation != work.operationGeneration || work.operations[id.index].invalid {
		return
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery {
			return
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[key.declaration], operation: id})
}

// Get admission, actual algorithm/prototype admission and later exact APPLIED
// dependencies all converge on the same already adopted source task.
func (work *callableEffectWork) queueReflectiveResults(source *sourceStagedNativeGetSource) {
	if source == nil || source.kind != sourceNativeObjectCreate {
		return
	}
	for key, r := range work.operationRecipes {
		if r.memberSource != nil && r.memberSource.targetSource != nil && r.memberSource.targetSource.resultSupport != nil && sameOperationRequest(r.memberSource.targetSource.creating, source.request) {
			work.queueReflectiveResult(key)
		}
	}
}
func (work *callableEffectWork) afterReflectiveResultDelivery(request sourceStagedOperationRequest) {
	for key, r := range work.operationRecipes {
		if r.memberSource == nil || r.memberSource.targetSource == nil {
			continue
		}
		for _, child := range reflectiveResultRequirements(r.memberSource.targetSource) {
			if sameOperationRequest(child, request) {
				work.queueReflectiveResult(key)
				break
			}
		}
	}
}
