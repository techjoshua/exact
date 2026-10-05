package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Native using declarations own their lexical values. Only the executing task
// body needs a settlement fence, not nested ordinary helper implementations.
func taskContainsNativeCleanup(work *ast.Node) bool {
	found := false
	walkNode(work, func(node *ast.Node) bool {
		if node != work && (isCallableNode(node) || ast.IsGetAccessorDeclaration(node) || ast.IsSetAccessorDeclaration(node) || ast.IsConstructorDeclaration(node)) {
			return false
		}
		if ast.IsVariableDeclaration(node) && (ast.IsVarUsing(node) || ast.IsVarAwaitUsing(node)) {
			found = true
		}
		return !found
	})
	return found
}

// Keep the native lexical block inside the try so its disposal completes before
// the outer finally releases framework settlement, including abrupt completion.
func (lowering *jsxLowering) taskNativeCleanupBody(body, signal *ast.Node) *ast.Node {
	close := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactCloseNativeCleanup"))
	initialize := lowering.taskHelperCall("taskNativeCleanupScope", lowering.names.taskNativeCleanup, []*ast.Node{signal})
	declaration := lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(
		lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewVariableDeclaration(close, nil, nil, initialize)}), ast.NodeFlagsConst))
	finish := lowering.factory.NewExpressionStatement(lowering.factory.NewCallExpression(close, nil, nil, lowering.factory.NewNodeList(nil), ast.NodeFlagsNone))
	cleanup := lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{finish}), true)
	return lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{declaration, lowering.factory.NewTryStatement(body, nil, cleanup)}), true)
}
