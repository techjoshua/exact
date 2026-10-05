package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// taskOptionalReceiverRead captures the receiver before a state's first
// optional access. The work retains native continuation, calls and non-null
// assertions. Capturing a partial optional result would turn skipped continuation
// into an ordinary access, and path reconstruction would eagerly read absent data.
func taskOptionalReceiverRead(read StateRead, work *ast.Node) StateRead {
	node := nodeAtSpan(work, read.Start, read.Length)
	for node != nil && node.Flags&ast.NodeFlagsOptionalChain != 0 && len(read.Path) > 0 {
		switch {
		case ast.IsPropertyAccessExpression(node):
			node = node.AsPropertyAccessExpression().Expression
		case ast.IsElementAccessExpression(node):
			node = node.AsElementAccessExpression().Expression
		case ast.IsNonNullExpression(node):
			node = node.AsNonNullExpression().Expression
			read.Start, read.Length = node.Pos(), node.End()-node.Pos()
			continue
		default:
			return read
		}
		read.Path = read.Path[:len(read.Path)-1]
		// An unknown computed suffix no longer taints the selected static receiver.
		read.Confidence = "exact"
		for _, key := range read.Path {
			if key == "*" {
				read.Confidence = "broad"
				break
			}
		}
		read.Start, read.Length = node.Pos(), node.End()-node.Pos()
	}
	return read
}
