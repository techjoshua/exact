package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// projectTaskStateRead preserves the authored access chain while replacing setup aliases that
// are unavailable in a module-owned executor. Preparation can also project work-local aliases.
// Live reads keep those local bindings, retaining their selected identity across later writes.
func (lowering *jsxLowering) projectTaskStateRead(source, work *ast.Node, prepare bool) *ast.Node {
	if source == nil {
		return nil
	}
	aliased := false
	walkNode(source, func(node *ast.Node) bool {
		if alias, owned := lowering.pendingOwnedAliases[nodeSpanKey(node)]; owned && ast.IsIdentifier(node) && (prepare || alias.start < work.Pos() || alias.start >= work.End()) {
			aliased = true
		}
		return !aliased
	})
	if !aliased {
		return nil
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if alias, owned := lowering.pendingOwnedAliases[nodeSpanKey(node)]; owned && ast.IsIdentifier(node) {
			if !prepare && alias.start >= work.Pos() && alias.start < work.End() {
				return node
			}
			value := lowering.stateValue(alias.path)
			typeNode := lowering.mutationFacts.at(nodeSpanKey(node)).pending
			if typeNode == nil {
				typeNode = lowering.taskDependencyType(node)
			}
			return lowering.factory.NewParenthesizedExpression(lowering.factory.NewAsExpression(value, typeNode))
		}
		return visitor.VisitEachChild(node)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(source)
}
