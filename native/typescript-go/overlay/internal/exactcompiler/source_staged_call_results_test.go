package exactcompiler

import (
	"fmt"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original native member owner encounters a returned target before its
// creating source packet is available. It must install a real data dependency,
// then consume the late packet without calling prepareInvocation for the result.
func TestStagedCallResultOriginalMemberLateAssociation(t *testing.T) {
	const source = `function factory(){return {get freeze(){window.name;return ()=>document.title}}}function overwrite(){Object.defineProperty(factory(),'freeze',{value:()=>document.title})}export function invoke(){overwrite();return Object.freeze({})}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
		file := ast.GetSourceFileOfNode(creating)
		var root *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && stagedNativeInputIntent(node.Expression()) == sourceNativeObjectFreeze {
				root = node
			}
			return true
		})
		if root == nil {
			t.Fatal("original callee")
		}
		facts := stagedReturnSourceFacts(file)
		work := callableEffectWork{extracting: -1, extractionCalls: make(map[*ast.Node]struct{}), extractionPhases: make([]callableExtractionPhase, len(facts))}
		work.indexOperationSources(facts)
		restore := registerWriterInputFacts(owner, facts, &work)
		defer restore()
		caller := work.memberNodes[enclosingCallableNode(root)]
		requestRoot, issued := sourceStagedOccurrenceRequest(&facts[caller], root, relativeDemandEffects, "original-return-reader")
		if !issued {
			t.Fatal("original source request")
		}
		query := newSourceDependencyQuery(root, owner.checker, owner, facts[caller].node)
		occurrence := &sourceStagedNativeOccurrence{}
		revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{call: root, get: root.Expression(), request: requestRoot, occurrence: occurrence}, consumeStagedNativeDescriptorAlgorithm)
		if !installed {
			t.Fatal("original native borrower")
		}
		sink := query.stagedMember.returnResult
		query.stagedMember.returnResult = func(call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
			copied := *query
			if copied.deferStagedCallReturn(call, sourceCallResultInterest{purpose: resultSourceProjection}) || query.deferStagedCallReturn(call, sourceCallResultInterest{purpose: resultSourceProjection}) {
				t.Fatal("copied issuer or reentry inherited projection authority")
			}
			return sink(call, interest)
		}
		query.receiverCandidates(root, nil)
		revoke()
		if sink(creating, sourceCallResultInterest{purpose: resultSourceProjection}).accepted {
			t.Fatal("saved callback retained authority after source borrower exit")
		}
		if occurrence.source == nil || occurrence.callee != nil || !occurrence.pendingResults {
			for key, recipe := range work.operationRecipes {
				t.Logf("source op=%s selector=%s native=%v result=%v required=%d", sourceText(file, key.operation), key.selector.field, recipe.nativeGet != nil, recipe.callResult != nil, len(recipe.delta.required))
			}
			t.Fatal("original member did not yield on its return-data dependency")
		}
		if !work.adoptNativeInputOccurrence(facts, occurrence) {
			t.Fatal("original pending source group not adopted")
		}
		request := stagedCallResultRequest(creating, enclosingCallableNode(creating))
		id, required := work.operationIDs[request.producer]
		if !required {
			t.Fatal("return source was not required before yield")
		}
		if work.operationRecipes[request.producer].callResult.association.sourceInputs != nil || work.operations[id.index].revision != 0 {
			t.Fatal("missing creating association was invented")
		}
		// This is the existing original occurrence issuer, not a copied input
		// packet inserted into a result recipe by this control.
		writer := work.memberNodes[enclosingCallableNode(creating)]
		work.extracting = writer
		if !work.stageSourceDeclarationCall(facts, writer, creating, owner) {
			t.Fatal("original source Call did not issue its entry association")
		}
		work.extracting = -1
		work.prepareOperationUses(facts, owner)
		cached := work.operations[id.index].resultProjection
		queue, revision := len(work.extractionQueue), work.operations[id.index].revision
		work.prepareOperationUses(facts, owner)
		if cached == nil || cached != work.operations[id.index].resultProjection || queue != len(work.extractionQueue) || revision != work.operations[id.index].revision {
			t.Fatal("unchanged creating packet repeated projection or revision delivery")
		}
		state := work.operations[id.index]
		if state.revision == 0 || len(state.delta.exposures) != 1 || state.resultBody == nil {
			t.Fatal("late original packet did not deliver known dormant return source")
		}
		for _, subscriber := range state.subscribers {
			if subscriber.blocked || subscriber.applied != state.revision || len(subscriber.returned) != 1 {
				t.Fatal("actual member subscriber did not consume the return prefix")
			}
			if subscriber.returned[0].endpoint.creation != creating || subscriber.returned[0].endpoint.returning == nil {
				t.Fatal("creating/return association lost on data delivery")
			}
			if work.registerOperationUse(facts, sourceStagedOperationUse{request: subscriber.request, call: root}) {
				t.Fatal("data exposure activated a stored callable")
			}
		}
		callee := work.operationIDs[nativeRootDebtRequest(occurrence.source, "callee-get").producer]
		calleeSource := work.operationRecipes[work.operations[callee.index].key].nativeGet
		if work.operations[callee.index].nativeMemberEffects == nil || !validNativeMemberEffects(work.operations[callee.index].nativeMemberEffects, calleeSource) || !work.operations[callee.index].delta.extracted || nativeMemberCallRequirementCount(calleeSource) == 0 || stagedNativeOrdinaryInputResult(work.operationRecipes[nativeRootDebtRequest(calleeSource, "algorithm").producer].nativeGet) {
			t.Fatal("finite Get Effects were conflated with selected-only result authority")
		}
		if work.operations[callee.index].nativeCallee != nil || work.closedOperationDependencies()[work.operationIDs[occurrence.source.request.producer].index] {
			t.Fatal("returned prefix paid member alternative/category coverage")
		}
		for _, fact := range facts {
			if fact.node == enclosingCallableNode(root) && len(fact.summary.EffectSources) != 0 {
				t.Fatal("data delivery executed getter/callback bodies")
			}
		}
	})
}

func stagedReturnSourceFacts(file *ast.SourceFile) []callableFacts {
	var facts []callableFacts
	for _, node := range collectCallableNodes(file) {
		name, kind, _ := callableIdentity(node, nil)
		facts = append(facts, callableFacts{node: node, sourceFile: file, summary: CallableSummary{ID: fmt.Sprintf("callable:%s:%d", file.FileName(), node.Pos()), Name: name, Kind: kind}})
	}
	return facts
}

// This producer control uses a descriptive original source-input packet. It
// grants no member selection or result admission on behalf of a live borrower.
func TestStagedCallResultFormalActualRemainsRequired(t *testing.T) {
	const source = `function actual(){return {}}function factory(value:unknown){return value}export function invoke(){return factory(actual())}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(creating))
		work := callableEffectWork{extracting: -1, extractionCalls: make(map[*ast.Node]struct{}), extractionPhases: make([]callableExtractionPhase, len(facts))}
		work.indexOperationSources(facts)
		caller := work.memberNodes[enclosingCallableNode(creating)]
		// Borrow a descriptive packet from the original source selector. This
		// producer control supplies no delivery, activation or admission rights.
		packet, supported := describeStagedInputSubstitution(creating, facts[caller].node, owner)
		if !supported {
			t.Fatal("original source-input description")
		}
		facts[caller].staged.calls = append(facts[caller].staged.calls, sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: packet.invocation, sourceInputs: packet})
		work.operationGeneration = owner.values.generation
		request := stagedCallResultRequest(creating, facts[caller].node)
		declaration := packet.invocation.declaration
		recipe := sourceStagedOperationRecipe{key: request.producer, callResult: &sourceStagedCallResultSource{request: request, declaration: declaration, generation: owner.values.generation}}
		if !work.registerOperationRecipe(facts, recipe) {
			t.Fatal("descriptive result producer")
		}
		id, required := work.requireOperation(facts, request)
		if !required {
			t.Fatal("descriptive producer requirement")
		}
		plan, valid := describeStagedCallReturnSources(facts[caller].staged.calls[0], owner)
		if !valid {
			t.Fatal("original return source association")
		}
		projected := describeStagedReturnBindings(plan, owner)
		if len(projected.branches) != 1 {
			t.Fatalf("original formal return branch: %+v", projected)
		}
		work.prepareStagedCallResult(facts, id, owner)
		delta := work.operationRecipes[request.producer].delta
		if len(delta.exposures) != 0 || len(delta.required) != 1 {
			t.Fatalf("actual operand lost: %+v projected=%+v bindings=%+v", delta, projected, packet.bindings)
		}
		child := work.operationRecipes[delta.required[0].producer].callResult
		actual := creating.Arguments()[0]
		if child == nil || child.operand == nil || child.operand.expression != actual || delta.required[0].producer.selector.occurrence != actual || work.closedOperationDependencies()[id.index] {
			t.Fatal("source actual recipe became produced return data")
		}
	})
}
