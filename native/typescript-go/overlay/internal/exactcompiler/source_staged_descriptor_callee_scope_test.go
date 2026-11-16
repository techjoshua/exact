package exactcompiler

import (
	"path/filepath"
	"testing"
)

// The original collector has to issue and deliver a descriptor callee component.
// Registry-only/pending work and the optional whole-Call law cannot satisfy it.
// The unchanged original G2 Session/Node test remains the workload terminal.
func TestStagedDescriptorCalleeOriginalSource(t *testing.T) {
	// Use the unchanged original workload source and drivers. The active helper
	// owns its real canonical collector/first resolve; the protected Session test
	// independently remains the public compile/artifact terminal.
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	var released *callableEffectWork
	var releasedRecipe sourceStagedOperationRecipe
	withActiveModuleSourceWork(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, _ *executableBodyOwner) {
		reached := 0
		for key, recipe := range work.operationRecipes {
			if !descriptorCalleeRequested(recipe) {
				continue
			}
			reached++
			if !validStagedMemberCallRecipe(recipe) || !recipe.delta.extracted || !work.descriptorCalleeCurrent(recipe) {
				t.Fatal("original descriptor callee CURRENT positive UNREACHED")
			}
			if work.nativeObserverProducerCurrent(recipe) || nativeWriterSourceRequested(recipe) {
				t.Fatal("callee component borrowed whole-Call exclusion")
			}
			description := recipe.memberSource.call.sourceRequest
			if len(description.required) != 10 {
				t.Fatal("full Call/Get/algorithm/eager/sixfield requirements missing")
			}
			id := work.operationIDs[key]
			state := &work.operations[id.index]
			applied := false
			for _, sub := range state.subscribers {
				if sub.request.reading == (sourceStagedOperationKey{}) {
					continue
				}
				if !work.describedWriterSourceReading(sub.request) {
					t.Fatal("original contextual callee reader invalid")
				}
				applied = applied || state.revision != 0 && sub.consumed == state.revision && sub.applied == state.revision && !sub.blocked
			}
			if !applied {
				t.Fatal("actual callee reader delivery/APPLIED UNREACHED")
			}
			// Every refusal follows the genuine source/current/delivery positive.
			copied := recipe
			copied.memberSource = cloneStagedMemberSource(recipe.memberSource)
			if work.descriptorCalleeCurrent(copied) {
				t.Fatal("copied description borrowed current observation")
			}
			copied.memberSource.call.sourceRequest.required[1].cut.reading = nil
			if validStagedMemberCallRecipe(copied) {
				t.Fatal("foreign original Get cut accepted")
			}
			if description.required[1].cut.reading == nil {
				t.Fatal("clone aliases original required vector")
			}
			copied = recipe
			copied.memberSource = cloneStagedMemberSource(recipe.memberSource)
			copied.memberSource.call.sourceRequest.generation = nil
			if validStagedMemberCallRecipe(copied) || work.descriptorCalleeCurrent(copied) {
				t.Fatal("foreign generation accepted")
			}
			copied = recipe
			copied.memberSource = cloneStagedMemberSource(recipe.memberSource)
			copied.memberSource.call.sourceRequest.nativeInput = true
			if validStagedMemberCallRecipe(copied) {
				t.Fatal("callee-only and whole-Call roles conflated")
			}
			cloned := make([]callableFacts, len(facts))
			for i := range facts {
				cloned[i] = cloneProjectCallableFact(facts[i])
			}
			fresh := registerCallableEffectWork(cloned)
			fresh.operationGeneration = work.operationGeneration
			actual := work.descriptorCalleeSource(recipe)
			fresh.notifyNativeWriterSourceRequests(cloned, actual)
			if fresh.descriptorCalleeCurrent(recipe) {
				t.Fatal("notification minted fresh graph observation")
			}
			revision, queue := state.revision, len(work.extractionQueue)
			work.notifyNativeWriterSourceRequests(facts, actual)
			if work.operations[id.index].revision != revision || len(work.extractionQueue) != queue {
				t.Fatal("repeat publication renewed currentness or queued duplicate")
			}
			released, releasedRecipe = work, recipe
		}
		if reached == 0 {
			t.Fatal("original descriptor callee/consumer connection UNREACHED")
		}
	}, activeModuleCompleteAnalysis)
	if released == nil {
		t.Fatal("live original source positive UNREACHED")
	}
	if released.descriptorCalleeCurrent(releasedRecipe) {
		t.Fatal("expired source generation remained current")
	}
}

// A same-spelled authored/mixed callee cannot retire the explicit callee
// component. Descriptor arguments and runtime uncertainty are separate debts.
func TestStagedDescriptorCalleeAuthoredPending(t *testing.T) {
	for _, row := range []struct{ name, selection string }{
		{"authored", `function<T>(target:T,key:PropertyKey,descriptor:PropertyDescriptor):T{donor++;return target}`},
		{"mixed", `choose ? function<T>(target:T,key:PropertyKey,descriptor:PropertyDescriptor):T{donor++;return target} : Object.defineProperty`},
	} {
		t.Run(row.name, func(t *testing.T) {
			id := "/virtual/g2-descriptor-callee-" + row.name + ".ts"
			source := `declare const choose:boolean;const stores=new WeakMap<object,unknown>();export let donor=0;Object.defineProperty=` + row.selection + `;export function invoke(key:object,item:object){let owned=stores.get(key);if(!owned){owned=Object.defineProperty(Object.create(null),'value',{value:item});stores.set(key,owned)}return owned}`
			request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic", stagedReplacement: true}
			withActiveModuleSourceWork(t, request, map[string]string{id: source}, nil, func(_ []callableFacts, work *callableEffectWork, _ *executableBodyOwner) {
				reached := false
				for _, recipe := range work.operationRecipes {
					if !descriptorCalleeRequested(recipe) {
						continue
					}
					reached = true
					if !validStagedMemberCallRecipe(recipe) {
						t.Fatal("authored pending source factory invalid")
					}
					if recipe.delta.extracted || recipe.memberSource.call.complete || work.descriptorCalleeCurrent(recipe) || work.nativeObserverProducerCurrent(recipe) {
						t.Fatal("authored callee retired as a native component")
					}
				}
				if !reached {
					t.Fatal("authored callee source demand UNREACHED")
				}
			}, activeModuleCompleteAnalysis)
		})
	}
}

// Callee coverage cannot pay descriptor getter/key-coercion/Proxy obligations.
// Each known captured donor must reach invoke beside the authentic callee role;
// any unmigrated producer stops before these assertions and remains unqualified.
func TestStagedDescriptorCalleeImplicitDonors(t *testing.T) {
	for _, row := range []struct{ name, operation string }{
		{"getterCapture", `const read=()=>document.title;owned=Object.defineProperty(Object.create(null),'value',{get value(){read();return item}})`},
		{"keyCoercion", `const property={toString(){document.title;return 'value'}};owned=Object.defineProperty(Object.create(null),property as unknown as PropertyKey,{value:item})`},
		{"proxyTarget", `const target=new Proxy(Object.create(null),{defineProperty(target,key,value){document.title;return Reflect.defineProperty(target,key,value)}});owned=Object.defineProperty(target,'value',{value:item})`},
	} {
		t.Run(row.name, func(t *testing.T) {
			id := "/virtual/g2-descriptor-callee-" + row.name + ".ts"
			source := `const store=new WeakMap<object,unknown>();export function invoke(key:object,item:object){let owned=store.get(key);if(!owned){` + row.operation + `;store.set(key,owned)}return owned}`
			request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic", stagedReplacement: true}
			withActiveModuleSourceWork(t, request, map[string]string{id: source}, nil, func(facts []callableFacts, work *callableEffectWork, _ *executableBodyOwner) {
				callee, donor := false, false
				for _, recipe := range work.operationRecipes {
					if !descriptorCalleeRequested(recipe) {
						continue
					}
					if work.nativeObserverProducerCurrent(recipe) {
						t.Fatal("implicit work borrowed whole-Call exclusion")
					}
					if !work.descriptorCalleeCurrent(recipe) {
						continue
					}
					state := &work.operations[work.operationIDs[recipe.key].index]
					for _, sub := range state.subscribers {
						callee = callee || sub.request.reading != (sourceStagedOperationKey{}) && state.revision != 0 && sub.consumed == state.revision && sub.applied == state.revision && !sub.blocked
					}
				}
				for _, fact := range facts {
					if fact.summary.Name != "invoke" {
						continue
					}
					for _, effect := range fact.summary.EffectSources {
						donor = donor || effect.Environment == "browser"
					}
				}
				if !callee || !donor {
					t.Fatal("authentic callee delivery and original implicit browser donor UNREACHED", callee, donor)
				}
			}, activeModuleCompleteAnalysis)
		})
	}
}
