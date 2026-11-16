package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A returned descriptor carries the original native input association. A later
// reader's lexical bindings cannot resolve the helper's input parameter anew.
// These are original collector paths, not calls to descriptorFieldDonors with
// a manually installed source frame or a raw target substituted for the view.
func TestDescriptorBoundInputReturnedDonor(t *testing.T) {
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"bound-parameter-and-alias", `export{};function descriptorOf(input:{value:()=>string}){const descriptor=Object.getOwnPropertyDescriptor(input,'value');const alias=descriptor;return alias}export function probe(){const capture={read(){return document.title}};const target={value:()=>capture.read()};const result=descriptorOf(target);return result?.value()}`, true},
		{"returned-callable-stays-dormant", `export{};function descriptorOf(input:{value:()=>string}){const descriptor=Object.getOwnPropertyDescriptor(input,'value');const alias=descriptor;return alias}export function probe(){const capture={read(){return document.title}};const target={value:()=>capture.read()};const result=descriptorOf(target);return result?.value}`, false},
		{"known-beside-unknown", `export{};declare const choice:boolean;declare const external:{value:()=>string};function descriptorOf(input:{value:()=>string}){const descriptor=Object.getOwnPropertyDescriptor(input,'value');const alias=descriptor;return alias}export function probe(){const capture={read(){return document.title}};const target=choice?{value:()=>capture.read()}:external;const result=descriptorOf(target);return result?.value()}`, true},
		{"factory-returned-view", `export{};function descriptorOf(input:{value:()=>string}){const descriptor=Object.getOwnPropertyDescriptor(input,'value');const alias=descriptor;return alias}function relay(input:{value:()=>string}){return descriptorOf(input)}export function probe(){const capture={read(){return document.title}};const target={value:()=>capture.read()};const result=relay(target);return result?.value()}`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			descriptorContractCollection(t, row.source, func(collection *projectCallableCollection, result callableAnalysis) {
				inputApplied, readerApplied := false, false
				for _, recipe := range collection.work.operationRecipes {
					if recipe.callResult == nil || recipe.callResult.nativeDescriptor == nil || !collection.work.nativeDescriptorResultCurrent(recipe) {
						continue
					}
					intent := recipe.callResult.nativeDescriptor
					original := intent.actuals[0].expression
					if original == nil || !ast.IsIdentifier(original) || original.Text() != "input" {
						continue
					}
					// Consume only real input requests retained by the selected native
					// result recipe. Effects closure is not input DATA delivery.
					for _, required := range recipe.delta.required {
						if required.producer.operation != original {
							continue
						}
						data, applied := collection.work.stagedCallResultData(required)
						inputApplied = inputApplied || applied && data.delta.extracted
					}
					// A returned view's external reader belongs to the outer authored
					// return recipe. Follow only its actual APPLIED DATA chain back
					// to this original native producer, never an unrelated reader.
					for _, returned := range collection.work.operationRecipes {
						if !descriptorBoundOuterReturn(returned) || !validStagedCallResultRecipe(returned) || !returned.delta.extracted || returned.callResult.generation != collection.work.operationGeneration {
							continue
						}
						for index, reading := range returned.callResult.readings {
							get := reading.reading.operation
							if reading.consumer != returned.key.declaration || get == nil || !ast.IsPropertyAccessExpression(get) || !ast.IsIdentifier(get.Expression()) || get.Expression().Text() != "result" || get.Name() == nil || get.Name().Text() != "value" || enclosingCallableNode(get) != returned.key.declaration {
								continue
							}
							cut := returned.callResult.readCuts[index]
							parent := sourceStagedOperationRequest{producer: reading.reading, consumer: reading.consumer}
							if cut.operation != get || cut.reading != get || !collection.work.stagedMemberResultReading(reading, parent, cut) {
								continue
							}
							data, applied := collection.work.stagedCallResultData(reading)
							if !applied || !data.delta.extracted {
								continue
							}
							for _, alternative := range data.delta.exposures {
								view := alternative.endpoint.descriptorView
								if alternative.creating == nil && alternative.endpoint.kind == relativeEndpointDescriptorView && view != nil && sameDescriptorRetrieval(&view.source, intent) && collection.work.descriptorViewSourceCurrent(view) && collection.work.descriptorPayloadChild(returned, view, nil) {
									readerApplied = true
								}
							}
						}
					}
				}
				if !inputApplied || !readerApplied {
					t.Fatalf("original bound input DATA/later reader UNREACHED: input=%v reader=%v", inputApplied, readerApplied)
				}
				descriptorContractBrowser(t, result, row.browser)
			})
		})
	}
}

// descriptorBoundOuterReturn selects the actual result initializer in probe.
// The descriptor payload child validator authenticates every inner transfer.
func descriptorBoundOuterReturn(recipe sourceStagedOperationRecipe) bool {
	call, owner := recipe.key.operation, recipe.key.declaration
	if recipe.callResult == nil || call == nil || !ast.IsCallExpression(call) || owner == nil || owner.Name() == nil || owner.Name().Text() != "probe" || enclosingCallableNode(call) != owner || call.Parent == nil || !ast.IsVariableDeclaration(call.Parent) || call.Parent.Initializer() != call || call.Parent.Name() == nil || call.Parent.Name().Text() != "result" {
		return false
	}
	return sameOperationRequest(recipe.callResult.request, stagedCallResultRequest(call, owner))
}
