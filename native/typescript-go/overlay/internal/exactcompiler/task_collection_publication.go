package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// stagedTaskCollectionArguments evaluates collection inputs during authored execution while
// retaining publication through the state path, including reconciled parent replacements.
// Each execution owns a block-scoped capture, so loop iterations cannot overwrite earlier inputs.
func (lowering *jsxLowering) stagedTaskCollectionArguments(node *ast.Node, write StateWrite, signal *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	mutation := lowering.lowerStateWriteOperation(node, write)
	if mutation == nil || !ast.IsCallExpression(mutation) {
		return nil
	}
	call := mutation.AsCallExpression()
	arguments := append([]*ast.Node{}, call.Arguments.Nodes...)
	last := len(arguments) - 1
	if last < 0 || !ast.IsArrowFunction(arguments[last]) {
		return nil
	}
	declarations := []*ast.Node{}
	// Member selection precedes arguments during execution, not during publication.
	if ast.IsElementAccessExpression(unwrapSourceCallableReference(node.AsCallExpression().Expression)) {
		key := lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactTaskCollectionKey_%d", node.Pos())))
		declarations = append(declarations, lowering.factory.NewVariableDeclaration(key, nil, nil, visitor.VisitNode(arguments[last-1])))
		arguments[last-1] = key
	}
	input := visitor.VisitNode(arguments[last].Body())
	name := lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactTaskCollection_%d", node.Pos())))
	declarations = append(declarations, lowering.factory.NewVariableDeclaration(name, nil, lowering.factory.NewArrayTypeNode(lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)), input))
	declaration := lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList(declarations), ast.NodeFlagsConst))
	arguments[last] = lowering.arrow(name)
	mutation = lowering.factory.UpdateCallExpression(call, call.Expression, call.QuestionDotToken, call.TypeArguments, lowering.factory.NewNodeList(arguments), call.Flags)
	stage := lowering.taskHelperCall("stageTaskMutation", lowering.names.stageTaskMutation, []*ast.Node{signal, lowering.arrow(mutation)})
	return lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{declaration, lowering.factory.NewExpressionStatement(stage)}), true)
}
