package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This selects original source nodes to test the existing binder's implicit
// vector loan. It does not authenticate HasInstance selection or protocol Effects.
func TestImplicitInputIssuerOriginalBinary(t *testing.T) {
	const source = `class Receiver{static [Symbol.hasInstance](value:unknown){return true}}const value={};export function invoke(){return value instanceof Receiver}`
	const id = "/virtual/implicit-input-issuer.ts"
	project, diagnostics, err := newProjectState(Request{Kind: "analyze", ID: id, Source: source}, id)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	var method, operation, receiver, actual, caller *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
		if ast.IsMethodDeclaration(n) {
			method = n
		}
		if ast.IsClassDeclaration(n) {
			receiver = n
		}
		if ast.IsObjectLiteralExpression(n) {
			actual = n
		}
		if ast.IsBinaryExpression(n) && n.AsBinaryExpression().OperatorToken.Kind == ast.KindInstanceOfKeyword {
			operation = n
			caller = enclosingCallableNode(n)
		}
		return true
	})
	if method == nil || operation == nil || receiver == nil || actual == nil || caller == nil {
		t.Fatal("original implicit source nodes")
	}
	owner := newExecutableBodyOwner(project, generation.checker)
	q := newSourceDependencyQuery(operation, generation.checker, owner, caller)
	request := sourceRelativeInvocation{declaration: method, operation: operation, use: q.effectUse(), cut: q.relativeInputCut(operation), actualsKnown: true}
	request.receiver = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: operation.AsBinaryExpression().Right, producer: operation, cut: request.cut}
	request.actuals = []sourceRelativeActual{{expression: operation.AsBinaryExpression().Left, endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: operation.AsBinaryExpression().Left, producer: operation, cut: request.cut}}}
	if _, installed := q.beginSourceRelativeInputRequest(request, &sourceRelativeInputEdge{}); installed {
		t.Fatal("binary metadata manufactured implicit issuer")
	}
	inputs, delivered := q.bindStagedImplicitInputs(request, sourceValue{node: receiver}, []sourceValue{{node: actual}}, nil, &accessorCandidates{})
	if !delivered || inputs == nil || !sameSourceRelativeInputEnvelope(request, inputs.bound) || inputs.request.operation != operation {
		t.Fatal("original binary binder did not deliver")
	}
	formal, gotReceiver := false, false
	for _, binding := range inputs.bound.bindings {
		for _, endpoint := range binding.sources {
			formal = formal || binding.target.kind == relativeRoleFormal && endpoint.expression == actual
			gotReceiver = gotReceiver || binding.target.kind == relativeRoleReceiver && endpoint.expression == receiver
		}
	}
	if !formal || !gotReceiver || q.implicitSourceInputs != nil || q.relativeInputRequest != nil || q.relativeInputConsumer != nil {
		t.Fatal("implicit input vector or loan cleanup failed")
	}
	// A query copy has no implicit loan. It must refuse before the Call-only
	// syntax branch rather than treating the binary occurrence as a synthetic Call.
	copied := *q
	rejected := accessorCandidates{}
	copied.bindSourceMethodInputs(method, operation, nil, &rejected)
	if !rejected.valueIncomplete {
		t.Fatal("unissued binary binder did not refuse")
	}
	for _, which := range []string{"cut", "receiver", "actual", "missing-vector"} {
		bad := cloneStagedWriterInvocation(request)
		values := []sourceValue{{node: actual}}
		switch which {
		case "cut":
			bad.cut.reading = method
		case "receiver":
			bad.receiver.expression = actual
		case "actual":
			bad.actuals[0].expression = actual
		case "missing-vector":
			values = nil
		}
		if _, ok := q.bindStagedImplicitInputs(bad, sourceValue{node: receiver}, values, nil, &accessorCandidates{}); ok {
			t.Fatal("wrong original implicit vector admitted", which)
		}
	}
}
