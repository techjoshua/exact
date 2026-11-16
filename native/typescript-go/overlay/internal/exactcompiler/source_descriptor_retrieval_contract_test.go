package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These controls exercise the real project collector and its first fixed point.
// A summary alone cannot qualify the native relation: the selected original Get
// and an extracted, current descriptor DATA recipe must also be reached.
func descriptorContractCollection(t *testing.T, source string, inspect func(*projectCallableCollection, callableAnalysis)) {
	t.Helper()
	withReflectiveRelevanceSource(t, "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\n"+source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		result := collection.resolve(file)
		if len(result.pending) != 0 {
			t.Fatalf("original descriptor collector pending; result controls UNREACHED: %#v", result.pending)
		}
		selected, delivered := false, false
		for _, recipe := range collection.work.operationRecipes {
			if recipe.nativeGet != nil && validDescriptorRetrieval(recipe.nativeGet) && collection.work.nativeEffectsGetCurrent(recipe.nativeGet) {
				selected = true
			}
			if recipe.callResult != nil && recipe.callResult.nativeDescriptor != nil && recipe.delta.extracted && collection.work.nativeDescriptorResultCurrent(recipe) {
				delivered = true
			}
		}
		if !selected || !delivered {
			t.Fatalf("genuine descriptor selected Get/result DATA UNREACHED: selected=%v result=%v", selected, delivered)
		}
		inspect(collection, result)
	})
}

func descriptorContractBrowser(t *testing.T, analysis callableAnalysis, want bool) {
	t.Helper()
	probe := findCallable(t, analysis.summaries, "probe")
	got := false
	for _, effect := range probe.EffectSources {
		got = got || effect.Environment == "browser"
	}
	if got != want {
		t.Fatalf("descriptor source/invocation boundary: browser=%v want=%v effects=%#v", got, want, probe.EffectSources)
	}
}

// Retrieval preserves callable source relationships without executing the stored
// target getter or data function. A later explicit invocation is a new demand.
func TestDescriptorContractStoredFieldsAndAbsence(t *testing.T) {
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"captured-data-dormant", `export{};const capture={read(){return document.title}};function stored(){return capture.read()}const target={value:stored};export function probe(){const descriptor=Object.getOwnPropertyDescriptor(target,'value');return descriptor?.value}`, false},
		{"captured-data-invoked", `export{};const capture={read(){return document.title}};function stored(){return capture.read()}const target={value:stored};export function probe(){const descriptor=Object.getOwnPropertyDescriptor(target,'value');return descriptor?.value()}`, true},
		{"accessor-dormant", `export{};const target={get value(){return document.title}};export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.get}`, false},
		{"accessor-invoked", `export{};const target={get value(){return document.title}};export function probe(){const descriptor=Object.getOwnPropertyDescriptor(target,'value');return descriptor?.get?.()}`, true},
		{"absent-optional", `export{};const target={};export function probe(){return Object.getOwnPropertyDescriptor(target,'missing')?.value}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			descriptorContractCollection(t, row.source, func(_ *projectCallableCollection, result callableAnalysis) {
				descriptorContractBrowser(t, result, row.browser)
			})
		})
	}
}

// Native descriptor traps supply two actuals. The third default and descriptor
// normalization field getters are independent real MAY donors of the Call.
func TestDescriptorContractProxyProtocolDonors(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"third-default", `export{};const target={value:1};const handler={getOwnPropertyDescriptor(_target:object,_key:PropertyKey,third=document.title){return {value:third,configurable:true}}};const proxy=new Proxy(target,handler);export function probe(){return Object.getOwnPropertyDescriptor(proxy,'value')?.value}`},
		{"normalization-getter", `export{};const target={value:1};const proxy=new Proxy(target,{getOwnPropertyDescriptor(){return {configurable:true,get value(){return document.title}}}});export function probe(){return Object.getOwnPropertyDescriptor(proxy,'value')?.value}`},
		{"key-coercion", `export{};const key={[Symbol.toPrimitive](){return document.title}};export function probe(value:object){return Object.getOwnPropertyDescriptor(value,key as unknown as PropertyKey)?.value}`},
		{"known-and-unknown-target", `export{};declare const choice:boolean;declare const external:{value:()=>string};function stored(){return document.title}const target=choice?{value:stored}:external;export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.value()}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			descriptorContractCollection(t, row.source, func(collection *projectCallableCollection, result callableAnalysis) {
				descriptorContractBrowser(t, result, true)
				if row.name == "normalization-getter" {
					descriptorContractInstalledNormalization(t, collection)
				}
			})
		})
	}
}

// Only an actual delivered descriptor view enters this refusal control. Strong
// read/instance consumers must retain the marker and uncertainty rather than
// treating the input target as a raw/native/ordinary output.
func TestDescriptorContractResultMarkerRefusesRawAuthority(t *testing.T) {
	const source = `export{};const target={value:1};export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.value}`
	descriptorContractCollection(t, source, func(collection *projectCallableCollection, _ callableAnalysis) {
		reached := false
		for _, recipe := range collection.work.operationRecipes {
			if recipe.callResult == nil || recipe.callResult.nativeDescriptor == nil || !collection.work.nativeDescriptorResultCurrent(recipe) || len(recipe.delta.exposures) != 1 {
				continue
			}
			view := recipe.delta.exposures[0].endpoint.descriptorView
			if view == nil {
				t.Fatal("actual descriptor result lost its typed endpoint")
			}
			reached = true
			q := newSourceDependencyQuery(recipe.key.operation, collection.owner.checker, collection.owner, recipe.key.declaration)
			part := accessorCandidates{}
			q.retainNativeDescriptorView(*view, []string{"value"}, "", accessorRead, true, &part)
			if !part.opaque || !part.valueIncomplete || len(part.values) != 1 || part.values[0].descriptorView == nil {
				t.Fatal("strong consumer erased descriptor marker/refusal")
			}
			value := part.values[0]
			if value.node != nil || value.native != nil || value.normal != nil || value.acquired != nil || value.instance != nil || len(part.nativeCalls) != 0 || len(part.normalCalls) != 0 {
				t.Fatal("descriptor view gained raw/native/normal authority")
			}
		}
		if !reached {
			t.Fatal("actual delivered descriptor marker UNREACHED")
		}
	})
}

// This is the same original collector/fixture as the donor assertion above.
// A known browser contribution alone cannot establish installed-phase delivery,
// and registry enrollment alone cannot establish the algorithm's current tail.
func descriptorContractInstalledNormalization(t *testing.T, collection *projectCallableCollection) {
	t.Helper()
	has, acquire := false, false
	for key, algorithm := range collection.work.operationRecipes {
		if algorithm.nativeGet == nil || !validDescriptorRetrieval(algorithm.nativeGet) || key != nativeRootDebtRequest(algorithm.nativeGet, "algorithm").producer {
			continue
		}
		id, adopted := collection.work.operationIDs[key]
		if !adopted || !collection.work.descriptorEffectsEnumerationCurrent(id, algorithm) {
			continue
		}
		for _, request := range algorithm.delta.required {
			phase := collection.work.operationRecipes[request.producer]
			if phase.installedMember == nil || phase.installedMember.key != "value" || !sameOperationRequest(phase.installedMember.request, request) {
				continue
			}
			delivery := collection.work.installedMemberOutcomeCurrent(request)
			if !delivery.enrolled || !delivery.current || phase.installedMember.memberCut.operation != key.operation || !sameOperationRequest(phase.installedMember.nativeGet, nativeRootDebtRequest(algorithm.nativeGet, "callee-get")) {
				t.Fatal("original normalization field lacks exact current algorithm/Get/reader delivery")
			}
			has = has || phase.installedMember.phase == installedMemberHas
			acquire = acquire || phase.installedMember.phase == installedMemberAcquire
		}
	}
	if !has || !acquire {
		t.Fatalf("genuine descriptor normalization phases UNREACHED: Has=%v Acquire=%v", has, acquire)
	}
}
