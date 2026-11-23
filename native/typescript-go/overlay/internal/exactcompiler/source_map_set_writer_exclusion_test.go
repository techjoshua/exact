package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func TestClosedLocalMapSetWriterDiscovery(t *testing.T) {
	const closed = `function collect(key: {id:string}, item: unknown) {
		const result = new Map<string,unknown>();
		const visit = (depth: number): void => {
			result.set(key.id,item);
			if (depth > 0) visit(depth-1);
		};
		visit(1);
		return result;
	}`
	tail := `export function invoke() { return collect({get id(){return window.name}}, () => document.title); }`
	for _, row := range []struct {
		name, source string
		want         bool
	}{
		{"indexed recursive closure", closed + tail, true},
		{"direct local receiver", `function collect(key:{id:string},item:unknown){const result=new Map<string,unknown>();result.set(key.id,item);return result;}` + tail, true},
		{"own set replacement through alias", `function collect(key:{id:string},item:unknown){const result=new Map<string,unknown>();const alias=result;alias.set=function(){window.name;return this};result.set(key.id,item);return result;}` + tail, false},
		{"own set getter", `function collect(key:{id:string},item:unknown){const result=new Map<string,unknown>();Object.defineProperty(result,'set',{get(){window.name;return Map.prototype.set}});result.set(key.id,item);return result;}` + tail, false},
		{"constructor shadow", `function collect(key:{id:string},item:unknown){const Map=class<K,V>{set(k:K,v:V){window.name;return this}};const result=new Map<string,unknown>();result.set(key.id,item);return result;}` + tail, false},
		{"escaped visit", `let saved: (()=>void)|undefined;function collect(key:{id:string},item:unknown){const result=new Map<string,unknown>();const visit=()=>{result.set(key.id,item)};saved=visit;visit();return result;}` + tail, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(q *sourceValueQuery, entry *ast.Node) {
				source := ast.GetSourceFileOfNode(entry)
				q.owner.index(source)
				var candidate *ast.Node
				walkNode(source.AsNode(), func(node *ast.Node) bool {
					if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "set" &&
						ast.IsIdentifier(node.Expression().Expression()) && node.Expression().Expression().Text() == "result" {
						candidate = node
					}
					return true
				})
				if candidate == nil || q.closedLocalMapSetWriter(candidate, nil) != row.want {
					t.Fatal("wrong writer-discovery disposition")
				}
				if row.want {
					symbol := q.owner.checker.GetSymbolAtLocation(candidate.Expression().Expression())
					bindings := sourceValueBindings{ast.GetSymbolId(symbol): nil}
					if q.closedLocalMapSetWriter(candidate, bindings) {
						t.Fatal("cached lexical proof bypassed an active substitution")
					}
				}
			})
		})
	}
}
