package exactcompiler

import "github.com/microsoft/typescript-go/internal/ast"

// inlineDirectServerValuePropagation removes the task-shaped call boundary only when one
// compiler-created dependency feeds one direct assignment exactly once. Calls, closures,
// additional dependencies, and context use retain the executable computation fallback.
func (lowering *jsxLowering) inlineDirectServerValuePropagation(
	work *ast.Node,
	arguments []*ast.Node,
) (*ast.Node, bool) {
	if len(arguments) != 1 || (!ast.IsArrowFunction(work) && !ast.IsFunctionExpression(work)) ||
		len(work.Parameters()) == 0 || !ast.IsIdentifier(work.Parameters()[0].Name()) ||
		work.Body() == nil || !ast.IsBlock(work.Body()) ||
		len(work.Body().AsBlock().Statements.Nodes) != 1 {
		return nil, false
	}
	statement := work.Body().AsBlock().Statements.Nodes[0]
	if !ast.IsExpressionStatement(statement) {
		return nil, false
	}
	expression := statement.AsExpressionStatement().Expression
	if !ast.IsBinaryExpression(expression) ||
		expression.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return nil, false
	}
	parameter := work.Parameters()[0].Name().Text()
	uses := 0
	unsupported := false
	walkNode(expression, func(node *ast.Node) bool {
		if node != expression && (ast.IsCallExpression(node) || ast.IsFunctionLike(node)) {
			unsupported = true
			return false
		}
		if ast.IsIdentifier(node) && !isStaticPropertyName(node) && node.Text() == parameter {
			uses++
		}
		return !unsupported
	})
	if unsupported || uses != 1 {
		return nil, false
	}
	for _, policy := range work.Parameters()[1:] {
		if policy.Name() == nil || !ast.IsIdentifier(policy.Name()) {
			continue
		}
		name := policy.Name().Text()
		walkNode(expression, func(node *ast.Node) bool {
			if ast.IsIdentifier(node) && !isStaticPropertyName(node) && node.Text() == name {
				unsupported = true
				return false
			}
			return !unsupported
		})
		if unsupported {
			return nil, false
		}
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if ast.IsIdentifier(node) && !isStaticPropertyName(node) && node.Text() == parameter {
			return arguments[0]
		}
		return visitor.VisitEachChild(node)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(expression), true
}
