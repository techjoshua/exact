package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original collector must supply the real installed Get, BODY transfer,
// canonical summary consumption and typed mutation outputs before refusers run.
// This local SOURCE control does not waive whole collector/Get closure.
func TestOriginalGetterMutationBodyOutputs(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		reached := false
		for index := 1; index < len(work.operations); index++ {
			for slot, getter := range work.operations[index].getters {
				guard := getter.installed
				if guard == nil || guard.exposure.epoch != work.operationEpoch || guard.exposure.index == 0 || int(guard.exposure.index) >= len(work.operations) {
					continue
				}
				exposure := work.operationRecipes[work.operations[guard.exposure.index].key]
				for _, field := range exposure.delta.required {
					if _, valid := fieldSourceParent(field); !valid {
						continue
					}
					reader := sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}
					delta, _, complete := work.originalGetterMutationOutputs(collection.facts, field, reader, slot)
					if !complete {
						continue
					}
					currentMutation := false
					for _, residual := range delta.residuals {
						currentMutation = currentMutation || residual.mutation != nil && residual.mutation.external != nil && residual.mutation.externalActive && work.relativeFieldMutationSourceCurrent(residual.mutation)
					}
					if !delta.extracted || !currentMutation || !operationContainsRequest(delta.required, getter.demand.request) {
						t.Fatal("original actual BODY mutation output/current/debt UNREACHED")
					}
					reached = true
					if _, _, accepted := work.originalGetterMutationOutputs(collection.facts, field, sourceStagedOperationID{}, slot); accepted {
						t.Fatal("foreign reader lifetime accepted")
					}
					if _, _, accepted := work.originalGetterMutationOutputs(collection.facts, field, reader, -1); accepted {
						t.Fatal("foreign getter slot accepted")
					}
					wrong := field
					wrong.edge += ":foreign"
					if _, _, accepted := work.originalGetterMutationOutputs(collection.facts, wrong, reader, slot); accepted {
						t.Fatal("foreign original field accepted")
					}
				}
			}
		}
		if !reached {
			t.Fatal("genuine installed BODY mutation output UNREACHED")
		}
	})
}
