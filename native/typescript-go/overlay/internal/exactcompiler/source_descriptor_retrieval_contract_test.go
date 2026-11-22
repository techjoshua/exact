package exactcompiler

import (
	"strings"
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

// A task calling probe owns both Proxy construction and descriptor retrieval.
const proxyDescriptorNormalizationSource = `export function probe(){const target={value:1};const proxy=new Proxy(target,{getOwnPropertyDescriptor(){return {configurable:true,get value(){return document.title}}}});return Object.getOwnPropertyDescriptor(proxy,'value')?.value}`

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
		{"saved-accessor", `export function probe(){const target={get value(){return document.title}};const descriptor=Object.getOwnPropertyDescriptor(target,'value');const getter=descriptor?.get;return getter?.()}`, true},
		{"forwarded-accessor", `export function probe(){const target={get value(){return document.title}};const descriptor=Object.getOwnPropertyDescriptor(target,'value');const getter=descriptor!.get!;const read=getter;return read()}`, true},
		{"saved-data-function", `export function probe(){const target={value(){return document.title}};const descriptor=Object.getOwnPropertyDescriptor(target,'value');const invoke=descriptor!.value;return invoke()}`, true},
		{"accessor-call", `export function probe(){const target={get value(){return document.title}};const receiver={};const descriptor=Object.getOwnPropertyDescriptor(target,'value');return descriptor!.get!.call(receiver)}`, true},
		{"accessor-saved-apply", `export function probe(){const target={get value(){return document.title}};const receiver={};const descriptor=Object.getOwnPropertyDescriptor(target,'value');const getter=descriptor!.get!;return getter.apply(receiver,[])}`, true},
		{"accessor-bound", `export function probe(){const target={get value(){return document.title}};const receiver={};const descriptor=Object.getOwnPropertyDescriptor(target,'value');const bound=descriptor!.get!.bind(receiver);return bound()}`, true},
		{"data-call", `export function probe(){const target={value(){return document.title}};const receiver={};const descriptor=Object.getOwnPropertyDescriptor(target,'value');return (descriptor!.value as typeof target.value).call(receiver)}`, true},
		{"data-call-mixed-target", `declare const choice:boolean;declare const foreign:{value():string};export function probe(){const target=choice?{value(){return document.title}}:foreign;const descriptor=Object.getOwnPropertyDescriptor(target,'value');return (descriptor!.value as typeof target.value).call({})}`, true},
		{"data-apply", `export function probe(){const target={value(){return document.title}};const receiver={};const descriptor=Object.getOwnPropertyDescriptor(target,'value');return (descriptor!.value as typeof target.value).apply(receiver,[])}`, true},
		{"data-bound", `export function probe(){const target={value(){return document.title}};const receiver={};const descriptor=Object.getOwnPropertyDescriptor(target,'value');const bound=(descriptor!.value as typeof target.value).bind(receiver);return bound()}`, true},
		{"accessor-dormant-bind", `export function probe(){const target={get value(){return document.title}};const receiver={};const descriptor=Object.getOwnPropertyDescriptor(target,'value');return descriptor!.get!.bind(receiver)}`, false},
		{"saved-dormant", `export function probe(){const target={get value(){return document.title}};const descriptor=Object.getOwnPropertyDescriptor(target,'value');const getter=descriptor?.get;return getter}`, false},
		{"replaced-alias", `export function probe(){const target={get value(){return document.title}};const descriptor=Object.getOwnPropertyDescriptor(target,'value');let getter=descriptor!.get!;getter=()=>'replacement';return getter()}`, false},
		{"absent-optional", `export{};const target={};export function probe(){return Object.getOwnPropertyDescriptor(target,'missing')?.value}`, false},
		{"proxy-normalization-getter", proxyDescriptorNormalizationSource, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				const consume = `const value=probe();this.state.label=typeof value==='string'?value:typeof value`
				source := row.source + publicAwaitRequiredPage("", consume, target)
				fixture := newPublicAwaitRequiredFixture(t, source)
				request := fixture.request("compile", "entry.tsx")
				request.Target = target
				response := NewSession().Execute(request)
				if response.Error != "" || len(response.Analysis.Tasks) != 1 {
					t.Fatalf("%s component task was absent: %s %#v", target, response.Error, response.Diagnostics)
				}
				task := response.Analysis.Tasks[0]
				browser, unknown := false, false
				for _, effect := range task.EffectSources {
					browser = browser || effect.Environment == "browser" && strings.Contains(effect.Description, "document")
					unknown = unknown || effect.Environment == "unknown"
				}
				if browser != row.browser {
					t.Fatalf("%s recorded browser effect=%v want=%v: %#v", target, browser, row.browser, task.EffectSources)
				}
				switch row.name {
				case "proxy-normalization-getter", "accessor-call", "data-apply", "data-call-mixed-target":
					if !unknown {
						t.Fatalf("%s descriptor uncertainty lost: %#v", target, task.EffectSources)
					}
				}
				if row.browser && target == TargetServer {
					denied := false
					for _, diagnostic := range response.Diagnostics {
						denied = denied || diagnostic.Code == "EXACT2001" &&
							strings.Contains(diagnostic.Message, "task requests server placement but references browser-only globals")
					}
					if !denied || response.Code != "" {
						t.Fatalf("server must refuse the actual browser invocation: %#v", response.Diagnostics)
					}
				} else if hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("%s descriptor consumer did not emit: %#v", target, response.Diagnostics)
				}
			}
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
