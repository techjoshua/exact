package exactcompiler

import (
	"sort"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedFieldDiscoveryOperation is a borrowed source occurrence. Region
// identifies passive deferred ownership, never permission to execute that body.
// Source ordering is inventory order, not proof of runtime evaluation order.
type sourceStagedFieldDiscoveryOperation struct {
	operation, region *ast.Node
}

// emitStagedFieldSourceDiscovery visits existing source indexes under the live
// field issuer. Only mapper-issued contributions enter the published deltas.
// Missing population/import/mapping leaves local extraction pending, preserving
// known prefixes. Empty discovery supplies no baseline, absence or normal proof.
// True means both publications were accepted, not dependency closure or ACK.
// Neither callbacks nor borrowed indexes/maps survive this synchronous traversal.
func emitStagedFieldSourceDiscovery(query *sourceValueQuery, get *sourceGetInputs, requests sourceStagedFieldSourceRequests, sources []sourceStagedFieldDiscoverySource, sourcesComplete bool, mapIndexedSource sourceStagedFieldSourceMapper, publish sourceStagedFieldSourcePublisher) bool {
	if !query.liveStagedFieldGet(get) || mapIndexedSource == nil || publish == nil {
		return false
	}
	parent := requests.ownWriters
	if parent.producer.kind != relativeDemandEffects {
		return false // Callable projection has its own source/value emitters.
	}
	parent.producer.selector.occurrence = get.receiver.node
	parent.producer.selector.field = get.propertyKey
	expected, valid := fieldSourceRequests(parent)
	if !valid || !sameOperationRequest(expected.ownWriters, requests.ownWriters) || !sameOperationRequest(expected.prototype, requests.prototype) || parent.producer.operation != get.operation || parent.producer.declaration != query.effectOwner || parent.consumer != query.effectOwner || parent.inputs != nil {
		return false
	}
	accepted := true
	for _, request := range []sourceStagedOperationRequest{requests.ownWriters, requests.prototype} {
		delta := sourceStagedOperationDelta{}
		ready, live := visitStagedFieldDiscoveryOperations(query, get, sameOperationRequest(request, requests.ownWriters), sources, sourcesComplete, func(operation, region *ast.Node) bool {
			contribution, admitted := mapIndexedSource(request, operation, region)
			if !admitted {
				return false // An unauthorized prefix contributes no atoms.
			}
			prefix := cloneOperationDelta(sourceStagedOperationDelta{required: contribution.required, residuals: contribution.residuals, invoked: contribution.invoked, effects: contribution.effects})
			delta.required = append(delta.required, prefix.required...)
			delta.residuals = append(delta.residuals, prefix.residuals...)
			delta.invoked = append(delta.invoked, prefix.invoked...)
			delta.effects = append(delta.effects, prefix.effects...)
			// Local mapping readiness is distinct from required child closure.
			return contribution.extracted && len(contribution.exposures) == 0 && len(contribution.relative) == 0
		})
		if !live || !query.liveStagedFieldGet(get) {
			return false
		}
		delta.extracted = ready
		if !publish(request, delta) {
			accepted = false
		}
	}
	return accepted
}

// visitStagedFieldDiscoveryOperations shares only source traversal. Ready means
// the supplied local population and every visited mapping are represented, not
// child closure, baseline authorization, absence or an acquired field result.
// Deferred regions remain passive. No borrowed source index enters the graph.
func visitStagedFieldDiscoveryOperations(query *sourceValueQuery, get *sourceGetInputs, ownWriters bool, sources []sourceStagedFieldDiscoverySource, sourcesComplete bool, visit func(operation, region *ast.Node) bool) (ready, live bool) {
	if !query.liveStagedFieldGet(get) {
		return false, false
	}
	if visit == nil {
		return false, true
	}
	ready = sourcesComplete && len(sources) != 0
	originalSource := false
	for _, source := range sources {
		if !query.liveStagedFieldGet(get) {
			return false, false
		}
		if source.source == nil || query.owner.program == nil || query.owner.program.GetSourceFile(source.source.FileName()) != source.source {
			ready = false
			continue
		}
		originalSource = originalSource || source.source == ast.GetSourceFileOfNode(get.receiver.node)
		index := source.index
		if index.incomplete || index.normalOccurrences == nil || index.memberOrigins == nil || index.operationRegions == nil || len(index.runtimeImports) != 0 && !index.importsPrepared {
			ready = false
		}
		var operations []sourceStagedFieldDiscoveryOperation
		var populated bool
		if ownWriters {
			operations, populated = stagedFieldWriterDiscovery(index, get.receiver.node)
		} else {
			operations, populated = stagedFieldPrototypeDiscovery(index)
		}
		ready = ready && populated
		sort.SliceStable(operations, func(i, j int) bool {
			if operations[i].operation.Pos() != operations[j].operation.Pos() {
				return operations[i].operation.Pos() < operations[j].operation.Pos()
			}
			return operations[i].operation.End() > operations[j].operation.End()
		})
		seen := make(map[sourceStagedFieldDiscoveryOperation]bool)
		for _, operation := range operations {
			if seen[operation] {
				continue
			}
			seen[operation] = true
			if !query.liveStagedFieldGet(get) {
				return false, false
			}
			if ast.GetSourceFileOfNode(operation.operation) != source.source {
				ready = false
				continue
			}
			// Effects and Value share source eligibility, not output authority.
			// Unknown proofs retain the original mapper obligation and baseline.
			eligibility := accessorCandidates{}
			if query.privateDeferredDefinitionExcluded(operation.operation, &eligibility) {
				continue
			}
			represented := visit(operation.operation, operation.region)
			ready = ready && represented
		}
	}
	if !query.liveStagedFieldGet(get) {
		return false, false
	}
	return ready && originalSource, true
}

// stagedFieldWriterDiscovery reuses the member owner's known-origin and dynamic
// assignment populations. Region identity comes from the existing syntax index,
// not a normal frame or a guessed enclosing runtime activation.
func stagedFieldWriterDiscovery(index sourceValueIndex, receiver *ast.Node) ([]sourceStagedFieldDiscoveryOperation, bool) {
	var operations []sourceStagedFieldDiscoveryOperation
	populated := true
	for _, assignments := range [][]sourceValueAssignment{index.memberOrigins[receiver], index.dynamicMembers} {
		for _, assignment := range assignments {
			if assignment.left == nil || assignment.right == nil || assignment.right.Parent == nil {
				populated = false
				continue
			}
			operation := assignment.right.Parent
			occurrence := index.normalOccurrences[operation]
			if occurrence == nil {
				populated = false
				continue
			}
			operations = append(operations, sourceStagedFieldDiscoveryOperation{operation, occurrence.region})
		}
	}
	return operations, populated
}

// stagedFieldPrototypeDiscovery preserves the property owner's original region
// populations. Index membership is a source candidate only. The mapper decides
// relevance, conditional reachability and passive body relationships.
func stagedFieldPrototypeDiscovery(index sourceValueIndex) ([]sourceStagedFieldDiscoveryOperation, bool) {
	var operations []sourceStagedFieldDiscoveryOperation
	populated := true
	for region, population := range index.operationRegions {
		if population == nil || population.declaration != region {
			populated = false
			continue
		}
		// Ordinary Calls and property Gets can be absent from the narrower
		// mutation/open-call/hazard populations, but still own source effects.
		for _, candidates := range [][]*ast.Node{population.members, population.thenOperations, population.openCalls, population.hazards} {
			for _, operation := range candidates {
				occurrence := index.normalOccurrences[operation]
				if operation == nil || occurrence == nil || occurrence.region != region {
					populated = false
					continue
				}
				operations = append(operations, sourceStagedFieldDiscoveryOperation{operation, region})
			}
		}
	}
	return operations, populated
}
