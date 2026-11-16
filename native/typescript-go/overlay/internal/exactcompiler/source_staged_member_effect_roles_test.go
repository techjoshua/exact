package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original Set and source Get owners supply these relationships. Closing
// their Effects dependency must not settle the separate dormant DATA ticket.
func TestStagedMemberWriterEffectsKeepStoredDataPending(t *testing.T) {
	const source = `export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['effect-role-probe']=()=>document.title;return 2}`
	withStagedAssignmentSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		if !work.stageAssignment(facts, consumer, operation, q.executable) {
			t.Fatal("original external Set did not adopt its represented Effects sources")
		}
		work.prepareOperationUses(facts, q.executable)
		rootKey := sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}
		root := work.operationRecipes[rootKey].assignment
		rootID, issued := work.operationIDs[rootKey]
		if root == nil || !issued || !work.closedOperationDependencies()[rootID.index] {
			t.Fatal("original Set Effects did not close")
		}
		var read *ast.Node
		walkNode(operation.AsBinaryExpression().Right, func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "title" {
				read = node
			}
			return true
		})
		if read == nil {
			t.Fatal("original dormant source Get missing")
		}
		connected := false
		for _, recipe := range work.operationRecipes {
			s := recipe.memberSource
			if s == nil || !s.writeEffects || s.candidate.operation != operation || s.candidate.cut.operation != read {
				continue
			}
			connected = true
			effects := stagedMemberWriterEffectsRequest(s.parent, s.candidate)
			raw := stagedMemberCandidateRequest(s.parent, s.candidate)
			if !validStagedMemberRecipe(recipe) || !sameOperationRequest(s.request, effects) || effects.inputs != nil || effects.producer.kind != relativeDemandEffects || effects.cut != raw.cut || effects.producer.selector.field != raw.producer.selector.field+":effects" || effects.edge != raw.edge+":effects" {
				t.Fatal("writer Effects lost its exact original source role")
			}
			if !recipe.delta.extracted || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], root.root) || operationDeltaSize(recipe.delta) != 1 {
				t.Fatal("writer Effects did not require only its original Set producer")
			}
			effectsID, required := work.operationIDs[effects.producer]
			if !required || !work.closedOperationDependencies()[effectsID.index] {
				t.Fatal("original source writer Effects child remains pending")
			}
			coverageRequest := stagedMemberCoverageRequest(s.parent, s.candidate.origin, s.candidate.cut)
			coverageRecipe := work.operationRecipes[coverageRequest.producer]
			if coverageRecipe.memberSource == nil || coverageRecipe.memberSource.coverage == nil {
				t.Fatal("original source coverage missing")
			}
			found := false
			for _, child := range coverageRecipe.delta.required {
				if sameOperationRequest(child, raw) {
					t.Fatal("Effects source coverage required dormant DATA recovery")
				}
				found = found || sameOperationRequest(child, effects)
			}
			coverageID, required := work.operationIDs[coverageRequest.producer]
			if !found || !required || !work.closedOperationDependencies()[coverageID.index] {
				t.Fatal("original Get source coverage did not consume writer Effects")
			}
			data := work.operationRecipes[raw.producer]
			if data.memberSource == nil || data.memberSource.writeEffects || !validStagedMemberRecipe(data) || data.delta.extracted || len(data.delta.invoked)+len(data.delta.effects)+len(data.delta.relative)+len(data.delta.residuals) != 0 || data.memberSource.candidate.value.expression != operation.AsBinaryExpression().Right || !sameStagedMemberCandidate(data.memberSource.candidate, s.candidate) {
				t.Fatal("Effects closure settled or retargeted dormant stored DATA")
			}
			if id, adopted := work.operationIDs[raw.producer]; adopted && work.closedOperationDependencies()[id.index] {
				t.Fatal("raw DATA ticket inherited Effects closure")
			}

			// These mutations test envelope refusal, not original source admission.
			bad := recipe
			bad.memberSource = cloneStagedMemberSource(s)
			bad.memberSource.request.inputs = &sourceRelativeInputEdge{}
			if validStagedMemberRecipe(bad) {
				t.Fatal("supplied input packet replaced original Effects role")
			}
			bad.memberSource = cloneStagedMemberSource(s)
			bad.memberSource.candidate.cut.reading = operation
			if validStagedMemberRecipe(bad) {
				t.Fatal("writer Effects accepted a different physical read cut")
			}
			bad = data
			bad.delta.extracted = true
			if validStagedMemberRecipe(bad) {
				t.Fatal("raw DATA received completion from its Effects sibling")
			}
			bad = data
			bad.memberSource = cloneStagedMemberSource(data.memberSource)
			bad.memberSource.writeEffects = true
			if validStagedMemberRecipe(bad) {
				t.Fatal("raw DATA selector masqueraded as writer Effects")
			}
			if work.registerOperationUse(facts, sourceStagedOperationUse{request: effects, call: operation}) {
				t.Fatal("writer Effects authorized invocation")
			}
			generation := work.operationGeneration
			work.operationGeneration = &projectGeneration{}
			if work.closedOperationDependencies()[effectsID.index] {
				t.Fatal("writer Effects crossed source generation")
			}
			work.operationGeneration = generation

			cloned := make([]callableFacts, len(facts))
			for i := range facts {
				cloned[i] = cloneProjectCallableFact(facts[i])
			}
			next := newCallableEffectWork(cloned)
			next.operationGeneration = generation
			next.indexOperationSources(cloned)
			clonedSource := next.operationRecipes[effects.producer].memberSource
			if clonedSource == nil || clonedSource == s || !clonedSource.writeEffects || clonedSource.protocolSource == s.protocolSource || !sameOperationRequest(clonedSource.request, effects) {
				t.Fatal("clone lost or aliased descriptive Effects relationship")
			}
			if !next.registerOperationUse(cloned, sourceStagedOperationUse{request: coverageRequest}) {
				t.Fatal("clone lost original source-set membership")
			}
			fresh := next.operationIDs[coverageRequest.producer]
			if next.operations[fresh.index].memberCoverageObserved || next.closedOperationDependencies()[fresh.index] {
				t.Fatal("clone inherited original Get observation")
			}
		}
		if !connected {
			t.Fatal("original document Get did not issue the writer Effects relationship")
		}
		for _, call := range facts[consumer].staged.calls {
			if call.invocation.declaration == operation.AsBinaryExpression().Right {
				t.Fatal("stored callback was invoked by Effects source accounting")
			}
		}
		for _, effect := range facts[consumer].summary.DirectEffectSources {
			if effect.Environment == "browser" {
				t.Fatal("dormant document body became a direct Set effect")
			}
		}
	})
}
