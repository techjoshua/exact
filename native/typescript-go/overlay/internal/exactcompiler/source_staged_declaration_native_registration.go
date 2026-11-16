package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Only declarationWriterScopeNativeSource issues this synchronous capability.
// It owns no Get/C or normal input authority and is never copied to a recipe.
// Both declaration registrar/consumer intervals revoke it on every return.
type sourceStagedDeclarationNativeRegistration struct {
	self          *sourceStagedDeclarationNativeRegistration
	query         *sourceValueQuery
	request       *sourceWriterInputRequest
	native        *sourceStagedNativeGetBorrow
	work          *callableEffectWork
	owner         *executableBodyOwner
	publisher     *sourcePendingMemberPublisher
	consumer, use *ast.Node
	original      [4]*ast.Node
	parent        sourceStagedOperationRequest
	epoch         *sourceStagedOperationEpoch
	generation    *projectGeneration
}

func (c *sourceStagedDeclarationNativeRegistration) live(work *callableEffectWork, facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest) bool {
	if work == nil || c == nil || c.self != c || c.work != work || c.query != q || c.request != r || q == nil || r == nil || q.executable != c.owner || r.consumer != c.consumer || r.use != c.use || c.native == nil || q.stagedNativeGet != c.native || c.publisher == nil || r.member == nil || r.member.publisher != c.publisher || c.epoch != work.operationEpoch || c.generation != work.operationGeneration || c.original != r.original || c.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) {
		return false
	}
	n := c.native
	return n.issuer == q && n.sourceWork == work && n.sourceEpoch == c.epoch && n.owner == q.owner && n.generation == c.generation && n.call != nil && n.call != r.call && n.getRequest.use == n.call && sameOperationRequest(n.getRequest, c.parent) && work.declarationWriterScopePublisher(facts, q.executable, c.publisher, q, r)
}

func (parent sourceStagedDeclarationScopeParent) revokeRegistration() {
	c := parent.registration
	if c == nil {
		return
	}
	c.self, c.query, c.request, c.native, c.work, c.owner, c.publisher, c.consumer, c.use = nil, nil, nil, nil, nil, nil, nil, nil, nil
	c.original, c.parent, c.epoch, c.generation = [4]*ast.Node{}, sourceStagedOperationRequest{}, nil, nil
}

// The same request-only wrappers describe native input scope and descriptor
// callee scope. Inventory is eligibility only; actual selected/current source
// and exact delivery remain with their existing producer and consumer laws.
func (work *callableEffectWork) declarationNativeWriterScopeRecipe(facts []callableFacts, q *sourceValueQuery, r *sourceWriterInputRequest, c *sourceStagedDeclarationNativeRegistration) (sourceStagedOperationRecipe, bool) {
	if !c.live(work, facts, q, r) {
		return sourceStagedOperationRecipe{}, false
	}
	if recipe, described := work.describeNativeWriterScopeRequestInContext(facts, q, r, false, c); described {
		return recipe, true
	}
	if recipe, described := work.describeNativeWriterScopeRequestInContext(facts, q, r, true, c); described {
		return recipe, true
	}
	recipe, _, described := work.writerMethodSourceRecipe(facts, q, r)
	return recipe, described
}

// Pending ownership is compiler continuation only. An already paid ACK or a
// source description cannot replace an actual parent/source task owner.
func (work *callableEffectWork) declarationWriterScopePending(parent sourceStagedDeclarationScopeParent, id sourceStagedOperationID) bool {
	if !work.writerSourceTaskOwned(id) {
		return false
	}
	if parent.preparation != nil {
		return work.getPreparationTaskOwned(parent.id)
	}
	if parent.issuer == nil && work.nativeEffectsTaskSource(parent.id) == nil {
		return work.nativeScopeGetTaskOwned(parent.id)
	}
	return true
}
