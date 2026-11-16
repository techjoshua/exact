package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Original result demand must be able to consume an already reached native
// producer before its own unfinished New parent adopts. It creates no parent
// IDs and keeps the native root as an independent closure requirement.
func TestStagedNativeResultPassiveOriginalConsumer(t *testing.T) {
	for _, row := range []struct {
		name, expression       string
		recursive, unsupported bool
	}{
		{"descriptor map", `Object.freeze(Object.defineProperties({},{tag:{value:true}}))`, false, false},
		{"recursive freeze create", `Object.freeze(Object.freeze(Object.create(null)))`, true, false},
		{"recursive freeze reflective literal target", `Object.freeze(Object.freeze(Object.defineProperty({},'tag',{value:true})))`, true, false},
		{"reflective target source unavailable", `Object.freeze(Object.defineProperty(Object.create(null),'tag',{value:true}))`, false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			const sourcePrefix = `function latent(target:Record<PropertyKey,unknown>,key:PropertyKey){window.name;target[key]=()=>document.title}const prefix=`
			const sourceSuffix = `;function factory(){return prefix}export function invoke(){factory();return new WeakMap()}`
			source := sourcePrefix + row.expression + sourceSuffix
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
				file := ast.GetSourceFileOfNode(creating)
				var original, native, parent *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsNewExpression(node) {
						original = node
					}
					// Fixture occurrence selection only. Actual native recognition and
					// receipt admission below still belong to the original source owner.
					if ast.IsVariableDeclaration(node) && node.Name() != nil && callableNameText(node.Name()) == "prefix" {
						parent = node.Initializer()
						if parent != nil && ast.IsCallExpression(parent) {
							args := restrictedInvocationArguments(parent.AsCallExpression())
							if len(args) == 1 && ast.IsCallExpression(args[0]) {
								native = args[0]
							}
						}
					}
					return true
				})
				if original == nil || native == nil || parent == nil {
					t.Fatal("original native producer and New reader absent")
				}
				facts := stagedReturnSourceFacts(file)
				work := newCallableEffectWork(facts)
				producer := work.memberNodes[sourceStagedModuleOwner(native)]
				if row.recursive {
					// Call evaluation observes enclosing callees before argument
					// Calls. The ordinary owner describes that prefix before its
					// recursive input support check. A pending description is not
					// adoption or a supplied selection/category receipt.
					work.describeNativeInputOccurrence(facts, producer, parent, owner)
					// The isolated harness has no ordinary source walker to reach
					// argument Calls first. These fixtures have one nested Call in
					// each first actual. Stage those original producers inside out,
					// delivering each real child before its enclosing input consumer.
					var inputs []*ast.Node
					for call := native; call != nil && ast.IsCallExpression(call); {
						inputs = append(inputs, call)
						actuals := restrictedInvocationArguments(call.AsCallExpression())
						if len(actuals) == 0 || !ast.IsCallExpression(actuals[0]) {
							break
						}
						call = actuals[0]
					}
					for index := len(inputs) - 1; index >= 0; index-- {
						call := inputs[index]
						inputOwner, known := work.memberNodes[sourceStagedModuleOwner(call)]
						if !known || !work.stageNativeInputCall(facts, inputOwner, call, owner) {
							t.Fatalf("original input producer not adopted at %s@%d", call.Kind, call.Pos())
						}
						work.prepareOperationUses(facts, owner)
					}
				}
				adopted := work.stageNativeInputCall(facts, producer, parent, owner)
				if row.unsupported {
					// The target-source request validator is descriptive. No current
					// producer attaches that reflective target's category in this domain.
					// Preserve that real source gap instead of supplying a child receipt.
					root := work.operationRecipes[sourceStagedOperationKey{declaration: facts[producer].node, operation: parent, kind: relativeDemandEffects}].nativeGet
					if adopted || root == nil || work.nativeResultNoncallableRoot(root) {
						t.Fatal("unrepresented reflective target acquired noncallable result authority")
					}
					return
				}
				if !adopted {
					t.Fatal("original native producer not adopted")
				}
				work.prepareOperationUses(facts, owner)
				consumer := work.memberNodes[enclosingCallableNode(original)]
				root, registered := work.registerStagedConstructionEffects(facts, consumer, original, owner)
				if !registered {
					t.Fatal("original reader registration refused")
				}
				request := stagedCallResultRequest(native, sourceStagedModuleOwner(native))
				if work.operationRecipes[request.producer].callResult == nil {
					t.Fatal("original reader omitted native result demand")
				}
				work.refreshStagedCallResults(facts, owner)
				recipe := work.operationRecipes[request.producer]
				if !work.passiveStagedNativeResultReady(recipe) || !work.stagedNativeResultNoncallable(recipe) || len(recipe.delta.required) != 1 || recipe.delta.required[0].producer.operation != native || len(recipe.delta.exposures) != 1 || recipe.delta.exposures[0].endpoint.expression != native {
					t.Fatal("passive original reader failed to receive native result/root relationship")
				}
				if _, adopted := work.operationIDs[root.producer]; adopted {
					t.Fatal("native result readiness fabricated ordinary New adoption")
				}
				nativeRoot := work.operationRecipes[recipe.delta.required[0].producer].nativeGet
				if row.recursive {
					source := work.operationRecipes[nativeRootDebtRequest(nativeRoot, "algorithm").producer].nativeGet
					child := work.operationRecipes[source.inputSource.producer].nativeGet
					if child == nil {
						t.Fatal("recursive result omitted its actual input producer")
					}
					id, issued := work.operationIDs[nativeRootDebtRequest(child, "callee-get").producer]
					if !issued || work.operations[id.index].nativeCallee == nil {
						t.Fatal("recursive result lacks original strong child Get receipt")
					}
					proof := work.operations[id.index].nativeCallee
					work.operations[id.index].nativeCallee = nil
					if !work.passiveStagedNativeResultReady(recipe) || work.stagedNativeResultNoncallable(recipe) {
						t.Fatal("Effects/input plan replaced an unavailable child strong receipt")
					}
					work.operations[id.index].nativeCallee = proof
					if !work.stagedNativeResultNoncallable(recipe) || !sameOperationRequest(recipe.delta.required[0], nativeRoot.request) {
						t.Fatal("restored child Get lost the exact conditional source relation")
					}
				}
				algorithmKey := nativeRootDebtRequest(nativeRoot, "algorithm").producer
				algorithm := work.operationRecipes[algorithmKey]
				weaker := algorithm
				copy := *algorithm.nativeGet
				copy.callAlternatives = nativeMemberAlternativeRequest(&copy, "callee-alternatives")
				weaker.nativeGet = &copy
				work.operationRecipes[algorithmKey] = weaker
				if work.passiveStagedNativeResultReady(recipe) || work.stagedNativeResultNoncallable(recipe) {
					t.Fatal("finite Effects/constructor alternatives bypassed native result guard")
				}
				work.operationRecipes[algorithmKey] = algorithm
				originalCut := recipe.callResult.readCuts[0]
				recipe.callResult.readCuts[0].returning = original
				if work.passiveStagedNativeResultReady(recipe) || work.stagedNativeResultNoncallable(recipe) {
					t.Fatal("retargeted reading borrowed another source observation")
				}
				recipe.callResult.readCuts[0] = originalCut
				generation := work.operationGeneration
				work.operationGeneration = &projectGeneration{}
				if work.passiveStagedNativeResultReady(recipe) || work.stagedNativeResultNoncallable(recipe) {
					t.Fatal("native result reused another graph generation")
				}
				work.operationGeneration = generation
				work.memberCoverageObserved = nil
				if work.passiveStagedNativeResultReady(recipe) || work.stagedNativeResultNoncallable(recipe) {
					t.Fatal("cached reading metadata supplied a current source observation")
				}
			})
		})
	}
}

// The seen/default and malformed-metadata guards are defensive boundaries.
// These controls use only original source producers, so no fabricated cycle,
// unsupported native kind or target-source receipt serves as a positive witness.
