package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Real original Gets and the existing binding DATA queue supply each side of
// the handoff. No selected branch, result alternative or current stamp is made
// by this test; a clone must obtain them again from the original source owners.
func TestStagedNativeInputBindingOriginalSource(t *testing.T) {
	for _, source := range []string{
		`const value=Object.defineProperties({},{});const frozen=Object.freeze(value);export function invoke(){return frozen}`,
		`export function invoke(){const value=Object.defineProperties({},{});return Object.freeze(value)}`,
	} {
		withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
			var initializer, parent *ast.Node
			walkNode(file.AsNode(), func(node *ast.Node) bool {
				if ast.IsCallExpression(node) {
					switch stagedNativeInputIntent(node.Expression()) {
					case sourceNativeObjectDefineProperties:
						initializer = node
					case sourceNativeObjectFreeze:
						parent = node
					}
				}
				return true
			})
			if initializer == nil || parent == nil {
				t.Fatal("original named operations unavailable")
			}
			facts := stagedReturnSourceFacts(file)
			restore := registerWriterInputFacts(owner, facts)
			defer restore()
			work := registerCallableEffectWork(facts)
			observe := func(work *callableEffectWork, facts []callableFacts, call *ast.Node, adopt bool) *sourceStagedNativeOccurrence {
				declaration := sourceStagedEvaluationOwner(call)
				if declaration == nil {
					declaration = sourceStagedModuleOwner(call)
				}
				occurrence, described := work.describeNativeInputOccurrence(facts, work.memberNodes[declaration], call, owner)
				if !described {
					request, _ := stagedNativeInputOccurrenceRequest(&facts[work.memberNodes[declaration]], call)
					root := work.operationRecipes[request.producer].nativeGet
					var input bool
					var bindingKnown, parentValid, lexical bool
					if root != nil {
						algorithm := work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer].nativeGet
						input = algorithm != nil && algorithm.input != nil
						read := restrictedInvocationArguments(call.AsCallExpression())[0]
						phase := nativeRootDebtRequest(root, "algorithm")
						_, _, parentValid = work.nativeInputBindingParent(facts, phase, read)
						_, bindingKnown = work.operationRecipes[nativeInputBindingRequest(phase, read).producer]
						lexical = stagedNativeInputBindingDeclaration(read, declaration, owner) != nil
					}
					t.Fatalf("original source description refused %d: occurrence=%t root=%t input=%t callee=%t parentValid=%t lexical=%t bindingRegistered=%t", call.Pos(), occurrence != nil, root != nil, input, occurrence != nil && occurrence.callee != nil, parentValid, lexical, bindingKnown)
				}
				if adopt && !work.adoptNativeInputOccurrence(facts, occurrence) {
					t.Fatal("original source adoption refused", call.Pos())
				}
				return occurrence
			}
			observe(&work, facts, initializer, true)
			parentOccurrence := observe(&work, facts, parent, false)
			algorithmKey := nativeRootDebtRequest(parentOccurrence.source, "algorithm").producer
			pending := work.operationRecipes[algorithmKey]
			reading := pending.nativeGet.input.bindingData
			if runtimeModuleEvaluation(parentOccurrence.source.request.consumer) {
				// The module initializer already has an independent source owner,
				// so this row supplies complete DATA before Get receipt admission.
				// Local binding acquisition may itself await source work; it is
				// tested in the Get-before-DATA order rather than forced ready.
				if _, admitted := work.requireOperation(facts, reading); !admitted {
					t.Fatal("original selected DATA reading refused")
				}
				work.prepareOperationUses(facts, owner)
				if _, applied := work.inputBindingData(facts, pending.nativeGet.input.request, reading); !applied || work.currentNativeInputBindingGet(pending.nativeGet) || pending.delta.extracted {
					t.Fatal("DATA-before-Get receipt was lost or prematurely completed the phase")
				}
			}
			if !work.adoptNativeInputOccurrence(facts, parentOccurrence) {
				t.Fatal("original parent Get admission refused after DATA")
			}
			work.prepareOperationUses(facts, owner)
			var phase sourceStagedOperationRecipe
			for _, recipe := range work.operationRecipes {
				if validNativeInputBindingPhase(recipe) && recipe.key.selector.field == "algorithm" {
					phase = recipe
				}
			}
			if phase.nativeGet != nil {
				root, current := work.nativeInputBindingResult(phase)
				if !current || len(phase.delta.required) != 2 || !sameOperationRequest(phase.delta.required[1], root.request) {
					t.Fatal("current Get/DATA/endpoints or full initializer dependency missing before phase completion")
				}
				t.Log("original inputs retained: current parent Get, APPLIED binding DATA, every native endpoint, full initializer Effects")
			}
			if phase.nativeGet == nil || !work.nativeInputBindingPhaseCurrent(phase) {
				t.Fatal("actual Get + APPLIED binding did not reduce the input phase")
			}
			if len(phase.delta.required) != 2 || phase.delta.required[1].producer.operation != initializer || phase.nativeGet.input.input.expression != restrictedInvocationArguments(parent.AsCallExpression())[0] {
				t.Fatal("Identifier or independent full initializer root lost")
			}
			for _, change := range []func(*sourceStagedOperationRequest){
				func(r *sourceStagedOperationRequest) { r.cut.initializing = parent },
				func(r *sourceStagedOperationRequest) { r.consumer = initializer },
				func(r *sourceStagedOperationRequest) { r.reading.selector.field = "eager-inputs" },
			} {
				bad := reading
				change(&bad)
				if _, accepted := work.inputBindingData(facts, phase.nativeGet.input.request, bad); accepted {
					t.Fatal("wrong binding reader/cut/owner borrowed current DATA")
				}
			}
			bindingID := work.operationIDs[reading.producer]
			subscriber := work.operations[bindingID.index].subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
			prior := subscriber.returned
			subscriber.returned = append(append([]sourceStagedOperationAlternative(nil), prior...), sourceStagedOperationAlternative{endpoint: sourceRelativeEndpoint{kind: relativeEndpointUndefined}})
			if work.nativeInputBindingPhaseCurrent(phase) {
				t.Fatal("a positive first endpoint hid an unresolved MAY alternative")
			}
			subscriber.returned = prior
			generation := work.operationGeneration
			work.operationGeneration = new(projectGeneration)
			if work.nativeInputBindingPhaseCurrent(phase) {
				t.Fatal("another generation borrowed a current binding")
			}
			work.operationGeneration = generation
			cloned := make([]callableFacts, len(facts))
			for i := range facts {
				cloned[i] = cloneProjectCallableFact(facts[i])
			}
			fresh := registerCallableEffectWork(cloned)
			fresh.operationGeneration = owner.values.generation
			if fresh.nativeInputBindingPhaseCurrent(phase) {
				t.Fatal("cached complete recipe supplied current Get or DATA")
			}
			restoreClone := registerWriterInputFacts(owner, cloned)
			defer restoreClone()
			observe(&fresh, cloned, parent, true)
			// Get-before-DATA uses the same existing queue and original source
			// owner, in the other receipt order from the first graph above.
			if fresh.nativeInputBindingPhaseCurrent(fresh.operationRecipes[phase.key]) {
				t.Fatal("a new Get borrowed the previous graph's applied DATA")
			}
			observe(&fresh, cloned, initializer, true)
			fresh.prepareOperationUses(cloned, owner)
			if !fresh.nativeInputBindingPhaseCurrent(fresh.operationRecipes[phase.key]) {
				t.Fatal("fresh original events did not renew cloned binding")
			}
			for _, fact := range cloned {
				if len(fact.staged.calls) != 0 || len(fact.summary.Calls) != 0 || fact.normalInputs != nil {
					t.Fatal("native binding observation manufactured an ordinary Call or input frame")
				}
			}
		})
	}
}
