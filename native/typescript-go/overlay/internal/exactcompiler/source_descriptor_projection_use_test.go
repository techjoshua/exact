package exactcompiler

import "testing"

// These are original project-collector Get consumers. A comparison does not
// supply the descriptor value: the native Get, input DATA, original Call Effects,
// exact DATA reader, prototype C and every known getter body must all complete.
func TestDescriptorNoncoercingOriginalSourceUses(t *testing.T) {
	for _, row := range []struct {
		name, source string
		kind         sourceDescriptorGetUseKind
	}{
		{"symbol-strict", `export{};const tag=Symbol.for('descriptor-source-use');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,tag)?.value===true}`, descriptorStrictComparisonEffects},
		{"string-strict", `export function probe(value:object){return Object.getOwnPropertyDescriptor(value,'code')?.value!=='code'}`, descriptorStrictComparisonEffects},
		{"typeof", `export function probe(value:object){return typeof Object.getOwnPropertyDescriptor(value,'code')?.value}`, descriptorTypeofEffects},
	} {
		t.Run(row.name, func(t *testing.T) {
			descriptorContractCollection(t, row.source, func(collection *projectCallableCollection, analysis callableAnalysis) {
				descriptorContractBrowser(t, analysis, false)
				assertOriginalDescriptorGetUseCurrent(t, collection, row.kind)
			})
		})
	}
}

func assertOriginalDescriptorGetUseCurrent(t *testing.T, collection *projectCallableCollection, kind sourceDescriptorGetUseKind) {
	t.Helper()
	work := &collection.work
	closed := work.closedOperationDependencies()
	reached := false
	for _, recipe := range work.operationRecipes {
		if recipe.memberSource == nil || recipe.memberSource.getEffects == nil || recipe.memberSource.getEffects.descriptor == nil {
			continue
		}
		d := recipe.memberSource.getEffects.descriptor
		if d.use.kind != kind {
			continue
		}
		id, adopted := work.operationIDs[recipe.key]
		if !adopted || id.index == 0 || int(id.index) >= len(closed) || !closed[id.index] || !recipe.delta.extracted || !validDescriptorRecordGetRecipe(recipe) || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
			t.Fatal("original descriptor Get Effects/required closure not CURRENT")
		}
		data, applied := work.stagedCallResultData(d.view.delivery)
		if !applied || !data.delta.extracted || !work.descriptorViewSourceCurrent(&d.view) {
			t.Fatal("actual descriptor DATA reader/input/native Get not current and APPLIED")
		}
		coverage := work.operationRecipes[d.coverage.producer]
		if !validStagedMemberCoverageRecipe(coverage) || !coverage.delta.extracted || work.memberCoverageObserved[coverage.key] != work.operationGeneration {
			t.Fatal("actual returned-record prototype source C UNREACHED")
		}
		reached = true
		// A detached factory description cannot change use or cut and retain
		// the actual Effects interest. No query/current vector is reconstructed.
		copy := *d
		copy.use.consumer = copy.use.operation
		if validDescriptorGetUse(&copy.use, recipe.memberSource.parent, recipe.memberSource.candidate.cut) {
			t.Fatal("wrong semantic consumer acquired noncoercing Get Effects interest")
		}
		copy = *d
		copy.use.cut.reading = nil
		if validDescriptorGetUse(&copy.use, recipe.memberSource.parent, recipe.memberSource.candidate.cut) {
			t.Fatal("copied field cut acquired noncoercing Get Effects interest")
		}
	}
	if !reached {
		t.Fatal("actual original noncoercing descriptor Get role UNREACHED")
	}
}

// Noncoercing use does not make a preceding Get noninvoking. An accessor
// descriptor lacks an own value field, so its record may invoke an installed
// Object.prototype.value getter. A function returned by that getter is dormant.
func TestDescriptorReturnedRecordPrototypeGetDonors(t *testing.T) {
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"inherited-getter", `export{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}`, true},
		{"immediate-call-donor", `export{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return (()=>document.title)()}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}`, true},
		{"returned-function-dormant", `export{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return ()=>document.title}});return typeof Object.getOwnPropertyDescriptor(value,'code')?.value}`, false},
		{"own-value-shadow", `export{};const target={code:1};export function probe(){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(target,'code')?.value===1}`, false},
		{"absent-optional-chain", `export{};const target={};export function probe(){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(target,'missing')?.value===1}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			descriptorContractCollection(t, row.source, func(collection *projectCallableCollection, analysis callableAnalysis) {
				descriptorContractBrowser(t, analysis, row.browser)
				kind := descriptorStrictComparisonEffects
				if row.name == "returned-function-dormant" {
					kind = descriptorTypeofEffects
				}
				assertOriginalDescriptorGetUseCurrent(t, collection, kind)
			})
		})
	}
}

// Invocation and aliases retain complete source provenance. A compared result
// elsewhere in a body cannot lend its narrower interest to either operation.
func TestDescriptorStrongSourceUsesRetainReplacementDonors(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"invoke", `export{};function original(){return 'original'}function replacement(){return document.title}const target={value:original};target.value=replacement;export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.value()}`},
		{"alias", `export{};function original(){return 'original'}function replacement(){return document.title}const target={value:original};target.value=replacement;export function probe(){const descriptor=Object.getOwnPropertyDescriptor(target,'value');const method=descriptor?.value;return method()}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			descriptorContractCollection(t, row.source, func(collection *projectCallableCollection, analysis callableAnalysis) {
				descriptorContractBrowser(t, analysis, true)
				for _, recipe := range collection.work.operationRecipes {
					if recipe.memberSource != nil && recipe.memberSource.getEffects != nil && recipe.memberSource.getEffects.descriptor != nil && recipe.memberSource.getEffects.descriptor.use.kind != descriptorFullSource {
						t.Fatal("invocation/alias borrowed noncoercing descriptor use")
					}
				}
			})
		})
	}
}
