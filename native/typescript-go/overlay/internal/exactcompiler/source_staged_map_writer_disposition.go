package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// This receipt accounts for the original immediate map creation's private source
// uses after member traversal. It is not current property state, key population,
// enumerability, normal completion or permission to discard required RHS work.
type sourceStagedMapWriterDisposition struct {
	request    sourceStagedOperationRequest
	group      *ast.Node
	cut        sourceRelativeCut
	generation *projectGeneration
}

// The original selected literal owner lends this interval after its own-writer
// traversal. An alias needs a separate completed source-alternative producer.
// Matching metadata outside this live original traversal cannot publish.
func (query *sourceValueQuery) observeStagedMapWriterDisposition(group *ast.Node, get *sourceGetInputs, mode accessorTraversal) {
	if !query.liveStagedMapObservation(get, mode) || !query.traceModeKnown || query.traceMode != mode {
		return
	}
	borrow := query.stagedMap
	if borrow.writerCoverage == nil || borrow.writerPublication != nil || !borrow.observed || borrow.refused || group == nil || group != borrow.receiver.expression || !ast.IsObjectLiteralExpression(group) {
		return
	}
	receipt := &sourceStagedMapWriterDisposition{request: borrow.request, group: group, cut: borrow.cut, generation: borrow.generation}
	borrow.writerPublication = receipt
	defer func() {
		if borrow.writerPublication == receipt {
			borrow.writerPublication = nil
		}
	}()
	borrow.writerCoverage()
}

func (work *callableEffectWork) publishStagedMapWriterDisposition(facts []callableFacts, query *sourceValueQuery, source *sourceStagedNativeGetSource) bool {
	if query == nil || query.stagedMap == nil || source == nil || source.descriptorMap == nil {
		return false
	}
	borrow := query.stagedMap
	proof := borrow.writerPublication
	if proof == nil || !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) || !query.traceModeKnown || query.traceMode != accessorEnumerate|accessorNoGet || proof.generation != work.operationGeneration || proof.cut != borrow.cut || proof.group != borrow.receiver.expression || !sameOperationRequest(proof.request, source.descriptorMap.protocol) || !work.stagedMapSourceUsesCovered(source, proof.group, query.executable) {
		return false
	}
	request := stagedMapProtocolPhaseRequest(source, "own-writers")
	prior, found := work.operationRecipes[request.producer]
	if !found || prior.mapProtocol == nil || !sameOperationRequest(prior.mapProtocol.request, request) {
		return false
	}
	// Complete private-use accounting is independent of the original enum's
	// source interval. Both must be present, and every C/RHS child stays required.
	member := query.stagedMember
	coverage := stagedMemberCoverageRequest(source.request, proof.group, proof.cut)
	child := work.operationRecipes[coverage.producer]
	if member == nil || member.issuer != query || member.owner != query.owner || member.generation != work.operationGeneration || member.coverage == nil || !sameOperationRequest(member.request, source.request) || !sameOperationRequest(member.coverage.request, coverage) || !validStagedMemberCoverageRecipe(child) || work.memberCoverageObserved[coverage.producer] != work.operationGeneration {
		return false
	}
	required := false
	for _, candidate := range prior.delta.required {
		required = required || sameOperationRequest(candidate, coverage)
	}
	if !required {
		return false
	}
	next := *prior.mapProtocol
	detached := *proof
	next.writerSource = &detached
	prior.mapProtocol = &next
	prior.delta = cloneOperationDelta(prior.delta)
	prior.delta.extracted = true
	if !work.attachOperationSource(facts, prior) {
		return false
	}
	if id, adopted := work.operationIDs[request.producer]; adopted {
		work.operations[id.index].mapSourceObserved = true
	}
	plan, described := describeStagedMapInitialProtocol(source, detached)
	if described {
		for _, phase := range []struct {
			role    string
			covered bool
		}{{"own-keys", plan.keysAccounted}, {"enumerability", plan.enumerabilityAccounted}} {
			if !phase.covered {
				continue
			}
			key := stagedMapProtocolPhaseRequest(source, phase.role)
			child, registered := work.operationRecipes[key.producer]
			if !registered || child.mapProtocol == nil {
				return false
			}
			next := *child.mapProtocol
			next.writerSource = &detached
			next.keysAccounted = phase.role == "own-keys"
			next.enumerabilityAccounted = phase.role == "enumerability"
			child.mapProtocol = &next
			child.delta = cloneOperationDelta(child.delta)
			child.delta.extracted = true
			if !work.attachOperationSource(facts, child) {
				return false
			}
			if id, adopted := work.operationIDs[key.producer]; adopted {
				work.operations[id.index].mapSourceObserved = true
			}
		}
	}
	return true
}
