package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// This detached variant owns only the selected intrinsic target-Get arm. It
// carries neither the target Effects receipt nor a normal prototype identity.
type sourceOriginalGetNativeTarget struct {
	root     sourceStagedOperationRequest
	method   *ast.Node
	kind     sourceNativeKind
	standard sourceDemandStandardPremises
}

type sourceOriginalGetTargetBorrow struct {
	issuer     *sourceValueQuery
	owner      *sourceValueOwner
	executable *executableBodyOwner
	work       *callableEffectWork
	epoch      *sourceStagedOperationEpoch
	source     *sourceStagedNativeGetSource
	request    sourceStagedOperationRequest
	target     *ast.Node
	observed   *sourceOriginalGetMutationSource
	live       bool
}

func sameOriginalGetNativeTarget(a, b *sourceOriginalGetNativeTarget) bool {
	return a == b || a != nil && b != nil && sameOperationRequest(a.root, b.root) && a.method == b.method && a.kind == b.kind && a.standard == b.standard
}

func validOriginalGetNativeTarget(s *sourceOriginalGetMutationSource) bool {
	n := s.nativeTarget
	if s.record != nil || s.ownMember != nil || n == nil || !reflectiveNative(n.kind) || n.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(n.method)) || n.standard.root == nil || n.standard.prototype == nil || s.standard != n.standard.prototype || s.origin != n.standard.root || !s.intrinsicPrototype || s.property != "prototype" || s.mode != accessorAcquire || s.operation == nil || !ast.IsPropertyAccessExpression(s.operation) || !ast.IsIdentifier(s.operation.Expression()) || s.queryCut != (sourceRelativeCut{operation: s.operation, reading: s.operation}) || s.coverage.producer.operation != nil || len(s.population) != 0 {
		return false
	}
	call := n.root.producer.operation
	if call == nil || !ast.IsCallExpression(call) || n.root.producer.selector != (sourceStagedOperationSelector{}) || n.root.producer.kind != relativeDemandEffects || n.root.inputs != nil || n.root.consumer != n.root.producer.declaration || n.root.use != call || n.root.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 3 || actuals[0] != s.operation {
		return false
	}
	expected := n.root
	expected.producer.selector = sourceStagedOperationSelector{occurrence: s.operation, field: "eager-target"}
	expected.edge += ":eager-target"
	return sameOperationRequest(s.request, expected)
}

func (work *callableEffectWork) validOriginalGetMutationReading(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	return recipe.memberSource != nil && recipe.memberSource.originalGetMutation != nil && validOriginalGetMutationRecipe(recipe) && recipe.memberSource.generation == work.operationGeneration && sameOperationRequest(recipe.memberSource.request, request)
}

// beginOriginalTargetGetMutation lends an output publisher to the ORIGINAL
// already-owned target query. No query/current receipt is created or replayed.
func (work *callableEffectWork) beginOriginalTargetGetMutation(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner, q *sourceValueQuery) (*sourceOriginalGetTargetBorrow, func()) {
	none := func() {}
	if q == nil || q.owner == nil || q.executable != owner || owner == nil || owner.values == nil || q.owner.program != owner.values.program || q.owner.checker != owner.checker || q.owner.generation != work.operationGeneration || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || !q.probingStagedTarget || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil, none
	}
	state := &work.operations[id.index]
	source := work.operationRecipes[state.key].nativeGet
	if source == nil || state.key != nativeEagerTargetRequest(source).producer || !state.targetSourceRequested || source.request.consumer != q.effectOwner {
		return nil, none
	}
	parent := nativeEagerTargetRequest(source)
	target := parent.producer.selector.occurrence
	if target == nil || q.reading != target || !ast.IsPropertyAccessExpression(target) || !ast.IsIdentifier(target.Expression()) {
		return nil, none
	}
	actor, known := work.memberNodes[q.effectOwner]
	publisher := owner.pendingMemberPublishers[q.effectOwner]
	if !known || actor < 0 || actor >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[actor] || owner.values.program.GetSourceFile(facts[actor].sourceFile.FileName()) != facts[actor].sourceFile {
		return nil, none
	}
	previous := q.originalGetMutationTarget
	lease := &sourceOriginalGetTargetBorrow{issuer: q, owner: q.owner, executable: owner, work: work, epoch: work.operationEpoch, source: source, request: parent, target: target, live: true}
	q.originalGetMutationTarget = lease
	return lease, func() {
		lease.live = false
		if q.originalGetMutationTarget == lease {
			q.originalGetMutationTarget = previous
		}
		lease.issuer = nil
		lease.owner = nil
		lease.executable = nil
		lease.work = nil
		lease.source = nil
		lease.observed = nil
	}
}

func (work *callableEffectWork) observeOriginalTargetGetMutation(q *sourceValueQuery, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, origin *ast.Node, projection []string, name string, standard *sourceValue) bool {
	if q == nil {
		return false
	}
	b := q.originalGetMutationTarget
	if b == nil || !b.live || b.work != work || b.epoch != work.operationEpoch || b.issuer != q || b.owner != q.owner || b.executable != q.executable || q.originalGetMutationTarget != b || q.inputs != nil || q.operation != nil || !q.dependenciesOnly || !q.probingStagedTarget || get == nil || cut == nil || get.operation != b.target || cut.operation != get.operation || cut.use != q.reading || q.reading != b.target || mode != accessorAcquire || get.hasOnly || len(projection) != 1 || projection[0] != "prototype" || name != "" || standard == nil || standard.native == nil || standard.native.kind != sourceNativeObjectPrototype || standard.node != b.source.standard.prototype || get.receiver.native == nil || get.receiver.native.kind != sourceNativeObjectConstructor || get.receiver.native.acquired != b.target.Expression() || origin != b.source.standard.root {
		return false
	}
	s := &sourceOriginalGetMutationSource{operation: get.operation, nativeTarget: &sourceOriginalGetNativeTarget{root: b.source.request, method: b.source.method, kind: b.source.kind, standard: b.source.standard}, mode: mode, intrinsicPrototype: true, receiverKind: get.receiver.native.kind, request: b.request, queryCut: q.relativeInputCut(get.operation), origin: origin, property: "prototype", standard: standard.node, kind: standard.native.kind, generation: q.owner.generation, pending: standard.native.referencesIncomplete}
	if !validOriginalGetMutationSource(s) {
		return false
	}
	if b.observed != nil && !sameOriginalGetMutationSource(b.observed, s) {
		return false
	}
	b.observed = s
	return true
}

func (work *callableEffectWork) finishOriginalTargetGetMutation(facts []callableFacts, b *sourceOriginalGetTargetBorrow, result *accessorCandidates) bool {
	if b == nil || !b.live || b.work != work || b.epoch != work.operationEpoch || b.issuer == nil || b.issuer.originalGetMutationTarget != b || b.owner != b.issuer.owner || b.source == nil || b.observed == nil || result == nil {
		return false
	}
	s := cloneOriginalGetMutationSource(b.observed)
	// A data-slot ARM cannot erase another actual compiler/body channel. This
	// conservative frontier remains pending until that channel owns its output.
	s.pending = s.pending || result.opaque || result.valueIncomplete || result.ownOperation || !nativeMemberGetChannelsRepresented(result) || len(result.environmentEffects)+len(result.ownedLocalCauses)+len(result.producers) != 0
	// The original Object-entry descriptor metadata is independently owned by
	// this exact target query. TOP is not an executed callback or a mutation
	// output; its original root/eager requirements remain. Unknown metadata is
	// still compiler debt. No original candidate flag/record is edited.
	for _, metadata := range result.nativeDescriptorEffects {
		if metadata.kind != sourceStandardObjectEntry || metadata.acquired != b.target.Expression() {
			s.pending = true
		}
	}
	if !work.registerOriginalGetMutationSource(facts, s) {
		return false
	}
	work.bindOriginalGetMutationInterests(facts, b.issuer, nil, nil, s)
	return true
}

func (work *callableEffectWork) originalGetTargetMutationCurrent(s *sourceOriginalGetMutationSource) bool {
	if !validOriginalGetNativeTarget(s) {
		return false
	}
	n := s.nativeTarget
	root := work.operationRecipes[n.root.producer].nativeGet
	selected := work.operationRecipes[s.request.producer].nativeGet
	// Standard target premises belong to the selected eager-target role. The
	// aggregate Call root separately owns callee currentness and closure debt.
	if root == nil || selected == nil || root.method != n.method || root.kind != n.kind || !sameOperationRequest(root.request, n.root) || !sameNativeGetSource(selected, root) || !sameOperationRequest(nativeEagerTargetRequest(selected), s.request) || selected.standard != n.standard || !work.nativeEffectsGetCurrent(root) {
		return false
	}
	id, known := work.operationIDs[s.request.producer]
	if !known || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	proof := work.operations[id.index].nativeTarget
	return proof != nil && proof.generation == work.operationGeneration && validStagedNativeTargetEffects(*proof, selected)
}
