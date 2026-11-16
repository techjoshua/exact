package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Reuse the real canonical index fixture. Issuer/request metadata and callback
// prefixes isolate Value transport only, not semantic baseline authorization.
func withStagedFieldValueProjection(t *testing.T, check func(*sourceValueQuery, *sourceGetInputs, sourceStagedFieldSourceRequests, sourceStagedFieldDiscoverySource)) {
	t.Helper()
	withStagedFieldDiscoverySource(t, func(query *sourceValueQuery, get *sourceGetInputs, effects sourceStagedFieldSourceRequests, source sourceStagedFieldDiscoverySource) {
		parent, valid := fieldSourceParent(effects.ownWriters)
		if !valid {
			t.Fatal("missing original field description")
		}
		parent.producer.kind = relativeDemandDirectExposure
		requests, valid := fieldSourceRequests(parent)
		if !valid {
			t.Fatal("missing DirectExposure source roles")
		}
		check(query, get, requests, source)
	})
}

func TestStagedFieldValueProjectionAuthorizedSourcePrefixes(t *testing.T) {
	withStagedFieldValueProjection(t, func(query *sourceValueQuery, get *sourceGetInputs, requests sourceStagedFieldSourceRequests, source sourceStagedFieldDiscoverySource) {
		baselinePrefix := sourceStagedOperationDelta{extracted: true, exposures: []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: get.receiver.node, producer: get.operation, projection: []string{"baseline"}}}}}
		mappedPrefix := sourceStagedOperationDelta{extracted: true, exposures: []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: get.receiver.node, producer: get.operation, projection: []string{"mapped"}}}}}
		last := make(map[sourceStagedOperationKey]int)
		counts := make(map[sourceStagedOperationKey]int)
		publications := make(map[sourceStagedOperationKey]sourceStagedOperationDelta)
		baselines, passive := 0, false
		accepted := emitStagedFieldValueProjection(query, get, requests, []sourceStagedFieldDiscoverySource{source}, true, func(request sourceStagedOperationRequest) (sourceStagedOperationDelta, bool) {
			baselines++
			return baselinePrefix, true
		}, func(request sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool) {
			if request.producer.kind != relativeDemandDirectExposure || operation.Pos() < last[request.producer] || source.index.normalOccurrences[operation].region != region {
				t.Fatal("Value role, source order or original region lost")
			}
			last[request.producer] = operation.Pos()
			counts[request.producer]++
			passive = passive || region != nil
			prefix := mappedPrefix
			// Child readiness is deliberately not supplied by the mapper. Its
			// required source request cannot prevent local discovery extraction.
			prefix.required = []sourceStagedOperationRequest{request}
			prefix.residuals = []sourceStagedOperationResidual{{operation: operation}}
			return prefix, true
		}, func(request sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool {
			if !delta.extracted || len(delta.exposures) != 1+counts[request.producer] || len(delta.required) != counts[request.producer] || len(delta.residuals) != counts[request.producer] || len(delta.relative)+len(delta.invoked)+len(delta.effects) != 0 {
				t.Fatal("Value prefix or independent required children lost")
			}
			publications[request.producer] = delta
			return true
		})
		if !accepted || baselines != 2 || len(publications) != 2 || !passive || counts[requests.ownWriters.producer] != 3 {
			t.Fatal("incomplete original writer/prototype discovery")
		}
		baselinePrefix.exposures[0].endpoint.projection[0] = "changed"
		mappedPrefix.exposures[0].endpoint.projection[0] = "changed"
		for _, delta := range publications {
			if delta.exposures[0].endpoint.projection[0] != "baseline" || delta.exposures[1].endpoint.projection[0] != "mapped" {
				t.Fatal("published Value endpoints alias borrowed prefixes")
			}
		}
	})
}

func TestStagedFieldValueProjectionPendingAndUnauthorized(t *testing.T) {
	for _, mode := range []string{"baseline-refused", "baseline-partial", "mapper-refused", "mapper-partial", "effects", "invoked", "relative", "incomplete-index", "imports", "missing-population", "missing-sources", "empty-sources", "empty-index-no-baseline", "source-identity", "publisher-refused"} {
		t.Run(mode, func(t *testing.T) {
			withStagedFieldValueProjection(t, func(query *sourceValueQuery, get *sourceGetInputs, requests sourceStagedFieldSourceRequests, source sourceStagedFieldDiscoverySource) {
				sources := []sourceStagedFieldDiscoverySource{source}
				complete := mode != "missing-sources"
				switch mode {
				case "incomplete-index":
					sources[0].index.incomplete = true
				case "imports":
					sources[0].index.runtimeImports = []*ast.Node{get.operation}
					sources[0].index.importsPrepared = false
				case "missing-population":
					sources[0].index.normalOccurrences = nil
				case "empty-sources":
					sources = nil
				case "empty-index-no-baseline":
					// Even a caller-supplied complete empty population cannot
					// authorize an original Value baseline on the emitter's behalf.
					sources[0].index.memberOrigins = map[*ast.Node][]sourceValueAssignment{}
					sources[0].index.dynamicMembers = nil
					sources[0].index.operationRegions = map[*ast.Node]*sourceMemberOperationRegion{}
				case "source-identity":
					sources[0].source = nil
				}
				exposure := func(label string) sourceStagedOperationDelta {
					return sourceStagedOperationDelta{extracted: true, exposures: []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: get.receiver.node, projection: []string{label}}}}}
				}
				counts := make(map[sourceStagedOperationKey]int)
				publications, retained := 0, 0
				accepted := emitStagedFieldValueProjection(query, get, requests, sources, complete, func(sourceStagedOperationRequest) (sourceStagedOperationDelta, bool) {
					prefix := exposure("baseline")
					if mode == "baseline-refused" || mode == "empty-index-no-baseline" {
						return exposure("unauthorized"), false
					}
					prefix.extracted = mode != "baseline-partial"
					return prefix, true
				}, func(request sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool) {
					counts[request.producer]++
					prefix := exposure("mapped")
					if mode == "mapper-refused" && counts[request.producer] == 1 {
						return exposure("unauthorized"), false
					}
					prefix.extracted = mode != "mapper-partial"
					switch mode {
					case "effects":
						prefix.effects = []EnvironmentEffectSource{{Environment: "browser", Description: "not Value coverage"}}
					case "invoked":
						prefix.invoked = []sourceStagedOperationInvocation{{operation: get.operation}}
					case "relative":
						prefix.relative = []sourceRelativeInvokedInput{{}}
					}
					return prefix, true
				}, func(request sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool {
					publications++
					if mode != "publisher-refused" && delta.extracted {
						t.Fatal("missing Value baseline/source/mapping became local readiness")
					}
					if len(delta.effects)+len(delta.invoked)+len(delta.relative) != 0 {
						t.Fatal("Effects/body work paid a Value obligation")
					}
					for _, alternative := range delta.exposures {
						if alternative.endpoint.projection[0] == "unauthorized" {
							t.Fatal("unauthorized prefix escaped")
						}
					}
					retained += len(delta.exposures)
					return mode != "publisher-refused" || !sameOperationRequest(request, requests.ownWriters)
				})
				if accepted == (mode == "publisher-refused") || publications != 2 || retained == 0 && mode != "empty-index-no-baseline" {
					t.Fatal("independent admitted Value prefixes or publication status lost")
				}
			})
		})
	}
}

func TestStagedFieldValueProjectionLoanAndModeBoundaries(t *testing.T) {
	withStagedFieldValueProjection(t, func(query *sourceValueQuery, get *sourceGetInputs, requests sourceStagedFieldSourceRequests, source sourceStagedFieldDiscoverySource) {
		calls := 0
		baseline := func(sourceStagedOperationRequest) (sourceStagedOperationDelta, bool) {
			calls++
			return sourceStagedOperationDelta{extracted: true}, true
		}
		mapper := func(sourceStagedOperationRequest, *ast.Node, *ast.Node) (sourceStagedOperationDelta, bool) {
			calls++
			return sourceStagedOperationDelta{extracted: true}, true
		}
		publisher := func(sourceStagedOperationRequest, sourceStagedOperationDelta) bool { calls++; return true }
		copied := *query
		if emitStagedFieldValueProjection(&copied, get, requests, []sourceStagedFieldDiscoverySource{source}, true, baseline, mapper, publisher) || calls != 0 {
			t.Fatal("copied query inherited Value loan")
		}
		wrong := requests
		wrong.prototype.cut.reading = query.effectOwner
		if emitStagedFieldValueProjection(query, get, wrong, []sourceStagedFieldDiscoverySource{source}, true, baseline, mapper, publisher) || calls != 0 {
			t.Fatal("mismatched graph requests acquired Value coverage")
		}
		parent, _ := fieldSourceParent(requests.ownWriters)
		parent.producer.kind = relativeDemandEffects
		effects, _ := fieldSourceRequests(parent)
		if emitStagedFieldValueProjection(query, get, effects, []sourceStagedFieldDiscoverySource{source}, true, baseline, mapper, publisher) || calls != 0 {
			t.Fatal("Effects role entered Value emitter")
		}
		if emitStagedFieldSourceDiscovery(query, get, requests, []sourceStagedFieldDiscoverySource{source}, true, mapper, publisher) || calls != 0 {
			t.Fatal("Value role entered Effects emitter")
		}
		if emitStagedFieldValueProjection(query, get, requests, []sourceStagedFieldDiscoverySource{source}, true, nil, mapper, publisher) || calls != 0 {
			t.Fatal("missing baseline owner acquired coverage")
		}
		if emitStagedFieldValueProjection(query, get, requests, []sourceStagedFieldDiscoverySource{source}, true, func(sourceStagedOperationRequest) (sourceStagedOperationDelta, bool) {
			query.stagedFieldGet = nil
			return sourceStagedOperationDelta{extracted: true}, true
		}, mapper, publisher) || calls != 0 {
			t.Fatal("expired baseline loan reached mapping/publication")
		}
	})
}
