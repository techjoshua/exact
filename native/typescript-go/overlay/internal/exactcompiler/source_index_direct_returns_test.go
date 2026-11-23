package exactcompiler

import (
	"slices"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func TestSourceIndexDirectReturnOwnership(t *testing.T) {
	const source = `
type Signature = (n: number) => number;
declare function ambient(): number;
function outer(flag: boolean) {
	function nested() { return 6 }
	const anonymous = function () { return 7 };
	const arrow = () => 8;
	class Example {
		static { function local() { return 9 } void local; }
		static method() { return 10 }
		method() { return 11 }
		get value() { return 12 }
		set value(_n: number) { return }
	}
	if (false) return 1;
	try { if (flag) return 2; return; }
	finally { if (flag) return 3; }
	return 4;
	return 5;
}`
	withReflectiveRelevanceSource(t, source, func(executable *executableBodyOwner, file *ast.SourceFile) {
		owner := executable.values
		index := owner.index(file)
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if !ast.IsFunctionLike(node) {
				return true
			}
			want := directCallableReturns(node)
			if got := index.directReturns[node]; !slices.Equal(got, want) {
				t.Fatalf("lexical return order differs at %d: %v versus %v", node.Pos(), got, want)
			}
			if !isCallableNode(node) || node.Body() == nil {
				return true
			}
			if ast.IsArrowFunction(node) && !ast.IsBlock(node.Body()) {
				want = append(want, node.Body())
			}
			if got := owner.summary(node).returns; !slices.Equal(got, want) {
				t.Fatalf("summary changed return order at %d: %v versus %v", node.Pos(), got, want)
			}
			return true
		})
	})
}

func TestSourceIndexIncompleteDirectReturns(t *testing.T) {
	withReflectiveRelevanceSource(t, "function probe(){ return 1 }", func(executable *executableBodyOwner, file *ast.SourceFile) {
		owner := executable.values
		owner.indexPreparing = map[*ast.SourceFile]bool{file: true}
		defer delete(owner.indexPreparing, file)
		node := file.Statements.Nodes[0]
		want := directCallableReturns(node)
		if len(want) != 1 || !slices.Equal(owner.summary(node).returns, want) {
			t.Fatal("reentrant summary treated unpublished index as empty")
		}
	})
}
