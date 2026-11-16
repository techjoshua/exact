package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The canonical source index is real. The scoped borrow and mapper below isolate
// discovery transport, not source admission, field absence or effects closure.
// The exposed passive function stays eligible after private non-entry filtering.
func withStagedFieldDiscoverySource(t *testing.T, check func(*sourceValueQuery, *sourceGetInputs, sourceStagedFieldSourceRequests, sourceStagedFieldDiscoverySource)) {
	t.Helper()
	const source = `declare const foreign:{slot?:number};
declare function mutate():void;
const descriptor={value:()=>document.title};
descriptor.value=()=>window.name;
foreign.slot=1;
export function dormant(){mutate();foreign.slot;foreign.slot=2;Object.defineProperty(Object.prototype,'enumerable',{get(){return window.name}})}
export function invoke(){return Object.defineProperty({},'run',descriptor)}`
	// Transport owns a checked source/index and a live scoped borrow; native
	// algorithm closure remains with its separate strict Session controls.
	const id = "/virtual/callee-write-inventory.ts"
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}, id, map[string]string{id: source})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), generation.sourceFile) {
		if converted := projectDiagnostic(diagnostic); hasErrorDiagnostic([]Diagnostic{converted}) {
			t.Fatal(converted)
		}
	}
	file := generation.sourceFile
	var call *ast.Node
	walkNode(file.AsNode(), func(node *ast.Node) bool {
		if ast.IsCallExpression(node) && enclosingCallableNode(node) != nil && enclosingCallableNode(node).Name() != nil && callableNameText(enclosingCallableNode(node).Name()) == "invoke" {
			call = node
		}
		return true
	})
	if call == nil {
		t.Fatal("missing original invoke source callee")
	}
	owner := newExecutableBodyOwner(project, generation.checker)
	query := newSourceDependencyQuery(call, generation.checker, owner, enclosingCallableNode(call))
	var receiver *ast.Node
	walkNode(file.AsNode(), func(node *ast.Node) bool {
		if ast.IsVariableDeclaration(node) && callableNameText(node.Name()) == "descriptor" {
			receiver = node.Initializer()
		}
		return true
	})
	if receiver == nil {
		t.Fatal("missing source receiver")
	}
	borrow := &sourceStagedFieldGetBorrow{issuer: query, owner: query.owner, generation: query.owner.generation, operation: call, receiver: receiver, field: "value", cut: query.relativeInputCut(call)}
	prior := query.stagedFieldGet
	query.stagedFieldGet = borrow
	defer func() { borrow.issuer = nil; query.stagedFieldGet = prior }()
	get := &sourceGetInputs{operation: call, receiver: sourceValue{node: receiver}, propertyKey: "value", stagedEffects: borrow}
	parent := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: query.effectOwner, operation: call, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: receiver, field: "value"}}, consumer: query.effectOwner, edge: "discovery-control", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
	requests, valid := fieldSourceRequests(parent)
	if !valid {
		t.Fatal("finite source role description refused")
	}
	check(query, get, requests, sourceStagedFieldDiscoverySource{source: file, index: query.owner.index(file)})
}

func TestStagedFieldSourceDiscoveryOriginalIndex(t *testing.T) {
	withStagedFieldDiscoverySource(t, func(query *sourceValueQuery, get *sourceGetInputs, requests sourceStagedFieldSourceRequests, source sourceStagedFieldDiscoverySource) {
		mapped := map[sourceStagedOperationKey][]*ast.Node{}
		passive := false
		mapper := func(request sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool) {
			previous := mapped[request.producer]
			if len(previous) > 0 && previous[len(previous)-1].Pos() > operation.Pos() {
				t.Fatal("source ordering lost")
			}
			if source.index.normalOccurrences[operation].region != region {
				t.Fatal("original deferred region lost")
			}
			passive = passive || region != nil
			mapped[request.producer] = append(previous, operation)
			// A required child may still be pending when local discovery is done.
			return sourceStagedOperationDelta{required: []sourceStagedOperationRequest{request}, extracted: true}, true
		}
		publications := 0
		if !emitStagedFieldSourceDiscovery(query, get, requests, []sourceStagedFieldDiscoverySource{source}, true, mapper, func(request sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool {
			publications++
			if !delta.extracted || len(delta.required) != len(mapped[request.producer]) || len(delta.residuals) != 0 || len(delta.exposures) != 0 || len(delta.invoked) != 0 {
				t.Fatal("discovery invented contributions or inherited child readiness")
			}
			return true
		}) {
			t.Fatal("source discovery publication refused")
		}
		if publications != 2 || len(mapped[requests.ownWriters.producer]) != 3 || len(mapped[requests.prototype.producer]) == 0 || !passive {
			t.Fatal("known/dynamic writers or passive prototype operations missing")
		}
	})
}

func TestStagedFieldSourceDiscoveryPendingPrefixes(t *testing.T) {
	for _, mode := range []string{"unmapped", "partial", "incomplete-index", "unprepared-import", "missing-population", "missing-sources", "unsupported-channel", "unsupported-relative", "publisher-refusal"} {
		t.Run(mode, func(t *testing.T) {
			withStagedFieldDiscoverySource(t, func(query *sourceValueQuery, get *sourceGetInputs, requests sourceStagedFieldSourceRequests, source sourceStagedFieldDiscoverySource) {
				complete := mode != "missing-sources"
				if mode == "incomplete-index" {
					source.index.incomplete = true
				}
				if mode == "unprepared-import" {
					source.index.runtimeImports = []*ast.Node{get.operation}
					source.index.importsPrepared = false
				}
				if mode == "missing-population" {
					source.index.normalOccurrences = nil
				}
				issued := sourceStagedOperationDelta{extracted: true, effects: []EnvironmentEffectSource{{Environment: "browser", Description: "mapper-issued", Path: []string{"original"}}}, residuals: []sourceStagedOperationResidual{{operation: get.operation}}, invoked: []sourceStagedOperationInvocation{{declaration: query.effectOwner, operation: get.operation}}}
				publications := 0
				known := 0
				mapped := make(map[sourceStagedOperationKey]int)
				accepted := emitStagedFieldSourceDiscovery(query, get, requests, []sourceStagedFieldDiscoverySource{source}, complete, func(request sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool) {
					prefix := issued
					mapped[request.producer]++
					if mode == "partial" {
						prefix.extracted = false
					}
					if mode == "unsupported-channel" {
						prefix.exposures = []sourceStagedOperationAlternative{{}}
					}
					if mode == "unsupported-relative" {
						prefix.relative = []sourceRelativeInvokedInput{{}}
					}
					if mode == "unmapped" && mapped[request.producer] == 1 {
						prefix.effects = []EnvironmentEffectSource{{Environment: "browser", Description: "unauthorized"}}
						return prefix, false
					}
					return prefix, true
				}, func(request sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool {
					publications++
					if mode != "publisher-refusal" && delta.extracted {
						t.Fatal("missing source relationship became local closure")
					}
					if len(delta.exposures) != 0 || len(delta.relative) != 0 {
						t.Fatal("unsupported atoms escaped discovery domain")
					}
					if len(delta.effects) != len(delta.residuals) || len(delta.effects) != len(delta.invoked) {
						t.Fatal("mapper-issued prefix lost")
					}
					known += len(delta.effects)
					for _, effect := range delta.effects {
						if effect.Description != "mapper-issued" || effect.Path[0] != "original" {
							t.Fatal("effect payload changed")
						}
					}
					if len(delta.effects) > 0 {
						issued.effects[0].Path[0] = "changed"
						if delta.effects[0].Path[0] != "original" {
							t.Fatal("published prefix aliases borrowed atoms")
						}
						issued.effects[0].Path[0] = "original"
					}
					return mode != "publisher-refusal" || !sameOperationRequest(request, requests.ownWriters)
				})
				if accepted == (mode == "publisher-refusal") || publications != 2 {
					t.Fatal("publication status or independent role lost")
				}
				if mode != "missing-population" && known == 0 {
					t.Fatal("pending discovery discarded known contributions")
				}
			})
		})
	}
}

func TestStagedFieldSourceDiscoveryIssuerAndEmptyPopulation(t *testing.T) {
	withStagedFieldDiscoverySource(t, func(query *sourceValueQuery, get *sourceGetInputs, requests sourceStagedFieldSourceRequests, source sourceStagedFieldDiscoverySource) {
		calls := 0
		mapper := func(sourceStagedOperationRequest, *ast.Node, *ast.Node) (sourceStagedOperationDelta, bool) {
			calls++
			return sourceStagedOperationDelta{extracted: true}, true
		}
		publish := func(sourceStagedOperationRequest, sourceStagedOperationDelta) bool { calls++; return true }
		copied := *query
		if emitStagedFieldSourceDiscovery(&copied, get, requests, []sourceStagedFieldDiscoverySource{source}, true, mapper, publish) || calls != 0 {
			t.Fatal("copied query inherited discovery issuer")
		}
		wrong := requests
		wrong.prototype.edge = "other-edge"
		if emitStagedFieldSourceDiscovery(query, get, wrong, []sourceStagedFieldDiscoverySource{source}, true, mapper, publish) || calls != 0 {
			t.Fatal("uncorrelated role requests admitted")
		}
		if !emitStagedFieldSourceDiscovery(query, get, requests, nil, true, mapper, func(_ sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool {
			if delta.extracted || operationDeltaSize(delta) != 0 {
				t.Fatal("missing population became empty coverage")
			}
			return true
		}) {
			t.Fatal("pending empty prefix refused")
		}
		if calls != 0 {
			t.Fatal("missing population fabricated source operations")
		}
	})
}

// Ordinary Calls and property Gets have source effects even when they do not
// appear in the narrower mutation/open-call/hazard populations. Refusing their
// mapping must leave discovery pending, rather than accepting an empty domain.
func TestStagedFieldSourceDiscoveryOrdinaryMembersRemainRequired(t *testing.T) {
	for _, target := range []string{"ambient call", "property Get"} {
		t.Run(target, func(t *testing.T) {
			withStagedFieldDiscoverySource(t, func(query *sourceValueQuery, get *sourceGetInputs, requests sourceStagedFieldSourceRequests, source sourceStagedFieldDiscoverySource) {
				var blocked *ast.Node
				walkNode(source.source.AsNode(), func(node *ast.Node) bool {
					if target == "ambient call" && ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "mutate" {
						blocked = node
					}
					if target == "property Get" && ast.IsPropertyAccessExpression(node) && node.Parent != nil && ast.IsExpressionStatement(node.Parent) && node.AsPropertyAccessExpression().Name().Text() == "slot" {
						blocked = node
					}
					return true
				})
				if blocked == nil {
					t.Fatal("missing ordinary source member control")
				}
				for _, population := range source.index.operationRegions {
					for _, narrower := range [][]*ast.Node{population.thenOperations, population.openCalls, population.hazards} {
						for _, operation := range narrower {
							if operation == blocked {
								t.Fatal("control already belongs to the narrower discovery domain")
							}
						}
					}
				}
				visited, publications := 0, 0
				accepted := emitStagedFieldSourceDiscovery(query, get, requests, []sourceStagedFieldDiscoverySource{source}, true, func(request sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool) {
					if sameOperationRequest(request, requests.prototype) && operation == blocked {
						visited++
						if region == nil || region != source.index.normalOccurrences[operation].region {
							t.Fatal("original passive member region lost")
						}
						return sourceStagedOperationDelta{}, false
					}
					return sourceStagedOperationDelta{extracted: true}, true
				}, func(request sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool {
					publications++
					if sameOperationRequest(request, requests.prototype) && delta.extracted {
						t.Fatal("unadmitted ordinary source member became local coverage")
					}
					if operationDeltaSize(delta) != 0 {
						t.Fatal("discovery invented an unknown or semantic contribution")
					}
					return true
				})
				if !accepted || publications != 2 || visited != 1 {
					t.Fatalf("ordinary member visits=%d publications=%d accepted=%t", visited, publications, accepted)
				}
			})
		})
	}
}
