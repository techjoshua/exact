package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
	"testing"
)

// Per-use source dispatch must reach the enrolled member under its actual
// selected binder. Registration, a queued task, a known callable or an ACK-only
// transition cannot replace a new original member/semantic observation.
func TestInstalledSourceCallMemberRenewal(t *testing.T) {
	for _, row := range []struct {
		name, source string
		captured     bool
	}{
		{"adapted-getter", `export{};const actual={get value(){return document.title}};function read(owner=actual){return owner.value}export function probe(){return read.call(undefined)}`, false},
		{"captured-source-arrow", `export{};function make(){const capture={read(){return document.title}};return ()=>capture.read()}const invoke=make();export function probe(){return invoke()}`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			withReflectiveRelevanceSource(t, "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\n"+row.source, func(owner *executableBodyOwner, file *ast.SourceFile) {
				cache, _ := prepareProjectCallableContexts(owner.project, file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
				collection := beginProjectCallableCollection(cache, cache.owner)
				defer collection.close()
				collection.collect()
				result := collection.resolve(file)
				if len(result.pending) != 0 {
					t.Fatalf("original source Call/member pending; renewal/current controls UNREACHED: %#v", result.pending)
				}
				descriptorContractBrowser(t, result, true)
				work := &collection.work
				reached := 0
				for _, recipe := range work.operationRecipes {
					source := recipe.installedCall
					if source == nil {
						continue
					}
					if row.captured && source.input.callable == nil {
						continue
					}
					if !row.captured && len(source.input.selection) == 0 {
						continue
					}
					if !work.installedCallObservationCurrent(recipe) {
						t.Fatal("original selected Call observation CURRENT UNREACHED")
					}
					id := work.operationIDs[recipe.key]
					if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
						t.Fatal("actual Call observer ID UNREACHED")
					}
					state := &work.operations[id.index]
					observed := state.installedCallObserved
					if observed == nil || observed.self != observed || len(observed.revisions) == 0 || len(observed.required) != len(observed.revisions) {
						t.Fatal("current observer lacks original prerequisite snapshot")
					}
					consumer := work.memberNodes[source.request.consumer]
					var requirement *sourceInstalledMemberRequirement
					for _, call := range collection.facts[consumer].fieldCalls {
						for _, outcome := range call.outcomes {
							if outcome.installedMember != nil && sameOperationRequest(outcome.installedMember.call, source.request) && installedCallFieldBody(call, outcome) {
								requirement = outcome.installedMember
							}
						}
					}
					if requirement == nil || !work.installedMemberFieldOutcomeCurrent(requirement) {
						t.Fatal("original typed field subscriber CURRENT UNREACHED")
					}
					revisions := append([]uint64(nil), observed.revisions...)
					before := state.revision
					if !work.installedCallObservationCurrent(recipe) || !slices.Equal(revisions, observed.revisions) || state.revision != before {
						t.Fatal("current readback recertified source observation")
					}
					copied := *observed
					state.installedCallObserved = &copied
					if work.installedMemberFieldOutcomeCurrent(requirement) {
						t.Fatal("copied original Call observation borrowed field completion")
					}
					state.installedCallObserved = observed
					cloned := cloneInstalledCallPhase(source)
					if cloned == source || cloned.input == source.input || cloned.input.binding == source.input.binding || !sameInstalledCallPhase(cloned, source) {
						t.Fatal("detached source description clone lost correspondence/ownership")
					}
					wrong := *requirement
					wrong.call.cut.use = source.body
					if work.installedMemberFieldOutcomeCurrent(&wrong) {
						t.Fatal("foreign Call reader borrowed field completion")
					}
					wrong = *requirement
					wrong.application.memberCut.reading = source.body
					if work.installedMemberFieldOutcomeCurrent(&wrong) {
						t.Fatal("foreign member cut borrowed field completion")
					}
					reached++
				}
				if reached == 0 {
					t.Fatal("genuine original selected Call/member connection UNREACHED")
				}
			})
		})
	}
}
