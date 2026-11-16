package exactcompiler

import "testing"

// These are original collector paths. A typed construction description alone
// cannot pass: the original field/capture DATA children and later descriptor
// reader must be delivered before the local source relation is usable.
func TestLocalConstructionCapturedFieldSource(t *testing.T) {
	for _, row := range []struct {
		name, use string
		browser   bool
	}{
		{"dormant", "return descriptor?.value", false},
		{"invoked", "return descriptor?.value()", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			var detached sourceRelativeEndpoint
			source := `export{};function descriptorOf(input:{value:()=>string}){return Object.getOwnPropertyDescriptor(input,'value')}export function probe(){const capture={read(){return document.title}};const target={value:()=>capture.read()};const descriptor=descriptorOf(target);` + row.use + `}`
			descriptorContractCollection(t, source, func(collection *projectCallableCollection, result callableAnalysis) {
				constructionApplied, captureApplied := false, false
				for _, recipe := range collection.work.operationRecipes {
					if recipe.callResult == nil || recipe.callResult.moduleConstruction == nil || recipe.callResult.moduleConstruction.localOwner == nil || !validLocalConstructionDataRecipe(recipe) || !recipe.delta.extracted {
						continue
					}
					plan := recipe.callResult.moduleConstruction
					if plan.binding.Name().Text() != "target" {
						continue
					}
					{
						data, applied := collection.work.stagedCallResultData(recipe.callResult.request)
						if !applied || !data.delta.extracted {
							continue
						}
						for _, alternative := range data.delta.exposures {
							fields, known, pending := moduleConstructionFieldSources(alternative.endpoint, "value")
							if !known || pending {
								continue
							}
							constructionApplied = true
							copy := cloneSourceRelativeEndpoint(alternative.endpoint)
							if !sameOperationEndpoint(copy, alternative.endpoint) || copy.moduleConstruction == alternative.endpoint.moduleConstruction || copy.expression != nil || copy.kind != relativeEndpointModuleConstruction {
								t.Fatal("conditional local source lost clone ownership or gained raw authority")
							}
							detached = copy
							for _, field := range fields {
								value := field.endpoint.constructionCallable
								if value == nil || value.pending || value.source == nil || len(value.captures) != 1 || value.captures[0].role.binding == nil || value.captures[0].role.binding.Name().Text() != "capture" {
									continue
								}
								copy := cloneConstructionCallableValue(value)
								if !sameConstructionCallableValue(copy, value) || copy == value || copy.source == value.source || &copy.captures[0] == &value.captures[0] {
									t.Fatal("construction callable/capture description aliases its clone")
								}
								copy.captures[0].pending = true
								if sameConstructionCallableValue(copy, value) || value.captures[0].pending {
									t.Fatal("construction capture equality or mutation isolation failed")
								}
								capture := value.captures[0]
								child, delivered := collection.work.stagedCallResultData(capture.required)
								captureApplied = captureApplied || delivered && child.delta.extracted && !capture.pending && len(capture.alternatives) != 0
							}
						}
					}
				}
				if !constructionApplied || !captureApplied {
					t.Fatalf("original local construction/field capture DATA UNREACHED: construction=%v capture=%v", constructionApplied, captureApplied)
				}
				descriptorContractBrowser(t, result, row.browser)
			})
			if _, known, pending := moduleConstructionFieldSources(detached, "value"); known || !pending {
				t.Fatal("released local construction generation retained current donor access")
			}
		})
	}
}
