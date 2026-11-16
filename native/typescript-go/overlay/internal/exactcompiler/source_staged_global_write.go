package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedGlobalWrite describes only an original external Set Effects role.
// It carries no current event, setter invocation, value, identity or no-entry law.
type sourceStagedGlobalWrite struct {
	operation, origin *ast.Node
	mode              accessorTraversal
	cut               sourceRelativeCut
	generation        *projectGeneration
}

// The event belongs only to publishCandidate's synchronous original owner.
// Neither this issuer nor its query/Get/read loan is stored in a source recipe.
type sourceStagedGlobalWriteEvent struct {
	self           *sourceStagedGlobalWriteEvent
	issuer         *sourceValueQuery
	owner          *sourceValueOwner
	get            *sourceGetInputs
	read           *sourceMemberWriterReadCut
	symbol, global *ast.Symbol
	candidate      sourceStagedMemberCandidate
	mode           accessorTraversal
	generation     *projectGeneration
}

func (q *sourceValueQuery) beginStagedGlobalWrite(get *sourceGetInputs, read *sourceMemberWriterReadCut, candidate sourceStagedMemberCandidate, symbol, global *ast.Symbol, mode accessorTraversal) (func(), bool) {
	if q == nil {
		return func() {}, false
	}
	b := q.stagedMember
	if b == nil || b.globalWriteEvent != nil || q.owner == nil || q.executable == nil || q.executable.project == nil || q.owner.checker == nil || q.owner.program != q.executable.project.program || q.owner.generation == nil || q.owner.generation != q.executable.project.activeGeneration || symbol == nil || global == nil || symbol != global || mode != (accessorSet|accessorNoGet) || !q.liveStagedMemberSource(b, get, read) || !candidate.runtimeUnknown || candidate.operation != q.protectedMember || !sameOperationRequest(candidate.request, b.request) || candidate.cut != q.relativeInputCut(get.operation) {
		return func() {}, false
	}
	if global != q.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil) || symbol != q.owner.checker.GetSymbolAtLocation(candidate.origin) {
		return func() {}, false
	}
	event := &sourceStagedGlobalWriteEvent{issuer: q, owner: q.owner, get: get, read: read, symbol: symbol, global: global, candidate: candidate, mode: mode, generation: q.owner.generation}
	event.self = event
	b.globalWriteEvent = event
	return func() {
		if b.globalWriteEvent == event {
			b.globalWriteEvent = nil
		}
		event.self = nil
		event.issuer = nil
		event.owner = nil
		event.get = nil
		event.read = nil
	}, true
}

// An absent event preserves the generic runtime-unknown path. A supplied invalid
// event refuses registration rather than falling back to a weaker description.
func (work *callableEffectWork) describeStagedGlobalWrite(facts []callableFacts, q *sourceValueQuery, parent sourceStagedOperationRequest, candidate sourceStagedMemberCandidate) (*sourceStagedGlobalWrite, bool) {
	if q == nil {
		return nil, false
	}
	b := q.stagedMember
	if b == nil || b.globalWriteEvent == nil {
		return nil, true
	}
	event := b.globalWriteEvent
	caller, known := work.memberNodes[parent.consumer]
	if !known || caller < 0 || caller >= len(facts) || q.executable == nil || q.executable.project == nil || q.owner == nil || q.owner.checker == nil || event.self != event || event.issuer != q || event.owner != q.owner || event.generation != work.operationGeneration || event.generation != q.owner.generation || q.owner.program != q.executable.project.program || event.generation != q.executable.project.activeGeneration || event.symbol == nil || event.global == nil || event.symbol != event.global || event.mode != (accessorSet|accessorNoGet) || !q.liveStagedMemberSource(b, event.get, event.read) || !b.publishing || b.current == nil || !sameStagedMemberCandidate(*b.current, candidate) || !sameStagedMemberCandidate(event.candidate, candidate) || !sameOperationRequest(parent, b.request) || candidate.cut != q.relativeInputCut(event.get.operation) {
		return nil, false
	}
	if event.global != q.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil) || event.symbol != q.owner.checker.GetSymbolAtLocation(candidate.origin) {
		return nil, false
	}
	publisher := q.executable.pendingMemberPublishers[parent.consumer]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile != q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) {
		return nil, false
	}
	return &sourceStagedGlobalWrite{operation: candidate.operation, origin: candidate.origin, mode: event.mode, cut: candidate.cut, generation: event.generation}, true
}

func sameStagedGlobalWrite(a, b *sourceStagedGlobalWrite) bool {
	return a == b || a != nil && b != nil && *a == *b
}
func cloneStagedGlobalWrite(p *sourceStagedGlobalWrite) *sourceStagedGlobalWrite {
	if p == nil {
		return nil
	}
	copy := *p
	return &copy
}

func validStagedGlobalWriteRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	if s == nil || s.globalWrite == nil || s.hasFreshTarget != nil || s.targetSource != nil || s.writeEffects || s.protocolSource != nil || s.coverage != nil || s.call != nil || s.getEffects != nil || s.moduleExcluded != nil || len(s.values) != 0 {
		return false
	}
	p := s.globalWrite
	if p.generation == nil || p.generation != s.generation || p.mode != (accessorSet|accessorNoGet) || p.operation != s.candidate.operation || p.operation != s.parent.producer.operation || p.origin != s.candidate.origin || p.cut != s.candidate.cut || !s.candidate.runtimeUnknown || !ast.IsIdentifier(p.origin) || (!ast.IsElementAccessExpression(p.operation) && !ast.IsPropertyAccessExpression(p.operation)) {
		return false
	}
	// Reuse the existing exact member candidate/parent factory validation. This
	// temporary baseline is never registered, adopted or published.
	source := *s
	source.globalWrite = nil
	baseline := recipe
	baseline.memberSource = &source
	baseline.delta = sourceStagedOperationDelta{extracted: true, residuals: []sourceStagedOperationResidual{{operation: s.parent.producer.operation}}}
	if !validStagedMemberRecipe(baseline) || recipe.delta.extracted || len(recipe.delta.effects) != 1 || operationDeltaSize(recipe.delta) != 1 {
		return false
	}
	effect := recipe.delta.effects[0]
	return validOperationEnvironmentEffect(effect) && effect.relativeCoercion == nil && effect.Environment == "unknown" && effect.Description == "external global property write" && effect.Opaque && !effect.provenanceIncomplete
}

func (work *callableEffectWork) recordStagedGlobalWrite(facts []callableFacts, q *sourceValueQuery, key sourceStagedOperationKey) bool {
	recipe := work.operationRecipes[key]
	if !validStagedGlobalWriteRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration {
		return false
	}
	description, valid := work.describeStagedGlobalWrite(facts, q, recipe.memberSource.parent, recipe.memberSource.candidate)
	if !valid || description == nil || !sameStagedGlobalWrite(description, recipe.memberSource.globalWrite) {
		return false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[key] = work.operationGeneration
	if id, adopted := work.operationIDs[key]; adopted {
		work.publishStagedGlobalWrite(id)
	}
	return true
}
func (work *callableEffectWork) publishStagedGlobalWrite(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if state.invalid || !validStagedGlobalWriteRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[state.key] != work.operationGeneration {
		return false
	}
	delta := cloneOperationDelta(recipe.delta)
	delta.extracted = true
	state.memberCoverageObserved = true
	return work.publishOperation(id, delta)
}
func (work *callableEffectWork) currentStagedGlobalWrite(recipe sourceStagedOperationRecipe) bool {
	if !validStagedGlobalWriteRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	registered := work.operationRecipes[recipe.key]
	if !validStagedGlobalWriteRecipe(registered) || !sameStagedMemberSource(registered.memberSource, recipe.memberSource) || !operationDeltaPrefix(registered.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, registered.delta) {
		return false
	}
	id := work.operationIDs[recipe.key]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	return !state.invalid && state.dependenciesRegistered && state.revision != 0 && state.delta.extracted && state.memberCoverageObserved && operationDeltaPrefix(state.delta, recipe.delta) && operationDeltaPrefix(recipe.delta, state.delta)
}
