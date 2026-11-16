package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedFreezeProjection describes an actually requested SOURCE reading.
// It has no currentness, APPLIED or original-Get authority and survives cloning
// only as a description. Preparation keeps its distinct acquisition protocol.
type sourceStagedFreezeProjection struct {
	parent, reading sourceStagedOperationRequest
	physical        sourceRelativeCut
	purpose         sourceCallResultPurpose
}

// sourceStagedFreezeProjectionLoan is synchronous SOURCE transport only. It is
// never stored in a recipe; generic value conversion rejects its ownership tag.
// The exact original member loan revokes it when that Get traversal ends.
type sourceStagedFreezeProjectionLoan struct {
	query       *sourceValueQuery
	member      *sourceStagedMemberBorrow
	get         *sourceGetInputs
	read        *sourceMemberWriterReadCut
	work        *callableEffectWork
	epoch       *sourceStagedOperationEpoch
	generation  *projectGeneration
	description sourceStagedFreezeProjection
	semantic    sourceRelativeCut
}

func sameFreezeProjection(a, b sourceStagedFreezeProjection) bool {
	return sameOperationRequest(a.parent, b.parent) && sameOperationRequest(a.reading, b.reading) && a.physical == b.physical && a.purpose == b.purpose
}
func validFreezeProjection(s *sourceStagedCallResultSource, p sourceStagedFreezeProjection) bool {
	if s == nil || !s.nativeCall || p.purpose != resultSourceProjection || !validStagedMemberParent(p.parent) || p.parent.consumer != s.request.consumer || p.reading.consumer != p.parent.consumer || p.reading.producer != s.request.producer {
		return false
	}
	for i, r := range s.readings {
		if sameOperationRequest(r, p.reading) && s.readCuts[i] == p.physical {
			return true
		}
	}
	return false
}

// originalFreezeProjection selects the exact reading already issued by the
// original callback. Published native parents preserve a preselection C reading;
// selecting a different parent/cut or merely finding another DATA read fails.
func (work *callableEffectWork) originalFreezeProjection(q *sourceValueQuery, call *ast.Node) (sourceStagedFreezeProjection, bool) {
	var none sourceStagedFreezeProjection
	b := q.stagedMember
	if b == nil || b.getPreparation != nil || b.projectingReturn != call || !q.liveStagedMemberSource(b, b.get, b.read) || b.generation != work.operationGeneration || q.relativeInputCut(b.get.operation) != b.observation {
		return none, false
	}
	caller := enclosingCallableNode(call)
	if caller == nil {
		caller = sourceStagedModuleOwner(call)
	}
	s := work.operationRecipes[stagedResultSourceRequest(call, caller, nil).producer].callResult
	if s == nil {
		return none, false
	}
	edge := fmt.Sprintf("%s:call-return:%d:read:%d:%d", b.request.edge, call.Pos(), b.observation.operation.Pos(), b.observation.operation.End())
	for i, r := range s.readings {
		if r.consumer != b.request.consumer || r.edge != edge || s.readCuts[i] != b.observation {
			continue
		}
		expected := b.request.producer
		if r.reading != expected {
			native := q.stagedNativeGet
			root := work.operationRecipes[b.request.producer].nativeGet
			if native == nil || native.issuer != q || native.sourceWork != work || native.sourceEpoch != work.operationEpoch || root == nil || !sameOperationRequest(root.request, b.request) || r.reading != nativeRootDebtRequest(root, "callee-get").producer {
				return none, false
			}
		}
		p := sourceStagedFreezeProjection{parent: b.request, reading: r, physical: b.observation, purpose: resultSourceProjection}
		return p, validFreezeProjection(s, p)
	}
	return none, false
}

// retainFreezeProjection records genuine k1 intent before result extraction.
// It adds no DATA child, observation stamp or receipt to a sealed producer.
func (work *callableEffectWork) retainFreezeProjection(facts []callableFacts, q *sourceValueQuery, call *ast.Node) bool {
	p, ok := work.originalFreezeProjection(q, call)
	if !ok {
		return false
	}
	recipe := work.operationRecipes[p.reading.producer]
	for _, old := range recipe.callResult.projections {
		if sameFreezeProjection(old, p) {
			work.enrollNativeProjectionGet(facts, p.reading.producer)
			return true
		}
	}
	if recipe.delta.extracted {
		return false
	}
	s := cloneStagedCallResultSource(recipe.callResult)
	s.projections = append(s.projections, p)
	recipe.callResult = s
	if !work.attachOperationSource(facts, recipe) {
		return false
	}
	work.enrollNativeProjectionGet(facts, p.reading.producer)
	return true
}

func (l *sourceStagedFreezeProjectionLoan) live(q *sourceValueQuery) bool {
	if l == nil || q == nil || l.query != q || l.work == nil || l.work.operationEpoch != l.epoch || l.work.operationGeneration != l.generation || q.owner == nil || q.owner.generation != l.generation || q.stagedMember != l.member || !q.liveStagedMemberSource(l.member, l.get, l.read) || l.member.observation != l.description.physical || q.relativeInputCut(l.get.operation) != l.semantic {
		return false
	}
	recipe := l.work.operationRecipes[l.description.reading.producer]
	if !validStagedCallResultRecipe(recipe) || recipe.callResult.generation != l.generation {
		return false
	}
	for _, p := range recipe.callResult.projections {
		if sameFreezeProjection(p, l.description) {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) freezeProjectionReading(q *sourceValueQuery, call *ast.Node) *sourceStagedFreezeReturnRead {
	p, ok := work.originalFreezeProjection(q, call)
	if !ok {
		return nil
	}
	recipe := work.operationRecipes[p.reading.producer]
	present := false
	for _, old := range recipe.callResult.projections {
		present = present || sameFreezeProjection(old, p)
	}
	if !present {
		return nil
	}
	source := work.currentFreezeReturnSource(recipe, p.parent.consumer, p.reading)
	if source == nil {
		return nil
	}
	loan := &sourceStagedFreezeProjectionLoan{query: q, member: q.stagedMember, get: q.stagedMember.get, read: q.stagedMember.read, work: work, epoch: work.operationEpoch, generation: work.operationGeneration, description: p, semantic: q.relativeInputCut(q.stagedMember.get.operation)}
	if !loan.live(q) {
		return nil
	}
	return &sourceStagedFreezeReturnRead{source: source, projection: loan}
}
