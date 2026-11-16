package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// emitStagedFieldValueProjection collects only original-owner authorized Value
// contributions. Effects readiness and empty indexes provide no Value baseline.
// Missing source populations, refused prefixes and partial mappings keep local
// extraction pending while independent authorized contributions survive. Required
// children retain their separate closure. Neither callbacks nor indexes survive.
// True means both source publications were accepted, never field readiness, a
// normal result, property absence or permission to invoke an exposed callable.
func emitStagedFieldValueProjection(query *sourceValueQuery, get *sourceGetInputs, requests sourceStagedFieldSourceRequests, sources []sourceStagedFieldDiscoverySource, sourcesComplete bool, baseline sourceStagedFieldValueBaseline, mapIndexedSource sourceStagedFieldSourceMapper, publish sourceStagedFieldSourcePublisher) bool {
	if !query.liveStagedFieldGet(get) || baseline == nil || mapIndexedSource == nil || publish == nil {
		return false
	}
	parent := requests.ownWriters
	if parent.producer.kind != relativeDemandDirectExposure {
		return false
	}
	parent.producer.selector.occurrence = get.receiver.node
	parent.producer.selector.field = get.propertyKey
	expected, valid := fieldSourceRequests(parent)
	if !valid || !sameOperationRequest(expected.ownWriters, requests.ownWriters) || !sameOperationRequest(expected.prototype, requests.prototype) || parent.producer.operation != get.operation || parent.producer.declaration != query.effectOwner || parent.consumer != query.effectOwner || parent.inputs != nil {
		return false
	}
	accepted := true
	for _, request := range []sourceStagedOperationRequest{requests.ownWriters, requests.prototype} {
		if !query.liveStagedFieldGet(get) {
			return false
		}
		delta := sourceStagedOperationDelta{}
		// Prefix authorization, local mapping readiness and required-child
		// closure are distinct. Unsupported channels cannot pay Value work.
		appendPrefix := func(prefix sourceStagedOperationDelta, admitted bool) bool {
			if !admitted {
				return false
			}
			owned := cloneOperationDelta(sourceStagedOperationDelta{exposures: prefix.exposures, required: prefix.required, residuals: prefix.residuals})
			delta.exposures = append(delta.exposures, owned.exposures...)
			delta.required = append(delta.required, owned.required...)
			delta.residuals = append(delta.residuals, owned.residuals...)
			return prefix.extracted && len(prefix.relative) == 0 && len(prefix.invoked) == 0 && len(prefix.effects) == 0
		}
		base, admitted := baseline(request)
		baselineReady := appendPrefix(base, admitted)
		ready, live := visitStagedFieldDiscoveryOperations(query, get, sameOperationRequest(request, requests.ownWriters), sources, sourcesComplete, func(operation, region *ast.Node) bool {
			prefix, admitted := mapIndexedSource(request, operation, region)
			return appendPrefix(prefix, admitted)
		})
		if !live || !query.liveStagedFieldGet(get) {
			return false
		}
		delta.extracted = baselineReady && ready
		if !publish(request, delta) {
			accepted = false
		}
	}
	return accepted
}
