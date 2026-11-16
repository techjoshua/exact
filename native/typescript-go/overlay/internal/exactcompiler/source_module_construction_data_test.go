package exactcompiler

import (
	"fmt"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This protects the existing source-value domain at an immutable module binding.
// The actual native result reader issues binding DATA; these tests do not install
// an initializer result, module summary delivery, frame or normal allocation.
func TestModuleExistingCreationDataOriginalInput(t *testing.T) {
	for _, row := range []struct{ name, initializer string }{
		{"literal-object", `{value:1}`},
		{"stored-body-creation", `{value:()=>document.title}`},
		{"empty-array", `[]`},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := fmt.Sprintf(`export{};const target:object=%s;export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.value}`, row.initializer)
			withModuleCreationDataWork(t, source, func(collection *projectCallableCollection, result callableAnalysis, binding *ast.Node) {
				reached := false
				for _, recipe := range collection.work.operationRecipes {
					if recipe.callResult == nil || recipe.callResult.binding != binding {
						continue
					}
					id, known := collection.work.operationIDs[recipe.key]
					if !known || !recipe.delta.extracted || len(recipe.delta.exposures) != 1 {
						t.Fatal("original module binding DATA extraction UNREACHED")
					}
					state := &collection.work.operations[id.index]
					if len(state.moduleInputs) != 1 {
						t.Fatal("source creation lost its independent initializer requirement")
					}
					input := state.moduleInputs[0]
					consumer := collection.work.memberNodes[recipe.key.declaration]
					dependency := collection.work.stagedRequired[sourceStagedDependencyKey{consumer, input.edge}]
					if input.producer < 0 || dependency == nil || dependency.invalid || dependency.projectionPending || dependency.consumed != collection.work.stagedRevisions[input.producer] || !collection.facts[input.producer].staged.ready || collection.facts[input.producer].staged.operationsPending {
						t.Fatal("genuine initializer Effects/summary delivery UNREACHED")
					}
					data, applied := collection.work.stagedCallResultData(recipe.callResult.request)
					if !applied || !data.delta.extracted {
						t.Fatal("original native input DATA delivery UNREACHED")
					}
					alternative := recipe.delta.exposures[0]
					endpoint := alternative.endpoint
					if alternative.creating != nil {
						t.Fatal("module source construction invented a creating activation")
					}
					if ast.IsObjectLiteralExpression(binding.Initializer()) {
						if endpoint.kind != relativeEndpointModuleConstruction || endpoint.expression != nil || endpoint.moduleConstruction == nil || endpoint.moduleConstruction.source.binding != binding || endpoint.moduleConstruction.source.initializer != binding.Initializer() || !sameOperationRequest(endpoint.moduleConstruction.source.request, recipe.callResult.request) {
							t.Fatal("typed module construction lost its original association")
						}
					} else if endpoint.kind != relativeEndpointExpression || endpoint.expression != binding.Initializer() || endpoint.producer != binding || endpoint.get != recipe.key.operation || endpoint.cut != recipe.callResult.request.cut {
						t.Fatal("module source construction changed its original association")
					}
					reached = true
				}
				if !reached {
					t.Fatal("original module binding input reader UNREACHED")
				}
				t.Log("original module binding DATA, initializer summary and applied input delivery verified")
				if len(result.pending) != 0 {
					t.Fatalf("original collector still pending after local module DATA checks: %#v", result.pending)
				}
			})
		})
	}
}

// A static identifier field has its own original DATA producer. Capturing
// callable bodies still require their separate source-construction contract.
func TestModuleCreationFieldDataAndUnsupportedCaptures(t *testing.T) {
	for _, initializer := range []string{`{value:stored}`, `{value:()=>stored()}`, `{value(){return stored()}}`} {
		t.Run(initializer, func(t *testing.T) {
			source := fmt.Sprintf(`export{};const stored=()=>document.title;const target=%s;export function probe(){return Object.getOwnPropertyDescriptor(target,'value')?.value}`, initializer)
			withModuleCreationDataWork(t, source, func(collection *projectCallableCollection, _ callableAnalysis, binding *ast.Node) {
				reached := false
				for _, recipe := range collection.work.operationRecipes {
					if recipe.callResult == nil || recipe.callResult.binding != binding {
						continue
					}
					reached = true
					if initializer == "{value:stored}" {
						data, applied := collection.work.stagedCallResultData(recipe.callResult.request)
						if !applied || !data.delta.extracted || len(data.delta.exposures) != 1 || recipe.callResult.moduleConstruction == nil || len(recipe.delta.required) != 1 {
							t.Fatal("original identifier field DATA delivery UNREACHED")
						}
						fields, known, pending := moduleConstructionFieldSources(data.delta.exposures[0].endpoint, "value")
						child, childApplied := collection.work.stagedCallResultData(recipe.delta.required[0])
						if !known || pending || len(fields) == 0 || !childApplied || !child.delta.extracted || len(recipe.callResult.moduleConstruction.fields) != 1 || !sameOperationRequest(recipe.delta.required[0], recipe.callResult.moduleConstruction.fields[0].required) || recipe.delta.required[0].producer.operation != recipe.callResult.moduleConstruction.fields[0].operand {
							t.Fatal("identifier field lost its independently applied operand DATA")
						}
					} else if recipe.delta.extracted {
						t.Fatal("unprovided captured field DATA became completed module construction")
					}
				}
				if !reached {
					t.Fatal("actual captured-field binding producer UNREACHED")
				}
			})
		})
	}
}

func withModuleCreationDataWork(t *testing.T, source string, inspect func(*projectCallableCollection, callableAnalysis, *ast.Node)) {
	t.Helper()
	withReflectiveRelevanceSource(t, "/// <reference lib=\"dom\" />\n"+source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		var binding *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsVariableDeclaration(n) && n.Name() != nil && n.Name().Text() == "target" {
				binding = n
			}
			return true
		})
		if binding == nil {
			t.Fatal("original target declaration absent")
		}
		collection.collect()
		result := collection.resolve(file)
		inspect(collection, result, binding)
	})
}
