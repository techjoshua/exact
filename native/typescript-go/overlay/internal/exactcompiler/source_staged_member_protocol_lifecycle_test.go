package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// Original definition collection can precede the caller's reached Call. Source
// dependencies retain that body without turning its availability into execution.
func TestStagedAssignmentConstructedProtocolSource(t *testing.T) {
	checkStagedAssignmentConstructedProtocolSource(t, stagedWriterResultSource, true, "invoke")
}

func TestStagedAssignmentConstructedProtocolIndependentParent(t *testing.T) {
	checkStagedAssignmentConstructedProtocolSource(t, stagedAssignmentStandardReceiverSource, true, "installOnly")
}

func TestStagedMemberContextRetainsIndependentContributions(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"property write", strings.Replace(stagedWriterResultSource, "window.name;return undefined", "window.name;window.name='changed';return undefined", 1)},
		{"foreign Call", "declare function foreign():void;" + strings.Replace(stagedWriterResultSource, "window.name;return undefined", "window.name;foreign();return undefined", 1)},
	} {
		t.Run(row.name, func(t *testing.T) { checkStagedAssignmentConstructedProtocolSource(t, row.source, false, "invoke") })
	}
}

func checkStagedAssignmentConstructedProtocolSource(t *testing.T, source string, selfRead bool, parentName string) {
	t.Helper()
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
		file := ast.GetSourceFileOfNode(creating)
		facts := stagedReturnSourceFacts(file)
		for i := range facts {
			facts[i].callExpressions = make(map[string]*ast.Node)
			facts[i].contextReferences = make(map[string]*ast.Node)
			facts[i].ownedScalarCalls = make(map[string]bool)
			facts[i].callSymbols = make(map[string]ast.SymbolId)
		}
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		work.initializePropagation(facts)
		var factoryCall, methodCall, assignment *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if plainStagedAssignment(node) && ast.IsCallExpression(node.AsBinaryExpression().Right) && ast.IsIdentifier(node.AsBinaryExpression().Right.Expression()) && node.AsBinaryExpression().Right.Expression().Text() == "factory" {
				region := enclosingCallableNode(node)
				if region != nil && region.Name() != nil && region.Name().Text() == parentName {
					assignment = node
				}
			}
			if ast.IsCallExpression(node) {
				if ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "factory" {
					region := enclosingCallableNode(node)
					if region != nil && region.Name() != nil && region.Name().Text() == "invoke" {
						factoryCall = node
					}
				}
				if ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "get" {
					methodCall = node
				}
			}
			return true
		})
		caller := work.memberNodes[enclosingCallableNode(methodCall)]
		factoryEffects, registered := work.registerStagedDeclarationCallEffects(facts, caller, factoryCall, owner)
		if !registered {
			t.Fatal("original RHS Effects source missing")
		}
		nodeTargets := make(map[*ast.Node]int)
		symbols := make(map[ast.SymbolId]int)
		for index, fact := range facts {
			nodeTargets[fact.node] = index
			if symbol := callableDeclarationSymbol(fact.node, owner.checker); symbol != nil {
				symbols[ast.GetSymbolId(symbol)] = index
			}
		}
		syntactic := collectSyntacticCallableTargets(facts)
		imports, contexts := collectExternalImportBindings(file, owner.checker), collectContextBindings(file, owner.checker)
		for work.extractionHead < len(work.extractionQueue) {
			next := work.extractionQueue[work.extractionHead]
			if next.operation.index == 0 && next.callable == caller {
				break
			}
			task, ok := work.nextExtraction()
			if !ok {
				break
			}
			if task.operation.index != 0 {
				work.extractOperation(facts, task, owner)
				continue
			}
			index := task.callable
			collectDirectCallableEffects(&facts[index], index, facts, symbols, syntactic, nodeTargets, file, owner.checker, nil, nil, imports, contexts, assetAnalysis{}, owner, &work)
			work.finishExtraction(facts, index)
		}
		root, prepared := work.prepareConstructedResultSource(facts, caller, methodCall, owner)
		if !prepared || !work.issuedConstructedProtocolSource(work.operationRecipes[root.producer]) {
			t.Fatal("original constructed Call source not issued")
		}
		work.stageAssignment(facts, work.memberNodes[enclosingCallableNode(assignment)], assignment, owner)
		var transport sourceStagedOperationRecipe
		found := false
		for _, recipe := range work.operationRecipes {
			source := recipe.memberSource
			if source != nil && source.candidate.protocol && source.candidate.operation == methodCall && source.parent.producer.operation == assignment.AsBinaryExpression().Left {
				if source.protocolSource == nil || !sameOperationRequest(source.protocolSource.required, root) || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], root) {
					t.Fatal("private Set lost original conditional Call contribution")
				}
				transport, found = recipe, true
			}
		}
		if !found || !transport.delta.extracted {
			t.Fatal("private Set protocol transport unavailable")
		}
		issued := work.constructedIssued
		work.constructedIssued = nil
		borrowed := work.issuedConstructedProtocolSource(work.operationRecipes[root.producer])
		work.constructedIssued = issued
		if borrowed {
			t.Fatal("missing original Get issuance admitted Call source")
		}
		if len(facts[caller].summary.Calls) != 0 || len(facts[caller].staged.calls) != 0 {
			t.Fatal("passive source attachment activated original Call")
		}
		work.extracting = caller
		entered := work.stageSourceDeclarationCall(facts, caller, factoryCall, owner)
		work.extracting = -1
		if !entered {
			t.Fatal("actual RHS owner refused")
		}
		work.prepareOperationUses(facts, owner)
		for _, edge := range facts[caller].summary.Calls {
			if facts[caller].fieldEdgeOperations[edge.ID] != factoryCall {
				t.Fatal("source-only method body activated before its ordinary Call")
			}
		}
		refined := false
		for _, recipe := range work.operationRecipes {
			source := recipe.memberSource
			if source != nil && source.candidate.operation == methodCall && source.protocolSource != nil && source.protocolSource.get != nil {
				if source.protocolSource.selfRead != selfRead {
					t.Fatalf("actual method did not wake its pending contextual reader: associated=%t", work.stagedSelfReadMethod(methodCall, source.parent.consumer))
				}
				if selfRead {
					id, adopted := work.operationIDs[source.request.producer]
					if !adopted {
						t.Fatal("contextual source not adopted")
					}
					state := &work.operations[id.index]
					acknowledged := false
					for _, subscriber := range state.subscribers {
						if sameOperationRequest(subscriber.request, source.request) {
							acknowledged = !subscriber.blocked && subscriber.consumed == state.revision && subscriber.applied == state.revision
						}
					}
					if state.revision == 0 || !acknowledged {
						t.Fatal("contextual source revision not delivered")
					}
				}
				if !selfRead && (recipe.delta.extracted || len(recipe.delta.required) == 0) {
					t.Fatal("independent method contribution lost its pending source requirements")
				}
				refined = true
			}
		}
		if !refined {
			t.Fatal("original contextual reader absent")
		}
		if !work.stageConstructedResultOccurrence(facts, caller, methodCall, owner) {
			t.Fatal("actual ordinary method Call refused")
		}
		work.prepareOperationUses(facts, owner)
		method := false
		for _, edge := range facts[caller].summary.Calls {
			dependency := work.stagedRequired[sourceStagedDependencyKey{caller, edge.ID}]
			method = method || dependency != nil && dependency.operation == methodCall
		}
		if !method {
			t.Fatal("actual ordinary method Call lost canonical body delivery")
		}
		if work.closedOperationDependencies()[work.operationIDs[root.producer].index] {
			t.Fatal("undelivered caller eager/body requirements completed")
		}
		// Propagation publishes a real revision independently of environment
		// changes. A pure factory still needs its original body acknowledgement.
		work.initializePropagation(facts)
		body := work.stagedRequired[sourceStagedDependencyKey{caller, factoryEffects.edge + ":body"}]
		producer := work.memberNodes[work.operationRecipes[factoryEffects.producer].declarationCall.invocation.declaration]
		if body == nil || work.stagedRevisions[producer] == 0 {
			t.Fatal("real definition revision missing")
		}
		work.refreshStagedMemberActivations(facts, owner)
		if body.invalid || body.consumed != work.stagedRevisions[producer] {
			t.Fatal("original Call Effects body missed late revision delivery")
		}
	})
}
