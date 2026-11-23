package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func TestIndexedWriterMapGuardRetainsBoundHit(t *testing.T) {
	const program = `function later() {}
export function invoke(source: object) {
    const copies = new Map<object, boolean>();
    copies.set(source, true);
    REPLACEMENT
    const target = copies.get(source);
    if (target) return;
    later();
}`
	for _, authored := range []bool{false, true} {
		name, replacement := "closed", ""
		if authored {
			name, replacement = "replaced", "copies.get = () => true;"
		}
		t.Run(name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, strings.Replace(program, "REPLACEMENT", replacement, 1), func(q *sourceValueQuery, call *ast.Node) {
				var guard, truth *ast.Node
				walkNode(q.effectOwner, func(n *ast.Node) bool {
					if ast.IsIfStatement(n) {
						guard = n
					}
					if n.Kind == ast.KindTrueKeyword {
						truth = n
					}
					return true
				})
				if guard == nil || truth == nil {
					t.Fatal("missing source guard or bound alternative")
				}
				if got := q.unrepresentedIndexedWriterMapGuard(guard, nil); got == authored {
					t.Fatalf("unexpected indexed guard admission for %s: %v", name, got)
				}
				target := q.owner.checker.GetSymbolAtLocation(guard.AsIfStatement().Expression)
				known := sourceValueBindings{ast.GetSymbolId(target): {{node: truth}}}
				if q.unrepresentedIndexedWriterMapGuard(guard, known) {
					t.Fatal("optional source lookup suppressed a known hit")
				}
				if possible, _ := q.reachableWithin(call, nil, known, true); possible {
					t.Fatal("a represented hit must still exclude the later writer")
				}
			})
		})
	}
}
