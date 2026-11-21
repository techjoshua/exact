package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

const symbolPrimitiveModuleInput = `export{};const incompatibleTag=Symbol.for('@exactjs/component-input-incompatibility');export function probe(value:unknown){if(typeof value!=='object'||value===null)return false;return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value===true}`

func withSymbolPrimitiveCollection(t *testing.T, source string, inspect func(*projectCallableCollection, *ast.SourceFile)) {
	t.Helper()
	withReflectiveRelevanceSource(t, "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\n"+source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file) // First normal resolve only; unrelated target roles can remain pending.
		inspect(collection, file)
	})
}

// Unpaid input/compiler work and local/replaced/mixed callees cannot become a
// primitive result merely by spelling. These are real collector intervals; no
// positive receipt or pending flag is installed by the tests.
func TestSelectedSymbolPrimitiveRefusedSources(t *testing.T) {
	for _, row := range []struct {
		name, source string
		dynamic      bool
	}{
		{"dynamic-source-pending", `export{};const spelling='k';const incompatibleTag=Symbol.for(spelling);export function probe(value:object){return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value}`, true},
		{"local-shadow", `export{};const Symbol={for(_key:string){document.title;return 'local'}};const incompatibleTag=Symbol.for('k');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value}`, false},
		{"modeled-replacement", `export{};const original=Symbol.for;Symbol.for=(key:string)=>{document.title;return original(key)};const incompatibleTag=Symbol.for('k');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value}`, false},
		{"mixed-slot", `export{};declare const choice:boolean;const original=Symbol.for;Symbol.for=choice?original:((key:string)=>{document.title;return original(key)});const incompatibleTag=Symbol.for('k');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value}`, false},
		{"unsupported-entry-alias", `export{};const make=Symbol.for;const incompatibleTag=make('k');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,incompatibleTag)?.value}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSymbolPrimitiveCollection(t, row.source, func(collection *projectCallableCollection, file *ast.SourceFile) {
				var initializer *ast.Node
				walkNode(file.AsNode(), func(n *ast.Node) bool {
					if ast.IsVariableDeclaration(n) && n.Name() != nil && n.Name().Text() == "incompatibleTag" {
						initializer = n.Initializer()
					}
					return true
				})
				if initializer == nil {
					t.Fatal("original refused source initializer absent")
				}
				dynamicRetained := false
				for _, recipe := range collection.work.operationRecipes {
					if recipe.key.operation != initializer || recipe.callResult == nil {
						continue
					}
					for _, value := range recipe.delta.exposures {
						if value.endpoint.nativePrimitive != nil && recipe.delta.extracted && collection.work.nativePrimitiveSourceCurrent(value.endpoint.nativePrimitive) {
							t.Fatal("unsupported/mixed source manufactured complete primitive DATA")
						}
					}
					if row.dynamic {
						request, supported := nativePrimitiveInputRequest(initializer, recipe.key.declaration)
						if supported && request.producer.operation != nil && operationContainsRequest(recipe.delta.required, request) {
							_, registered := collection.work.operationRecipes[request.producer]
							data, applied := collection.work.nativePrimitiveDataApplied(request)
							dynamicRetained = registered && applied && data.delta.extracted
						}
					}
				}
				if row.dynamic && !dynamicRetained {
					t.Fatal("actual dynamic input DATA dependency UNREACHED")
				}
			})
		})
	}
}
