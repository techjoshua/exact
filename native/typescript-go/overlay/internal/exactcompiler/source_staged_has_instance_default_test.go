package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These controls consume receipts from the actual source traversal. Constructor
// bodies and the immediate LHS callable remain dormant during default lookup.
func TestStagedHasInstanceClassDefaultSource(t *testing.T) {
	for _, body := range []string{"return true", "throw 'stop'"} {
		source := `class Receiver{constructor(){document.title}static [Symbol.hasInstance](_value:unknown):boolean{window.name;` + body + `}}export function invoke(){return (()=>document.title) instanceof Receiver}`
		withHasInstanceSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
			consumer := installationFactIndex(t, facts, q.effectOwner)
			work := newCallableEffectWork(facts)
			if !work.stageHasInstance(facts, consumer, operation, q.executable) {
				t.Fatal("original operator not issued")
			}
			work.prepareOperationUses(facts, q.executable)
			root := work.operationRecipes[sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}].hasInstance.root
			request := stagedHasInstanceRequest(root, "prototype")
			state := &work.operations[work.operationIDs[request.producer].index]
			if state.hasInstance == nil || state.hasInstance.defaultProof == nil {
				t.Fatal("original class Get/function creation did not issue default contribution")
			}
			proof := state.hasInstance.defaultProof
			if !validStagedHasInstanceDefault(proof, root, q.owner.generation) || !work.operationRecipes[request.producer].delta.extracted {
				t.Fatal("source default contribution not locally represented")
			}
			if proof.creation.endpoint.expression != unwrapSourceCallableReference(operation.AsBinaryExpression().Left) || proof.class.prototypeGet.expression != operation.AsBinaryExpression().Right || len(proof.class.required) != 1 || len(work.operationRecipes[request.producer].delta.required) == 0 {
				t.Fatal("original operands or writer/prototype dependencies lost")
			}
			for _, call := range facts[consumer].staged.calls {
				if call.invocation.declaration == proof.creation.endpoint.expression || (call.invocation.declaration != nil && ast.IsConstructorDeclaration(call.invocation.declaration)) {
					t.Fatal("default protocol invoked LHS or class constructor")
				}
			}
			copy := *proof
			copy.class = proof.class
			copy.class.cut.reading = proof.class.definition
			if validStagedHasInstanceDefault(&copy, root, q.owner.generation) {
				t.Fatal("retargeted source cut admitted")
			}
			copy = *proof
			copy.generation = nil
			if validStagedHasInstanceDefault(&copy, root, q.owner.generation) {
				t.Fatal("expired generation admitted")
			}
			copy = *proof
			copy.creation.endpoint.creation = operation
			if validStagedHasInstanceDefault(&copy, root, q.owner.generation) {
				t.Fatal("invented LHS creating association admitted")
			}
		})
	}
}

func TestStagedHasInstanceDefaultUnsupportedCreation(t *testing.T) {
	for _, left := range []string{`async()=>document.title`, `function*(){document.title}`, `new Proxy(()=>document.title,{})`, `document`} {
		source := `class Receiver{static [Symbol.hasInstance](_value:unknown){window.name;return true}}export function invoke(){return (` + left + `) instanceof Receiver}`
		withHasInstanceSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
			consumer := installationFactIndex(t, facts, q.effectOwner)
			work := newCallableEffectWork(facts)
			if !work.stageHasInstance(facts, consumer, operation, q.executable) {
				t.Fatal("original unsupported operator lost required source path")
			}
			work.prepareOperationUses(facts, q.executable)
			root := work.operationRecipes[sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}].hasInstance.root
			id := work.operationIDs[stagedHasInstanceRequest(root, "prototype").producer]
			state := &work.operations[id.index]
			if state.hasInstance != nil && state.hasInstance.defaultProof != nil || work.closedOperationDependencies()[work.operationIDs[root.producer].index] {
				t.Fatal("unsupported creation became an ordinary default-chain receipt")
			}
		})
	}
}

// A saved semantic-owner callback cannot issue creation after its exact borrow
// has expired, even though the original AST and current generation still match.
func TestStagedHasInstanceCreationReceiptLifetime(t *testing.T) {
	const source = `export function invoke(){return (()=>document.title) instanceof WeakMap}`
	withHasInstanceSource(t, source, func(q *sourceValueQuery, operation *ast.Node, _ []callableFacts) {
		get := &sourceGetInputs{operation: operation}
		count := 0
		borrow := &sourceStagedHasInstanceGetBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, get: get, cut: q.relativeInputCut(operation), creation: func(sourceStagedHasInstanceCreation) { count++ }}
		revoke := q.beginStagedHasInstanceGet(borrow)
		q.accessorsAtGet(operation.AsBinaryExpression().Left, nil, "", accessorAcquire, nil, nil, nil)
		if count != 1 {
			t.Fatal("actual immediate creation owner did not publish once")
		}
		revoke()
		q.accessorsAtGet(operation.AsBinaryExpression().Left, nil, "", accessorAcquire, nil, nil, nil)
		if count != 1 || borrow.creation != nil {
			t.Fatal("revoked source borrow retained creation rights")
		}
	})
}
