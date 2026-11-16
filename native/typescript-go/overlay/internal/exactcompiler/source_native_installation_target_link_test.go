package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Exercise the actual original collector and its retained same-field links.
// Only target SOURCE transport is qualified here. Whole-field completeness
// and unrelated population suppliers remain the unchanged terminal's contract.
func TestNativeInstallationTargetMutationLinkProductionEntry(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		targetReached, coverageRefuserReached := false, false
		for _, recipe := range work.operationRecipes {
			if recipe.mutationData == nil || recipe.mutationData.installation == nil {
				continue
			}
			for _, link := range recipe.fieldMutationLinks {
				if link.nativeComponent != nativeInstallationMutationTarget && link.nativeComponent != nativeInstallationMutationCallee {
					continue
				}
				if !work.validOriginalGetMutationFieldLink(recipe, link) {
					t.Fatal("actual direct component link invalid")
				}
				source, interest, current := work.nativeInstallationMutationGetSource(recipe.mutationData.installation, link.nativeComponent)
				if !current || source == nil || interest == nil {
					t.Fatal("actual direct component SOURCE currentness UNREACHED")
				}
				data, sourceApplied := work.originalGetMutationData(source)
				_, interestApplied := work.originalGetMutationInterestData(interest)
				if !sourceApplied || !interestApplied || !data.extracted || !originalGetMutationDescriptionComplete(source) {
					t.Fatal("actual direct component SOURCE/interest local X/APPLIED UNREACHED")
				}
				if link.nativeComponent == nativeInstallationMutationTarget {
					if source.nativeTarget == nil || source.coverage.producer.operation != nil || len(source.population) != 0 {
						t.Fatal("real target no-coverage contract UNREACHED")
					}
					if !operationContainsRequest(recipe.delta.required, originalGetMutationRequest(source)) || !operationContainsRequest(recipe.delta.required, originalGetMutationInterestRequest(interest)) || !operationContainsRequest(recipe.delta.required, source.request) || !operationContainsRequest(recipe.delta.required, source.nativeTarget.root) || !operationContainsRequest(recipe.delta.required, recipe.mutationData.installation.algorithm) {
						t.Fatal("target link lost original SOURCE/interest/reader/root/algorithm debts")
					}
					root := work.operationRecipes[source.nativeTarget.root.producer].nativeGet
					if root == nil || !operationContainsRequest(data.required, nativeRootDebtRequest(root, "callee-get")) || !operationContainsRequest(data.required, source.request) {
						t.Fatal("target SOURCE lost original callee/eager-target debt")
					}
					wrong := link
					wrong.generation = &projectGeneration{}
					if work.validOriginalGetMutationFieldLink(recipe, wrong) {
						t.Fatal("foreign target link generation admitted")
					}
					fresh := beginProjectCallableCollection(cache, cache.owner)
					if fresh.work.validOriginalGetMutationFieldLink(recipe, link) {
						fresh.close()
						t.Fatal("fresh work inherited target link authority")
					}
					fresh.close()
					targetReached = true
				} else {
					if source.coverage.producer.operation == nil {
						t.Fatal("real nonzero callee coverage UNREACHED")
					}
					wrong := recipe
					wrong.delta = cloneOperationDelta(recipe.delta)
					wrong.delta.required = nil
					for _, request := range recipe.delta.required {
						if !sameOperationRequest(request, source.coverage) {
							wrong.delta.required = append(wrong.delta.required, request)
						}
					}
					if len(wrong.delta.required) != len(recipe.delta.required)-1 || work.validOriginalGetMutationFieldLink(wrong, link) {
						t.Fatal("missing real nonzero coverage accepted")
					}
					if !work.validOriginalGetMutationFieldLink(recipe, link) {
						t.Fatal("local refusal control mutated original link")
					}
					coverageRefuserReached = true
				}
			}
		}
		if !targetReached || !coverageRefuserReached {
			t.Fatalf("original target link/nonzero coverage control UNREACHED: target=%t callee=%t", targetReached, coverageRefuserReached)
		}
	})
}
