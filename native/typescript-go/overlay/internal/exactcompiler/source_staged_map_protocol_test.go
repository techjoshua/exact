package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The native map plan comes from original selected source admission. The
// subsequent scoped enumeration is independent of creating that adapter plan.
func withStagedMapProtocolSource(t *testing.T, source string, check func(*sourceValueQuery, *sourceStagedNativeGetSource)) {
	t.Helper()
	withStagedMapProtocolWorkSource(t, source, func(query *sourceValueQuery, selected *sourceStagedNativeGetSource, _ *callableEffectWork, _ []callableFacts) {
		check(query, selected)
	})
}

// Keep the original selected root, callee Get and source facts together when a
// control needs to consume their actual graph dependencies, not just a plan.
func withStagedMapProtocolWorkSource(t *testing.T, source string, check func(*sourceValueQuery, *sourceStagedNativeGetSource, *callableEffectWork, []callableFacts)) {
	t.Helper()
	withSourceCalleeWriteQueryStatus(t, source, func(previous *sourceValueQuery, last *ast.Node) {
		// This name selects fixture source only. The actual member owner below
		// still authenticates the selected standard alternative.
		var call *ast.Node
		walkNode(enclosingCallableNode(last), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && enclosingCallableNode(node) == enclosingCallableNode(last) && ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().AsPropertyAccessExpression().Name()) == "defineProperties" {
				if call != nil {
					t.Fatal("ambiguous fixture map occurrence")
				}
				call = node
			}
			return true
		})
		if call == nil {
			t.Fatal("original fixture map Call missing")
		}
		query := newSourceDependencyQuery(call, previous.owner.checker, previous.executable, enclosingCallableNode(call))
		defer query.publishDependencyStatistics()
		facts := installationSourceFacts(query)
		fact := &facts[installationFactIndex(t, facts, enclosingCallableNode(call))]
		graph, issued := sourceStagedOccurrenceRequest(fact, call, relativeDemandEffects, "map-protocol-source")
		if !issued {
			t.Fatal("original source occurrence missing")
		}
		work := callableEffectWork{extracting: -1}
		request := sourceStagedNativeRequest{algorithmKind: sourceNativeObjectDefineProperties, call: call, get: call.Expression(), request: graph}
		revoke, installed := query.beginStagedNativeGetSource(&work, facts, request, func(sourceStagedNativeSelection, func(sourceStagedNativeDescriptorPlan) bool) {})
		if !installed {
			t.Fatal("original selected source issuer refused")
		}
		defer revoke()
		query.receiverCandidates(call, nil)
		algorithm := graph.producer
		algorithm.selector = sourceStagedOperationSelector{occurrence: call.Expression(), field: "algorithm"}
		selected := work.operationRecipes[algorithm].nativeGet
		if selected == nil || selected.descriptorMap == nil {
			t.Fatal("actual selected source map plan missing")
		}
		check(query, selected, &work, facts)
	}, true)
}

func TestStagedMapProtocolOriginalEntries(t *testing.T) {
	for _, row := range []struct {
		name, source               string
		members, getters, unmapped int
	}{
		{"data and getter", `export function invoke(){return Object.defineProperties({},{run:{value:()=>document.title},get other(){window.name;return{value:1}}})}`, 2, 1, 0},
		{"empty remains pending", `export function invoke(){return Object.defineProperties({},{})}`, 0, 0, 0},
		{"known beside unmapped", `export function invoke(extras:PropertyDescriptorMap){const key='dynamic';return Object.defineProperties({},{known:{value:()=>document.title},...extras,[key]:{value:1},__proto__:{},'0':{value:1}})}`, 5, 0, 4},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedMapProtocolSource(t, row.source, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
				var entries []sourceStagedMapEntry
				revoke, installed := beginStagedMapProtocolSource(query, source, func(entry sourceStagedMapEntry) bool { entries = append(entries, entry); return true })
				if !installed {
					t.Fatal("source map borrow refused")
				}
				defer revoke()
				borrow := query.stagedMap
				get := borrow.get
				if len(entries) != 0 || borrow.observed {
					t.Fatal("installation eagerly enumerated map")
				}
				saved := borrow.publish
				if saved(sourceStagedMapEntry{request: borrow.request, receiver: borrow.receiver, cut: borrow.cut}) {
					t.Fatal("callback published outside original source traversal")
				}
				result := query.accessorsAtGet(source.descriptorMap.descriptors.expression, nil, "", accessorEnumerate|accessorNoGet, nil, nil, get)
				if !borrow.observed || !borrow.pending || len(entries) != 1+row.members || len(result.values) != 0 {
					t.Fatal("original source entries missing, map completed or normal output supplied")
				}
				if len(result.effects)+len(result.environmentEffects)+len(result.contextEffects)+len(result.fieldCalls)+len(result.normalCalls) != 0 {
					t.Fatal("enumeration recursively executed stored getter/callback")
				}
				getters, unmapped := 0, 0
				for index, entry := range entries {
					if !sameOperationRequest(entry.request, source.descriptorMap.protocol) || !sameOperationEndpoint(entry.receiver, source.descriptorMap.descriptors) || entry.cut != borrow.cut || entry.cut.use != nil || entry.receiver.cut != source.request.cut || entry.group != source.descriptorMap.descriptors.expression {
						t.Fatal("source alternative, graph receiver or live observation cut retargeted")
					}
					if index == 0 {
						if entry.member != nil || entry.ordinal != -1 || !entry.unmapped {
							t.Fatal("group observation became empty-map disposition")
						}
						continue
					}
					if entry.member == nil || entry.member.Parent != entry.group || entry.ordinal != index-1 {
						t.Fatal("original member/source ordinal lost")
					}
					if entry.getter != nil {
						getters++
						if !ast.IsGetAccessorDeclaration(entry.getter) || entry.descriptor.expression != nil {
							t.Fatal("getter body turned into acquired descriptor output")
						}
					}
					if entry.unmapped {
						if entry.key.expression != nil && entry.name != "__proto__" && ast.IsPropertyAssignment(entry.member) && entry.descriptor.expression != entry.member.AsPropertyAssignment().Initializer {
							t.Fatal("unrepresented key/order erased known descriptor source")
						}
						unmapped++
					}
				}
				if getters != row.getters || unmapped != row.unmapped {
					t.Fatal("known/unmapped/getter siblings lost")
				}
				if query.observeStagedMapObject(entries[0].group, sourceValue{node: entries[0].group}, get, accessorEnumerate|accessorNoGet) {
					t.Fatal("finished enumeration reused original source observation")
				}
				if query.liveStagedMapObservation(get, accessorAcquire) {
					t.Fatal("ordinary Get inherited map enumeration scope")
				}
				generation := borrow.generation
				borrow.generation = &projectGeneration{}
				if query.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) {
					t.Fatal("expired generation inherited map source scope")
				}
				borrow.generation = generation
				reading := query.reading
				query.reading = nil
				if query.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) {
					t.Fatal("changed observation cut inherited map source scope")
				}
				query.reading = reading
				copied := *get
				if query.liveStagedMapObservation(&copied, accessorEnumerate|accessorNoGet) {
					t.Fatal("copied Get inherited observation")
				}
				issuer := *query
				if issuer.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) {
					t.Fatal("copied query inherited issuer")
				}
				prior := query.stagedMap
				innerRevoke, installed := beginStagedMapProtocolSource(query, source, func(sourceStagedMapEntry) bool { return true })
				if !installed || query.stagedMap == prior {
					t.Fatal("nested borrow did not install distinct issuer")
				}
				innerRevoke()
				innerRevoke()
				if query.stagedMap != prior {
					t.Fatal("nested revoke did not restore exact prior borrow")
				}
				revoke()
				revoke()
				if query.stagedMap != nil || borrow.issuer != nil || borrow.get != nil || borrow.publish != nil || saved(entries[0]) {
					t.Fatal("revoked borrow or saved callback retained source authority")
				}
			})
		})
	}
}

func TestStagedMapProtocolPublicationRefusal(t *testing.T) {
	const source = `export function invoke(){return Object.defineProperties({},{known:{value:1},get later(){window.name;return{value:2}}})}`
	for _, revoked := range []bool{false, true} {
		withStagedMapProtocolSource(t, source, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
			var accepted []sourceStagedMapEntry
			var revoke func()
			var installed bool
			revoke, installed = beginStagedMapProtocolSource(query, source, func(entry sourceStagedMapEntry) bool {
				if entry.ordinal == 1 {
					if revoked {
						revoke()
					}
					return false
				}
				accepted = append(accepted, entry)
				return true
			})
			if !installed {
				t.Fatal("source borrow missing")
			}
			defer revoke()
			borrow := query.stagedMap
			result := query.accessorsAtGet(source.descriptorMap.descriptors.expression, nil, "", accessorEnumerate|accessorNoGet, nil, nil, borrow.get)
			if len(accepted) != 2 || accepted[1].name != "known" || !borrow.pending || len(result.effects)+len(result.environmentEffects)+len(result.fieldCalls) != 0 {
				t.Fatal("refused/revoked suffix erased known prefix or resumed recursive getter")
			}
		})
	}
}
