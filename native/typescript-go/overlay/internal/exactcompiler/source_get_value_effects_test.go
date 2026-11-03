package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A known selected return cannot erase earlier caller uncertainty. An output-only
// observer cannot enter the wrapper or borrow a body result to fill that gap.
func TestSourceGetterPriorUncertaintyAndRefusal(t *testing.T) {
	const source = `const box={get value(){return "safe"}};export const value=box.value;`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/get-value-effect.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, p := range session.projects {
		if p.callableCache == nil {
			continue
		}
		var body, receiver, operation *ast.Node
		walkNode(p.program.GetSourceFile("/virtual/get-value-effect.ts").AsNode(), func(n *ast.Node) bool {
			if ast.IsGetAccessorDeclaration(n) {
				body = n
				receiver = n.Parent
			}
			if ast.IsPropertyAccessExpression(n) {
				operation = n
			}
			return true
		})
		if body == nil || receiver == nil || operation == nil {
			t.Fatal("missing original Get")
		}
		owner := p.callableCache.owner
		newQuery := func() *sourceValueQuery { return newSourceDependencyQuery(operation, owner.values.checker, owner, nil) }
		get := &sourceGetInputs{operation: operation, receiver: sourceValue{node: receiver}}
		scope := acquiredCallableScope{bindings: make(sourceValueBindings)}
		q := newQuery()
		prior := accessorCandidates{valueIncomplete: true}
		observed := q.acquireGetResult(body, get, scope, &prior)
		if !prior.valueIncomplete || observed.incomplete || len(observed.values) != 1 {
			t.Fatal("known return erased prior uncertainty or lost its value")
		}
		q = newQuery()
		q.operation = &sourceOperationContext{node: operation, outputOnly: true}
		refused := accessorCandidates{}
		observed = q.acquireGetResult(body, get, scope, &refused)
		if !refused.valueIncomplete || len(observed.values) != 0 || len(refused.effects) != 0 {
			t.Fatal("refused wrapper acquired a body or output")
		}
		return
	}
	t.Fatal("missing project")
}
