package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A source dependency can precede collection of its original callable. Its Set
// phases retain original RHS/body work without becoming an ordinary activation.
func TestStagedAssignmentEffectsPassiveThenReached(t *testing.T) {
	withStagedReturnProgram(t, stagedAssignmentStandardReceiverSource, func(owner *executableBodyOwner, creating *ast.Node) {
		file := ast.GetSourceFileOfNode(creating)
		facts := stagedReturnSourceFacts(file)
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		var assignment, construction, factoryCall *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			region := enclosingCallableNode(node)
			if region == nil || region.Name() == nil || region.Name().Text() != "installOnly" {
				return true
			}
			if plainStagedAssignment(node) {
				assignment = node
				factoryCall = node.AsBinaryExpression().Right
			}
			if ast.IsNewExpression(node) {
				construction = node
			}
			return true
		})
		consumer := work.memberNodes[enclosingCallableNode(assignment)]
		publisher := owner.pendingMemberPublishers[facts[consumer].node]
		original := publisher.fact
		copied := *original
		publisher.fact = &copied
		copiedRoot, copiedRegistered := work.registerStagedAssignmentEffects(facts, consumer, assignment, owner)
		publisher.fact = original
		if !copiedRegistered || work.operationRecipes[copiedRoot.producer].delta.extracted || work.passiveAssignmentSourceReady(work.operationRecipes[copiedRoot.producer]) || len(work.operationIDs) != 0 {
			t.Fatal("descriptive registration borrowed copied source publication authority")
		}
		if !work.prepareStagedConstructionSource(facts, construction, owner) {
			t.Fatal("original construction source unavailable")
		}
		root, registered := work.registerStagedAssignmentEffects(facts, consumer, assignment, owner)
		if !registered || root.consumer != facts[consumer].node || root.use != assignment || !validStagedAssignmentRecipe(work.operationRecipes[root.producer]) {
			t.Fatal("original passive Set source unavailable")
		}
		for _, phase := range stagedAssignmentPhases {
			request := stagedAssignmentRequest(root, phase)
			recipe := work.operationRecipes[request.producer]
			if !recipe.delta.extracted {
				t.Fatalf("original passive %s source unobserved", phase)
			}
			if !validStagedAssignmentRecipe(recipe) || recipe.assignment.generation != owner.values.generation || !sameOperationRequest(recipe.assignment.root, root) {
				t.Fatalf("missing original %s phase", phase)
			}
		}
		rhs := work.operationRecipes[stagedAssignmentRequest(root, "rhs").producer]
		if len(rhs.delta.required) != 1 || !sameOperationRequest(rhs.delta.required[0], stagedDeclarationCallEffectsRequest(factoryCall, facts[consumer].node)) {
			t.Fatal("passive RHS lost its original Call Effects requirement")
		}
		if len(work.operationIDs) != 0 || len(facts[consumer].staged.operationUses) != 0 || len(facts[consumer].staged.calls) != 0 || len(facts[consumer].summary.Calls) != 0 {
			t.Fatal("passive Set source activated its owner, binder or body")
		}
		generation := work.operationGeneration
		work.operationGeneration = &projectGeneration{}
		_, staleAccepted := work.registerStagedAssignmentEffects(facts, consumer, assignment, owner)
		work.operationGeneration = generation
		if staleAccepted {
			t.Fatal("wrong graph generation admitted a source")
		}
		work.stageAssignment(facts, consumer, assignment, owner)
		for _, call := range facts[consumer].staged.calls {
			if call.invocation.operation == factoryCall {
				t.Fatal("ordinary Set manufactured actual RHS Call entry")
			}
		}
		if id, adopted := work.operationIDs[root.producer]; adopted && work.closedOperationDependencies()[id.index] {
			t.Fatal("missing actual RHS entry/body completed Set publication")
		}
	})
}

// Passive and ordinary accounting of one no-setter loan share its original
// receipt. Publishing the ordinary state cannot revoke that same source event.
func TestStagedAssignmentNoSetterReceiptShared(t *testing.T) {
	const source = `export function invoke(){const target={slot:0};target.slot=1;return 2}`
	const id = "/virtual/assignment-receipt.ts"
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}, id, map[string]string{id: source})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	owner := newExecutableBodyOwner(project, generation.checker)
	{
		facts := stagedReturnSourceFacts(generation.sourceFile)
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		var assignment *ast.Node
		walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
			if plainStagedAssignment(node) {
				assignment = node
			}
			return true
		})
		consumer := work.memberNodes[enclosingCallableNode(assignment)]
		if !work.stageAssignment(facts, consumer, assignment, owner) {
			t.Fatal("original no-setter assignment refused")
		}
		key := sourceStagedOperationKey{declaration: facts[consumer].node, operation: assignment, kind: relativeDemandEffects}
		recipe := work.operationRecipes[key]
		observation := work.assignmentObserved[key]
		setID := work.operationIDs[stagedAssignmentRequest(recipe.assignment.root, "set").producer]
		state := work.operations[setID.index].assignment
		if observation == nil || state == nil || observation.disposition != state.disposition || state.setIssuer != observation.disposition.issuer || !work.passiveAssignmentSourceReady(recipe) {
			t.Fatal("ordinary publication revoked the same original source receipt")
		}
	}
}
