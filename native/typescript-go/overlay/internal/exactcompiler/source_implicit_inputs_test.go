package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Source receiver mapping cannot survive copying, normal entry, a nested
// input owner, or revocation. A panic restores exactly the prior inputs/stamp.
func TestSourceReceiverInputBorrow(t *testing.T) {
	operation, body := &ast.Node{}, &ast.Node{}
	prior := &sourceValueInputs{}
	inputs := &sourceValueInputs{declaration: body}
	query := &sourceValueQuery{dependenciesOnly: true, inputs: prior}
	result := accessorCandidates{}
	var borrowed *sourceReceiverInputs
	query.withSourceReceiverInputs(operation, body, inputs, &result, func() {
		borrowed = query.sourceReceiver
		if !query.sourceReceiverInputsLive(inputs, body) {
			t.Fatal("original source borrow refused")
		}
		copyQuery, copyInputs := *query, *inputs
		if copyQuery.sourceReceiverInputsLive(inputs, body) || query.sourceReceiverInputsLive(&copyInputs, body) || query.sourceReceiverInputsLive(inputs, operation) {
			t.Fatal("copied or foreign owner inherited source borrow")
		}
		copyStamp := *borrowed
		query.sourceReceiver = &copyStamp
		if query.sourceReceiverInputsLive(inputs, body) {
			t.Fatal("copied stamp inherited original issuance")
		}
		query.sourceReceiver = borrowed
		query.dependenciesOnly = false
		if query.sourceReceiverInputsLive(inputs, body) {
			t.Fatal("normal query inherited source borrow")
		}
		query.dependenciesOnly = true
		nested := &sourceValueInputs{declaration: body}
		var nestedStamp *sourceReceiverInputs
		func() {
			defer func() {
				if recover() == nil {
					t.Fatal("missing nested panic")
				}
			}()
			query.withSourceReceiverInputs(operation, body, nested, &result, func() {
				nestedStamp = query.sourceReceiver
				if query.sourceReceiverInputsLive(inputs, body) || !query.sourceReceiverInputsLive(nested, body) {
					t.Fatal("nested input ownership confused")
				}
				panic("owned exit")
			})
		}()
		if query.sourceReceiver != borrowed || nestedStamp == nil || nestedStamp.live || !query.sourceReceiverInputsLive(inputs, body) {
			t.Fatal("panic failed to restore outer borrow")
		}
	})
	if result.opaque || query.inputs != prior || query.sourceReceiver != nil || borrowed == nil || borrowed.live || borrowed.owner != nil || query.sourceReceiverInputsLive(inputs, body) {
		t.Fatal("source borrow survived its issuer")
	}
}

// A canonical source Get supplies the selected body's capture and receiver.
// The generic loan maps this and captured writes without component branding,
// normal invocation authority or a protocol-specific input binder.
func TestSourceBorrowedReceiverWrite(t *testing.T) {
	const id = "/virtual/source-borrowed-write.ts"
	const source = `export function probe(captured:{value:number}){const receiver={state:{value:0},work(){this.state.value++;captured.value++}};receiver.work()}`
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
		var operation, captured *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "work" {
				operation = node
			}
			if ast.IsParameterDeclaration(node) && node.Name().Text() == "captured" {
				captured = node.Name()
			}
			return true
		})
		if operation == nil || captured == nil {
			t.Fatal("missing original source Get or capture")
		}
		owner := project.callableCache.owner
		query := newSourceDependencyQuery(operation, owner.checker, owner, enclosingCallableNode(operation))
		receivers := query.accessors(operation.Expression(), nil, "", accessorAcquire, nil, nil)
		if len(receivers.values) != 1 || receivers.values[0].capture == nil {
			t.Fatal("source Get lost receiver scope")
		}
		receiver := receivers.values[0]
		scope := *receiver.capture
		get := &sourceGetInputs{operation: operation, propertyKey: "work", receiver: receiver}
		selected := query.accessorsAtGet(receiver.node, []string{"work"}, "", accessorAcquire, scope.bindings, nil, get, receiver)
		if len(selected.values) != 1 || selected.values[0].acquired != nil || selected.values[0].normal != nil {
			t.Fatal("source Get did not select a whole source method")
		}
		method := selected.values[0]
		if method.capture == nil {
			t.Fatal("source Get lost method capture")
		}
		part := accessorCandidates{}
		// This zero-parameter method needs only its canonical source captures
		// and selected receiver. No Call/Get input carrier is stripped or reused.
		inputs := &sourceValueInputs{declaration: method.node, bindings: query.acquireCallableScope(method.capture.bindings, &part).bindings}
		inputs.bindings[0] = []sourceValue{receiver}
		priorCreators := query.creators
		query.creators = method.capture.creators
		query.withSourceReceiverInputs(operation, method.node, inputs, &part, func() {
			copiedBody := method.node.Clone(ast.NewNodeFactory(ast.NodeFactoryHooks{}))
			if query.sourceReceiverInputsLive(inputs, copiedBody) {
				t.Fatal("cloned body inherited original receiver loan")
			}
			query.consumeSourceBodyEffects(operation, method.node, inputs.bindings, inputs, nil, &part)
		})
		query.creators = priorCreators
		mapped, captureMapped := false, false
		captureSymbol := owner.checker.GetSymbolAtLocation(captured)
		for _, write := range part.writes {
			mapped = mapped || write.value.node == receiver.node && len(write.value.path) == 2 && write.value.path[0] == "state" && write.value.path[1] == "value"
			captureMapped = captureMapped || write.value.node != nil && ast.IsIdentifier(write.value.node) && owner.checker.GetSymbolAtLocation(write.value.node) == captureSymbol && len(write.value.path) == 1 && write.value.path[0] == "value"
		}
		if !mapped || !captureMapped || query.inputs != nil || query.sourceReceiver != nil || len(part.normalCalls)+len(part.nativeCalls) != 0 {
			t.Fatal("source receiver/capture mapping missing or normal authority published")
		}
		fact := callableFacts{node: enclosingCallableNode(operation)}
		appendSourceValueWrites(&fact, part, owner.checker)
		for _, write := range fact.directWrites {
			if write.Receiver == nil || write.Receiver.Kind == "component" {
				t.Fatal("ordinary source object acquired component state authority")
			}
		}
		normal := *query
		normal.dependenciesOnly = false
		refused := accessorCandidates{}
		normal.withSourceReceiverInputs(operation, method.node, inputs, &refused, func() {
			t.Fatal("normal query entered source receiver loan")
		})
		if !refused.opaque || normal.inputs != nil || normal.sourceReceiver != nil {
			t.Fatal("normal refusal changed receiver ownership")
		}
		return
	}
	t.Fatal("missing source fixture")
}
