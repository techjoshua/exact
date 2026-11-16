package exactcompiler

import (
	"slices"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Real source substitution must enroll and deliver the member phase before a
// pending outcome can retire. Getter/default donors remain canonical effects.
// A registry-only pass, an upstream skip or empty inferred inventory fails.
func TestInstalledSourceMemberApplications(t *testing.T) {
	for _, row := range []struct {
		name, source string
		phases       []sourceInstalledMemberPhase
	}{
		{"adapted-read", `export{};const actual={get value(){return document.title}};function read(owner:{readonly value:string}){return owner.value}export function probe(){return read.call(undefined,actual)}`, []sourceInstalledMemberPhase{installedMemberRead}},
		{"descriptor-return", `export{};const target={value:1};const proxy=new Proxy(target,{getOwnPropertyDescriptor(_target:object,_key:PropertyKey,third=document.title){return {configurable:true,enumerable:true,get value(){return third}}}});export function probe(){return Object.getOwnPropertyDescriptor(proxy,'value')?.value}`, []sourceInstalledMemberPhase{installedMemberHas, installedMemberAcquire}},
	} {
		t.Run(row.name, func(t *testing.T) {
			withReflectiveRelevanceSource(t, "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\n"+row.source, func(initial *executableBodyOwner, file *ast.SourceFile) {
				cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
				collection := beginProjectCallableCollection(cache, cache.owner)
				defer collection.close()
				collection.collect()
				result := collection.resolve(file)
				if len(result.pending) != 0 {
					t.Fatalf("original source application pending; delivery controls UNREACHED: %#v", result.pending)
				}
				descriptorContractBrowser(t, result, true)
				work := &collection.work
				reached := make(map[sourceInstalledMemberPhase]bool)
				for _, recipe := range work.operationRecipes {
					application := recipe.installedMember
					if application == nil || !slices.Contains(row.phases, application.phase) {
						continue
					}
					id := work.operationIDs[recipe.key]
					if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
						t.Fatal("actual subscriber UNREACHED")
					}
					subscriber := work.operations[id.index].subscribers[sourceStagedOperationConsumer{consumer: application.request.consumer, edge: application.request.edge}]
					if subscriber == nil {
						t.Fatal("original reader UNREACHED")
					}
					request := subscriber.request
					delivery := work.installedMemberOutcomeCurrent(request)
					if !delivery.enrolled || !delivery.current {
						t.Fatalf("actual enrolled phase did not deliver CURRENT: phase=%d key=%s", application.phase, application.key)
					}
					reached[application.phase] = true
					state := &work.operations[delivery.producer.index]
					observation := state.installedMemberObserved
					if observation == nil || observation.self != observation {
						t.Fatal("current without an original semantic observation")
					}
					before := append([]uint64(nil), observation.revisions...)
					revision := state.revision
					if !work.installedMemberOutcomeApplied(request).current || state.revision != revision || !slices.Equal(before, observation.revisions) {
						t.Fatal("readback rewrote the original semantic snapshot")
					}
					wrongCut := request
					wrongCut.cut.use = recipe.key.declaration
					if work.installedMemberOutcomeApplied(wrongCut).enrolled {
						t.Fatal("foreign member cut borrowed delivery")
					}
					copiedBinding := *request.inputs
					wrongBinding := request
					wrongBinding.inputs = &copiedBinding
					if work.installedMemberOutcomeApplied(wrongBinding).enrolled {
						t.Fatal("copied binder description borrowed exact reader")
					}
					copy := *observation
					state.installedMemberObserved = &copy
					if work.installedMemberOutcomeApplied(request).current {
						t.Fatal("copied graph observation borrowed source authority")
					}
					state.installedMemberObserved = observation
				}
				for _, phase := range row.phases {
					if !reached[phase] {
						t.Fatalf("genuine original phase %d UNREACHED", phase)
					}
				}
			})
		})
	}
}
