package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The real canonical dispatcher, map service and original DATA entry own these
// observations. No test supplies a query/borrow, C, observation stamp or ACK.
func TestOriginalMapEntryCoveragePointwiseSource(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"function", `export function invoke(){const value=Object.defineProperties({}, {x:{value:1}});return Object.freeze(value)}`},
		{"module", `const value=Object.defineProperties({}, {x:{value:1}});const frozen=Object.freeze(value);export function invoke(){return frozen}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			const id = "/virtual/entry-coverage.ts"
			request := Request{Kind: "analyze", ID: id, Source: row.source, Diagnostics: "semantic"}
			withActiveModuleSourceWork(t, request, map[string]string{id: row.source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
				work.prepareOperationUses(facts, owner)
				entries, described := 0, 0
				for _, recipe := range work.operationRecipes {
					if recipe.mapEntry != nil {
						described++
					}
				}
				for i := 1; i < len(work.operations); i++ {
					state := &work.operations[i]
					recipe := work.operationRecipes[state.key]
					if recipe.mapEntry == nil || recipe.mapEntry.read == nil || recipe.mapEntry.read.getter != nil {
						continue
					}
					entry := recipe.mapEntry
					coverage := stagedMemberCoverageRequest(entry.request, entry.entry.group, entry.entry.cut)
					if !operationContainsRequest(recipe.delta.required, coverage) {
						t.Fatal("original DATA entry lost required C")
					}
					withoutC := recipe
					withoutC.delta = cloneOperationDelta(recipe.delta)
					withoutC.delta.required = withoutC.delta.required[:len(withoutC.delta.required)-1]
					if validStagedMapEntryRecipe(withoutC) {
						t.Fatal("descriptive DATA read without C bypassed graph factory")
					}
					c := work.operationRecipes[coverage.producer]
					if !validStagedMemberCoverageRecipe(c) || !sameOperationRequest(c.memberSource.parent, entry.request) || c.memberSource.coverage.cut != entry.entry.cut {
						t.Fatal("entry C lost original full factory or physical cut")
					}
					if row.name == "function" {
						p := state.implicitMap
						if p == nil || p.self != p || p.mapLaw != stagedMapOwnDataGetNoUserEntry || p.generation != work.operationGeneration || p.epoch != work.operationEpoch || !sameOperationRequest(p.request, entry.request) || !sameOperationRequest(p.coverage, coverage) {
							t.Fatal("UNREACHED genuine function DATA/C event rendezvous")
						}
					}
					entries++
				}
				if entries == 0 {
					t.Fatalf("UNREACHED original accepted DATA entry; described=%d no positive claimed", described)
				}
				if work.nativeEagerExecution != nil || work.nativeEffectsExecution != nil {
					t.Fatal("source dispatcher interval escaped")
				}
				clones := make([]callableFacts, len(facts))
				for i := range facts {
					clones[i] = cloneProjectCallableFact(facts[i])
				}
				fresh := registerCallableEffectWork(clones)
				for i := range fresh.operations {
					if fresh.operations[i].implicitMap != nil || fresh.operations[i].implicitField != nil {
						t.Fatal("clone retained original pointwise observations")
					}
				}
			}, activeModuleCompleteAnalysis)
		})
	}
}

// An unavailable C service cannot be treated as successful DATA publication.
// This uses the original selected source borrow; the negative callback issues
// no C, proof or synthetic observation. Positive service coverage is above.
func TestOriginalMapEntryCoverageRefusalAndLifetime(t *testing.T) {
	withStagedMapProtocolSource(t, `export function invoke(){return Object.defineProperties({},{x:{value:1}})}`, func(q *sourceValueQuery, s *sourceStagedNativeGetSource) {
		var entry sourceStagedMapEntry
		revoke, installed := beginStagedMapProtocolSource(q, s, func(candidate sourceStagedMapEntry) bool {
			if candidate.member != nil {
				entry = candidate
			}
			return true
		})
		if !installed {
			t.Fatal("original map source unavailable")
		}
		defer revoke()
		b := q.stagedMap
		q.accessorsAtGet(s.descriptorMap.descriptors.expression, nil, "", accessorEnumerate|accessorNoGet, nil, nil, b.get)
		request, valid := stagedMapEntryRequest(s, entry)
		if !valid {
			t.Fatal("original accepted entry unavailable")
		}
		if q.originalMapEntryCoverageOwned(request) {
			t.Fatal("no service event supplied C authority")
		}
		attempts, published := 0, false
		b.entryCoverage = func(get *sourceGetInputs, group *ast.Node) bool {
			attempts++
			if !q.originalMapEntryCoverageOwned(request) || b.noUserPublication != nil {
				t.Fatal("original C interval absent or manufactured primitive event")
			}
			copied := *q
			if copied.originalMapEntryCoverageOwned(request) {
				t.Fatal("copied query borrowed C interval")
			}
			savedRead := b.currentRead
			copiedRead := *savedRead
			b.currentRead = &copiedRead
			if q.originalMapEntryCoverageOwned(request) {
				t.Fatal("different currentRead borrowed C interval")
			}
			b.currentRead = savedRead
			wrongRequest := request
			wrongCut := request
			wrongCut.cut.reading = nil
			if wrongCut.cut == request.cut {
				t.Fatal("C interval wrong-cut control unchanged")
			}
			if q.originalMapEntryCoverageOwned(wrongCut) {
				t.Fatal("wrong cut borrowed C interval")
			}
			wrongRequest.edge += ":foreign"
			if q.originalMapEntryCoverageOwned(wrongRequest) {
				t.Fatal("foreign request borrowed C interval")
			}
			if get != b.get || group != entry.group || !b.reading || b.currentRead == nil || b.currentRead.getter != nil || q.traceModeKnown {
				t.Fatal("C service lost original DATA interval")
			}
			return false
		}
		publish := func(sourceStagedMapEntryRead) bool { published = true; return true }
		if consumeStagedMapEntrySource(q, s, entry, request, publish) || attempts != 1 || published {
			t.Fatal("unprovided C service published DATA")
		}
		if b.currentRead != nil || b.entryCoverageRead != nil || b.reading || q.traceModeKnown || q.originalMapEntryCoverageOwned(request) {
			t.Fatal("refused C service leaked DATA interval")
		}
		copyQuery := *q
		if consumeStagedMapEntrySource(&copyQuery, s, entry, request, publish) || attempts != 1 {
			t.Fatal("copied issuer entered C service")
		}
		wrong := request
		wrong.cut.reading = nil
		if wrong.cut == request.cut {
			t.Fatal("wrong-cut control did not change cut")
		}
		if consumeStagedMapEntrySource(q, s, entry, wrong, publish) || attempts != 1 {
			t.Fatal("wrong entry cut entered C service")
		}
		revoke()
		if q.originalMapEntryCoverageOwned(request) || b.entryCoverageRead != nil {
			t.Fatal("revoked C interval survived")
		}
		if consumeStagedMapEntrySource(q, s, entry, request, publish) || attempts != 1 {
			t.Fatal("expired entry entered C service")
		}
	})
}

// The original endpoint transport remains usable without a graph C service.
// The real work sink separately refuses extraction and retains its field debt.
func TestOriginalMapEntryTransportWithoutGraphCoverage(t *testing.T) {
	withStagedMapProtocolWorkSource(t, `export function invoke(){return Object.defineProperties({},{x:{value:1}})}`, func(q *sourceValueQuery, source *sourceStagedNativeGetSource, work *callableEffectWork, facts []callableFacts) {
		var entry sourceStagedMapEntry
		revoke, installed := beginStagedMapProtocolSource(q, source, func(candidate sourceStagedMapEntry) bool {
			if candidate.member == nil {
				return true
			}
			entry = candidate
			return work.registerStagedMapEntry(facts, source, candidate)
		})
		if !installed {
			t.Fatal("original transport owner absent")
		}
		defer revoke()
		borrow := q.stagedMap
		q.accessorsAtGet(source.descriptorMap.descriptors.expression, nil, "", accessorEnumerate|accessorNoGet, nil, nil, borrow.get)
		request, valid := stagedMapEntryRequest(source, entry)
		if !valid {
			t.Fatal("original entry factory absent")
		}
		before := work.operationRecipes[request.producer]
		if !validStagedMapEntryRecipe(before) || len(before.delta.required) != len(reflectiveDescriptorKeys) {
			t.Fatal("original independent field requirements absent")
		}
		published := false
		if !consumeStagedMapEntrySource(q, source, entry, request, func(read sourceStagedMapEntryRead) bool {
			published = true
			if !sameOperationEndpoint(read.descriptor, entry.descriptor) || read.accounting != sourceEffectsAccounted {
				t.Fatal("transport changed original DATA endpoint")
			}
			if work.acceptStagedMapEntryRead(facts, source, q) {
				t.Fatal("transport-only event extracted graph entry without C")
			}
			return true
		}) || !published {
			t.Fatal("original source transport refused without graph service")
		}
		after := work.operationRecipes[request.producer]
		if after.mapEntry.read != nil || after.delta.extracted || !operationPrefix(before.delta.required, after.delta.required, sameOperationRequest) || !operationPrefix(after.delta.required, before.delta.required, sameOperationRequest) || !borrow.pending {
			t.Fatal("refused graph acceptance dropped pending debt")
		}
	})
}
