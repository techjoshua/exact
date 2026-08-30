package exactcompiler

import "github.com/microsoft/typescript-go/internal/ast"

// lowerCompilerClosedSsrCalls selects the narrow physical renderer only after JSX lowering has
// proven both the local root component and its successful server writer. Authored imports remain
// unchanged and are pruned normally once their binding has no surviving calls.
func (lowering *jsxLowering) lowerCompilerClosedSsrCalls(
	root *ast.SourceFile,
) *ast.SourceFile {
	if lowering.target != TargetServer {
		return root
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		updated := visitor.VisitEachChild(node)
		if !ast.IsCallExpression(updated) {
			return updated
		}
		call := updated.AsCallExpression()
		exportName, supported := lowering.compilerClosedSsrCallee(call.Expression)
		if !supported || call.Arguments == nil ||
			len(call.Arguments.Nodes) == 0 ||
			!lowering.compilerClosedRootOperation(call.Arguments.Nodes[0]) {
			return updated
		}
		helper, safe := lowering.compilerClosedRenderHelper(exportName, call.Arguments.Nodes[1:])
		if !safe {
			return updated
		}
		if ast.IsIdentifier(call.Expression) {
			lowering.redirectedRootImports[call.Expression.Text()] = struct{}{}
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

func (lowering *jsxLowering) compilerClosedRenderHelper(
	exportName string,
	arguments []*ast.Node,
) (string, bool) {
	if len(arguments) == 0 {
		if exportName == "renderToHydratableStringAsync" {
			return lowering.names.renderClosedHydratableSsr, true
		}
		if exportName == "renderToHydratableString" {
			return lowering.names.renderClosedSyncHydratable, true
		}
		if exportName == "renderToString" {
			return lowering.names.renderClosedSyncSsr, true
		}
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
		if ast.IsShorthandPropertyAssignment(property) {
			name := property.Name().Text()
			switch name {
			case "reactMarkup", "outputExtensions":
				// These options can change the root representation. A shorthand value is
				// not statically narrow enough to retain the compiler-closed renderer.
				return "", false
			case "markers":
				// A runtime marker choice can use the marked entrypoint. Its publisher
				// already observes the request context's marker policy; only a literal
				// false earns the smaller unmarked entrypoint below.
			}
			continue
		}
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
	if exportName == "renderToHydratableStringAsync" {
		return lowering.names.renderClosedHydratableSsr, true
	}
	if exportName == "renderToHydratableString" {
		return lowering.names.renderClosedSyncHydratable, true
	}
	if unmarked {
		if exportName == "renderToString" {
			return lowering.names.renderClosedSyncUnmarkedSsr, true
		}
		return lowering.names.renderClosedUnmarkedSsr, true
	}
	if exportName == "renderToString" {
		return lowering.names.renderClosedSyncSsr, true
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

func (lowering *jsxLowering) compilerClosedSsrCallee(expression *ast.Node) (string, bool) {
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
	if !exists || reference.namespace || reference.moduleSpecifier != "@exactjs/ssr" {
		return "", false
	}
	switch reference.exportName {
	case "renderToString", "renderToHydratableString", "renderToStringAsync", "renderToHydratableStringAsync":
		return reference.exportName, true
	default:
		return "", false
	}
}

func (lowering *jsxLowering) compilerClosedRootOperation(node *ast.Node) bool {
	if !ast.IsCallExpression(node) {
		return false
	}
	call := node.AsCallExpression()
	if ast.IsIdentifier(call.Expression) &&
		call.Expression.Text() == lowering.names.issueServerComponent && call.Arguments != nil &&
		len(call.Arguments.Nodes) == 1 {
		return lowering.compilerClosedRootOperation(call.Arguments.Nodes[0])
	}
	if !ast.IsIdentifier(call.Expression) ||
		call.Expression.Text() != lowering.names.componentReceipt || call.Arguments == nil ||
		len(call.Arguments.Nodes) == 0 {
		return false
	}
	// The operation itself carries the target artifact selected by the compiler. Imported and
	// package-published components therefore use the same physical root ABI as local components;
	// recursive source closure is neither available nor required at this boundary.
	return true
}
