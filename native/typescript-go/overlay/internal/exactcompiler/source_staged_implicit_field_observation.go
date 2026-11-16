package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// These graph-local observations rendezvous the original primitive event and
// final C in either order. They are not an empty implicit-write set, a prefix
// law, ordinary value or publication capability. New work/clones start empty.
type sourceStagedImplicitFieldObservation struct {
	has, get                     *sourceStagedImplicitProtocolPhase
	ownSources, prototypeSources *sourceStagedImplicitFieldSources
}

type sourceStagedImplicitProtocolPhase struct {
	enumeration *sourceStagedMapEnumerationTerminal // Detached post-loop data; never a publisher capability.
	self        *sourceStagedImplicitProtocolPhase
	request     sourceStagedOperationRequest
	cut         sourceRelativeCut
	receiver    *ast.Node
	generation  *projectGeneration
	epoch       *sourceStagedOperationEpoch
	law         sourceStagedFieldEntryLaw
	mapLaw      sourceStagedMapEntryLaw
	coverage    sourceStagedOperationRequest
	required    []sourceStagedOperationRequest
}

// implicitFieldOwner accepts only the existing live function descriptor-field
// service under its current selected source and publisher. It issues no query,
// source demand, adoption, receipt revision or normal activation.
func (work *callableEffectWork) implicitFieldObservationState(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs) (*sourceStagedOperationState, bool) {
	if q == nil || !q.liveStagedFieldGet(get) || q.executable == nil || q.owner == nil || q.executable.values == nil || !q.stagedFieldWorkOwner(q.executable) || q.owner.generation != work.operationGeneration || q.executable.project == nil || q.executable.project.activeGeneration != work.operationGeneration {
		return nil, false
	}
	b := get.stagedEffects
	if b.request.consumer == nil || b.observation == nil || runtimeModuleEvaluation(b.request.consumer) || b.request.consumer != q.effectOwner || !ast.IsFunctionLike(b.request.consumer) {
		return nil, false
	}
	id := work.operationIDs[b.request.producer]
	consumer, known := work.memberNodes[b.request.consumer]
	if !known || consumer < 0 || consumer >= len(facts) || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil, false
	}
	publisher := q.executable.pendingMemberPublishers[b.request.consumer]
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	source := recipe.nativeGet
	if publisher == nil || !publisher.live || publisher.fact != &facts[consumer] || facts[consumer].sourceFile == nil || q.owner.program.GetSourceFile(facts[consumer].sourceFile.FileName()) != facts[consumer].sourceFile || !validNativeGetRecipe(recipe) || state.invalid || !state.dependenciesRegistered || state.effectsDemand == nil || !sameOperationRequest(state.effectsDemand.request, b.request) || source == nil || source.kind != sourceNativeObjectDefineProperties || source.descriptorEntry == nil || source.descriptorEntry.entry.member == nil || !sameOperationRequest(nativeDescriptorFieldRequest(source, b.field), b.request) {
		return nil, false
	}
	if state.implicitField == nil {
		state.implicitField = &sourceStagedImplicitFieldObservation{}
	}
	return state, true
}

func (work *callableEffectWork) implicitFieldOwner(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs) (*sourceStagedImplicitProtocolPhase, bool) {
	state, owned := work.implicitFieldObservationState(facts, q, get)
	if !owned {
		return nil, false
	}
	b := get.stagedEffects
	var slot **sourceStagedImplicitProtocolPhase
	switch b.observation.phase {
	case stagedFieldObservationHas:
		slot = &state.implicitField.has
	case stagedFieldObservationGet:
		slot = &state.implicitField.get
	default:
		return nil, false
	}
	if *slot == nil {
		p := &sourceStagedImplicitProtocolPhase{request: b.request, cut: b.cut, receiver: get.receiver.node, generation: work.operationGeneration, epoch: work.operationEpoch}
		p.self = p
		*slot = p
	}
	p := *slot
	return p, p.self == p && p.generation == work.operationGeneration && p.epoch == work.operationEpoch && p.cut == b.cut && p.receiver == get.receiver.node && sameOperationRequest(p.request, b.request)
}

// Only the intrinsic Has/own-DATA/default-intrinsic Get callback may supply this
// pointwise positive. Other MAY alternatives and every dependency remain debt.
func (work *callableEffectWork) recordImplicitFieldPrimitive(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, law sourceStagedFieldEntryLaw) {
	if q == nil || !q.liveStagedFieldGet(get) {
		return
	}
	b := get.stagedEffects
	e := b.noUserPublication
	if e == nil || e.get != get || e.law != law || b.observation == nil {
		return
	}
	if b.observation.phase == stagedFieldObservationHas {
		if !get.hasOnly || law != stagedFieldOrdinaryHasNoUserEntry {
			return
		}
	} else if b.observation.phase != stagedFieldObservationGet || get.hasOnly || law != stagedFieldOwnDataNoUserEntry && law != stagedFieldIntrinsicGetNoUserEntry {
		return
	}
	p, owned := work.implicitFieldOwner(facts, q, get)
	if owned {
		p.law = law
	}
}

// Final C membership is recorded only after its normal publisher accepted the
// actual source observation. A prefix/description cannot manufacture this half.
func (work *callableEffectWork) recordImplicitFieldCoverage(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs) {
	if q == nil || q.stagedMember == nil || !q.liveStagedFieldMemberSource(get) || !q.liveStagedMemberSource(q.stagedMember, get, q.stagedMember.read) {
		return
	}
	c := q.stagedMember.coverage
	if c == nil || !c.extracted || c.generation != work.operationGeneration || work.memberCoverageObserved[c.request.producer] != work.operationGeneration {
		return
	}
	p, owned := work.implicitFieldOwner(facts, q, get)
	if !owned || c.cut != p.cut {
		return
	}
	if p.coverage.producer.operation != nil && (!sameOperationRequest(p.coverage, c.request) || !operationPrefix(p.required, c.required, sameOperationRequest) || !operationPrefix(c.required, p.required, sameOperationRequest)) {
		return
	}
	p.coverage = c.request
	p.required = cloneOperationDelta(sourceStagedOperationDelta{required: c.required}).required
}
