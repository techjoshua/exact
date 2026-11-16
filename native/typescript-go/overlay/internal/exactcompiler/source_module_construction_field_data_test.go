package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The field identifier belongs to the original initializer, not to the later
// descriptor reader. Its independently produced DATA must be delivered before
// conditional field provenance can leave the module binding producer.
func TestModuleConstructionOriginalFieldData(t *testing.T) {
	const source = `export{};function stored(){return document.title}const target={run:stored};export function probe(){return Object.getOwnPropertyDescriptor(target,'run')?.value}`
	var detached sourceRelativeEndpoint
	withModuleConstructionFieldWork(t, source, func(collection *projectCallableCollection, result callableAnalysis, binding, stored *ast.Node) {
		if len(result.pending) != 0 {
			t.Fatalf("original field DATA collector pending; current delivery UNREACHED: %#v", result.pending)
		}
		reached := false
		for _, recipe := range collection.work.operationRecipes {
			if recipe.callResult == nil || recipe.callResult.binding != binding || recipe.callResult.moduleConstruction == nil {
				continue
			}
			data, applied := collection.work.stagedCallResultData(recipe.callResult.request)
			if !applied || !data.delta.extracted || len(data.delta.exposures) != 1 {
				t.Fatal("real original module field DATA delivery UNREACHED")
			}
			endpoint := data.delta.exposures[0].endpoint
			values, known, pending := moduleConstructionFieldSources(endpoint, "run")
			if !known || pending || len(values) != 1 || values[0].endpoint.kind != relativeEndpointExpression || values[0].endpoint.expression != stored || values[0].creating != nil {
				t.Fatal("original module callable field association lost or invented activation")
			}
			plan := recipe.callResult.moduleConstruction
			if len(plan.fields) != 1 || plan.fields[0].ordinal != 0 || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], plan.fields[0].required) || recipe.delta.required[0].producer.operation != plan.fields[0].operand || recipe.delta.required[0].producer.declaration != plan.module {
				t.Fatal("original field operand requirement was normalized into reader context")
			}
			child, childApplied := collection.work.stagedCallResultData(recipe.delta.required[0])
			if !childApplied || !child.delta.extracted {
				t.Fatal("actual original field child APPLIED UNREACHED")
			}
			id, adopted := collection.work.operationIDs[recipe.key]
			if !adopted || len(collection.work.operations[id.index].moduleInputs) != 1 {
				t.Fatal("construction dropped independent initializer Effects/module membership")
			}
			if endpoint.expression != nil || endpoint.moduleConstruction == nil || endpoint.kind != relativeEndpointModuleConstruction {
				t.Fatal("conditional construction became raw AST/normal receiver")
			}
			copy := cloneSourceRelativeEndpoint(endpoint)
			if !sameOperationEndpoint(copy, endpoint) || copy.moduleConstruction == endpoint.moduleConstruction || &copy.moduleConstruction.fields[0] == &endpoint.moduleConstruction.fields[0] {
				t.Fatal("construction description clone lost semantic equality or slice ownership")
			}
			copy.moduleConstruction.fields[0].alternatives[0].endpoint = sourceRelativeEndpoint{kind: relativeEndpointUndefined}
			if sameOperationEndpoint(copy, endpoint) || endpoint.moduleConstruction.fields[0].alternatives[0].endpoint.expression != stored {
				t.Fatal("field payload equality/clone isolation failed")
			}
			detached = cloneSourceRelativeEndpoint(endpoint)
			reached = true
		}
		if !reached {
			t.Fatal("actual original static field producer UNREACHED")
		}
	})
	if _, known, pending := moduleConstructionFieldSources(detached, "run"); known || !pending {
		t.Fatal("released generation construction retained current field access")
	}
}

// Unsupported construction siblings remain explicit debt. The actual known
// prefix is retained; its existence cannot turn the full construction empty or
// complete. This is not a count-only or syntactic absence proof.
func TestModuleConstructionUnsupportedSiblingRetainsPrefix(t *testing.T) {
	const source = `export{};declare const external:object;function stored(){return document.title}const target={run:stored,...external};export function probe(){return Object.getOwnPropertyDescriptor(target,'run')?.value}`
	withModuleConstructionFieldWork(t, source, func(collection *projectCallableCollection, _ callableAnalysis, binding, stored *ast.Node) {
		reached := false
		for _, recipe := range collection.work.operationRecipes {
			if recipe.callResult == nil || recipe.callResult.binding != binding || recipe.callResult.moduleConstruction == nil || len(recipe.delta.exposures) != 1 {
				continue
			}
			values, known, pending := moduleConstructionFieldSources(recipe.delta.exposures[0].endpoint, "run")
			if !known || !pending || recipe.delta.extracted {
				t.Fatal("unsupported sibling construction debt erased")
			}
			found := false
			for _, value := range values {
				found = found || value.endpoint.expression == stored
			}
			if !found {
				t.Fatal("actual delivered known field prefix UNREACHED")
			}
			reached = true
		}
		if !reached {
			t.Fatal("original unsupported construction producer UNREACHED")
		}
	})
}

func withModuleConstructionFieldWork(t *testing.T, source string, inspect func(*projectCallableCollection, callableAnalysis, *ast.Node, *ast.Node)) {
	t.Helper()
	withReflectiveRelevanceSource(t, "/// <reference lib=\"dom\" />\n"+source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		var binding, stored *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsVariableDeclaration(n) && n.Name() != nil && n.Name().Text() == "target" {
				binding = n
			}
			if ast.IsFunctionDeclaration(n) && n.Name() != nil && n.Name().Text() == "stored" {
				stored = n
			}
			return true
		})
		if binding == nil || stored == nil {
			t.Fatal("original construction/field declaration absent")
		}
		collection.collect()
		result := collection.resolve(file)
		inspect(collection, result, binding, stored)
	})
}
