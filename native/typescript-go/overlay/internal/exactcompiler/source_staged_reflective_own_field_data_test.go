package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This original collector control protects callable baseline delivery through
// the independent own-writer population. It supplies no input/ACK/proof and
// makes no assertion that the separate prototype operation population is paid.
func TestReflectiveFinishedGetOwnFieldData(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		reached := false
		for _, recipe := range work.operationRecipes {
			source := recipe.nativeGet
			if source == nil || source.installation == nil || source.descriptorGet == nil || !ast.IsObjectLiteralExpression(source.descriptorGet) {
				continue
			}
			projection := source.request
			projection.producer.kind = relativeDemandDirectExposure
			projection.producer.selector = sourceStagedOperationSelector{occurrence: source.descriptorGet, field: "get"}
			roles, valid := fieldSourceRequests(projection)
			if !valid || recipe.key != roles.ownWriters.producer {
				continue
			}
			id, adopted := work.operationIDs[recipe.key]
			if !adopted || id.epoch != work.operationEpoch || id.index == 0 {
				continue
			}
			state := &work.operations[id.index]
			known := false
			for _, alternative := range state.delta.exposures {
				node := alternative.endpoint.expression
				known = known || node != nil && ast.IsFunctionExpression(node) && node.Parent != nil && ast.IsPropertyAssignment(node.Parent) && node.Parent.AsPropertyAssignment().Initializer == node
			}
			subscriber := state.subscribers[sourceStagedOperationConsumer{roles.ownWriters.consumer, roles.ownWriters.edge}]
			if state.revision == 0 || !state.delta.extracted || !known || subscriber == nil || subscriber.blocked || !sameOperationRequest(subscriber.request, roles.ownWriters) || subscriber.applied != state.revision {
				t.Fatal("original finished-Get own callable DATA/APPLIED delivery UNREACHED")
			}
			reached = true
		}
		if !reached {
			t.Fatal("original descriptor own-field DATA producer UNREACHED")
		}
	})
}
