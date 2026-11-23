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
					if q.localNumericWriterCall(call, bindings) {
						t.Fatal("numeric proof bypassed a substituted callee")
					}
				}
			})
		})
	}
}
