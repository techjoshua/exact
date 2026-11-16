package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Real canonical transfer entries share the actual Get/BODY edge. Different
// field specializations are not runtime alternatives of the requested field.
// Refusers below copy descriptions only; they never edit the analysis graph.
func TestOriginalGetterMutationFieldProjection(t *testing.T) {
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
				if getter.installed == nil || getter.installed.exposure.epoch != work.operationEpoch || getter.installed.exposure.index == 0 || int(getter.installed.exposure.index) >= len(work.operations) {
					continue
				}
				consumer, known := work.memberNodes[getter.demand.request.consumer]
				if !known || consumer < 0 || consumer >= len(collection.facts) {
					continue
				}
				transfers := collection.facts[consumer].staged.mutationTransfers[getter.edge]
				exposure := work.operationRecipes[work.operations[getter.installed.exposure.index].key]
				for _, field := range exposure.delta.required {
					if _, valid := fieldSourceParent(field); !valid {
						continue
					}
					matching, foreign := false, false
					var original sourceRelativeMutationTransfer
					for _, transfer := range transfers {
						same, valid := work.relativeMutationTransferProjection(transfer, field)
						if !valid {
							continue
						}
						if same && transfer.represented && transfer.pending == nil && len(transfer.sources) != 0 {
							matching, original = true, transfer
						} else if !same {
							foreign = true
						}
					}
					if !matching || !foreign {
						continue
					}
					reader := sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}
					delta, _, complete := work.originalGetterMutationOutputs(collection.facts, field, reader, slot)
					if !complete || !delta.extracted {
						t.Fatal("actual matching BODY output blocked by another field projection")
					}
					covered := false
					for _, residual := range delta.residuals {
						m := residual.mutation
						if m == nil || !sameOperationRequest(m.field, field) || !work.relativeFieldMutationSourceCurrent(m) {
							t.Fatal("foreign or noncurrent mutation output entered the requested field")
						}
						covered = covered || m.external != nil && m.externalActive
					}
					if !covered || !operationContainsRequest(delta.required, getter.demand.request) {
						t.Fatal("current matching BODY output or original Get debt UNREACHED")
					}
					reached = true
					bad := original
					bad.field.edge += ":foreign"
					if _, valid := work.relativeMutationTransferProjection(bad, field); valid {
						t.Fatal("unissued field projection header accepted")
					}
					bad = original
					bad.generation = nil
					if _, valid := work.relativeMutationTransferProjection(bad, field); valid {
						t.Fatal("missing original generation accepted")
					}
					bad = original
					bad.sources = append(append([]EnvironmentEffectSource(nil), original.sources...), EnvironmentEffectSource{})
					if _, valid := work.relativeMutationTransferProjection(bad, field); valid {
						t.Fatal("nonmutation atom was erased by projection classification")
					}
					pending := original
					pending.represented = false
					pending.pending = cloneRelativeFieldMutation(original.sources[0].relativeMutation)
					if same, valid := work.relativeMutationTransferProjection(pending, field); !valid || !same || pending.pending == nil || pending.represented {
						t.Fatal("matching pending projection lost its incomplete disposition")
					}
				}
			}
		}
		if !reached {
			t.Fatal("genuine same-edge matching and foreign field projections UNREACHED")
		}
	})
}
