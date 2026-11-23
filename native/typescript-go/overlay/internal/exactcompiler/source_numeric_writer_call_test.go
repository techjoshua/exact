package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func TestLocalNumericWriterDiscovery(t *testing.T) {
	const transfer = "function transfer(value:number) {return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;}"
	for _, row := range []struct {
		name, helper, actual string
		want                 bool
	}{
		{"checked numeric arithmetic", transfer, "x * 0.5", true},
		{"eager getter", transfer, "input.value", false},
		{"eager coercion", transfer, "+coercible", false},
		{"side-effectful helper", "function transfer(value:number){ document.title; return value; }", "x", false},
		{"authored parameter coercion", "function transfer(value:number|{valueOf():number}){return +value;}", "x", false},
		{"ambient argument", transfer + " declare const external:number;", "external", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := row.helper + "export function invoke(x:number,input:{value:number},coercible:{valueOf():number}) {return transfer(" + row.actual + ");}"
			withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
				if q.localNumericWriterCall(call, nil) != row.want {
					t.Fatal("wrong numeric call writer-discovery disposition")
				}
				if row.want {
					symbol := q.owner.checker.GetSymbolAtLocation(call.Expression())
					bindings := sourceValueBindings{ast.GetSymbolId(symbol): nil}
					file := ast.GetSourceFileOfNode(call)
					if q.owner.indexes[file].numericWriterCalls[call] != ast.GetSymbolId(symbol) {
						t.Fatal("missing generation-local numeric proof")
					}
					if q.localNumericWriterCall(call, bindings) {
						t.Fatal("cached numeric proof bypassed a substituted callee")
					}
					sibling := newSourceDependencyQuery(call, q.owner.checker, q.executable, enclosingCallableNode(call))
					if sibling.owner == q.owner || sibling.owner.indexes[file].numericWriterCalls[call] != ast.GetSymbolId(symbol) {
						t.Fatal("dependency query did not share the generation-local proof")
					}
					q.owner.indexPreparing = map[*ast.SourceFile]bool{file: true}
					if q.localNumericWriterCall(call, nil) {
						t.Fatal("cached numeric proof bypassed an in-progress index")
					}
					delete(q.owner.indexPreparing, file)
					if !q.localNumericWriterCall(call, nil) {
						t.Fatal("live refusals should not invalidate the source proof")
					}
				}
			})
		})
	}
}

// A same-session source edit changes the argument's authored evaluation.
func TestNumericWriterDiscoverySourceEdit(t *testing.T) {
	const id = "/virtual/numeric-writer-edit.ts"
	const header = `function transfer(value:number) {return value * 2;}
export function invoke(value:number, input:{value:number}) {return transfer(`
	session := NewSession()
	for _, row := range []struct {
		actual string
		want   bool
	}{
		{"value", true},
		{"input.value", false},
		{"value", true},
	} {
		response := session.Execute(Request{Kind: "analyze", ID: id, Source: header + row.actual + ");}", Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal(response.Error, response.Diagnostics)
		}
		var source *ast.SourceFile
		var owner *executableBodyOwner
		for _, project := range session.projects {
			source = project.program.GetSourceFile(id)
			if source != nil {
				owner = project.callableCache.owner
				break
			}
		}
		if source == nil || owner == nil {
			t.Fatal("missing current source owner")
		}
		var call *ast.Node
		walkNode(source.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) {
				call = node
			}
			return true
		})
		if call == nil {
			t.Fatal("missing original numeric call")
		}
		q := newSourceDependencyQuery(call, owner.checker, owner, enclosingCallableNode(call))
		if got := q.localNumericWriterCall(call, nil); got != row.want {
			t.Fatalf("edited argument %s: got %t, want %t", row.actual, got, row.want)
		}
	}
}
