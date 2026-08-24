package exactcompiler

import "github.com/microsoft/typescript-go/internal/ast"

// lowerCompilerClosedSsrCalls selects the narrow physical renderer only after JSX lowering has
// proven both the local root component and its successful server writer. Authored imports remain
// unchanged and are pruned normally once their binding has no surviving calls.
func (lowering *jsxLowering) lowerCompilerClosedSsrCalls(
	root *ast.SourceFile,
) *ast.SourceFile {
	if lowering.target != TargetServer || len(lowering.closedServerWriters) == 0 {
		return root
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		updated := visitor.VisitEachChild(node)
		if !ast.IsCallExpression(updated) {
			return updated
		}
		call := updated.AsCallExpression()
		if !lowering.compilerClosedSsrCallee(call.Expression) || call.Arguments == nil ||
			len(call.Arguments.Nodes) == 0 ||
			!lowering.compilerClosedRootVNode(call.Arguments.Nodes[0]) {
			return updated
		}
		helper, safe := lowering.compilerClosedRenderHelper(call.Arguments.Nodes[1:])
		if !safe {
			return updated
		}
		return lowering.factory.UpdateCallExpression(
			call,
			lowering.factory.NewIdentifier(helper),
			call.QuestionDotToken,
			call.TypeArguments,
			call.Arguments,
			call.Flags,
		)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitEachChild(root.AsNode()).AsSourceFile()
}

func (lowering *jsxLowering) compilerClosedRenderHelper(arguments []*ast.Node) (string, bool) {
	if len(arguments) == 0 {
		return lowering.names.renderClosedSsr, true
	}
	if len(arguments) != 1 {
		return "", false
	}
	options := arguments[0]
	if !ast.IsObjectLiteralExpression(options) {
		return "", false
	}
	unmarked := false
	for _, property := range options.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) {
			return "", false
		}
		assignment := property.AsPropertyAssignment()
		name, certain := staticRenderOptionName(assignment.Name())
		if !certain {
			return "", false
		}
		switch name {
		case "reactMarkup":
			if assignment.Initializer.Kind != ast.KindFalseKeyword {
				return "", false
			}
		case "markers":
			unmarked = assignment.Initializer.Kind == ast.KindFalseKeyword
		case "outputExtensions":
			if !ast.IsArrayLiteralExpression(assignment.Initializer) ||
				len(assignment.Initializer.AsArrayLiteralExpression().Elements.Nodes) != 0 {
				return "", false
			}
		}
	}
	if unmarked {
		return lowering.names.renderClosedUnmarkedSsr, true
	}
	return lowering.names.renderClosedSsr, true
}

func staticRenderOptionName(node *ast.Node) (string, bool) {
	if node == nil {
		return "", false
	}
	if ast.IsIdentifier(node) || ast.IsStringLiteral(node) || ast.IsNumericLiteral(node) {
		return node.Text(), true
	}
	return "", false
}

func (lowering *jsxLowering) compilerClosedSsrCallee(expression *ast.Node) bool {
	var reference externalImportReference
	var exists bool
	switch {
	case ast.IsIdentifier(expression):
		reference, exists = lowering.externalImports.byName[expression.Text()]
	case ast.IsPropertyAccessExpression(expression):
		member := expression.AsPropertyAccessExpression()
		if ast.IsIdentifier(member.Expression) {
			reference, exists = lowering.externalImports.byName[member.Expression.Text()]
			if exists && reference.namespace {
				reference.exportName = member.Name().Text()
				reference.namespace = false
			}
		}
	}
	return exists && !reference.namespace && reference.moduleSpecifier == "@exactjs/ssr" &&
		reference.exportName == "renderToStringAsync"
}

func (lowering *jsxLowering) compilerClosedRootVNode(node *ast.Node) bool {
	if !ast.IsCallExpression(node) {
		return false
	}
	call := node.AsCallExpression()
	if ast.IsIdentifier(call.Expression) &&
		call.Expression.Text() == lowering.names.issueServerComponent && call.Arguments != nil &&
		len(call.Arguments.Nodes) == 1 {
		return lowering.compilerClosedRootVNode(call.Arguments.Nodes[0])
	}
	if !ast.IsIdentifier(call.Expression) ||
		call.Expression.Text() != lowering.names.componentElement || call.Arguments == nil ||
		len(call.Arguments.Nodes) == 0 || !ast.IsIdentifier(call.Arguments.Nodes[0]) {
		return false
	}
	return lowering.compilerClosedComponentGraph(
		call.Arguments.Nodes[0].Text(),
		make(map[string]bool),
	)
}

// compilerClosedComponentGraph proves that every statically rendered component reachable from a
// candidate root has its own direct server writer. A cycle remains closed when every member has a
// writer; imported, client-owned, or generic descendants keep the universal renderer reachable.
func (lowering *jsxLowering) compilerClosedComponentGraph(
	name string,
	visiting map[string]bool,
) bool {
	if visiting[name] {
		return true
	}
	component, exists := lowering.components[name]
	if !exists || !component.DirectServer {
		return false
	}
	if _, closed := lowering.closedServerWriters[name]; !closed {
		return false
	}
	visiting[name] = true
	defer delete(visiting, name)
	for _, edge := range component.RenderEdges {
		if edge.Placement == "client" || edge.ModuleSpecifier != "" ||
			!lowering.compilerClosedComponentGraph(edge.Tag, visiting) {
			return false
		}
	}
	return true
}
