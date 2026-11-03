package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// An uncorrelated descriptor Get can retain source captures, but cannot borrow
// the descriptor target as this or publish an original operation/normal output.
func TestReflectiveSourceGetHasNoNormalAuthority(t *testing.T) {
	source := `function install(box:object,value:{value:string}){Object.defineProperty(box,"field",{get(){return value}})}const target:{field?:{value:string}}={};const donor={get value(){return document.title}};install(target,donor);export const result=target.field!.value;`
	request := Request{Kind: "analyze", ID: "/virtual/reflected-get-authority.ts", Source: source, Diagnostics: "semantic"}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) > 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	var operation, origin, reader, getter *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
		if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.AsCallExpression().Expression) && n.AsCallExpression().Expression.AsPropertyAccessExpression().Name().Text() == "defineProperty" {
			operation = n
		}
		if ast.IsVariableDeclaration(n) && n.Name().Text() == "target" {
			origin = n.Initializer()
		}
		if ast.IsVariableDeclaration(n) && n.Name().Text() == "result" {
			reader = n.Initializer()
		}
		if ast.IsMethodDeclaration(n) && n.Name().Text() == "get" {
			getter = n
		}
		return true
	})
	q := newSourceDependencyQuery(reader, generation.checker, newExecutableBodyOwner(project, generation.checker), nil)
	q.reading = reader
	part := accessorCandidates{}
	values, possible := q.reflectiveMemberValuesAtGet(origin, []string{"field"}, "value", operation, accessorAcquire, nil, &part, nil, q.memberWriterReadCut(nil, nil, &part))
	if !possible || len(values) == 0 || !part.opaque {
		t.Fatal("source getter lost capture or uncertainty", possible, len(values), part.opaque)
	}
	for _, value := range values {
		if value.capture == nil || value.normal != nil || value.acquired != nil || value.native != nil {
			t.Fatal("source return retained normal output or lost capture")
		}
	}
	found := false
	for _, inputs := range part.inputs {
		if inputs.declaration != getter {
			continue
		}
		found = true
		if inputs.operationLifetime != nil || inputs.operations != nil || inputs.storage != nil || inputs.population != nil || inputs.consumedCall != nil || inputs.get == nil || inputs.get.operation != nil || inputs.get.receiver.node != nil || inputs.get.receiver.native != nil {
			t.Fatal("uncorrelated Get retained normal/target authority")
		}
	}
	if !found {
		t.Fatal("source getter input witness missing")
	}
	for _, call := range part.fieldCalls {
		if call.target == getter && call.operation != nil {
			t.Fatal("MAY getter discharged an actual Get")
		}
	}
	if len(part.normalCalls)+len(part.nativeCalls)+len(part.accessorMutations)+len(part.nativeDescriptorEffects) != 0 {
		t.Fatal("source getter published normal/descriptor evidence")
	}
}

// Literal-indexed Gets retain the requested member's captured descriptor donor.
func TestReflectiveSourceGetLiteralIndex(t *testing.T) {
	const source = `function install(box:object,get:()=>{value:string}){Object.defineProperty(box,"field",{get})}const target:{field?:{value:string}}={};const donor={get value(){return document.title}};install(target,()=>donor);export const value=target["field"]!.value;`
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reflective-get-index.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	browser, unknown := reentrantInitializerEffects(t, r, source, true)
	if !browser || !unknown {
		t.Fatal("literal-indexed descriptor Get lost donor or residual", browser, unknown)
	}
}
