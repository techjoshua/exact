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
	input := visitor.VisitNode(arguments[last].Body())
	name := lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactTaskCollection_%d", node.Pos())))
	declaration := lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList([]*ast.Node{
		lowering.factory.NewVariableDeclaration(name, nil, lowering.factory.NewArrayTypeNode(lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)), input),
	}), ast.NodeFlagsConst))
	arguments[last] = lowering.arrow(name)
	mutation = lowering.factory.UpdateCallExpression(call, call.Expression, call.QuestionDotToken, call.TypeArguments, lowering.factory.NewNodeList(arguments), call.Flags)
	stage := lowering.taskHelperCall("stageTaskMutation", lowering.names.stageTaskMutation, []*ast.Node{signal, lowering.arrow(mutation)})
	return lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{declaration, lowering.factory.NewExpressionStatement(stage)}), true)
}
