package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Admission follows the actual Get contribution while its independent source
// children remain pending. It creates no invocation or selected-value grant.
func TestStagedConstructedGetEffectsPassiveConsumer(t *testing.T) {
	const source = `function factory(){return 0}export function invoke(){const map=new WeakMap<object,object>();factory();return map.get}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		file := ast.GetSourceFileOfNode(call)
		facts := stagedReturnSourceFacts(file)
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		var get *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) && callableNameText(node.Name()) == "get" {
				get = node
			}
			return true
		})
		caller := work.memberNodes[enclosingCallableNode(get)]
		if !work.prepareStagedConstructedGetEffectsSource(facts, caller, get, owner) {
			t.Fatal("original Get contribution missing")
		}
		request, issued := work.memberProtocolSources[get]
		recipe := work.operationRecipes[request.producer]
		if !issued || recipe.memberSource == nil || recipe.memberSource.getEffects == nil || !recipe.delta.extracted || !validOperationEnvelope(recipe) || len(recipe.delta.required) == 0 {
			t.Fatal("original Get contribution or source children lost")
		}
		if !work.passiveMemberSourceReady(recipe) {
			t.Fatal("current original Get cannot enter existing source conjunction")
		}
		for _, required := range recipe.delta.required {
			child := work.operationRecipes[required.producer].memberSource
			if child == nil || child.coverage == nil || !sameOperationRequest(child.request, required) || !sameOperationRequest(child.parent, recipe.memberSource.parent) {
				t.Fatal("Get substituted unrelated source requirement")
			}
		}
		if !work.prepareStagedConstructedGetEffectsSource(facts, caller, get, owner) || work.operationRecipes[request.producer].memberSource != recipe.memberSource {
			t.Fatal("current Get Effects source was reacquired instead of reused")
		}
		cloned := make([]callableFacts, len(facts))
		for i, fact := range facts {
			cloned[i] = cloneProjectCallableFact(fact)
		}
		freshOwner := newExecutableBodyOwner(owner.project, owner.checker)
		freshRestore := registerPendingMemberFacts(freshOwner, cloned)
		defer freshRestore()
		fresh := registerCallableEffectWork(cloned)
		fresh.operationGeneration = freshOwner.values.generation
		if fresh.passiveMemberSourceReady(fresh.operationRecipes[request.producer]) {
			t.Fatal("completed clone inherited original Get observation")
		}
		publisher := freshOwner.pendingMemberPublishers[cloned[caller].node]
		delete(freshOwner.pendingMemberPublishers, cloned[caller].node)
		if fresh.prepareStagedConstructedGetEffectsSource(cloned, caller, get, freshOwner) {
			t.Fatal("missing original publisher renewed Get")
		}
		freshOwner.pendingMemberPublishers[cloned[caller].node] = publisher
		original := publisher.fact
		copied := *original
		publisher.fact = &copied
		if fresh.prepareStagedConstructedGetEffectsSource(cloned, caller, get, freshOwner) {
			t.Fatal("copied fact renewed original Get")
		}
		publisher.fact = original
		generation := fresh.operationGeneration
		fresh.operationGeneration = &projectGeneration{}
		if fresh.prepareStagedConstructedGetEffectsSource(cloned, caller, get, freshOwner) {
			t.Fatal("stale graph renewed original Get")
		}
		fresh.operationGeneration = generation
		if !fresh.prepareStagedConstructedGetEffectsSource(cloned, caller, get, freshOwner) {
			t.Fatal("completed Get description could not be reissued by original source owner")
		}
		renewed := fresh.operationRecipes[request.producer]
		if !fresh.passiveMemberSourceReady(renewed) || !sameOperationRequest(renewed.memberSource.request, request) || renewed.memberSource == recipe.memberSource || len(fresh.operationIDs) != 0 || len(cloned[caller].staged.operationUses) != 0 || len(cloned[caller].summary.Calls) != 0 {
			t.Fatal("fresh Get reissuance lost correlation or activated ordinary work")
		}
		for _, child := range renewed.delta.required {
			if fresh.memberCoverageObserved[child.producer] != fresh.operationGeneration {
				t.Fatal("fresh Get reissuance borrowed cached source children")
			}
		}
		delete(work.memberCoverageObserved, recipe.key)
		if work.passiveMemberSourceReady(recipe) {
			t.Fatal("unobserved Get borrowed source admission")
		}
		if len(work.operationIDs) != 0 || len(facts[caller].staged.operationUses) != 0 || len(facts[caller].summary.Calls) != 0 {
			t.Fatal("passive Get activated a consumer or body")
		}
	})
}

func TestStagedConstructedGetEffectsWriteOnlyRefused(t *testing.T) {
	withStagedReturnProgram(t, stagedWriterResultSource, func(owner *executableBodyOwner, call *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		var target *ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
			if plainStagedAssignment(node) {
				target = node.AsBinaryExpression().Left
			}
			return true
		})
		caller := work.memberNodes[enclosingCallableNode(target)]
		if work.prepareStagedConstructedGetEffectsSource(facts, caller, target, owner) {
			t.Fatal("plain Set destination issued a property Get")
		}
		if len(work.operationRecipes) != 0 || len(work.operationIDs) != 0 || len(owner.standardConstructions) != 0 {
			t.Fatal("write-only destination started Get producer work")
		}
	})
}

// The original read issues the writer DATA subscriber before the actual RHS
// Call association arrives. Definition/body completion remains independently
// required, and observing the stored method never activates its invocation.
func TestStagedWriterResultPendingDeclarationChain(t *testing.T) {
	withStagedReturnProgram(t, stagedWriterResultSource, func(owner *executableBodyOwner, creating *ast.Node) {
		file := ast.GetSourceFileOfNode(creating)
		facts := stagedReturnSourceFacts(file)
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		var factoryCall, methodCall *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) {
				if ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "factory" {
					factoryCall = node
				}
				if ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "get" {
					methodCall = node
				}
			}
			return true
		})
		caller := work.memberNodes[enclosingCallableNode(methodCall)]
		effect, registered := work.registerStagedDeclarationCallEffects(facts, caller, factoryCall, owner)
		if !registered || !work.prepareStagedConstructedGetEffectsSource(facts, caller, methodCall.Expression(), owner) {
			t.Fatal("original producer/read source unavailable")
		}
		linked := false
		for _, candidate := range work.operationRecipes {
			member := candidate.memberSource
			if member != nil && member.candidate.operation == factoryCall && member.candidate.protocol && member.parent.producer.operation == methodCall.Expression() {
				linked = member.protocolSource != nil && sameOperationRequest(member.protocolSource.required, effect) && len(candidate.delta.required) == 1 && sameOperationRequest(candidate.delta.required[0], effect)
			}
		}
		if !linked {
			t.Fatal("source-before-reader lost original lexical Call Effects attachment")
		}
		dataRequest := stagedCallResultRequest(factoryCall, facts[caller].node)
		recipe := work.operationRecipes[dataRequest.producer]
		if !work.passiveStagedDeclarationResultSupported(recipe) || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], effect) || recipe.delta.extracted || len(recipe.delta.exposures) != 0 {
			t.Fatal("pending DATA lost authentic Effects/reader ownership")
		}
		if len(work.operationIDs) != 0 || len(facts[caller].summary.Calls) != 0 || len(facts[caller].staged.calls) != 0 {
			t.Fatal("source registration activated the RHS or method")
		}
		observed := work.declarationCallObserved
		work.declarationCallObserved = nil
		borrowed := work.passiveStagedDeclarationResultSupported(recipe)
		work.declarationCallObserved = observed
		if borrowed {
			t.Fatal("missing original Effects owner admitted DATA")
		}
		fresh := registerCallableEffectWork(facts)
		fresh.operationGeneration = work.operationGeneration
		if fresh.passiveStagedDeclarationResultSupported(recipe) {
			t.Fatal("fresh graph borrowed original reader/Effects receipts")
		}
		if len(recipe.callResult.readings) == 0 {
			t.Fatal("original writer DATA subscriber missing")
		}
		reading := recipe.callResult.readings[0]
		if _, required := work.requireOperation(facts, reading); !required {
			t.Fatal("original DATA reading refused")
		}
		work.prepareOperationUses(facts, owner)
		if work.closedOperationDependencies()[work.operationIDs[reading.producer].index] || len(facts[caller].summary.Calls) != 0 {
			t.Fatal("passive DATA completed/invoked absent actual Call")
		}
		work.extracting = caller
		registered = work.stageSourceDeclarationCall(facts, caller, factoryCall, owner)
		work.extracting = -1
		if !registered {
			t.Fatal("actual RHS Call owner refused")
		}
		work.prepareOperationUses(facts, owner)
		delivery, available := work.stagedCallResultData(reading)
		if !available || len(delivery.delta.exposures) != 1 {
			t.Fatal("actual association did not deliver known DATA prefix")
		}
		alternative := delivery.delta.exposures[0]
		if !ast.IsArrowFunction(alternative.endpoint.expression) || alternative.creating != nil || work.closedOperationDependencies()[work.operationIDs[reading.producer].index] {
			t.Fatal("DATA invented creating B or completed undelivered body")
		}
		for _, edge := range facts[caller].summary.Calls {
			if facts[caller].fieldEdgeOperations[edge.ID] != factoryCall {
				t.Fatal("stored method was invoked from DATA")
			}
		}
	})
}
