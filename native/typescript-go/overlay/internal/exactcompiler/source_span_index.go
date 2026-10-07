package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// nodeSourceSpan keeps compiler-local lookups independent of serialized identity strings.
func nodeSourceSpan(node *ast.Node) SourceSpan {
	return SourceSpan{Start: node.Pos(), Length: node.End() - node.Pos()}
}

// sourceSpanNodes preserves both traversal conventions for equal-span parent and child nodes.
type sourceSpanNodes struct {
	first, last *ast.Node
}

func (lowering *jsxLowering) ensureMutationSources() {
	if lowering.mutationSources != nil {
		return
	}
	lowering.mutationSources = make(map[SourceSpan]sourceSpanNodes)
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		span := nodeSourceSpan(node)
		entry := lowering.mutationSources[span]
		if entry.first == nil {
			entry.first = node
		}
		entry.last = node
		lowering.mutationSources[span] = entry
		return true
	})
}

func (lowering *jsxLowering) firstMutationSource(start, length int) *ast.Node {
	lowering.ensureMutationSources()
	return lowering.mutationSources[SourceSpan{Start: start, Length: length}].first
}
