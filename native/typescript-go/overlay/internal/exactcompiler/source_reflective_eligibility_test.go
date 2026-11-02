package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// An excluded indexed operation owns no input acquisition. In particular,
// acquiring a native member cannot reopen its already-active source operation.
func TestReflectiveExcludedCandidateDoesNotAcquireInputs(t *testing.T) {
	const id = "/virtual/reflective-eligibility.ts"
	const source = `function install(key:string){Object.defineProperty({},key,{value:1});Object.freeze({})}install('field');export const value=1;`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil {
			continue
		}
		var calls []*ast.Node
		var reader *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) {
				calls = append(calls, n)
			}
			if ast.IsVariableDeclaration(n) && n.Name().Text() == "value" {
				reader = n.Name()
			}
			return true
		})
		if len(calls) != 2 || reader == nil {
			t.Fatal("missing authored operations")
		}
		owner := project.callableCache.owner
		global := owner.values.checker.GetGlobalSymbol("Object", ast.SymbolFlagsValue, nil)
		for i, call := range calls {
			q := newSourceDependencyQuery(reader, owner.values.checker, owner, nil)
			get := &sourceGetInputs{operation: call.Expression(), receiver: sourceValue{native: &sourceNativeValue{kind: sourceNativeObjectConstructor}}, propertyKey: "freeze"}
			part := accessorCandidates{}
			before := q.owner.work
			consume := func() {
				values, possible := q.reflectiveMemberValuesAtGet(global.ValueDeclaration, []string{"freeze"}, "", call, accessorAcquire, nil, &part, get, nil)
				if possible || len(values) != 0 || part.opaque {
					t.Fatal("excluded candidate supplied a relation", part)
				}
			}
			if i == 0 {
				q.withActiveInvocation(call, consume)
			} else {
				consume()
			}
			if q.owner.work != before {
				t.Errorf("excluded operation %d reacquired writer inputs: %d work", i, q.owner.work-before)
			}
		}
		return
	}
	t.Fatal("missing source project")
}
