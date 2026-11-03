package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Source receiver permission cannot survive copying, normal entry, a nested
// input owner, or revocation. A panic restores exactly the prior inputs/stamp.
func TestSourceReceiverInputBorrow(t *testing.T) {
	operation, body := &ast.Node{}, &ast.Node{}
	prior := &sourceValueInputs{}
	inputs := &sourceValueInputs{declaration: body}
	query := &sourceValueQuery{dependenciesOnly: true, inputs: prior}
	result := accessorCandidates{}
	var borrowed *sourceReceiverInputs
	query.withSourceReceiverInputs(operation, body, inputs, &result, func() {
		borrowed = inputs.sourceReceiver
		if !query.sourceReceiverInputsLive(inputs, body) {
			t.Fatal("original source borrow refused")
		}
		copyQuery, copyInputs := *query, *inputs
		if copyQuery.sourceReceiverInputsLive(inputs, body) || query.sourceReceiverInputsLive(&copyInputs, body) || query.sourceReceiverInputsLive(inputs, operation) {
			t.Fatal("copied or foreign owner inherited source borrow")
		}
		copyStamp := *borrowed
		inputs.sourceReceiver = &copyStamp
		if query.sourceReceiverInputsLive(inputs, body) {
			t.Fatal("copied stamp inherited original issuance")
		}
		inputs.sourceReceiver = borrowed
		query.dependenciesOnly = false
		if query.sourceReceiverInputsLive(inputs, body) {
			t.Fatal("normal query inherited source borrow")
		}
		query.dependenciesOnly = true
		nested := &sourceValueInputs{declaration: body}
		func() {
			defer func() {
				if recover() == nil {
					t.Fatal("missing nested panic")
				}
			}()
			query.withSourceReceiverInputs(operation, body, nested, &result, func() {
				if query.sourceReceiverInputsLive(inputs, body) || !query.sourceReceiverInputsLive(nested, body) {
					t.Fatal("nested input ownership confused")
				}
				panic("owned exit")
			})
		}()
		if nested.sourceReceiver != nil || !query.sourceReceiverInputsLive(inputs, body) {
			t.Fatal("panic failed to restore outer borrow")
		}
	})
	if result.opaque || query.inputs != prior || inputs.sourceReceiver != nil || borrowed == nil || borrowed.live || borrowed.owner != nil || query.sourceReceiverInputsLive(inputs, body) {
		t.Fatal("source borrow survived its issuer")
	}
}

// A real selected then method maps this writes to its actual source object.
// That relation does not brand the object as component state. Neither a copied
// Await nor an acquired receiver may borrow the original source operation.
func TestSourceThenReceiverWrite(t *testing.T) {
	const id = "/virtual/source-then-write.ts"
	const source = `export async function probe(){await {state:{value:0},then(resolve:(value:number)=>void){this.state.value++;resolve(1)}}}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil || project.callableCache == nil {
			continue
		}
		var operation *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsAwaitExpression(node) {
				operation = node
			}
			return true
		})
		if operation == nil {
			t.Fatal("missing original Await")
		}
		owner := project.callableCache.owner
		query := newSourceDependencyQuery(operation, owner.checker, owner, enclosingCallableNode(operation))
		operand := operation.AsAwaitExpression().Expression
		scope := acquiredCallableScope{bindings: make(sourceValueBindings)}
		receiver := sourceObservedValue{value: sourceValue{node: operand}, scope: scope}
		get := &sourceGetInputs{operation: operation, propertyKey: "then", receiver: receiver.value}
		selected := query.accessorsAtGet(operand, []string{"then"}, "", accessorAcquire, scope.bindings, nil, get, receiver.value)
		if len(selected.values) != 1 || selected.values[0].acquired != nil || selected.values[0].normal != nil {
			t.Fatal("source Get did not select a whole source method")
		}
		method := selected.values[0]
		if method.capture == nil {
			t.Fatal("source Get lost method capture")
		}
		part := accessorCandidates{}
		query.consumeSourceThenInputs(operation, method.node, receiver, *method.capture, &part)
		mapped := false
		for _, write := range part.writes {
			mapped = mapped || write.value.node == operand && len(write.value.path) == 2 && write.value.path[0] == "state" && write.value.path[1] == "value"
		}
		if !mapped || query.inputs != nil || len(part.normalCalls)+len(part.nativeCalls) != 0 {
			t.Fatal("source receiver mapping missing or normal authority published")
		}
		fact := callableFacts{node: enclosingCallableNode(operation)}
		appendSourceValueWrites(&fact, part, owner.checker)
		for _, write := range fact.directWrites {
			if write.Receiver == nil || write.Receiver.Kind == "component" {
				t.Fatal("ordinary source object acquired component state authority")
			}
		}
		copyOperation := *operation
		for _, control := range []struct {
			operation *ast.Node
			receiver  sourceObservedValue
		}{
			{&copyOperation, receiver},
			{operand, receiver},
			{operation, sourceObservedValue{value: sourceValue{node: operand, acquired: &receiver}, scope: scope}},
		} {
			refused := accessorCandidates{}
			query.consumeSourceThenInputs(control.operation, method.node, control.receiver, *method.capture, &refused)
			if !refused.opaque || len(refused.effects)+len(refused.writes) != 0 || query.inputs != nil {
				t.Fatal("foreign operation or whole carrier borrowed source receiver authority")
			}
		}
		return
	}
	t.Fatal("missing source fixture")
}
