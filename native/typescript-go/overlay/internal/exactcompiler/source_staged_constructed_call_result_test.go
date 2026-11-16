package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The actual New member owner encounters a possible reflective target returned
// by an original constructed Get. The demanded DATA reader must attach that
// existing producer before any recursive result acquisition. Passive discovery
// cannot invoke a future Set or grant the New's stronger selected category.
func TestStagedConstructedCallResultOriginalMember(t *testing.T) {
	const source = `const table=new WeakMap<object,object>();function factory(){return {}}function latent(key:object){Object.defineProperty(table.get(key)!,'WeakMap',{value:()=>document.title})}export function invoke(){factory();latent({});return new WeakMap()}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
		file := ast.GetSourceFileOfNode(creating)
		var site, original, reading *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				if enclosingCallableNode(node) == nil {
					site = node
				} else {
					original = node
				}
			}
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) {
				_, name := accessorReceiver(node.Expression())
				if name == "get" {
					reading = node
				}
			}
			return true
		})
		if site == nil || original == nil || reading == nil {
			t.Fatal("original producer/reader missing")
		}
		facts := stagedReturnSourceFacts(file)
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		visitImplicitAccessors(site, owner.checker, nil, owner, sourceStagedModuleOwner(site), nil, func(accessorCandidates) {})
		caller := work.memberNodes[enclosingCallableNode(original)]
		root, installed := work.registerStagedConstructionEffects(facts, caller, original, owner)
		if !installed {
			t.Fatal("original New source owner refused")
		}
		request := stagedCallResultRequest(reading, enclosingCallableNode(reading))
		recipe := work.operationRecipes[request.producer]
		if recipe.callResult == nil || !validStagedConstructedResultSource(recipe.callResult) || len(recipe.callResult.readings) == 0 {
			t.Fatal("original member recovery omitted constructed DATA handoff")
		}
		if _, adopted := work.operationIDs[recipe.callResult.constructedRoot.producer]; adopted {
			t.Fatal("passive DATA discovery activated the original member Call")
		}
		work.refineStagedConstructedCallResult(facts, recipe)
		recipe = work.operationRecipes[request.producer]
		if !validStagedCallResultRecipe(recipe) || len(recipe.delta.required) < 2 || !sameOperationRequest(recipe.delta.required[0], recipe.callResult.constructedRoot) {
			t.Fatal("result detached from original Effects and semantic DATA roles")
		}
		issued := work.constructedIssued
		work.constructedIssued = nil
		if _, current := work.currentConstructedCallResultRoles(recipe); current {
			t.Fatal("sealed descriptions replaced the current original member publication")
		}
		work.constructedIssued = issued
		for _, alter := range []func(*sourceStagedCallResultSource){
			func(s *sourceStagedCallResultSource) { s.constructedRoot.cut.initializing = original },
			func(s *sourceStagedCallResultSource) { s.nativeCall = true },
		} {
			bad := recipe
			bad.callResult = cloneStagedCallResultSource(recipe.callResult)
			alter(bad.callResult)
			if validStagedCallResultRecipe(bad) {
				t.Fatal("changed source envelope or native category accepted")
			}
		}
		for _, read := range recipe.callResult.readings {
			if _, accepted := work.requireOperation(facts, read); !accepted {
				t.Fatal("actual constructed result subscriber refused")
			}
		}
		work.prepareOperationUses(facts, owner)
		id := work.operationIDs[request.producer]
		if id.index == 0 || work.operations[id.index].revision == 0 {
			t.Fatal("DATA requirements were not delivered through existing queue")
		}
		if work.operationRecipes[stagedConstructionRequest(root, "algorithm").producer].delta.extracted {
			t.Fatal("constructed DATA debt supplied selected constructor authority")
		}
		generation := work.operationGeneration
		work.operationGeneration = &projectGeneration{}
		if work.refineStagedConstructedCallResult(facts, recipe) || work.passiveStagedConstructedCallResultReady(recipe) {
			t.Fatal("another generation inherited result delivery")
		}
		work.operationGeneration = generation
	})
}
