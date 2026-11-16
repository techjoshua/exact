package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Inspect the same original G4 journey after its real queued source tasks. No
// additional observation, task, collector, invocation or binder is introduced.
func assertGlobalStoreDeclarationProtocols(t *testing.T, work *callableEffectWork, facts []callableFacts, owner *executableBodyOwner) {
	t.Helper()
	var call, read, write *ast.Node
	var file *ast.SourceFile
	for _, fact := range facts {
		if fact.sourceFile != nil && ast.IsFunctionDeclaration(fact.node) && callableNameText(fact.node.Name()) == "sharedOpaqueOperationStore" {
			file = fact.sourceFile
			break
		}
	}
	if file == nil {
		t.Fatal("original global store source missing")
	}
	walkNode(file.AsNode(), func(n *ast.Node) bool {
		if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "sharedOpaqueOperationStore" {
			call = n
		}
		if ast.IsVariableDeclaration(n) && n.Name() != nil && ast.IsIdentifier(n.Name()) && n.Name().Text() == "existing" {
			read = n.Initializer()
		}
		if ast.IsBinaryExpression(n) && n.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken && ast.IsElementAccessExpression(n.AsBinaryExpression().Left) {
			write = n.AsBinaryExpression().Left
		}
		return true
	})
	if call == nil || read == nil || write == nil {
		t.Fatal("original Call/Get/Set tuple missing")
	}
	caller := enclosingCallableNode(call)
	expected := stagedDeclarationCallEffectsRequest(call, caller)
	root, issued := work.operationRecipes[expected.producer]
	if !issued || !validStagedDeclarationCallEffectsRecipe(root) || root.declarationCallGeneration != work.operationGeneration || work.declarationCallObserved[root.key] != work.operationGeneration || root.declarationCall.sourceInputs == nil || root.declarationCall.inputs != nil {
		t.Fatal("original caller's passive declaration Effects source not issued")
	}
	sourceID, adopted := work.operationIDs[expected.producer]
	if !adopted || sourceID.epoch != work.operationEpoch || sourceID.index == 0 || work.operations[sourceID.index].invalid || !work.operations[sourceID.index].dependenciesRegistered {
		t.Fatal("renewed original producer is not adopted/current/noninvalid")
	}
	callerIndex := work.memberNodes[caller]
	if len(facts[callerIndex].staged.calls) != 0 || len(facts[callerIndex].summary.Calls) != 0 {
		t.Fatal("source renewal manufactured a canonical Call or invocation")
	}
	if _, current := work.currentDeclarationCallEffects(root); current || work.closedOperationDependencies()[sourceID.index] {
		t.Fatal("fresh source membership paid missing canonical Call closure")
	}
	queued, recipes := len(work.extractionQueue), len(work.operationRecipes)
	if !work.renewStagedDeclarationCallSource(facts, sourceID, owner) || len(work.extractionQueue) != queued || len(work.operationRecipes) != recipes {
		t.Fatal("current producer source was not reused idempotently")
	}
	if work.renewStagedDeclarationCallSource(facts, sourceID, nil) {
		t.Fatal("producer renewal borrowed a missing task owner")
	}
	if indexed, exists := work.memberProtocolSources[call]; !exists || !sameOperationRequest(indexed, expected) {
		t.Fatal("original Call source did not reach protocol index")
	}
	get, set := false, false
	for key, recipe := range work.operationRecipes {
		source := recipe.memberSource
		if source == nil || source.candidate.operation != call || source.parent.producer.operation != read && source.parent.producer.operation != write {
			continue
		}
		if source.extraction == nil || source.protocolSource == nil || !sameOperationRequest(source.protocolSource.required, expected) || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], expected) || source.candidate.region != caller || source.parent.consumer == caller || source.candidate.cut != source.extraction.cut || !validStagedMemberProtocolRecipe(recipe) {
			t.Fatalf("original Get/Set did not bind its exact Call Effects producer: op=%v@%d protocol=%v extraction=%v", key.operation.Kind, key.operation.Pos(), source.protocolSource != nil, source.extraction != nil)
		}
		id, adopted := work.operationIDs[key]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || work.operations[id.index].invalid {
			t.Fatal("original protocol source membership missing/invalid")
		}
		sourceID, adopted := work.operationIDs[expected.producer]
		if !adopted || sourceID.epoch != work.operationEpoch || sourceID.index == 0 {
			t.Fatal("protocol completed before source child enrollment")
		}
		get = get || source.parent.producer.operation == read
		set = set || source.parent.producer.operation == write
		queued, recipes := len(work.extractionQueue), len(work.operationRecipes)
		calls, uses := make([]int, len(facts)), make([]int, len(facts))
		for i := range facts {
			calls[i], uses[i] = len(facts[i].summary.Calls), len(facts[i].staged.operationUses)
		}
		if work.prepareStagedDeclarationProtocolSource(facts, id, owner) || len(work.extractionQueue) != queued || len(work.operationRecipes) != recipes {
			t.Fatal("bound source request was renewed instead of reused")
		}
		for i := range facts {
			if len(facts[i].summary.Calls) != calls[i] || len(facts[i].staged.operationUses) != uses[i] {
				t.Fatal("passive source reuse activated ordinary work")
			}
		}
	}
	if !get || !set {
		t.Fatal("original Call Effects source did not bind BOTH scope[key] readers")
	}
	// The actual canonical witness is independent of source registration. Removing
	// only that association must prevent closure, without replaying any body.
	if actual, current := work.currentDeclarationCallEffects(root); current {
		edge := stagedDeclarationCallEdge(facts[callerIndex].summary.ID, actual.invocation)
		prior, present := facts[callerIndex].fieldEdgeOperations[edge]
		delete(facts[callerIndex].fieldEdgeOperations, edge)
		_, borrowed := work.currentDeclarationCallEffects(root)
		if present {
			facts[callerIndex].fieldEdgeOperations[edge] = prior
		}
		if borrowed {
			t.Fatal("source description replaced missing canonical Call association")
		}
	}
	clones := make([]callableFacts, len(facts))
	for i := range facts {
		clones[i] = cloneProjectCallableFact(facts[i])
	}
	fresh := registerCallableEffectWork(clones)
	fresh.operationGeneration = work.operationGeneration
	if _, current := fresh.currentDeclarationCallEffects(fresh.operationRecipes[expected.producer]); current {
		t.Fatal("fresh graph inherited source/Call observation")
	}
}

// The new request path delegates callee/actual eligibility to the existing
// lexical Call owner. Unsupported source is pending, never a foreign terminal.
func TestStagedDeclarationProtocolUnsupportedSource(t *testing.T) {
	for _, source := range []string{
		`function target(value='x'){return value}export function invoke(){return target('x')}`,
		`function target(...values:string[]){return values}export function invoke(){return target('x')}`,
		`let target=(value:string)=>value;target=value=>value;export function invoke(){return target('x')}`,
		`declare const target:(value:string)=>string;export function invoke(){return target('x')}`,
	} {
		withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
			var call *ast.Node
			walkNode(file.AsNode(), func(n *ast.Node) bool {
				if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "target" {
					call = n
				}
				return true
			})
			facts := stagedReturnSourceFacts(file)
			work := registerCallableEffectWork(facts)
			caller := work.memberNodes[enclosingCallableNode(call)]
			if _, registered := work.registerStagedDeclarationCallEffects(facts, caller, call, owner); registered {
				t.Fatal("unsupported original Call manufactured an Effects producer")
			}
			if _, indexed := work.memberProtocolSources[call]; indexed {
				t.Fatal("unsupported source entered protocol index")
			}
			if len(facts[caller].staged.calls) != 0 || len(facts[caller].summary.Calls) != 0 {
				t.Fatal("unsupported source request activated a Call")
			}
		})
	}
}
