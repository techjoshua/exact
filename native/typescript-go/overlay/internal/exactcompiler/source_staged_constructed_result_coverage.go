package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedConstructedResultCoverageLookup lends the original conditional standard
// DATA branch to a demanded result's source inventory. It neither selects the
// method exclusively nor grants the optional no-input-invocation method law.
func (q *sourceValueQuery) stagedConstructedResultCoverageLookup(get *sourceGetInputs, standard *sourceValue, mode accessorTraversal) bool {
	if q == nil || q.owner == nil || q.executable == nil || mode != accessorAcquire || get == nil || standard == nil || standard.native == nil {
		return false
	}
	b := q.stagedConstructedMember
	if b == nil || !b.live || b.owner != q || b.generation != q.owner.generation || b.resultCoverage == nil || !b.coveragePrepared || b.source == nil || b.issued != get || b.finishing || q.stagedMember == nil || get.operation != b.request.producer.operation || q.protectedMember != b.get || q.relativeInputCut(get.operation) != b.cut || !q.liveStagedMemberSource(q.stagedMember, get, q.stagedMember.read) {
		return false
	}
	source, receiver := b.source, get.receiver
	if !validConstructedMemberSource(source) || !sameOperationRequest(source.request, b.request) || source.cut != b.cut || source.get != b.get || source.construction.site != b.site || receiver.node != b.site || receiver.native == nil || receiver.native.kind != sourceNativeWeakMapSourceInstance || receiver.native.acquired != b.site || receiver.bound != nil || receiver.capture != nil || receiver.normal != nil || receiver.instance != nil || len(receiver.path) != 0 {
		return false
	}
	_, name := accessorReceiver(b.get)
	origin, seed, known := q.standardConstructionMemberSeed(receiver, name)
	return known && origin == b.site && seed.node == source.method && seed.node == standard.node && seed.native != nil && seed.native.kind == source.kind && seed.native.kind == standard.native.kind && seed.native.acquired == standard.native.acquired && q.stagedMember.coverage != nil && q.stagedMember.coverage.origin == origin && q.stagedMember.coverage.cut == b.cut
}

// observeStagedConstructedResultCoverage runs at the end of that same original
// Get traversal. Its ordinary coverage publisher retains every discovered child
// and decides extraction; incomplete or unknown sources cannot be paid here.
func (q *sourceValueQuery) observeStagedConstructedResultCoverage(origin *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, standard *sourceValue, result *accessorCandidates) {
	if result == nil || !q.stagedConstructedResultCoverageLookup(get, standard, mode) || !q.liveStagedMemberSource(q.stagedMember, get, cut) {
		return
	}
	b, member := q.stagedConstructedMember, q.stagedMember
	if member.coverage.origin != origin || !q.publishStagedMemberDisposition(get, cut, true) || !q.liveStagedMemberSource(member, get, cut) || !q.stagedConstructedResultCoverageLookup(get, standard, mode) {
		return
	}
	accepted := func() bool {
		b.finishing = true
		defer func() { b.finishing = false }()
		return b.resultCoverage(q, *b.source, result)
	}()
	if !accepted || !q.liveStagedMemberSource(member, get, cut) || !q.stagedConstructedResultCoverageLookup(get, standard, mode) {
		return
	}
	b.coverageTransferred = true
	result.valueIncomplete = true // Source coverage never supplies a method value.
}
