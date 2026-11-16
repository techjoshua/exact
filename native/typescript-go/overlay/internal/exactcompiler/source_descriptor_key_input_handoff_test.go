package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The full original Get, C, body/currentness and APPLIED/whole-zero assertions
// run before copied metadata refusers. No test issues a query, selects a native
// method, installs a binder or mutates an operation observation/current flag.
func TestDescriptorOriginalAppliedPrimitiveKey(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"original-module-key", `export{};const tag=Symbol.for('descriptor-source-use');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,tag)?.value===true}`},
		{"immutable-key-alias", `export{};const tag=Symbol.for('descriptor-source-use');const alias=tag;export function probe(value:object){return Object.getOwnPropertyDescriptor(value,alias)?.value===true}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			var retained *callableEffectWork
			var original sourceStagedOperationRecipe
			descriptorContractCollection(t, row.source, func(collection *projectCallableCollection, result callableAnalysis) {
				descriptorContractBrowser(t, result, false)
				assertOriginalDescriptorGetUseCurrent(t, collection, descriptorStrictComparisonEffects)
				work := &collection.work
				reached := false
				for _, recipe := range work.operationRecipes {
					if recipe.nativeGet == nil || !validDescriptorRetrieval(recipe.nativeGet) || recipe.key != nativeRootDebtRequest(recipe.nativeGet, "algorithm").producer {
						continue
					}
					input, applied := work.descriptorPrimitiveKeyInput(recipe, recipe.nativeGet)
					if !applied {
						t.Fatal("actual original key DATA/source/current/APPLIED handoff UNREACHED")
					}
					id := work.operationIDs[recipe.key]
					enumeration := work.operations[id.index].descriptorEnumeration
					if enumeration == nil || !enumeration.represented || !recipe.delta.extracted {
						t.Fatal("actual once-only descriptor algorithm completion UNREACHED")
					}
					if input.construction || input.request.producer.operation == nil || !operationContainsRequest(recipe.delta.required, input.request) {
						t.Fatal("key input lost independent original DATA requirement")
					}
					// Copying detached alternatives cannot create missing SOURCE membership.
					copied := cloneDescriptorInputData(input)
					copied.alternatives = append(copied.alternatives, sourceStagedOperationAlternative{endpoint: sourceRelativeEndpoint{kind: relativeEndpointUnknown}})
					if descriptorPrimitiveKeyAlternatives(copied) {
						t.Fatal("known primitive prefix erased unknown key sibling")
					}
					copied = cloneDescriptorInputData(input)
					copied.alternatives[0].creating = &sourceRelativeInputEdge{}
					if descriptorPrimitiveKeyAlternatives(copied) {
						t.Fatal("creating association became a context-free key")
					}
					copied = cloneDescriptorInputData(input)
					copied.alternatives[0].endpoint.nativePrimitive.method = nil
					if descriptorPrimitiveKeyAlternatives(copied) {
						t.Fatal("foreign native method retained primitive source membership")
					}
					copied = cloneDescriptorInputData(input)
					copied.request.edge += ":foreign-reader"
					if work.descriptorInputSnapshotCurrent(recipe.nativeGet.descriptorRead, 1, copied) {
						t.Fatal("copied key reader became APPLIED")
					}
					wrong := recipe
					wrong.delta = cloneOperationDelta(recipe.delta)
					wrong.delta.required = nil
					if _, ok := work.descriptorPrimitiveKeyInput(wrong, recipe.nativeGet); ok {
						t.Fatal("key DATA without original required membership was adopted")
					}
					original, retained = recipe, work
					reached = true
				}
				if !reached {
					t.Fatal("original selected descriptor algorithm UNREACHED")
				}
			})
			if retained == nil {
				t.Fatal("genuine selected key lifecycle UNREACHED")
			}
			if _, ready := retained.descriptorPrimitiveKeyInput(original, original.nativeGet); ready {
				t.Fatal("released generation retained primitive key handoff")
			}
		})
	}
}

// Existing actual dynamic, replaced, mixed and entry-alias Symbol sources keep
// their independent refusal controls. This caller additionally verifies that a
// non-primitive descriptor input cannot gain the new key component disposition.
func TestDescriptorCoercionKeyKeepsOriginalSourceDonor(t *testing.T) {
	const source = `export{};const key:any={toString:()=>document.title};export function probe(value:object){return Object.getOwnPropertyDescriptor(value,key)?.value===true}`
	withReflectiveRelevanceSource(t, "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\n"+source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		result := collection.resolve(file)
		descriptorContractBrowser(t, result, true)
		reached := false
		for _, recipe := range collection.work.operationRecipes {
			if recipe.nativeGet == nil || !validDescriptorRetrieval(recipe.nativeGet) || recipe.key != nativeRootDebtRequest(recipe.nativeGet, "algorithm").producer {
				continue
			}
			if _, ready := collection.work.descriptorPrimitiveKeyInput(recipe, recipe.nativeGet); ready {
				t.Fatal("object coercion source gained primitive key disposition")
			}
			reached = true
		}
		if !reached {
			t.Fatal("original object-key algorithm source UNREACHED")
		}
	})
}
