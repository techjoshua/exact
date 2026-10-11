package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// capturedTaskMutation freezes invocation temporaries at enqueue time. A loop may reuse its
// expression temporaries before publication, but each queued write owns its selected reference
// and value. The generated capture block introduces no asynchronous boundary.
func (lowering *jsxLowering) capturedTaskMutation(source, mutation *ast.Node) *ast.Node {
	frame := lowering.mutationFrames[len(lowering.mutationFrames)-1]
	// A direct operation runs once per invocation. Capture only when a loop or a nested
	// callable can reuse its temporaries, avoiding another closure on the scalar fast path.
	if !taskMutationCanRepeat(source, frame.work) {
		return lowering.arrow(mutation)
	}
	used := map[string]bool{}
	walkNode(mutation, func(node *ast.Node) bool {
		if ast.IsIdentifier(node) {
			used[node.Text()] = true
		}
		return true
	})
	captures := map[string]*ast.Node{}
	statements := []*ast.Node{}
	for _, declaration := range frame.declarations {
		name := declaration.Name()
		if !ast.IsIdentifier(name) || !used[name.Text()] {
			continue
		}
		captured := lowering.factory.NewIdentifier(name.Text() + "_captured")
		captures[name.Text()] = captured
		statements = append(statements, lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewVariableDeclaration(captured, nil, nil, name)}), ast.NodeFlagsConst)))
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if ast.IsIdentifier(node) && captures[node.Text()] != nil {
			return captures[node.Text()]
		}
		return visitor.VisitEachChild(node)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	callback := lowering.arrow(visitor.VisitNode(mutation))
	if len(statements) == 0 {
		return callback
	}
	statements = append(statements, lowering.factory.NewReturnStatement(callback))
	return lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(lowering.arrow(lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true))), nil, nil, lowering.factory.NewNodeList(nil), ast.NodeFlagsNone)
}

func taskMutationCanRepeat(source, work *ast.Node) bool {
	if source == nil || work == nil {
		return true
	}
	for current := source.Parent; current != nil; current = current.Parent {
		switch current.Kind {
		case ast.KindForStatement, ast.KindForInStatement, ast.KindForOfStatement, ast.KindWhileStatement, ast.KindDoStatement:
			return true
		}
		if ast.IsFunctionLike(current) {
			return current.Pos() != work.Pos() || current.End() != work.End()
		}
	}
	return true
}
