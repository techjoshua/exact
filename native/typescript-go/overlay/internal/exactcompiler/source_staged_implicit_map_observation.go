package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// implicitMapOwner issues only graph-local observation storage under the real
// function map/entry source owner. Source inventory, primitive events and final C
// stay distinct; none of them alone reports a complete empty implicit-write set.
func (work *callableEffectWork) implicitMapOwner(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs) (*sourceStagedImplicitProtocolPhase, bool) {
	if q == nil || q.executable == nil || q.owner == nil || !q.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) || !q.stagedFieldWorkOwner(q.executable) || q.owner.generation != work.operationGeneration || q.executable.project == nil || q.executable.project.activeGeneration != work.operationGeneration {
		return nil, false
	}
	b := q.stagedMap
	s := b.source
	if s == nil || s.kind != sourceNativeObjectDefineProperties || s.request.consumer == nil || !ast.IsFunctionLike(s.request.consumer) || s.request.consumer != q.effectOwner || runtimeModuleEvaluation(q.effectOwner) {
		return nil, false
	}
	request := b.request
	if b.reading {
		if b.currentRead == nil {
			return nil, false
		}
		request = b.currentRead.request
	}
	id := work.operationIDs[request.producer]
	consumer, known := work.memberNodes[request.consumer]
	if !known || consumer < 0 || consumer >= len(facts) || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil, false
	}
	publisher := q.executable.pendingMemberPublishers[request.consumer]
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if publisher == nil || !publisher.live || publisher.fact != &facts[consumer] || facts[consumer].sourceFile == nil || q.owner.program.GetSourceFile(facts[consumer].sourceFile.FileName()) != facts[consumer].sourceFile || state.invalid || !state.dependenciesRegistered {
		return nil, false
	}
	if b.reading {
		if !validStagedMapEntryRecipe(recipe) || !sameOperationRequest(recipe.mapEntry.request, request) {
			return nil, false
		}
	} else if !validStagedMapProtocolRecipe(recipe) || !sameOperationRequest(recipe.mapProtocol.request, request) {
		return nil, false
	}
	if state.implicitMap == nil {
		p := &sourceStagedImplicitProtocolPhase{request: request, cut: b.cut, receiver: b.receiver.expression, generation: work.operationGeneration, epoch: work.operationEpoch}
		p.self = p
		state.implicitMap = p
	}
	p := state.implicitMap
	return p, p.self == p && p.generation == work.operationGeneration && p.epoch == work.operationEpoch && p.cut == b.cut && p.receiver == b.receiver.expression && sameOperationRequest(p.request, request)
}

// The original semantic OwnKeys or accepted entry-DATA terminal is the only
// source of this event half. A description, entriesRegistered or localX is not.
func (work *callableEffectWork) recordImplicitMapPrimitive(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, group *ast.Node) {
	if q == nil || q.stagedMap == nil {
		return
	}
	b := q.stagedMap
	e := b.noUserPublication
	if e == nil || e.get != get || e.group != group || group != b.receiver.expression {
		return
	}
	if e.law == stagedMapOrdinaryOwnKeysNoUserEntry {
		if b.reading || b.currentRead != nil || !q.traceModeKnown || q.traceMode != accessorEnumerate|accessorNoGet {
			return
		}
	} else if e.law != stagedMapOwnDataGetNoUserEntry || !b.reading || b.currentRead == nil || q.traceModeKnown || b.currentRead.getter != nil || b.currentRead.entry.getter != nil {
		return
	}
	p, owned := work.implicitMapOwner(facts, q, get)
	if owned {
		p.mapLaw = e.law
	}
}

// The existing final member publication owns this independent half. Required
// membership is retained exactly; a source-request prefix cannot supply it.
func (work *callableEffectWork) recordImplicitMapCoverage(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs) {
	if q == nil || q.stagedMember == nil || !q.liveStagedMemberSource(q.stagedMember, q.stagedMember.get, q.stagedMember.read) {
		return
	}
	c := q.stagedMember.coverage
	if c == nil || !c.extracted || c.generation != work.operationGeneration || work.memberCoverageObserved[c.request.producer] != work.operationGeneration {
		return
	}
	p, owned := work.implicitMapOwner(facts, q, get)
	if !owned || c.cut != p.cut {
		return
	}
	if p.coverage.producer.operation != nil && (!sameOperationRequest(p.coverage, c.request) || !operationPrefix(p.required, c.required, sameOperationRequest) || !operationPrefix(c.required, p.required, sameOperationRequest)) {
		return
	}
	p.coverage = c.request
	p.required = cloneOperationDelta(sourceStagedOperationDelta{required: c.required}).required
}
