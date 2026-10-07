package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Equal spans must preserve the selected authored node for receiver and type obligations.
func TestAuthoredSpanIndexPreservesTraversalSelection(t *testing.T) {
	source := parseNormalizationSource("/virtual/spans.tsx", `const value = (items[0]); function Example(){ const alias=this.state.items; alias[0]++; return()=> <p>{value}</p>; }`)
	// Explicitly exercise a wrapper retaining its child's authored location.
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if ast.IsParenthesizedExpression(node) {
			node.Loc = node.AsParenthesizedExpression().Expression.Loc
		}
		return true
	})
	lowering := &jsxLowering{sourceFile: source}
	last := make(map[SourceSpan]*ast.Node)
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		last[nodeSourceSpan(node)] = node
		return true
	})
	collisions := 0
	for span, expectedLast := range last {
		expectedFirst := nodeAtSpan(source.AsNode(), span.Start, span.Length)
		if lowering.firstMutationSource(span.Start, span.Length) != expectedFirst || lowering.mutationSource(span.Start, span.Length) != expectedLast {
			t.Fatalf("authored node selection changed at %+v", span)
		}
		if expectedFirst != expectedLast {
			collisions++
		}
	}
	if collisions == 0 {
		t.Fatal("fixture did not exercise equal-span nodes")
	}
	if lowering.firstMutationSource(-1, 1) != nil || lowering.mutationSource(-1, 1) != nil {
		t.Fatal("missing span resolved to an authored node")
	}
}
