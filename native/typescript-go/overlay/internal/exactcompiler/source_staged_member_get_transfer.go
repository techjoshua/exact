package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// transferStagedMemberGetEffects yields the actual conditional standard Get to
// a source consumer after candidate discovery and C publication. The supplied
// branch is synchronous source metadata, never selected output. Each consumer
// must authenticate its own phase and retain all required alternatives.
func (q *sourceValueQuery) transferStagedMemberGetEffects(origin *ast.Node, projection []string, name string, mode accessorTraversal, standard *sourceValue, get *sourceGetInputs, cut *sourceMemberWriterReadCut, result *accessorCandidates) bool {
	b := q.stagedMember
	if !q.liveStagedMemberSource(b, get, cut) || b.transferGet == nil || b.transferringGet || b.coverage == nil || b.coverage.origin != origin || standard == nil || standard.native == nil || mode != accessorAcquire {
		return false
	}
	if !q.publishStagedMemberDisposition(get, cut, false) || !q.liveStagedMemberSource(b, get, cut) {
		return false
	}
	observation := q.relativeInputCut(get.operation)
	b.transferringGet, b.transferStandard = true, standard
	defer func() { b.transferringGet, b.transferStandard = false, nil }()
	accepted := b.transferGet(get, origin, projection, name, mode, standard)
	if !accepted || !b.transferringGet || b.transferStandard != standard || !q.liveStagedMemberSource(b, get, cut) || q.relativeInputCut(get.operation) != observation {
		return false
	}
	b.transferredGet = get
	b.transferredCut = observation
	result.valueIncomplete = true // No value or exclusive-category output is transferred.
	return true
}

// takeStagedMemberGetTransfer ends only this original native Get's stronger
// fallback. The marker cannot survive its query loan, another Get or generation.
func (q *sourceValueQuery) takeStagedMemberGetTransfer(get *sourceGetInputs) bool {
	b := q.stagedMember
	if b == nil || b.issuer != q || b.owner != q.owner || q.owner == nil || b.generation != q.owner.generation || b.transferredGet != get || get == nil || b.request.consumer != q.effectOwner || q.relativeInputCut(get.operation) != b.transferredCut || !q.dependenciesOnly || q.inputs != nil || q.operation != nil {
		return false
	}
	b.transferredGet = nil
	b.transferredCut = sourceRelativeCut{}
	return true
}
