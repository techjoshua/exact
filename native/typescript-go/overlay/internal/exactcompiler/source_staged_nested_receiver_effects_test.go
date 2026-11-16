package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Byte-identical to TestSourceSetterEmittedOrder. Its strict client/server and
// Node outcomes remain the terminal consumer; this control isolates the real
// collector handoff while unrelated getter/setter debts may remain pending.
const nestedReceiverOriginalSource = `export function run(fail=false){const events:string[]=[];const captured={count:0};function original(this:{tag:string}){events.push('original:'+this.tag);return 1}let selected=original;const box={tag:'box',field:0,get work(){events.push('get');return selected},set work(next:typeof original){events.push('set:'+this.tag);this.field=++captured.count;selected=next}};function receiver(){events.push('receiver');return box}const input={get value(){events.push('rhs');if(fail)throw 9;return function replacement(this:{tag:string}){events.push('call:'+this.tag);return 7}}};try{const before=box.work();receiver().work=input.value;const value=box.work();return {before,value,events,field:box.field,count:captured.count}}catch(error){return {error,events,field:box.field,count:captured.count}}finally{events.push('finally')}}`

func TestNestedReceiverOriginalAssignmentEffects(t *testing.T) {
	withReflectiveRelevanceSource(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile) {
		var operation, receiver, caller, body, event *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if plainStagedAssignment(n) && sourceText(file, n) == "receiver().work=input.value" {
				operation = n
			}
			if ast.IsFunctionDeclaration(n) && n.Name() != nil && n.Name().Text() == "receiver" {
				body = n
			}
			if ast.IsCallExpression(n) && sourceText(file, n) == "events.push('receiver')" {
				event = n
			}
			return true
		})
		if operation == nil || body == nil || event == nil {
			t.Fatal("original assignment/receiver BODY/event not found")
		}
		receiver, _ = accessorReceiver(operation.AsBinaryExpression().Left)
		caller = enclosingCallableNode(operation)
		if receiver == nil || !ast.IsCallExpression(receiver) || enclosingCallableNode(body.Parent) != caller {
			t.Fatal("original lexical Call identity")
		}
		analysis := collectCallableEffects(file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, owner)
		var callerFact, bodyFact *callableFacts
		for i := range analysis.facts {
			fact := &analysis.facts[i]
			if fact.node == caller {
				callerFact = fact
			}
			if fact.node == body {
				bodyFact = fact
			}
		}
		if callerFact == nil || bodyFact == nil {
			t.Fatal("real collector omitted original owners")
		}
		var association *sourceStagedDeclarationCall
		for i := range callerFact.staged.calls {
			call := &callerFact.staged.calls[i]
			if call.invocation.operation == receiver && call.invocation.declaration == body {
				association = call
			}
		}
		if association == nil || association.kind != relativeDemandEffects || association.sourceInputs == nil || association.inputs != nil || association.legacyInputs || association.inputConsumerWait != nil {
			t.Fatal("original nested Call lacks canonical SOURCE Effects association")
		}
		if association.invocation.cut != (sourceRelativeCut{operation: receiver, use: receiver, reading: receiver}) || len(association.invocation.actuals) != 0 {
			t.Fatal("nested Call input/cut changed")
		}
		edge := stagedDeclarationCallEdge(callerFact.summary.ID, association.invocation)
		reached := false
		for _, actual := range callerFact.summary.Calls {
			reached = reached || actual.ID == edge && actual.Resolved && actual.TargetID == bodyFact.summary.ID && callerFact.fieldEdgeOperations[edge] == receiver
		}
		if !reached {
			t.Fatal("source recipe replaced original resolved Call/BODY relationship")
		}
		authoredBody := false
		for _, actual := range bodyFact.summary.Calls {
			authoredBody = authoredBody || bodyFact.fieldEdgeOperations[actual.ID] == event
		}
		if !authoredBody {
			t.Fatal("actual receiver BODY lost its authored push Call")
		}
		expected := stagedDeclarationCallEffectsRequest(receiver, caller)
		child, phase := false, false
		for _, recipe := range callerFact.staged.operationRecipes {
			if recipe.key == expected.producer {
				child = true
				if !validStagedDeclarationCallEffectsRecipe(recipe) || recipe.declarationCallGeneration != owner.values.generation || recipe.declarationCall.invocation.declaration != body || len(recipe.delta.exposures) != 0 {
					t.Fatal("nested receiver Effects source became DATA or lost its generation/BODY")
				}
			}
			if recipe.assignment != nil && recipe.assignment.root.use == operation && recipe.assignment.phase == "receiver" {
				for _, required := range recipe.delta.required {
					phase = phase || sameOperationRequest(required, expected)
				}
			}
		}
		if !child || !phase {
			t.Fatalf("assignment receiver did not consume original Call Effects: child=%t phase=%t", child, phase)
		}
		if _, accepted := describeStagedInputSubstitution(receiver, caller, owner); accepted {
			t.Fatal("Effects eligibility widened result/source input planner")
		}
		if _, accepted := describeStagedCallReturnSources(*association, owner); accepted {
			t.Fatal("nested Effects acquired returned box DATA")
		}
		// A detached work graph cannot inherit this graph's original observation.
		clones := make([]callableFacts, len(analysis.facts))
		for i := range analysis.facts {
			clones[i] = cloneProjectCallableFact(analysis.facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		if _, current := fresh.currentDeclarationCallEffects(fresh.operationRecipes[expected.producer]); current {
			t.Fatal("fresh graph inherited nested Call currentness")
		}
	})
}

// Use real Program lifetimes and original source nodes, never copied generation
// receipts. A matching source spelling cannot substitute for owner/cut identity.
func TestNestedReceiverEffectsOriginalOwnerAndGeneration(t *testing.T) {
	var oldCall, oldCaller *ast.Node
	for pass := 0; pass < 2; pass++ {
		withReflectiveRelevanceSource(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile) {
			var call *ast.Node
			walkNode(file.AsNode(), func(n *ast.Node) bool {
				if ast.IsCallExpression(n) && sourceText(file, n) == "receiver()" {
					call = n
				}
				return true
			})
			if call == nil {
				t.Fatal("original receiver Call missing")
			}
			caller := enclosingCallableNode(call)
			facts := stagedReturnSourceFacts(file)
			work := registerCallableEffectWork(facts)
			callerIndex := work.memberNodes[caller]
			request, ok := work.registerStagedDeclarationCallEffects(facts, callerIndex, call, owner)
			if !ok {
				t.Fatal("current original nested declaration refused")
			}
			recipe := work.operationRecipes[request.producer]
			input := recipe.declarationCall.sourceInputs
			if input == nil || input.invocation.operation != call || enclosingCallableNode(input.invocation.declaration.Parent) != caller {
				t.Fatal("original nested source identity")
			}
			wrong := work.memberNodes[input.invocation.declaration]
			if _, ok := work.registerStagedDeclarationCallEffects(facts, wrong, call, owner); ok {
				t.Fatal("wrong original caller accepted")
			}
			changed := recipe
			changed.key.operation = call.Expression()
			if validStagedDeclarationCallEffectsRecipe(changed) {
				t.Fatal("callee read became original Call")
			}
			if len(facts[callerIndex].staged.calls) != 0 || len(facts[callerIndex].summary.Calls) != 0 {
				t.Fatal("passive description manufactured nested Call")
			}
			if _, current := work.currentDeclarationCallEffects(recipe); current {
				t.Fatal("passive nested source granted currentness")
			}
			if oldCall != nil {
				// A real fresh owner must refuse the old source even when its old lexical
				// identity is supplied; no generation or execution receipt is copied.
				if _, ok := describeStagedInputSubstitution(oldCall, oldCaller, owner); ok {
					t.Fatal("released Program source entered fresh result generation")
				}
				if _, ok := work.registerStagedDeclarationCallEffects(facts, callerIndex, oldCall, owner); ok {
					t.Fatal("released Program source entered fresh Effects generation")
				}
			}
			oldCall, oldCaller = call, caller
		})
	}
}
