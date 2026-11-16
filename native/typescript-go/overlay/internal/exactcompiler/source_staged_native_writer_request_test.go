package exactcompiler

import "testing"

// The real collector must reach the request BEFORE its original native input
// disposition exists, then the same queue must deliver the actual selected Get
// contribution to a real C reader. A merely registered pending recipe fails.
// The unchanged original G2 Session/Node test remains workload acceptance.
func TestStagedNativeWriterPreselectionOriginalSource(t *testing.T) {
	const id = "/virtual/g2-native-writer.ts"
	const source = `const stores=new WeakMap<object,WeakMap<object,unknown>>();export function invoke(key:object,item:object){let inner=stores.get(key);if(!inner)stores.set(key,(inner=new WeakMap<object,unknown>()));let owned=inner.get(item);if(!owned){const descriptor=Object.create(null);owned=Object.freeze(Object.defineProperty(descriptor,'value',{value:item}));inner.set(item,owned)}return owned}`
	var released *callableEffectWork
	var releasedRecipe sourceStagedOperationRecipe
	request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic", stagedReplacement: true}
	withActiveModuleSourceWork(t, request, map[string]string{id: source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		reached := 0
		for key, recipe := range work.operationRecipes {
			if !nativeWriterSourceRequested(recipe) {
				continue
			}
			reached++
			if !validStagedMemberCallRecipe(recipe) || !recipe.delta.extracted || !work.nativeWriterSourceRequestCurrent(recipe) {
				t.Fatal("original pre-selection source CURRENT positive UNREACHED")
			}
			description := recipe.memberSource.call.sourceRequest
			if len(description.required) != 3 {
				t.Fatal("real full Call/Get/source children absent")
			}
			actual := work.operationRecipes[description.required[2].producer]
			if !validNativeInputInvocationRecipe(actual) || !work.nativeInputInvocationCurrent(actual) || !sameOperationRequest(actual.nativeGet.request, description.occurrence.request) {
				t.Fatal("original selected/finished Get contribution UNREACHED")
			}
			id, adopted := work.operationIDs[key]
			if !adopted || !work.operations[id.index].delta.extracted {
				t.Fatal("source queue extraction UNREACHED")
			}
			state := &work.operations[id.index]
			applied := false
			for _, sub := range state.subscribers {
				if sub.request.reading == (sourceStagedOperationKey{}) {
					continue
				}
				if !work.describedWriterSourceReading(sub.request) {
					t.Fatal("actual contextual reader factory invalid")
				}
				applied = applied || state.revision != 0 && sub.consumed == state.revision && sub.applied == state.revision && !sub.blocked
			}
			if !applied {
				t.Fatal("actual source reader delivery/APPLIED UNREACHED")
			}
			// All negatives follow the genuine current producer + delivered reader.
			copied := recipe
			copied.memberSource = cloneStagedMemberSource(recipe.memberSource)
			if work.nativeWriterSourceRequestCurrent(copied) {
				t.Fatal("copied description borrowed registered source observation")
			}
			copied.memberSource.call.sourceRequest.required[1].cut.reading = nil
			if validStagedMemberCallRecipe(copied) {
				t.Fatal("foreign original Get cut accepted")
			}
			if description.required[1].cut.reading == nil {
				t.Fatal("clone readset aliases original")
			}
			copied = recipe
			copied.memberSource = cloneStagedMemberSource(recipe.memberSource)
			copied.memberSource.call.sourceRequest.generation = nil
			if validStagedMemberCallRecipe(copied) || work.nativeWriterSourceRequestCurrent(copied) {
				t.Fatal("foreign generation description accepted")
			}
			copied = recipe
			copied.memberSource = cloneStagedMemberSource(recipe.memberSource)
			copied.memberSource.call.sourceRequest.nativeInput = false
			if validStagedMemberCallRecipe(copied) {
				t.Fatal("native request borrowed constructed-method schema")
			}
			cloned := make([]callableFacts, len(facts))
			for i := range facts {
				cloned[i] = cloneProjectCallableFact(facts[i])
			}
			fresh := registerCallableEffectWork(cloned)
			fresh.operationGeneration = work.operationGeneration
			fresh.notifyNativeWriterSourceRequests(cloned, actual.nativeGet)
			if fresh.nativeWriterSourceRequestCurrent(recipe) {
				t.Fatal("cached notification supplied fresh graph currentness")
			}
			revision := state.revision
			queue := len(work.extractionQueue)
			work.notifyNativeWriterSourceRequests(facts, actual.nativeGet)
			if work.operations[id.index].revision != revision || len(work.extractionQueue) != queue {
				t.Fatal("repeat source publication renewed observation or duplicated task")
			}
			released, releasedRecipe = work, recipe
		}
		if reached == 0 {
			t.Fatal("pre-selection native writer source/consumer connection UNREACHED")
		}
	}, activeModuleCompleteAnalysis)
	if released == nil {
		t.Fatal("live source positive UNREACHED")
	}
	if released.nativeWriterSourceRequestCurrent(releasedRecipe) {
		t.Fatal("expired source generation remained current")
	}
}

// Same inventory spelling without the selected standard owner cannot complete
// the compiler source request or turn an authored body into an excluded source.
func TestStagedNativeWriterPreselectionAuthoredPending(t *testing.T) {
	const id = "/virtual/g2-native-writer-authored.ts"
	const source = `const store=new WeakMap<object,object>();export let donor=0;Object.freeze=function<T>(value:T):Readonly<T>{donor++;return value};export function invoke(key:object){let owned=store.get(key);if(!owned){owned=Object.freeze({});store.set(key,owned)}return owned}`
	request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic", stagedReplacement: true}
	withActiveModuleSourceWork(t, request, map[string]string{id: source}, nil, func(_ []callableFacts, work *callableEffectWork, _ *executableBodyOwner) {
		reached := 0
		for _, recipe := range work.operationRecipes {
			if !nativeWriterSourceRequested(recipe) {
				continue
			}
			reached++
			if !validStagedMemberCallRecipe(recipe) {
				t.Fatal("pending source factory unavailable")
			}
			if recipe.delta.extracted || recipe.memberSource.call.complete || work.nativeWriterSourceRequestCurrent(recipe) {
				t.Fatal("authored spelling supplied native source disposition")
			}
			if _, current := work.currentNativeInputInvocationSource(recipe.key.operation); current {
				t.Fatal("authored method gained selected standard currentness")
			}
		}
		if reached == 0 {
			t.Fatal("authored pre-selection request control UNREACHED")
		}
	}, activeModuleCompleteAnalysis)
}
