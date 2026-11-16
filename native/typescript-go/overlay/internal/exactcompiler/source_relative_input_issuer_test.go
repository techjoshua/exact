package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The scoped issuer consumes the real source binder. Saved/copy callbacks may
// not renew a successful or expired occurrence, even with identical syntax/cuts.
func TestRelativeInputIssuerSourceLifetime(t *testing.T) {
	const source = `function invoke(input:number){return input}export const value=invoke(1);`
	request := Request{Kind: "analyze", ID: "/virtual/relative-issuer.ts", Source: source}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	var declaration, call *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionDeclaration(node) {
			declaration = node
		}
		if ast.IsCallExpression(node) {
			call = node
		}
		return true
	})
	if declaration == nil || call == nil {
		t.Fatal("missing source declaration or Call")
	}
	owner := newExecutableBodyOwner(project, generation.checker)
	query := newSourceDependencyQuery(call, generation.checker, owner, nil)
	relative := sourceRelativeInvocation{declaration: declaration, operation: call, use: query.effectUse(), cut: query.relativeInputCut(call), actualsKnown: true}
	outer, inner := sourceRelativeInputEdge{}, sourceRelativeInputEdge{}
	revokeOuter, installed := query.beginSourceRelativeInputRequest(relative, &outer)
	if !installed {
		t.Fatal("original source issuer refused")
	}
	defer revokeOuter()
	outerRequest, outerConsumer, outerIssuer := query.relativeInputRequest, query.relativeInputConsumer, query.relativeInputIssuer
	revokeInner, installed := query.beginSourceRelativeInputRequest(relative, &inner)
	if !installed {
		t.Fatal("nested source issuer refused")
	}
	copied := *query
	copied.bindInputs(declaration, call, nil, &accessorCandidates{})
	if inner.delivered {
		t.Fatal("query copy inherited the issuer")
	}
	query.bindInputs(declaration, call, nil, &accessorCandidates{})
	if !inner.delivered || outer.delivered {
		t.Fatal("binder delivered to the wrong scoped consumer")
	}
	revokeInner()
	if query.relativeInputRequest != outerRequest || query.relativeInputIssuer != outerIssuer || query.relativeInputConsumer == nil {
		t.Fatal("nested issuer did not restore its prior owner")
	}
	query.reading = declaration
	query.bindInputs(declaration, call, nil, &accessorCandidates{})
	if outer.delivered {
		t.Fatal("changed acquisition cut delivered")
	}
	query.reading = call
	query.bindInputs(declaration, call, nil, &accessorCandidates{})
	if !outer.delivered || len(outer.bound.bindings) == 0 {
		t.Fatal("original binder did not deliver detached role inputs")
	}
	valid := cloneSourceRelativeBoundInputs(outer.bound)
	revokeOuter()
	if query.relativeInputRequest != nil || query.relativeInputConsumer != nil || query.relativeInputIssuer != nil {
		t.Fatal("issuer rights survived the original occurrence")
	}
	outerConsumer(sourceRelativeBoundInputs{})
	outerConsumer(valid)
	if !sameSourceRelativeInputEnvelope(relative, outer.bound) {
		t.Fatal("expired callback replaced the published inputs")
	}
	if sameSourceRelativeInputEnvelope(sourceRelativeInvocation{declaration: declaration, operation: call}, valid) {
		t.Fatal("different original use/cut authenticated")
	}
	if _, installed := query.beginSourceRelativeInputRequest(relative, &outer); installed {
		t.Fatal("a new issuer could mutate retained edge inputs")
	}
}
