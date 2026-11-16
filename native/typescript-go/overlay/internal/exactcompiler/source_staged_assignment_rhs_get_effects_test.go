package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The same original fixture already qualifies the receiver Call handoff. This
// real collector control requires the RHS Get Effects and separately retained
// captured-read/return SOURCE; it does not require a normal getter value or Set.
func TestAssignmentOriginalRHSGetEffectsSource(t *testing.T) {
	withReflectiveRelevanceSource(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile) {
		var assignment, getter *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if plainStagedAssignment(n) && sourceText(file, n) == "receiver().work=input.value" {
				assignment = n
			}
			if ast.IsGetAccessorDeclaration(n) && n.Name() != nil && n.Name().Text() == "value" {
				getter = n
			}
			return true
		})
		if assignment == nil || getter == nil {
			t.Fatal("original RHS Get/getter missing")
		}
		rhs := assignment.AsBinaryExpression().Right
		caller := enclosingCallableNode(assignment)
		analysis := collectCallableEffects(file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, owner)
		var fact *callableFacts
		for i := range analysis.facts {
			if analysis.facts[i].node == caller {
				fact = &analysis.facts[i]
			}
		}
		if fact == nil {
			t.Fatal("actual original assignment owner absent")
		}
		expected := stagedGetResultRequest(rhs, caller, "effects", nil)
		phase := false
		recipes := make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
		for _, recipe := range fact.staged.operationRecipes {
			recipes[recipe.key] = recipe
			if recipe.assignment != nil && recipe.assignment.root.use == assignment && recipe.assignment.phase == "rhs" {
				for _, required := range recipe.delta.required {
					phase = phase || sameOperationRequest(required, expected)
				}
			}
		}
		if !phase {
			t.Fatal("original assignment RHS lacks original Get Effects child")
		}
		effect, exists := recipes[expected.producer]
		if !exists || !validStagedGetResultRecipe(effect) || effect.callResult.generation != owner.values.generation || len(effect.delta.exposures) != 0 {
			t.Fatal("Get Effects lost identity or became output DATA")
		}
		// The real selected Get issues both original lexical reads. No default or
		// value for fail is selected, and context DATA is never Get-return DATA.
		captures := map[string]bool{"events": false, "fail": false}
		for _, required := range effect.delta.required {
			for _, candidate := range analysis.facts {
				for _, recipe := range candidate.staged.operationRecipes {
					source := recipe.callResult
					if recipe.key == required.producer && source != nil && source.capturedBinding != nil {
						capture := source.capturedBinding
						if capture.reader == getter && capture.lexical == caller && capture.binding.Name() != nil {
							captures[capture.binding.Name().Text()] = true
						}
					}
				}
			}
		}
		if !captures["events"] || !captures["fail"] {
			t.Fatalf("original getter captured SOURCE omitted: %v", captures)
		}
		body := stagedGetResultRequest(rhs, caller, "body", getter)
		returned, bodyExists := recipes[body.producer]
		if !bodyExists || returned.callResult == nil || returned.callResult.declaration != getter || !stagedGetResultBody(returned.callResult) {
			t.Fatal("conditional getter return SOURCE omitted")
		}
		value := recipes[stagedGetResultRequest(rhs, caller, "value", nil).producer]
		retainedBody := false
		for _, required := range value.delta.required {
			retainedBody = retainedBody || sameOperationRequest(required, body)
		}
		if !retainedBody || value.delta.extracted || len(value.delta.exposures) != 0 || value.callResult == nil || value.callResult.getResult.represented {
			t.Fatal("captured context supplied a normal RHS Get output or lost return SOURCE")
		}
		if effect.delta.extracted {
			t.Fatal("unmapped original getter captures paid Effects closure")
		}
		for _, required := range effect.delta.required {
			if sameOperationRequest(required, body) {
				t.Fatal("Effects required optional returned callback DATA")
			}
		}
		// No B/canonical getter invocation is fabricated for this still-unmapped BODY.
		for _, call := range fact.staged.calls {
			if call.invocation.operation == rhs && originalStagedGetterCall(call) {
				t.Fatal("SOURCE registration manufactured getter B")
			}
		}
	})
}

// A passive/fresh Get request has no source observation. Each genuine graph
// must issue the original member loan again; repeated current source use is
// idempotent and cannot activate the pending getter or returned callback.
func TestAssignmentRHSGetSourceOwnerAndGeneration(t *testing.T) {
	var staleGet *ast.Node
	for pass := 0; pass < 2; pass++ {
		withReflectiveRelevanceSource(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile) {
			var get, getter *ast.Node
			walkNode(file.AsNode(), func(n *ast.Node) bool {
				if ast.IsPropertyAccessExpression(n) && sourceText(file, n) == "input.value" {
					get = n
				}
				if ast.IsGetAccessorDeclaration(n) && n.Name() != nil && n.Name().Text() == "value" {
					getter = n
				}
				return true
			})
			if get == nil || getter == nil {
				t.Fatal("original Get/getter absent")
			}
			query := newSourceDependencyQuery(get, owner.checker, owner, enclosingCallableNode(get))
			defer query.publishDependencyStatistics()
			if query.observeStagedGetResultMember(getter.Parent, getter, nil, accessorAcquire, false, nil, &accessorCandidates{}) {
				t.Fatal("missing original Get issuer admitted a getter SOURCE")
			}
			facts := stagedReturnSourceFacts(file)
			work := registerCallableEffectWork(facts)
			caller := work.memberNodes[enclosingCallableNode(get)]
			if _, ok := work.registerStagedGetResult(facts, caller, get, owner); !ok {
				t.Fatal("original Get source reservation refused")
			}
			request := stagedGetResultRequest(get, facts[caller].node, "effects", nil)
			if work.memberCoverageObserved[request.producer] != nil {
				t.Fatal("passive recipe supplied source observation")
			}
			if _, ok := work.registerStagedGetResult(facts, work.memberNodes[getter], get, owner); ok {
				t.Fatal("wrong original Get owner accepted")
			}
			if staleGet != nil {
				if _, ok := work.registerStagedGetResult(facts, caller, staleGet, owner); ok {
					t.Fatal("released Program Get entered current owner")
				}
			}
			id, ok := work.requireOperation(facts, request)
			if !ok {
				t.Fatal("original Get Effects subscription refused")
			}
			work.prepareOperationUses(facts, owner)
			if work.memberCoverageObserved[request.producer] != owner.values.generation || work.closedOperationDependencies()[id.index] {
				t.Fatal("original SOURCE observation missing or unpaid getter closed")
			}
			count := len(work.operationRecipes)
			work.prepareOperationUses(facts, owner)
			if len(work.operationRecipes) != count || len(facts[caller].staged.calls) != 0 || len(facts[caller].summary.Calls) != 0 {
				t.Fatal("current source replayed registration or manufactured invocation")
			}
			clones := make([]callableFacts, len(facts))
			for i := range facts {
				clones[i] = cloneProjectCallableFact(facts[i])
			}
			fresh := registerCallableEffectWork(clones)
			// Retained source validity does not enroll a new graph. Use the
			// original owner API, as the existing Get fresh-graph control does.
			if _, adopted := fresh.requireOperation(clones, request); adopted {
				t.Fatal("unregistered fresh Get inherited graph enrollment")
			}
			if _, registered := fresh.registerStagedGetResult(clones, caller, get, owner); !registered {
				t.Fatal("fresh original Get owner registration refused")
			}
			freshID, ok := fresh.requireOperation(clones, request)
			if !ok {
				t.Fatal("registered fresh Get Effects membership refused")
			}
			if fresh.memberCoverageObserved[request.producer] != nil {
				t.Fatal("fresh graph inherited original Get source observation")
			}
			if fresh.closedOperationDependencies()[freshID.index] {
				t.Fatal("fresh graph inherited Get current/APPLIED closure")
			}
			staleGet = get
		})
	}
}
